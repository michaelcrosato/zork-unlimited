/**
 * Regression (§15) for bug_0068 — *The Clockwork Heist*'s clockwork-deadline arc gave the
 * gallery, vault door, and loot room reactive clock prose (bug_0019/0040/0042/0043), and
 * bug_0064 extended it to the crawlspace — but the `study` was the LAST upstairs
 * (tick-charging) room the clock never touched. That is the very room where the player
 * reads the steward's ledger and learns the watch walks "on the hour", so a clock-silent
 * study delivered the deadline clue without ever letting the player feel HOW CLOSE the
 * hour is. A fresh, MCP-only blind playtester (seed 91, report
 * ai-runs/2026-06-01T18-21-12-052Z/playtest.md, §4) reached three endings, rated the pack
 * clarity 5/5 / enjoyment 4/5 with zero functional bugs, and named exactly one friction
 * point: "the exact period of the 'hour' isn't spelled out ... a player can't tell how
 * close the hour is; it lands more as atmosphere than a solvable timing puzzle."
 *
 * The fix mirrors bug_0043's loot-room / bug_0064's crawlspace treatment: content-only
 * reactive `variants` on the `study` scene (first-match-wins, higher threshold first), so
 * the clock the rest of the manor drums up is felt HERE too, at the moment the ledger clue
 * is delivered:
 *   - ticks >= 4: the hour has come; the chime rolls up through the manor's gears into the
 *     still room and beyond the door the watch has begun to walk the gallery.
 *   - ticks >= 2: the great clock grinds toward that very hour; be gone before it strikes.
 * The clock is named only by the manor-wide motif (gears, chime) and the VISIBLE open
 * ledger page the base text already describes — never by foreknowledge the entrant lacks
 * (the bug_0058 leak lesson), so the >=4 variant is sound for the no-ledger player who can
 * also stand here past the hour (gallery -> enter_study). The base `text` is UNCHANGED. No
 * choice, effect, flag, item, exit, gating, or reachable ending changes.
 *
 * Locked here:
 *   (1) the earliest study visit (climb -> landing -> study, ticks 2) shows the
 *       grinds-toward-the-hour prose, NOT the on-the-hour prose;
 *   (2) a study visit at the hour (ticks >= 4) shows the chime/walk on-the-hour prose,
 *       NOT the running variant — and it fires with read_ledger UNSET (no foreknowledge);
 *   (3) the base text is unchanged: it still names the open ledger's watch-rounds page,
 *       and a synthetic fresh (ticks 0) state renders it verbatim with no clock prose;
 *   (4) the load-bearing read_ledger clue and saw_plate flag are untouched in every variant;
 *   (5) reachability unchanged — all four endings still fire (text-only edit).
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack, sceneText } from "../../src/cyoa/runner.js";
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
  let s = initStateForPack(index, 91);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}

// Earliest reachable study visit: climb(landing tick1) -> enter_study(study tick2).
const STUDY_AT_T2 = ["climb_stairs", "enter_study"];
// Re-enter to reach the hour WITHOUT reading the ledger:
// climb(1) study(2) leave(landing 3) study(4) -> the chimed variant, read_ledger UNSET.
const STUDY_AT_T4 = ["climb_stairs", "enter_study", "leave_study", "enter_study"];

const RUNNING = /great clock grinds toward that very hour|before it strikes/i;
const HOUR =
  /hour that page names has come round at last|chime rolls up through the manor|watch has begun to walk the gallery/i;
const LEDGER_PAGE = /when the watch walks its rounds/i; // load-bearing clue retained

describe("bug_0068 — the clock deadline is felt in the study, where the ledger clue is read", () => {
  it("the earliest study visit (ticks 2) shows the grinds-toward-the-hour prose, not the hour prose", () => {
    const s = play(STUDY_AT_T2);
    expect(s.current).toBe("study");
    expect(s.vars.ticks).toBeGreaterThanOrEqual(2);
    expect(s.vars.ticks).toBeLessThan(4);
    const text = buildObservation(index, s).text;
    expect(text).toMatch(RUNNING);
    expect(text).not.toMatch(HOUR);
    expect(text).toMatch(LEDGER_PAGE); // the clue is still drawn out
  });

  it("a study visit at the hour (ticks >= 4) shows the chime/walk prose, and fires without read_ledger", () => {
    const s = play(STUDY_AT_T4);
    expect(s.current).toBe("study");
    expect(s.vars.ticks).toBeGreaterThanOrEqual(4);
    expect(s.flags.read_ledger).toBeFalsy(); // no foreknowledge leak — variant grounded in the visible page
    const text = buildObservation(index, s).text;
    expect(text).toMatch(HOUR);
    expect(text).not.toMatch(RUNNING);
    expect(text).toMatch(LEDGER_PAGE);
  });

  it("the base text is unchanged — names the watch-rounds page, no clock prose at ticks 0", () => {
    const study = index.pack.scenes.find((sc) => sc.id === "study")!;
    const base = study.text.toLowerCase();
    expect(base).toContain("when the watch walks its rounds");
    expect(base).toContain("never to force"); // brass-plate warning intact
    // A synthetic fresh state (ticks 0, unreachable in live play but the schema fallback)
    // falls through to the base text — no variant fires.
    const fresh = initStateForPack(index, 91);
    expect(fresh.vars.ticks).toBe(0);
    const rendered = sceneText(study, fresh);
    expect(rendered).toBe(study.text);
    expect(rendered).not.toMatch(HOUR);
    expect(rendered).not.toMatch(RUNNING);
  });

  it("the load-bearing study mechanics survive in every reachable variant", () => {
    for (const route of [STUDY_AT_T2, STUDY_AT_T4]) {
      const s = play(route);
      expect(s.flags.saw_plate).toBe(true); // set on every study entry (bug_0058)
      // read_ledger is still offered (gated only on not_flag read_ledger), proving the clue
      // remains reachable under the new reactive text.
      const actions = buildObservation(index, s).available_actions.map((a) => a.id);
      expect(actions).toContain("read_ledger");
      expect(actions).toContain("leave_study");
    }
  });

  it("reachability/feedback unchanged — all four endings still fire (text-only edit)", () => {
    expect(
      play(["kitchens", "take_pick", "dumbwaiter", "approach_vault", "pick_lock", "grab_gold"])
        .endingId,
    ).toBe("ending_rich");
    expect(
      play(["kitchens", "take_pick", "dumbwaiter", "approach_vault", "pick_lock", "take_letter"])
        .endingId,
    ).toBe("ending_truth");
    expect(play(["climb_stairs", "approach_vault", "force_door"]).endingId).toBe("ending_caught");
    expect(
      play([
        "kitchens",
        "take_pick",
        "dumbwaiter",
        "enter_study",
        "leave_study",
        "cross_to_vault_blind",
      ]).endingId,
    ).toBe("ending_patrol");
  });
});
