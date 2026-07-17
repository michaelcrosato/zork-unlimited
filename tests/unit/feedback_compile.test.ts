import { describe, expect, it, beforeAll } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectInputs, compileFeedback } from "../../src/feedback/compile.js";
import {
  FeedbackEvidenceSummarySchema,
  summarizeFeedbackEvidence,
} from "../../src/feedback/evidence_summary.js";
import { PureExitInterviewV2Schema } from "../../src/blind/exit_interview.js";
import { HotspotsFileSchema } from "../../src/feedback/schema.js";
import { CrawlFindingSchema, type CrawlFinding } from "../../src/crawl/findings.js";
import { hashState } from "../../src/core/hash.js";

// Three hand-written, verifier-passing report skeletons (a real "Playthrough
// log"/"Verdict"/clarity+enjoyment rating section plus a fenced exit-interview
// block — see src/blind/report_verifier.ts). Report C deliberately omits the
// exit-interview block so it must be REJECTED and excluded from clustering.
//
// Report A's bug is planted at the real overworld node id "albany_city" (an
// exact rung-1 id hit — see src/feedback/normalize.ts); the crawl findings
// fixture below plants a WORLD finding at the SAME node with near-identical
// wording, so the two are expected to merge into one crawler+fleet cluster
// and earn the BOTH_SOURCES_BONUS.
const REPORT_A = `# Blind Playtest Report (fixture seed 1, overworld)

## Playthrough log

- Explored the opening town and reached the station quarter.

## Did it work mechanically?

No rejected actions this run.

## Understandable & fun?

Clarity: 4/5. Enjoyment: 3/5. Could tell what to do without getting stuck.

## Confusion / friction points

None noted this run.

## Bugs or design flaws

- **albany_city** (S3): notice board confusing about quest start

## Verdict

The opening held together well enough that a new player would likely keep going.

## Exit interview

\`\`\`json exit-interview
{
  "clarity": 4,
  "enjoyment": 3,
  "goal_understood": true,
  "got_stuck": false,
  "confusions": [],
  "bugs": [
    { "where": "albany_city", "severity": "S3", "note": "notice board confusing about quest start" }
  ],
  "best_moment": "Finding the road out of the opening town.",
  "worst_moment": "Running into the notice board confusion.",
  "would_replay": true,
  "verdict": "The opening held together well enough that a new player would likely keep going."
}
\`\`\`
`;

const REPORT_B = `# Blind Playtest Report (fixture seed 2, overworld)

## Playthrough log

- Wandered a stretch of the map with nothing much happening.

## Did it work mechanically?

No rejected actions this run.

## Understandable & fun?

Clarity: 3/5. Enjoyment: 3/5. Could tell what to do without getting stuck.

## Confusion / friction points

- nowhere in particular felt worth mentioning

## Bugs or design flaws

- **nowhere in particular** (S1): minor wording nit unrelated to anything else

## Verdict

A quiet run with nothing much standing out either way.

## Exit interview

\`\`\`json exit-interview
{
  "clarity": 3,
  "enjoyment": 3,
  "goal_understood": true,
  "got_stuck": false,
  "confusions": ["nowhere in particular felt worth mentioning"],
  "bugs": [
    { "where": "nowhere in particular", "severity": "S1", "note": "minor wording nit unrelated to anything else" }
  ],
  "best_moment": "A calm stretch of exploring.",
  "worst_moment": "Nothing much happened.",
  "would_replay": false,
  "verdict": "A quiet run with nothing much standing out either way."
}
\`\`\`
`;

// No exit-interview block at all — must be rejected by verifyBlindReportText
// and excluded from every downstream step (no IssueRecords, no metrics).
const REPORT_C = `# Blind Playtest Report (fixture seed 3, overworld)

## Playthrough log

- Started the run but the report ends here without a structured interview.

## Did it work mechanically?

No rejected actions this run.

## Understandable & fun?

Clarity: 2/5. Enjoyment: 2/5. Got stuck a bit.

## Confusion / friction points

None noted this run.

## Bugs or design flaws

None found this run.

## Verdict

This report is intentionally missing its exit interview block so the compiler must reject it.
`;

