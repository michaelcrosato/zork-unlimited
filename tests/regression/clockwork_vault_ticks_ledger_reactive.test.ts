/**
 * Regression (§15) for bug_0288 — *The Clockwork Heist*'s vault scene used
 * "you know what the hour wakes: fill your hands and be gone before the chime
 * sets the watchman walking" in its ticks>=2 variant even when the player had NOT
 * read the steward's ledger (read_ledger flag unset). A player reaching the vault
 * at ticks 2-3 via kitchen→dumbwaiter→approach_vault (which requires only
 * ticks<=3 OR read_ledger) never established the knowledge the text claims.
 * Reactive-description-blindness class, same as bug_0287 (study stale ledger
 * prompts), bug_0286 (crawlspace strongbox "locked fast" with picks), bug_0282–0284.
 *
 * Note: a ticks>=2 AND read_ledger companion would be a dead variant. Earning the
 * ledger requires visiting study (+1 tick) and returning through landing (+1 tick),
 * giving a minimum of 4 ticks at vault entry for any ledger-reading path. A ledger-
 * reader in the vault ALWAYS sees the ticks>=4 variant, which correctly names the
 * ledger. The ticks>=4 variant is implicitly ledger-gated: no-ledger players past
 * the hour are routed to ending_patrol via cross_to_vault_blind, never this room.
 *
 * Fix (content, pure prose — bug_0288): the plain ticks>=2 variant drops "you know
 * what the hour wakes:" and "the watchman" (both presuppose ledger knowledge),
 * replacing with "fill your hands and be gone before the chime sets the manor
 * stirring." No choice/flag/effect/item/exit/gating/ending change.
 *
 * Route note: approach_vault (landing → vault_door) is gated:
 *   any_of: [var_lte(ticks, 3), has_flag:read_ledger]
 * So at ticks 2-3 a no-ledger player CAN reach vault_door (and then vault).
 * At ticks>=4 ONLY a ledger-reader can cross — ticks>=4 vault variant is safe.
 *
 * Locked here:
 *   (1) ticks=2, read_ledger UNSET: shows "manor stirring", NOT "you know" / "watchman";
 *   (2) ticks>=4, read_ledger SET: shows ticks>=4 variant ("ledger swears you can go back"),
 *       NOT "manor stirring" or "you know what the hour wakes";
 *   (3) choices: grab_gold and take_letter always available inside vault;
 *   (4) reachability unchanged — all five endings still fire (prose-only edit).
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
  let s = initStateForPack(index, 42);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}

const obsText = (ids: string[]) => buildObservation(index, play(ids)).text;
const optionIds = (ids: string[]) =>
  buildObservation(index, play(ids)).available_actions.map((a) => a.id);

// kitchen(+1) → take_pick → dumbwaiter → landing(+2) → approach_vault → pick_lock → vault
// ticks=2 at vault entry, read_ledger UNSET
const VAULT_T2_NOLEDGER = ["kitchens", "take_pick", "dumbwaiter", "approach_vault", "pick_lock"];

// kitchen(+1) → dumbwaiter → landing(+2) → study(+3) → read_ledger → leave(→landing+4) → approach_vault → pick_lock → vault
// ticks=4 at vault entry, read_ledger SET (ticks>=4 variant fires)
const VAULT_T4_LEDGER = [
  "kitchens",
  "take_pick",
  "dumbwaiter",
  "enter_study",
  "read_ledger",
  "leave_study",
  "approach_vault",
  "pick_lock",
];

// Phrase markers
const KNOWS_WAKES = /you know what the hour wakes/i;
const WATCHMAN_WALKING = /sets the watchman walking/i;
const MANOR_STIRRING = /sets the manor stirring/i;
const LEDGER_SWEARS = /ledger swears you can go back out/i;

describe("bug_0288 — vault ticks>=2 variant no longer presupposes read_ledger", () => {
  it("(1) ticks=2, read_ledger UNSET: shows 'manor stirring', NOT 'you know' or 'watchman'", () => {
    const s = play(VAULT_T2_NOLEDGER);
    expect(s.current).toBe("vault");
    expect(s.vars.ticks).toBe(2);
    expect(s.flags.read_ledger).toBeFalsy();
    const text = obsText(VAULT_T2_NOLEDGER);
    expect(text).toMatch(MANOR_STIRRING);
    expect(text).not.toMatch(KNOWS_WAKES);
    expect(text).not.toMatch(WATCHMAN_WALKING);
  });

  it("(2) ticks>=4, read_ledger SET: shows 'ledger swears you can go back', NOT 'manor stirring'", () => {
    const s = play(VAULT_T4_LEDGER);
    expect(s.current).toBe("vault");
    expect(s.vars.ticks).toBeGreaterThanOrEqual(4);
    expect(s.flags.read_ledger).toBe(true);
    const text = obsText(VAULT_T4_LEDGER);
    expect(text).toMatch(LEDGER_SWEARS);
    expect(text).not.toMatch(MANOR_STIRRING);
    expect(text).not.toMatch(KNOWS_WAKES);
  });

  it("(3) choices: grab_gold and take_letter available inside vault", () => {
    const actions = optionIds(VAULT_T2_NOLEDGER);
    expect(actions).toContain("grab_gold");
    expect(actions).toContain("take_letter");
  });

  it("(4) reachability unchanged — all five endings still fire (prose-only edit)", () => {
    expect(
      play(["kitchens", "take_pick", "dumbwaiter", "approach_vault", "pick_lock", "grab_gold"])
        .endingId,
    ).toBe("ending_rich");
    expect(
      play(["kitchens", "take_pick", "dumbwaiter", "approach_vault", "pick_lock", "take_letter"])
        .endingId,
    ).toBe("ending_truth");
    expect(
      play(["inspect_clock", "kitchens", "take_pick", "back_foyer", "pry_panel", "open_strongbox"])
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
