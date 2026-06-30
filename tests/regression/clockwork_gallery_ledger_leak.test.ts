/**
 * Regression (§15) for bug_0066 — the gallery's ledger-foreknowledge leak in clockwork_heist.
 *
 * A blind MCP playtester (seed 23) found that the `landing` (gallery) scene's at-the-hour
 * variant said "the hourly patrol the steward's ledger warned of" UNCONDITIONALLY — even on
 * the route where the player paces up to the hour and never reads (or sees) the ledger. The
 * `cross_to_vault_blind` choice exists for exactly that no-ledger player, so naming the
 * ledger to them attributes foreknowledge they don't have — the same class of leak as the
 * bug_0058 brass-plate echo. The fix splits the `ticks>=4` variant on `read_ledger`: the
 * reader keeps the ledger callback; the non-reader sees a ledger-naive line (the watchman
 * appears at the chime, no claim of prior warning).
 * Locked here:
 *   (1) at the hour WITHOUT read_ledger, the gallery never names the ledger (and offers the
 *       blind crossing, not the safe one);
 *   (2) at the hour WITH read_ledger, the gallery keeps the "ledger warned of" callback
 *       (and offers the safe crossing);
 *   (3) all four endings (rich/truth/caught/patrol) remain reachable.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";

const loaded = loadPackFile("content/cyoa/pack/clockwork_heist.yaml");
if (!loaded.ok) throw new Error("clockwork_heist pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string) => ({ type: "CHOOSE", choiceId: id }) as const;

function run(ids: string[], seed = 23) {
  const step = makeStep(rules);
  let s = initStateForPack(index, seed);
  for (const id of ids) {
    s = step(s, choose(id)).state;
  }
  return s;
}
function obs(s: ReturnType<typeof run>) {
  return buildObservation(index, s) as {
    scene?: { text?: string };
    text?: string;
    available_actions?: Array<{ id: string }>;
    actions?: Array<{ id: string }>;
  };
}
const sceneText = (s: ReturnType<typeof run>): string => {
  const o = obs(s);
  return o.scene?.text ?? o.text ?? "";
};
const actionIds = (s: ReturnType<typeof run>): string[] => {
  const o = obs(s);
  return (o.available_actions ?? o.actions ?? []).map((a) => a.id);
};

describe("bug_0066 — the gallery only names the ledger to a player who read it", () => {
  it("at the hour WITHOUT read_ledger: no ledger reference, and the blind crossing is offered", () => {
    // Pace up the stair and back to burn ticks to the hour without ever reading the ledger.
    const s = run([
      "climb_stairs", // landing, ticks 1
      "back_down",
      "climb_stairs", // ticks 2
      "back_down",
      "climb_stairs", // ticks 3
      "back_down",
      "climb_stairs", // ticks 4 — at the hour
    ]);
    expect(s.current).toBe("landing");
    expect(s.vars.ticks).toBeGreaterThanOrEqual(4);
    expect(s.flags.read_ledger).toBeFalsy();
    const text = sceneText(s);
    // The watchman is visible (the patrol is live)...
    expect(/watchman/i.test(text)).toBe(true);
    // ...but the prose must NOT attribute ledger foreknowledge to a non-reader.
    expect(/ledger/i.test(text)).toBe(false);
    // The no-ledger player at the hour gets the blind gamble, not the safe crossing.
    const ids = actionIds(s);
    expect(ids).toContain("cross_to_vault_blind");
    expect(ids).not.toContain("approach_vault");
  });

  it("at the hour WITH read_ledger: keeps the ledger callback and offers the safe crossing", () => {
    const s = run([
      "kitchens", // ticks 1
      "take_pick",
      "back_foyer",
      "climb_stairs", // ticks 2
      "enter_study", // ticks 3
      "read_ledger",
      "leave_study", // ticks 4 — at the hour, ledger read
    ]);
    expect(s.current).toBe("landing");
    expect(s.vars.ticks).toBeGreaterThanOrEqual(4);
    expect(s.flags.read_ledger).toBe(true);
    const text = sceneText(s);
    expect(/the steward's ledger warned of/i.test(text)).toBe(true);
    const ids = actionIds(s);
    expect(ids).toContain("approach_vault");
    expect(ids).not.toContain("cross_to_vault_blind");
  });

  it("all four endings remain reachable after the fix", () => {
    const rich = run([
      "kitchens",
      "take_pick",
      "dumbwaiter",
      "approach_vault",
      "pick_lock",
      "grab_gold",
    ]);
    expect(rich.current).toBe("ending_rich");

    const truth = run([
      "kitchens",
      "take_pick",
      "dumbwaiter",
      "approach_vault",
      "pick_lock",
      "take_letter",
    ]);
    expect(truth.current).toBe("ending_truth");

    const caught = run(["climb_stairs", "approach_vault", "force_door"]);
    expect(caught.current).toBe("ending_caught");

    const patrol = run([
      "kitchens",
      "take_pick",
      "back_foyer",
      "climb_stairs",
      "enter_study",
      "leave_study",
      "cross_to_vault_blind",
    ]);
    expect(patrol.current).toBe("ending_patrol");
  });
});
