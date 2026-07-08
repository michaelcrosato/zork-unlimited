/**
 * Regression for the Tide-Mill seed-157/159 blind pattern: players cleanly won
 * without noticing the new takings fork. The post-gate compact view must expose
 * the coin-bag as a late optional account before the final stair.
 */
import { describe, it, expect } from "vitest";
import { createToolApi } from "../../src/mcp/tools.js";
import { COMPACT_DESCRIPTION_CHAR_LIMIT } from "../../src/mcp/compact_rpg_observation.js";

const ROOT = process.cwd();

type ToolApi = ReturnType<typeof createToolApi>;

function actionIds(api: ToolApi, sessionId: string): string[] {
  return (
    api.list_legal_actions({ session_id: sessionId, compact_actions: true }).actions as (
      | string
      | { id: string }
    )[]
  ).map((action) => (typeof action === "string" ? action : action.id));
}

function step(api: ToolApi, sessionId: string, actionId: string) {
  const result = api.step_action({
    session_id: sessionId,
    action_id: actionId,
    hide_graph: true,
    compact_observation: true,
  });
  expect(result.ok, `expected ${actionId} to be legal`).toBe(true);
  return result;
}

function fightUntilYardClear(api: ToolApi, sessionId: string): void {
  for (let i = 0; i < 10 && actionIds(api, sessionId).includes("attack_mill_saboteur"); i += 1) {
    step(api, sessionId, "attack_mill_saboteur");
  }
  expect(actionIds(api, sessionId)).not.toContain("attack_mill_saboteur");
}

function raiseGate(api: ToolApi, sessionId: string) {
  for (const actionId of [
    "talk_ives",
    "ask_race",
    "ask_race_to_pawl",
    "ask_pawl_to_yard",
    "ask_yard_leave",
    "read_millboard",
    "take_gaff_hook",
    "go_east",
    "take_oilskin_coat",
    "go_west",
    "go_north",
    "take_crank_handle",
    "go_east",
  ]) {
    step(api, sessionId, actionId);
  }

  fightUntilYardClear(api, sessionId);

  step(api, sessionId, "go_east");
  for (const actionId of [
    "take_billhook",
    "take_crow_bar",
    "go_west",
    "go_west",
    "go_west",
    "use_choked_sluice",
    "go_east",
    "use_crow_bar_on_brake_pawl",
  ]) {
    step(api, sessionId, actionId);
  }

  return step(api, sessionId, "use_crank_handle_on_sea_winch");
}

describe("Tide-Mill compact post-gate view exposes the takings fork", () => {
  it("names the coin-bag before the clean final stair", () => {
    const api = createToolApi({ root: ROOT });
    const started = api.start_world_quest({
      world_quest_id: "tide_mill",
      seed: 1,
      hide_graph: true,
      compact_observation: true,
    });

    const gateUp = raiseGate(api, started.session_id);

    expect(gateUp.context.here).toEqual(["wheel_room", "The Wheel-Room"]);
    expect(gateUp.context.text.length).toBeLessThanOrEqual(COMPACT_DESCRIPTION_CHAR_LIMIT);
    expect(gateUp.context.text).not.toMatch(/\.\.\.\(\+\d+ chars\)$/);
    expect(gateUp.context.text).toMatch(/down=open staith/i);
    expect(gateUp.context.text).toMatch(/south=mill-floor\/counting-nook/i);
    expect(gateUp.context.text).toMatch(/down saves the boat now/i);
    expect(gateUp.context.text).toMatch(/south is a detour/i);
    expect(gateUp.context.text).toMatch(/tempts you/i);
    expect(gateUp.context.text).toMatch(/Ives's coin-bag/i);
    expect(gateUp.context.text).not.toMatch(/last account/i);
    expect(gateUp.context.exits).toEqual(expect.arrayContaining(["down", "east", "south", "west"]));

    const millHouse = step(api, started.session_id, "go_south");
    expect(millHouse.context.text).toMatch(/counting-nook if Ives's takings tempt you/i);
    const nook = step(api, started.session_id, "go_east");
    expect(nook.context.text).toMatch(/coin-bag.*choice/i);

    const actions = api.list_legal_actions({
      session_id: started.session_id,
      compact_actions: false,
    }).actions as { id: string; command?: string }[];
    expect(actions.find((action) => action.id === "use_coin_bag")?.command).toMatch(
      /pocket .*coin-bag/i,
    );
  });
});
