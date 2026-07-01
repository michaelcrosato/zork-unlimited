/**
 * Structural verification (§15) — every declared ending of every shipped CYOA pack
 * RENDERS cleanly to the player who reaches it. This COMPLETES the absolute
 * ending-render oracle across all THREE modes: bug_0221 (death endings) and bug_0223
 * (non-death endings) closed the render proof for parser + RPG, but both EXCLUDED CYOA
 * "by construction" — CYOA's EndingSchema carries no `death` field and uses a different
 * observation builder (src/cyoa/observation.ts, `buildObservation` → CyoaObservation),
 * so neither parser-observation oracle ever exercised the CYOA render path. This file is
 * the CYOA leg: it builds the real player-facing `CyoaObservation` on a concrete terminal
 * witness for every declared CYOA ending and asserts a clean render.
 *
 * Why this is a real gap, not a duplicate
 * ---------------------------------------
 * Three layers already touch CYOA endings and NONE locks their player-facing RENDER:
 *   - cyoa_all_endings_reachable.test.ts (bug_0121) proves every declared ending is
 *     route-reachable, but over an ABSTRACT BFS on GameState that "never renders an
 *     observation" — it never builds what the player is SHOWN at the end.
 *   - cyoa_metamorphic_observation_stream.test.ts proves the CYOA render is
 *     RELABEL-INVARIANT (original ≅ id-relabeled twin) — a RELATIVE isomorphism, not an
 *     ABSOLUTE contract: a renderer that showed the stale SCENE title (the scene the
 *     player was standing in) instead of the ending title at every ending would still be
 *     twin-isomorphic and pass.
 *   - No test in the suite builds `buildObservation` (the CYOA observation builder) on a
 *     terminal state at all (verified: `grep -rl buildCyoaObservation tests/` is empty;
 *     the CYOA builder is imported as `buildObservation`, exercised only on interior
 *     scenes by the metamorphic stream, never asserted absolutely at an ending).
 * So the CYOA ending render — the last thing a CYOA player ever sees — was exercised only
 * IMPLICITLY by the blind playtests, never systematically asserted. This is the exact gap
 * bug_0221/0223 closed for the other two modes.
 *
 * What "renders cleanly" means for CYOA (src/cyoa/observation.ts)
 * --------------------------------------------------------------
 * A player who reaches a declared ending is shown:
 *   - `ended: true` and `ending_id` == the ending's id (a UI keys terminal state off these);
 *   - `available_actions: []` — a terminal offers no further choices (a graph sink);
 *   - `scene_id` == the ending's id — the engine `goto`s the ending node before ending, so
 *     the rendered node is the ending itself, not the scene the player chose FROM (the
 *     bug_0012 checkWin-goto contract the runner header calls out: without the goto the
 *     player would see the scene they were standing in under an `ended` flag);
 *   - `title` == the ending's OWN title — NOT a stale scene title (the CYOA analogue of
 *     bug_0221's "stale room name" check, the single strongest tooth here);
 *   - `text` == a DECLARED epilogue of that ending — its base `text` or, when the ending
 *     carries reactive `variants`, the first whose `when` holds (endingText, declared
 *     order, first-match-wins). A regression rendering the previous scene's prose, an empty
 *     string (the textFor fallback), or some other node's text yields text OUTSIDE the
 *     ending's declared candidate set and FAILS.
 * CYOA has no `death` flag and no "Final score" closure (no CYOA score economy — cf.
 * parser/RPG score-economy notes), so those parser/RPG checks are correctly absent.
 *
 * How a witness is obtained, and why it is sound
 * ----------------------------------------------
 * CYOA is fully DETERMINISTIC (choices only, no rolls), so a single rule set suffices. The
 * shared exhaustive solver (support/exhaustive_endings.ts) visits every DISTINCT reachable
 * state once and hands each to `onState` — terminal states included. We capture the first
 * terminal state whose endingId is a declared ending as a concrete WITNESS, then build the
 * real player-facing observation on it and assert it renders cleanly. Every witness comes
 * from a real `makeStep` over the engine's own legal choices. A declared ending never
 * witnessed FAILS loudly (a severed route), so the render checks can never pass vacuously;
 * a discovery guard floors the total ending count so a broken glob cannot go vacuous either.
 *
 * Pure test addition — no content/engine/validator/hash change. Packs are auto-discovered
 * from content/cyoa/pack, so a new pack is covered the moment it ships (the bug_0096 bar).
 */
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { GameState } from "../../src/core/state.js";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack, endingText } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { exhaustiveEndings } from "./support/exhaustive_endings.js";
import type { Ending } from "../../src/cyoa/schema.js";

