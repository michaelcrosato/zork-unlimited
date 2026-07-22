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
  "Cade's local feed-plan instruction takes you across the feed-hauler's crawlboard with his sack. Below, the flank-wolf circles from the low hatch. Cast the second measure through it before dropping east; the hauled ladder leaves no retreat.";
const LOFT_POST_CAST =
  "The second feed measure is spent beyond the low hatch. The flank-wolf followed it alive into the high wood, leaving the byre threshold empty east. The hauled ladder still leaves no retreat.";
const HATCH_PENDING =
  "A low fodder hatch above the byre door. The flank-wolf circles the post below without looking up. The hauled store ladder lies behind you across the hay; east through this hatch is the committed drop, with no safe climb back during the fight.";
const HATCH_POST_CAST =
  "The low hatch now frames an empty door-post. The second feed measure lies beyond it, and the flank-wolf followed that scent alive into the high wood. East is the committed drop; the hauled ladder gives no safe climb back.";
const FINAL_LURE_LIVING =
  "Both younger wolves are alive in the high wood beyond the spent scent line. Cade's last feed measure remains: cast it through the outer scent gate to draw old grey after them. The herd's current alarm still decides its cost. The door is south.";
const FINAL_LURE_HYBRID =
  "The yearling lies dead at the paling, but the flank-wolf followed the second feed cast alive into the high wood. Cade's last measure remains: cast it through the outer scent gate to draw old grey away. Earlier blood and cattle alarm still stand. The door is south.";
const JUNE_PENDING =
  "The old grey leader waits between you and the bellowing cattle. June Pike reaches the inner rail from the lower stock path. The failed lure left the herd pressing; speak to her before the last cast if her cattle-first authority still matters. The byre door is south.";
const PACK_REDIRECTED_LIVING =
  "The grey leader is alive beyond the broken paling, following the last feed cast and the two younger wolves into the high wood. The route to the cattle is open north. Behind you, the empty threshold runs south to the spent scent line.";
const PACK_REDIRECTED_HYBRID =
  "The yearling lies dead at the broken paling. Beyond it, the grey leader follows the last feed cast and the living flank-wolf into the high wood. The route to the cattle is open north. Behind you, the empty threshold runs south to the spent scent line.";
const PLAIN_COMBAT =
  "The old grey leader waits between you and the bellowing cattle in the byre's dark heart, shaping a practiced feint. Cade may have taught you to hold or close; a saved guard offers another catch. Without either, only plain spear work remains. The door is south.";

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
    expect(actionIds(state)).toContain("use_winter_feed_sack_on_outer_scent_gate");
    expect(actionIds(state)).not.toContain("attack_grey_leader");
    if (spec.recovery === "hybrid_guard") {
      expect(state.inventory).toContain("split_rail_guard");
      expect(buildRpgObservation(index, state).description).not.toMatch(/set .*guard|spear work/i);
    }

    state = act(state, "use_winter_feed_sack_on_outer_scent_gate");
    expectRoomSurface(state, spec.finalRedirected);
    expect(state.inventory).not.toContain("winter_feed_sack");
    state = act(state, "go_north");
    expect(state.endingId).toBe(spec.endingId);
  });

  it("keeps June's unresolved intervention ahead of the living final-cast prose", () => {
    let state = reachLoft("fouled_split", true);
    state = act(state, "use_winter_feed_sack_on_loft_hatch");
    state = act(state, "go_east");
    state = act(state, "go_north");

    expectRoomSurface(state, JUNE_PENDING);
    expect(actionIds(state)).toContain("talk_june_pike");
    expect(actionIds(state)).not.toContain("use_winter_feed_sack_on_outer_scent_gate");
    const blocked = buildRpgObservation(index, state).blocked_actions;
    expect(blocked).toContainEqual(
      expect.objectContaining({
        id: "use_winter_feed_sack_on_outer_scent_gate",
        reason: expect.stringMatching(/authority.*speak to her/i),
      }),
    );
    expect(
      compactRpgObservation(buildRpgObservation(index, state), actionIds(state), {
        includeActions: true,
      }).unavailable,
    ).toContainEqual([
      "use_winter_feed_sack_on_outer_scent_gate",
      "June has reached the pressing cattle under the authority you granted. Speak to her before committing the last scent cast.",
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
    expect(actionIds(state)).toContain("attack_grey_leader");
    expect(actionIds(state)).not.toContain("use_winter_feed_sack_on_outer_scent_gate");
  });
});
