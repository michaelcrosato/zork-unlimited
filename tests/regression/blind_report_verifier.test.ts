import { describe, expect, it } from "vitest";
import { verifyBlindReportText } from "../../scripts/verify-blind-report.js";

// A syntactically valid exit interview (section 7 of blind-tester/prompt.md).
// The verifier REQUIRES this block — prose sections alone no longer count, so
// the dev loop can rank feedback (sort by clarity, aggregate S3+ bugs) instead
// of re-reading markdown.
const INTERVIEW = `
\`\`\`json exit-interview
{
  "clarity": 4,
  "enjoyment": 4,
  "goal_understood": true,
  "got_stuck": false,
  "confusions": [],
  "bugs": [],
  "best_moment": "The board clue paying off at the mill gate.",
  "worst_moment": "One optional action felt noisy.",
  "would_replay": true,
  "verdict": "A real player would finish satisfied; the clue chain lands."
}
\`\`\`
`;

function completeReport(interview = INTERVIEW): string {
  return `
1. Playthrough log: I started the game, followed the investigation, and reached ending_found.
2. Did it work mechanically? No rejected actions or loops.
3. Understandable & fun? clarity 4/5 + enjoyment 4/5.
4. Confusion / friction points. None.
5. Bugs or design flaws. None.
6. Verdict: A real player would finish satisfied.
${interview}`;
}

function consistencyInterview(
  bugs: Array<{ where: string; severity: "S0" | "S1" | "S2" | "S3" | "S4"; note: string }>,
): string {
  return INTERVIEW.replace(
    '"clarity": 4,',
    [
      '"schema_version": 2,',
      '  "issue_consistency_version": 1,',
      '  "play_mode": "structural",',
      '  "start_surface": "direct_quest",',
      '  "retention_eligible": false,',
      '  "structural_kind": "smoke",',
      '  "clarity": 4,',
    ].join("\n  "),
  ).replace('"bugs": []', `"bugs": ${JSON.stringify(bugs)}`);
}

function issueReport(section: string, interview: string): string {
  return `
## Playthrough log
I followed the visible lead and ended at the offered journey choice.

## Did it work mechanically?
State and legal choices advanced normally.

## Understandable & fun?
Clarity 4/5 and enjoyment 4/5.

## Confusion / friction points
One surface deserved a closer look.

## Bugs or design flaws
${section}

## Verdict
A real player could finish and make an informed replay choice.
${interview}`;
}