function pureReportAndSidecar(
  options: {
    proofCharacter?: string;
    continued?: boolean;
    earlyGoal?: boolean;
    contractVersion?: 1 | 2;
  } = {},
): {
  report: string;
  sidecar: string;
} {
  const proofCharacter = options.proofCharacter ?? "a";
  const continued = options.continued ?? false;
  const earlyGoal = options.earlyGoal ?? false;
  const contractVersion = options.contractVersion ?? 1;
  const firstDecisionProofHash = proofCharacter.repeat(64);
  const finalDecisionProofHash = continued
    ? String.fromCharCode(proofCharacter.charCodeAt(0) + 1).repeat(64)
    : firstDecisionProofHash;
  const acceptedDecisions = earlyGoal ? 12 : continued ? 80 : 40;
  const retentionHistory = earlyGoal
    ? [
        {
          sequence: 1,
          atDecision: 12,
          reasons: ["goal_completed"],
          checkpoint: null,
          choice: "end",
          decisionProofHash: finalDecisionProofHash,
        },
      ]
    : [
        {
          sequence: 1,
          atDecision: 40,
          reasons: ["checkpoint"],
          checkpoint: 40,
          choice: continued ? "continue" : "end",
          decisionProofHash: firstDecisionProofHash,
        },
        ...(continued
          ? [
              {
                sequence: 2,
                atDecision: 80,
                reasons: ["checkpoint"],
                checkpoint: 80,
                choice: "end",
                decisionProofHash: finalDecisionProofHash,
              },
            ]
          : []),
      ];
  const receiptPayload = {
    contractVersion,
    exitReason: "player_ended_at_choice",
    goalVersion: 1,
    goalId: "albany_local_lead",
    goalStatus: earlyGoal ? "completed" : "active",
    acceptedDecisions,
    exitReasons: [earlyGoal ? "goal_completed" : "checkpoint"],
    checkpoint: earlyGoal ? null : acceptedDecisions,
    decisionProofHash: finalDecisionProofHash,
    retentionHistory,
  };
  const receipt = { ...receiptPayload, receiptHash: hashState(receiptPayload) };
  const interview = {
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
    best_moment: "The game let me choose my own local lead.",
    worst_moment: "One transition felt slower than expected.",
    would_replay: true,
    verdict: "The player-facing goal and journey choice were both clear enough to continue.",
  };
  const report = `# Pure blind report

## Playthrough log

I played until the game presented its journey choice and chose to end.

## Did it work mechanically?

No mechanical failures.

## Understandable & fun?

Clarity 4/5. Enjoyment 4/5.

## Verdict

The player-facing goal and journey choice were both clear enough to continue.

\`\`\`json exit-interview
${JSON.stringify(interview, null, 2)}
\`\`\`
`;
  const sidecar = JSON.stringify({
    schema_version: 1,
    report_schema_version: 2,
    play_mode: "pure",
    start_surface: "fresh_overworld",
    retention_eligible: true,
    evidence_status: "verified",
    session_id: `o-${proofCharacter}`,
    receipt,
  });
  return { report, sidecar };
}

function structuralReport(): string {
  const interview = {
    schema_version: 2,
    play_mode: "structural",
    start_surface: "fresh_overworld",
    retention_eligible: false,
    structural_kind: "mock",
    clarity: 3,
    enjoyment: 3,
    goal_understood: true,
    got_stuck: false,
    confusions: [],
    bugs: [],
    best_moment: "The structural path completed deterministically.",
    worst_moment: "This was QA rather than a live player journey.",
    would_replay: true,
    verdict: "Useful structural QA evidence, but deliberately not live-player retention evidence.",
  };
  return `# Structural blind report

## Playthrough log

Ran the explicit structural mock path.

## Did it work mechanically?

No mechanical failures.

## Understandable & fun?

Clarity 3/5. Enjoyment 3/5.

## Verdict

Useful structural QA evidence, but deliberately not live-player retention evidence.

\`\`\`json exit-interview
${JSON.stringify(interview, null, 2)}
\`\`\`
`;
}

