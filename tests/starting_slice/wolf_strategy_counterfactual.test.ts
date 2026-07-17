/**
 * SS-F09 counterfactual proof: Wolf-Winter now supports a genuinely noncombat
 * solution family. Redirected wolves remain alive at full implicit HP, legal
 * combat disappears one encounter at a time, authored cattle pressure changes
 * the outcome, and a failed first cast advances into a resource-cost recovery
 * instead of offering an unchanged reroll.
 */
import { describe, expect, it } from "vitest";

import { makeStep } from "../../src/core/engine.js";
import type { Rng } from "../../src/core/rng.js";
import { compactRpgObservation } from "../../src/mcp/compact_rpg_observation.js";
import { enemyHpVar } from "../../src/rpg/schema.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("wolf_winter must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);

function fixedRng(face: "best" | "worst"): Rng {
  return {
    next: () => (face === "best" ? 0.999999 : 0),
    int: (min: number, max: number) => (face === "best" ? max : min),
  };
}

type Route = Readonly<{
  state: GameState;
  actions: readonly string[];
  observations: readonly ReturnType<typeof buildRpgObservation>[];
}>;

function lureRoute(opening: "clean" | "fouled" | "fouled_braced" | "hybrid"): Route {
  let state = initStateForRpgPack(
    index,
    opening === "clean"
      ? 901
      : opening === "fouled"
        ? 902
        : opening === "fouled_braced"
          ? 904
          : 903,
  );
  const actions: string[] = [];
  const observations = [buildRpgObservation(index, state)];
  const act = (id: string): void => {
    const option = enumerateRpgActions(index, state).find((candidate) => candidate.id === id);
    expect(
      option,
      `expected ${id} in ${state.current}; available: ${enumerateRpgActions(index, state)
        .map((candidate) => candidate.id)
        .join(", ")}`,
    ).toBeDefined();
    if (!option) throw new Error(`missing ${id}`);
    const face =
      opening === "clean" ||
      (opening === "fouled_braced" && id === "use_paling_rail" && state.flags.lure_trail_fouled)
        ? "best"
        : "worst";
    const step = makeStep(buildRpgRules(index, () => fixedRng(face)));
    const result = step(state, option.action);
    expect(result.ok, result.rejectionReason).toBe(true);
    state = result.state;
    actions.push(id);
    observations.push(buildRpgObservation(index, state));
  };

  act("go_north");
  act("talk_houndsman");
  act("ask_lure");
  expect(state.flags.strategy_lure_committed).not.toBe(true);
  const commitment = enumerateRpgActions(index, state).find(
    (option) => option.id === "ask_commit_lure",
  );
  expect(commitment?.command).toMatch(/commit[^]*finite feed-and-hounds line/i);
  act("ask_commit_lure");
  expect(state.flags.strategy_lure_committed).toBe(true);
  act("ask_leave");
  act("go_west");
  act("take_winter_feed_sack");
  act("go_east");
  act("go_north");
  act("use_winter_feed_sack_on_downwind_feed_line");

  if (opening !== "clean") {
    expect(state.flags.lure_trail_fouled).toBe(true);
    expect(state.vars.cattle_alarm).toBe(2);
    expect(enumerateRpgActions(index, state).map((option) => option.id)).not.toContain(
      "use_winter_feed_sack_on_downwind_feed_line",
    );
    if (opening === "fouled") {
      act("use_paling_rail"); // worst field roll: the rail splits
      act("use_paling_rail"); // deterministic salvage: bind the split guard
      act("use_split_rail_guard_on_downwind_feed_line");
    } else if (opening === "fouled_braced") {
      act("use_paling_rail"); // best rail roll: the breach braces
      act("use_paling_rail"); // deterministic scent-pen: redirect alive
    } else {
      act("maneuver_yearling_wolf_commit_hybrid_strike");
      while (!state.flags.yearling_down) act("attack_yearling_wolf");
    }
  }

  expect(
    state.flags.yearling_redirected || state.flags.yearling_down,
    "the failed opening must advance by bound-rail recovery or one bounded fight",
  ).toBe(true);
  expect(buildRpgObservation(index, state).enemies_present).toEqual([]);
  const breach = buildRpgObservation(index, state);
  expect(breach.description).toMatch(/ground[^]*north[^]*south[^]*west[^]*up[^]*loft/i);
  expect(breach.description).not.toMatch(/route north is clear|byre runs north|byre north/i);
  expect(breach.available_actions.map((option) => option.id)).not.toContain("go_north");
  expect(breach.blocked_exits).toContainEqual({
    direction: "north",
    message:
      "Settle the yearling or finish the outer seal. On the feed plan, return south, then west and up for the loft cast before the ground way opens.",
  });
  act("go_south");
  const yard = buildRpgObservation(index, state);
  expect(yard.description).toMatch(/settled[^]*west[^]*store[^]*up[^]*loft/i);
  expect(yard.description).not.toMatch(/young wolf is through|flank-wolf holds/i);
  expect(yard.available_actions.map((option) => option.id)).toContain("go_west");
  expect(yard.available_actions.map((option) => option.id)).not.toContain("go_north");
  expect(yard.blocked_exits).toContainEqual({
    direction: "north",
    message:
      "Resolve the field line before crossing: speak with anyone holding the gate or carry committed feed, rig, shutters, or seals. After lure's first beat, go west and up.",
  });
  act("go_west");
  act("go_up");
  act("use_winter_feed_sack_on_loft_hatch");
  expect(state.flags.flank_redirected).toBe(true);
  act("go_east");
  expect(buildRpgObservation(index, state).enemies_present).toEqual([]);
  act("go_north");
  act("use_winter_feed_sack_on_outer_scent_gate");
  expect(state.flags.leader_redirected).toBe(true);
  act("go_north");

  return { state, actions, observations };
}

