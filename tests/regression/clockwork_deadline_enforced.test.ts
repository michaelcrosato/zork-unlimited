/**
 * Regression (§15) for bug_0079 — *The Clockwork Heist*'s namesake mechanic, the
 * ticking clock, was the loudest thing in the pack ("be gone before the chime",
 * "no place to be caught standing when it chimes") yet `ticks` was never enforced:
 * a Chekhov's gun. A fresh blind MCP playtester (seed 7, report
 * ai-runs/2026-06-01T21-00-24-111Z/playtest.md, §4/§5/§6) reached every ending and
 * rated the pack 5/5 clarity, but flagged in three separate sections that the clock
 * "looks like a timer but isn't enforced ... ran 6+ ticks with no penalty," a
 * "Chekhov's gun that never fires." bug_0061 had already made the urgency text honest
 * (point it at the house/watchman waking, not a phantom timeout); this closes the loop
 * by giving that warning a real consequence.
 *
 * The fix adds a general, opt-in engine `deadline` (meta.deadline → the §8.4.5
 * `checkWin` hook in the CYOA runner): after any action, if `deadline.when` holds the
 * game ends at `deadline.ending`. The clockwork pack sets it to `ticks >= 10` →
 * `ending_overstayed`. It is tuned GENEROUS so it never punishes honest play, only
 * aimless circling:
 *   - the efficient vault route is ~4 ticks;
 *   - a maximally thorough first-timer wins at ticks 6 (asserted below);
 *   - the existing clockwork_guard_patrol_deadline suite drives legitimate dawdle
 *     routes to ticks 7 at the gallery and treats them as still-playable (asserted
 *     here too — the deadline must NOT fire at 7);
 *   - only genuine wandering of the patrolled upstairs reaches 10 (asserted).
 *
 * Locked here:
 *   (1) the deadline is a declared, validator-reachable ending and the pack validates
 *       clean (no engine/validator regression from the new mechanic);
 *   (2) the thorough vault route still WINS at ending_rich with ticks 6 — the deadline
 *       leaves honest, even thorough, play untouched;
 *   (3) a ticks-7 dawdle is still playable at the gallery (deadline does not fire early);
 *   (4) aimless circling to ticks >= 10 ends the game at ending_overstayed, with the
 *       observation rendering that ending's epilogue (not the scene under it);
 *   (5) every original ending still fires (rich / truth / caught / patrol).
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { validateCyoa } from "../../src/validate/cyoa_validator.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadPackFile("content/cyoa/pack/clockwork_heist.yaml");
if (!loaded.ok) throw new Error("clockwork_heist pack must compile");
const pack = loaded.compiled.pack;
const index = indexPack(pack);
const rules = buildRules(index);
const choose = (id: string) => ({ type: "CHOOSE", choiceId: id }) as const;

function play(ids: string[]): GameState {
  const step = makeStep(rules);
  let s = initStateForPack(index, 7);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}

// A maximally thorough FIRST-TIMER win: explore upstairs, read the ledger, poke the
// vault before finding the pick (a natural re-entry costing a tick), backtrack to the
// kitchen for the lockpick, return, and crack the vault. Reaches ticks 6 (verified live
// via MCP, seed 7) and still wins — the high-water mark of honest play.
const THOROUGH_RICH = [
  "climb_stairs", // landing, ticks 1
  "enter_study", // study, ticks 2
  "read_ledger", // (self-goto, no tick)
  "leave_study", // landing, ticks 3
  "approach_vault", // vault_door (no tick)
  "study_lock", // -> landing, ticks 4 (no pick yet)
  "back_down", // foyer (no tick)
  "kitchens", // kitchen, ticks 5
  "take_pick", // (self-goto, no tick)
  "dumbwaiter", // landing, ticks 6
  "approach_vault", // vault_door (ledger reader crosses safely even at the hour)
  "pick_lock", // vault
  "grab_gold", // ending_rich
];

// A ticks-7 dawdle at the gallery — the established "still playable" ceiling from the
// patrol-deadline suite. The new deadline (>= 10) must NOT fire here.
const DAWDLE_T7 = [
  "climb_stairs", // 1
  "enter_study", // 2
  "leave_study", // 3
  "enter_study", // 4
  "leave_study", // 5
  "enter_study", // 6
  "leave_study", // 7
];

// Aimless circling past the deadline: keep oscillating study <-> gallery until the
// hour fully turns. climb(1) + four study/landing pairs reaches landing at ticks 9,
// then one more study entry ticks to 10 and trips the deadline on entry.
const OVERSTAY = [
  "climb_stairs", // 1
  "enter_study", // 2
  "leave_study", // 3
  "enter_study", // 4
  "leave_study", // 5
  "enter_study", // 6
  "leave_study", // 7
  "enter_study", // 8
  "leave_study", // 9
  "enter_study", // 10 -> deadline
];

const VAULT_RICH = [
  "kitchens",
  "take_pick",
  "dumbwaiter",
  "approach_vault",
  "pick_lock",
  "grab_gold",
];
const CRAWLSPACE_TRUTH = [
  "inspect_clock",
  "kitchens",
  "take_pick",
  "back_foyer",
  "pry_panel",
  "open_strongbox",
];
const FORCE_CAUGHT = ["climb_stairs", "approach_vault", "force_door"];
const PATROL = [
  "climb_stairs",
  "enter_study",
  "leave_study",
  "enter_study",
  "leave_study",
  "enter_study",
  "leave_study",
  "cross_to_vault_blind",
];

describe("bug_0079 — the namesake clock has real teeth (meta.deadline / engine checkWin)", () => {
  it("the deadline ending is declared, validator-reachable, and the pack validates clean", () => {
    expect(pack.meta.deadline).toEqual({
      when: [{ var_gte: { name: "ticks", value: 10 } }],
      ending: "ending_overstayed",
    });
    expect(pack.endings.some((e) => e.id === "ending_overstayed")).toBe(true);
    const report = validateCyoa(pack);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    // Specifically: the deadline ending is NOT flagged unreachable.
    expect(report.findings.some((f) => f.code === "ENDING_UNREACHABLE")).toBe(false);
  });

  it("the thorough vault route still wins (ticks 6) — honest play is never punished", () => {
    const s = play(THOROUGH_RICH);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_rich");
    expect(s.vars.ticks).toBe(6); // the high-water mark of honest play, well under 10
  });

  it("a ticks-7 dawdle is still playable at the gallery — the deadline does not fire early", () => {
    const s = play(DAWDLE_T7);
    expect(s.ended).toBe(false);
    expect(s.current).toBe("landing");
    expect(s.vars.ticks).toBe(7);
  });

  it("aimless circling to ticks >= 10 ends at ending_overstayed, rendering its epilogue", () => {
    const s = play(OVERSTAY);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_overstayed");
    expect(s.vars.ticks).toBeGreaterThanOrEqual(10);
    // The observation shows the ENDING's epilogue (current was repointed by the
    // checkWin goto), not the scene the player was standing in.
    const obs = buildObservation(index, s);
    expect(obs.scene_id).toBe("ending_overstayed");
    expect(obs.title).toBe("The Hour Turns");
    expect(obs.text).toMatch(/lingered too long|stayed past his welcome/i);
    expect(obs.available_actions).toEqual([]);
  });

  it("every original ending still fires (rich / truth / caught / patrol)", () => {
    expect(play(VAULT_RICH).endingId).toBe("ending_rich");
    expect(play(CRAWLSPACE_TRUTH).endingId).toBe("ending_truth");
    expect(play(FORCE_CAUGHT).endingId).toBe("ending_caught");
    expect(play(PATROL).endingId).toBe("ending_patrol");
  });
});
