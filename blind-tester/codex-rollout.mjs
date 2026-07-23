#!/usr/bin/env node

import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  closeSync,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const THREAD_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

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

function readStablePrivateFile(path, label) {
  const linked = lstatSync(path, { bigint: true });
  if (linked.isSymbolicLink() || !linked.isFile() || linked.nlink !== 1n) {
    fail(`${label} must be one private regular non-linked file`);
  }
  const descriptor = openSync(path, "r");
  try {
    const before = fstatSync(descriptor, { bigint: true });
    if (
      !before.isFile() ||
      before.nlink !== 1n ||
      linked.dev !== before.dev ||
      linked.ino !== before.ino ||
      linked.size !== before.size ||
      linked.mtimeNs !== before.mtimeNs ||
      linked.ctimeNs !== before.ctimeNs
    ) {
      fail(`${label} must remain one private regular non-linked file`);
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (
      after.nlink !== 1n ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      BigInt(bytes.byteLength) !== after.size
    ) {
      fail(`${label} changed while it was being captured`);
    }
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

function isContainedPath(path, rootReal) {
  const fromRoot = relative(rootReal, path);
  return (
    fromRoot !== "" &&
    fromRoot !== ".." &&
    !fromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(fromRoot)
  );
}

function walkMatchingRollouts(directory, sessionsRootReal, threadId, output) {
  const entries = readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    const metadata = lstatSync(path);
    const normalizedName = entry.name.toLowerCase();
    const matchingName =
      normalizedName.startsWith("rollout-") &&
      normalizedName.endsWith(`-${threadId.toLowerCase()}.jsonl`);
    if (metadata.isSymbolicLink()) {
      if (matchingName) fail("Matching Codex rollout must not be a symbolic link");
      continue;
    }
    if (metadata.isDirectory()) {
      const pathReal = realpathSync.native(path);
      if (!isContainedPath(pathReal, sessionsRootReal)) {
        fail("Codex session directory escapes the sessions root");
      }
      walkMatchingRollouts(pathReal, sessionsRootReal, threadId, output);
    } else if (metadata.isFile() && matchingName) {
      if (metadata.nlink !== 1) fail("Codex rollout must not be hard-linked");
      const pathReal = realpathSync.native(path);
      if (!isContainedPath(pathReal, sessionsRootReal)) {
        fail("Codex rollout escapes the sessions root");
      }
      output.push(pathReal);
    }
  }
}

function canonicalExistingDirectory(path, label, { allowLinkedPath = false } = {}) {
  const resolved = resolve(path);
  const linkedMetadata = lstatSync(resolved);
  const targetMetadata = statSync(resolved);
  if ((!allowLinkedPath && linkedMetadata.isSymbolicLink()) || !targetMetadata.isDirectory()) {
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

export function canonicalCodexHome(path) {
  return canonicalExistingDirectory(path, "Codex home", {
    allowLinkedPath: true,
  }).canonicalPath;
}

function isWithinOrEqual(path, root) {
  const fromRoot = relative(root, path);
  return (
    fromRoot === "" ||
    (fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot))
  );
}

export function validateOutputPrefix(codexHome, outputPrefix, baseDirectory = process.cwd()) {
  const homeAuthority = canonicalExistingDirectory(codexHome, "Codex home", {
    allowLinkedPath: true,
  });
  const requestedDestination = resolve(baseDirectory, outputPrefix);
  let existingParent = dirname(requestedDestination);
  const missingSegments = [];
  while (!existsSync(existingParent)) {
    const parent = dirname(existingParent);
    if (parent === existingParent) {
      fail("Report output prefix has no existing parent directory");
    }
    missingSegments.unshift(basename(existingParent));
    existingParent = parent;
  }
  const existingAuthority = canonicalExistingDirectory(
    existingParent,
    "Report output prefix parent",
    { allowLinkedPath: true },
  );
  const canonicalParent = resolve(existingAuthority.canonicalPath, ...missingSegments);
  if (isWithinOrEqual(canonicalParent, homeAuthority.canonicalPath)) {
    fail("Report output prefix must remain outside the Codex home");
  }
  return join(canonicalParent, basename(requestedDestination));
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
    fail(`${label} must be contained by the Codex home`);
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

function parseJsonlBytes(bytes, label) {
  return bytes
    .toString("utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        fail(`${label} is not valid JSONL`);
      }
    });
}

export function publicCodexThreadId(eventsPath) {
  const rows = parseJsonlBytes(
    readStablePrivateFile(resolve(eventsPath), "Codex provider events"),
    "Codex provider events",
  );
  const threads = rows.filter((row) => row?.type === "thread.started");
  const threadId = threads[0]?.thread_id;
  if (
    threads.length !== 1 ||
    rows[0] !== threads[0] ||
    typeof threadId !== "string" ||
    !THREAD_ID_RE.test(threadId)
  ) {
    fail("Codex provider events require exactly one valid leading thread.started identity");
  }
  return threadId;
}

function rolloutRecordedIdentity(rolloutBytes) {
  const rows = parseJsonlBytes(rolloutBytes, "Codex rollout");
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
  const threadId = sessions[0]?.payload?.id;
  const sessionCwd = sessions[0]?.payload?.cwd;
  const turnCwd = initialTurn.row?.payload?.cwd;
  if (
    typeof threadId !== "string" ||
    !THREAD_ID_RE.test(threadId) ||
    typeof sessionCwd !== "string" ||
    typeof turnCwd !== "string"
  ) {
    fail("Codex rollout identity or cwd fields are missing");
  }
  return { threadId, sessionCwd, turnCwd };
}

function publicationDestination(path, homeAuthority, label) {
  const requestedDestination = resolve(path);
  const parentAuthority = canonicalExistingDirectory(
    dirname(requestedDestination),
    `${label} parent`,
    { allowLinkedPath: true },
  );
  const destinationFromHome = relative(homeAuthority.canonicalPath, parentAuthority.canonicalPath);
  if (
    destinationFromHome === "" ||
    (!destinationFromHome.startsWith(`..${sep}`) &&
      destinationFromHome !== ".." &&
      !isAbsolute(destinationFromHome))
  ) {
    fail(`${label} must remain outside the Codex home`);
  }
  return join(parentAuthority.canonicalPath, basename(requestedDestination));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const STRICT_CODE_MODE_CONTRACT = "strict-code-mode-v2";

export function captureThreadBoundCodexRollout(
  codexHome,
  eventsPath,
  destinationPath,
  receiptPath,
  expectedCwd,
) {
  const home = resolve(codexHome);
  const homeAuthority = canonicalExistingDirectory(home, "Codex home", {
    allowLinkedPath: true,
  });
  const sessions = join(home, "sessions");
  const sessionsAuthority = requireContainedDirectory(
    sessions,
    homeAuthority.canonicalPath,
    "Codex sessions root",
  );
  const threadId = publicCodexThreadId(eventsPath);
  const rollouts = [];
  walkMatchingRollouts(
    sessionsAuthority.canonicalPath,
    sessionsAuthority.canonicalPath,
    threadId,
    rollouts,
  );
  if (rollouts.length !== 1) {
    fail(
      `Codex pure run requires exactly one rollout JSONL matching its public thread (found ${rollouts.length})`,
    );
  }
  const destination = publicationDestination(
    destinationPath,
    homeAuthority,
    "Codex rollout destination",
  );
  const receipt = publicationDestination(
    receiptPath,
    homeAuthority,
    "Codex capture receipt destination",
  );
  if (destination === receipt) fail("Codex rollout and capture receipt destinations must differ");

  // Read only the filename-matched session through one stable descriptor, then
  // validate the private bytes before publishing an exclusive copy. Concurrent
  // Codex sessions create different UUID-named rollouts and cannot enter this path.
  const rolloutBytes = readStablePrivateFile(rollouts[0], "matching Codex rollout");
  const recorded = rolloutRecordedIdentity(rolloutBytes);
  if (recorded.threadId !== threadId) {
    fail("Codex rollout session id differs from public thread.started");
  }
  const expectedAuthority = canonicalExistingDirectory(expectedCwd, "Codex expected player cwd");
  const sessionAuthority = canonicalExistingDirectory(
    recorded.sessionCwd,
    "Codex recorded session player cwd",
  );
  const turnAuthority = canonicalExistingDirectory(
    recorded.turnCwd,
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
    recorded_session_cwd: recorded.sessionCwd,
    recorded_turn_cwd: recorded.turnCwd,
    canonical_expected_cwd: expectedAuthority.canonicalPath,
    canonical_session_cwd: sessionAuthority.canonicalPath,
    canonical_turn_cwd: turnAuthority.canonicalPath,
    expected_directory_identity: expectedAuthority.identity,
    session_directory_identity: sessionAuthority.identity,
    turn_directory_identity: turnAuthority.identity,
    copied_rollout_sha256: sha256(rolloutBytes),
  };
  let destinationWritten = false;
  let receiptWritten = false;
  try {
    writeFileSync(destination, rolloutBytes, { flag: "wx", mode: 0o600 });
    destinationWritten = true;
    requirePrivateRegularFile(destination, "captured Codex rollout");
    writeFileSync(receipt, `${JSON.stringify(receiptBody, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    receiptWritten = true;
    requirePrivateRegularFile(receipt, "Codex capture receipt");
  } catch (error) {
    if (receiptWritten) {
      try {
        unlinkSync(receipt);
      } catch (cleanupError) {
        void cleanupError;
      }
    }
    if (destinationWritten) {
      try {
        unlinkSync(destination);
      } catch (cleanupError) {
        void cleanupError;
      }
    }
    throw error;
  }
  return destination;
}

function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  if (command === "resolve-home") {
    const home = option(argv, "--home");
    if (!home) fail("resolve-home requires --home");
    process.stdout.write(canonicalCodexHome(home));
    return;
  }
  if (command === "validate-output") {
    const home = option(argv, "--home");
    const out = option(argv, "--out");
    const base = option(argv, "--base");
    if (!home || !out || !base) {
      fail("validate-output requires --home, --out, and --base");
    }
    validateOutputPrefix(home, out, base);
    return;
  }
  if (command === "capture") {
    const home = option(argv, "--home");
    const events = option(argv, "--events");
    const out = option(argv, "--out");
    const receipt = option(argv, "--receipt");
    const expectedCwd = option(argv, "--expected-cwd");
    if (!home || !events || !out || !receipt || !expectedCwd) {
      fail("capture requires --home, --events, --out, --receipt, and --expected-cwd");
    }
    captureThreadBoundCodexRollout(home, events, out, receipt, expectedCwd);
    return;
  }
  fail("Usage: codex-rollout.mjs resolve-home|validate-output|capture ...");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
