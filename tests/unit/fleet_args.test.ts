import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashState } from "../../src/core/hash.js";
import {
  INITIAL_JOURNEY_GOAL,
  JOURNEY_BASELINE_DECISIONS,
  JOURNEY_CONTRACT_VERSION,
} from "../../src/world/journey_contract.js";
// vitest can import .mjs fine:
// @ts-expect-error — plain .mjs module without type declarations
import { fillPrompt } from "../../blind-tester/fill-prompt.mjs";
import {
  parseFleetArgs,
  planFleetRuns,
  PURE_BASELINE_DECISIONS,
  PURE_SESSION_CONTRACT_VERSION,
  reportPathFor,
  resumeCandidatesFor,
  runSidecarPathFor,
  verifyReportForResume,
  // @ts-expect-error — plain .mjs module without type declarations
} from "../../blind-tester/fleet.mjs";

it("keeps the fleet resume contract pinned to the engine journey contract", () => {
  expect(PURE_SESSION_CONTRACT_VERSION).toBe(JOURNEY_CONTRACT_VERSION);
  expect(PURE_BASELINE_DECISIONS).toBe(JOURNEY_BASELINE_DECISIONS);
});

describe("fill-prompt", () => {
  const template = "Intro.\n{{PERSONA}}\nRules __SEED__.\nGo: {{START_INSTRUCTION}}\n";
  it("substitutes all three placeholders", () => {
    const out = fillPrompt(template, {
      startInstruction: "start overworld",
      seed: 42,
      persona: "You are the BREAKER.",
    });
    expect(out).toContain("You are the BREAKER.");
    expect(out).toContain("Rules 42.");
    expect(out).toContain("Go: start overworld");
    expect(out).not.toMatch(/\{\{|__SEED__/);
  });
  it("empty persona leaves zero residue — byte-compatible with the pre-persona prompt", () => {
    const out = fillPrompt(template, { startInstruction: "x", seed: 1, persona: "" });
    expect(out).toBe("Intro.\nRules 1.\nGo: x\n");
  });
  it("real prompts contain exactly one persona slot each", () => {
    for (const p of ["blind-tester/prompt.md", "blind-tester/prompt-overworld.md"])
      expect(readFileSync(p, "utf8").match(/\{\{PERSONA\}\}/g)).toHaveLength(1);
  });
});

describe("fleet planning", () => {
  it("defaults milestone fleets to exactly 100 fresh-overworld runs", () => {
    const opts = parseFleetArgs([]);
    expect(opts.count).toBe(100);
    expect(opts.target).toBe("overworld");
    expect(opts.personas).toBe("default");
    expect(planFleetRuns(opts)).toHaveLength(100);
  });

  it("rotates personas only for explicit structural mocks and honors seed base", () => {
    const runs = planFleetRuns(
      parseFleetArgs(["--mock", "--count", "7", "--personas", "mixed", "--seed-base", "100"]),
    );
    expect(runs.map((r: { seed: number }) => r.seed)).toEqual([100, 101, 102, 103, 104, 105, 106]);
    expect(runs[0].persona).toBe("explorer");
    expect(runs[5].persona).toBe("explorer"); // 5 % 5 wraps
    expect(new Set(runs.map((r: { persona: string }) => r.persona)).size).toBe(5);
  });

  it("rejects persona-directed live fleets", () => {
    expect(() => parseFleetArgs(["--personas", "mixed"])).toThrow(/pure live runs/i);
    expect(() => parseFleetArgs(["--personas", "breaker"])).toThrow(/structural mode/i);
    expect(parseFleetArgs(["--mock", "--personas", "breaker"]).personas).toBe("breaker");
  });
  it("explicit mock quest targets parse and reach the structural plan", () => {
    const runs = planFleetRuns(
      parseFleetArgs(["--mock", "--count", "2", "--target", "quest:sunken_barrow"]),
    );
    expect(runs.every((r: { target: string }) => r.target === "quest:sunken_barrow")).toBe(true);
  });

  it("rejects quest targets for live fleets regardless of flag order", () => {
    expect(() => parseFleetArgs(["--target", "quest:sunken_barrow"])).toThrow(
      /live blind LLM runs must target overworld/i,
    );
    expect(() => parseFleetArgs(["--target", "quest:sunken_barrow", "--count", "2"])).toThrow(
      /quest targets require explicit --mock/i,
    );
    expect(parseFleetArgs(["--target", "quest:sunken_barrow", "--mock"]).target).toBe(
      "quest:sunken_barrow",
    );

    const bypassedParser = parseFleetArgs([]);
    bypassedParser.target = "quest:sunken_barrow";
    expect(() => planFleetRuns(bypassedParser)).toThrow(
      /live blind LLM runs must target overworld/i,
    );
  });

  it("rejects malformed targets even for structural mock fleets", () => {
    expect(() => parseFleetArgs(["--mock", "--target", "sunken_barrow"])).toThrow(
      /overworld or quest:<id>/i,
    );
    expect(() => parseFleetArgs(["--mock", "--target", "quest:"])).toThrow(
      /overworld or quest:<id>/i,
    );
    expect(() => parseFleetArgs(["--mock", "--target", "quest:two words"])).toThrow(
      /overworld or quest:<id>/i,
    );
  });

  it("report filenames match the ledger regex", () => {
    const p = reportPathFor("blind-tester/reports", "20260709T010203Z", "overworld", 12);
    expect(p.replace(/\\/g, "/").split("/").pop()).toMatch(/^\d{8}T\d{6}Z_.+_seed-?\d+\.md$/);
  });
});

describe("resumeCandidatesFor", () => {
  it("anchors the seed so seed1 never matches seed10", () => {
    const entries = ["20260709T010203Z_overworld_seed10.md", "20260709T010203Z_overworld_seed1.md"];
    expect(resumeCandidatesFor(entries, "overworld", 1)).toEqual([
      "20260709T010203Z_overworld_seed1.md",
    ]);
    expect(resumeCandidatesFor(entries, "overworld", 10)).toEqual([
      "20260709T010203Z_overworld_seed10.md",
    ]);
  });
  it("returns matches newest-stamp-first", () => {
    const entries = [
      "20260101T000000Z_overworld_seed5.md",
      "20260301T000000Z_overworld_seed5.md",
      "20260201T000000Z_overworld_seed5.md",
    ];
    expect(resumeCandidatesFor(entries, "overworld", 5)).toEqual([
      "20260301T000000Z_overworld_seed5.md",
      "20260201T000000Z_overworld_seed5.md",
      "20260101T000000Z_overworld_seed5.md",
    ]);
  });
  it("ignores non-matching slugs and unrelated files", () => {
    const entries = [
      "20260101T000000Z_sunken_barrow_seed5.md",
      "notes.txt",
      "20260101T000000Z_overworld_seed5.json",
    ];
    expect(resumeCandidatesFor(entries, "overworld", 5)).toEqual([]);
  });

  it("does not let a verifier-valid legacy report resume a pure fleet slot", async () => {
    const dir = mkdtempSync(join(tmpdir(), "af-pure-resume-"));
    try {
      const reportPath = join(dir, "20260101T000000Z_overworld_seed5.md");
      writeFileSync(
        reportPath,
        `
1. Playthrough log: played a guided opening.
2. Did it work mechanically? Yes.
3. Understandable & fun? clarity 4/5 and enjoyment 4/5.
4. Confusion / friction points: none.
5. Bugs or design flaws: none.
6. Verdict: A real player could understand this legacy opening.
\`\`\`json exit-interview
${JSON.stringify({
  clarity: 4,
  enjoyment: 4,
  goal_understood: true,
  got_stuck: false,
  confusions: [],
  bugs: [],
  best_moment: "A visible choice landed clearly.",
  worst_moment: "One transition was slow.",
  would_replay: true,
  verdict: "A real player could understand this legacy opening and keep playing.",
})}
\`\`\`
`,
      );
      expect(runSidecarPathFor(reportPath)).toBe(reportPath.replace(/\.md$/, ".run.json"));
      expect((await verifyReportForResume(reportPath, "pure")).ok).toBe(false);
      writeFileSync(
        runSidecarPathFor(reportPath),
        JSON.stringify({
          schema_version: 1,
          report_schema_version: 2,
          play_mode: "structural",
          start_surface: "fresh_overworld",
          retention_eligible: false,
          evidence_status: "not_applicable",
          structural_kind: "mock",
        }),
      );
      expect((await verifyReportForResume(reportPath, "pure")).ok).toBe(false);

      const decisionProofHash = "a".repeat(64);
      const receiptPayload = {
        contractVersion: 1,
        exitReason: "player_ended_at_choice",
        goalVersion: 1,
        goalId: "albany_local_lead",
        goalStatus: "active",
        acceptedDecisions: 40,
        exitReasons: ["checkpoint"],
        checkpoint: 40,
        decisionProofHash,
        retentionHistory: [
          {
            sequence: 1,
            atDecision: 40,
            reasons: ["checkpoint"],
            checkpoint: 40,
            choice: "end",
            decisionProofHash,
          },
        ],
      };
      const receipt = { ...receiptPayload, receiptHash: hashState(receiptPayload) };
      const pureInterview = {
        schema_version: 2,
        play_mode: "pure",
        start_surface: "fresh_overworld",
        retention_eligible: true,
        journey_exit_receipt: receipt,
        clarity: 4,
        enjoyment: 4,
        goal_understood: true,
        got_stuck: false,
        confusions: [],
        bugs: [],
        best_moment: "A visible choice landed clearly.",
        worst_moment: "One transition was slow.",
        would_replay: true,
        verdict: "A real player could understand this pure opening and keep playing.",
      };
      writeFileSync(
        reportPath,
        `
1. Playthrough log: played naturally until the game offered an exit.
2. Did it work mechanically? Yes.
3. Understandable & fun? clarity 4/5 and enjoyment 4/5.
4. Confusion / friction points: none.
5. Bugs or design flaws: none.
6. Verdict: A real player could understand this pure opening.
\`\`\`json exit-interview
${JSON.stringify(pureInterview)}
\`\`\`
`,
      );
      writeFileSync(
        runSidecarPathFor(reportPath),
        JSON.stringify({
          schema_version: 1,
          report_schema_version: 2,
          play_mode: "pure",
          start_surface: "fresh_overworld",
          retention_eligible: true,
          evidence_status: "verified",
          session_id: "ow-resume",
          receipt,
        }),
      );
      const pureResume = await verifyReportForResume(reportPath, "pure");
      expect(pureResume.ok).toBe(false);
      expect(pureResume.run).toMatchObject({ play_mode: "pure", retention_eligible: true });

      const currentPayload = {
        ...receiptPayload,
        contractVersion: PURE_SESSION_CONTRACT_VERSION,
        goalText: INITIAL_JOURNEY_GOAL.text,
        goalCompletedAtDecision: null,
        completedGoals: [],
        retentionHistory: receiptPayload.retentionHistory.map((event) => ({
          ...event,
          goalVersion: null,
          goalId: null,
        })),
      };
      const currentReceipt = {
        ...currentPayload,
        receiptHash: hashState(currentPayload),
      };
      writeFileSync(
        reportPath,
        `
1. Playthrough log: played naturally until the game offered an exit.
2. Did it work mechanically? Yes.
3. Understandable & fun? clarity 4/5 and enjoyment 4/5.
4. Confusion / friction points: none.
5. Bugs or design flaws: none.
6. Verdict: A real player could understand this pure opening.
\`\`\`json exit-interview
${JSON.stringify({ ...pureInterview, journey_exit_receipt: currentReceipt })}
\`\`\`
`,
      );
      writeFileSync(
        runSidecarPathFor(reportPath),
        JSON.stringify({
          schema_version: 2,
          report_schema_version: 2,
          play_mode: "pure",
          start_surface: "fresh_overworld",
          retention_eligible: true,
          evidence_status: "verified",
          session_id: "ow-resume",
          run_seed: 5,
          build: {
            git_commit: "b".repeat(40),
            tracked_worktree_clean: true,
            world_id: "new_york_overworld",
            world_hash: "c".repeat(64),
          },
          quest_outcomes: [],
          receipt: currentReceipt,
        }),
      );
      expect((await verifyReportForResume(reportPath, "pure")).ok).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("parseFleetArgs numeric validation", () => {
  it("rejects --count 0 (would otherwise be vacuous success)", () => {
    expect(() => parseFleetArgs(["--count", "0"])).toThrow();
  });
  it("rejects a non-numeric --count", () => {
    expect(() => parseFleetArgs(["--count", "abc"])).toThrow();
  });
  it("rejects --concurrency 0", () => {
    expect(() => parseFleetArgs(["--concurrency", "0"])).toThrow();
  });
  it("rejects a non-integer --concurrency", () => {
    expect(() => parseFleetArgs(["--concurrency", "1.5"])).toThrow();
  });
  it("rejects a negative --max-retries", () => {
    expect(() => parseFleetArgs(["--max-retries", "-1"])).toThrow();
  });
  it("rejects a non-integer --seed-base", () => {
    expect(() => parseFleetArgs(["--seed-base", "NaN"])).toThrow();
  });
  it("accepts the sensible-minimum boundary values", () => {
    expect(() =>
      parseFleetArgs(["--count", "1", "--concurrency", "1", "--max-retries", "0"]),
    ).not.toThrow();
  });
});
