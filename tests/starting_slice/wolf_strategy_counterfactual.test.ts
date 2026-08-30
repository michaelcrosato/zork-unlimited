/**
 * SS-F09 counterfactual proof: Wolf-Winter now supports a genuinely noncombat
 * solution family. Redirected wolves remain alive at full implicit HP, legal
 * combat disappears one encounter at a time, authored cattle pressure changes
 * the outcome, and a failed first cast advances into a resource-cost recovery
 * instead of offering an unchanged reroll.
 */
import { describe, expect, it } from "vitest";

import { makeStep } from "../../src/core/engine.js";
import type { GameEvent } from "../../src/core/events.js";
import type { Rng } from "../../src/core/rng.js";
import { compactPlayerEvent } from "../../src/mcp/compact_rpg_event.js";
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
import { seedForSeededOpeningFlag } from "../regression/support/seeded_opening.js";

const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("wolf_winter must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const ORDINARY_LURE_FLAG = "opening_condition_open_ash_lane";
const ORDINARY_LURE_SEED = seedForSeededOpeningFlag(
  pack.meta.seeded_opening_flags,
  ORDINARY_LURE_FLAG,
);
const NORTH_PENDING_GUIDANCE =
  "North is blocked. Before HUNT, TALK TO Road Warden June Pike. During LURE, follow the shown CALL or feed action; feed is west, and the hatch is west then up. During DRIVE or FORTIFY, complete the shown gear action.";
const NORTH_LURE_PENDING_GUIDANCE =
  "North is blocked. Finish the shown LURE action first. Feed is west; the hatch is west then up.";
const PALING_NORTH_GUIDANCE =
  "North is blocked. Complete the currently listed yearling or outer-seal action. During LURE, go south, west, and up, then CAST Cade's winter-feed sack THROUGH low wolf-hatch.";
const YEARLING_DEFEAT_JOURNAL = "The yearling wolf is dead at the Broken Paling.";
const COMMITTED_LURE_YARD_GUIDANCE =
  "Go north to continue LURE or its shown recovery. HUNT, DRIVE, and FORTIFY are closed.";
const LURE_FEED_PICKUP_GUIDANCE =
  "Go west and TAKE Cade's winter-feed sack. Go east, then go north and LAY downwind feed line WITH Cade's winter-feed sack. The sack became available only after you chose LURE.";
const LURE_PROTOCOL_GUIDANCE =
  "CALL Jamie's sealed relief protocol. It can be used once here. Then carry the feed west through the Store-Shed and up to the Fodder-Loft. The yearling is alive in the high wood, but the cattle are still pressing the slats.";
const LURE_FIRST_BEAT_SETTLED_GUIDANCE =
  "Go west through the Store-Shed and up to the Fodder-Loft for the second feed cast. The north exit does not lead to that cast.";

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
  yearlingDefeatEvents: readonly GameEvent[];
}>;

function exactYardProjection(state: GameState, expectedText: string) {
  const before = structuredClone(state);
  const full = buildRpgObservation(index, state);
  const actionIds = full.available_actions.map((action) => action.id);
  const compact = compactRpgObservation(full, actionIds, { includeActions: true });

  expect(state.current).toBe("byre_yard");
  expect(full.description.trimEnd()).toBe(expectedText);
  expect(compact.text).toBe(expectedText);
  expect(compact.actions).toEqual(actionIds);
  expect(state).toEqual(before);

  return { full, compact, actionIds };
}

