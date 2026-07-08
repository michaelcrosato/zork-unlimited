/**
 * Tide-Mill head-race reconnaissance: following the board to the race before
 * winning the tool-shed should feel like an intentional read of the fault, not
 * a dead checklist step.
 */
import { describe, it, expect } from "vitest";
import { createToolApi } from "../../src/mcp/tools.js";
import { COMPACT_EVENT_NARRATION_CHAR_LIMIT } from "../../src/mcp/compact_rpg_event.js";

const ROOT = process.cwd();

type ActionRow = { id: string; command: string };

function actionRows(api: ReturnType<typeof createToolApi>, sessionId: string): ActionRow[] {
  return api.list_legal_actions({
    session_id: sessionId,
    compact_actions: false,
  }).actions as ActionRow[];
}

function step(api: ReturnType<typeof createToolApi>, sessionId: string, actionId: string) {
  const result = api.step_action({
    session_id: sessionId,
    action_id: actionId,
    hide_graph: true,
    compact_observation: true,
    compact_events: true,
  });
  expect(result.ok, `expected ${actionId} to be legal`).toBe(true);
  return result;
}

function fightUntilYardClear(api: ReturnType<typeof createToolApi>, sessionId: string): void {
  for (
    let i = 0;
    i < 10 && actionRows(api, sessionId).some((action) => action.id === "attack_mill_saboteur");
    i += 1
  ) {
    step(api, sessionId, "attack_mill_saboteur");
  }
  expect(actionRows(api, sessionId).some((action) => action.id === "attack_mill_saboteur")).toBe(
    false,
  );
}

function narrationEvents(events: unknown[]): string[] {
  return events
    .filter((event): event is ["n", string] => Array.isArray(event) && event[0] === "n")
    .map((event) => event[1]);
}

describe("Tide-Mill head-race reconnaissance", () => {
  it("lets a pre-billhook player check the race, learn the shed tool, and keep score unchanged", () => {
    const api = createToolApi({ root: ROOT });
    const started = api.start_world_quest({
      world_quest_id: "tide_mill",
      seed: 1,
      hide_graph: true,
      compact_observation: true,
    });

    const board = step(api, started.session_id, "read_millboard");
    const boardText = narrationEvents(board.events).join(" ");
    expect(boardText).toMatch(/wheel runs when choked race is clear and brake-pawl free/i);
    expect(boardText).toMatch(/tools are in the shed/i);
    expect(boardText).not.toMatch(/clear choked race;\s*free brake-pawl/i);

    step(api, started.session_id, "go_north");
    const atRace = step(api, started.session_id, "go_west");
    expect(atRace.context.here).toEqual(["head_race", "The Head-Race"]);

    const beforeActions = actionRows(api, started.session_id);
    expect(beforeActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "use_choked_sluice", command: "check choked head-race" }),
      ]),
    );

    const tried = step(api, started.session_id, "use_choked_sluice");
    const text = narrationEvents(tried.events).join(" ");
    expect(text.length).toBeLessThanOrEqual(COMPACT_EVENT_NARRATION_CHAR_LIMIT);
    expect(text).not.toMatch(/\(\+\d+ chars\)/);
    expect(text).toMatch(/billhook work/i);
    expect(text).toMatch(/tool-shed/i);
    expect(text).toMatch(/yard knife-man/i);
    const raw = api.get_state({ session_id: started.session_id, include_state: true }) as {
      state: { flags: Record<string, boolean>; vars: Record<string, number> };
    };
    expect(raw.state.flags.sluice_clear).toBeUndefined();
    expect(raw.state.vars.score).toBe(5);

    const afterActions = actionRows(api, started.session_id);
    expect(afterActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "use_choked_sluice", command: "check choked head-race" }),
      ]),
    );

    for (const actionId of [
      "go_east",
      "go_south",
      "take_gaff_hook",
      "go_east",
      "take_oilskin_coat",
      "go_west",
      "go_north",
      "go_east",
    ]) {
      step(api, started.session_id, actionId);
    }
    fightUntilYardClear(api, started.session_id);
    for (const actionId of ["go_east", "take_billhook", "go_west", "go_west", "go_west"]) {
      step(api, started.session_id, actionId);
    }

    expect(actionRows(api, started.session_id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "use_billhook_on_choked_sluice",
          command: "cut choked head-race with billhook",
        }),
        expect.objectContaining({ id: "use_choked_sluice", command: "clear choked head-race" }),
      ]),
    );
  });
});
