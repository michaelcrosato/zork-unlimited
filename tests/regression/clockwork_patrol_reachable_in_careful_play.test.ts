/**
 * Regression (§15) for bug_0040 — *The Clockwork Heist*'s ledger-gated watchman
 * deadline (bug_0019) worked, but was BURIED: the patrol only began at ticks >= 6
 * while a thorough truth-via-vault route (pick from the kitchen, ledger from the
 * study, then the crossing) arrives at only ~tick 4. A fresh, MCP-only blind
 * playtester (seed 101, report ai-runs/2026-06-01T12-11-45-401Z/playtest.md, §4 +
 * §5 + verdict) found the guard "never appears on a direct route... its payoff is
 * only discoverable by dawdling," so the ledger read as dead flavor in careful
 * play.
 *
 * The fix is a content-only retune of the existing deadline (no engine change, no
 * new scene/flag/item): the gallery's tension band drops to ticks >= 2 and the
 * watchman's patrol to ticks >= 4; the safe `approach_vault` crossing is gated
 * `any_of: [var_lte ticks 3, has_flag read_ledger]` and the gamble
 * `cross_to_vault_blind` to `var_gte ticks 4 + not read_ledger`. Now the hour
 * falls exactly on the thorough vault route's natural arrival.
 *
 * Locked here (the NEW guarantee bug_0019 did not assert):
 *   (1) the thorough read-ledger vault route meets the patrol at its FIRST natural
 *       crossing (gallery, ticks 4, patrol prose) and the ledger pays off there —
 *       approach_vault is offered, the blind gamble is not — finishing at
 *       ending_truth WITHOUT any dawdling;
 *   (2) the same thorough route that visits the study but SKIPS the ledger reaches
 *       the same tick-4 crossing with approach_vault gated out and only the gamble
 *       offered (the ledger is load-bearing, not optional flavor), while the safe
 *       study/foyer exits remain (no soft-lock);
 *   (3) the retuned band boundary: at ticks 3 the crossing is still safe and the
 *       prose is tension-only; at ticks 4 the patrol prose shows and a no-ledger
 *       player loses the safe crossing;
 *   (4) straight-shot play stays under the hour — pick -> vault wins ending_rich
 *       at ticks <= 2 — and all four endings still fire.
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
  let s = initStateForPack(index, 101);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}
const optionIds = (s: GameState): string[] =>
  buildObservation(index, s).available_actions.map((a) => a.id);

// The thorough truth route: pick from the kitchen, ledger from the study, back to
// the gallery to cross. ticks: kitchen(1) gallery(2) study(3) [read] gallery(4).
const READER_TO_GALLERY = [
  "kitchens",
  "take_pick",
  "dumbwaiter",
  "enter_study",
  "read_ledger",
  "leave_study",
];
const READER_VAULT_TRUTH = [...READER_TO_GALLERY, "approach_vault", "pick_lock", "take_letter"];
// Same thorough route but the ledger is NOT read — same tick-4 crossing.
//   kitchen(1) gallery(2) study(3) gallery(4)
const NOREAD_TO_GALLERY = ["kitchens", "take_pick", "dumbwaiter", "enter_study", "leave_study"];
// A no-ledger route that stops one tick short of the hour (tension band).
//   climb(1) study(2) gallery(3)
const NOREAD_TO_GALLERY_T3 = ["climb_stairs", "enter_study", "leave_study"];
// Straight shot to the vault for the gold — never near the hour.
const STRAIGHT_RICH = [
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

const TENSION = /running short|grinds toward the hour/i;
const PATROL = /watchman's lantern|hourly patrol/i;

describe("bug_0040 — the watchman deadline is reachable in careful play, not only by dawdling", () => {
  it("the thorough read-ledger vault route meets the patrol at its natural crossing and the ledger pays off", () => {
    const atGallery = play(READER_TO_GALLERY);
    expect(atGallery.current).toBe("landing");
    expect(atGallery.vars.ticks).toBe(4); // no dawdling — the natural arrival is the hour
    expect(atGallery.flags.read_ledger).toBe(true);
    const obs = buildObservation(index, atGallery);
    expect(obs.text).toMatch(PATROL); // the watchman is out at the very crossing
    const opts = optionIds(atGallery);
    expect(opts).toContain("approach_vault"); // ledger payoff — safe crossing offered
    expect(opts).not.toContain("cross_to_vault_blind");
    // ...and the route completes to the good ending without any wasted moves.
    const end = play(READER_VAULT_TRUTH);
    expect(end.ended).toBe(true);
    expect(end.endingId).toBe("ending_truth");
  });

  it("skipping the ledger on the same thorough route loses the safe crossing — the clue is load-bearing", () => {
    const s = play(NOREAD_TO_GALLERY);
    expect(s.current).toBe("landing");
    expect(s.vars.ticks).toBe(4);
    expect(s.flags.read_ledger).toBeFalsy();
    const opts = optionIds(s);
    expect(opts).not.toContain("approach_vault"); // no ledger, on the hour -> gated out
    expect(opts).toContain("cross_to_vault_blind"); // only the labelled gamble
    expect(opts).toContain("enter_study"); // can still retreat to read the ledger
    expect(opts).toContain("back_down"); // no soft-lock
  });

  it("the band boundary moved to tick 4: at tick 3 the crossing is safe and prose is tension-only", () => {
    const s = play(NOREAD_TO_GALLERY_T3);
    expect(s.current).toBe("landing");
    expect(s.vars.ticks).toBe(3);
    expect(s.flags.read_ledger).toBeFalsy();
    const obs = buildObservation(index, s);
    expect(obs.text).toMatch(TENSION);
    expect(obs.text).not.toMatch(PATROL); // not yet the hour at tick 3
    expect(optionIds(s)).toContain("approach_vault"); // safe window is ticks <= 3
  });

  it("straight-shot play stays under the hour and all four endings still fire", () => {
    const rich = play(STRAIGHT_RICH);
    expect(rich.endingId).toBe("ending_rich");
    expect(rich.vars.ticks ?? 0).toBeLessThanOrEqual(2); // never near the hour
    expect(play(CRAWLSPACE_TRUTH).endingId).toBe("ending_truth");
    expect(play(FORCE_CAUGHT).endingId).toBe("ending_caught");
    expect(play([...NOREAD_TO_GALLERY, "cross_to_vault_blind"]).endingId).toBe("ending_patrol");
  });
});
