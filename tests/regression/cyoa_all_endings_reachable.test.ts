/**
 * Structural verification (§15) for bug_0121 — every declared ending of every shipped
 * CYOA pack is DYNAMICALLY reachable by actual play, proven by an exhaustive concrete
 * solver rather than by the validator's conservative static approximation.
 *
 * Why this exists (the gap two clean blind playtests this cycle exposed):
 *   - The CYOA validator's ENDING_UNREACHABLE (src/validate/cyoa_validator.ts) is, by
 *     its own header, a "documented, conservative approximation": it walks an OVER-
 *     approximated abstract scene graph, so it can call an ending "reachable" that the
 *     concrete game can never actually get to (it abstracts away precise gating —
 *     item consumption, var thresholds, mutually-exclusive flags, deadline arithmetic).
 *     It is sound for "this IS unreachable" but NOT a proof of "this IS reachable".
 *   - `npm run health` runs a DYNAMIC playthrough on only one of seven packs
 *     (watchtower_road, via the random/heuristic coverage bot), and that bot — by the
 *     assessor's own standing note — "can't solve the puzzles", so it reaches only a
 *     subset of endings. Every other pack's dynamic solvability rests on scattered,
 *     incidental per-bug golden routes; no single guarantee says "this pack is winnable
 *     to EVERY declared ending."
 *
 * This closes both gaps with ground truth. For each pack it runs a breadth-first search
 * over the CONCRETE action space (the engine's own `buildObservation` legal choices fed
 * back through `makeStep`, including the meta.deadline checkWin), keyed on the full game
 * state, and asserts the set of endings actually reached equals the set declared. A
 * declared-but-unreachable ending (dead content the static check might miss) fails here;
 * so does a regression that severs a route to any ending. The search is bounded by a
 * large safety cap and the test FAILS if the cap is hit (so it can never silently pass
 * by truncating an unexplored region) — sound by construction. Packs are auto-discovered
 * from content/cyoa/pack, so a new pack is covered the moment it ships (cf. the
 * health-covers-all-packs bar).
 *
 * Scope is CYOA (choice-only action space, finite & cheap to exhaust). The PARSER mode,
 * also deterministic, gets the same ground-truth proof via the shared solver in
 * parser_all_endings_reachable.test.ts. RPG (seeded combat/skill rolls keyed on
 * state.step) is the remaining extension — its winnability is proven separately by the
 * combat-bound checks (src/validate/rpg_validator.ts), since a pure-fingerprint BFS
 * cannot soundly exhaust its randomness.
 *
 * The BFS itself (over the engine's own `rules.legalActions` set) is mode-agnostic and
 * lives in support/exhaustive_endings.ts; this file supplies the CYOA wiring and the
 * per-pack assertions.
 */
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { exhaustiveEndings } from "./support/exhaustive_endings.js";

const PACK_DIR = "content/cyoa/pack";
const packFiles = readdirSync(PACK_DIR)
  .filter((f) => f.endsWith(".yaml"))
  .sort();

// A safety bound on the concrete search. The shipped packs settle in well under a
// thousand distinct states; this ceiling exists only so an unbounded-var loop in some
// FUTURE pack fails loudly here (cap hit) instead of hanging or silently truncating.
const MAX_STATES = 200_000;

// watchtower_road's full reachable CYOA region is the largest shipped pack (tens of thousands
// of distinct states); its BFS completes in ~2s standalone but can nudge past vitest's 5s
// DEFAULT timeout under parallel suite load (the same wall-clock flake bug_0150/bug_0152
// documented and fixed for their own large-watchtower tests — surfaced here once bug_0153 added
// another CYOA BFS to the parallel pool). Give the per-pack walk a generous explicit ceiling,
// matching cyoa_variant_liveness / no_dead_pocket: this guards ONLY against a wall-clock FLAKE —
// a genuine non-termination still trips the MAX_STATES cap (a loud `cappedOut` failure), not the
// wall clock. No assertion changed.
const TEST_TIMEOUT_MS = 60_000;

/** Exhaustively explore a pack from its initial state; return every ending id reached. */
function reachableEndings(packPath: string): {
  reached: Set<string>;
  states: number;
  cappedOut: boolean;
} {
  const loaded = loadPackFile(packPath);
  if (!loaded.ok) throw new Error(`pack must compile: ${packPath}`);
  const index = indexPack(loaded.compiled.pack);
  const rules = buildRules(index);
  return exhaustiveEndings(rules, initStateForPack(index, 7), MAX_STATES);
}

describe("bug_0121 — every declared ending of every CYOA pack is reachable by concrete play", () => {
  it("discovers the shipped CYOA packs", () => {
    // Guard: if the directory or glob ever yields nothing, the per-pack assertions
    // below would vacuously pass — fail loudly instead.
    expect(packFiles.length).toBeGreaterThanOrEqual(3);
  });

  for (const file of packFiles) {
    it(
      `${file}: the exhaustive solver reaches every declared ending`,
      () => {
        const path = join(PACK_DIR, file);
        const loaded = loadPackFile(path);
        expect(loaded.ok).toBe(true);
        if (!loaded.ok) return;
        const declared = new Set(loaded.compiled.pack.endings.map((e) => e.id));

        const { reached, states, cappedOut } = reachableEndings(path);

        // The search must have actually completed — a cap-out means the state space was
        // not exhausted, so any "all endings reached" claim would be unproven.
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
      TEST_TIMEOUT_MS,
    );
  }
});
