import { describe, expect, it } from "vitest";

import { makeStep } from "../../src/core/engine.js";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";

const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("Wolf-Winter must compile");
const index = indexRpgPack(loaded.compiled.pack);

function worstRng(): Rng {
  return { next: () => 0, int: (min) => min };
}

function bestRng(): Rng {
  return { next: () => 0.999999, int: (_min, max) => max };
}

function ids(state: GameState): string[] {
  return enumerateRpgActions(index, state).map((option) => option.id);
}

function act(state: GameState, id: string, rng: Rng = worstRng()): GameState {
  const option = enumerateRpgActions(index, state).find((candidate) => candidate.id === id);
  expect(option, `${id} must be legal; choices: ${ids(state).join(", ")}`).toBeDefined();
  if (!option) throw new Error(`Missing ${id}`);
  const result = makeStep(buildRpgRules(index, () => rng))(state, option.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  return result.state;
}

function atByre(
  flags: Record<string, boolean>,
  inventory: string[] = [],
  vars: Record<string, number> = {},
): GameState {
  const state = initStateForRpgPack(index, 4001);
  state.current = "paling_gap";
  Object.assign(state.flags, flags);
  state.inventory.push(...inventory);
  Object.assign(state.vars, vars);
  return state;
}

function pair<T>(
  make: (delayed: boolean) => GameState,
  actionId: string,
  metric: (state: GameState) => T,
): [T, T] {
  const onTime = make(false);
  const delayed = make(true);
  expect(ids(delayed)).toEqual(ids(onTime));
  return [metric(act(onTime, actionId)), metric(act(delayed, actionId))];
}

describe("Wolf-Winter dispatch opening counterfactual", () => {
  it("adds exactly one failure consequence while preserving first-action choice sets and recoveries", () => {
    const [lureOnTime, lureDelayed] = pair(
      (delayed) =>
        atByre(
          { strategy_lure_committed: true, ...(delayed ? { dispatch_opening_delayed: true } : {}) },
          ["winter_feed_sack"],
        ),
      "use_winter_feed_sack_on_downwind_feed_line",
      (state) => state.vars.cattle_alarm,
    );
    expect([lureOnTime, lureDelayed]).toEqual([2, 3]);

    let lureRecovery = atByre({ strategy_lure_committed: true, dispatch_opening_delayed: true }, [
      "winter_feed_sack",
    ]);
    lureRecovery = act(lureRecovery, "use_winter_feed_sack_on_downwind_feed_line");
    lureRecovery = act(lureRecovery, "wedge_paling_rail");
    expect(ids(lureRecovery)).toContain("bind_paling_rail");
    lureRecovery = act(lureRecovery, "bind_paling_rail");
    expect(lureRecovery.inventory).toContain("split_rail_guard");

    const [driveOnTime, driveDelayed] = pair(
      (delayed) =>
        atByre(
          {
            strategy_drive_committed: true,
            drive_combat_withheld: true,
            ...(delayed ? { dispatch_opening_delayed: true } : {}),
          },
          ["drive_signal_rope_kit"],
          { drive_kit_charges: 2 },
        ),
      "use_drive_signal_rope_kit_on_drive_breach_signal",
      (state) => state.vars.cattle_alarm,
    );
    expect([driveOnTime, driveDelayed]).toEqual([1, 2]);

    let driveRecovery = atByre(
      {
        strategy_drive_committed: true,
        drive_combat_withheld: true,
        dispatch_opening_delayed: true,
      },
      ["drive_signal_rope_kit"],
      { drive_kit_charges: 2 },
    );
    driveRecovery = act(driveRecovery, "use_drive_signal_rope_kit_on_drive_breach_signal");
    expect(ids(driveRecovery)).toContain("use_drive_hurdle_recovery");

    const [fortifyOnTime, fortifyDelayed] = pair(
      (delayed) =>
        atByre(
          {
            strategy_fortify_committed: true,
            fortify_combat_withheld: true,
            strategy_combat_withheld: true,
            fortify_cade_terms_accepted: true,
            ...(delayed ? { dispatch_opening_delayed: true } : {}),
          },
          ["cade_household_shutters"],
        ),
      "use_cade_household_shutters_on_fortify_outer_seal",
      (state) => state.vars.fortification_pressure,
    );
    expect([fortifyOnTime, fortifyDelayed]).toEqual([2, 3]);

    let fortifyRecovery = atByre(
      {
        strategy_fortify_committed: true,
        fortify_combat_withheld: true,
        strategy_combat_withheld: true,
        fortify_cade_terms_accepted: true,
        dispatch_opening_delayed: true,
      },
      ["cade_household_shutters"],
    );
    fortifyRecovery = act(fortifyRecovery, "use_cade_household_shutters_on_fortify_outer_seal");
    expect(ids(fortifyRecovery)).toContain("use_cade_failed_seal_help");

    for (const [works, actionId] of [
      [false, "wedge_paling_rail"],
      [true, "set_paling_rail"],
    ] as const) {
      const [onTime, delayed] = pair(
        (isDelayed) =>
          atByre({
            ...(works ? { works_fortification_prepared: true } : {}),
            ...(isDelayed ? { dispatch_opening_delayed: true } : {}),
          }),
        actionId,
        (state) => state.vars.cattle_alarm,
      );
      expect([onTime, delayed]).toEqual([0, 1]);
    }

    const successOnTime = act(
      atByre({ strategy_lure_committed: true }, ["winter_feed_sack"]),
      "use_winter_feed_sack_on_downwind_feed_line",
      bestRng(),
    );
    const successDelayed = act(
      atByre({ strategy_lure_committed: true, dispatch_opening_delayed: true }, [
        "winter_feed_sack",
      ]),
      "use_winter_feed_sack_on_downwind_feed_line",
      bestRng(),
    );
    expect(successDelayed.vars).toEqual(successOnTime.vars);
    expect(successDelayed.flags).toEqual({
      ...successOnTime.flags,
      dispatch_opening_delayed: true,
    });
  });
});
