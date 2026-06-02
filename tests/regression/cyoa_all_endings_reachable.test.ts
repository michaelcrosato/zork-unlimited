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
 * Scope is CYOA (choice-only action space, finite & cheap to exhaust); the parser/RPG
 * modes, whose action space is verb×object, are the natural next extension.
 */
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";

const PACK_DIR = "content/cyoa/pack";
const packFiles = readdirSync(PACK_DIR)
  .filter((f) => f.endsWith(".yaml"))
  .sort();

// A safety bound on the concrete search. The shipped packs settle in well under a
// thousand distinct states; this ceiling exists only so an unbounded-var loop in some
// FUTURE pack fails loudly here (cap hit) instead of hanging or silently truncating.
const MAX_STATES = 200_000;

// A total, order-independent fingerprint of a game state — current scene, the set of
// true flags, carried inventory, and every numeric var (e.g. clockwork's `ticks`). Two
// states with the same fingerprint are interchangeable for reachability, so the BFS
// visits each once and is guaranteed to terminate on any finite state space.
function stateKey(s: GameState): string {
  const flags = Object.entries(s.flags)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .sort()
    .join(",");
  const inv = [...s.inventory].sort().join(",");
  const vars = Object.entries(s.vars)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
  return `${s.current}|${flags}|${inv}|${vars}`;
}

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
  const step = makeStep(rules);
  const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

  const reached = new Set<string>();
  const seen = new Set<string>();
  const start = initStateForPack(index, 7);
  const queue: GameState[] = [start];
  seen.add(stateKey(start));

  while (queue.length > 0) {
    if (seen.size > MAX_STATES) return { reached, states: seen.size, cappedOut: true };
    const s = queue.shift()!;
    if (s.ended) {
      if (s.endingId) reached.add(s.endingId);
      continue; // a terminal state offers no further actions
    }
    for (const a of buildObservation(index, s).available_actions) {
      const r = step(s, choose(a.id));
      if (!r.ok) continue; // a rejected choice does not change state
      const key = stateKey(r.state);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push(r.state);
    }
  }
  return { reached, states: seen.size, cappedOut: false };
}

describe("bug_0121 — every declared ending of every CYOA pack is reachable by concrete play", () => {
  it("discovers the shipped CYOA packs", () => {
    // Guard: if the directory or glob ever yields nothing, the per-pack assertions
    // below would vacuously pass — fail loudly instead.
    expect(packFiles.length).toBeGreaterThanOrEqual(3);
  });

  for (const file of packFiles) {
    it(`${file}: the exhaustive solver reaches every declared ending`, () => {
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
    });
  }
});
