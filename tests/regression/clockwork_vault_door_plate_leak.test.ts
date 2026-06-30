/**
 * Regression (§15) for bug_0058 — the vault door's brass-plate leak in clockwork_heist.
 *
 * A blind MCP playtester (seed 53) found that the `vault_door` scene "echoed" the
 * steward's brass plate ("force will not open this") even on the route that climbs
 * the grand stair straight to the vault without ever entering the study — where the
 * plate actually hangs. The same leak lived in the lockpick-less `study_lock` nudge
 * narration ("the brass plate's warning rings true"). The fix makes every brass-plate
 * reference route-aware: entering the study sets `saw_plate`, the vault-door base text
 * is plate-naive, a `saw_plate` variant restores the plate echo for study-visitors,
 * and the study_lock narration learns "force won't work" from the lock itself.
 * Locked here:
 *   (1) the no-study route gets plate-NAIVE vault text (no brass-plate reference);
 *   (2) visiting the study (before the hour) restores the brass-plate echo;
 *   (3) the careful ledger-at-the-hour patrol variant is unchanged (crossing + plate);
 *   (4) the study_lock no-pick nudge no longer cites the plate on a no-study route,
 *       and still moves the player to the gallery (no self-loop, no alarm);
 *   (5) all four endings (rich/truth/caught/patrol) remain reachable.
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

function run(ids: string[], seed = 53) {
  const step = makeStep(rules);
  let s = initStateForPack(index, seed);
  const events = [];
  for (const id of ids) {
    const r = step(s, choose(id));
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}
const sceneText = (s: ReturnType<typeof run>["state"]): string => {
  const obs = buildObservation(index, s) as { scene?: { text?: string }; text?: string };
  return obs.scene?.text ?? obs.text ?? "";
};

describe("bug_0058 — the vault door only echoes the brass plate to a player who saw it", () => {
  it("plate-naive base text: a straight-up-the-stair route never quotes the unseen plate", () => {
    const { state } = run(["climb_stairs", "approach_vault"]);
    expect(state.current).toBe("vault_door");
    expect(state.flags.saw_plate).toBeFalsy();
    const text = sceneText(state);
    expect(/brass plate/i.test(text)).toBe(false);
    // It still telegraphs pick-don't-force from the lock's own feel.
    expect(/never to force|coaxing|steady/i.test(text)).toBe(true);
  });

  it("restores the plate echo once the player has stood in the study (before the hour)", () => {
    const { state } = run(["climb_stairs", "enter_study", "leave_study", "approach_vault"]);
    expect(state.current).toBe("vault_door");
    expect(state.flags.saw_plate).toBe(true);
    expect(state.flags.read_ledger).toBeFalsy();
    const text = sceneText(state);
    expect(/brass plate/i.test(text)).toBe(true);
    // Not the ticks>=4 patrol-crossing variant.
    expect(/pressed to the automata/i.test(text)).toBe(false);
  });

  it("the careful ledger-at-the-hour patrol variant is unchanged (timed crossing + plate)", () => {
    const { state } = run([
      "kitchens",
      "take_pick",
      "back_foyer",
      "climb_stairs",
      "enter_study",
      "read_ledger",
      "leave_study",
      "approach_vault",
    ]);
    expect(state.current).toBe("vault_door");
    expect(state.vars.ticks).toBeGreaterThanOrEqual(4);
    expect(state.flags.read_ledger).toBe(true);
    const text = sceneText(state);
    expect(/pressed to the automata/i.test(text)).toBe(true);
    expect(/brass plate/i.test(text)).toBe(true);
  });

  it("the study_lock nudge no longer cites the plate on a no-study route, and makes progress", () => {
    const { state, events } = run(["climb_stairs", "approach_vault", "study_lock"]);
    const narr = events.filter((e) => e.type === "narration") as Array<{ text: string }>;
    expect(narr.length).toBe(1);
    const narrText = narr[0]!.text;
    expect(/brass plate/i.test(narrText)).toBe(false);
    // The bug_0008 contract: still a 'find a tool' hint, still moves to the gallery.
    expect(/tool|instrument|steady hand/i.test(narrText)).toBe(true);
    expect(state.current).toBe("landing");
    expect(state.flags.alarm).toBeFalsy();
  });

  it("all four endings remain reachable after the fix", () => {
    // Rich: pick the vault, grab gold.
    const rich = run([
      "kitchens",
      "take_pick",
      "dumbwaiter",
      "approach_vault",
      "pick_lock",
      "grab_gold",
    ]);
    expect(rich.state.current).toBe("ending_rich");
    // Truth (displayed letter): pick the vault, take the letter.
    const truth = run([
      "kitchens",
      "take_pick",
      "dumbwaiter",
      "approach_vault",
      "pick_lock",
      "take_letter",
    ]);
    expect(truth.state.current).toBe("ending_truth");
    // Caught: force the door.
    const caught = run(["climb_stairs", "approach_vault", "force_door"]);
    expect(caught.state.current).toBe("ending_caught");
    // Patrol: reach the hour with no ledger and chance the blind crossing.
    const patrol = run([
      "kitchens",
      "take_pick",
      "back_foyer",
      "climb_stairs",
      "enter_study",
      "leave_study",
      "cross_to_vault_blind",
    ]);
    expect(patrol.state.current).toBe("ending_patrol");
  });
});
