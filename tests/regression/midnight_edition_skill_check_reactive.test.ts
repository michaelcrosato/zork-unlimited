/**
 * Regression (§15) for bug_0313 — *The Midnight Edition*'s alley_door barred-state variant
 * did not distinguish a player who used the dramatic `steady_and_bar` skill check from one
 * who used the plain `bar_door` choice: both set only `door_barred`, so re-entering the alley
 * showed byte-identical text ("dropped hard into its brackets where you slammed it") regardless
 * of whether the bar had been wrestled home against a lifting latch under nerve pressure.
 *
 * Blind playtest (seed 7, ai-runs/2026-06-08T11-14-59-656Z/playtest.md §5): "The skill check is
 * entirely cosmetic since both outcomes … produce identical subsequent scene text."  Same
 * reactive-description-blindness class as bug_0305 (sealed_crypt grip beat with no scene reader).
 *
 * THE FIX. `nerve_check_attempted` is set by BOTH on_success and on_failure of `steady_and_bar`
 * (convergence preserved: stateKey(success) == stateKey(failure) — see
 * cyoa_convergent_skill_check_sound.test.ts). A new alley_door variant fires when
 * `{door_barred AND nerve_check_attempted}` and describes the bar as "thrown into its brackets
 * with the latch already moving in the frame when you got it home" — accurate for both outcomes.
 * The plain `{door_barred}` variant (no nerve flag) still fires for `bar_door` ("dropped hard…
 * slammed it"). The flag is read ONLY by this prose variant — no choice condition, score, route,
 * or ending reads it — so the convergence guarantee and all exhaustive proofs remain sound.
 *
 * This locks:
 *   (1) after steady_and_bar (any outcome), re-entering the alley shows the "latch already
 *       moving" variant, not the plain "dropped hard" text;
 *   (2) after plain bar_door, re-entering the alley still shows the plain "dropped hard" text;
 *   (3) nerve_check_attempted is set after both skill check outcomes (convergence check);
 *   (4) nerve_check_attempted is NOT set after bar_door;
 *   (5) nerve_check_attempted gates no choices — all alley actions still present;
 *   (6) full win route (read + verify + secure + print) still reaches ending_vindicated 35/35.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";

const loaded = loadPackFile("content/cyoa/pack/midnight_edition.yaml");
if (!loaded.ok) throw new Error("midnight_edition pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string) => ({ type: "CHOOSE", choiceId: id }) as const;

function playFrom(seed: number, ids: string[]) {
  const step = makeStep(rules);
  let s = initStateForPack(index, seed);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}
const obs = (s: ReturnType<typeof playFrom>) => buildObservation(index, s);
const text = (s: ReturnType<typeof playFrom>) => obs(s).text;

const SKILL_MARKER = "latch already moving in the frame when you got it home";
const PLAIN_MARKER = "dropped hard into its brackets where you slammed it";

describe("bug_0313 — alley_door barred+skill-check variant vs plain bar_door variant", () => {
  it("after steady_and_bar, re-entering the alley shows the skill-check-aware 'latch moving' text", () => {
    // go_alley → steady_and_bar (any outcome, both set nerve_check_attempted) → go_alley_barred
    const s = playFrom(7, ["go_alley", "steady_and_bar", "go_alley_barred"]);
    expect(s.current).toBe("alley_door");
    expect(s.flags["door_barred"]).toBe(true);
    expect(s.flags["nerve_check_attempted"]).toBe(true);
    const t = text(s);
    expect(t).toContain(SKILL_MARKER);
    expect(t).not.toContain(PLAIN_MARKER);
  });

  it("after plain bar_door, re-entering the alley still shows the plain 'dropped hard' text", () => {
    const s = playFrom(7, ["go_alley", "bar_door", "go_alley_barred"]);
    expect(s.current).toBe("alley_door");
    expect(s.flags["door_barred"]).toBe(true);
    expect(s.flags["nerve_check_attempted"]).not.toBe(true);
    const t = text(s);
    expect(t).toContain(PLAIN_MARKER);
    expect(t).not.toContain(SKILL_MARKER);
  });

  it("nerve_check_attempted is set after both skill check outcomes (convergence preserved)", () => {
    // Multiple seeds to hit both success and failure branches of the d20 roll.
    for (const seed of [1, 2, 3, 4, 5, 7, 11, 53]) {
      const s = playFrom(seed, ["go_alley", "steady_and_bar"]);
      expect(s.current).toBe("composing_room");
      expect(s.flags["door_barred"]).toBe(true);
      expect(s.flags["nerve_check_attempted"]).toBe(true);
    }
  });

  it("nerve_check_attempted is NOT set after plain bar_door", () => {
    const s = playFrom(7, ["go_alley", "bar_door"]);
    expect(s.flags["door_barred"]).toBe(true);
    expect(s.flags["nerve_check_attempted"]).not.toBe(true);
  });

  it("nerve_check_attempted gates no choices — confront_men and back_inside still present in barred alley", () => {
    const s = playFrom(7, ["go_alley", "steady_and_bar", "go_alley_barred"]);
    const ids = obs(s).available_actions.map((a) => a.id);
    expect(ids).toContain("confront_men");
    expect(ids).toContain("back_inside");
    // Bar choices remain gated off in the barred state.
    expect(ids).not.toContain("bar_door");
    expect(ids).not.toContain("steady_and_bar");
  });

  it("full win route (read letter → verify → secure → print) still reaches ending_vindicated 35/35", () => {
    const s = playFrom(7, [
      "read_letter",
      "go_office",
      "search_desk",
      "open_safe",
      "read_report",
      "leave_office",
      "go_alley",
      "bar_door",
      "go_press",
      "print_verified",
    ]);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_vindicated");
    expect(s.vars["score"]).toBe(35);
  });
});
