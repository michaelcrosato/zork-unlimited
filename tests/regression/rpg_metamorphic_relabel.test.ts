/**
 * Metamorphic contamination-robustness oracle (§15) for the RPG mode — bug_0212, the
 * RPG-mode extension that COMPLETES the trilogy begun by the CYOA oracle (bug_0209,
 * cyoa_metamorphic_relabel.test.ts) and the PARSER oracle (bug_0211,
 * parser_metamorphic_relabel.test.ts). This is the deferred "extend the metamorphic
 * relabel oracle to the RPG mode" lever named as next-focus #1 across the last several
 * cycles, following the exact growth path the bug_0121 reachability oracle took
 * (CYOA → parser → rpg).
 *
 * Every existing structural oracle (every-ending-reachable, variant-liveness,
 * score-economy, no-dead-pocket) runs on the LITERAL shipped packs; none of them prove
 * the load-bearing assumption underneath all of them and underneath the benchmark itself:
 * that a pack's behaviour is INVARIANT under a consistent renaming of its identifiers —
 * i.e. that the AdventureForge engine is genuinely id-driven and content-free, never
 * special-casing a literal id string (its engine-keyword vars `score`/`hp`/`attack`/
 * `defense` are held fixed by the relabeler exactly as a builtin verb would be).
 *
 * RPG-SPECIFIC SHAPE. Unlike CYOA/parser, RPG is not fully deterministic — an ATTACK
 * round and a skill check draw from the seeded PRNG. So, exactly like the RPG reachability
 * oracle (rpg_all_endings_reachable.test.ts), the census here is computed over the
 * BEST/WORST-roll BRACKET: two rule sets (player's best rolls / player's worst rolls)
 * unioned by `exhaustiveEndingsMulti`, which brackets every middle outcome because the
 * only routing-relevant combat/skill consequence is monotone in the roll. The shipped
 * packs gate routing on `defeat_flag`s, never on a raw HP value (the reachability oracle
 * asserts this), so the bracket is complete and the two-regime census is the RPG analogue
 * of the parser's single deterministic BFS.
 *
 * For each shipped RPG pack this:
 *   1. computes ground-truth artefacts on the ORIGINAL pack — the best/worst-roll
 *      ending-reachability census, the distinct-state count, and validateRpg's
 *      finding-code multiset;
 *   2. produces a structurally isomorphic twin via `relabelRpgPack`, in which every
 *      identifier (the full parser surface PLUS enemy ids / `room` / `defeat_flag` /
 *      `death_ending` / `on_defeat` effects) is rewritten to an opaque `mx_<n>` token by
 *      one consistent bijection, while all prose, command vocabulary, and the reserved
 *      vars `{score, hp, attack, defense}` are left byte-identical (see relabel_rpg.ts);
 *   3. recomputes the same three artefacts on the twin (with the SAME best/worst bracket);
 *   4. asserts the metamorphic relation: the twin's reached-ending set equals the
 *      original's mapped through the bijection; the distinct-state counts are EQUAL (a
 *      graph isomorphism — including the synthesised `__enemy_hp_<id>` vars, which follow
 *      the relabeled enemy ids); and validateRpg's finding-code multiset is identical.
 *
 * Payoffs (mirroring the CYOA/parser oracles): a soundness witness for the whole id-driven
 * engine design — a future change routing RPG behaviour through a literal id would pass
 * every literal-pack oracle but diverge HERE — and a contamination-robustness witness for
 * the benchmark ([[ultraplan-true-goal-pivot]]): a model that "solved" an RPG pack by
 * memorising its id strings (enemy ids, defeat flags) gains nothing on the twin.
 *
 * NON-VACUITY is asserted explicitly (the map is non-empty, no id maps to itself, no
 * original ending id survives in the twin's reached set), so this can never degenerate
 * into comparing a pack to itself; and the relabeler's completeness is self-checked — a
 * missed id site leaves a dangling reference that breaks the twin's validation or shifts
 * its census, failing here rather than passing silently.
 */
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { GameState } from "../../src/core/state.js";
import type { Rng } from "../../src/core/rng.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import { RpgPackSchema, type RpgPack } from "../../src/rpg/schema.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import { exhaustiveEndingsMulti, type ExhaustiveResult } from "./support/exhaustive_endings.js";
import { relabelRpgPack } from "./support/relabel_rpg.js";

const PACK_DIR = "content/rpg/quests";
const packFiles = readdirSync(PACK_DIR)
  .filter((f) => f.endsWith(".yaml"))
  .sort();

