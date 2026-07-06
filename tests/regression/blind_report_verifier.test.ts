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
});
