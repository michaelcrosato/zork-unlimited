/**
 * Regression for bug_0461: a blind playtest reached ending_truth through the
 * crawlspace at 20/45 while the epilogue said truth was worth more than escaping
 * rich. The scoreboard must no longer tell players the moral ending was a poor
 * solve.
 */
import { describe, expect, it } from "vitest";
import type { Action } from "../../src/api/types.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { buildRules, indexPack, initStateForPack } from "../../src/cyoa/runner.js";

const loaded = loadPackFile("content/cyoa/pack/clockwork_heist.yaml");
if (!loaded.ok) throw new Error("clockwork_heist pack must compile");
const pack = loaded.compiled.pack;
const index = indexPack(pack);
const rules = buildRules(index);
const step = makeStep(rules);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

function actionIds(state: GameState): string[] {
  return buildObservation(index, state).available_actions.map((a) => a.id);
}

function play(ids: string[], seed = 7): GameState {
  let state = initStateForPack(index, seed);
  for (const id of ids) {
    const result = step(state, choose(id));
    expect(result.ok, `"${id}" legal from ${state.current}; legal=[${actionIds(state)}]`).toBe(
      true,
    );
    state = result.state;
  }
  return state;
}

const CRAWLSPACE_NO_LEDGER = [
  "inspect_clock",
  "kitchens",
  "take_pick",
  "back_foyer",
  "pry_panel",
  "open_strongbox",
];

const CRAWLSPACE_WITH_LEDGER_BEFORE_BOX = [
  "inspect_clock",
  "climb_stairs",
  "enter_study",
  "read_ledger",
  "leave_study",
  "back_down",
  "kitchens",
  "take_pick",
  "back_foyer",
  "pry_panel",
];

const VAULT_TRUTH = [
  "climb_stairs",
  "enter_study",
  "read_ledger",
  "leave_study",
  "back_down",
  "kitchens",
  "take_pick",
  "dumbwaiter",
  "approach_vault",
  "pick_lock",
  "take_letter",
];

describe("bug_0461 - Clockwork Heist truth scoring matches the ending's moral", () => {
  it("keeps the declared score cap at 45", () => {
    expect(pack.meta.max_score).toBe(45);
  });

  it("gives the no-ledger crawlspace truth route the full score", () => {
    const state = play(CRAWLSPACE_NO_LEDGER);
    expect(state.endingId).toBe("ending_truth");
    expect(state.vars.score).toBe(pack.meta.max_score);
  });

  it("uses a ledger-aware strongbox action so the crawlspace truth route still caps at 45", () => {
    const beforeBox = play(CRAWLSPACE_WITH_LEDGER_BEFORE_BOX);
    expect(beforeBox.current).toBe("crawlspace");
    expect(beforeBox.vars.score).toBe(10);
    expect(actionIds(beforeBox)).toContain("open_strongbox_after_ledger");
    expect(actionIds(beforeBox)).not.toContain("open_strongbox");

    const state = play([...CRAWLSPACE_WITH_LEDGER_BEFORE_BOX, "open_strongbox_after_ledger"]);
    expect(state.endingId).toBe("ending_truth");
    expect(state.vars.score).toBe(pack.meta.max_score);
  });

  it("leaves the vault truth and rich vault endings at the same full-score cap", () => {
    const truth = play(VAULT_TRUTH);
    expect(truth.endingId).toBe("ending_truth");
    expect(truth.vars.score).toBe(pack.meta.max_score);

    const rich = play([...VAULT_TRUTH.slice(0, -1), "grab_gold"]);
    expect(rich.endingId).toBe("ending_rich");
    expect(rich.vars.score).toBe(pack.meta.max_score);
  });
});
