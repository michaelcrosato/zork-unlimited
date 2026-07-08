/**
 * Regression for the Tide-Mill seed-113 blind finding: compact opening prose could
 * leave east=counting-nook versus yard/tool-shed orientation briefly ambiguous.
 */
import { describe, it, expect } from "vitest";
import { createToolApi } from "../../src/mcp/tools.js";
import { COMPACT_DESCRIPTION_CHAR_LIMIT } from "../../src/mcp/compact_rpg_observation.js";

const ROOT = process.cwd();

describe("Tide-Mill Mill-House compact prose keeps the opening map visible", () => {
  it("names north-to-yard path and east counting-nook before compact truncation", () => {
    const api = createToolApi({ root: ROOT });
    const started = api.start_world_quest({
      world_quest_id: "tide_mill",
      seed: 113,
      hide_graph: true,
      compact_observation: true,
    });

    expect(started.context.here).toEqual(["mill_house", "The Mill-House"]);
    expect(started.context.text.length).toBeLessThanOrEqual(COMPACT_DESCRIPTION_CHAR_LIMIT);
    expect(started.context.text).not.toMatch(/\.\.\.\(\+\d+ chars\)$/);
    expect(started.context.text).toMatch(/north=wheel-room/i);
    expect(started.context.text).toMatch(/yard\/tool-shed/i);
    expect(started.context.text).toMatch(/east=counting-nook/i);
    expect(started.context.text).toMatch(/boat is caught/i);
    expect(started.context.exits).toEqual(expect.arrayContaining(["east", "north"]));
    expect(started.context.objects).toEqual(expect.arrayContaining(["millboard", "gaff_hook"]));
    expect(started.context.npcs).toEqual(expect.arrayContaining(["ives"]));
  });
});
