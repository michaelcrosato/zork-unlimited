/**
 * Structural verification (§15) — every NON-DEATH ending of every shipped RPG
 * pack RENDERS cleanly to the player who reaches it. This is the exact COMPLEMENT of
 * death_endings_render_cleanly.test.ts (bug_0221): that oracle render-checks endings
 * with `death: true`; this one render-checks endings with `death: false` — the WIN
 * endings (ending_cured / ending_guided / ending_victory / …) and the non-death
 * moral-failure endings (the greed/betrayal forks: ending_betrayal / ending_thief /
 * ending_plunder / …). Together the two oracles cover the FULL declared ending set of
 * every RPG pack with an absolute player-facing render proof.
 *
 * Why this is a real gap, not a duplicate
 * ---------------------------------------
 * Three layers already touch non-death endings, and none locks their player-facing RENDER:
 *   - rpg_all_endings_reachable.test.ts proves every declared ending is
 *     route-reachable, but over an ABSTRACT BFS that inspects GameState and "never
 *     renders an observation" — it never builds what the player is SHOWN.
 *   - The score-economy oracles prove the reachable max score equals max_score, on state.
 *   - The metamorphic per-step observation oracles (bug_0213/0214/0215) prove the render
 *     is RELABEL-INVARIANT (original ≅ id-relabeled twin), but that is a relative
 *     isomorphism, not an ABSOLUTE contract: a renderer that showed the stale ROOM name
 *     instead of the ending title at every win would still be isomorphic to its twin and
 *     pass. bug_0221 closed the absolute gap for death endings ONLY (it filters
 *     `death === true`). The WIN render — the single most important thing a satisfied
 *     player ever sees — and the non-death moral endings had no absolute render lock; they
 *     were exercised only IMPLICITLY by the blind playtests, never systematically asserted.
 *
 * What "renders cleanly" means here:
 * a player who reaches a non-death ending is shown the ending's own TITLE (not a stale
 * room name), its epilogue TEXT leading the description, `death: false` (a UI keys off
 * this to mark a win/non-death close, NOT a loss), and — for a scored pack — the
 * "Final score: X of Y." closure on the description only (canonical ending text stays pure).
 *
 * How a witness is obtained, and why it is sound
 * ----------------------------------------------
 * The shared exhaustive solver (support/exhaustive_endings.ts) visits every DISTINCT
 * reachable state once and hands each to `onState` — terminal states included. We capture
 * the first terminal state whose endingId is a declared NON-death ending as a concrete
 * WITNESS, then build the real player-facing observation on it and assert it renders
 * cleanly. Every witness comes from a real `makeStep` over the engine's own legal actions.
 * For RPG, under the SAME best/worst-roll bracket the reachability proof uses — and the
 * WIN falls out of the BEST-roll regime (you survive the combat), exactly the path we need
 * a win witness for. A declared non-death ending never witnessed FAILS loudly (a severed
 * route), so the render checks can never pass vacuously.
 *
 * Pure test addition — no content/engine/validator/hash change. CYOA is out of scope by
 * construction (its EndingSchema carried no `death` field and used a different observation
 * builder), exactly as in bug_0221.
 */
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { GameState } from "../../src/core/state.js";
import type { Rng } from "../../src/core/rng.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import { endingText } from "../../src/rpg/model.js";
import type { Ending } from "../../src/rpg/schema.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { exhaustiveEndingsMulti } from "./support/exhaustive_endings.js";
import type { Rules } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";

// Same backstop the reachability suites use; every shipped pack settles well under it.
const MAX_STATES = 200_000;

// Best/worst-roll rule sets for RPG, identical to rpg_all_endings_reachable.test.ts. The
// BEST regime (own strike max, damage taken min) is what carries a WIN — the path we need a
// non-death witness for.
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

type NonDeathEnding = Ending;

/** The non-death endings a pack declares. */
function nonDeathEndingsOf(endings: Ending[]) {
  return endings.filter((e) => e.death !== true);
}