function assertCommittedLureYard(state: GameState): void {
  const { full, compact, actionIds } = exactYardProjection(state, COMMITTED_LURE_YARD_GUIDANCE);

  expect(state.flags.strategy_lure_committed).toBe(true);
  expect(state.inventory).toContain("winter_feed_sack");
  expect(full.exits.map((exit) => exit.direction).sort()).toEqual(["north", "south", "west"]);
  expect(full.blocked_exits).toEqual([]);
  expect(
    (compact.exits ?? []).map((exit) => (typeof exit === "string" ? exit : exit[0])).sort(),
  ).toEqual(["north", "south", "west"]);
  expect(compact.blocked ?? []).toEqual([]);
  for (const actionId of ["go_north", "go_south", "go_west"]) {
    expect(actionIds).toContain(actionId);
    expect(compact.actions).toContain(actionId);
  }
  expect(full.description).not.toMatch(/compare HUNT, LURE, DRIVE, and FORTIFY/i);
}

function expectOnlyStepAdvanced(state: GameState, before: GameState, increment: number): void {
  expect(state).toEqual({ ...before, step: before.step + increment });
}

function stepById(state: GameState, id: string, face: "best" | "worst" = "best"): GameState {
  const option = enumerateRpgActions(index, state).find((candidate) => candidate.id === id);
  expect(option, `expected ${id}`).toBeDefined();
  if (!option) throw new Error(`missing ${id}`);
  const result = makeStep(buildRpgRules(index, () => fixedRng(face)))(state, option.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  return result.state;
}

function assertLurePalingNorthBlocked(
  state: GameState,
  requiredActionIds: readonly string[],
  forbiddenActionIds: readonly string[] = [],
): void {
  const before = structuredClone(state);
  const full = buildRpgObservation(index, state);
  const actionIds = full.available_actions.map((action) => action.id);
  const compact = compactRpgObservation(full, actionIds, { includeActions: true });
  const compactNorthExits = (compact.exits ?? []).filter(
    (exit) => (typeof exit === "string" ? exit : exit[0]) === "north",
  );

  expect(state.current).toBe("paling_gap");
  expect(full.exits).toContainEqual({ direction: "south", to: "byre_yard" });
  expect(full.exits.filter((exit) => exit.direction === "north")).toEqual([]);
  expect(full.blocked_exits.filter((exit) => exit.direction === "north")).toEqual([
    { direction: "north", message: PALING_NORTH_GUIDANCE },
  ]);
  expect(compactNorthExits).toEqual([]);
  expect((compact.blocked ?? []).filter(([direction]) => direction === "north")).toEqual([
    ["north", PALING_NORTH_GUIDANCE],
  ]);
  expect(compact.actions).toEqual(actionIds);
  for (const actionId of requiredActionIds) {
    expect(actionIds).toContain(actionId);
    expect(compact.actions).toContain(actionId);
  }
  for (const actionId of ["go_north", ...forbiddenActionIds]) {
    expect(actionIds).not.toContain(actionId);
    expect(compact.actions).not.toContain(actionId);
  }
  expect(state).toEqual(before);
}

function lureRoute(
  opening: "clean" | "fouled" | "fouled_braced" | "hybrid",
  preparation: "none" | "missing_counsel" | "complete" = "none",
  reliefProtocolPrepared = false,
): Route {
  let state = initStateForRpgPack(index, ORDINARY_LURE_SEED);
  expect(state.flags[ORDINARY_LURE_FLAG]).toBe(true);
  if (reliefProtocolPrepared) state.flags.relief_protocol_prepared = true;
  const actions: string[] = [];
  const observations = [buildRpgObservation(index, state)];
  let yearlingDefeatEvents: readonly GameEvent[] = [];
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
      (opening === "fouled_braced" && id === "wedge_paling_rail" && state.flags.lure_trail_fouled)
        ? "best"
        : "worst";
    const step = makeStep(buildRpgRules(index, () => fixedRng(face)));
    const result = step(state, option.action);
    expect(result.ok, result.rejectionReason).toBe(true);
    if (!state.flags.yearling_down && result.state.flags.yearling_down) {
      yearlingDefeatEvents = result.events;
    }
    state = result.state;
    actions.push(id);
    observations.push(buildRpgObservation(index, state));
  };

  act("go_north");
  if (preparation !== "none") {
    act("read_day_book");
    act("go_west");
    act("take_byre_jerkin");
    act("use_byre_jerkin");
    act("go_east");
  }
  act("talk_houndsman");
  if (preparation === "complete") act("ask_wolves");
  act("ask_lure");
  expect(state.flags.strategy_lure_committed).not.toBe(true);
  const commitment = enumerateRpgActions(index, state).find(
    (option) => option.id === "ask_commit_lure",
  );
  expect(commitment?.command).toMatch(
    /CHOOSE LURE[^]*Consume Cade's only feed sack in three actions[^]*leave the paling broken[^]*permanently close HUNT, DRIVE, and FORTIFY/i,
  );
  act("ask_commit_lure");
  expect(state.flags.strategy_lure_committed).toBe(true);
  act("ask_leave");
  const pickup = exactYardProjection(state, LURE_FEED_PICKUP_GUIDANCE);
  expect(state.inventory).not.toContain("winter_feed_sack");
  expect(pickup.actionIds).toEqual(expect.arrayContaining(["go_south", "go_west"]));
  expect(pickup.actionIds).not.toContain("go_north");
  expect(pickup.full.blocked_exits).toContainEqual({
    direction: "north",
    message: NORTH_LURE_PENDING_GUIDANCE,
  });
  expect(pickup.compact.blocked).toContainEqual(["north", NORTH_LURE_PENDING_GUIDANCE]);
  act("go_west");
  act("take_winter_feed_sack");
  act("go_east");
  assertCommittedLureYard(state);
  expect(state.flags.lure_trail_fouled).not.toBe(true);
  expect(state.flags.yearling_down).not.toBe(true);
  expect(state.flags.yearling_redirected).not.toBe(true);
  act("go_north");
  assertLurePalingNorthBlocked(state, ["use_winter_feed_sack_on_downwind_feed_line"]);
  act("use_winter_feed_sack_on_downwind_feed_line");

  if (opening !== "clean") {
    expect(state.flags.lure_trail_fouled).toBe(true);
    expect(state.vars.cattle_alarm).toBe(2);
    expect(enumerateRpgActions(index, state).map((option) => option.id)).not.toContain(
      "use_winter_feed_sack_on_downwind_feed_line",
    );
    assertLurePalingNorthBlocked(state, [
      "wedge_paling_rail",
      "maneuver_yearling_wolf_commit_hybrid_strike",
    ]);
    const beforeDetour = structuredClone(state);
    act("go_south");
    assertCommittedLureYard(state);
    expect(state.flags.lure_trail_fouled).toBe(true);
    expect(state.flags.yearling_down).not.toBe(true);
    expect(state.flags.yearling_redirected).not.toBe(true);
    act("go_north");
    expectOnlyStepAdvanced(state, beforeDetour, 2);
    assertLurePalingNorthBlocked(state, [
      "wedge_paling_rail",
      "maneuver_yearling_wolf_commit_hybrid_strike",
    ]);
    if (opening === "fouled") {
      act("wedge_paling_rail"); // worst field roll: the rail splits
      act("bind_paling_rail"); // deterministic salvage: bind the split guard
      act("use_split_rail_guard_on_downwind_feed_line");
    } else if (opening === "fouled_braced") {
      act("wedge_paling_rail"); // best rail roll: the breach braces
      act("turn_paling_rail"); // deterministic scent-pen: redirect alive
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
  expect(breach.description).toMatch(
    /Go south[^]*west[^]*up to the Fodder-Loft[^]*(?:second feed cast|cast the remaining feed)/i,
  );
  expect(breach.description).not.toMatch(/route north is clear|byre runs north|byre north/i);
  assertLurePalingNorthBlocked(
    state,
    ["go_south"],
    [
      "use_winter_feed_sack_on_downwind_feed_line",
      "wedge_paling_rail",
      "bind_paling_rail",
      "turn_paling_rail",
      "maneuver_yearling_wolf_commit_hybrid_strike",
      "attack_yearling_wolf",
    ],
  );
  act("go_south");
  if (reliefProtocolPrepared) {
    const protocol = exactYardProjection(state, LURE_PROTOCOL_GUIDANCE);
    expect(state.flags).toMatchObject({
      strategy_lure_committed: true,
      relief_protocol_prepared: true,
      yearling_redirected_with_split_guard: true,
    });
    expect(state.inventory).toContain("winter_feed_sack");
    expect(protocol.actionIds).toContain("use_relief_protocol_docket");
    expect(protocol.actionIds).not.toContain("go_north");
    expect(protocol.full.blocked_exits).toContainEqual({
      direction: "north",
      message: NORTH_LURE_PENDING_GUIDANCE,
    });
    expect(protocol.compact.blocked).toContainEqual(["north", NORTH_LURE_PENDING_GUIDANCE]);
    act("use_relief_protocol_docket");
  }
  const { full: yard, compact: compactYard } = exactYardProjection(
    state,
    LURE_FIRST_BEAT_SETTLED_GUIDANCE,
  );
  expect(yard.description).not.toMatch(/young wolf is through|flank-wolf holds/i);
  expect(yard.available_actions.map((option) => option.id)).toContain("go_west");
  expect(yard.available_actions.map((option) => option.id)).not.toContain("go_north");
  expect(state.flags.june_pike_present).not.toBe(true);
  expect(yard.blocked_exits).toContainEqual({
    direction: "north",
    message: NORTH_LURE_PENDING_GUIDANCE,
  });
  expect(compactYard.actions).toContain("go_west");
  expect(compactYard.blocked).toContainEqual(["north", NORTH_LURE_PENDING_GUIDANCE]);
  expect(NORTH_PENDING_GUIDANCE).toMatch(
    /Before HUNT[^]*TALK TO Road Warden June Pike[^]*During LURE[^]*shown CALL or feed action[^]*feed is west[^]*hatch is west then up[^]*During DRIVE or FORTIFY[^]*shown gear action/i,
  );
  act("go_west");
  act("go_up");
  const loft = buildRpgObservation(index, state);
  expect(loft.description).toMatch(
    /CAST Cade's winter-feed sack THROUGH low wolf-hatch[^]*flank-wolf circles below[^]*feed-hauler's crawlboard with Cade's winter-feed sack/i,
  );
  expect(loft.description).not.toMatch(/Jamie|packet/i);
  act("use_winter_feed_sack_on_loft_hatch");
  expect(state.flags.flank_redirected).toBe(true);
  act("go_east");
  expect(buildRpgObservation(index, state).enemies_present).toEqual([]);
  const beforeSecondCastBacktrack = structuredClone(state);
  act("go_south");
  act("go_south");
  assertCommittedLureYard(state);
  expect(state.flags.flank_redirected).toBe(true);
  expect(state.flags.yearling_redirected || state.flags.yearling_down).toBe(true);
  act("go_north");
  act("go_north");
  expectOnlyStepAdvanced(state, beforeSecondCastBacktrack, 4);
  act("go_north");
  act("use_winter_feed_sack_on_outer_scent_gate");
  expect(state.flags.leader_redirected).toBe(true);
  act("go_north");

  return { state, actions, observations, yearlingDefeatEvents };
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
    expect(ending.ending?.text).toMatch(
      /whole herd survives[^]*all three wolves leave for the high wood/i,
    );
  });

  it("explains the precise 55/60 missing-counsel gap without changing nonlethal scoring", () => {
    const missingCounsel = lureRoute("clean", "missing_counsel");
    const complete = lureRoute("clean", "complete");

    expect(missingCounsel.state).toMatchObject({
      endingId: "ending_pack_diverted",
      vars: { score: 55 },
      flags: { read_tally: true, jerkin_donned: true },
    });
    expect(missingCounsel.state.flags.heard_counsel).not.toBe(true);
    const missingCounselEnding = buildRpgObservation(index, missingCounsel.state);
    expect(missingCounselEnding.ending?.text).toMatch(
      /wore the padded byre-jerkin[^]*skipped Cade's quick spear lesson[^]*reducing the outcome score by 5/i,
    );
    expect(missingCounselEnding.description).toContain("Final score: 55 of 60.");

    const juneMissingCounselState = {
      ...missingCounsel.state,
      flags: {
        ...missingCounsel.state.flags,
        june_cattle_line_taken: true,
      },
    };
    const juneMissingCounselEnding = buildRpgObservation(index, juneMissingCounselState);
    expect(juneMissingCounselEnding.ending?.text).toMatch(
      /June Pike refused to help with the wolves[^]*wore the padded byre-jerkin[^]*skipped Cade's quick spear lesson[^]*reducing the outcome score by 5/i,
    );
    expect(juneMissingCounselEnding.description).toContain("Final score: 55 of 60.");

    expect(complete.state).toMatchObject({
      endingId: "ending_pack_diverted",
      vars: { score: 60 },
      flags: { read_tally: true, jerkin_donned: true, heard_counsel: true },
    });
    const completeEnding = buildRpgObservation(index, complete.state);
    expect(completeEnding.ending?.text).not.toMatch(/five-point gap/i);
    expect(completeEnding.description).toContain("Final score: 60 of 60.");
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
      /All three wolves survive[^]*Two cattle are missing/i,
    );

    expect(clean.state.vars.score).toBe(fouled.state.vars.score);
    expect(clean.state.endingId).not.toBe(fouled.state.endingId);
  });

  it("makes a successful brace a living failed-lure recovery instead of a forced kill", () => {
    const split = lureRoute("fouled");
    const braced = lureRoute("fouled_braced");

    expect(braced.actions).toContain("wedge_paling_rail");
    expect(braced.actions).toContain("turn_paling_rail");
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

    const postDefeat = hybrid.observations.find(
      (observation) =>
        observation.state.flags.includes("yearling_down") &&
        !observation.state.flags.includes("flank_redirected"),
    );
    expect(postDefeat).toBeDefined();
    if (!postDefeat) throw new Error("hybrid route must capture the yearling defeat boundary");
    const actionIds = postDefeat.available_actions.map((action) => action.id);
    const compactPostDefeat = compactRpgObservation(postDefeat, actionIds, {
      includeActions: true,
    });
    expect(postDefeat.state.journal.at(-1)).toBe(YEARLING_DEFEAT_JOURNAL);
    expect(compactPostDefeat.journal?.at(-1)).toBe(YEARLING_DEFEAT_JOURNAL);
    expect(hybrid.yearlingDefeatEvents).toContainEqual({
      type: "state_change",
      effect: "add_journal",
      text: YEARLING_DEFEAT_JOURNAL,
    });
    expect(hybrid.yearlingDefeatEvents.map((event) => compactPlayerEvent(event))).toContainEqual([
      "s",
      "j",
      YEARLING_DEFEAT_JOURNAL,
    ]);
    expect(postDefeat.exits).toContainEqual({ direction: "south", to: "byre_yard" });
    expect(postDefeat.exits.some((exit) => exit.direction === "north")).toBe(false);
    expect(postDefeat.blocked_exits).toContainEqual({
      direction: "north",
      message: PALING_NORTH_GUIDANCE,
    });
    expect(actionIds).toContain("go_south");
    expect(actionIds).not.toContain("go_north");
    expect(compactPostDefeat.actions).toContain("go_south");
    expect(compactPostDefeat.actions).not.toContain("go_north");
    expect(compactPostDefeat.blocked).toContainEqual(["north", PALING_NORTH_GUIDANCE]);

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
      /yearling wolf is dead[^]*flank-wolf and grey leader remain alive[^]*Two cattle are missing/i,
    );
    expect(buildRpgObservation(index, hybrid.state).ending?.text).not.toMatch(
      /all three wolves alive/i,
    );
  });

  it("keeps no-feed, protocol, resolved west-up, open, and HUNT states outside the held-feed fallback", () => {
    const protocol = lureRoute("fouled", "none", true);
    expect(protocol.actions.filter((id) => id === "use_relief_protocol_docket")).toEqual([
      "use_relief_protocol_docket",
    ]);
    expect(protocol.state.flags).toMatchObject({
      relief_protocol_prepared: true,
      relief_protocol_attempted: true,
      pack_diverted: true,
    });

    let open = initStateForRpgPack(index, ORDINARY_LURE_SEED);
    expect(open.flags[ORDINARY_LURE_FLAG]).toBe(true);
    open = stepById(open, "go_north");
    const openBefore = structuredClone(open);
    const openFull = buildRpgObservation(index, open);
    const openActionIds = openFull.available_actions.map((action) => action.id);
    const openCompact = compactRpgObservation(openFull, openActionIds, { includeActions: true });
    expect(openFull.description).toMatch(
      /READ day-book and TALK TO old Cade the houndsman before going north[^]*Going north now chooses HUNT[^]*permanently closes LURE, DRIVE, and FORTIFY/i,
    );
    expect(openFull.description.trimEnd()).not.toBe(COMMITTED_LURE_YARD_GUIDANCE);
    expect(openCompact.text).toBe(openFull.description.trimEnd());
    expect(openCompact.actions).toEqual(openActionIds);
    expect(openActionIds).toEqual(expect.arrayContaining(["go_north", "talk_houndsman"]));
    expect(open.flags.strategy_lure_committed).not.toBe(true);
    expect(open).toEqual(openBefore);

    let hunt = stepById(open, "go_north");
    hunt = stepById(hunt, "go_south");
    const huntBefore = structuredClone(hunt);
    const huntFull = buildRpgObservation(index, hunt);
    const huntActionIds = huntFull.available_actions.map((action) => action.id);
    const huntCompact = compactRpgObservation(huntFull, huntActionIds, {
      includeActions: true,
    });
    expect(hunt.current).toBe("byre_yard");
    expect(hunt.visited.paling_gap).toBe(true);
    expect(hunt.flags.strategy_lure_committed).not.toBe(true);
    expect(hunt.flags.strategy_drive_committed).not.toBe(true);
    expect(hunt.flags.strategy_fortify_committed).not.toBe(true);
    expect(huntFull.description.trimEnd()).not.toBe(COMMITTED_LURE_YARD_GUIDANCE);
    expect(huntCompact.text).toBe(huntFull.description.trimEnd());
    expect(huntCompact.actions).toEqual(huntActionIds);
    expect(huntActionIds).toEqual(expect.arrayContaining(["go_north", "go_south", "go_west"]));
    expect(hunt).toEqual(huntBefore);
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
          description: "The herd is restless, but no cattle are missing.",
        },
        next: { min: 4, label: "Breaking: cattle missing" },
      },
      {
        id: "pack_drive",
        title: "Pack drive",
        var: "pack_drive",
        value: 0,
        band: {
          min: 0,
          label: "Unraised",
          description: "No DRIVE signal has moved the wolves.",
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
            "No FORTIFY seal was raised around the byre. This band does not describe the wolves' current state.",
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
      "Breaking: cattle missing",
    ]);

    const breaking = buildRpgObservation(index, lureRoute("fouled").state);
    expect(breaking.pressure_tracks?.[0]).toMatchObject({
      value: 4,
      band: { min: 4, label: "Breaking: cattle missing" },
      next: null,
    });
    expect(compactRpgObservation(breaking, []).pressure?.[0]).toEqual([
      "cattle_alarm",
      "Cattle alarm",
      4,
      4,
      "Breaking: cattle missing",
    ]);
  });
});
