import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildBlindFeedbackLedger,
  renderBlindFeedbackLedgerMarkdown,
} from "../../src/blind/feedback_ledger.js";
import { hashState } from "../../src/core/hash.js";

function report(interviewJson: string): string {
  return `
1. Playthrough log: I started the open world, found work, travelled, and stopped with a clear read.
2. Did it work mechanically? No rejected actions or loops.
3. Understandable & fun? clarity 4/5 + enjoyment 3/5.
4. Confusion / friction points. See exit interview.
5. Bugs or design flaws. See exit interview.
6. Verdict: A real new player would understand the opening but might not replay it.
7. EXIT INTERVIEW

\`\`\`json exit-interview
${interviewJson}
\`\`\`
`;
}

function interview(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify(
    {
      clarity: 4,
      enjoyment: 3,
      goal_understood: true,
      got_stuck: false,
      confusions: [],
      bugs: [],
      best_moment: "Finding a local notice from exploration.",
      worst_moment: "The road action felt like bookkeeping.",
      would_replay: false,
      verdict: "The opening is readable, but the first loop still needs a sharper hook.",
      ...overrides,
    },
    null,
    2,
  );
}

describe("blind feedback ledger", () => {
  it("keeps latest accepted reports explicit and collapses older reports into traits", () => {
    const root = mkdtempSync(join(tmpdir(), "af-feedback-ledger-"));
    try {
      const reports = join(root, "blind-tester", "reports");
      mkdirSync(reports, { recursive: true });
      writeFileSync(
        join(reports, "20260708T100000Z_overworld_seed1.md"),
        report(
          interview({
            confusions: ["starting town felt generic"],
            worst_moment: "The opening town felt generic.",
          }),
        ),
      );
      writeFileSync(
        join(reports, "20260708T110000Z_overworld_seed2.md"),
        report(interview({ clarity: 5, enjoyment: 4, confusions: ["road choices were abstract"] })),
      );
      writeFileSync(
        join(reports, "20260708T120000Z_tide_mill_seed3.md"),
        report(
          interview({
            bugs: [{ where: "Head-Race", severity: "S1", note: "Solved race id looked stale." }],
          }),
        ),
      );
      writeFileSync(join(reports, "20260708T130000Z_overworld_seed4.md"), "not a valid report");

      const ledger = buildBlindFeedbackLedger(reports, { recentLimit: 2, cwd: root });

      expect(ledger.accepted_reports).toBe(3);
      expect(ledger.rejected_reports).toBe(1);
      expect(ledger.latest_stamp).toBe("20260708T120000Z");
      expect(ledger.recent_entries.map((entry) => entry.seed)).toEqual([3, 2]);
      expect(ledger.archived_entry_count).toBe(1);
      expect(ledger.recent_traits.some((trait) => trait.text.includes("road choices"))).toBe(true);
      expect(ledger.archived_traits.some((trait) => trait.text.includes("starting town"))).toBe(
        true,
      );

      const markdown = renderBlindFeedbackLedgerMarkdown(ledger);
      expect(markdown).toContain("## Recent Entries");
      expect(markdown).toContain("20260708T120000Z");
      expect(markdown).toContain("Archived accepted entries collapsed into traits: 1");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("renders an empty accepted-report set without clocks or placeholders", () => {
    const root = mkdtempSync(join(tmpdir(), "af-feedback-ledger-empty-"));
    try {
      const reports = join(root, "blind-tester", "reports");
      mkdirSync(reports, { recursive: true });
      writeFileSync(join(reports, ".gitkeep"), "");

      const markdown = renderBlindFeedbackLedgerMarkdown(
        buildBlindFeedbackLedger(reports, { cwd: root }),
      );

      expect(markdown).toContain("Accepted reports: 0");
      expect(markdown).toContain("Latest report stamp: none");
      expect(markdown).toContain("No accepted feedback entries yet.");
      expect(markdown).not.toContain(new Date().getFullYear().toString());
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("requires a matching verified sidecar before counting V2 pure retention evidence", () => {
    const root = mkdtempSync(join(tmpdir(), "af-feedback-ledger-pure-"));
    try {
      const reports = join(root, "blind-tester", "reports");
      mkdirSync(reports, { recursive: true });
      const payload = {
        contractVersion: 1,
        exitReason: "player_ended_at_choice",
        goalVersion: 1,
        goalId: "albany_local_lead",
        goalStatus: "active",
        acceptedDecisions: 40,
        exitReasons: ["checkpoint"],
        checkpoint: 40,
        decisionProofHash: "a".repeat(64),
        retentionHistory: [
          {
            sequence: 1,
            atDecision: 40,
            reasons: ["checkpoint"],
            checkpoint: 40,
            choice: "end",
            decisionProofHash: "a".repeat(64),
          },
        ],
      };
      const receipt = { ...payload, receiptHash: hashState(payload) };
      const reportPath = join(reports, "20260708T140000Z_overworld_seed5.md");
      writeFileSync(
        reportPath,
        report(
          interview({
            schema_version: 2,
            play_mode: "pure",
            start_surface: "fresh_overworld",
            retention_eligible: true,
            journey_exit_receipt: receipt,
          }),
        ),
      );

      const withoutSidecar = buildBlindFeedbackLedger(reports, { cwd: root });
      expect(withoutSidecar.accepted_reports).toBe(0);
      expect(withoutSidecar.rejected_reports).toBe(1);

      writeFileSync(
        reportPath.replace(/\.md$/, ".run.json"),
        JSON.stringify({
          schema_version: 1,
          report_schema_version: 2,
          play_mode: "pure",
          start_surface: "fresh_overworld",
          retention_eligible: true,
          evidence_status: "verified",
          session_id: "ow-ledger",
          receipt,
        }),
      );
      const withSidecar = buildBlindFeedbackLedger(reports, { cwd: root });
      expect(withSidecar.accepted_reports).toBe(1);
      expect(withSidecar.rejected_reports).toBe(0);
      expect(withSidecar.recent_entries[0]).toMatchObject({
        play_mode: "pure",
        start_surface: "fresh_overworld",
        retention_eligible: true,
        accepted_decisions: 40,
        exit_reason: "player_ended_at_choice",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
