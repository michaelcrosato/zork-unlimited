/**
 * Structural verification (§15) — bug_0150: every PROGRESS-REACHABLE state of every shipped
 * pack is LIVE, i.e. can still reach SOME declared ending. No reachable state is a dynamic
 * SOFT-LOCK POCKET — a place normal play can wander into and never finish from.
 *
 * Why this is a real gap the existing net does NOT cover:
 *   - The every-ending-reachable proofs certify `declared endings ⊆ reachable-FROM-START`.
 *     That is a statement about
 *     the START state only. It says NOTHING about interior states: a pack can have every
 *     declared ending reachable by some route AND still contain a reachable pocket — a region
 *     you enter by a legal progress move and from which no ending is reachable at all. The
 *     ending census passes (the endings fire via OTHER routes) while a player who took the
 *     wrong door is permanently stuck. That is the single worst structural defect in an
 *     adventure, and the ending proof is blind to it.
 *   - The static SOFTLOCK validator (src/validate/*) approximates this on the condition graph,
 *     but it is an APPROXIMATION with KNOWN false negatives: bug_0092 found a real soft-lock
 *     MASKED because a provably-dead terminal (an unsatisfiable win / an unfireable deadline)
 *     was counted as a live escape edge. This is the DYNAMIC ground-truth complement — it
 *     walks the engine's own legal transitions, so a dead terminal simply never appears as an
 *     escape and the masked pocket surfaces directly. (Same static→dynamic relationship as
 *     bug_0146 vs the static parser_variant_shadowing, and bug_0148 vs static SCORE_PEAKS.)
 *
 * Method (mode-agnostic, reuses the shared solver):
 *   1. One exhaustive BFS over the engine's legal PROGRESS actions (support/exhaustive_endings)
 *      with the new `onEdge` hook, reconstructing the full reachable transition graph and
 *      marking every terminal (`s.ended`) state.
 *   2. A backward-liveness fixpoint: seed LIVE with every terminal, propagate over reverse
 *      edges. A state is LIVE iff it can reach a terminal.
 *   3. Assert every reachable state is LIVE — a reachable non-live state is a soft-lock pocket.
 *
 * Soundness & scope:
 *   - SCOPE is the progress-action region — the EXACT region and policy the ending proofs
 *     certify (`isProgressAction`: skip the reversible DROP/CLOSE and the pure-observation
 *     verbs). So this proves: a player using progress moves can never strand themselves out of
 *     reach of every ending. It deliberately does NOT claim DROP/CLOSE cannot self-strand — no
 *     shipped route gates on a drop (the helper's MONOTONE-RESTRICTION note), and a player who
 *     drops a needed key in a sealed room is self-inflicting, out of this invariant's scope.
 *   - PASS is sound: RPG uses best/worst-roll brackets (`exhaustiveEndingsMulti`) so
 *     skill-check/combat outcomes that
 *     are monotone in the roll are represented in the graph. A state LIVE under the bracketed
 *     edges is LIVE under some real play, and a state dead under BOTH extremes is genuinely
 *     dead — guarded, for RPG, by asserting no condition gates on a raw HP value.
 *   - A cap-out makes the graph partial and the result unproven → the test FAILS (never a
 *     silent pass), matching the ending suites.
 *
 * Failure modes, all loud: a reachable dead pocket fails (lists sample fingerprints + state
 * count); a cap-out fails. Packs are auto-discovered, so a new pack is covered the moment it
 * ships (the health-covers-all-packs bar, bug_0096).
 */
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { EngineAction, Rules } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import type { Rng } from "../../src/core/rng.js";
import { stateKey, exhaustiveEndingsMulti } from "./support/exhaustive_endings.js";

import { loadRpgSourceFile, compileRpgSource } from "../../src/rpg/source.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import { HP_VAR } from "../../src/rpg/schema.js";

// Same backstop as the ending suites; the shipped packs settle well under it (the largest,
// watchtower_road, is ~83k progress-reachable states). The cap exists only so a future blowup
// fails loudly (cap hit) rather than silently truncating an unexplored — possibly dead — region.
const MAX_STATES = 200_000;

