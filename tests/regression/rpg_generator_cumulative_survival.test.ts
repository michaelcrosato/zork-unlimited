/**
 * Structural verification (§15) — a VALIDATOR-INDEPENDENT, concrete-play SECOND WITNESS to the
 * RPG generator's declared cumulative-survival guarantee (bug_0174).
 *
 * Background. The generated RPG packs (src/gen/rpg_generator.ts, v3) set `meta.combat_guaranteed: true`
 * on a two-fight gauntlet: a player who PREPARES — takes the optional spirit +2 attack and dons the
 * cell ward +2 defense (best reachable atk6/def4, hp20) — and THEN descends is promised to survive
 * BOTH keepers on every roll AND cumulatively across the sequence. Today that promise is proven only
 * ONE way: ARITHMETICALLY, by `validateRpg`'s cumulative-HP-aware upper bound
 * (`COMBAT_GAUNTLET_NOT_GUARANTEED`, bug_0172 — it sums each enemy's worst-case `maxDamageTaken` and
 * fires when the running total `>= playerHp`). The unit suite (tests/unit/rpg_generator.test.ts) and
 * bug_0173's guarantee suite both lean on that SAME validator arithmetic. A subtle error in the
 * validator's combat math (an off-by-one in `worstRoundsToKill`, a wrong damage floor, a mis-summed
 * cumulative term) would pass an unsound guarantee through AND be rubber-stamped by every test that
 * trusts it — the single-checker blind spot the verifier-soundness literature warns about
 * (arXiv 2510.14253, [[verifier-assertion-guard]]).
 *
 * This suite closes that gap with an INDEPENDENT witness that never imports the validator. It plays
 * the gauntlet for real through the production engine (`makeStep` via the shared `exhaustiveEndingsMulti`
 * solver) under the player's WORST combat rolls (min own strike, max damage taken — real, legal d6
 * faces 1 and 6) and asserts the guarantee by CONCRETE PLAY rather than by re-deriving the arithmetic.
 *
 * The guarantee is precisely about PREPARING FIRST, THEN FIGHTING — a guaranteed-sufficient STRATEGY,
 * not a property of any play that merely ends buffed. (Donning the ward and then grinding the first
 * keeper at low attack, only buffing attack afterward, takes far more damage in fight one than the
 * arithmetic bound — which credits best stats in EACH fight — ever assumes. That play is "buffed at the
 * end" but was never "prepared for the fight it lost", and is correctly outside the promise.) So the
 * witness is staged to match the validator's actual claim:
 *
 *   Phase A — reach a READY state: explore everything EXCEPT combat, so no fight has started. The buffs
 *     (a TALK topic, a USE/don) are roll-independent, so this region yields the best reachable attack
 *     and defense (derived BY PLAY as the max over the combat-free region — never hardcoded, so the test
 *     stays robust across a generator re-tune). A "ready" state is fully buffed AND pristine (HP still
 *     full ⇒ no damage taken, no keeper yet engaged).
 *   Phase B — POSITIVE + NEGATIVE survival: from the ready state, exhaustively play every worst-roll
 *     continuation. (NEGATIVE) NO death ending is reachable — a fully-prepared player cannot die under
 *     worst rolls, the concrete counterpart to COMBAT_GAUNTLET_NOT_GUARANTEED. (POSITIVE) some
 *     continuation fells BOTH keepers (the warden's defeat flag set) and is STILL STANDING (hp > 0), so
 *     the gauntlet is survived end-to-end by real worst combat and (NEGATIVE) is not vacuous.
 *   Phase C — CONDITIONAL: from the START (combat allowed throughout), BOTH death endings are still
 *     reachable under worst rolls by UNDER-prepared play. The guarantee is earned by preparation, not
 *     handed out by toothless enemies — without this, Phase B could pass on a pack nobody could lose.
 *
 * Soundness mirrors rpg_all_endings_reachable.test.ts: every successor is produced by a real `makeStep`
 * on a real legal die value, so nothing reached is spurious; the only routing-relevant consequence of a
 * combat round is monotone in the roll, so the WORST regime is the true worst case. The search runs the
 * WORST regime ALONE (never unioned with BEST): a survival-under-worst-rolls claim must not be reached
 * via a lucky roll. (A consequence: the lever skill check — which wants a HIGH d20 — never passes under
 * worst rolls, so no `ending_victory` fires here; that is expected and irrelevant, since a skill check
 * cannot kill the player and survival is purely a combat property.) Packs come straight from the
 * generator (the moving eval distribution), so the witness tracks the per-cycle mint window.
 */
import { describe, it, expect } from "vitest";
import type { GameState } from "../../src/core/state.js";
import type { Rng } from "../../src/core/rng.js";
import type { Action } from "../../src/api/types.js";
import { generateRpgPack } from "../../src/gen/rpg_generator.js";
import { HP_VAR } from "../../src/rpg/schema.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import { exhaustiveEndingsMulti } from "./support/exhaustive_endings.js";

// A spread covering all five themes (theme = |seed| % 5) and a range of award splits / skill
// difficulties — the same 12-seed window bug_0173's guarantee suite pins, so the concrete witness and
// the arithmetic guarantee cover the identical slice of the emitted distribution.
const SEEDS = Array.from({ length: 12 }, (_, i) => i);
const MAX_STATES = 200_000;

// WORST rolls for the player: own strike min (d6 = 1), damage taken max (enemy d6 = 6). resolveAttack
// draws the player's strike first, the enemy's reply second → [LOW, HIGH]. (A skill check draws once;
// under LOW it always fails — expected, see the header: survival is a combat-only property.)
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
const worstRng = (): Rng => fixedSeqRng([LOW, HIGH]);

