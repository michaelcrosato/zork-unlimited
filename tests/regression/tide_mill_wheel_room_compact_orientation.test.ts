/**
 * Regression for the Tide-Mill seed-101 blind finding: compact Wheel-Room prose
 * truncated the exit-orientation sentence, so the player had to probe directions.
 */
import { describe, it, expect } from "vitest";
import { createToolApi } from "../../src/mcp/tools.js";
import { COMPACT_DESCRIPTION_CHAR_LIMIT } from "../../src/mcp/compact_rpg_observation.js";

const ROOT = process.cwd();

describe("Tide-Mill Wheel-Room compact prose keeps the direction map visible", () => {
  it("names west/east/south/down orientation before compact truncation", () => {
    const api = createToolApi({ root: ROOT });
    const started = api.start_world_quest({
      world_quest_id: "tide_mill",
      seed: 101,
      hide_graph: true,
      compact_observation: true,
    });

    const moved = api.step_action({
      session_id: started.session_id,
      action_id: "go_north",
      hide_graph: true,
      compact_observation: true,
    });

    expect(moved.context.here).toEqual(["wheel_room", "The Wheel-Room"]);
    expect(moved.context.text.length).toBeLessThanOrEqual(COMPACT_DESCRIPTION_CHAR_LIMIT);
    expect(moved.context.text).not.toMatch(/\.\.\.\(\+\d+ chars\)$/);
    expect(moved.context.text).toMatch(/west=head-race/i);
    expect(moved.context.text).toMatch(/east=yard\/tool-shed/i);
    expect(moved.context.text).toMatch(/south=mill-floor/i);
    expect(moved.context.text).toMatch(/down=gated staith/i);
    expect(moved.context.exits).toEqual(expect.arrayContaining(["east", "south", "west"]));
    expect(moved.context.blocked).toEqual(
      expect.arrayContaining([["down", expect.stringMatching(/sea-gate/i)]]),
    );
  });
});