// The edge-collecting BFS over the largest pack (watchtower_road, ~83k states) runs in a few
// seconds but exceeds vitest's 5s default under full-suite parallel load. A generous per-pack
// ceiling keeps it non-flaky on a slow CI box; a true blowup still trips the MAX_STATES cap
// (a loud cappedOut), not this wall-clock bound.
const TEST_TIMEOUT_MS = 60_000;

type LivenessResult = {
  states: number;
  cappedOut: boolean;
  deadCount: number;
  /** Up to a few dead-state fingerprints, for a legible failure message. */
  sampleDead: string[];
};

/**
 * Run the exhaustive progress-action BFS over `ruleSets`, reconstruct the reachable transition
 * graph via `onEdge`, and run a backward-liveness fixpoint. Returns how many reachable states
 * cannot reach any terminal (the soft-lock pockets). Mode-agnostic: the caller supplies the
 * compiled rules + initial state, exactly as the ending suites do.
 */
function analyzeLiveness<A extends EngineAction>(
  ruleSets: Rules<A>[],
  start: GameState,
): LivenessResult {
  // Intern fingerprints to integer ids so the ~80k-state graphs stay light (number[] reverse
  // adjacency instead of arrays of long strings).
  const id = new Map<string, number>();
  const isTerminal: boolean[] = [];
  const preds: number[][] = []; // reverse adjacency: preds[to] = [from, ...]
  const intern = (k: string): number => {
    let i = id.get(k);
    if (i === undefined) {
      i = id.size;
      id.set(k, i);
      isTerminal.push(false);
      preds.push([]);
    }
    return i;
  };

  const onState = (s: GameState): void => {
    const i = intern(stateKey(s));
    if (s.ended) isTerminal[i] = true;
  };
  const onEdge = (from: string, to: string): void => {
    preds[intern(to)]!.push(intern(from));
  };

  const { states, cappedOut } = exhaustiveEndingsMulti(ruleSets, start, MAX_STATES, onState, {
    onEdge,
  });

  // Backward-liveness fixpoint: a state is LIVE iff it can reach a terminal. Seed with every
  // terminal and propagate over reverse edges (iterative, no recursion — graphs are large).
  const n = id.size;
  const live: boolean[] = new Array(n).fill(false);
  const stack: number[] = [];
  for (let i = 0; i < n; i++) {
    if (isTerminal[i]) {
      live[i] = true;
      stack.push(i);
    }
  }
  while (stack.length > 0) {
    const t = stack.pop()!;
    for (const p of preds[t]!) {
      if (!live[p]) {
        live[p] = true;
        stack.push(p);
      }
    }
  }

  const deadIds: number[] = [];
  for (let i = 0; i < n; i++) if (!live[i]) deadIds.push(i);
  const sampleSet = new Set(deadIds.slice(0, 5));
  const sampleDead: string[] = [];
  if (sampleSet.size > 0) {
    for (const [k, i] of id) if (sampleSet.has(i)) sampleDead.push(k);
  }
  return { states, cappedOut, deadCount: deadIds.length, sampleDead };
}

/** Assert a result is fully explored and has zero soft-lock pockets. */
function expectAllLive(label: string, r: LivenessResult): void {
  expect(r.cappedOut, `${label}: search hit the ${MAX_STATES} cap (explored ${r.states})`).toBe(
    false,
  );
  // Guard against a vacuous pass (an empty graph would trivially have zero dead states).
  expect(r.states, `${label}: explored no states`).toBeGreaterThan(0);
  expect(
    r.deadCount,
    `${label}: ${r.deadCount}/${r.states} reachable states are soft-lock pockets ` +
      `(no path to any ending). e.g.\n  ${r.sampleDead.join("\n  ")}`,
  ).toBe(0);
}

// ── RPG roll bracket (mirrors rpg_all_endings_reachable.test.ts) ────────────────────────────
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

