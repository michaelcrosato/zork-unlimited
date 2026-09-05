/**
 * `bin/record-playtest-session.ts` — the connector between `blind-tester/run.sh` and the
 * playtest corpus.
 *
 * Exercised as a subprocess rather than a library because the bug this file exists for
 * was invisible at the library level: the recorder handed `parseBlindRunSidecar` a
 * `JSON.parse(...)` result where the function takes raw TEXT. `JSON.parse` returns `any`,
 * so it type-checked, and every parse then failed with "not valid JSON" — silently. The
 * sidecar was never read at all, so every session recorded through `playtest-loop.sh`
 * carried seed 0, an `unknown-<path>` game session id, and the checkout's HEAD instead of
 * the build actually played.
 *
 * The same silent failure disabled the structural guard below, which is what makes a
 * zero-token mock run indistinguishable from a real vendor's playthrough.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  countsTowardExperienceMetrics,
  parsePlaytestSession,
} from "../../src/qa/session_record.js";
import { recordedClaudeRun, recordedCodexRun } from "./support/recorded_runner.js";

const ROOT = process.cwd();
const TSX = join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");

const dirs: string[] = [];
function temp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

/** The sidecar `blind-tester/run.sh --mock` actually writes, verbatim in shape. */
const STRUCTURAL_SIDECAR = {
  schema_version: 1,
  report_schema_version: 2,
  play_mode: "structural",
  start_surface: "direct_quest",
  retention_eligible: false,
  evidence_status: "not_applicable",
  structural_kind: "mock",
};

/** A minimal report carrying an exit interview, as a mock run emits. */
const REPORT = [
  "# Blind report",
  "",
  "```json",
  JSON.stringify(
    {
      clarity: 3,
      enjoyment: 2,
      goal_understood: true,
      got_stuck: false,
      confusions: [],
      bugs: [],
      best_moment: "n/a",
      worst_moment: "n/a",
      would_replay: true,
      verdict: "Scripted walkthrough, no model involved.",
    },
    null,
    2,
  ),
  "```",
  "",
].join("\n");

type RecordOptions = {
  provider?: string;
  model?: string;
  attestation?: { attestedBy: string; method: string };
  effort?: string;
  envEffort?: string;
};

const ATTESTATION = {
  attestedBy: "qa-harness",
  method: "runner launch observed; client proof unavailable",
};

