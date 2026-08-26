/**
 * Regression for the Bloodied Byre evacuation: after killing the two younger wolves,
 * a wounded courier may abandon the byre before committing to old grey's fight. The
 * exit must remain a deliberate, terminal non-combat choice rather than a hidden
 * alternate kill or a free way to erase a committed leader maneuver.
 */
import { describe, expect, it } from "vitest";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import { HP_VAR, enemyHpVar } from "../../src/rpg/schema.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";

const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("wolf_winter must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const rules = buildRpgRules(index);
const step = makeStep(rules);
const EVACUATION_ACTION_ID = "use_bloodied_byre_evacuation";

function woundedLeaderStand(hp = 12): GameState {
  const state = initStateForRpgPack(index, 517);
  state.current = "byre_mouth";
  state.visited.byre_mouth = true;
  state.flags.yearling_down = true;
  state.flags.flank_wolf_down = true;
  state.vars[HP_VAR] = hp;
  return state;
}

function actionIds(state: GameState): string[] {
  return enumerateRpgActions(index, state).map((option) => option.id);
}

describe("Bloodied Byre evacuation", () => {
  it("offers the terminal evacuation beside old grey's active combat at 12 HP", () => {
    const state = woundedLeaderStand();
    const action = enumerateRpgActions(index, state).find(
      (option) => option.id === EVACUATION_ACTION_ID,
    );

    expect(action).toMatchObject({
      id: EVACUATION_ACTION_ID,
      command: "evacuate bloodied byre evacuation",
      action: { type: "USE", target: "bloodied_byre_evacuation" },
    });
    expect(actionIds(state)).toContain("attack_grey_leader");

    const object = pack.objects.find((candidate) => candidate.id === "bloodied_byre_evacuation");
    expect(object?.description).toMatch(
      /save Cade and every rider.*grey leader remains.*two cattle are lost.*byre and outer defense are abandoned/is,
    );
  });

  it("ends without a leader counterattack and preserves the score", () => {
    const state = woundedLeaderStand();
    state.vars.score = 37;
    const leaderHp = state.vars[enemyHpVar("grey_leader")];
    const option = enumerateRpgActions(index, state).find(
      (candidate) => candidate.id === EVACUATION_ACTION_ID,
    );
    expect(option).toBeDefined();
    if (!option) throw new Error("evacuation action missing");

    const result = step(state, option.action);

    expect(result.ok, result.rejectionReason).toBe(true);
    expect(result.state).toMatchObject({
      ended: true,
      endingId: "ending_bloodied_byre_evacuated",
      flags: { bloodied_byre_evacuated: true },
    });
    expect(result.state.vars[HP_VAR]).toBe(12);
    expect(result.state.vars[enemyHpVar("grey_leader")]).toBe(leaderHp);
    expect(result.state.vars.score).toBe(37);
    expect(result.events.some((event) => event.type === "ending")).toBe(true);
    expect(result.events.some((event) => event.type === "move")).toBe(false);

    const ending = pack.endings.find((candidate) => candidate.id === result.state.endingId);
    expect(ending?.text).toMatch(
      /Cade and every rider escape.*grey leader keeps the byre.*two cattle are missing.*byre and outer defense are abandoned/is,
    );
  });

  it.each([
    ["the courier has 13 HP", (state: GameState) => (state.vars[HP_VAR] = 13)],
    ["the yearling still lives", (state: GameState) => (state.flags.yearling_down = false)],
    ["the flank-wolf still lives", (state: GameState) => (state.flags.flank_wolf_down = false)],
    ["old grey is down", (state: GameState) => (state.flags.leader_down = true)],
    ["old grey has been redirected", (state: GameState) => (state.flags.leader_redirected = true)],
    [
      "the lure strategy is committed",
      (state: GameState) => (state.flags.strategy_lure_committed = true),
    ],
    [
      "the drive strategy is committed",
      (state: GameState) => (state.flags.strategy_drive_committed = true),
    ],
    [
      "the fortify strategy is committed",
      (state: GameState) => (state.flags.strategy_fortify_committed = true),
    ],
    [
      "the crossbrace opening is committed",
      (state: GameState) => (state.flags.leader_stake_crossbraced = true),
    ],
    [
      "the crossbrace turn is committed",
      (state: GameState) => (state.flags.leader_turned_over_crossbrace = true),
    ],
    [
      "the split-guard opening is committed",
      (state: GameState) => (state.flags.leader_split_guard_set = true),
    ],
    ["the feint wait is committed", (state: GameState) => (state.flags.leader_waited_out = true)],
    [
      "the true-rush follow-through is committed",
      (state: GameState) => (state.flags.leader_true_rush_taken = true),
    ],
    ["the close opening is committed", (state: GameState) => (state.flags.leader_closed_on = true)],
    [
      "the recovery drive is committed",
      (state: GameState) => (state.flags.leader_driven_before_recovery = true),
    ],
  ])("hides the evacuation when %s", (_label, alter: (state: GameState) => void) => {
    const state = woundedLeaderStand();
    alter(state);

    expect(actionIds(state)).not.toContain(EVACUATION_ACTION_ID);
  });
});
