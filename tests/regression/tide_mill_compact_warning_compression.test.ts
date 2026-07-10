/**
 * Tide-Mill compact warning compression: blind runs read only compact MCP
 * surfaces, so the board order and yard fight warning must not be cut off.
 */
import { describe, it, expect } from "vitest";
import { createToolApi } from "../../src/mcp/tools.js";
import { COMPACT_DESCRIPTION_CHAR_LIMIT } from "../../src/mcp/compact_rpg_observation.js";
import { COMPACT_EVENT_NARRATION_CHAR_LIMIT } from "../../src/mcp/compact_rpg_event.js";

const ROOT = process.cwd();

function narrationEvents(events: unknown[]): string[] {
  return events
    .filter((event): event is ["n", string] => Array.isArray(event) && event[0] === "n")
    .map((event) => event[1]);
}

describe("Tide-Mill compact warning compression", () => {
  it("keeps the full millboard order inside the compact read event", () => {
    const api = createToolApi({ root: ROOT });
    const started = api.start_world_quest({
      world_quest_id: "tide_mill",
      seed: 181,
      hide_graph: true,
      compact_observation: true,
    });

    const read = api.step_action({
      session_id: started.session_id,
      action_id: "read_millboard",
      hide_graph: true,
      compact_observation: true,
      compact_events: true,
    });
    const text = narrationEvents(read.events)[0] ?? "";

    expect(text.length).toBeLessThanOrEqual(COMPACT_EVENT_NARRATION_CHAR_LIMIT);
    expect(text).not.toMatch(/\(\+\d+ chars\)/);
    expect(text).toMatch(/wheel runs when/i);
    expect(text).toMatch(/choked race is clear/i);
    expect(text).toMatch(/brake-pawl free/i);
    expect(text).toMatch(/tools are in the shed/i);
    expect(text).not.toMatch(/clear choked race;\s*free brake-pawl/i);
    expect(text).not.toMatch(/billhook/i);
    expect(text).not.toMatch(/crow-bar/i);
    expect(text).toMatch(/gaff-pole and oilskin/i);
    expect(text).toMatch(/wind the sea-gate open/i);
    expect(text).toMatch(/never lever the rotten flood-hatch/i);
    expect(text).toMatch(/takings stay in the nook/i);
  });

  it("keeps the yard fight warning inside compact room text", () => {
    const api = createToolApi({ root: ROOT });
    const started = api.start_world_quest({
      world_quest_id: "tide_mill",
      seed: 181,
      hide_graph: true,
      compact_observation: true,
    });

    api.step_action({
      session_id: started.session_id,
      action_id: "take_gaff_hook",
      hide_graph: true,
      compact_observation: true,
      compact_events: true,
    });
    api.step_action({
      session_id: started.session_id,
      action_id: "go_north",
      hide_graph: true,
      compact_observation: true,
      compact_events: true,
    });
    const result = api.step_action({
      session_id: started.session_id,
      action_id: "go_east",
      hide_graph: true,
      compact_observation: true,
      compact_events: true,
    });

    expect(result.context.here).toEqual(["mill_yard", "The Mill-Yard"]);
    expect(result.context.text.length).toBeLessThanOrEqual(COMPACT_DESCRIPTION_CHAR_LIMIT);
    expect(result.context.text).not.toMatch(/\(\+\d+ chars\)/);
    expect(result.context.text).toMatch(/wheel-room west/i);
    expect(result.context.text).toMatch(/tool-shed east/i);
    expect(result.context.text).toMatch(/gaff-pole plus oilskin/i);
    expect(result.context.text).toMatch(/bare hands make it a gamble/i);
  });
});
