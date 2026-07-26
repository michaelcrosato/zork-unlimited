/**
 * Structural verification (§15) — every declared ending of every shipped RPG pack is
 * DYNAMICALLY reachable by actual play. This completes the exhaustive concrete
 * ending-reachability proof across all three modes: bug_0121 (CYOA) and bug_0122
 * (parser) introduced and shared the solver (support/exhaustive_endings.ts), and both
 * named the RPG mode as the last, genuinely-harder extension. This is that extension.
 *
 * Why RPG is harder, and how this stays SOUND
 * -------------------------------------------
 * CYOA and the parser stage are fully deterministic, so a single-`Rules` BFS that steps
 * each legal action explores every transition (bug_0121's argument). RPG adds the only
 * randomness in the engine: an ATTACK round draws a d6 for the player's strike and a d6
 * for the enemy's reply, and a skill check draws a d20 — all from the (seed, step)-keyed
 * PRNG (src/rpg/combat.ts). A single seeded draw per (state, action) would explore just
 * ONE of the outcomes, so a naive BFS could not prove an ending that needs the other.
 *
 * The fix uses the verification seam `buildRpgRules(index, rngFor)` exposes (its default
 * is the real step-keyed PRNG, so production play is byte-identical): we build TWO rule
 * sets that differ only in the rolls their combat/skill resolver draws —
 *   - BEST  for the player: max strike (d6=6), min damage taken (enemy d6=1), max skill
 *           roll (d20=20);
 *   - WORST for the player: min strike (d6=1), max damage taken (enemy d6=6), min skill
 *           roll (d20=1).
 * `exhaustiveEndingsMulti` steps every legal action under BOTH and unions the reachable
 * states. A whole fight resolves round-by-round naturally (each ATTACK is one legal
 * action the BFS steps); the BEST regime drives toward enemy-defeat in the fewest rounds,
 * the WORST toward the player's death, and mixed best/worst paths in between are explored
 * too — all bounded because every round strictly lowers someone's HP.
 *
 * Soundness has two halves:
 *   - NO false positives. Every successor is produced by a real `makeStep` on a real,
 *     LEGAL die value (1 and 6 are legal d6 faces; 1 and 20 are legal d20 faces). So any
 *     ending reached here is reachable by some concrete seed/play — never spurious.
 *   - NO false negatives that pass silently. The only routing-relevant consequence of a
 *     combat round or skill check is MONOTONE in the roll — did the enemy reach 0 HP, did
 *     the player reach 0 HP, did d20 + skill meet the difficulty. The best/worst extremes
 *     therefore bracket every outcome a middle roll could yield, so an ending reachable
 *     under SOME rolls is reached under one of the two regimes. The one way this could
 *     miss is an ending that gates on a RAW HP VALUE where a middle roll lands an HP the
 *     extremes skip. Equality, lower-bound player HP, and every enemy-HP condition therefore
 *     still fail closed. A monotone player `hp <= threshold` route is supported only when
 *     its threshold is at least the pack's maximum possible one-round counterattack and the
 *     pack carries the validator's cumulative worst-roll survival guarantee. The WORST
 *     regime then maximizes damage taken before each enemy falls and remains a concrete,
 *     surviving route; if it does not cross the upper bound, no middle roll can.
 *
 * What this proves vs. what the validator proves: this is ROUTE EXISTENCE — every declared
 * ending (including the death ending, reachable by an under-prepared or unlucky player) is
 * reachable under SOME play. The combat-bound checks (src/validate/rpg_validator.ts,
 * bug_0113/0114) separately prove winnability under the player's WORST rolls. The two are
 * complementary: existence here, worst-case guarantee there.
 *
 * Failure modes (all loud, none silent): a declared-but-unreachable ending fails; a
 * reached-but-undeclared ending fails; a severed route fails; a cap-out (truncated,
 * unproven search) fails; an unsupported HP-gated condition fails the assumption guard. Packs are
 * auto-discovered from content/rpg/quests, so a new RPG pack is covered the moment it ships
 * (the health-covers-all-packs bar, bug_0096).
 */
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { GameState } from "../../src/core/state.js";
import type { Rng } from "../../src/core/rng.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import { exhaustiveEndingsMulti } from "./support/exhaustive_endings.js";
import { hpConditionSupportForPack } from "./support/rpg_hp_condition_support.js";

const PACK_DIR = "content/rpg/quests";
const packFiles = readdirSync(PACK_DIR)
  .filter((f) => f.endsWith(".yaml"))
  .sort();

