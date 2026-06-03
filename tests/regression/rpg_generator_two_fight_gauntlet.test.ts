/**
 * bug_0171 — the procedural RPG generator emits a TWO-FIGHT GAUNTLET (the v2 deepening).
 *
 * bug_0168 deepened the parser generator (depth-2 obtainability chain) and bug_0169 the CYOA
 * generator (two-axis 2×2 moral fork); the RPG generator was left the shallowest — a SINGLE fight
 * + one skill check + a three-award economy. The sunken_barrow §6 blind note (carried as the brief
 * by bug_0170) named the deepening: "a deeper RPG vertical slice — more than one combat + one skill
 * check". v2 grows a SECOND combat tier: a LESSER sentinel in the gallery, then the GREATER guardian
 * in a new span room, each its own load-bearing gate and its own distinct death ending, with a
 * FOUR-award score economy. RPG owns the richest verifier surfaces in the suite (COMBAT winnability
 * + SCORE-economy soundness), so the second fight stresses the winnability proof on a second enemy
 * and the best-line CUMULATIVE-HP survival the single fight never exercised.
 *
 * tests/unit/rpg_generator.test.ts already holds every emitted pack to the full shipped bar
 * (schema-valid, validateRpg-clean, exhaustively solvable to a 3-ending census, tight economy)
 * across 24 seeds, and held_out_corpus_sealed.test.ts pins the re-mint determinism +
 * generator_version. THIS guard is the standing proof of the two-fight SHAPE specifically: it fails
 * loudly if a future change flattens the generator back to one fight (which would still pass the
 * generic bar but quietly hollow out the deepening). It asserts both the static structure and the
 * BEHAVIORAL load-bearingness of BOTH combat tiers via the shared best/worst-roll bracket.
 */
import { describe, it, expect } from "vitest";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";
import type { Action } from "../../src/api/types.js";
import { generateRpgPack, RPG_GENERATOR_VERSION } from "../../src/gen/rpg_generator.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import { exhaustiveEndingsMulti } from "./support/exhaustive_endings.js";

const SEEDS = Array.from({ length: 12 }, (_, i) => i);
const MAX_STATES = 200_000;

// The same best/worst-roll bracket the shipped RPG reachability suites use (player-best
// [HIGH, LOW] and player-worst [LOW, HIGH] fixed sequences).
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
const bestRng = (): Rng => fixedSeqRng([HIGH, LOW]);
const worstRng = (): Rng => fixedSeqRng([LOW, HIGH]);

function bracket(pack: ReturnType<typeof generateRpgPack>, explore?: (a: Action) => boolean) {
  const index = indexRpgPack(pack);
  const start: GameState = initStateForRpgPack(index, 0);
  const ruleSets = [buildRpgRules(index, bestRng), buildRpgRules(index, worstRng)];
  return exhaustiveEndingsMulti(
    ruleSets,
    start,
    MAX_STATES,
    undefined,
    explore ? { explore } : undefined,
  );
}

// The default progress-action policy the solver uses, narrowed to also drop a chosen ATTACK
// target — so we can prove a fight is load-bearing by walking every move EXCEPT striking it.
const SKIPPED: ReadonlySet<Action["type"]> = new Set([
  "DROP",
  "CLOSE",
  "LOOK",
  "INVENTORY",
  "READ",
  "INSPECT",
]);
const exceptAttacking =
  (enemyId: string) =>
  (a: Action): boolean =>
    !SKIPPED.has(a.type) && !(a.type === "ATTACK" && a.enemy === enemyId);