/** Run the solver and return the first terminal witness state for each non-death ending id. */
function nonDeathWitnesses<A extends Action>(
  ruleSets: Rules<A>[],
  start: GameState,
  ids: Set<string>,
): { witness: Map<string, GameState>; cappedOut: boolean } {
  const witness = new Map<string, GameState>();
  const onState = (s: GameState): void => {
    if (s.ended && s.endingId && ids.has(s.endingId) && !witness.has(s.endingId)) {
      witness.set(s.endingId, s);
    }
  };
  const { cappedOut } = exhaustiveEndingsMulti(ruleSets, start, MAX_STATES, onState);
  return { witness, cappedOut };
}

/**
 * The player-facing render contract for a reached non-death ending: the player sees the
 * ending's own TITLE (not a stale room name), its epilogue TEXT, the `death: false` flag a
 * UI marks a win/non-death close with (NOT a loss), and — for a scored pack — a "Final
 * score" closure on the description only (the canonical ending text stays pure).
 */
function assertCleanNonDeathRender(
  obs: ReturnType<typeof buildRpgObservation>,
  def: NonDeathEnding,
  state: GameState,
  maxScore: number,
): void {
  expect(obs.ended).toBe(true);
  expect(obs.ending_id).toBe(def.id);

  const resolvedText = endingText(def, state);

  // The structured ending block every renderer reads carries the resolved non-death
  // epilogue faithfully, including route-specific reactive variants.
  expect(obs.ending).not.toBeNull();
  expect(obs.ending!.id).toBe(def.id);
  expect(obs.ending!.death).toBe(false);
  expect(obs.ending!.title).toBe(def.title);
  expect(obs.ending!.text).toBe(resolvedText);

  // Player-visible fields: at the ending the player is shown the ending's TITLE (not the
  // room name) and the epilogue prose leads the description (not the room's static text).
  expect(obs.title).toBe(def.title);
  expect(obs.description.startsWith(resolvedText.trimEnd())).toBe(true);

  // Score closure rides the description only; the canonical ending text stays pure.
  expect(obs.ending!.text).not.toContain("Final score");
  if (maxScore > 0) {
    expect(obs.description).toContain(`Final score: ${obs.score} of ${maxScore}.`);
  }
}

const RPG_DIR = "content/rpg/pack";
const rpgFiles = readdirSync(RPG_DIR)
  .filter((f) => f.endsWith(".yaml"))
  .sort();

describe("every non-death ending of every RPG pack renders cleanly when reached", () => {
  it("discovers non-death endings to render-check (guard against a vacuous pass)", () => {
    let total = 0;
    for (const f of rpgFiles) {
      const l = loadRpgSourceFile(join(RPG_DIR, f));
      if (l.ok) total += nonDeathEndingsOf(l.compiled.pack.endings).length;
    }
    expect(total).toBeGreaterThanOrEqual(10);
  });

  for (const file of rpgFiles) {
    it(`${file} (rpg): each declared non-death ending renders cleanly when reached`, () => {
      const loaded = loadRpgSourceFile(join(RPG_DIR, file));
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) return;
      const pack = loaded.compiled.pack;
      const ends = nonDeathEndingsOf(pack.endings);
      if (ends.length === 0) return; // nothing to render-check
      const index = indexRpgPack(pack);
      const start = initStateForRpgPack(index, 7);
      const { witness, cappedOut } = nonDeathWitnesses(
        [buildRpgRules(index, bestRng), buildRpgRules(index, worstRng)],
        start,
        new Set(ends.map((d) => d.id)),
      );
      expect(cappedOut, "state-space search hit the cap (witnesses unproven)").toBe(false);
      for (const def of ends) {
        const s = witness.get(def.id);
        expect(s, `non-death ending ${def.id} never reached by concrete play`).toBeDefined();
        if (!s) continue;
        assertCleanNonDeathRender(buildRpgObservation(index, s), def, s, pack.meta.max_score ?? 0);
      }
    });
  }
});
