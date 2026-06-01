/**
 * Regression (§15) for bug_0019 — *The Clockwork Heist*'s steward-ledger clue,
 * "a guard walks the gallery on the hour", was a Chekhov's gun that never fired.
 * Surfaced (again) by a blind MCP playtester (seed 61, report
 * ai-runs/2026-06-01T07-53-15-619Z/playtest.md, §5, item 1) and standing across
 * the bug_0008 / bug_0017 / bug_0018 next-focus notes: "no turn/time counter, no
 * time pressure... a Chekhov's gun that points nowhere."
 *
 * The fix wires a content-only time-pressure deadline (no engine change — the
 * core `inc_var` / `var_gte` / `var_lte` DSL already exists):
 *   - meta.vars_init seeds `ticks: 0`; the upstairs rooms (kitchen, gallery,
 *     study) inc_var ticks on_enter, so moving through the manor advances the
 *     clock (the ground-floor foyer is safe and does not; self-goto in-room
 *     actions don't re-tick because the engine fires on_enter only on a genuine
 *     location change).
 *   - the gallery (`landing`) gets reactive `variants`: tension at ticks >= 4,
 *     the watchman's patrol at ticks >= 6.
 *   - on the hour (ticks >= 6) the safe `approach_vault` crossing is gated out
 *     UNLESS you read the ledger (has_flag read_ledger) — the payoff for the
 *     clue — and a clearly-labelled gamble `cross_to_vault_blind` appears that
 *     leads to the new `ending_patrol`. The safe `enter_study` / `back_down`
 *     exits always remain (no soft-lock).
 *
 * Locked here:
 *   (1) efficient play is never caught — the fast vault route keeps ticks low and
 *       reaches ending_rich, approach_vault always safe before the hour;
 *   (2) on the hour without reading the ledger: approach_vault is gone, the
 *       gamble cross_to_vault_blind is offered and leads to ending_patrol, and
 *       the safe study/foyer exits remain (no soft-lock);
 *   (3) reading the ledger is the payoff: on the hour the safe approach_vault is
 *       still offered and the blind gamble is NOT;
 *   (4) the gallery prose reacts — base text, then the "running short" tension at
 *       ticks 4-5, then the watchman's-patrol text at ticks >= 6;
 *   (5) the original three endings still fire (rich, truth, caught) and
 *       ending_patrol is a declared, reachable fourth ending.
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
  let s = initStateForPack(index, 61);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}
const optionIds = (s: GameState): string[] =>
  buildObservation(index, s).available_actions.map((a) => a.id);

// ticks only advance on a real room-to-room move, so these dawdle routes climb
// the gallery's clock by oscillating study <-> gallery.
//   climb(1) study(2) landing(3) study(4) landing(5) -> gallery at ticks 5
const TO_GALLERY_T5 = ["climb_stairs", "enter_study", "leave_study", "enter_study", "leave_study"];
//   ...study(6) landing(7) -> gallery on the hour (ticks 7), no ledger read
const TO_GALLERY_T7 = [...TO_GALLERY_T5, "enter_study", "leave_study"];
// Same dawdle, but read the ledger on the first visit to the study.
const READER_TO_GALLERY_T7 = [
  "climb_stairs", "enter_study", "read_ledger", "leave_study",
  "enter_study", "leave_study", "enter_study", "leave_study",
];
// Efficient heist: pick from the kitchen, straight to the vault.
const VAULT_RICH = ["kitchens", "take_pick", "dumbwaiter", "approach_vault", "pick_lock", "grab_gold"];
// bug_0022: the crawlspace strongbox now needs the lockpick (no brute-force pry).
const CRAWLSPACE_TRUTH = ["inspect_clock", "kitchens", "take_pick", "back_foyer", "pry_panel", "open_strongbox"];
const FORCE_CAUGHT = ["climb_stairs", "approach_vault", "force_door"];

const TENSION = /running short|grinds toward the hour/i;
const PATROL = /watchman's lantern|hourly patrol/i;

describe("bug_0019 — the 'guard on the hour' ledger clue is a real deadline", () => {
  it("efficient play is never caught — the fast vault route keeps ticks low and wins", () => {
    const s = play(VAULT_RICH);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_rich");
    // The crossing happened before the hour: ticks stayed well under 6.
    expect((s.vars.ticks ?? 0)).toBeLessThan(6);
  });

  it("on the hour without the ledger: approach_vault is gone, the blind gamble appears, exits remain", () => {
    const s = play(TO_GALLERY_T7);
    expect(s.current).toBe("landing");
    expect(s.vars.ticks).toBeGreaterThanOrEqual(6);
    expect(s.flags.read_ledger).toBeFalsy();
    const opts = optionIds(s);
    expect(opts).not.toContain("approach_vault"); // safe crossing gated out
    expect(opts).toContain("cross_to_vault_blind"); // the labelled gamble
    // Safe exits always remain — no soft-lock at the deadline.
    expect(opts).toContain("enter_study");
    expect(opts).toContain("back_down");
    // Taking the gamble leads to the new patrol ending.
    const caught = play([...TO_GALLERY_T7, "cross_to_vault_blind"]);
    expect(caught.ended).toBe(true);
    expect(caught.endingId).toBe("ending_patrol");
  });

  it("reading the ledger is the payoff: on the hour the safe crossing is still offered, the gamble is not", () => {
    const s = play(READER_TO_GALLERY_T7);
    expect(s.current).toBe("landing");
    expect(s.vars.ticks).toBeGreaterThanOrEqual(6);
    expect(s.flags.read_ledger).toBe(true);
    const opts = optionIds(s);
    expect(opts).toContain("approach_vault"); // knows his rounds — crosses safely
    expect(opts).not.toContain("cross_to_vault_blind");
  });

  it("the gallery prose reacts to the clock — base, then tension, then the patrol", () => {
    const base = buildObservation(index, play(["climb_stairs"])); // ticks 1
    expect(base.scene_id).toBe("landing");
    expect(base.text).not.toMatch(TENSION);
    expect(base.text).not.toMatch(PATROL);

    const tension = buildObservation(index, play(TO_GALLERY_T5)); // ticks 5
    expect(tension.text).toMatch(TENSION);
    expect(tension.text).not.toMatch(PATROL);

    const patrol = buildObservation(index, play(TO_GALLERY_T7)); // ticks 7
    expect(patrol.text).toMatch(PATROL);
  });

  it("the original three endings still fire and ending_patrol is a declared, reachable fourth", () => {
    expect(play(CRAWLSPACE_TRUTH).endingId).toBe("ending_truth");
    expect(play(FORCE_CAUGHT).endingId).toBe("ending_caught");
    expect(play(VAULT_RICH).endingId).toBe("ending_rich");
    // The new ending is declared...
    expect(index.pack.endings.some((e) => e.id === "ending_patrol")).toBe(true);
    // ...and reachable in play.
    expect(play([...TO_GALLERY_T7, "cross_to_vault_blind"]).endingId).toBe("ending_patrol");
  });
});
