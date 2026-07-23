#!/usr/bin/env node

import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { constants as fsConstants } from "node:fs";
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

function option(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function fail(message) {
  throw new Error(message);
}

function requirePrivateRegularFile(path, label) {
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.nlink !== 1) {
    fail(`${label} must be one private regular non-linked file`);
  }
}

export function prepareSterileCodexHome(
  sourceAuthPath,
  destinationHome,
  { precreated = false } = {},
) {
  const source = resolve(sourceAuthPath);
  const home = resolve(destinationHome);
  requirePrivateRegularFile(source, "Codex source auth");
  const auth = readFileSync(source);
  let parsed;
  try {
    parsed = JSON.parse(auth.toString("utf8"));
  } catch {
    fail("Codex source auth is not valid JSON");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail("Codex source auth must contain one JSON object");
  }
  if (precreated) {
    const metadata = lstatSync(home);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      fail("Precreated Codex home must be one real directory");
    }
    if (readdirSync(home).length !== 0) {
      fail("Precreated Codex home must be empty");
    }
  } else {
    mkdirSync(home, { recursive: false, mode: 0o700 });
  }
  const destination = join(home, "auth.json");
  writeFileSync(destination, auth, { flag: "wx", mode: 0o600 });
  return destination;
}

function walkRollouts(directory, rootReal, output) {
  const entries = readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    const metadata = lstatSync(path);
    if (metadata.isSymbolicLink()) fail("Codex session tree contains a symbolic link");
    const pathReal = realpathSync(path);
    const fromRoot = relative(rootReal, pathReal);
    if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
      fail("Codex session artifact escapes its sterile home");
    }
    if (metadata.isDirectory()) {
      walkRollouts(path, rootReal, output);
    } else if (metadata.isFile() && /^rollout-.*\.jsonl$/u.test(entry.name)) {
      if (metadata.nlink !== 1) fail("Codex rollout must not be hard-linked");
      output.push(path);
    }
  }
}

function canonicalExistingDirectory(path, label) {
  const resolved = resolve(path);
  const metadata = lstatSync(resolved);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    fail(`${label} must be one real directory`);
  }
  const canonicalPath = realpathSync.native(resolved);
  const identity = statSync(canonicalPath, { bigint: true });
  return {
    canonicalPath,
    identity: {
      device_id: identity.dev.toString(10),
      file_id: identity.ino.toString(10),
    },
  };
}

function sameDirectoryAuthority(left, right) {
  return (
    left.canonicalPath === right.canonicalPath &&
    left.identity.device_id === right.identity.device_id &&
    left.identity.file_id === right.identity.file_id
  );
}

function requireContainedDirectory(path, rootReal, label) {
  const authority = canonicalExistingDirectory(path, label);
  const fromRoot = relative(rootReal, authority.canonicalPath);
  if (
    fromRoot === "" ||
    fromRoot === ".." ||
    fromRoot.startsWith(`..${sep}`) ||
    isAbsolute(fromRoot)
  ) {
    fail(`${label} must be contained by the sterile Codex home`);
  }
  return authority;
}

function isExactTurnContextReplay(initial, replay) {
  const initialKeys = Object.keys(initial).sort();
  const replayKeys = Object.keys(replay).sort();
  if (!isDeepStrictEqual(replayKeys, initialKeys)) return false;
  if (
    Object.hasOwn(initial, "timestamp") &&
    (typeof initial.timestamp !== "string" || typeof replay.timestamp !== "string")
  ) {
    return false;
  }
  return initialKeys.every(
    (key) => key === "timestamp" || isDeepStrictEqual(replay[key], initial[key]),
  );
}

function rolloutRecordedCwds(rolloutPath) {
  const rows = readFileSync(rolloutPath, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        fail("Codex rollout is not valid JSONL");
      }
    });
  const sessions = rows.filter((row) => row?.type === "session_meta");
  const turns = rows.flatMap((row, index) =>
    row?.type === "turn_context" ? [{ index, row }] : [],
  );
  if (sessions.length !== 1 || turns.length === 0) {
    fail("Codex rollout cwd capture requires exactly one session_meta and a turn_context");
  }
  const initialTurn = turns[0];
  for (const duplicateTurn of turns.slice(1)) {
    const precededByCompaction =
      duplicateTurn.index >= 2 &&
      rows[duplicateTurn.index - 2]?.type === "compacted" &&
      rows[duplicateTurn.index - 1]?.type === "world_state";
    const afterCompletion = rows
      .slice(0, duplicateTurn.index)
      .some((row) => row?.type === "event_msg" && row?.payload?.type === "task_complete");
    if (
      !precededByCompaction ||
      afterCompletion ||
      !isExactTurnContextReplay(initialTurn.row, duplicateTurn.row)
    ) {
      fail("Codex rollout cwd capture permits only an exact compacted duplicate turn_context");
    }
  }
  const sessionCwd = sessions[0]?.payload?.cwd;
  const turnCwd = initialTurn.row?.payload?.cwd;
  if (typeof sessionCwd !== "string" || typeof turnCwd !== "string") {
    fail("Codex rollout cwd fields are missing");
  }
  return [sessionCwd, turnCwd];
}