function record(
  outPrefix: string,
  store: string,
  options: RecordOptions = {},
): { output: string; status: number | null } {
  const provider = options.provider ?? "codex";
  const model = options.model ?? "gpt-5.3-codex-spark";
  const attestationArgs = options.attestation
    ? ["--attested-by", options.attestation.attestedBy, "--method", options.attestation.method]
    : [];
  const result = spawnSync(
    process.execPath,
    [
      TSX,
      "bin/record-playtest-session.ts",
      "--out",
      outPrefix,
      "--provider",
      provider,
      "--persona",
      "default",
      "--model",
      model,
      "--store",
      store,
      ...attestationArgs,
      ...(options.effort ? ["--effort", options.effort] : []),
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 120_000,
      env: { ...process.env, BLIND_REASONING_EFFORT: options.envEffort ?? "" },
    },
  );
  return { output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`, status: result.status };
}

describe("recording a run into the playtest corpus", () => {
  it.each(["flag", "environment"])("honors the Codex launch effort from the %s", (source) => {
    const out = join(temp("af-rec-run-"), "run");
    const store = temp("af-rec-store-");
    recordedCodexRun(out, "max");
    const result = record(out, store, {
      model: "gpt-5.6-terra",
      ...(source === "flag" ? { effort: "max", envEffort: "low" } : { envEffort: "max" }),
    });
    expect(result.status, result.output).toBe(0);
    const session = JSON.parse(
      readFileSync(join(store, readdirSync(store)[0]!, "session.json"), "utf8"),
    );
    expect(session.provider.isolation).toBe("runner_enforced");
    expect(session.provider.client_evidence.reasoning_effort).toBe("max");
    expect(session.model.settings.reasoning_effort).toBe("max");
  });
  it("keeps a structural mock out of the corpus entirely", () => {
    const work = temp("af-rec-run-");
    const store = temp("af-rec-store-");
    const out = join(work, "run1");
    writeFileSync(`${out}.md`, REPORT, "utf8");
    writeFileSync(`${out}.run.json`, JSON.stringify(STRUCTURAL_SIDECAR, null, 2), "utf8");

    const { output, status } = record(out, store);

    // A mock drives the game with no model behind it, yet emits a filled-in exit
    // interview. Recorded, the provider registry would stamp it `runner_enforced` and
    // its family would count toward corroboration — three mocks under three provider
    // ids would read as three vendors agreeing and promote into the dev queue.
    expect(readdirSync(store), output).toEqual([]);
    expect(output).toContain("mock run, not a playtest");
    // Exit 0, not an error: playtest-loop.sh calls this unconditionally, and a wiring
    // check should report a clean skip rather than look like a crash.
    expect(status, output).toBe(0);
  });

  it("does not treat an unreadable sidecar as a structural run", () => {
    // The guard must key on what the sidecar SAYS, never on failing to read it —
    // that conflation is the original bug wearing different clothes.
    const work = temp("af-rec-run-");
    const store = temp("af-rec-store-");
    const out = join(work, "run1");
    writeFileSync(`${out}.md`, REPORT, "utf8");
    writeFileSync(`${out}.run.json`, "{ not json at all", "utf8");

    const { output } = record(out, store, { attestation: ATTESTATION });
    expect(output).not.toContain("not a playtest");
    expect(readdirSync(store).length, output).toBe(1);
  });

  it("records a run whose sidecar never arrived, rather than dropping the evidence", () => {
    // A crashed or timed-out player writes no sidecar. That is still evidence about the
    // game, and dropping it is how a QA corpus quietly becomes a highlight reel.
    const work = temp("af-rec-run-");
    const store = temp("af-rec-store-");
    const out = join(work, "run1");
    writeFileSync(`${out}.md`, REPORT, "utf8");

    const { output, status } = record(out, store, { attestation: ATTESTATION });
    expect(status, output).toBe(0);
    expect(readdirSync(store).length, output).toBe(1);
    const session = JSON.parse(
      readFileSync(join(store, readdirSync(store)[0]!, "session.json"), "utf8"),
    );
    expect(session.provider.isolation).toBe("operator_attested");
    expect(session.provider.client_evidence).toBeUndefined();
  });

  it.each([
    ["codex", "gpt-5.6-terra", recordedCodexRun],
    ["claude_code", "claude-haiku-4-5-20251001", recordedClaudeRun],
  ] as const)(
    "requires run-specific proof before sealing %s as runner_enforced",
    (provider, model, fixture) => {
      const out = join(temp("af-rec-run-"), "run");
      const store = temp("af-rec-store-");
      const run = fixture(out);
      const proofPath =
        provider === "codex" ? `${out}.codex-capture.json` : `${out}.claude-capture.json`;
      const proof = readFileSync(proofPath);
      rmSync(proofPath);
      const rejected = record(out, store, { provider, model });
      expect(rejected.status, rejected.output).not.toBe(0);
      expect(rejected.output).toContain("requires both --attested-by and --method");
      expect(readdirSync(store)).toEqual([]);
      writeFileSync(proofPath, proof);
      const accepted = record(out, store, { provider, model });
      expect(accepted.status, accepted.output).toBe(0);
      const session = parsePlaytestSession(
        JSON.parse(readFileSync(join(store, readdirSync(store)[0]!, "session.json"), "utf8")),
      );
      expect(session.provider.isolation).toBe("runner_enforced");
      expect(session.provider.client_evidence?.model).toBe(run.model);
      expect(session.game_session_id).toBe("ow-recorded-proof");
      expect(session.run_seed).toBe(741);
      expect(countsTowardExperienceMetrics(session)).toBe(true);
    },
  );

  it("refuses to invent a missing operator attestation", () => {
    const work = temp("af-rec-run-");
    const store = temp("af-rec-store-");
    const out = join(work, "run1");
    writeFileSync(`${out}.md`, REPORT, "utf8");

    const { output, status } = record(out, store, {
      provider: "grok_cli",
      model: "grok-4.6",
    });

    expect(status, output).not.toBe(0);
    expect(output).toContain("requires both --attested-by and --method");
    expect(readdirSync(store), output).toEqual([]);
  });

  it("preserves an explicit operator attestation on a weaker lane", () => {
    const work = temp("af-rec-run-");
    const store = temp("af-rec-store-");
    const out = join(work, "run1");
    writeFileSync(`${out}.md`, REPORT, "utf8");

    const { output, status } = record(out, store, {
      provider: "grok_cli",
      model: "grok-4.6",
      attestation: {
        attestedBy: "qa-harness",
        method: "dedicated MCP-only harness",
      },
    });

    expect(status, output).toBe(0);
    const [sessionDir] = readdirSync(store);
    expect(sessionDir, output).toBeDefined();
    const session = JSON.parse(readFileSync(join(store, sessionDir!, "session.json"), "utf8")) as {
      provider: {
        isolation: string;
        operator_attestation?: { attested_by: string; method: string };
      };
    };
    expect(session.provider).toMatchObject({
      isolation: "operator_attested",
      operator_attestation: {
        attested_by: "qa-harness",
        method: "dedicated MCP-only harness",
      },
    });
  });
});