const PACK_DIR = "content/cyoa/pack";
const packFiles = readdirSync(PACK_DIR)
  .filter((f) => f.endsWith(".yaml"))
  .sort();

// Same backstop the CYOA reachability suite uses; every shipped pack settles well under it.
const MAX_STATES = 200_000;

// watchtower_road's reachable region is the largest shipped pack; give the per-pack walk a
// generous explicit ceiling so a parallel-suite wall-clock flake (bug_0150/0152) can't fail
// it — a genuine non-termination still trips MAX_STATES (a loud `cappedOut`), not the clock.
const TEST_TIMEOUT_MS = 60_000;

/** Run the deterministic solver and return the first terminal witness state per ending id. */
function endingWitnesses(
  rules: ReturnType<typeof buildRules>,
  start: GameState,
  ids: Set<string>,
): { witness: Map<string, GameState>; cappedOut: boolean } {
  const witness = new Map<string, GameState>();
  const onState = (s: GameState): void => {
    if (s.ended && s.endingId && ids.has(s.endingId) && !witness.has(s.endingId)) {
      witness.set(s.endingId, s);
    }
  };
  const { cappedOut } = exhaustiveEndings(rules, start, MAX_STATES, onState);
  return { witness, cappedOut };
}

/**
 * The player-facing render contract for a reached CYOA ending. `s` is the concrete terminal
 * witness; `obs` is the real observation built on it. The text must be a DECLARED epilogue of
 * THIS ending (base or a reactive variant) — and it must equal what the runner's own
 * `endingText` resolves for the witness state, so the assertion is both an absolute
 * declared-text membership check AND an agreement check with the canonical resolver.
 */
function assertCleanEndingRender(
  obs: ReturnType<typeof buildObservation>,
  ending: Ending,
  witness: GameState,
): void {
  // Terminal shape: ended at this ending, with no further choices to offer.
  expect(obs.mode).toBe("cyoa");
  expect(obs.ended).toBe(true);
  expect(obs.ending_id).toBe(ending.id);
  expect(obs.available_actions).toEqual([]);

  // The engine gotos the ending node before ending, so the rendered node IS the ending —
  // not the scene the player chose from.
  expect(obs.scene_id).toBe(ending.id);

  // The player sees the ending's OWN title, never a stale scene title (the strongest tooth).
  expect(obs.title).toBe(ending.title);

  // The rendered epilogue is a DECLARED text of this ending — its base text or, when it
  // carries reactive variants, the first whose `when` holds. A render of the previous
  // scene's prose / an empty fallback / another node's text falls outside this set.
  const declaredTexts = [ending.text, ...(ending.variants ?? []).map((v) => v.text)];
  expect(declaredTexts).toContain(obs.text);
  // And it agrees exactly with the canonical resolver on the witness state.
  expect(obs.text).toBe(endingText(ending, witness));
  expect(obs.text.trim().length).toBeGreaterThan(0);
}

describe("every declared ending of every CYOA pack renders cleanly when reached", () => {
  it("discovers CYOA endings to render-check (guard against a vacuous pass)", () => {
    let total = 0;
    for (const f of packFiles) {
      const l = loadPackFile(join(PACK_DIR, f));
      if (l.ok) total += l.compiled.pack.endings.length;
    }
    // 25 across the shipped 6 CYOA packs (3–5 each); floor leaves headroom for content churn
    // while still failing loudly if discovery breaks and the suite goes vacuous.
    expect(total).toBeGreaterThanOrEqual(20);
  });

  for (const file of packFiles) {
    it(
      `${file} (cyoa): each declared ending renders cleanly when reached`,
      () => {
        const loaded = loadPackFile(join(PACK_DIR, file));
        expect(loaded.ok).toBe(true);
        if (!loaded.ok) return;
        const pack = loaded.compiled.pack;
        const ends = pack.endings;
        expect(ends.length).toBeGreaterThan(0);
        const index = indexPack(pack);
        const rules = buildRules(index);
        const start = initStateForPack(index, 7);
        const { witness, cappedOut } = endingWitnesses(
          rules,
          start,
          new Set(ends.map((e) => e.id)),
        );
        expect(cappedOut, "state-space search hit the cap (witnesses unproven)").toBe(false);
        for (const ending of ends) {
          const s = witness.get(ending.id);
          expect(s, `ending ${ending.id} never reached by concrete play`).toBeDefined();
          if (!s) continue;
          assertCleanEndingRender(buildObservation(index, s), ending, s);
        }
      },
      TEST_TIMEOUT_MS,
    );
  }
});
