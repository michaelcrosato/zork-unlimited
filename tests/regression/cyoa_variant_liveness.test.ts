/**
 * Structural verification (§15) for bug_0145 — every declared reactive `variant`
 * of every shipped CYOA pack is LIVE: there exists a concretely-reachable state in
 * which that variant is the FIRST match (the text a real player actually sees). The
 * dynamic complement to bug_0085's static shadowing check.
 *
 * The gap the two checks together close — "dead reactive prose":
 *   - bug_0085 (cyoa_variant_shadowing) catches one cause statically: a later sibling
 *     whose `when` is PROVABLY ENTAILED by an earlier sibling's can never be the first
 *     match (declared order, first-match-wins). It is sound but partial — it reasons
 *     only over pure conjunctions of literals/var-bounds and never over the pack's
 *     actual gating, so it cannot see the OTHER cause of dead prose:
 *   - a variant whose `when` is never SATISFIABLE by any state the player can reach
 *     AT that scene/ending — the guard flag is only ever set on a branch that leads
 *     away and never back, a var threshold the gating never lets the counter reach, a
 *     flag combination two mutually-exclusive choices forbid. Such a variant is not
 *     shadowed by a sibling; its guard is simply unreachable, so its text is dead and
 *     no blind playtest is guaranteed to surface it (the prose just never appears).
 *
 * This proves the live half directly, against ground truth. For each pack it runs the
 * shared exhaustive concrete BFS (support/exhaustive_endings.ts — the same solver that
 * backs bug_0121's every-ending-reachable proof) and, at EVERY distinct reachable
 * state, records which scene/ending variant is the first match — i.e. exactly what
 * `sceneText`/`endingText` (src/cyoa/runner.ts) would display there. A declared variant
 * that is the first match in NO reachable state is dead content and fails here.
 *
 * Soundness — no false positives — rests on the same three properties the bug_0121
 * proof documents (DETERMINISM, FINITENESS, MONOTONE ACTION RESTRICTION). The action
 * restriction is moot for CYOA (its only action is CHOOSE, so the search is complete),
 * and the first-match index is computed with the engine's own `evalConditions`, so a
 * variant is called dead ONLY when the full reachable region genuinely never displays
 * it. The search FAILS on `cappedOut`, so it can never pass by truncating an unexplored
 * region. Packs are auto-discovered, so a new pack is covered the moment it ships.
 *
 * Scope is CYOA, matching cyoa_variant_shadowing. The parser stage (also deterministic,
 * also variant-bearing — parser_variant_shadowing) is the natural extension; its BFS
 * skips reversible/observation actions, so a parser liveness proof must first confirm no
 * variant guard turns on a skipped action's effect before reusing this approach.
 */
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { loadPackFile, compilePack } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { evalConditions } from "../../src/core/conditions.js";
import type { GameState } from "../../src/core/state.js";
import type { SceneVariant } from "../../src/cyoa/schema.js";
import { exhaustiveEndings } from "./support/exhaustive_endings.js";

const PACK_DIR = "content/cyoa/pack";
const packFiles = readdirSync(PACK_DIR)
  .filter((f) => f.endsWith(".yaml"))
  .sort();

// Same safety bound as the every-ending-reachable proof: the shipped packs settle in
// well under a thousand distinct states; the ceiling exists only so a future unbounded
// pack fails loudly (cap hit) rather than truncating silently.
const MAX_STATES = 200_000;

/** The index of the first variant whose `when` holds in `state` (first-match-wins,
 *  identical to runner.ts sceneText/endingText), or -1 for the base text. */
function firstMatch(variants: readonly SceneVariant[], state: GameState): number {
  for (let i = 0; i < variants.length; i++) {
    if (evalConditions(variants[i]!.when, state)) return i;
  }
  return -1;
}

type Liveness = {
  /** "scene:<id>#<i>" / "ending:<id>#<i>" keys that are the first match in some state. */
  displayed: Set<string>;
  /** Every declared variant key that must therefore be displayed somewhere. */
  declared: { key: string; where: string }[];
  states: number;
  cappedOut: boolean;
};

