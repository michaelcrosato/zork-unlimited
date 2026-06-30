/**
 * Regression (§15) for bug_0042 — *The Clockwork Heist*'s ledger payoff was a
 * SILENT beat. Reading the steward's ledger (study) promises "you could time a
 * crossing he'd never catch", and mechanically it pays off — on the hour
 * (ticks >= 4) a ledger reader keeps the safe `approach_vault` crossing while a
 * no-ledger player gets only the blind gamble (bug_0019 / bug_0040). But the
 * crossing itself routed straight to `vault_door` with no acknowledgement, so the
 * heist's tensest moment (threading a live patrol with stolen knowledge) read as an
 * ordinary stroll. A fresh, MCP-only blind playtester (seed 91, report
 * ai-runs/2026-06-01T12-36-56-864Z/playtest.md, §4) flagged exactly this: "the
 * repeated 'time is running short' warnings may slightly over-promise a ticking-clock
 * threat that a careful player never feels."
 *
 * The fix is content-only and uses the existing CYOA `variants` reactive-text
 * feature (same mechanism as the foyer/kitchen/gallery clock prose): `vault_door`
 * gains ONE variant, `when: [var_gte ticks 4, has_flag read_ledger]`, narrating the
 * timed crossing. No choice/effect/flag/item/exit/gating/reachable-ending change —
 * the no-soft-lock / escapable-deadline invariants bug_0019 and bug_0040 locked are
 * untouched. The condition fires EXACTLY when the player just timed the patrolled
 * crossing: by construction `vault_door` is reachable at ticks >= 4 only via the
 * ledger-gated `approach_vault` (a no-ledger player past the hour gets the gamble,
 * never this door), so the beat shows only to the player who earned it.
 *
 * Locked here:
 *   (1) a ledger reader who crosses on the hour (ticks 4, patrol active) sees the
 *       timed-crossing prose at vault_door;
 *   (2) a pre-hour crosser (straight-shot rich route, ticks 2) sees the calm base
 *       text — the beat does NOT leak to a stroll across an empty gallery;
 *   (3) the payoff text never fires without the ledger (it is gated on read_ledger,
 *       and a no-ledger player cannot reach vault_door at the hour anyway);
 *   (4) reachability/feedback unchanged — all four endings still fire and the
 *       bug_0008 lockpick-less `study_lock` nudge is unaffected.
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
  let s = initStateForPack(index, 91);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}
const optionIds = (s: GameState): string[] =>
  buildObservation(index, s).available_actions.map((a) => a.id);

// The thorough truth/rich route: pick from the kitchen, ledger from the study, back
// to the gallery to cross. ticks: kitchen(1) gallery(2) study(3) [read] gallery(4).
const READER_AT_VAULT = [
  "kitchens",
  "take_pick",
  "dumbwaiter",
  "enter_study",
  "read_ledger",
  "leave_study",
  "approach_vault",
];
// Straight-shot rich route — never near the hour. ticks: kitchen(1) gallery(2).
const PREHOUR_AT_VAULT = ["kitchens", "take_pick", "dumbwaiter", "approach_vault"];

const TIMED = /sweeps to the gallery's far end|cross in its wake|as the ledger swore/i;

describe("bug_0042 — the timed crossing past the patrol is a felt, narrated beat", () => {
  it("a ledger reader who crosses on the hour sees the timed-crossing prose", () => {
    const s = play(READER_AT_VAULT);
    expect(s.current).toBe("vault_door");
    expect(s.vars.ticks).toBeGreaterThanOrEqual(4);
    expect(s.flags.read_ledger).toBe(true);
    expect(buildObservation(index, s).text).toMatch(TIMED);
  });

  it("a pre-hour crosser sees the calm base text — the beat does not leak", () => {
    const s = play(PREHOUR_AT_VAULT);
    expect(s.current).toBe("vault_door");
    expect(s.vars.ticks).toBeLessThan(4);
    expect(buildObservation(index, s).text).not.toMatch(TIMED);
  });

  it("reachability/feedback unchanged — all four endings still fire", () => {
    expect(play([...READER_AT_VAULT, "pick_lock", "take_letter"]).endingId).toBe("ending_truth");
    expect(play([...PREHOUR_AT_VAULT, "pick_lock", "grab_gold"]).endingId).toBe("ending_rich");
    expect(play(["climb_stairs", "approach_vault", "force_door"]).endingId).toBe("ending_caught");
    expect(
      play(["inspect_clock", "kitchens", "take_pick", "back_foyer", "pry_panel", "open_strongbox"])
        .endingId,
    ).toBe("ending_truth");
    // The no-ledger thorough route still funnels to the blind gamble -> patrol ending.
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

  it("the bug_0008 lockpick-less nudge at the vault door is unaffected", () => {
    const s = play(["climb_stairs", "approach_vault"]);
    expect(s.current).toBe("vault_door");
    expect(s.inventory).not.toContain("lockpick");
    const opts = optionIds(s);
    expect(opts).toContain("study_lock");
    expect(opts).not.toContain("pick_lock");
  });
});