// Phase A explores the combat-free region: every progress action EXCEPT ATTACK (so no fight begins),
// also dropping the reversible/observation moves the reachability solver skips (they only bloat the
// search without unlocking a buff or a room).
const NON_COMBAT_SKIP: ReadonlySet<Action["type"]> = new Set([
  "ATTACK",
  "DROP",
  "CLOSE",
  "LOOK",
  "INVENTORY",
  "READ",
  "INSPECT",
]);
const noCombat = (a: Action): boolean => !NON_COMBAT_SKIP.has(a.type);

describe("the RPG generator's combat_guaranteed gauntlet survives by CONCRETE worst-roll play (bug_0174)", () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: a fully-prepared player survives both keepers under worst rolls, independent of validateRpg`, () => {
      const pack = generateRpgPack(seed);
      // This witness only speaks to the DECLARED guarantee; assert the pack actually declares it, so a
      // future generator that quietly drops the flag fails loudly here rather than passing vacuously.
      expect(pack.meta.combat_guaranteed).toBe(true);

      const wardenFlag = pack.enemies.find((e) => e.id === "warden")?.defeat_flag;
      expect(wardenFlag, "expected a warden enemy with a defeat flag").toBeTruthy();
      const deathEndings = new Set(pack.endings.filter((e) => e.death).map((e) => e.id));
      const isDeath = (id: string | undefined): boolean => !!id && deathEndings.has(id);
      const initHp = pack.meta.vars_init.hp ?? 0;

      const index = indexRpgPack(pack);
      const start: GameState = initStateForRpgPack(index, seed);
      const worst = buildRpgRules(index, worstRng);

      // ── Phase A: find a READY state (fully buffed, pristine — no fight begun). ────────────────────
      let maxAtk = -Infinity;
      let maxDef = -Infinity;
      const combatFree: GameState[] = [];
      const phaseA = exhaustiveEndingsMulti(
        [worst],
        start,
        MAX_STATES,
        (s: GameState) => {
          const atk = s.vars.attack ?? 0;
          const def = s.vars.defense ?? 0;
          if (atk > maxAtk) maxAtk = atk;
          if (def > maxDef) maxDef = def;
          combatFree.push(s);
        },
        { explore: noCombat },
      );
      expect(phaseA.cappedOut, `seed ${seed}: combat-free phase hit the cap`).toBe(false);

      // The optional buffs genuinely exist and are reachable WITHOUT fighting: the best reachable stats
      // sit ABOVE the starting stats (else "fully prepared" would collapse to "unbuffed").
      expect(maxAtk, `seed ${seed}: no reachable attack buff`).toBeGreaterThan(
        pack.meta.vars_init.attack ?? 0,
      );
      expect(maxDef, `seed ${seed}: no reachable defense buff`).toBeGreaterThan(
        pack.meta.vars_init.defense ?? 0,
      );

      // A ready state: best attack AND best defense, with HP still full — so the player is prepared and
      // has taken no damage and engaged no keeper (Phase A never stepped ATTACK).
      const ready = combatFree.find(
        (s) =>
          (s.vars.attack ?? 0) === maxAtk &&
          (s.vars.defense ?? 0) === maxDef &&
          (s.vars[HP_VAR] ?? 0) === initHp,
      );
      expect(
        ready,
        `seed ${seed}: no fully-prepared, full-HP state reachable without fighting`,
      ).toBeTruthy();
      if (!ready) return;

      // ── Phase B: from READY, no worst-roll continuation kills the prepared player; some clears the
      //    whole gauntlet alive. This is the independent counterpart to COMBAT_GAUNTLET_NOT_GUARANTEED.
      let survivedGauntlet = false;
      const phaseB = exhaustiveEndingsMulti([worst], ready, MAX_STATES, (s: GameState) => {
        if (wardenFlag && s.flags[wardenFlag] && (s.vars[HP_VAR] ?? 0) > 0 && !s.ended) {
          survivedGauntlet = true; // both keepers felled (warden gates behind the foe) and still standing
        }
      });
      expect(phaseB.cappedOut, `seed ${seed}: prepared-survival phase hit the cap`).toBe(false);

      const preparedDeaths = [...phaseB.reached].filter(isDeath);
      expect(
        preparedDeaths,
        `seed ${seed}: a FULLY-PREPARED player (atk ${maxAtk}/def ${maxDef}, full HP) died under worst ` +
          `rolls — the cumulative combat_guaranteed promise is FALSE by concrete play: ${preparedDeaths.join(", ")}`,
      ).toEqual([]);
      expect(
        survivedGauntlet,
        `seed ${seed}: no fully-prepared worst-roll path felled BOTH keepers while still standing — ` +
          `the survival guarantee is vacuous (a prepared player never cleared the gauntlet alive)`,
      ).toBe(true);

      // ── Phase C: the gamble is real — BOTH keeper deaths remain reachable under worst rolls by
      //    UNDER-prepared play, so the guarantee is earned by preparation, not by toothless enemies. ──
      const phaseC = exhaustiveEndingsMulti([worst], start, MAX_STATES);
      expect(phaseC.cappedOut, `seed ${seed}: conditional phase hit the cap`).toBe(false);
      const deathsReached = new Set([...phaseC.reached].filter(isDeath));
      expect(
        deathsReached,
        `seed ${seed}: expected BOTH keeper deaths reachable under worst rolls (the gamble is real for ` +
          `the under-prepared); got: ${[...deathsReached].join(", ")}`,
      ).toEqual(new Set(["ending_fallen_sentinel", "ending_fallen_guardian"]));
    });
  }
});
