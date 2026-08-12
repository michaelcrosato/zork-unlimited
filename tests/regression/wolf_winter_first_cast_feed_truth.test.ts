/**
 * Regression proof for Wolf-Winter's finite feed after the first cast. A
 * failed opening retires that cast, not the sack: every authored route variant
 * must retain the loft and leader measures and name Albany's relief provider
 * truthfully.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { makeStep } from "../../src/core/engine.js";
import type { GameEvent } from "../../src/core/events.js";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";

const SOURCE_PATH = "content/rpg/quests/wolf_winter.yaml";
const loaded = loadRpgSourceFile(SOURCE_PATH);
if (!loaded.ok) throw new Error("wolf_winter must compile");
const index = indexRpgPack(loaded.compiled.pack);

const FIRST_CAST_ID = "use_winter_feed_sack_on_downwind_feed_line";
const LOFT_CAST_ID = "use_winter_feed_sack_on_loft_hatch";
const LEADER_CAST_ID = "use_winter_feed_sack_on_outer_scent_gate";
const TRUTHFUL_FAILURE_COPY =
  "The first cast is spent, but the sack still holds the loft and leader measures:";

type RouteSpec = {
  label: string;
  flags: readonly string[];
  arrivalAction: "use_exposed_ridge_last_mile" | "use_sheltered_stockway_last_mile";
  expectedJournal: string;
};

const FAILED_CASTS: readonly RouteSpec[] = [
  {
    label: "exposed ridge with Emery's Albany wagon fodder",
    flags: ["approach_exposed_ridge", "relief_cade_fodder_allocated"],
    arrivalAction: "use_exposed_ridge_last_mile",
    expectedJournal:
      "The ridge cast fouls despite Emery's Albany wagon fodder. No retry; alarm +2. Bind a rail to redirect the yearling or fight.",
  },
  {
    label: "ordinary exposed ridge",
    flags: ["approach_exposed_ridge"],
    arrivalAction: "use_exposed_ridge_last_mile",
    expectedJournal:
      "Ridge crosswind cannot save the cast: it fouls. No retry; alarm rises by 2. Bind a rail to redirect the yearling or fight.",
  },
  {
    label: "sheltered stockway",
    flags: ["approach_sheltered_stockway"],
    arrivalAction: "use_sheltered_stockway_last_mile",
    expectedJournal:
      "Hidden stockway crosswind folds the first cast. No retry; alarm rises by 2. Bind a rail to redirect the yearling or fight.",
  },
];

function fixedRng(face: "best" | "worst"): Rng {
  return {
    next: () => (face === "best" ? 0.999999 : 0),
    int: (min, max) => (face === "best" ? max : min),
  };
}

function actionIds(state: GameState): string[] {
  return enumerateRpgActions(index, state).map((option) => option.id);
}

function step(
  state: GameState,
  id: string,
  face: "best" | "worst" = "best",
): { state: GameState; events: GameEvent[] } {
  const options = enumerateRpgActions(index, state);
  const option = options.find((candidate) => candidate.id === id);
  expect(
    option,
    `expected ${id} in ${state.current}; legal=${options.map((candidate) => candidate.id).join(",")}`,
  ).toBeDefined();
  if (!option) throw new Error(`missing ${id}`);
  const result = makeStep(buildRpgRules(index, () => fixedRng(face)))(state, option.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  return { state: result.state, events: result.events };
}

function narration(events: readonly GameEvent[]): string {
  return events.flatMap((event) => (event.type === "narration" ? [event.text] : [])).join("\n");
}

function act(state: GameState, id: string, face: "best" | "worst" = "best"): GameState {
  return step(state, id, face).state;
}

function reachFirstCast(spec: RouteSpec): GameState {
  let state = initStateForRpgPack(index, 7411);
  for (const flag of spec.flags) state.flags[flag] = true;
  state = act(state, spec.arrivalAction);
  for (const id of [
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
  expect(actionIds(state)).toContain(FIRST_CAST_ID);
  expect(state.inventory).toContain("winter_feed_sack");
  return state;
}

function assertRemainingFeedLifecycle(state: GameState): void {
  expect(state.inventory).toContain("winter_feed_sack");
  expect(actionIds(state)).not.toContain(FIRST_CAST_ID);

  state = act(state, "wedge_paling_rail", "worst");
  state = act(state, "bind_paling_rail");
  state = act(state, "use_split_rail_guard_on_downwind_feed_line");
  expect(state.inventory).toContain("winter_feed_sack");

  state = act(state, "go_south");
  state = act(state, "go_west");
  expect(actionIds(state)).toContain("go_up");
  state = act(state, "go_up");
  expect(state.current).toBe("fodder_loft");
  expect(state.inventory).toContain("winter_feed_sack");
  expect(actionIds(state)).toContain(LOFT_CAST_ID);

  state = act(state, LOFT_CAST_ID);
  expect(state.inventory).toContain("winter_feed_sack");
  state = act(state, "go_east");
  state = act(state, "go_north");
  expect(state.inventory).toContain("winter_feed_sack");
  expect(actionIds(state)).toContain(LEADER_CAST_ID);

  state = act(state, LEADER_CAST_ID);
  expect(state.inventory).not.toContain("winter_feed_sack");
}

describe("Wolf-Winter first-cast feed truth", () => {
  it.each(FAILED_CASTS)("retires only the failed first cast on the $label route", (spec) => {
    const cast = step(reachFirstCast(spec), FIRST_CAST_ID, "worst");
    const castNarration = narration(cast.events);

    expect(cast.state.flags.lure_trail_fouled).toBe(true);
    expect(cast.state.journal.at(-1)).toBe(spec.expectedJournal);
    expect(castNarration).toContain(TRUTHFUL_FAILURE_COPY);
    expect(castNarration).not.toContain("The feed is spent");
    assertRemainingFeedLifecycle(cast.state);
  });

  it("keeps the successful relief cast and credits Emery's Albany wagon fodder", () => {
    const spec = FAILED_CASTS[0]!;
    let state = reachFirstCast(spec);
    const cast = step(state, FIRST_CAST_ID, "best");
    state = cast.state;

    expect(state.flags.yearling_redirected).toBe(true);
    expect(state.flags.lure_trail_fouled).not.toBe(true);
    expect(state.journal.at(-1)).toBe(
      "Emery's Albany wagon fodder absorbs the ridge pressure. The yearling follows the clean line; cattle alarm does not rise.",
    );
    expect(narration(cast.events)).not.toContain("The feed is spent");
    expect(state.inventory).toContain("winter_feed_sack");
    expect(actionIds(state)).not.toContain(FIRST_CAST_ID);

    state = act(state, "go_south");
    state = act(state, "go_west");
    expect(actionIds(state)).toContain("go_up");
    state = act(state, "go_up");
    state = act(state, LOFT_CAST_ID);
    expect(state.inventory).toContain("winter_feed_sack");
    state = act(state, "go_east");
    state = act(state, "go_north");
    state = act(state, LEADER_CAST_ID);
    expect(state.inventory).not.toContain("winter_feed_sack");
  });

  it("contains no whole-sack-spent failure claim in the authored source", () => {
    expect(readFileSync(SOURCE_PATH, "utf8")).not.toContain("The feed is spent");
  });
});