describe("blind report verifier", () => {
  it("rejects Claude success payloads that only report missing AdventureForge MCP tools", () => {
    const result =
      verifyBlindReportText(`The \`adventureforge\` MCP server has failed to connect after multiple retries.
Its tools never became available in this session. I cannot play through the adventure
or produce a playtesting report without them.`);

    expect(result).toEqual({
      ok: false,
      reason: "report says AdventureForge MCP tools were unavailable",
    });
  });

  it("rejects reports where ToolSearch never finds the still-connecting server", () => {
    const result = verifyBlindReportText(`The adventureforge MCP server hasn't finished connecting.
ToolSearch was called multiple times and every query returns nothing. The tools are not yet available.`);

    expect(result).toEqual({
      ok: false,
      reason: "report says AdventureForge MCP tools were unavailable",
    });
  });

  it("rejects reports where the exact Codex ToolSearch selector returns zero tools", () => {
    const result = verifyBlindReportText(`
I could not start the playtest because the required deferred AdventureForge tools did not load.
I made the single allowed ToolSearch call exactly as requested, but it returned Found 0 tools,
so no mcp__adventureforge__* calls were available to start tide_mill.

1. Playthrough log: no route taken; no ending reached.
2. Did it work mechanically? The test harness failed before gameplay.
3. Understandable & fun? clarity 1/5 + enjoyment 1/5.
4. Confusion / friction points. Required game tools were unavailable.
5. Bugs or design flaws. S4: Required AdventureForge MCP tools were not exposed.
6. Verdict: A real player could not begin this run.
${INTERVIEW}`);

    expect(result).toEqual({
      ok: false,
      reason: "report says AdventureForge MCP tools were unavailable",
    });
  });

  it("accepts a report with the required sections, ratings, and exit interview", () => {
    const result = verifyBlindReportText(`
1. Playthrough log: I started the game, followed the investigation, and reached ending_found.
2. Did it work mechanically? No rejected actions or loops.
3. Understandable & fun? clarity 4/5 + enjoyment 4/5.
4. Confusion / friction points. None.
5. Bugs or design flaws. None.
6. Verdict: A real player would finish satisfied.
${INTERVIEW}`);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.interview.clarity).toBe(4);
      expect(result.interview.would_replay).toBe(true);
      expect(result.interview.bugs).toEqual([]);
    }
  });

  it("accepts either replay boolean and rejects a non-boolean placeholder", () => {
    const reportWith = (interview: string): string => `
1. Playthrough log: I started the game, followed the investigation, and reached ending_found.
2. Did it work mechanically? No rejected actions or loops.
3. Understandable & fun? clarity 4/5 + enjoyment 4/5.
4. Confusion / friction points. None.
5. Bugs or design flaws. None.
6. Verdict: A real player would finish satisfied.
${interview}`;

    for (const wouldReplay of [true, false]) {
      const interview = INTERVIEW.replace('"would_replay": true', `"would_replay": ${wouldReplay}`);
      const result = verifyBlindReportText(reportWith(interview));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.interview.would_replay).toBe(wouldReplay);
    }

    const unresolved = INTERVIEW.replace(
      '"would_replay": true',
      '"would_replay": "<JSON boolean chosen after play>"',
    );
    const result = verifyBlindReportText(reportWith(unresolved));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("would_replay");
  });

  it("accepts natural reverse rating prose from a completed blind playtest", () => {
    const result = verifyBlindReportText(`
1. Playthrough log: I started at the mill, followed the board, and reached ending_saved.
2. Did it work mechanically? Zero rejected actions. The MCP route worked cleanly.
3. Understandable & fun? Goal clarity was immediate and complete. **5/5 clarity.**
   The puzzle was compact and satisfying. **4/5 enjoyment**.
4. Confusion / friction points. One optional action felt noisy.
5. Bugs or design flaws. The optional action needed a clearer purpose.
6. Verdict: A real player would finish satisfied.
${INTERVIEW}`);

    expect(result.ok).toBe(true);
  });

  it("does not reject ordinary playtest prose that says the story is still connecting", () => {
    const result = verifyBlindReportText(`
1. Playthrough log: I started the game and kept playing while the clues were still connecting.
2. Did it work mechanically? No rejected actions or loops.
3. Understandable & fun? clarity 4/5 + enjoyment 4/5.
4. Confusion / friction points. The middle clue chain took a moment.
5. Bugs or design flaws. None.
6. Verdict: A real player would finish satisfied.
${INTERVIEW}`);

    expect(result.ok).toBe(true);
  });

  it("rejects a report with prose sections but no exit interview", () => {
    const result = verifyBlindReportText(`
1. Playthrough log: complete run to ending_found.
2. Did it work mechanically? Yes.
3. Understandable & fun? clarity 4/5 + enjoyment 4/5.
4. Confusion / friction points. None.
5. Bugs or design flaws. None.
6. Verdict: A real player would finish satisfied.
`);

    expect(result).toEqual({
      ok: false,
      reason: "missing exit interview (a ```json exit-interview fenced block is mandatory)",
    });
  });

  it("rejects an unclosed or nonterminal exit interview instead of accepting partial output", () => {
    const unclosed = INTERVIEW.replace(/\n```\n$/u, "\n");
    expect(verifyBlindReportText(completeReport(unclosed))).toEqual({
      ok: false,
      reason: "missing exit interview (a ```json exit-interview fenced block is mandatory)",
    });
    expect(verifyBlindReportText(`${completeReport()}trailing model prose`)).toEqual({
      ok: false,
      reason: "exit interview must be the final report block",
    });
  });

  it("rejects textual none entries in bugs; no observed bugs must be the literal empty array", () => {
    const textualNone = INTERVIEW.replace('"bugs": []', '"bugs": ["None observed."]');
    const result = verifyBlindReportText(completeReport(textualNone));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("bugs.0");
  });

  it("rejects an exit interview that fails the schema (fractional score)", () => {
    const bad = INTERVIEW.replace('"clarity": 4', '"clarity": 3.5');
    const result = verifyBlindReportText(`
1. Playthrough log: complete run.
2. Did it work mechanically? Yes.
3. Understandable & fun? clarity 4/5 + enjoyment 4/5.
4. Confusion / friction points. None.
5. Bugs or design flaws. None.
6. Verdict: A real player would finish satisfied.
${bad}`);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("clarity");
    }
  });

  it("rejects an exit interview with an unknown severity", () => {
    const bad = INTERVIEW.replace(
      '"bugs": []',
      '"bugs": [{ "where": "gate", "severity": "S9", "note": "impossible" }]',
    );
    const result = verifyBlindReportText(`
1. Playthrough log: complete run.
2. Did it work mechanically? Yes.
3. Understandable & fun? clarity 4/5 + enjoyment 4/5.
4. Confusion / friction points. None.
5. Bugs or design flaws. None.
6. Verdict: A real player would finish satisfied.
${bad}`);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("severity");
    }
  });

  it("keeps historical interviews readable unless certification explicitly requires the forward contract", () => {
    const historical = issueReport(
      "Station departure board — S2: support purpose was hard to scan.",
      INTERVIEW,
    );
    expect(verifyBlindReportText(historical).ok).toBe(true);

    const certification = verifyBlindReportText(historical, {
      requireStructuredIssueConsistency: true,
    });
    expect(certification).toEqual({
      ok: false,
      reason: "certification report requires issue_consistency_version 1",
    });
  });

  it("ignores negated, historical, range, and praise uses of severity labels", () => {
    const result = verifyBlindReportText(
      issueReport(
        [
          "The prior S2 Station issue is now fixed.",
          "S3-level resilience was excellent during the recovery.",
          "No S1-S4 findings remain.",
          "None encountered at S1+ severity.",
          "The small wording wrinkle was not an S1 concern.",
          "The map ambiguity was not S1.",
          "The transition isn't S1.",
          "The remaining friction is below S1.",
        ].join("\n\n"),
        consistencyInterview([]),
      ),
      { requireStructuredIssueConsistency: true },
    );
    expect(result.ok).toBe(true);
  });

  it("does not treat an annotated severity rubric in the section heading as findings", () => {
    const report = issueReport("None found.", consistencyInterview([])).replace(
      "## Bugs or design flaws",
      "## 5. Bugs or design flaws — concrete, each tagged by severity S0(cosmetic)–S4(blocking).",
    );
    expect(verifyBlindReportText(report, { requireStructuredIssueConsistency: true }).ok).toBe(
      true,
    );
  });

  it.each([
    "Not mechanically blocking, but S1: the Station board is opaque.",
    "No crash occurred, but this is an S2 clarity defect at Station.",
    "The prior S2 was fixed, but the current Station support is an S2 clarity defect.",
  ])("does not let nearby negation or history hide a current finding: %s", (finding) => {
    const result = verifyBlindReportText(issueReport(finding, consistencyInterview([])), {
      requireStructuredIssueConsistency: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("severity-bearing prose finding");
  });

  it.each([
    [
      "Confusion / friction points",
      "One surface deserved a closer look.",
      "Station setup — S2: the information density obscured the first decision.",
    ],
    [
      "Verdict",
      "A real player could finish and make an informed replay choice.",
      "The run was promising, but S1: Station support remained hard to scan.",
    ],
  ])("requires a structured bug for severity findings in %s", (_section, original, finding) => {
    const report = issueReport("None found.", consistencyInterview([])).replace(original, finding);
    const result = verifyBlindReportText(report, { requireStructuredIssueConsistency: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("severity-bearing prose finding");
  });

  it("does not treat severity-shaped fixture data in a fenced block as report prose", () => {
    const report = issueReport("None found.", consistencyInterview([])).replace(
      "I followed the visible lead and ended at the offered journey choice.",
      "I followed the visible lead and ended at the offered journey choice.\n\n```text\nS4 fixture: deliberately blocked\n```",
    );
    expect(verifyBlindReportText(report, { requireStructuredIssueConsistency: true }).ok).toBe(
      true,
    );
  });

  it("matches paraphrased issue identity while keeping severity exact", () => {
    const bugs = [
      {
        where: "Albany Station Quarter",
        severity: "S1" as const,
        note: "Field-kit and relief support purpose is difficult to scan on the departure board.",
      },
    ];
    expect(
      verifyBlindReportText(
        issueReport(
          "S1 — Station departure board: optional support rows obscure what each resource protects.",
          consistencyInterview(bugs),
        ),
        { requireStructuredIssueConsistency: true },
      ).ok,
    ).toBe(true);

    const wrongSeverity = [{ ...bugs[0]!, severity: "S0" as const }];
    const mismatch = verifyBlindReportText(
      issueReport(
        "S1 — Station departure board: optional support rows obscure what each resource protects.",
        consistencyInterview(wrongSeverity),
      ),
      { requireStructuredIssueConsistency: true },
    );
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.reason).toContain("severity-bearing prose finding");
  });

  it("requires distinct structured entries for duplicate prose severities", () => {
    const prose = [
      "Station departure board — S1: support purpose was hard to scan.",
      "Moor Trail checkpoint — S1: stale route guidance briefly displaced the active quest.",
    ].join("\n");
    const station = {
      where: "Albany Station departure board",
      severity: "S1" as const,
      note: "The support purpose was hard to scan.",
    };
    const trail = {
      where: "Moor Trail checkpoint",
      severity: "S1" as const,
      note: "Stale route guidance displaced the active quest.",
    };
    expect(
      verifyBlindReportText(issueReport(prose, consistencyInterview([station, trail])), {
        requireStructuredIssueConsistency: true,
      }).ok,
    ).toBe(true);

    const undercounted = verifyBlindReportText(
      issueReport(prose, consistencyInterview([station])),
      { requireStructuredIssueConsistency: true },
    );
    expect(undercounted.ok).toBe(false);
    if (!undercounted.ok) expect(undercounted.reason).toContain("distinct matching bugs[] entry");
  });

  it("does not let the same place and severity hide a different concern", () => {
    const mismatch = verifyBlindReportText(
      issueReport(
        "S1 — Station departure board: optional support rows obscure what each resource protects.",
        consistencyInterview([
          {
            where: "Albany Station Quarter",
            severity: "S1",
            note: "The view resets scroll position and hides the next tactical action.",
          },
        ]),
      ),
      { requireStructuredIssueConsistency: true },
    );
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.reason).toContain("severity-bearing prose finding");
  });

  it("accepts a strong concern identity when prose omits the structured place", () => {
    const result = verifyBlindReportText(
      issueReport(
        "S1 — Character setup was information-dense and slowed the first decision.",
        consistencyInterview([
          {
            where: "Albany opening",
            severity: "S1",
            note: "Character setup text was information-dense before the first choice.",
          },
        ]),
      ),
      { requireStructuredIssueConsistency: true },
    );
    expect(result.ok).toBe(true);
  });

  it("lets one structured bug cover repeated mentions of the same concern", () => {
    const report = issueReport(
      "Station departure board — S1: the support purpose remains opaque.",
      consistencyInterview([
        {
          where: "Albany Station Quarter",
          severity: "S1",
          note: "The support purpose is opaque on the departure board.",
        },
      ]),
    ).replace(
      "One surface deserved a closer look.",
      "S1 — Station support purpose required a second reading.",
    );
    expect(verifyBlindReportText(report, { requireStructuredIssueConsistency: true }).ok).toBe(
      true,
    );
  });

  it("does not merge different same-place concerns into one structured bug", () => {
    const report = issueReport(
      "Station departure board — S1: the support purpose remains opaque.",
      consistencyInterview([
        {
          where: "Albany Station Quarter",
          severity: "S1",
          note: "The support purpose is opaque on the departure board.",
        },
      ]),
    ).replace(
      "One surface deserved a closer look.",
      "S1 — Station scroll reset hid the next tactical action.",
    );
    const result = verifyBlindReportText(report, { requireStructuredIssueConsistency: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("distinct matching bugs[] entry");
  });

  it("does not use generic clarity language to merge different same-place concerns", () => {
    const report = issueReport(
      "Station departure board — S1: the support panel was hard to scan.",
      consistencyInterview([
        {
          where: "Albany Station Quarter",
          severity: "S1",
          note: "The support panel was hard to scan on the departure board.",
        },
      ]),
    ).replace(
      "One surface deserved a closer look.",
      "Station — S1: the travel schedule was hard to scan.",
    );
    const result = verifyBlindReportText(report, { requireStructuredIssueConsistency: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("distinct matching bugs[] entry");
  });
});
