/**
 * Regression (§15) for bug_0043 — *The Clockwork Heist*'s marquee mechanic, the
 * clock/watchman deadline, never touched the game's most obvious route: grabbing
 * the gold. A fresh, MCP-only blind playtester (seed 91, report
 * ai-runs/2026-06-01T12-51-55-985Z/playtest.md, §5/§6) reached all five endings,
 * rated the pack clarity 5/5 / enjoyment 4/5 with zero bugs, and surfaced exactly
 * one soft spot: "the headline timed-crossing setpiece is avoidable, and a player
 * who beelines may never see it... worth considering whether the patrol should be
 * guaranteed at least once on the vault route." An efficient thief reaches the
 * vault before the hour (ticks 2) and the watchman — who only walks the gallery on
 * the hour — never enters the picture, so the deadline the foyer/kitchen/gallery
 * prose keeps drumming up is wholly absent from the loot room where the heist's
 * central choice (gold vs. truth) is actually made.
 *
 * The fix is content-only and uses the pack's existing CYOA `variants` reactive-text
 * feature (same mechanism as the foyer/gallery/vault_door clock prose). The `vault`
 * scene — previously variant-free — gains TWO variants (first-match-wins, higher
 * threshold first):
 *   - ticks >= 4: the careful ledger-reader (the ONLY player who can be inside the
 *     vault at/after the hour — by construction `vault_door` is reachable at
 *     ticks >= 4 only via the ledger-gated `approach_vault`, bug_0019/0040/0042)
 *     feels the watchman patrolling the one way out, framed around the rounds the
 *     ledger gave them, so the room never lies about a clean getaway they earned;
 *   - ticks >= 2: the fast/normal thief (every gold-route player is at ticks >= 2,
 *     since the lockpick costs a kitchen tick and the crossing costs a landing tick)
 *     is told the clock grinds toward the hour and to be gone before the chime.
 * The base `text` is UNCHANGED, so the bug_0041 paired-letter framing it carries
 * ("in plain sight ... among the gold", asserted on `.text` by that regression)
 * stays byte-identical. No choice, effect, flag, item, exit, gating, or reachable
 * ending changes — `grab_gold` still ends at `ending_rich`, `take_letter` at
 * `ending_truth`; the no-soft-lock / escapable-deadline invariants are untouched.
 *
 * Locked here:
 *   (1) a fast gold-route thief at the vault (ticks 2, pre-hour) now sees the
 *       running-short clock prose — the deadline is felt on the headline route;
 *   (2) the ledger-reader on the hour (ticks 4, patrol active) sees the
 *       watchman-beyond-the-door prose, NOT the running-short variant, and is
 *       provably a ledger reader (the "ledger swears" line is never a lie);
 *   (3) the base text is unchanged: it still carries the bug_0041 letter framing,
 *       and a fresh (ticks 0) state renders it verbatim with no clock prose;
 *   (4) reachability/feedback unchanged — gold->rich and letter->truth on both the
 *       fast and careful routes, force->caught, blind-crossing->patrol.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack, sceneText } from "../../src/cyoa/runner.js";
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
  let s = initStateForPack(index, 91);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}

// Straight-shot rich route up to the loot room — never near the hour.
// ticks: kitchen(1) gallery(2); pick_lock opens the vault (no tick).
const FAST_AT_VAULT = ["kitchens", "take_pick", "dumbwaiter", "approach_vault", "pick_lock"];
// Thorough route: pick from the kitchen, ledger from the study, cross on the hour.
// ticks: kitchen(1) gallery(2) study(3) [read] gallery(4); pick_lock opens the vault.
const READER_AT_VAULT = [
  "kitchens",
  "take_pick",
  "dumbwaiter",
  "enter_study",
  "read_ledger",
  "leave_study",
  "approach_vault",
  "pick_lock",
];

const HOUR =
  /watchman's tread passes and returns|came in behind his lantern|while his rounds are still fresh/i;
const RUNNING = /clock grinds toward the hour|before the chime sets the watchman walking/i;

describe("bug_0043 — the clock deadline is felt in the loot room, on the headline gold route", () => {
  it("a fast pre-hour thief at the vault sees the running-short clock prose", () => {
    const s = play(FAST_AT_VAULT);
    expect(s.current).toBe("vault");
    expect(s.vars.ticks).toBeGreaterThanOrEqual(2);
    expect(s.vars.ticks).toBeLessThan(4);
    const text = buildObservation(index, s).text;
    expect(text).toMatch(RUNNING);
    expect(text).not.toMatch(HOUR);
  });

  it("the ledger-reader on the hour sees the watchman-beyond-the-door prose — and IS a reader", () => {
    const s = play(READER_AT_VAULT);
    expect(s.current).toBe("vault");
    expect(s.vars.ticks).toBeGreaterThanOrEqual(4);
    // The ">= 4 inside the vault implies read_ledger" invariant the prose relies on.
    expect(s.flags.read_ledger).toBe(true);
    const text = buildObservation(index, s).text;
    expect(text).toMatch(HOUR);
    expect(text).not.toMatch(RUNNING);
  });

  it("the base text is unchanged — bug_0041 letter framing intact, no clock prose at ticks 0", () => {
    const vault = index.pack.scenes.find((sc) => sc.id === "vault")!;
    const base = vault.text.toLowerCase();
    expect(base).toContain("in plain sight");
    expect(base).toContain("among the gold");
    // A fresh state (ticks 0) falls through to the base text — no variant fires.
    const fresh = initStateForPack(index, 91);
    expect(fresh.vars.ticks).toBe(0);
    const rendered = sceneText(vault, fresh);
    expect(rendered).toBe(vault.text);
    expect(rendered).not.toMatch(HOUR);
    expect(rendered).not.toMatch(RUNNING);
  });

  it("reachability/feedback unchanged — gold->rich and letter->truth on both routes", () => {
    expect(play([...FAST_AT_VAULT, "grab_gold"]).endingId).toBe("ending_rich");
    expect(play([...FAST_AT_VAULT, "take_letter"]).endingId).toBe("ending_truth");
    expect(play([...READER_AT_VAULT, "grab_gold"]).endingId).toBe("ending_rich");
    expect(play([...READER_AT_VAULT, "take_letter"]).endingId).toBe("ending_truth");
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
    // The crawlspace truth route never enters the vault and is unaffected.
    expect(
      play(["inspect_clock", "kitchens", "take_pick", "back_foyer", "pry_panel", "open_strongbox"])
        .endingId,
    ).toBe("ending_truth");
  });
});
