/**
 * Regression for bug_0443: a player could win Breaking Weir at 45/50 after
 * skipping the optional flood-book, but the ending gave no in-world hint that
 * the unread book was the missing scored preparation.
 */
import { describe, expect, it } from "vitest";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";

const loaded = loadRpgSourceFile("content/rpg/quests/breaking_weir.yaml");
if (!loaded.ok) throw new Error("breaking_weir must compile");
const index = indexRpgPack(loaded.compiled.pack);
const rules = buildRpgRules(index);
const step = makeStep(rules);

function playAction(state: GameState, id: string): GameState {
  const option = enumerateRpgActions(index, state).find((action) => action.id === id);
  if (!option) {
    throw new Error(
      `"${id}" not legal in ${state.current}: [${enumerateRpgActions(index, state)
        .map((action) => action.id)
        .join(", ")}]`,
    );
  }
  const result = step(state, option.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  return result.state;
}

function playUntil(state: GameState, actionId: string, flag: string): GameState {
  let guard = 0;
  while (!state.flags[flag] && !state.ended) {
    state = playAction(state, actionId);
    if (++guard > 40) throw new Error(`${flag} never set`);
  }
  return state;
}

function winBreakingWeir({ readBook }: { readBook: boolean }): GameState {
  let state = initStateForRpgPack(index, 7);
  state = playAction(state, "talk_pell");
  state = playAction(state, "ask_ask_walk");
  const resumedActions = enumerateRpgActions(index, state).map((action) => action.id);
  expect(resumedActions).not.toContain("ask_walk_back");
  expect(resumedActions).toEqual([
    "ask_ask_weir",
    "ask_leave_pell",
    "go_north",
    "examine_flood_book",
    "read_flood_book",
    "examine_life_line",
    "take_life_line",
    "examine_weir_iron",
    "take_weir_iron",
    "look_around",
    "inventory",
  ]);
  // Same-room actions preserve Pell's auto-resumed exchange; leaving north closes it.
  if (readBook) state = playAction(state, "read_flood_book");
  state = playAction(state, "take_weir_iron");
  state = playAction(state, "take_life_line");
  state = playAction(state, "go_north");
  state = playUntil(state, "use_weir_iron_on_head_rack", "rack_freed");
  state = playAction(state, "go_north");
  state = playAction(state, "use_life_line_on_walk_span");
  state = playAction(state, "go_north");
  state = playUntil(state, "use_weir_iron_on_race_winch", "race_open");
  return playAction(state, "go_north");
}

function endingDescription(state: GameState): string {
  expect(state.ended).toBe(true);
  const observation = buildRpgObservation(index, state);
  expect(observation.title).toBe("The Weir Holds");
  return observation.description;
}

const score = (state: GameState): number => buildRpgObservation(index, state).score;

describe("bug_0443 - Breaking Weir ending names the unread flood-book", () => {
  it("explains the 45/50 victory when the player skipped the flood-book", () => {
    const state = winBreakingWeir({ readBook: false });

    expect(state.endingId).toBe("ending_held");
    expect(state.flags["read_marks"]).toBeUndefined();
    expect(score(state)).toBe(45);
    expect(endingDescription(state)).toMatch(/flood-book.*last marks unread/is);
    expect(endingDescription(state)).toContain("Final score: 45 of 50.");
  });

  it("keeps the full-score ending clean once the flood-book was read", () => {
    const state = winBreakingWeir({ readBook: true });

    expect(state.endingId).toBe("ending_held");
    expect(state.flags["read_marks"]).toBe(true);
    expect(score(state)).toBe(50);
    expect(endingDescription(state)).not.toMatch(/last marks unread/i);
    expect(endingDescription(state)).toContain("Final score: 50 of 50.");
  });
});
