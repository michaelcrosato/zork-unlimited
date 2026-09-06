/**
 * Regression for bug_0618: the Store-Shed ladder ("up" to the Fodder-Loft)
 * reused one generic "complete the currently listed yearling action" block for
 * every unmet reason, including a LURE-committed player who has not yet gone
 * to the Broken Paling at all — no yearling action is listed anywhere yet.
 * The block must name the actual pending step instead of a yearling fight
 * that is not on the current action list.
 */
import { describe, expect, it } from "vitest";

import { makeStep } from "../../src/core/engine.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import type { GameState } from "../../src/core/state.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";

const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("wolf_winter must compile");
const index = indexRpgPack(loaded.compiled.pack);

const LURE_PENDING_LOFT_BLOCK =
  "Up is blocked. Go east to the Byre-Yard, then north to the Broken Paling and LAY downwind feed line WITH Cade's winter-feed sack. Then return here to cross with Cade's LURE route.";

function act(state: GameState, id: string): GameState {
  const option = enumerateRpgActions(index, state).find((candidate) => candidate.id === id);
  expect(option, `expected ${id} legal in ${state.current}`).toBeDefined();
  if (!option) throw new Error(`missing ${id}`);
  const result = makeStep(buildRpgRules(index))(state, option.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  return result.state;
}

function blockedUpMessage(state: GameState): string | undefined {
  const observation = buildRpgObservation(index, state, {
    availableActions: enumerateRpgActions(index, state),
  });
  return observation.blocked_exits.find((exit) => exit.direction === "up")?.message;
}

describe("Wolf-Winter Store-Shed ladder guidance", () => {
  it("names the pending Broken Paling step for a LURE player who has not resolved the yearling yet", () => {
    let state = initStateForRpgPack(index, 7411);
    state.flags.approach_sheltered_stockway = true;
    state = act(state, "use_sheltered_stockway_last_mile");
    state = act(state, "talk_houndsman");
    state = act(state, "ask_lure");
    state = act(state, "ask_commit_lure");
    state = act(state, "ask_leave");
    state = act(state, "go_west");
    expect(state.current).toBe("store");
    expect(enumerateRpgActions(index, state).map((option) => option.id)).not.toContain("go_up");
    expect(blockedUpMessage(state)).toBe(LURE_PENDING_LOFT_BLOCK);

    state = act(state, "take_winter_feed_sack");
    expect(blockedUpMessage(state)).toBe(LURE_PENDING_LOFT_BLOCK);
  });
});
