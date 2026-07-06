/**
 * Regression for bug_0141: the skill-check narration NAMES its die (d20), the
 * symmetric follow-on to bug_0131's combat legibility fix.
 *
 * A fresh source-blind playtester (sunken_barrow, seed 29,
 * ai-runs/2026-06-02T16-59-57-928Z/playtest.md §4/§5) reached all three declared
 * endings and rated the pack clarity 5/5, enjoyment 4/5, ZERO bugs. Its one
 * concrete friction note was that the might check's die was opaque: combat clearly
 * shows a `d6` (bug_0131), but the slab/sarcophagus might checks narrated only
 * "rolled 7 + 3 = 10 vs 12" with no die named. Reading the failing roll against the
 * visible d6 combat die, the tester briefly feared the slab was impossible
 * (might 3 + a d6's max 6 = 9 < DC 12). The check is actually a d20: max 20 + 3 = 23
 * comfortably clears 12, so it is always passable on a better roll.
 *
 * The fix names the d20 in resolveSkillCheck's narration, mirroring combat's
 * `d6 <roll> + <atk> atk - <def> def`. Narration is NOT part of the state hash, and
 * the routing (which on_success/on_failure effects fire) is untouched, so
 * determinism, replay, and every trace's expected_final_hash are unchanged — these
 * cases pin the NARRATION and re-assert that the pass/fail decision did not move.
 */
import { describe, it, expect } from "vitest";
import { initState, type GameState } from "../../src/core/state.js";
import { resolveSkillCheck } from "../../src/core/skill_check.js";
import type { Rng } from "../../src/core/rng.js";
import type { Effect } from "../../src/core/effects.js";

/** A forcing Rng that hands back a single queued d20 value. */
const forcedRng = (rolls: number[]): Rng => {
  let i = 0;
  return { next: () => 0, int: () => rolls[i++] ?? 1 };
};

const narrations = (effects: Effect[]): string[] =>
  effects.filter((e): e is { narrate: string } => "narrate" in e).map((e) => e.narrate);

const stateWith = (vars: Record<string, number>): GameState => ({
  ...initState({ seed: 1, start: "room" }),
  vars,
});

// The barrow's slab lever: a might check at DC 12 (content/rpg/quests/sunken_barrow.yaml).
const slabCheck = {
  skill: "might",
  difficulty: 12,
  on_success: [{ narrate: "the slab grinds aside" } as Effect],
  on_failure: [{ narrate: "it grates back into its bed" } as Effect],
};

describe("bug_0141: skill-check narration names the d20 die", () => {
  it("a failing might check shows the d20 so the player can see the check is still passable", () => {
    // might 3, roll 7 → 10 vs 12 = failure (the exact shape the tester hit).
    const s = stateWith({ hp: 20, attack: 4, defense: 2, might: 3 });
    const res = resolveSkillCheck(s, slabCheck, forcedRng([7]));
    const [lead] = narrations(res.effects);
    expect(lead).toBe("might check: d20 7 + 3 = 10 vs 12 — failure.");
    // The die name surfaces the ceiling: max 20 + might 3 = 23 ≥ DC 12, so a player
    // reading the failure knows success is reachable on a better roll — not a dead end.
    expect(lead).toContain("d20");
    expect(3 + 20).toBeGreaterThanOrEqual(slabCheck.difficulty);
  });

  it("a passing might check reads d20 + bonus = total vs DC and fires on_success", () => {
    const s = stateWith({ hp: 20, attack: 4, defense: 2, might: 3 });
    // roll 15 → 18 vs 12 = success.
    const res = resolveSkillCheck(s, slabCheck, forcedRng([15]));
    const [lead, ...rest] = narrations(res.effects);
    expect(lead).toBe("might check: d20 15 + 3 = 18 vs 12 — success.");
    expect(rest).toContain("the slab grinds aside");
    expect(rest).not.toContain("it grates back into its bed");
  });

  it("a missing skill var reads as +0 (no NaN) and the math still adds up", () => {
    const s = stateWith({ hp: 20 }); // no `might` var at all
    const res = resolveSkillCheck(s, slabCheck, forcedRng([8]));
    const [lead] = narrations(res.effects);
    expect(lead).toBe("might check: d20 8 + 0 = 8 vs 12 — failure.");
  });

  it("the pass/fail decision is unchanged across the full d20 range (narration-only refactor)", () => {
    // Guards that naming the die did not move the threshold: success iff roll + might >= DC.
    const might = 3;
    for (let roll = 1; roll <= 20; roll++) {
      const res = resolveSkillCheck(stateWith({ hp: 20, might }), slabCheck, forcedRng([roll]));
      const ns = narrations(res.effects);
      const succeeded = ns.includes("the slab grinds aside");
      expect(succeeded).toBe(roll + might >= slabCheck.difficulty);
      // And the narrated decision word agrees with the routed effects.
      const lead = ns[0] ?? "";
      expect(lead.endsWith(succeeded ? "success." : "failure.")).toBe(true);
    }
  });
});
