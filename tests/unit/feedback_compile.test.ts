import { describe, expect, it, beforeAll } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectInputs, compileFeedback } from "../../src/feedback/compile.js";
import { HotspotsFileSchema } from "../../src/feedback/schema.js";
import { CrawlFindingSchema, type CrawlFinding } from "../../src/crawl/findings.js";

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
});
