/**
 * The procedural RPG generator (src/gen/rpg_generator.ts) is the only supported moving-target
 * content generator. A generator is only useful if every pack it mints clears the SAME bar the
 * hand-authored RPG packs clear, so this suite holds generated packs to exactly that bar,
 * reusing the production RPG validator and the shared best/worst-roll exhaustive solver — no
 * weaker, generator-specific check:
 *
 *   1. DETERMINISM (§8.5) — same seed ⇒ byte-identical pack (the reproducibility the whole
 *      eval-distribution idea rests on; a non-deterministic generator could never be a stable
 *      held-out corpus).
 *   2. SCHEMA-VALID — `generateRpgPack` returns an `RpgPackSchema.parse`d object; we re-assert it.
 *   3. VALIDATOR-CLEAN — `validateRpg` reports ZERO findings (not merely zero errors): the full
 *      parser bar (reachability, soft-locks, score economy, dialogue termination, …) PLUS the
 *      RPG bar (HP/attack/defense present, enemy in a real room with a declared death ending,
 *      the fight WINNABLE on best reachable stats, the skill check PASSABLE). A minted pack is
 *      as clean as a shipped one — and crucially this exercises the COMBAT and SCORE-ECONOMY
 *      validators that define the RPG mode.
 *   4. EXHAUSTIVELY SOLVABLE — the shared `exhaustiveEndingsMulti` best/worst-roll bracket (the
 *      ground-truth proof behind bug_0124/0147) reaches EVERY declared ending by concrete play
 *      and no undeclared one, without hitting the state cap. After the bug_0171 two-fight
 *      deepening that is a THREE-ending census: the relic-claimed victory (which requires winning
 *      BOTH fights AND passing the lever check — the best-line cumulative HP surviving both is the
 *      bracket proof v1's single fight never stressed) and a DISTINCT death per guardian (fall to
 *      the gallery sentinel under-armed; survive it but fall to the deeper guardian). The same
 *      HP-gate assumption guard the shipped RPG suites use protects the bracket's completeness.
 *   5. LOAD-BEARING GATES — the only path to victory runs through BOTH fights (each room's east
 *      exit gated on that enemy's defeat flag) and the skill check (down exit gated on the levered
 *      quest stage).
 *
 * Run across a spread of seeds so the proof covers the whole emitted distribution, not one
 * lucky pack. If a future change emits an unsolvable/unclean/unwinnable pack, the seed fails here.
 */
import { describe, it, expect } from "vitest";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";
import { generateRpgPack } from "../../src/gen/rpg_generator.js";
import { RpgPackSchema, HP_VAR } from "../../src/rpg/schema.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import { exhaustiveEndingsMulti } from "../regression/support/exhaustive_endings.js";

// A spread of seeds covering every theme, every award split, and a range of skill difficulties.
const SEEDS = Array.from({ length: 24 }, (_, i) => i);
const MAX_STATES = 200_000;

// The same fixed-sequence roll regimes the shipped RPG reachability suite uses: BEST for the
// player ([HIGH, LOW] → own strike max, damage taken min, skill roll max) and WORST ([LOW, HIGH]).
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

/** Recursively scan for any CONDITION that gates on an HP var — the bracket's load-bearing
 *  assumption (see rpg_all_endings_reachable.test.ts). Effect writes never match. */
function readsHpInCondition(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(readsHpInCondition);
  if (node && typeof node === "object") {
    for (const k of ["var_gte", "var_lte", "var_eq"] as const) {
      const cmp = (node as Record<string, unknown>)[k];
      if (
        cmp &&
        typeof cmp === "object" &&
        typeof (cmp as { name?: unknown }).name === "string" &&
        ((cmp as { name: string }).name === HP_VAR ||
          (cmp as { name: string }).name.startsWith("__enemy_hp_"))
      ) {
        return true;
      }
    }
    return Object.values(node as Record<string, unknown>).some(readsHpInCondition);
  }
  return false;
}