function buildCrawlFinding(overrides: Partial<CrawlFinding>): CrawlFinding {
  return CrawlFindingSchema.parse({
    code: "ORPHAN",
    severity: "S0",
    seed: 42,
    policy: "mixed",
    step: 0,
    location: { region: null, node: null, questId: null, sceneId: null },
    action: null,
    message: "fixture finding",
    stateHash: null,
    commit: "fixture",
    repro: { kind: "none", trace: null, minimized: false },
    ...overrides,
  });
}

let reportsDir: string;
let crawlFindingsPath: string;

beforeAll(() => {
  const root = mkdtempSync(join(tmpdir(), "feedback-compile-"));
  reportsDir = join(root, "reports");
  mkdirSync(reportsDir, { recursive: true });
  writeFileSync(join(reportsDir, "20260101T000000Z_overworld_seed1.md"), REPORT_A);
  writeFileSync(join(reportsDir, "20260101T000000Z_overworld_seed2.md"), REPORT_B);
  writeFileSync(join(reportsDir, "20260101T000000Z_overworld_seed3.md"), REPORT_C);

  const findings = [
    // Overlaps report A's bug: same node, near-identical wording ⇒ same
    // cluster, both sources present ⇒ BOTH_SOURCES_BONUS.
    buildCrawlFinding({
      code: "WORLD",
      severity: "S3",
      location: { region: null, node: "albany_city", questId: null, sceneId: null },
      message: "notice board confusing about quest start",
    }),
    // Coverage row — must be counted in inputs.crawl_findings but EXCLUDED
    // from clustering entirely.
    buildCrawlFinding({
      code: "ORPHAN",
      severity: "S0",
      location: { region: null, node: "bethlehem_town", questId: null, sceneId: null },
      message: "node never visited this run",
    }),
  ];
  crawlFindingsPath = join(root, "findings.jsonl");
  writeFileSync(crawlFindingsPath, findings.map((f) => JSON.stringify(f)).join("\n") + "\n");
});

describe("collectInputs", () => {
  it("excludes a rejected report from the verified count and interview list", () => {
    const result = collectInputs(process.cwd(), [reportsDir]);
    expect(result.verified).toBe(2);
    expect(result.rejected).toBe(1);
    expect(result.interviews).toHaveLength(2);
  });

  it("parses every crawl finding row, including ORPHAN coverage rows", () => {
    const result = collectInputs(process.cwd(), [crawlFindingsPath]);
    expect(result.crawlFindings).toHaveLength(2);
    expect(result.crawlFindingRefs).toHaveLength(2);
  });

  it("requires the matching verified sidecar before accepting a V2 pure report", () => {
    const dir = mkdtempSync(join(tmpdir(), "feedback-pure-sidecar-"));
    const base = join(dir, "20260101T000004Z_overworld_seed4");
    const fixture = pureReportAndSidecar();
    writeFileSync(`${base}.md`, fixture.report);
    // Simulate SIGKILL after the runner published durable JSONL but before its
    // final adjacent-sidecar commit. Raw evidence alone must not make the
    // discoverable markdown accepted or downgrade it to legacy evidence.
    writeFileSync(`${base}.evidence.jsonl`, '{"type":"journey_exit"}\n');

    expect(collectInputs(process.cwd(), [dir])).toMatchObject({ verified: 0, rejected: 1 });

    writeFileSync(`${base}.run.json`, pureReportAndSidecar({ proofCharacter: "c" }).sidecar);
    expect(collectInputs(process.cwd(), [dir])).toMatchObject({ verified: 0, rejected: 1 });

    writeFileSync(`${base}.run.json`, fixture.sidecar);
    expect(collectInputs(process.cwd(), [dir])).toMatchObject({ verified: 1, rejected: 0 });

    const staleTime = new Date("2000-01-01T00:00:00.000Z");
    utimesSync(`${base}.run.json`, staleTime, staleTime);
    expect(collectInputs(process.cwd(), [dir])).toMatchObject({ verified: 0, rejected: 1 });
  });
});

