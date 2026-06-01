/**
 * Regression (§15) for bug_0020 — *The Clockwork Heist*'s time-pressure deadline
 * (bug_0019) made the gallery prose escalate as the clock creeps toward the hour,
 * but the urgency text was scoped to the gallery ONLY. The foyer — which houses the
 * namesake great clock, "vast as a coffin," right against its far wall — kept
 * narrating its calm opening text no matter how late it got, so a player who
 * climbed up, burned ticks, and retreated to the foyer got no cue the hour was
 * upon them. Surfaced by a blind MCP playtester (seed 67, report
 * ai-runs/2026-06-01T08-10-22-369Z/playtest.md, §4 + §5): "the urgency text is
 * scoped to the gallery and absent in the foyer, which slightly undercuts the
 * omnipresent-clock motif."
 *
 * The fix is content-only and uses the existing CYOA `variants` reactive-text
 * feature (bug_0018): the foyer gains a tension variant at ticks >= 4 and an
 * on-the-hour variant at ticks >= 6 (higher threshold first, first-match-wins),
 * mirroring the gallery's escalation. The foyer remains safe ground — it never
 * advances `ticks` and its choices are unchanged; only the narrated text reacts.
 *
 * Locked here:
 *   (1) the foyer reads its calm base text at low ticks (no tension/hour cue);
 *   (2) at ticks 4-5 (reached by dawdling upstairs then retreating) the foyer
 *       shows the "running short" tension variant but not the hour cue;
 *   (3) at ticks >= 6 the foyer shows the on-the-hour / watchman variant;
 *   (4) reachability is unchanged — all four endings still fire (text-only edit).
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadPackFile("content/cyoa/pack/clockwork_heist.yaml");
if (!loaded.ok) throw new Error("clockwork_heist pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

function play(ids: string[]): GameState {
  const step = makeStep(rules);
  let s = initStateForPack(index, 67);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}

// ticks advance only on a real room change; the foyer never ticks, so we climb
// up, oscillate study <-> gallery to burn the clock, then retreat to the foyer.
//   climb(1) study(2) landing(3) study(4) landing(5) -> back_down to foyer @ t5
const FOYER_T5 = [
  "climb_stairs",
  "enter_study",
  "leave_study",
  "enter_study",
  "leave_study",
  "back_down",
];
//   ...study(6) landing(7) -> back_down to foyer @ t7
const FOYER_T7 = [
  "climb_stairs",
  "enter_study",
  "leave_study",
  "enter_study",
  "leave_study",
  "enter_study",
  "leave_study",
  "back_down",
];
// A quick out-and-back keeps ticks low (climb=1, retreat doesn't tick).
const FOYER_T1 = ["climb_stairs", "back_down"];

const TENSION = /running short|grinds toward the hour/i;
const HOUR = /watchman's tread|come round to the hour/i;

describe("bug_0020 — the foyer's namesake clock feels the deadline too", () => {
  it("reads calm base text at low ticks — no tension, no hour cue", () => {
    const obs = buildObservation(index, play(FOYER_T1));
    expect(obs.scene_id).toBe("foyer");
    expect(obs.text).not.toMatch(TENSION);
    expect(obs.text).not.toMatch(HOUR);
  });

  it("at ticks 4-5 the foyer shows the 'running short' tension, not yet the hour", () => {
    const s = play(FOYER_T5);
    expect(s.current).toBe("foyer");
    expect(s.vars.ticks).toBe(5);
    const obs = buildObservation(index, s);
    expect(obs.text).toMatch(TENSION);
    expect(obs.text).not.toMatch(HOUR);
  });

  it("at ticks >= 6 the foyer shows the on-the-hour watchman variant", () => {
    const s = play(FOYER_T7);
    expect(s.current).toBe("foyer");
    expect(s.vars.ticks).toBeGreaterThanOrEqual(6);
    const obs = buildObservation(index, s);
    expect(obs.text).toMatch(HOUR);
  });

  it("reachability unchanged — all four endings still fire (text-only edit)", () => {
    // bug_0022: the crawlspace truth now needs the lockpick (no brute-force pry).
    expect(
      play(["inspect_clock", "kitchens", "take_pick", "back_foyer", "pry_panel", "open_strongbox"])
        .endingId,
    ).toBe("ending_truth");
    expect(play(["climb_stairs", "approach_vault", "force_door"]).endingId).toBe("ending_caught");
    expect(
      play(["kitchens", "take_pick", "dumbwaiter", "approach_vault", "pick_lock", "grab_gold"])
        .endingId,
    ).toBe("ending_rich");
    expect(play([...FOYER_T7, "climb_stairs", "cross_to_vault_blind"]).endingId).toBe(
      "ending_patrol",
    );
  });
});
