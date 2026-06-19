import { describe, expect, it } from "vitest";
import { verifyBlindReportText } from "../../scripts/verify-blind-report.js";

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

  it("accepts a report with the required blind-playtest sections and ratings", () => {
    const result = verifyBlindReportText(`
1. Playthrough log: I started the game, followed the investigation, and reached ending_found.
2. Did it work mechanically? No rejected actions or loops.
3. Understandable & fun? clarity 4/5 + enjoyment 4/5.
4. Confusion / friction points. None.
5. Bugs or design flaws. None.
6. Verdict: A real player would finish satisfied.
`);

    expect(result).toEqual({ ok: true });
  });

  it("does not reject ordinary playtest prose that says the story is still connecting", () => {
    const result = verifyBlindReportText(`
1. Playthrough log: I started the game and kept playing while the clues were still connecting.
2. Did it work mechanically? No rejected actions or loops.
3. Understandable & fun? clarity 4/5 + enjoyment 4/5.
4. Confusion / friction points. The middle clue chain took a moment.
5. Bugs or design flaws. None.
6. Verdict: A real player would finish satisfied.
`);

    expect(result).toEqual({ ok: true });
  });
});
