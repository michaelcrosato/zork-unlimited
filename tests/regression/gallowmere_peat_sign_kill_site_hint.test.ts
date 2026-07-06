/**
 * Regression for bug_0393 — Gallowmere's northward peat sign did not tell a
 * direct player that the optional east kill-site is the combat-prep clue.
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import { makeStep, actionEquals } from "../../src/core/engine.js";
import type { RpgAction } from "../../src/api/types.js";
import type { GameEvent } from "../../src/core/events.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadRpgSourceFile("content/rpg/quests/gallowmere.yaml");
if (!loaded.ok) throw new Error("gallowmere must compile");
const index = indexRpgPack(loaded.compiled.pack);
const rules = buildRpgRules(index);
const step = makeStep(rules);

function act(state: GameState, RpgAction: RpgAction): { state: GameState; text: string } {
  expect(
    rules.legalActions(state).some((a) => actionEquals(a, RpgAction)),
    `RpgAction ${JSON.stringify(RpgAction)} must be legal in ${state.current}`,
  ).toBe(true);
  const result = step(state, RpgAction);
  expect(result.ok, result.rejectionReason).toBe(true);
  return {
    state: result.state,
    text: result.events
      .filter((e): e is GameEvent & { type: "narration"; text: string } => e.type === "narration")
      .map((e) => e.text)
      .join(" "),
  };
}

describe("bug_0393 — Gallowmere peat sign points direct players to the kill-site", () => {
  it("examination says the east kill-site holds the useful charge-angle reading", () => {
    let state = initStateForRpgPack(index, 7);
    state = act(state, { type: "MOVE", direction: "north" }).state;

    const looked = act(state, { type: "LOOK", target: "peat_sign" });

    expect(looked.text).toContain("charge angle");
    expect(looked.text).toContain("kill-site to the east");
    expect(looked.text).toContain("before you commit yourself to the gully");
    expect(looked.state.flags["found_kill"]).toBeUndefined();
    expect(looked.state.vars.score ?? 0).toBe(0);
  });
});
