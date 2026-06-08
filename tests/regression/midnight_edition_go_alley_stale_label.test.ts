/**
 * Regression (§15) for bug_0312 — *The Midnight Edition*'s composing_room offered
 * "Go to the alley door and the boots on the cobbles." as an available action even
 * after the alley door was barred (door_barred set). The scene TEXT had been made
 * reactive (bugs 0268/0310) but the action LABEL was static — creating a contradiction
 * where the prose said "the alley door is barred fast" and the action implied the
 * threat was still live and the door open.
 *
 * Fix: split into two conditional choices.
 *   - `go_alley`        gated `{ not_flag: door_barred }` — atmospheric "boots" label
 *                        while the door is still a threat.
 *   - `go_alley_barred` gated `{ has_flag: door_barred }` — "Return to the barred
 *                        alley door." once barred. Same `next: alley_door`.
 *
 * This test locks:
 *   (1) Before barring: `go_alley` present, label contains "boots on the cobbles".
 *   (2) Before barring: `go_alley_barred` absent.
 *   (3) After barring: `go_alley` absent (stale label no longer offered).
 *   (4) After barring: `go_alley_barred` present, label does NOT contain "boots".
 *   (5) After barring via `go_alley_barred`, the alley scene is still reachable
 *       (confront_men and back_inside are the live choices there).
 *   (6) Winning route (ending_vindicated 35/35) unaffected.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadPackFile("content/cyoa/pack/midnight_edition.yaml");
if (!loaded.ok) throw new Error("midnight_edition pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

function play(ids: string[], seed = 7) {
  const step = makeStep(rules);
  let s = initStateForPack(index, seed);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}
const actions = (s: ReturnType<typeof play>) => buildObservation(index, s).available_actions;

describe("bug_0312 — composing_room go_alley action label is not stale after door is barred", () => {
  it("(1) before barring: go_alley present with 'boots on the cobbles' label", () => {
    const s = play([]);
    const acts = actions(s);
    const alley = acts.find((a) => a.id === "go_alley");
    expect(alley, "go_alley must be present before barring").toBeTruthy();
    expect(alley!.text.toLowerCase()).toContain("boots on the cobbles");
  });

  it("(2) before barring: go_alley_barred must be absent", () => {
    const s = play([]);
    expect(actions(s).find((a) => a.id === "go_alley_barred")).toBeUndefined();
  });

  it("(3) after barring: go_alley must be absent (stale label gone)", () => {
    const s = play(["go_alley", "bar_door"]);
    expect(s.flags["door_barred"]).toBe(true);
    expect(actions(s).find((a) => a.id === "go_alley")).toBeUndefined();
  });

  it("(4) after barring: go_alley_barred present, label does not say 'boots on the cobbles'", () => {
    const s = play(["go_alley", "bar_door"]);
    const barred = actions(s).find((a) => a.id === "go_alley_barred");
    expect(barred, "go_alley_barred must be present after barring").toBeTruthy();
    expect(barred!.text.toLowerCase()).not.toContain("boots on the cobbles");
    expect(barred!.text.toLowerCase()).toContain("barred");
  });

  it("(5) go_alley_barred routes to alley_door where confront_men is available", () => {
    const s = play(["go_alley", "bar_door", "go_alley_barred"]);
    expect(s.current).toBe("alley_door");
    const alleyActions = actions(s).map((a) => a.id);
    expect(alleyActions).toContain("confront_men");
    expect(alleyActions).toContain("back_inside");
    // bar choices must be gated off (door already barred)
    expect(alleyActions).not.toContain("bar_door");
    expect(alleyActions).not.toContain("steady_and_bar");
  });

  it("(6) winning route ending_vindicated 35/35 still reachable", () => {
    const s = play([
      "read_letter",
      "go_office",
      "search_desk",
      "open_safe",
      "read_report",
      "leave_office",
      "go_press",
      "print_verified",
    ]);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_vindicated");
    expect(s.vars["score"]).toBe(35);
  });
});