function analyze(packPath: string): Liveness {
  const loaded = loadPackFile(packPath);
  if (!loaded.ok) throw new Error(`pack must compile: ${packPath}`);
  const index = indexPack(loaded.compiled.pack);
  const pack = index.pack;
  const endingsById = new Map(pack.endings.map((e) => [e.id, e]));

  const displayed = new Set<string>();
  const record = (kind: "scene" | "ending", id: string, idx: number): void => {
    if (idx >= 0) displayed.add(`${kind}:${id}#${idx}`);
  };

  const rules = buildRules(index);
  const result = exhaustiveEndings(rules, initStateForPack(index, 7), MAX_STATES, (s) => {
    if (s.ended) {
      // A terminal state shows ending text (endings list) or an is_ending scene's text.
      const ending = s.endingId ? endingsById.get(s.endingId) : undefined;
      if (ending?.variants?.length) record("ending", ending.id, firstMatch(ending.variants, s));
      const scene = index.scenes.get(s.current);
      if (scene?.is_ending && scene.variants?.length)
        record("scene", scene.id, firstMatch(scene.variants, s));
    } else {
      const scene = index.scenes.get(s.current);
      if (scene?.variants?.length) record("scene", scene.id, firstMatch(scene.variants, s));
    }
  });

  // The full census of variants that SHOULD be displayable somewhere.
  const declared: { key: string; where: string }[] = [];
  for (const scene of pack.scenes) {
    (scene.variants ?? []).forEach((_, i) =>
      declared.push({ key: `scene:${scene.id}#${i}`, where: `scene "${scene.id}" variant #${i}` }),
    );
  }
  for (const ending of pack.endings) {
    (ending.variants ?? []).forEach((_, i) =>
      declared.push({
        key: `ending:${ending.id}#${i}`,
        where: `ending "${ending.id}" variant #${i}`,
      }),
    );
  }

  return { displayed, declared, states: result.states, cappedOut: result.cappedOut };
}

describe("bug_0145 — every reactive variant of every CYOA pack is reachable as displayed text", () => {
  it("discovers the shipped CYOA packs", () => {
    // Guard against a vacuous pass if the glob ever yields nothing.
    expect(packFiles.length).toBeGreaterThanOrEqual(3);
  });

  for (const file of packFiles) {
    it(`${file}: every declared variant is the first match in some reachable state`, () => {
      const { displayed, declared, cappedOut } = analyze(`${PACK_DIR}/${file}`);
      // The search must have exhausted the reachable region, else "not displayed" is
      // unproven (it could lie in the truncated tail).
      expect(cappedOut).toBe(false);
      // Every reactive pack ships at least one variant; a pack with none would pass
      // vacuously, which is fine, but the shipped set is reactive by design.
      const dead = declared.filter((d) => !displayed.has(d.key)).map((d) => d.where);
      expect(dead).toEqual([]);
    });
  }

  it("FAILS on a planted dead variant (guards against the check silently passing)", () => {
    // A scene variant guarded on a flag the pack never sets is dead prose. The check
    // must catch it — this is the negative control for the whole proof.
    const src = `
meta: { id: t, title: T, start: s }
scenes:
  - id: s
    title: S
    text: "base"
    variants:
      - { when: [ { has_flag: never_set }, { has_flag: also_never }, { has_flag: nope } ], text: "dead — no path sets these" }
    choices: [ { id: g, text: go, next: e } ]
endings: [ { id: e, title: E, text: "done" } ]
`;
    const r = compilePack(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const index = indexPack(r.compiled.pack);
    const rules = buildRules(index);
    const displayed = new Set<string>();
    exhaustiveEndings(rules, initStateForPack(index, 7), MAX_STATES, (st) => {
      if (st.ended) return;
      const scene = index.scenes.get(st.current);
      if (scene?.variants?.length) {
        const idx = firstMatch(scene.variants, st);
        if (idx >= 0) displayed.add(`scene:${scene.id}#${idx}`);
      }
    });
    expect(displayed.has("scene:s#0")).toBe(false);
  });
});
