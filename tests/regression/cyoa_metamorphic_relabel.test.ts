/**
 * Metamorphic contamination-robustness oracle (§15) for bug_0209 — a NEW oracle CLASS
 * for the project. Every existing structural oracle (every-ending-reachable,
 * variant-liveness, score-economy, no-dead-pocket) runs on the LITERAL shipped packs;
 * none of them prove the load-bearing assumption underneath all of them and underneath
 * the benchmark itself: that a pack's behaviour is INVARIANT under a consistent renaming
 * of its identifiers — i.e. that the AdventureForge engine is genuinely id-driven and
 * content-free, never special-casing a literal id string.
 *
 * This closes that gap with a metamorphic relation. For each shipped CYOA pack it:
 *   1. computes the ground-truth artefacts on the ORIGINAL pack — the exhaustive
 *      ending-reachability census (shared BFS, support/exhaustive_endings.ts), the
 *      distinct-state count, and the validator's finding-code set;
 *   2. produces a STRUCTURALLY ISOMORPHIC twin via `relabelCyoaPack`, in which every
 *      identifier (scene/ending/choice ids, flags, vars, items, objects, quest/stage
 *      names, the pack id) is rewritten to an opaque `mx_<n>` token by one consistent
 *      bijection, while all prose is left byte-identical (see relabel_cyoa.ts);
 *   3. recomputes the same three artefacts on the twin;
 *   4. asserts the metamorphic relation: the twin's reached-ending set equals the
 *      original's mapped through the bijection; the distinct-state counts are EQUAL
 *      (a true graph isomorphism explores exactly as many states); and the validator's
 *      finding-code multiset is identical (validation output is id-invariant too).
 *
 * Two things this buys (docs/CURRENT_PLAN.md "Deferred to next cycle" #3, the
 * key-free metamorphic relabel/IPT lever; bug_0208 next-focus):
 *   - A soundness witness for the whole id-driven design. If a future engine/runner
 *     change ever made behaviour depend on a literal id, every literal-pack oracle would
 *     still pass while THIS test diverged — a loud regression signal nothing else gives.
 *   - A contamination-robustness witness for the benchmark ([[ultraplan-true-goal-pivot]]):
 *     because a pack mechanically relabels into a surface-different but structurally
 *     identical twin, a model that "solved" the original by memorising its id strings
 *     gains nothing on the twin, so the eval measures structure-following, not recall.
 *
 * NON-VACUITY is asserted explicitly: the relabel must actually have CHANGED the ids
 * (the twin's reached set is disjoint from the original's, and no id maps to itself),
 * so this can never degenerate into comparing a pack to itself. And the relabeler's own
 * completeness is self-checked — a missed id site would leave a dangling reference that
 * breaks the twin's validation or shifts its census, failing here rather than passing
 * silently.
 */
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { CyoaPackSchema } from "../../src/cyoa/schema.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { validateCyoa } from "../../src/validate/cyoa_validator.js";
import { exhaustiveEndings, type ExhaustiveResult } from "./support/exhaustive_endings.js";
import { relabelCyoaPack } from "./support/relabel_cyoa.js";
import type { CyoaPack } from "../../src/cyoa/schema.js";

const PACK_DIR = "content/cyoa/pack";
const packFiles = readdirSync(PACK_DIR)
  .filter((f) => f.endsWith(".yaml"))
  .sort();

// Matches the sibling reachability oracle's bound and timeout (the largest shipped pack,
// watchtower_road, settles in well under this; the cap only guards a future unbounded-var
// loop, surfacing as a loud `cappedOut` failure rather than a hang). We run the BFS twice
// per pack here (original + twin), so keep the generous wall-clock ceiling.
const MAX_STATES = 200_000;
const TEST_TIMEOUT_MS = 90_000;

function census(pack: CyoaPack): ExhaustiveResult {
  const index = indexPack(pack);
  const rules = buildRules(index);
  return exhaustiveEndings(rules, initStateForPack(index, 7), MAX_STATES);
}

const sortedCodes = (pack: CyoaPack): string[] =>
  validateCyoa(pack)
    .findings.map((f) => f.code)
    .sort();

describe("bug_0209 — CYOA pack behaviour is invariant under a consistent identifier relabeling", () => {
  it("discovers the shipped CYOA packs", () => {
    expect(packFiles.length).toBeGreaterThanOrEqual(3);
  });

  for (const file of packFiles) {
    it(
      `${file}: the relabeled twin is reachability-, state-count-, and validation-isomorphic`,
      () => {
        const path = join(PACK_DIR, file);
        const loaded = loadPackFile(path);
        expect(loaded.ok).toBe(true);
        if (!loaded.ok) return;
        const original = loaded.compiled.pack;

        // --- Original artefacts (ground truth) ---
        const orig = census(original);
        expect(orig.cappedOut, `original census hit the ${MAX_STATES} cap`).toBe(false);
        expect(orig.reached.size).toBeGreaterThan(0); // pack is finishable, not a dead walk
        const origCodes = sortedCodes(original);

        // --- Relabel into a structurally isomorphic twin ---
        const { pack: twin, relabeler } = relabelCyoaPack(original);

        // The twin must still be a schema-valid pack (a malformed relabel — e.g. a key
        // dropped or an extra key under the .strict() schema — fails loudly here).
        const reparsed = CyoaPackSchema.safeParse(twin);
        expect(reparsed.success, "relabeled twin must re-parse against the CYOA schema").toBe(true);

        // NON-VACUITY: the relabel actually renamed things — no id maps to itself, and
        // the map is non-empty. Without this the equalities below could pass on identity.
        expect(relabeler.map.size).toBeGreaterThan(0);
        for (const [oldId, newId] of relabeler.map) {
          expect(newId, `id "${oldId}" must be renamed, not left as itself`).not.toBe(oldId);
        }

        // --- Twin artefacts ---
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

        // (1b) And those mapped ids are genuinely different strings (the census isn't
        //      vacuously comparing the same labels): no original ending id survives.
        const survivors = [...twinResult.reached].filter((e) => orig.reached.has(e));
        expect(survivors, "no original ending id should survive the relabeling").toEqual([]);

        // (2) State-graph isomorphism: a consistent bijective relabel yields a graph with
        //     exactly the same number of distinct reachable states.
        expect(
          twinResult.states,
          "relabeling must not change the distinct-state count (graph isomorphism)",
        ).toBe(orig.states);

        // (3) Validation output is id-invariant: the same multiset of finding codes.
        expect(twinCodes, "validator finding codes must be invariant under relabeling").toEqual(
          origCodes,
        );
      },
      TEST_TIMEOUT_MS,
    );
  }
});