// Same backstop as the CYOA/parser suites. The RPG search adds a bounded combat lattice
// (reachable (playerHP, enemyHP) pairs over the two roll regimes) on top of the parser
// state space. The route-rich Wolf-Winter graph exhausts at 315,100 states
// (measured 2026-07-11); this ceiling leaves bounded headroom while a future blowup still
// fails loudly (cap hit) rather than hanging or silently truncating.
const MAX_STATES = 400_000;
// The measured Wolf-Winter graph took ~84s under the exhaustive-suite contention run
// before interruptible dialogue (f23c8a09) made room actions legal beside topics —
// that multiplies edges per dialogue state (~2x wall time locally; shared CI runners
// need ~3x local — this exact suite passed PR #84's verify then timed out at 120s on
// the identical main push). MAX_STATES, not the clock, bounds the work.
const SOLVER_TEST_TIMEOUT_MS = 360_000;

/**
 * A fixed-sequence PRNG: each draw consumes the next fraction in `fracs` (the last value
 * repeats once the list is exhausted — a single ATTACK draws at most two, a skill check
 * one). `int(min,max)` maps the fraction the way mulberry32's does, so HIGH→max face,
 * 0→min face. HIGH is just under 1 so `floor(HIGH*range)` is `range-1` (face = max), never
 * `range` (out of range).
 */
const HIGH = 0.999999;
const LOW = 0;
function fixedSeqRng(fracs: number[]): Rng {
  let i = 0;
  const next = (): number => {
    const f = fracs[Math.min(i, fracs.length - 1)] ?? 0;
    i += 1;
    return f;
  };
  return {
    next,
    int(min: number, max: number): number {
      const lo = Math.ceil(min);
      const hi = Math.floor(max);
      return lo + Math.floor(next() * (hi - lo + 1));
    },
  };
}

// resolveAttack draws player strike first, enemy reply second; resolveSkillCheck draws once.
// BEST for the player: own strike max, damage taken min, skill roll max → [HIGH, LOW].
// WORST for the player: own strike min, damage taken max, skill roll min → [LOW, HIGH].
const bestRng = (): Rng => fixedSeqRng([HIGH, LOW]);
const worstRng = (): Rng => fixedSeqRng([LOW, HIGH]);

describe("every declared ending of every RPG pack is reachable by concrete play", () => {
  it("discovers the shipped RPG packs", () => {
    // Guard: an empty glob would make the per-pack assertions vacuously pass.
    expect(packFiles.length).toBeGreaterThanOrEqual(2);
  });

  for (const file of packFiles) {
    it(
      `${file}: the exhaustive solver reaches every declared ending`,
      () => {
        const path = join(PACK_DIR, file);
        const loaded = loadRpgSourceFile(path);
        expect(loaded.ok).toBe(true);
        if (!loaded.ok) return;
        const pack = loaded.compiled.pack;

        const declared = new Set(pack.endings.map((e) => e.id));
        // Guard: a pack with no declared endings would also pass vacuously.
        expect(declared.size).toBeGreaterThan(0);

        // Load-bearing assumption guard: only a monotone, safely crossed player-HP upper
        // bound is supported. Every other raw HP route still fails loudly.
        const hpSupport = hpConditionSupportForPack(pack);
        expect(
          hpSupport.unsupported,
          `pack gates a condition on an unsupported HP predicate — only player hp <= threshold ` +
            `at or above the maximum one-round counterattack in a combat_guaranteed pack is supported`,
        ).toBe(false);

        const index = indexRpgPack(pack);
        const start: GameState = initStateForRpgPack(index, 7);
        const ruleSets = [buildRpgRules(index, bestRng), buildRpgRules(index, worstRng)];
        const { reached, states, cappedOut } = exhaustiveEndingsMulti(ruleSets, start, MAX_STATES);

        // The search must have actually completed — a cap-out leaves the result unproven over
        // the unexplored region.
        expect(cappedOut, `state-space search hit the ${MAX_STATES} cap (explored ${states})`).toBe(
          false,
        );
        // At least one ending fires — the pack is finishable, not a dead walk.
        expect(reached.size).toBeGreaterThan(0);
        // Ground truth: every declared ending is dynamically reachable...
        const missing = [...declared].filter((e) => !reached.has(e));
        expect(
          missing,
          `declared endings never reached by concrete play: ${missing.join(", ")}`,
        ).toEqual([]);
        // ...and no ending fires that the pack never declared (dangling end target).
        const undeclared = [...reached].filter((e) => !declared.has(e));
        expect(
          undeclared,
          `reached endings not declared in pack.endings: ${undeclared.join(", ")}`,
        ).toEqual([]);
      },
      SOLVER_TEST_TIMEOUT_MS,
    );
  }
});
