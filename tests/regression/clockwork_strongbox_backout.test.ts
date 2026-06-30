/**
 * Regression (§15) for bug_0407 — Clockwork Heist's no-pick strongbox nudge
 * moved the player from crawlspace to foyer without saying they physically backed
 * out. A blind MCP playtest saw the foyer scene appear abruptly after the nudge.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadPackFile("content/cyoa/pack/clockwork_heist.yaml");
if (!loaded.ok) throw new Error("clockwork_heist pack must compile");
const index = indexPack(loaded.compiled.pack);
const step = makeStep(buildRules(index));
const choose = (id: string) => ({ type: "CHOOSE", choiceId: id }) as const;

function chooseAvailable(s: GameState, id: string): ReturnType<typeof step> {
  const actions = buildObservation(index, s).available_actions.map((a) => a.id);
  expect(actions, `"${id}" should be available in ${s.current}`).toContain(id);
  const result = step(s, choose(id));
  expect(result.ok).toBe(true);
  return result;
}

describe("bug_0407 — clockwork strongbox nudge narrates the back-out move", () => {
  it("says the thief backs out through the panel before landing in the foyer", () => {
    let s = initStateForPack(index, 11);
    s = chooseAvailable(s, "inspect_clock").state;
    s = chooseAvailable(s, "pry_panel").state;

    expect(s.current).toBe("crawlspace");
    const result = chooseAvailable(s, "study_strongbox");
    const narration = result.events
      .filter((event) => event.type === "narration")
      .map((event) => event.text)
      .join("\n");

    expect(result.state.current).toBe("foyer");
    expect(result.events).toContainEqual({ type: "move", from: "crawlspace", to: "foyer" });
    expect(narration).toMatch(/back out through the panel to the foyer/i);
    expect(narration).toMatch(/kitchens/i);
    expect(narration).toMatch(/study/i);
  });
});
