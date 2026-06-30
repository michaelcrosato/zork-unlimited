/**
 * Regression for bug_0419 -- Midnight Edition's optional steady_and_bar check looked
 * like an opaque risky fork even though both branches only change the manner of barring
 * the door. The player-facing label now makes that convergence explicit, and the forced
 * failure route proves the roll is not a hidden death or win-blocking state.
 */
import { describe, expect, it } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack, type CyoaAction } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep, type Rules } from "../../src/core/engine.js";
import { stateKey } from "./support/exhaustive_endings.js";
import type { Rng } from "../../src/core/rng.js";

const loaded = loadPackFile("content/cyoa/pack/midnight_edition.yaml");
if (!loaded.ok) throw new Error("midnight_edition pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string) => ({ type: "CHOOSE", choiceId: id }) as const;

const forcedRoll = (roll: number) => (): Rng => ({
  next: () => 0,
  int: () => roll,
});

function play(ids: string[], activeRules: Rules<CyoaAction> = rules, seed = 7) {
  const step = makeStep(activeRules);
  let state = initStateForPack(index, seed);
  for (const id of ids) state = step(state, choose(id)).state;
  return state;
}

const obs = (ids: string[], activeRules: Rules<CyoaAction> = rules) =>
  buildObservation(index, play(ids, activeRules));

describe("bug_0419 -- Midnight Edition steady_and_bar is visibly manner-only", () => {
  it("labels the optional skill check as clean/shaky convergence, not an unexplained fork", () => {
    const alley = obs(["go_alley"]);
    const steady = alley.available_actions.find((a) => a.id === "steady_and_bar");

    expect(steady).toBeDefined();
    expect(steady?.text).toMatch(/cleanly or shakily/i);
    expect(steady?.text).toMatch(/fall back inside/i);
    expect(steady?.skill_check).toEqual({ skill: "nerve", difficulty: 12, die: "d20" });
  });

  it("forced success and forced failure converge to the same playable state", () => {
    const success = play(["go_alley", "steady_and_bar"], buildRules(index, forcedRoll(20)));
    const failure = play(["go_alley", "steady_and_bar"], buildRules(index, forcedRoll(1)));

    expect(success.current).toBe("composing_room");
    expect(failure.current).toBe("composing_room");
    expect(success.ended).toBe(false);
    expect(failure.ended).toBe(false);
    expect(success.flags.door_barred).toBe(true);
    expect(failure.flags.door_barred).toBe(true);
    expect(success.flags.nerve_check_attempted).toBe(true);
    expect(failure.flags.nerve_check_attempted).toBe(true);
    expect(stateKey(success)).toBe(stateKey(failure));
    expect(failure.journal.at(-1)).toMatch(/but it holds/i);
  });

  it("a failed steady_and_bar still leaves the verified win route open", () => {
    const failedRules = buildRules(index, forcedRoll(1));
    const won = obs(
      [
        "read_letter",
        "go_office",
        "search_desk",
        "open_safe",
        "read_report",
        "leave_office",
        "go_alley",
        "steady_and_bar",
        "go_press",
        "print_verified",
      ],
      failedRules,
    );

    expect(won.ended).toBe(true);
    expect(won.ending_id).toBe("ending_vindicated");
    expect(won.state.vars.score).toBe(35);
  });
});