describe("bug_0171 — the RPG generator emits a two-fight gauntlet", () => {
  it("the generator version is bumped to 2 (the v2 deepening; the corpus is re-sealed to match)", () => {
    expect(RPG_GENERATOR_VERSION).toBe(2);
  });

  for (const seed of SEEDS) {
    it(`seed ${seed}: two distinct enemies in sequence, each gating + its own death ending`, () => {
      const pack = generateRpgPack(seed);

      // Two distinct enemies — a flattened single-fight generator fails here.
      expect(pack.enemies).toHaveLength(2);
      const sentinel = pack.enemies.find((e) => e.id === "foe");
      const guardian = pack.enemies.find((e) => e.id === "warden");
      expect(sentinel, "missing the gallery sentinel").toBeDefined();
      expect(guardian, "missing the span guardian").toBeDefined();
      expect(sentinel!.room).toBe("gallery");
      expect(guardian!.room).toBe("span");
      expect(sentinel!.defeat_flag).not.toBe(guardian!.defeat_flag);

      // Distinct DEATH endings, both declared as deaths.
      expect(sentinel!.death_ending).toBe("ending_fallen_sentinel");
      expect(guardian!.death_ending).toBe("ending_fallen_guardian");
      const deaths = new Set(pack.endings.filter((e) => e.death).map((e) => e.id));
      expect(deaths).toEqual(new Set(["ending_fallen_sentinel", "ending_fallen_guardian"]));

      // Each fight is its own load-bearing gate: the gallery's east exit gates on the sentinel's
      // defeat, the span's east exit on the guardian's. Both feed a single linear descent.
      const galleryEast = pack.rooms
        .find((r) => r.id === "gallery")!
        .exits.find((e) => e.direction === "east");
      const spanEast = pack.rooms
        .find((r) => r.id === "span")!
        .exits.find((e) => e.direction === "east");
      expect(galleryEast?.to).toBe("span");
      expect(galleryEast?.conditions).toEqual([{ has_flag: sentinel!.defeat_flag }]);
      expect(spanEast?.to).toBe("hearth");
      expect(spanEast?.conditions).toEqual([{ has_flag: guardian!.defeat_flag }]);

      // Escalation: the second guardian is genuinely the harder fight.
      expect(guardian!.hp).toBeGreaterThan(sentinel!.hp);

      // FOUR-award economy: each guardian's on_defeat awards score, plus the lever + relic awards,
      // and max_score is their exact sum (a richer economy than v1's three terms).
      const onDefeatScore = (e: typeof sentinel) =>
        (e!.on_defeat ?? []).some((ef) => "inc_var" in ef && ef.inc_var.name === "score");
      expect(onDefeatScore(sentinel)).toBe(true);
      expect(onDefeatScore(guardian)).toBe(true);
      expect(pack.meta.max_score).toBeGreaterThanOrEqual(40);
    });
  }

  it("the FIRST fight gates the whole descent: never striking the sentinel ⇒ no ending at all", () => {
    // Walk every legal progress move under both roll regimes EXCEPT attacking the gallery sentinel.
    // Its defeat flag never sets, so the span stays sealed, the guardian is never reached, and —
    // since combat is player-initiated (the enemy only retaliates when struck) — nothing can fall
    // the player either. No ending is reachable: the first tier truly gates everything below it.
    const pack = generateRpgPack(0);
    const { reached, cappedOut } = bracket(pack, exceptAttacking("foe"));
    expect(cappedOut).toBe(false);
    expect(
      reached.size,
      `endings reached without ever striking the sentinel: ${[...reached]}`,
    ).toBe(0);
  });

  it("the SECOND fight is load-bearing: beating only the sentinel ⇒ victory & guardian-death unreachable", () => {
    // Now allow striking the sentinel but NEVER the guardian. The player can clear the gallery (and
    // can still fall to the sentinel), but the span never opens, so the hearth/lever/vault are
    // unreachable: neither the victory nor the guardian's death can fire — proving the second fight
    // is a real second tier, not decorative. The sentinel's OWN death stays reachable (under-armed,
    // worst rolls), confirming the walk is non-vacuous.
    const pack = generateRpgPack(0);
    const { reached, cappedOut } = bracket(pack, exceptAttacking("warden"));
    expect(cappedOut).toBe(false);
    expect(reached.has("ending_victory"), "victory reachable without beating the guardian").toBe(
      false,
    );
    expect(
      reached.has("ending_fallen_guardian"),
      "the guardian's death reachable without ever fighting it",
    ).toBe(false);
    // Non-vacuous: the reachable region is real play, and the sentinel can still fell the player.
    expect(reached.has("ending_fallen_sentinel")).toBe(true);
  });
});