describe("the procedural RPG generator emits packs that clear the shipped RPG bar", () => {
  it("is deterministic: the same seed yields a byte-identical pack", () => {
    for (const seed of [0, 3, 7, 19]) {
      expect(generateRpgPack(seed)).toEqual(generateRpgPack(seed));
    }
  });

  it("distinct seeds (different themes) yield distinct packs", () => {
    // Guards against a generator that ignores its seed and emits one fixed pack (which would
    // make the spread vacuous). Seeds 0 and 1 select different themes.
    expect(generateRpgPack(0)).not.toEqual(generateRpgPack(1));
  });

  for (const seed of SEEDS) {
    it(`seed ${seed}: schema-valid, RPG-validator-clean, and exhaustively solvable`, () => {
      const pack = generateRpgPack(seed);

      // (2) schema-valid (re-assert; the generator already parses internally).
      expect(() => RpgPackSchema.parse(pack)).not.toThrow();

      // (3) validator-clean — zero findings of ANY severity, across the full parser + RPG bar.
      const report = validateRpg(pack);
      expect(
        report.findings,
        `validator findings for seed ${seed}: ` +
          report.findings.map((f) => `${f.severity}/${f.code}: ${f.message}`).join(" | "),
      ).toEqual([]);
      expect(report.ok).toBe(true);

      // The score economy is tight and non-trivial: declared max == the four awards' sum (bug_0171).
      expect(pack.meta.max_score).toBeGreaterThan(0);

      // (4) exhaustively solvable — best/worst-roll bracket reaches every declared ending.
      // Guard the bracket's completeness assumption first (no HP-gated routing).
      expect(
        readsHpInCondition(pack),
        `seed ${seed} gates a condition on an HP var — the best/worst-roll bracket assumes none`,
      ).toBe(false);

      const index = indexRpgPack(pack);
      const start: GameState = initStateForRpgPack(index, seed);
      const ruleSets = [buildRpgRules(index, bestRng), buildRpgRules(index, worstRng)];
      const { reached, states, cappedOut } = exhaustiveEndingsMulti(ruleSets, start, MAX_STATES);

      expect(cappedOut, `seed ${seed} hit the ${MAX_STATES} state cap (explored ${states})`).toBe(
        false,
      );
      const declared = new Set(pack.endings.map((e) => e.id));
      const missing = [...declared].filter((e) => !reached.has(e));
      expect(missing, `seed ${seed} declared endings never reached: ${missing.join(", ")}`).toEqual(
        [],
      );
      const undeclared = [...reached].filter((e) => !declared.has(e));
      expect(
        undeclared,
        `seed ${seed} reached endings not declared: ${undeclared.join(", ")}`,
      ).toEqual([]);
      // The pack genuinely forks three ways (bug_0171): the victory and a DISTINCT death per
      // guardian (fall to the gallery sentinel; survive it and fall to the deeper guardian) — all
      // three reached by concrete best/worst-roll play.
      expect(reached.size).toBe(3);
    });
  }

  it("emits a TWO-FIGHT gauntlet: two distinct enemies, each its own room + death ending (bug_0171)", () => {
    // Lock the deepened shape so a future flattening back to one fight fails loudly even though a
    // single-fight pack would still pass the generic bar above.
    const pack = generateRpgPack(0);
    expect(pack.enemies).toHaveLength(2);

    const [sentinel, guardian] = pack.enemies;
    // The lesser sentinel stands in the gallery (the first fight, the one the MCP surface attacks);
    // the greater guardian stands deeper in the span (the second fight).
    expect(sentinel?.id).toBe("foe");
    expect(sentinel?.room).toBe("gallery");
    expect(guardian?.id).toBe("warden");
    expect(guardian?.room).toBe("span");

    // Distinct defeat flags and distinct DEATH endings (so the bracket proves a 3-ending census).
    expect(sentinel?.defeat_flag).not.toBe(guardian?.defeat_flag);
    expect(sentinel?.death_ending).toBe("ending_fallen_sentinel");
    expect(guardian?.death_ending).toBe("ending_fallen_guardian");
    const deaths = pack.endings.filter((e) => e.death).map((e) => e.id);
    expect(new Set(deaths)).toEqual(new Set(["ending_fallen_sentinel", "ending_fallen_guardian"]));

    // The greater guardian is genuinely the harder fight (escalation, not a duplicate).
    expect(guardian?.hp ?? 0).toBeGreaterThan(sentinel?.hp ?? 0);
  });

  it("the path to victory is gated on BOTH fights and the skill check", () => {
    // Prove every gate is load-bearing, not decorative: the gallery's east exit requires
    // the SENTINEL's defeat flag, the span's
    // east exit requires the GUARDIAN's defeat flag, and the hearth's down exit requires the
    // levered quest stage — so victory cannot be reached without winning BOTH fights AND passing
    // the lever check. (The exhaustive solver above proves the dynamic counterpart: no win without
    // surviving both and levering the seal.)
    const pack = generateRpgPack(0);
    const gallery = pack.rooms.find((r) => r.id === "gallery");
    const span = pack.rooms.find((r) => r.id === "span");
    const hearth = pack.rooms.find((r) => r.id === "hearth");
    const galleryEast = gallery?.exits.find((e) => e.direction === "east");
    const spanEast = span?.exits.find((e) => e.direction === "east");
    const down = hearth?.exits.find((e) => e.direction === "down");
    const sentinelFlag = pack.enemies.find((e) => e.id === "foe")?.defeat_flag;
    const guardianFlag = pack.enemies.find((e) => e.id === "warden")?.defeat_flag;

    // Each combat-room east exit is gated on that enemy's own defeat flag.
    expect(galleryEast?.conditions).toEqual([{ has_flag: sentinelFlag }]);
    expect(spanEast?.conditions).toEqual([{ has_flag: guardianFlag }]);
    // The down exit is gated on the quest stage the skill check sets.
    expect(down?.conditions).toContainEqual({ quest_stage: { quest: "way", stage: "open" } });
  });
});
