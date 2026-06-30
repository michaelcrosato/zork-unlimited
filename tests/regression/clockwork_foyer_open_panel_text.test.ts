/**
 * Regression (§15) for bug_0063 — *The Clockwork Heist*'s foyer did not acknowledge
 * the crawlspace panel once it was pried open. The foyer's reactive text (bug_0020 /
 * bug_0061) escalated with the clock's `ticks`, but every tier described the great
 * clock as a sealed wall "vast as a coffin" even after the player had pried the panel
 * behind its pendulum (`found_passage`) and crawled the passage. A blind MCP playtester
 * (seed 29, report ai-runs/2026-06-01T17-25-58-433Z/playtest.md, §4 + §5) flagged the
 * stale room text: "the foyer scene text never changes — it still describes the clock
 * vast as a coffin with no mention of the now-open panel behind it."
 *
 * It is also a legibility beat, not only cosmetics: once `found_passage` is set but the
 * player has no lockpick, the foyer's `enter_panel` choice is HIDDEN (it gates on the
 * pick), so without this text the crawlspace's only on-screen trace is a journal line.
 *
 * The fix is content-only and uses the existing CYOA `variants` reactive-text feature
 * (bug_0018): the foyer gains a `found_passage`-paired variant at each tick tier
 * (>=4, >=2, and base), first-match-wins, so the open-panel acknowledgment survives the
 * clock's escalation. No flag/tick/route/gating/ending change.
 *
 * Locked here:
 *   (1) found_passage at low ticks → foyer names the open panel / dark crawlspace,
 *       and the `enter_panel` choice stays hidden without the lockpick;
 *   (2) found_passage at ticks 2-3 → panel acknowledgment AND the tension cue;
 *   (3) found_passage at ticks >= 4 → panel acknowledgment AND the on-the-hour cue;
 *   (4) WITHOUT found_passage the foyer never mentions the crawlspace (no leak), at
 *       both low and high ticks;
 *   (5) reachability is unchanged — all four endings still fire (text-only edit).
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
const rules = buildRules(index);
const choose = (id: string) => ({ type: "CHOOSE", choiceId: id }) as const;

function play(ids: string[]): GameState {
  const step = makeStep(rules);
  let s = initStateForPack(index, 29);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}

// Prying the panel sets `found_passage` and drops you into the crawlspace; crawl
// back out to read the foyer with the passage open. The foyer never advances ticks,
// so we climb up and oscillate study <-> gallery to burn the clock, then retreat.
const OPEN_PANEL = ["inspect_clock", "pry_panel", "back_crawl"]; // foyer, found_passage, t0
//   ...then climb(1) study(2) landing(3) -> back_down to foyer @ t3 (tension band)
const PANEL_T3 = [...OPEN_PANEL, "climb_stairs", "enter_study", "leave_study", "back_down"];
//   ...climb(1) study(2) landing(3) study(4) landing(5) -> back_down to foyer @ t5
const PANEL_T5 = [
  ...OPEN_PANEL,
  "climb_stairs",
  "enter_study",
  "leave_study",
  "enter_study",
  "leave_study",
  "back_down",
];

// A no-pry climb-and-retreat reaches the same high ticks WITHOUT found_passage.
const NOPANEL_T5 = [
  "climb_stairs",
  "enter_study",
  "leave_study",
  "enter_study",
  "leave_study",
  "back_down",
];

const PANEL = /pried loose|dark crawlspace/i;
const TENSION = /grinds toward the hour|running short/i;
const HOUR = /come round to the hour|watchman's tread/i;

describe("bug_0063 — the foyer acknowledges the pried-open crawlspace panel", () => {
  it("low ticks + found_passage: foyer names the open panel; enter_panel stays hidden without the pick", () => {
    const s = play(OPEN_PANEL);
    expect(s.current).toBe("foyer");
    expect(s.vars.ticks).toBe(0);
    const obs = buildObservation(index, s);
    expect(obs.text).toMatch(PANEL);
    expect(obs.text).not.toMatch(TENSION);
    expect(obs.text).not.toMatch(HOUR);
    // No lockpick yet, so the re-entry choice is gated off — the text is the only cue.
    expect(obs.available_actions.map((a) => a.id)).not.toContain("enter_panel");
  });

  it("ticks 2-3 + found_passage: panel acknowledgment AND the tension cue, not yet the hour", () => {
    const s = play(PANEL_T3);
    expect(s.current).toBe("foyer");
    expect(s.vars.ticks).toBe(3);
    const obs = buildObservation(index, s);
    expect(obs.text).toMatch(PANEL);
    expect(obs.text).toMatch(TENSION);
    expect(obs.text).not.toMatch(HOUR);
  });

  it("ticks >= 4 + found_passage: panel acknowledgment AND the on-the-hour cue", () => {
    const s = play(PANEL_T5);
    expect(s.current).toBe("foyer");
    expect(s.vars.ticks).toBeGreaterThanOrEqual(4);
    const obs = buildObservation(index, s);
    expect(obs.text).toMatch(PANEL);
    expect(obs.text).toMatch(HOUR);
  });

  it("without found_passage the foyer never mentions the crawlspace (no leak)", () => {
    const low = buildObservation(index, play(["climb_stairs", "back_down"]));
    expect(low.scene_id).toBe("foyer");
    expect(low.text).not.toMatch(PANEL);
    const high = play(NOPANEL_T5);
    expect(high.current).toBe("foyer");
    expect(high.vars.ticks).toBeGreaterThanOrEqual(4);
    const highObs = buildObservation(index, high);
    expect(highObs.text).not.toMatch(PANEL);
    expect(highObs.text).toMatch(HOUR); // still escalates — only the panel line is gated
  });

  it("reachability unchanged — all four endings still fire (text-only edit)", () => {
    expect(
      play(["inspect_clock", "kitchens", "take_pick", "back_foyer", "pry_panel", "open_strongbox"])
        .endingId,
    ).toBe("ending_truth");
    expect(play(["climb_stairs", "approach_vault", "force_door"]).endingId).toBe("ending_caught");
    expect(
      play(["kitchens", "take_pick", "dumbwaiter", "approach_vault", "pick_lock", "grab_gold"])
        .endingId,
    ).toBe("ending_rich");
    expect(play([...NOPANEL_T5, "climb_stairs", "cross_to_vault_blind"]).endingId).toBe(
      "ending_patrol",
    );
  });
});
