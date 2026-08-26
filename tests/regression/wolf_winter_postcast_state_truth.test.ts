/**
 * Regression proof for the player-visible Wolf-Winter state after the second
 * and final LURE casts. These assertions deliberately exercise both the full
 * observation and the compact blind-player surface: completed work must never
 * be presented as pending, and a retained combat resource must not override a
 * hard-committed living route.
 */
import { describe, expect, it } from "vitest";

import { makeStep } from "../../src/core/engine.js";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";
import { compactPlayerEvent } from "../../src/mcp/compact_rpg_event.js";
import { compactRpgObservation } from "../../src/mcp/compact_rpg_observation.js";
import { objectDescription } from "../../src/rpg/model.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
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

const LOFT_PENDING =
  "CAST Cade's winter-feed sack THROUGH low wolf-hatch before going east. The flank-wolf circles below. You crossed the feed-hauler's crawlboard with Cade's winter-feed sack.";
const LOFT_PENDING_EAST_BLOCK =
  "East is blocked, and the hauled ladder prevents retreat. First, CAST Cade's winter-feed sack THROUGH low wolf-hatch.";
const LOFT_POST_CAST =
  "Go east through the low wolf-hatch. The flank-wolf followed the second feed cast alive into the high wood. Retreat remains closed because you hauled up the ladder.";
const HATCH_PENDING =
  "CAST Cade's winter-feed sack THROUGH low wolf-hatch during LURE, or go east and DRIVE from the fodder-loft drop behind the flank-wolf during HUNT, if those actions are offered. The hauled ladder prevents retreat after you cross.";
const HATCH_POST_CAST =
  "Go east through the low wolf-hatch. The flank-wolf followed the second feed measure into the high wood alive. The hauled ladder prevents retreat.";
const FINAL_LURE_LIVING =
  "CAST Cade's winter-feed sack THROUGH outer scent gate to redirect the grey leader. Both younger wolves are alive in the high wood. Current cattle alarm determines the result. The Byre Door is south.";
const FINAL_LURE_HYBRID =
  "CAST Cade's winter-feed sack THROUGH outer scent gate to redirect the grey leader. The flank-wolf is alive in the high wood, the yearling wolf is dead, and existing cattle alarm remains. The Byre Door is south.";
const JUNE_PENDING =
  "TALK TO Road Warden June Pike before the final feed cast if you want her cattle-first help. The failed first LAY action raised cattle alarm, and the grey leader blocks the herd. The Byre Door is south.";
const PACK_REDIRECTED_LIVING =
  "Go north and stand among the cattle to finish the count. South is closed. All three wolves followed the final feed cast into the high wood alive.";
const PACK_REDIRECTED_HYBRID =
  "Go north and stand among the cattle to finish the count. South is closed. The grey leader and flank-wolf followed the final feed cast into the high wood alive; the yearling wolf is dead.";
const POST_DIVERSION_DOOR =
  "Go north through the byre mouth and stand among the cattle to finish the count. The Byre Door is empty because Cade's final feed cast drew the living wolves into the high wood.";
const POST_DIVERSION_PALING =
  "Continue north through the empty Byre Door and byre mouth until you stand among the cattle. South is closed. Cade's final feed cast drew the living wolves into the high wood.";
const POST_DIVERSION_YARD =
  "The cattle count is unfinished. Go north through the broken paling, byre door, and byre mouth until you stand among the cattle. South and west are closed. Cade's feed drew the living wolves into the high wood.";
const POST_DIVERSION_STORE =
  "Go east to the Byre-Yard, then continue north until you stand among the cattle. Store actions cannot finish the watch. Cade's feed sack is spent, and the living wolves are in the high wood.";
const POST_DIVERSION_STEADING =
  "The cattle count is unfinished. Go north through the gate and continue north until you stand among the cattle. Cade's final feed cast already drew the living wolves into the high wood.";
const POST_DIVERSION_CADE =
  "Go north through the Broken Paling, Byre Door, and Deep in the Byre. Do not go south or west to the Store-Shed. Stand Among the Cattle to record the surviving wolves and cattle for Albany.";
const POST_DIVERSION_YARD_BLOCKED_SOUTH =
  "South is closed. After LURE, go north for the cattle count. During DRIVE or FORTIFY, complete the currently displayed gear action, then go north.";
const POST_DIVERSION_YARD_BLOCKED_WEST =
  "West is closed. After LURE, go north for the cattle count. During DRIVE or FORTIFY, complete the currently displayed gear action, then go north.";