describe("compileFeedback", () => {
  it("merges the crawler+fleet overlap into one cluster with the BOTH_SOURCES_BONUS applied", () => {
    const outDir = mkdtempSync(join(tmpdir(), "feedback-out-"));
    const { file, jsonPath, mdPath } = compileFeedback({
      root: process.cwd(),
      inputs: [reportsDir, crawlFindingsPath],
      outDir,
      topK: 5,
      llmLabels: false,
      prevDir: null,
    });

    expect(file.inputs.verified_reports).toBe(2);
    expect(file.inputs.rejected_reports).toBe(1);
    expect(file.inputs.crawl_findings).toBe(2); // includes the ORPHAN coverage row

    const top = file.hotspots[0]!;
    expect(top.sources.slice().sort()).toEqual(["crawler", "fleet"]);
    // count=2 (one fleet issue, one crawler issue) × severity weight S3(8) × BOTH_SOURCES_BONUS(2).
    expect(top.score).toBe(2 * 8 * 2);
    expect(file.recommended_next_fix).not.toBeNull();
    expect(file.recommended_next_fix!.hotspot_id).toBe(top.id);

    // Self-validates under the strict schema (compileFeedback already does
    // this before writing; re-parse the written bytes as an end-to-end check).
    const writtenJson = JSON.parse(readFileSync(jsonPath, "utf8"));
    expect(HotspotsFileSchema.safeParse(writtenJson).success).toBe(true);

    const md = readFileSync(mdPath, "utf8");
    expect(md).toContain("Recommended next fix");
  });

  it("separates report modes and summarizes game choices from sidecar-gated pure exits", () => {
    const dir = mkdtempSync(join(tmpdir(), "feedback-retention-input-"));
    const continuedBase = join(dir, "20260101T000010Z_overworld_seed10");
    const endedBase = join(dir, "20260101T000011Z_overworld_seed11");
    const earlyGoalBase = join(dir, "20260101T000012Z_overworld_seed12");
    const rejectedBase = join(dir, "20260101T000013Z_overworld_seed13");
    const continued = pureReportAndSidecar({ proofCharacter: "a", continued: true });
    const ended = pureReportAndSidecar({ proofCharacter: "c" });
    const earlyGoal = pureReportAndSidecar({ proofCharacter: "e", earlyGoal: true });
    const rejected = pureReportAndSidecar({ proofCharacter: "f" });
    writeFileSync(`${continuedBase}.md`, continued.report);
    writeFileSync(`${continuedBase}.run.json`, continued.sidecar);
    writeFileSync(`${endedBase}.md`, ended.report);
    writeFileSync(`${endedBase}.run.json`, ended.sidecar);
    writeFileSync(`${earlyGoalBase}.md`, earlyGoal.report);
    writeFileSync(`${earlyGoalBase}.run.json`, earlyGoal.sidecar);
    writeFileSync(`${rejectedBase}.md`, rejected.report); // no sidecar: cannot become retention
    writeFileSync(join(dir, "20260101T000014Z_overworld_seed14.md"), structuralReport());
    writeFileSync(join(dir, "20260101T000015Z_overworld_seed15.md"), REPORT_B);

    const outDir = mkdtempSync(join(tmpdir(), "feedback-retention-out-"));
    const { file, evidence, retentionPath, mdPath } = compileFeedback({
      root: process.cwd(),
      inputs: [dir],
      outDir,
      topK: 5,
      llmLabels: false,
      prevDir: null,
    });

    expect(file.inputs).toMatchObject({ verified_reports: 5, rejected_reports: 1 });
    expect(evidence.report_modes).toEqual({ pure: 3, structural: 1, legacy_guided: 1 });
    expect(evidence.pure_retention).toMatchObject({
      eligible_reports: 3,
      contract_versions: [
        {
          contract_version: 1,
          eligible_reports: 3,
          continued_reports: 1,
          ended_at_first_choice_reports: 2,
          forced_character_death_reports: 0,
          accepted_decisions: { minimum: 12, maximum: 80, mean: 44 },
          choices: { continue: 1, end: 3 },
          choice_triggers: {
            checkpoint: { continue: 1, end: 2 },
            goal_completed: { continue: 0, end: 1 },
            checkpoint_and_goal_completed: { continue: 0, end: 0 },
          },
          checkpoints: [
            { decision: 40, continue: 1, end: 1 },
            { decision: 80, continue: 0, end: 1 },
          ],
          exit_reasons: [{ reason: "player_ended_at_choice", count: 3 }],
        },
      ],
    });

    const persisted = JSON.parse(readFileSync(retentionPath, "utf8"));
    expect(FeedbackEvidenceSummarySchema.parse(persisted)).toEqual(evidence);
    const markdown = readFileSync(mdPath, "utf8");
    expect(markdown).toContain("Verified report modes: pure 3, structural 1, legacy-guided 1");
    expect(markdown).toContain("### Journey contract v1");
    expect(markdown).toContain("Actual voluntary game choices: 1 continue, 3 end");
    expect(markdown).toContain(
      "Forced character-death terminals (excluded from voluntary retention): 0",
    );
    expect(markdown).toContain("`would_replay` is a post-exit attitude metric");
  });

  it("keeps historical v1 and current v2 retention curves separate", () => {
    const dir = mkdtempSync(join(tmpdir(), "feedback-contract-cohorts-input-"));
    const historicalBase = join(dir, "20260101T000020Z_overworld_seed20");
    const currentBase = join(dir, "20260101T000021Z_overworld_seed21");
    const historical = pureReportAndSidecar({
      proofCharacter: "1",
      continued: true,
      contractVersion: 1,
    });
    const current = pureReportAndSidecar({
      proofCharacter: "3",
      contractVersion: 2,
    });
    writeFileSync(`${historicalBase}.md`, historical.report);
    writeFileSync(`${historicalBase}.run.json`, historical.sidecar);
    writeFileSync(`${currentBase}.md`, current.report);
    writeFileSync(`${currentBase}.run.json`, current.sidecar);

    const outDir = mkdtempSync(join(tmpdir(), "feedback-contract-cohorts-out-"));
    const { evidence, retentionPath, mdPath } = compileFeedback({
      root: process.cwd(),
      inputs: [dir],
      outDir,
      topK: 5,
      llmLabels: false,
      prevDir: null,
    });

    expect(evidence.pure_retention).toEqual({
      eligible_reports: 2,
      contract_versions: [
        {
          contract_version: 1,
          eligible_reports: 1,
          continued_reports: 1,
          ended_at_first_choice_reports: 0,
          forced_character_death_reports: 0,
          accepted_decisions: { minimum: 80, maximum: 80, mean: 80 },
          choices: { continue: 1, end: 1 },
          choice_triggers: {
            checkpoint: { continue: 1, end: 1 },
            goal_completed: { continue: 0, end: 0 },
            checkpoint_and_goal_completed: { continue: 0, end: 0 },
          },
          checkpoints: [
            { decision: 40, continue: 1, end: 0 },
            { decision: 80, continue: 0, end: 1 },
          ],
          exit_reasons: [{ reason: "player_ended_at_choice", count: 1 }],
        },
        {
          contract_version: 2,
          eligible_reports: 1,
          continued_reports: 0,
          ended_at_first_choice_reports: 1,
          forced_character_death_reports: 0,
          accepted_decisions: { minimum: 40, maximum: 40, mean: 40 },
          choices: { continue: 0, end: 1 },
          choice_triggers: {
            checkpoint: { continue: 0, end: 1 },
            goal_completed: { continue: 0, end: 0 },
            checkpoint_and_goal_completed: { continue: 0, end: 0 },
          },
          checkpoints: [{ decision: 40, continue: 0, end: 1 }],
          exit_reasons: [{ reason: "player_ended_at_choice", count: 1 }],
        },
      ],
    });
    expect(evidence.pure_retention).not.toHaveProperty("accepted_decisions");
    expect(evidence.pure_retention).not.toHaveProperty("checkpoints");

    const persisted = JSON.parse(readFileSync(retentionPath, "utf8"));
    expect(FeedbackEvidenceSummarySchema.parse(persisted)).toEqual(evidence);
    const markdown = readFileSync(mdPath, "utf8");
    expect(markdown).toContain("### Journey contract v1");
    expect(markdown).toContain("### Journey contract v2");
    expect(markdown).toContain("incompatible contracts are never pooled");
  });

  it("separates forced death from voluntary attrition while preserving earlier choices", () => {
    const deathInterview = (continued: boolean) => {
      const checkpointProofHash = "c".repeat(64);
      const deathProofHash = "d".repeat(64);
      const acceptedDecisions = continued ? 53 : 23;
      const payload = {
        contractVersion: 3,
        exitReason: "player_ended_at_choice",
        goalVersion: 1,
        goalId: "albany_local_lead",
        goalText: "Find one local lead in Albany and see it through.",
        goalStatus: "active",
        goalCompletedAtDecision: null,
        completedGoals: [],
        acceptedDecisions,
        exitReasons: ["character_died"],
        checkpoint: null,
        decisionProofHash: deathProofHash,
        retentionHistory: [
          ...(continued
            ? [
                {
                  sequence: 1,
                  atDecision: 40,
                  reasons: ["checkpoint"],
                  checkpoint: 40,
                  goalVersion: null,
                  goalId: null,
                  choice: "continue",
                  decisionProofHash: checkpointProofHash,
                },
              ]
            : []),
          {
            sequence: continued ? 2 : 1,
            atDecision: acceptedDecisions,
            reasons: ["character_died"],
            checkpoint: null,
            goalVersion: null,
            goalId: null,
            choice: "end",
            decisionProofHash: deathProofHash,
          },
        ],
      } as const;
      return PureExitInterviewV2Schema.parse({
        schema_version: 2,
        play_mode: "pure",
        start_surface: "fresh_overworld",
        retention_eligible: true,
        journey_exit_receipt: { ...payload, receiptHash: hashState(payload) },
        clarity: 4,
        enjoyment: 3,
        goal_understood: true,
        got_stuck: false,
        confusions: [],
        bugs: [],
        best_moment: "The fatal consequence remained legible and final.",
        worst_moment: "The character died before the lead was resolved.",
        would_replay: true,
        verdict: "The run ended honestly and I would replay to try another approach.",
      });
    };

    const evidence = summarizeFeedbackEvidence([
      { ref: "death-before-choice.md", interview: deathInterview(false) },
      { ref: "continued-then-death.md", interview: deathInterview(true) },
    ]);
    expect(evidence.pure_retention.contract_versions[0]).toMatchObject({
      contract_version: 3,
      eligible_reports: 2,
      continued_reports: 1,
      ended_at_first_choice_reports: 0,
      forced_character_death_reports: 2,
      choices: { continue: 1, end: 0 },
      choice_triggers: {
        checkpoint: { continue: 1, end: 0 },
        goal_completed: { continue: 0, end: 0 },
        checkpoint_and_goal_completed: { continue: 0, end: 0 },
      },
      checkpoints: [{ decision: 40, continue: 1, end: 0 }],
    });
  });
});