// Matches the RPG reachability oracle's evidence-backed bound. Wolf-Winter's progress
// graph exhausts at 332,551 states (measured 2026-07-11); original and relabeled twin
// each get bounded headroom, and a cap-out remains a loud failure rather than a hang.
const MAX_STATES = 400_000;
// Matches rpg_metamorphic_observation_stream's budget: tide_mill's census legs stretch
// ~3x under contended CI runners (its sibling blew a 120s budget on PR #80's first CI
// run), and interruptible dialogue (f23c8a09) multiplies edges per dialogue state
// (~2x wall time). MAX_STATES, not the clock, bounds the work — a hang still fails loudly.
const TEST_TIMEOUT_MS = 900_000;

// Best/worst-roll PRNGs, identical to rpg_all_endings_reachable.test.ts. resolveAttack
// draws player strike first, enemy reply second; resolveSkillCheck draws once.
// BEST for the player: own strike max, damage taken min, skill roll max → [HIGH, LOW].
// WORST for the player: own strike min, damage taken max, skill roll min → [LOW, HIGH].
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

function census(pack: RpgPack): ExhaustiveResult {
  const index = indexRpgPack(pack);
  const start: GameState = initStateForRpgPack(index, 7);
  const ruleSets = [buildRpgRules(index, bestRng), buildRpgRules(index, worstRng)];
  return exhaustiveEndingsMulti(ruleSets, start, MAX_STATES);
}

const sortedCodes = (pack: RpgPack): string[] =>
  validateRpg(pack)
    .findings.map((f) => f.code)
    .sort();

describe("bug_0212 — RPG pack behaviour is invariant under a consistent identifier relabeling", () => {
  it("discovers the shipped RPG packs", () => {
    expect(packFiles.length).toBeGreaterThanOrEqual(2);
  });

  for (const file of packFiles) {
    it(
      `${file}: the relabeled twin is reachability-, state-count-, and validation-isomorphic`,
      () => {
        const path = join(PACK_DIR, file);
        const loaded = loadRpgSourceFile(path);
        expect(loaded.ok).toBe(true);
        if (!loaded.ok) return;
        const original = loaded.compiled.pack;

        // --- Original artefacts (ground truth) ---
        const orig = census(original);
        expect(orig.cappedOut, `original census hit the ${MAX_STATES} cap`).toBe(false);
        expect(orig.reached.size).toBeGreaterThan(0); // pack is finishable, not a dead walk
        const origCodes = sortedCodes(original);

        // --- Relabel into a structurally isomorphic twin ---
        const { pack: twin, relabeler } = relabelRpgPack(original);

        // The twin must still be a schema-valid RPG pack (a malformed relabel — a dropped
        // key, or an extra key under the .strict() schema — fails loudly here).
        const reparsed = RpgPackSchema.safeParse(twin);
        expect(reparsed.success, "relabeled twin must re-parse against the RPG schema").toBe(true);

        // NON-VACUITY: the relabel actually renamed things — no id maps to itself, and the
        // map is non-empty. (Reserved fixed points like score/hp/attack/defense are never
        // entered into the map.) Without it the equalities below could pass on identity.
        expect(relabeler.map.size).toBeGreaterThan(0);
        for (const [oldId, newId] of relabeler.map) {
          expect(newId, `id "${oldId}" must be renamed, not left as itself`).not.toBe(oldId);
        }

        // --- Twin artefacts (same best/worst bracket) ---
        const twinResult = census(twin);
        expect(twinResult.cappedOut, `twin census hit the ${MAX_STATES} cap`).toBe(false);
        const twinCodes = sortedCodes(twin);

        // --- The metamorphic relation ---
        // (1) Reachability is preserved exactly: the twin reaches precisely the original's
        //     endings, mapped through the bijection.
        const expectedReached = new Set([...orig.reached].map((e) => relabeler.r(e)));
        expect(
          [...twinResult.reached].sort(),
          "twin reached-ending set must equal the original's mapped through the relabeling",
        ).toEqual([...expectedReached].sort());

        // (1b) And those mapped ids are genuinely different strings: no original ending id
        //      survives in the twin's reached set.
        const survivors = [...twinResult.reached].filter((e) => orig.reached.has(e));
        expect(survivors, "no original ending id should survive the relabeling").toEqual([]);

        // (2) State-graph isomorphism: a consistent bijective relabel (including the
        //     synthesised __enemy_hp_<id> vars) yields exactly the same number of distinct
        //     reachable states.
        expect(
          twinResult.states,
          "relabeling must not change the distinct-state count (graph isomorphism)",
        ).toBe(orig.states);

        // (3) Validation output is id-invariant: the same multiset of finding codes.
        expect(twinCodes, "validateRpg finding codes must be invariant under relabeling").toEqual(
          origCodes,
        );
      },
      TEST_TIMEOUT_MS,
    );
  }
});
