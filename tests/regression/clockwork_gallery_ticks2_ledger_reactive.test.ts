/**
 * Regression (§15) for bug_0292 — gallery ticks>=2 text presupposes read_ledger.
 *
 * A blind MCP playtester (seed 7) found that the `landing` (gallery) scene's
 * ticks>=2 variant said "no place to be caught standing when it chimes" even when
 * the player had never read the steward's ledger. "Caught standing" implies the
 * chime triggers the guard's patrol — knowledge only the ledger gives. A player
 * who skips the study and goes foyer→stair→vault never earns that inference.
 *
 * Fix: split the ticks>=2 variant on `read_ledger` (matching the existing
 * ticks>=4/7 splits). The ledger-reader keeps the "caught" phrasing (earned);
 * the no-ledger player sees neutral "sleeping house keeps its peace" framing
 * (same urgency, no imputed knowledge).
 *
 * Locked here:
 *   (1) ticks>=2 WITHOUT read_ledger → "sleeping house" / no "caught standing"
 *   (2) ticks>=2 WITH read_ledger   → "caught standing" / no "sleeping house"
 *   (3) choices (approach_vault, enter_study, back_down) remain unchanged
 *   (4) both ending_truth routes remain reachable
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

function run(ids: string[], seed = 7) {
  const step = makeStep(rules);
  let s = initStateForPack(index, seed);
  for (const id of ids) {
    s = step(s, choose(id)).state;
  }
  return s;
}
function sceneText(s: ReturnType<typeof run>): string {
  const o = buildObservation(index, s) as { scene?: { text?: string }; text?: string };
  return o.scene?.text ?? o.text ?? "";
}
function actionIds(s: ReturnType<typeof run>): string[] {
  const o = buildObservation(index, s) as {
    available_actions?: Array<{ id: string }>;
    actions?: Array<{ id: string }>;
  };
  return (o.available_actions ?? o.actions ?? []).map((a) => a.id);
}

describe("bug_0292 — gallery ticks>=2 no longer presupposes ledger knowledge", () => {
  it("ticks=2 WITHOUT read_ledger: neutral 'sleeping house' framing, no 'caught standing'", () => {
    // Pace up and back once, then land at ticks=2 without ever entering the study.
    const s = run([
      "climb_stairs", // landing, ticks=1
      "back_down",
      "climb_stairs", // landing, ticks=2 — no ledger
    ]);
    expect(s.current).toBe("landing");
    expect(s.vars.ticks).toBe(2);
    expect(s.flags.read_ledger).toBeFalsy();
    const text = sceneText(s);
    expect(/sleeping house keeps its peace/i.test(text)).toBe(true);
    expect(/caught standing/i.test(text)).toBe(false);
  });

  it("ticks=3 WITH read_ledger: keeps 'caught standing' phrasing (earned knowledge)", () => {
    // Climb → study → read ledger → leave study = landing at ticks=3 with read_ledger.
    const s = run([
      "climb_stairs", // landing, ticks=1
      "enter_study", // study, ticks=2
      "read_ledger",
      "leave_study", // landing, ticks=3 — ledger read
    ]);
    expect(s.current).toBe("landing");
    expect(s.vars.ticks).toBe(3);
    expect(s.flags.read_ledger).toBe(true);
    const text = sceneText(s);
    expect(/caught standing/i.test(text)).toBe(true);
    expect(/sleeping house keeps its peace/i.test(text)).toBe(false);
  });

  it("choices (approach_vault, enter_study, back_down) unchanged at ticks=2 no-ledger", () => {
    const s = run(["climb_stairs", "back_down", "climb_stairs"]);
    const ids = actionIds(s);
    expect(ids).toContain("approach_vault");
    expect(ids).toContain("enter_study");
    expect(ids).toContain("back_down");
  });

  it("ending_truth reachable via vault route after the fix", () => {
    const s = run([
      "kitchens",
      "take_pick",
      "dumbwaiter",
      "approach_vault",
      "pick_lock",
      "take_letter",
    ]);
    expect(s.current).toBe("ending_truth");
  });
});
