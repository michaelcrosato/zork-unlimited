import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyRecordedRunnerEvidence } from "../../src/qa/runner_evidence.js";
import { sha256Hex } from "../../src/qa/session_store.js";
import { recordedClaudeRun, recordedCodexRun } from "./support/recorded_runner.js";

const dirs: string[] = [];
function prefix() {
  const dir = mkdtempSync(join(tmpdir(), "af-runner-proof-"));
  dirs.push(dir);
  return join(dir, "run");
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe.each([
  ["codex", recordedCodexRun],
  ["claude_code", recordedClaudeRun],
] as const)("retained %s runner evidence", (_provider, fixture) => {
  it("authenticates retained artifacts and records the client and artifact hashes", () => {
    const run = fixture(prefix());
    const proof = verifyRecordedRunnerEvidence(run);
    expect(proof).toMatchObject({
      ok: true,
      clientEvidence: {
        model: run.model,
        game_session_id: "ow-recorded-proof",
        provider_session_id: "10000000-0000-4000-8000-000000000741",
        report_sha256: sha256Hex(run.reportText),
      },
    });
  });

  it("refuses to transplant a report or claim another provider/model", () => {
    const run = fixture(prefix());
    expect(verifyRecordedRunnerEvidence({ ...run, model: "another-model" }).ok).toBe(false);
    expect(
      verifyRecordedRunnerEvidence({
        ...run,
        provider: run.provider === "codex" ? "claude_code" : "codex",
      }).ok,
    ).toBe(false);
    expect(
      verifyRecordedRunnerEvidence({
        ...run,
        reportText: run.reportText.replace("The road choice.", "Invented feedback."),
      }).ok,
    ).toBe(false);
  });

  it("requires raw game evidence matching the sidecar and report receipt", () => {
    const run = fixture(prefix());
    expect(verifyRecordedRunnerEvidence({ ...run, evidenceText: null }).ok).toBe(false);
    expect(
      verifyRecordedRunnerEvidence({
        ...run,
        evidenceText: run.evidenceText.replaceAll("ow-recorded-proof", "ow-other"),
      }).ok,
    ).toBe(false);
    expect(
      verifyRecordedRunnerEvidence({
        ...run,
        sidecarText: run.sidecarText.replace('"run_seed":741', '"run_seed":742'),
      }).ok,
    ).toBe(false);
    expect(verifyRecordedRunnerEvidence({ ...run, reportText: null }).ok).toBe(false);
  });
});

describe("client capture boundaries", () => {
  it.each(["report", "call", "terminal result"])(
    "binds Claude's stream %s to the copied transcript",
    (target) => {
      const run = recordedClaudeRun(prefix());
      const path = `${run.outPrefix}.claude.jsonl`;
      const original = readFileSync(path, "utf8");
      const report = run.reportText.replace("The road choice.", "Invented feedback.");
      let edited: string;
      if (target === "call") {
        edited = original.replace('"name":"mcp__adventureforge__start_overworld"', '"name":"Bash"');
      } else if (target === "report") {
        edited = original.replaceAll("The road choice.", "Invented feedback.");
      } else {
        const rows = original
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line));
        rows.at(-1).result = report;
        edited = rows.map((row) => JSON.stringify(row)).join("\n");
      }
      writeFileSync(path, edited);
      const envelopePath = `${run.outPrefix}.json`;
      const envelope = JSON.parse(readFileSync(envelopePath, "utf8"));
      if (target !== "call") envelope.result = report;
      writeFileSync(envelopePath, JSON.stringify(envelope));
      expect(
        verifyRecordedRunnerEvidence({
          ...run,
          reportText: target === "call" ? run.reportText : report,
        }),
      ).toMatchObject({
        ok: false,
        reason: expect.stringMatching(/transcript/),
      });
    },
  );
  it("requires Codex raw events, copied rollout, and its hash-bound capture receipt", () => {
    const run = recordedCodexRun(prefix());
    for (const suffix of ["codex.jsonl", "codex-rollout.jsonl", "codex-capture.json"]) {
      const path = `${run.outPrefix}.${suffix}`;
      const original = readFileSync(path);
      unlinkSync(path);
      expect(verifyRecordedRunnerEvidence(run).ok, suffix).toBe(false);
      writeFileSync(path, original);
    }
    const path = `${run.outPrefix}.codex-rollout.jsonl`;
    writeFileSync(path, readFileSync(path, "utf8").replace('"effort":"xhigh"', '"effort":"low"'));
    expect(verifyRecordedRunnerEvidence(run).ok).toBe(false);
  });

  it("verifies a deliberately pinned max effort without changing the fleet's xhigh default", () => {
    const run = recordedCodexRun(prefix(), "max");
    expect(verifyRecordedRunnerEvidence(run)).toMatchObject({
      ok: true,
      clientEvidence: { reasoning_effort: "max" },
    });
    expect(verifyRecordedRunnerEvidence({ ...run, reasoningEffort: "xhigh" }).ok).toBe(false);
  });

  it("re-audits Claude's offered surface, even when the forbidden tool was never called", () => {
    const run = recordedClaudeRun(prefix());
    const path = `${run.outPrefix}.claude.jsonl`;
    writeFileSync(path, readFileSync(path, "utf8").replace('"tools":[', '"tools":["Bash",'));
    expect(verifyRecordedRunnerEvidence(run)).toMatchObject({
      ok: false,
      reason: expect.stringContaining("Bash"),
    });
  });

  it("does not trust a Claude receipt without the copied transcript or accept edited calls", () => {
    const run = recordedClaudeRun(prefix());
    const path = `${run.outPrefix}.claude-session.jsonl`;
    const original = readFileSync(path, "utf8");
    unlinkSync(path);
    expect(verifyRecordedRunnerEvidence(run).ok).toBe(false);
    writeFileSync(path, original.replaceAll("mcp__adventureforge__start_overworld", "Bash"));
    expect(verifyRecordedRunnerEvidence(run)).toMatchObject({
      ok: false,
      reason: expect.stringContaining("Bash"),
    });
  });
});
