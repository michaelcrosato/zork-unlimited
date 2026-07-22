import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// @ts-expect-error -- runner helper is intentionally plain ESM.
import * as codexRollout from "../../blind-tester/codex-rollout.mjs";

const { captureSingleCodexRollout, prepareSterileCodexHome } = codexRollout;

const temporaryRoots: string[] = [];

function temporaryRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

function cwdRollout(cwd: string): string {
  return `${JSON.stringify({ type: "session_meta", payload: { cwd } })}\n${JSON.stringify({ type: "turn_context", payload: { cwd } })}\n`;
}

function compactedCwdRollout(cwd: string): string {
  const initial = {
    timestamp: "2026-07-19T09:26:51.354Z",
    type: "turn_context",
    payload: { cwd },
  };
  const replay = { ...structuredClone(initial), timestamp: "2026-07-19T09:37:36.748Z" };
  return `${JSON.stringify({ type: "session_meta", payload: { cwd } })}\n${JSON.stringify(initial)}\n${JSON.stringify({ type: "compacted", payload: {} })}\n${JSON.stringify({ type: "world_state", payload: {} })}\n${JSON.stringify(replay)}\n`;
}

function alterSecondTurnContext(text: string): string {
  const rows = text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { type: string; payload: { cwd?: string } });
  const secondContext = rows.filter((row) => row.type === "turn_context")[1]!;
  secondContext.payload.cwd = "C:\\other\\player";
  return `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
}

function alterSecondTurnContextEnvelope(text: string): string {
  const rows = text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const secondContext = rows.filter((row) => row.type === "turn_context")[1]!;
  secondContext.untrusted_marker = true;
  return `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("sterile Codex rollout capture", () => {
  it("populates only an atomically precreated empty home", () => {
    const root = temporaryRoot("af-codex-precreated-home-");
    const source = join(root, "source-auth.json");
    const home = join(root, "home");
    writeFileSync(source, '{"tokens":{"access_token":"private"}}\n');
    mkdirSync(home, { mode: 0o700 });

    prepareSterileCodexHome(source, home, { precreated: true });

    expect(readdirSync(home)).toEqual(["auth.json"]);
    expect(readFileSync(join(home, "auth.json"), "utf8")).toBe(
      '{"tokens":{"access_token":"private"}}\n',
    );
  });

  it("rejects a nonempty or linked precreated home", () => {
    const root = temporaryRoot("af-codex-invalid-precreated-home-");
    const source = join(root, "source-auth.json");
    const nonemptyHome = join(root, "nonempty-home");
    const externalHome = join(root, "external-home");
    const linkedHome = join(root, "linked-home");
    writeFileSync(source, "{}\n");
    mkdirSync(nonemptyHome);
    writeFileSync(join(nonemptyHome, "unexpected"), "occupied\n");
    mkdirSync(externalHome);
    symlinkSync(externalHome, linkedHome, "junction");

    expect(() => prepareSterileCodexHome(source, nonemptyHome, { precreated: true })).toThrow(
      /must be empty/i,
    );
    expect(() => prepareSterileCodexHome(source, linkedHome, { precreated: true })).toThrow(
      /must be one real directory/i,
    );
  });

  it("copies only auth into a fresh home and exclusively captures one rollout", () => {
    const root = temporaryRoot("af-codex-home-");
    const source = join(root, "source-auth.json");
    const home = join(root, "home");
    const destination = join(root, "run.codex-rollout.jsonl");
    const receipt = join(root, "run.codex-capture.json");
    const player = join(root, "player");
    mkdirSync(player);
    writeFileSync(source, '{"tokens":{"access_token":"private"}}\n');

    prepareSterileCodexHome(source, home);
    expect(readdirSync(home)).toEqual(["auth.json"]);
    expect(readFileSync(join(home, "auth.json"), "utf8")).toBe(
      '{"tokens":{"access_token":"private"}}\n',
    );

    const sessions = join(home, "sessions", "2026", "07", "18");
    mkdirSync(sessions, { recursive: true });
    writeFileSync(join(sessions, "rollout-one.jsonl"), cwdRollout(player));
    captureSingleCodexRollout(home, destination, receipt, player);
    expect(readFileSync(destination, "utf8")).toBe(cwdRollout(player));
    expect(readFileSync(destination, "utf8")).not.toContain("access_token");
    const capture = JSON.parse(readFileSync(receipt, "utf8")) as Record<string, unknown>;
    expect(capture).toEqual({
      schema_version: 2,
      binding: "runner_work_player",
      code_mode_contract: "strict-code-mode-v1",
      recorded_session_cwd: player,
      recorded_turn_cwd: player,
      canonical_expected_cwd: expect.any(String),
      canonical_session_cwd: expect.any(String),
      canonical_turn_cwd: expect.any(String),
      expected_directory_identity: expect.objectContaining({
        device_id: expect.stringMatching(/^\d+$/),
        file_id: expect.stringMatching(/^\d+$/),
      }),
      session_directory_identity: expect.objectContaining({
        device_id: expect.stringMatching(/^\d+$/),
        file_id: expect.stringMatching(/^\d+$/),
      }),
      turn_directory_identity: expect.objectContaining({
        device_id: expect.stringMatching(/^\d+$/),
        file_id: expect.stringMatching(/^\d+$/),
      }),
      copied_rollout_sha256: createHash("sha256").update(readFileSync(destination)).digest("hex"),
    });
    expect(capture.canonical_expected_cwd).toBe(capture.canonical_session_cwd);
    expect(capture.canonical_expected_cwd).toBe(capture.canonical_turn_cwd);
    expect(capture.expected_directory_identity).toEqual(capture.session_directory_identity);
    expect(capture.expected_directory_identity).toEqual(capture.turn_directory_identity);
    expect(() => captureSingleCodexRollout(home, destination, receipt, player)).toThrow(/EEXIST/i);
  });

  it("accepts only an exact compacted replay of the initial turn context", () => {
    const root = temporaryRoot("af-codex-compacted-context-");
    const source = join(root, "source-auth.json");
    const home = join(root, "home");
    const destination = join(root, "run.codex-rollout.jsonl");
    const receipt = join(root, "run.codex-capture.json");
    const player = join(root, "player");
    mkdirSync(player);
    writeFileSync(source, "{}\n");
    prepareSterileCodexHome(source, home);
    mkdirSync(join(home, "sessions"));
    writeFileSync(join(home, "sessions", "rollout-one.jsonl"), compactedCwdRollout(player));

    captureSingleCodexRollout(home, destination, receipt, player);

    for (const [label, mutate] of [
      [
        "missing compaction",
        (text: string) => text.replace('{"type":"compacted","payload":{}}\n', ""),
      ],
      ["altered context", alterSecondTurnContext],
      ["altered context envelope", alterSecondTurnContextEnvelope],
      [
        "post-completion replay",
        (text: string) =>
          text.replace(
            '{"type":"compacted"',
            '{"type":"event_msg","payload":{"type":"task_complete"}}\n{"type":"compacted"',
          ),
      ],
    ] as const) {
      const invalidRoot = temporaryRoot(`af-codex-${label.replaceAll(" ", "-")}-`);
      const invalidHome = join(invalidRoot, "home");
      const invalidPlayer = join(invalidRoot, "player");
      mkdirSync(invalidPlayer);
      writeFileSync(join(invalidRoot, "auth.json"), "{}\n");
      prepareSterileCodexHome(join(invalidRoot, "auth.json"), invalidHome);
      mkdirSync(join(invalidHome, "sessions"));
      writeFileSync(
        join(invalidHome, "sessions", "rollout-one.jsonl"),
        mutate(compactedCwdRollout(invalidPlayer)),
      );
      expect(() =>
        captureSingleCodexRollout(
          invalidHome,
          join(invalidRoot, "out.jsonl"),
          join(invalidRoot, "out.capture.json"),
          invalidPlayer,
        ),
      ).toThrow(/exact compacted duplicate/i);
    }
  });

  it("rejects multiple rollouts and hard-linked rollout substitution", () => {
    const root = temporaryRoot("af-codex-rollout-");
    const source = join(root, "auth.json");
    const home = join(root, "home");
    writeFileSync(source, "{}\n");
    prepareSterileCodexHome(source, home);
    const player = join(root, "player");
    mkdirSync(player);
    const sessions = join(home, "sessions");
    mkdirSync(sessions);
    const first = join(sessions, "rollout-one.jsonl");
    writeFileSync(first, cwdRollout(player));
    writeFileSync(join(sessions, "rollout-two.jsonl"), cwdRollout(player));
    expect(() =>
      captureSingleCodexRollout(
        home,
        join(root, "out.jsonl"),
        join(root, "out.capture.json"),
        player,
      ),
    ).toThrow(/exactly one rollout/i);

    const isolated = temporaryRoot("af-codex-hardlink-");
    const isolatedSource = join(isolated, "auth.json");
    const isolatedHome = join(isolated, "home");
    writeFileSync(isolatedSource, "{}\n");
    prepareSterileCodexHome(isolatedSource, isolatedHome);
    const isolatedPlayer = join(isolated, "player");
    mkdirSync(isolatedPlayer);
    mkdirSync(join(isolatedHome, "sessions"));
    const rollout = join(isolatedHome, "sessions", "rollout-one.jsonl");
    writeFileSync(rollout, cwdRollout(isolatedPlayer));
    linkSync(rollout, join(isolated, "reused-rollout.jsonl"));
    expect(() =>
      captureSingleCodexRollout(
        isolatedHome,
        join(isolated, "out.jsonl"),
        join(isolated, "out.capture.json"),
        isolatedPlayer,
      ),
    ).toThrow(/hard-linked/i);
  });

  it("rejects a rollout recorded from the repository instead of the isolated player cwd", () => {
    const root = temporaryRoot("af-codex-cwd-");
    const source = join(root, "auth.json");
    const home = join(root, "home");
    const player = join(root, "player");
    writeFileSync(source, "{}\n");
    prepareSterileCodexHome(source, home);
    mkdirSync(player);
    mkdirSync(join(home, "sessions"));
    writeFileSync(join(home, "sessions", "rollout-one.jsonl"), cwdRollout(process.cwd()));
    expect(() =>
      captureSingleCodexRollout(
        home,
        join(root, "out.jsonl"),
        join(root, "out.capture.json"),
        player,
      ),
    ).toThrow(/does not equal the isolated player cwd/i);
  });

  it("rejects a linked sessions root before walking provider output", () => {
    const root = temporaryRoot("af-codex-linked-sessions-");
    const source = join(root, "auth.json");
    const home = join(root, "home");
    const player = join(root, "player");
    const externalSessions = join(root, "external-sessions");
    writeFileSync(source, "{}\n");
    prepareSterileCodexHome(source, home);
    mkdirSync(player);
    mkdirSync(externalSessions);
    writeFileSync(join(externalSessions, "rollout-one.jsonl"), cwdRollout(player));
    symlinkSync(externalSessions, join(home, "sessions"), "junction");

    expect(() =>
      captureSingleCodexRollout(
        home,
        join(root, "out.jsonl"),
        join(root, "out.capture.json"),
        player,
      ),
    ).toThrow(/sessions root must be one real directory/i);
  });
});