const POST_DIVERSION_PALING_BLOCKED_SOUTH =
  "South is closed. After LURE, go north for the cattle count. During DRIVE or FORTIFY, complete the shown Broken Paling action to open north.";
const POST_DIVERSION_DOOR_BLOCKED_SOUTH =
  "South is closed. After LURE, go north for the cattle count. During DRIVE or FORTIFY, complete the shown Byre Door action, then go north.";
const POST_DIVERSION_MOUTH_BLOCKED_SOUTH =
  "South is closed. After LURE, go north for the cattle count. During DRIVE, choose and finish a crisis evacuation. During FORTIFY, HOLD sealed-byre dawn watch.";
const MOUTH_NORTH_GUIDANCE =
  "North is blocked. Complete the exact action shown here. That action either ends the quest or opens north.";
const PLAIN_COMBAT =
  "Use one exact action shown. Cade's plan offers HOLD the spear point and wait out the grey leader's feint. His lesson offers CLOSE before the grey leader can finish her feint. Saved rail gear offers its own named maneuver. Otherwise, ATTACK grey leader.";

type Recovery = "clean" | "fouled_split" | "fouled_braced" | "hybrid_guard";

function fixedRng(face: "best" | "worst"): Rng {
  return {
    next: () => (face === "best" ? 0.999999 : 0),
    int: (min, max) => (face === "best" ? max : min),
  };
}

function actionIds(state: GameState): string[] {
  return enumerateRpgActions(index, state).map((option) => option.id);
}