describe("SS-F09 — pressure-backed Wolf-Winter strategy counterfactual", () => {
  it("redirects all three living wolves without selecting combat and exports a clean nondeath identity", () => {
    const route = lureRoute("clean");

    expect(route.state).toMatchObject({
      ended: true,
      endingId: "ending_pack_diverted",
      vars: { cattle_alarm: 3 },
    });
    expect(route.actions.some((id) => id.startsWith("attack_") || id.startsWith("maneuver_"))).toBe(
      false,
    );
    expect(route.state.flags).toMatchObject({
      yearling_redirected: true,
      flank_redirected: true,
      leader_redirected: true,
      pack_diverted: true,
    });
    expect(route.state.flags.yearling_down).not.toBe(true);
    expect(route.state.flags.flank_wolf_down).not.toBe(true);
    expect(route.state.flags.leader_down).not.toBe(true);
    for (const enemy of pack.enemies) {
      expect(route.state.vars[enemyHpVar(enemy.id)]).toBeUndefined();
    }
    expect(route.state.inventory).not.toContain("winter_feed_sack");

    const ending = buildRpgObservation(index, route.state);
    expect(ending.ending).toMatchObject({ title: "The Pack Diverted Alive" });
    expect(ending.ending?.text).toMatch(/cattle whole[^]*all three wolves alive/i);
  });

  it("makes a fouled opening fail forward through spent guard wood into visible cattle loss", () => {
    const clean = lureRoute("clean");
    const fouled = lureRoute("fouled");

    expect(fouled.state).toMatchObject({
      ended: true,
      endingId: "ending_pack_diverted_cattle_scattered",
      vars: { cattle_alarm: 4 },
    });
    expect(fouled.actions).toContain("use_split_rail_guard_on_downwind_feed_line");
    expect(
      fouled.actions.some((id) => id.startsWith("attack_") || id.startsWith("maneuver_")),
    ).toBe(false);
    expect(fouled.state.inventory).not.toContain("split_rail_guard");
    expect(buildRpgObservation(index, fouled.state).ending?.text).toMatch(
      /every wolf alive[^]*two animals are missing/i,
    );

    expect(clean.state.vars.score).toBe(fouled.state.vars.score);
    expect(clean.state.endingId).not.toBe(fouled.state.endingId);
  });

  it("makes a successful brace a living failed-lure recovery instead of a forced kill", () => {
    const split = lureRoute("fouled");
    const braced = lureRoute("fouled_braced");

    expect(braced.actions.filter((id) => id === "use_paling_rail")).toHaveLength(2);
    expect(braced.actions).not.toContain("use_split_rail_guard_on_downwind_feed_line");
    expect(
      braced.actions.some((id) => id.startsWith("attack_") || id.startsWith("maneuver_")),
    ).toBe(false);
    expect(braced.state.flags).toMatchObject({
      lure_trail_fouled: true,
      breach_braced: true,
      yearling_redirected: true,
      yearling_redirected_with_braced_rail: true,
      pack_diverted: true,
    });
    expect(braced.state.flags.yearling_down).not.toBe(true);
    expect(braced.state.flags.yearling_redirected_with_split_guard).not.toBe(true);
    expect(braced.state.endingId).toBe(split.state.endingId);
    expect(braced.state.questStage).toEqual(split.state.questStage);
    expect(braced.state.questStage.the_watch).toBe("byre_redirected");
    expect(braced.state.vars.cattle_alarm).toBe(split.state.vars.cattle_alarm);
    expect(braced.state.vars.score).toBe(split.state.vars.score);
  });

  it("keeps the bounded combat recovery as a truthful hybrid identity", () => {
    const hybrid = lureRoute("hybrid");

    expect(hybrid.state).toMatchObject({
      ended: true,
      endingId: "ending_pack_diverted_after_blood",
      vars: { cattle_alarm: 4 },
      flags: {
        yearling_down: true,
        flank_redirected: true,
        leader_redirected: true,
      },
    });
    expect(hybrid.state.flags.yearling_redirected).not.toBe(true);
    expect(hybrid.state.flags.flank_wolf_down).not.toBe(true);
    expect(hybrid.state.flags.leader_down).not.toBe(true);
    expect(hybrid.actions.some((id) => id.startsWith("attack_"))).toBe(true);
    expect(hybrid.actions).toContain("use_winter_feed_sack_on_loft_hatch");
    expect(buildRpgObservation(index, hybrid.state).ending?.text).toMatch(
      /yearling dead[^]*flank-wolf and grey leader alive[^]*two animals are still missing/i,
    );
    expect(buildRpgObservation(index, hybrid.state).ending?.text).not.toMatch(
      /all three wolves alive/i,
    );
  });

  it("shows exact current and next pressure thresholds in full and compact observations", () => {
    const route = lureRoute("clean");
    const restless = route.observations.find(
      (observation) => observation.pressure_tracks?.[0]?.band.label === "Restless",
    );
    expect(restless?.pressure_tracks).toMatchObject([
      {
        id: "cattle_alarm",
        title: "Cattle alarm",
        var: "cattle_alarm",
        value: expect.any(Number),
        band: {
          min: 2,
          label: "Restless",
          description: "The herd is strained but remains below the loss threshold.",
        },
        next: { min: 4, label: "Breaking" },
      },
      {
        id: "pack_drive",
        title: "Pack drive",
        var: "pack_drive",
        value: 0,
        band: {
          min: 0,
          label: "Unraised",
          description: "No signal drive is moving the wolves; signal pressure has not been raised.",
        },
        next: { min: 1, label: "Moving" },
      },
      {
        id: "winter_siege",
        title: "Winter siege",
        var: "fortification_pressure",
        value: 0,
        band: {
          min: 0,
          label: "Unsealed",
          description:
            "No fortification line is holding; the pack and weather still have the open byre.",
        },
        next: { min: 1, label: "Testing" },
      },
    ]);
    if (!restless) throw new Error("expected a restless pressure observation");
    expect(compactRpgObservation(restless, []).pressure?.[0]).toMatchObject([
      "cattle_alarm",
      "Cattle alarm",
      expect.any(Number),
      2,
      "Restless",
      4,
      "Breaking",
    ]);

    const breaking = buildRpgObservation(index, lureRoute("fouled").state);
    expect(breaking.pressure_tracks?.[0]).toMatchObject({
      value: 4,
      band: { min: 4, label: "Breaking" },
      next: null,
    });
  });
});