function publicationDestination(path, home, label) {
  const destination = resolve(path);
  const destinationFromHome = relative(home, destination);
  if (
    basename(destination) === "auth.json" ||
    destinationFromHome === "" ||
    (!destinationFromHome.startsWith(`..${sep}`) &&
      destinationFromHome !== ".." &&
      !isAbsolute(destinationFromHome))
  ) {
    fail(`${label} must not publish authentication state`);
  }
  return destination;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const STRICT_CODE_MODE_CONTRACT = "strict-code-mode-v2";

export function captureSingleCodexRollout(codexHome, destinationPath, receiptPath, expectedCwd) {
  const home = resolve(codexHome);
  const homeAuthority = canonicalExistingDirectory(home, "sterile Codex home");
  const sessions = join(home, "sessions");
  const sessionsAuthority = requireContainedDirectory(
    sessions,
    homeAuthority.canonicalPath,
    "Codex sessions root",
  );
  const rollouts = [];
  walkRollouts(sessionsAuthority.canonicalPath, homeAuthority.canonicalPath, rollouts);
  if (rollouts.length !== 1) {
    fail(`Codex pure run requires exactly one rollout JSONL (found ${rollouts.length})`);
  }
  const destination = publicationDestination(destinationPath, home, "Codex rollout destination");
  const receipt = publicationDestination(receiptPath, home, "Codex capture receipt destination");
  if (destination === receipt) fail("Codex rollout and capture receipt destinations must differ");
  copyFileSync(rollouts[0], destination, fsConstants.COPYFILE_EXCL);
  requirePrivateRegularFile(destination, "captured Codex rollout");

  // Validate the immutable copied bytes, not a source file that could change
  // between inspection and publication. The exact canonical path plus native
  // filesystem identity is case-sensitive and does not collapse distinct
  // directories on Windows case-sensitive volumes.
  const [recordedSessionCwd, recordedTurnCwd] = rolloutRecordedCwds(destination);
  const expectedAuthority = canonicalExistingDirectory(expectedCwd, "Codex expected player cwd");
  const sessionAuthority = canonicalExistingDirectory(
    recordedSessionCwd,
    "Codex recorded session player cwd",
  );
  const turnAuthority = canonicalExistingDirectory(
    recordedTurnCwd,
    "Codex recorded turn player cwd",
  );
  if (
    !sameDirectoryAuthority(sessionAuthority, expectedAuthority) ||
    !sameDirectoryAuthority(turnAuthority, expectedAuthority)
  ) {
    fail("Codex rollout cwd does not equal the isolated player cwd");
  }

  const receiptBody = {
    schema_version: 3,
    binding: "runner_work_player",
    code_mode_contract: STRICT_CODE_MODE_CONTRACT,
    recorded_session_cwd: recordedSessionCwd,
    recorded_turn_cwd: recordedTurnCwd,
    canonical_expected_cwd: expectedAuthority.canonicalPath,
    canonical_session_cwd: sessionAuthority.canonicalPath,
    canonical_turn_cwd: turnAuthority.canonicalPath,
    expected_directory_identity: expectedAuthority.identity,
    session_directory_identity: sessionAuthority.identity,
    turn_directory_identity: turnAuthority.identity,
    copied_rollout_sha256: sha256(readFileSync(destination)),
  };
  writeFileSync(receipt, `${JSON.stringify(receiptBody, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  requirePrivateRegularFile(receipt, "Codex capture receipt");
  return destination;
}

function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  if (command === "prepare-home") {
    const source = option(argv, "--source-auth");
    const home = option(argv, "--home");
    if (!source || !home) fail("prepare-home requires --source-auth and --home");
    prepareSterileCodexHome(source, home, {
      precreated: argv.includes("--precreated-home"),
    });
    return;
  }
  if (command === "capture") {
    const home = option(argv, "--home");
    const out = option(argv, "--out");
    const receipt = option(argv, "--receipt");
    const expectedCwd = option(argv, "--expected-cwd");
    if (!home || !out || !receipt || !expectedCwd) {
      fail("capture requires --home, --out, --receipt, and --expected-cwd");
    }
    captureSingleCodexRollout(home, out, receipt, expectedCwd);
    return;
  }
  fail("Usage: codex-rollout.mjs prepare-home|capture ...");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