function act(state: GameState, id: string, face: "best" | "worst" = "best"): GameState {
  const options = enumerateRpgActions(index, state);
  const option = options.find((candidate) => candidate.id === id);
  expect(
    option,
    `expected ${id} in ${state.current}; legal=${options.map((candidate) => candidate.id).join(",")}`,
  ).toBeDefined();
  if (!option) throw new Error(`missing ${id}`);
  const result = makeStep(buildRpgRules(index, () => fixedRng(face)))(state, option.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  return result.state;
}

function expectRoomSurface(state: GameState, expected: string): void {
  const full = buildRpgObservation(index, state);
  const ids = actionIds(state);
  const compact = compactRpgObservation(full, ids, { includeActions: true });
  expect(full.description.trimEnd()).toBe(expected);
  expect(compact.text).toBe(expected);
  expect(compact.actions).toEqual(ids);
}

function expectBlockedSurface(
  state: GameState,
  expected: readonly (readonly [direction: string, message: string])[],
): void {
  const full = buildRpgObservation(index, state);
  const compact = compactRpgObservation(full, actionIds(state), { includeActions: true });
  const expectedDirections = new Set(expected.map(([direction]) => direction));

  expect(full.blocked_exits.filter((exit) => expectedDirections.has(exit.direction))).toEqual(
    expected.map(([direction, message]) => ({ direction, message })),
  );
  expect(
    (compact.blocked ?? []).filter(([direction]) => expectedDirections.has(direction)),
  ).toEqual(expected);
}

function expectObjectSurface(state: GameState, objectId: string, expected: string): void {
  const object = index.objects.get(objectId);
  expect(object).toBeDefined();
  if (!object) throw new Error(`missing ${objectId}`);
  const full = objectDescription(object, state);
  expect(full.trimEnd()).toBe(expected);
  const compact = compactPlayerEvent({ type: "narration", text: full });
  expect(compact).toEqual(["n", full]);
  expect(compact[0] === "n" ? compact[1].trimEnd() : "").toBe(expected);
}

function reachResolvedYearling(recovery: Recovery, withJune = false): GameState {
  let state = initStateForRpgPack(index, 4402);
  if (withJune) state.flags.june_pike_present = true;
  for (const id of [
    "go_north",
    "talk_houndsman",
    "ask_lure",
    "ask_commit_lure",
    "ask_leave",
    "go_west",
    "take_winter_feed_sack",
    "go_east",
    "go_north",
  ]) {
    state = act(state, id);
  }
  state = act(
    state,
    "use_winter_feed_sack_on_downwind_feed_line",
    recovery === "clean" ? "best" : "worst",
  );

  if (recovery === "fouled_split") {
    state = act(state, "wedge_paling_rail", "worst");
    state = act(state, "bind_paling_rail");
    state = act(state, "use_split_rail_guard_on_downwind_feed_line");
  } else if (recovery === "fouled_braced") {
    state = act(state, "wedge_paling_rail", "best");
    state = act(state, "turn_paling_rail");
  } else if (recovery === "hybrid_guard") {
    state = act(state, "wedge_paling_rail", "worst");
    state = act(state, "bind_paling_rail");
    state = act(state, "maneuver_yearling_wolf_commit_hybrid_strike", "worst");
    for (let guard = 0; guard < 10 && !state.flags.yearling_down; guard += 1) {
      state = act(state, "attack_yearling_wolf", "best");
    }
    expect(state.flags.yearling_down).toBe(true);
    expect(state.inventory).toContain("split_rail_guard");
  }

  expect(state.flags.yearling_redirected || state.flags.yearling_down).toBe(true);
  return state;
}

function reachLoft(recovery: Recovery, withJune = false): GameState {
  let state = reachResolvedYearling(recovery, withJune);
  for (const id of ["go_south", "go_west", "go_up"]) state = act(state, id);
  expect(state.current).toBe("fodder_loft");
  return state;
}

const RECOVERIES: ReadonlyArray<{
  label: string;
  recovery: Recovery;
  finalPending: string;
  finalRedirected: string;
  endingId: string;
}> = [
  {
    label: "clean living line",
    recovery: "clean",
    finalPending: FINAL_LURE_LIVING,
    finalRedirected: PACK_REDIRECTED_LIVING,
    endingId: "ending_pack_diverted",
  },
  {
    label: "fouled split-guard recovery",
    recovery: "fouled_split",
    finalPending: FINAL_LURE_LIVING,
    finalRedirected: PACK_REDIRECTED_LIVING,
    endingId: "ending_pack_diverted_cattle_scattered",
  },
  {
    label: "fouled braced-rail recovery",
    recovery: "fouled_braced",
    finalPending: FINAL_LURE_LIVING,
    finalRedirected: PACK_REDIRECTED_LIVING,
    endingId: "ending_pack_diverted_cattle_scattered",
  },
  {
    label: "yearling-death hybrid with retained guard",
    recovery: "hybrid_guard",
    finalPending: FINAL_LURE_HYBRID,
    finalRedirected: PACK_REDIRECTED_HYBRID,
    endingId: "ending_pack_diverted_after_blood",
  },
];

describe("Wolf-Winter post-cast state truth", () => {
  it.each(RECOVERIES)("keeps $label exact through both casts", (spec) => {
    let state = reachLoft(spec.recovery);

    expectRoomSurface(state, LOFT_PENDING);
    expectBlockedSurface(state, [["east", LOFT_PENDING_EAST_BLOCK]]);
    expectObjectSurface(state, "loft_hatch", HATCH_PENDING);
    expect(actionIds(state)).toContain("use_winter_feed_sack_on_loft_hatch");
    expect(actionIds(state)).not.toContain("go_east");

    state = act(state, "use_winter_feed_sack_on_loft_hatch");
    expectRoomSurface(state, LOFT_POST_CAST);
    expectObjectSurface(state, "loft_hatch", HATCH_POST_CAST);
    expect(actionIds(state)).not.toContain("use_winter_feed_sack_on_loft_hatch");
    expect(actionIds(state)).toContain("go_east");

    if (spec.recovery === "clean") {
      state.flags.jamie_market_testimony_certified = true;
      expectRoomSurface(state, LOFT_POST_CAST);
    }
    if (spec.recovery === "hybrid_guard") {
      expect(state.inventory).toContain("split_rail_guard");
    }

    state = act(state, "go_east");
    state = act(state, "go_north");
    expectRoomSurface(state, spec.finalPending);
    expectBlockedSurface(state, [["north", MOUTH_NORTH_GUIDANCE]]);
    expect(actionIds(state)).toContain("use_winter_feed_sack_on_outer_scent_gate");
    expect(actionIds(state)).not.toContain("attack_grey_leader");
    expect(actionIds(state)).not.toContain("go_north");
    if (spec.recovery === "hybrid_guard") {
      expect(state.inventory).toContain("split_rail_guard");
      expect(buildRpgObservation(index, state).description).not.toMatch(/set .*guard|spear work/i);
    }

    state = act(state, "use_winter_feed_sack_on_outer_scent_gate");
    expectRoomSurface(state, spec.finalRedirected);
    expect(state.inventory).not.toContain("winter_feed_sack");
    expect(actionIds(state)).toContain("go_north");
    expect(actionIds(state)).not.toContain("go_south");
    expectBlockedSurface(state, [["south", POST_DIVERSION_MOUTH_BLOCKED_SOUTH]]);

    const at = (room: string): GameState => ({ ...state, current: room });
    const restoredDoor = at("byre_door");
    expectRoomSurface(restoredDoor, POST_DIVERSION_DOOR);
    expect(actionIds(restoredDoor)).toContain("go_north");
    expect(actionIds(restoredDoor)).not.toContain("go_south");
    expectBlockedSurface(restoredDoor, [["south", POST_DIVERSION_DOOR_BLOCKED_SOUTH]]);

    const restoredPaling = at("paling_gap");
    expectRoomSurface(restoredPaling, POST_DIVERSION_PALING);
    expect(actionIds(restoredPaling)).toContain("go_north");
    expect(actionIds(restoredPaling)).not.toContain("go_south");
    expectBlockedSurface(restoredPaling, [["south", POST_DIVERSION_PALING_BLOCKED_SOUTH]]);

    const restoredYard = at("byre_yard");
    expectRoomSurface(restoredYard, POST_DIVERSION_YARD);
    expect(actionIds(restoredYard)).toContain("go_north");
    expect(actionIds(restoredYard)).not.toContain("go_south");
    expect(actionIds(restoredYard)).not.toContain("go_west");
    expectBlockedSurface(restoredYard, [
      ["south", POST_DIVERSION_YARD_BLOCKED_SOUTH],
      ["west", POST_DIVERSION_YARD_BLOCKED_WEST],
    ]);
    const talkingToCade = act(restoredYard, "talk_houndsman");
    expect(buildRpgObservation(index, talkingToCade).dialogue?.npc_text.trimEnd()).toBe(
      POST_DIVERSION_CADE,
    );

    const restoredStore = at("store");
    expectRoomSurface(restoredStore, POST_DIVERSION_STORE);
    expect(actionIds(restoredStore)).toContain("go_east");
    expect(actionIds(restoredStore)).not.toContain("go_up");

    const restoredSteading = at("steading_yard");
    expectRoomSurface(restoredSteading, POST_DIVERSION_STEADING);
    expect(actionIds(restoredSteading)).toContain("go_north");
    state = act(state, "go_north");
    expect(state.endingId).toBe(spec.endingId);
  });

  it("keeps June's unresolved intervention ahead of the living final-cast prose", () => {
    let state = reachLoft("fouled_split", true);
    state = act(state, "use_winter_feed_sack_on_loft_hatch");
    state = act(state, "go_east");
    state = act(state, "go_north");

    expectRoomSurface(state, JUNE_PENDING);
    expectBlockedSurface(state, [["north", MOUTH_NORTH_GUIDANCE]]);
    expect(actionIds(state)).toContain("talk_june_pike");
    expect(actionIds(state)).not.toContain("use_winter_feed_sack_on_outer_scent_gate");
    expect(actionIds(state)).not.toContain("go_north");
    const blocked = buildRpgObservation(index, state).blocked_actions;
    expect(blocked).toContainEqual(
      expect.objectContaining({
        id: "use_winter_feed_sack_on_outer_scent_gate",
        reason: expect.stringMatching(/First, TALK TO Road Warden June Pike[^]*cattle-first help/i),
      }),
    );
    expect(
      compactRpgObservation(buildRpgObservation(index, state), actionIds(state), {
        includeActions: true,
      }).unavailable,
    ).toContainEqual([
      "use_winter_feed_sack_on_outer_scent_gate",
      "First, TALK TO Road Warden June Pike. Her cattle-first help lowers cattle alarm by 1 before the final feed cast.",
    ]);

    state = act(state, "talk_june_pike");
    expect(state.flags.june_cattle_line_taken).toBe(true);
    expectRoomSurface(state, FINAL_LURE_LIVING);
    expect(actionIds(state)).toContain("use_winter_feed_sack_on_outer_scent_gate");
    state = act(state, "ask_acknowledge");
    expectRoomSurface(state, FINAL_LURE_LIVING);

    state = act(state, "use_winter_feed_sack_on_outer_scent_gate");
    expectRoomSurface(state, PACK_REDIRECTED_LIVING);
    state = act(state, "go_north");
    expect(state.endingId).toBe("ending_pack_diverted");
  });

  it("leaves the non-LURE combat fallback and its compact actions unchanged", () => {
    const state = initStateForRpgPack(index, 4403);
    state.current = "byre_mouth";
    expectRoomSurface(state, PLAIN_COMBAT);
    expectBlockedSurface(state, [["north", MOUTH_NORTH_GUIDANCE]]);
    expect(actionIds(state)).toContain("attack_grey_leader");
    expect(actionIds(state)).not.toContain("use_winter_feed_sack_on_outer_scent_gate");
    expect(actionIds(state)).not.toContain("go_north");
  });
});