function isHpVar(name: string): boolean {
  return name === HP_VAR || name.startsWith("__enemy_hp_");
}
function readsHpInCondition(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(readsHpInCondition);
  if (node && typeof node === "object") {
    for (const k of ["var_gte", "var_lte", "var_eq"] as const) {
      const cmp = (node as Record<string, unknown>)[k];
      if (
        cmp &&
        typeof cmp === "object" &&
        typeof (cmp as { name?: unknown }).name === "string" &&
        isHpVar((cmp as { name: string }).name)
      ) {
        return true;
      }
    }
    return Object.values(node as Record<string, unknown>).some(readsHpInCondition);
  }
  return false;
}

// ── Positive coverage: every shipped RPG pack ───────────────────────────────────────────────
describe("bug_0150 — every progress-reachable state of every shipped pack is LIVE", () => {
  const rpgPacks = readdirSync("content/rpg/pack")
    .filter((f) => f.endsWith(".yaml"))
    .sort();

  it("discovers the shipped packs", () => {
    // Guard: an empty glob would make every per-pack assertion vacuously pass.
    expect(rpgPacks.length).toBeGreaterThanOrEqual(2);
  });

  for (const file of rpgPacks) {
    it(
      `RPG ${file}: no soft-lock pocket`,
      () => {
        const loaded = loadRpgSourceFile(join("content/rpg/pack", file));
        expect(loaded.ok).toBe(true);
        if (!loaded.ok) return;
        const pack = loaded.compiled.pack;
        // The best/worst-roll bracket is complete only when no route gates on a raw HP value
        // (same load-bearing guard as the RPG ending proof). Fail loudly if a pack ever does.
        expect(
          readsHpInCondition(pack),
          `${file}: a condition gates on an HP var — extend the solver to branch HP before ` +
            `trusting the best/worst-roll liveness bracket`,
        ).toBe(false);
        const index = indexRpgPack(pack);
        expectAllLive(
          file,
          analyzeLiveness(
            [buildRpgRules(index, bestRng), buildRpgRules(index, worstRng)],
            initStateForRpgPack(index, 7),
          ),
        );
      },
      TEST_TIMEOUT_MS,
    );
  }
});

// ── Negative + positive controls: the detector BITES, and is not trigger-happy ──────────────
// The liveness analysis is fully mode-agnostic (it operates on rules + state), so a control in
// any one mode proves the algorithm itself. The pair shares a structure that differs ONLY in
// whether the trap region has a progress-action route onward.
describe("bug_0150 — the soft-lock-pocket detector bites (and only when it should)", () => {
  const rpgPack = (trapEscapes: boolean): string => `
meta: { id: t, title: T, start_room: s }
rooms:
  - id: s
    name: S
    description: "Start — branches two ways."
    exits: [{ direction: north, to: good }, { direction: south, to: trap }]
  - id: good
    name: G
    description: "The goal room."
    exits: [{ direction: south, to: s }]
  - id: trap
    name: TR
    description: "A pit."
    exits: [${trapEscapes ? "{ direction: north, to: s }" : ""}]
win_conditions:
  - { id: w, conditions: [{ visited: good }], ending: e_good }
endings:
  - { id: e_good, title: EG, text: "You win." }
enemies: []
`;

  function rpgLiveness(src: string): LivenessResult {
    const r = compileRpgSource(src);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("control pack must compile");
    const index = indexRpgPack(r.compiled.pack);
    return analyzeLiveness(
      [buildRpgRules(index, bestRng), buildRpgRules(index, worstRng)],
      initStateForRpgPack(index, 7),
    );
  }

  it("RPG: an exit-less trap room is flagged a soft-lock pocket", () => {
    const r = rpgLiveness(rpgPack(false));
    expect(r.cappedOut).toBe(false);
    expect(r.deadCount).toBeGreaterThan(0);
  });

  it("RPG: the SAME trap room with a way back is fully live (no false positive)", () => {
    const r = rpgLiveness(rpgPack(true));
    expect(r.cappedOut).toBe(false);
    expect(r.deadCount).toBe(0);
  });
});
