/**
 * Structural verification (§15) — every DEATH ending of every shipped parser/RPG pack
 * RENDERS cleanly to the dying player. This GENERALIZES the per-pack render oracles
 * cold_forge_death_ending_render.test.ts (bug_0125) and rpg_barrow_death_ending_render
 * .test.ts to all packs at once, and auto-covers any future pack (the bug_0096
 * health-covers-all-packs bar).
 *
 * Why this is a real gap, not a duplicate
 * ---------------------------------------
 * Two layers already exist, and neither locks the player-facing RENDER across the board:
 *   - {parser,rpg}_all_endings_reachable.test.ts prove every declared ending — death
 *     endings included — is route-reachable, but over an ABSTRACT BFS that inspects
 *     GameState and "never renders an observation".
 *   - The combat/skill checks prove a death is dynamically reachable, again on state.
 * So nothing systematically locks that a player who actually reaches a death ending is
 * SHOWN it cleanly: the death ending's own title (not a stale room name), its epilogue
 * text, the `death: true` flag a UI keys off to mark it a loss (not a win), and the
 * score-closure tally the renderer appends. Only cold_forge and sunken_barrow had that,
 * per-pack. This cycle's mandated blind playtest (cold_forge, seed 13,
 * ai-runs/2026-06-04T01-31-27-731Z/playtest.md) came back clean but flagged exactly the
 * standing seam: the run won both times, so it "never reached a death ending to confirm
 * its text reads well." That is unconfirmable from one blind run on one pack; it is
 * provable, once, for every pack — which is what this does.
 *
 * How a death witness is obtained, and why it is sound
 * ----------------------------------------------------
 * The shared exhaustive solver (support/exhaustive_endings.ts) visits every DISTINCT
 * reachable state exactly once and hands each to `onState` — terminal states included.
 * We capture the first terminal state whose endingId is a declared death ending as a
 * concrete WITNESS, then build the real player-facing observation
 * (src/parser/observation.ts, shared by parser and RPG) on it and assert it renders
 * cleanly. Every witness is produced by a real `makeStep` over the engine's own legal
 * actions — for RPG, under the same best/worst-roll bracket the reachability proof uses
 * (a death falls out of the worst-roll regime) — so it is a state a concrete seed/play
 * genuinely reaches, never spurious. If a declared death ending is never witnessed the
 * test FAILS loudly (a severed route), so the render checks can never pass vacuously.
 *
 * Pure test addition — no content/engine/validator/hash change. Legacy CYOA content is
 * retired, so death-ending render coverage is parser/RPG-only.
 */
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { GameState } from "../../src/core/state.js";
import type { Rng } from "../../src/core/rng.js";
import { loadParserPackFile } from "../../src/parser/pack.js";
import { indexParserPack, initStateForParserPack } from "../../src/parser/model.js";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { exhaustiveEndingsMulti } from "./support/exhaustive_endings.js";
import { parserRollRuleSets } from "./support/parser_rolls.js";
import type { Rules } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";

// Same backstop the reachability suites use; every shipped pack settles well under it.
const MAX_STATES = 200_000;

// Best/worst-roll rule sets for RPG, identical to rpg_all_endings_reachable.test.ts: a
// fixed-sequence PRNG whose draws bracket the player's outcomes. resolveAttack draws the
// player's strike first, the enemy reply second; resolveSkillCheck draws once. The WORST
// regime (own strike min, damage taken max) is what drives a death — exactly the path we
// need a witness for. Parser skill checks use their own best/worst d20 bracket.
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

type DeathEnding = { id: string; title: string; text: string };

/** The death endings a pack declares (parser/RPG only carry the `death` flag). */
function deathEndingsOf(endings: { id: string; title: string; text: string; death?: boolean }[]) {
  return endings
    .filter((e) => e.death === true)
    .map((e) => ({ id: e.id, title: e.title, text: e.text }));
}

/** Run the solver and return the first terminal witness state for each death ending id. */
function deathWitnesses<A extends Action>(
  ruleSets: Rules<A>[],
  start: GameState,
  deathIds: Set<string>,
): { witness: Map<string, GameState>; cappedOut: boolean } {
  const witness = new Map<string, GameState>();
  const onState = (s: GameState): void => {
    if (s.ended && s.endingId && deathIds.has(s.endingId) && !witness.has(s.endingId)) {
      witness.set(s.endingId, s);
    }
  };
  const { cappedOut } = exhaustiveEndingsMulti(ruleSets, start, MAX_STATES, onState);
  return { witness, cappedOut };
}

/**
 * The player-facing render contract for a reached death ending (src/parser/observation.ts):
 * the dying player sees the ending's own TITLE (not a stale room name), its epilogue TEXT,
 * the `death:true` flag a UI marks the loss with, and — for a scored pack — a "Final score"
 * closure on the description only (the canonical ending text stays pure).
 */
function assertCleanDeathRender(
  obs: ReturnType<typeof buildParserObservation>,
  def: DeathEnding,
  maxScore: number,
): void {
  expect(obs.ended).toBe(true);
  expect(obs.ending_id).toBe(def.id);

  // The structured ending block every renderer reads carries the death ending faithfully.
  expect(obs.ending).not.toBeNull();
  expect(obs.ending!.id).toBe(def.id);
  expect(obs.ending!.death).toBe(true);
  expect(obs.ending!.title).toBe(def.title);
  expect(obs.ending!.text).toBe(def.text);

  // Player-visible fields: at death the player is shown the ending's TITLE (not the room
  // name) and the epilogue prose leads the description (not the room's static text).
  expect(obs.title).toBe(def.title);
  expect(obs.description.startsWith(def.text.trimEnd())).toBe(true);

  // Score closure rides the description only; the canonical ending text stays pure.
  expect(obs.ending!.text).not.toContain("Final score");
  if (maxScore > 0) {
    expect(obs.description).toContain(`Final score: ${obs.score} of ${maxScore}.`);
  }
}

const PARSER_DIR = "content/parser/pack";
const RPG_DIR = "content/rpg/pack";
const parserFiles = readdirSync(PARSER_DIR)
  .filter((f) => f.endsWith(".yaml"))
  .sort();
const rpgFiles = readdirSync(RPG_DIR)
  .filter((f) => f.endsWith(".yaml"))
  .sort();

describe("every death ending of every parser/RPG pack renders cleanly to the dying player", () => {
  it("discovers death endings to render-check (guard against a vacuous pass)", () => {
    let total = 0;
    for (const f of parserFiles) {
      const l = loadParserPackFile(join(PARSER_DIR, f));
      if (l.ok) total += deathEndingsOf(l.compiled.pack.endings).length;
    }
    for (const f of rpgFiles) {
      const l = loadRpgPackFile(join(RPG_DIR, f));
      if (l.ok) total += deathEndingsOf(l.compiled.pack.endings).length;
    }
    // 13 across the shipped 4 parser + 5 RPG packs; floor leaves headroom for content
    // churn while still failing loudly if discovery breaks and the suite goes vacuous.
    expect(total).toBeGreaterThanOrEqual(9);
  });

  for (const file of parserFiles) {
    it(`${file} (parser): each declared death ending renders cleanly when reached`, () => {
      const loaded = loadParserPackFile(join(PARSER_DIR, file));
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) return;
      const pack = loaded.compiled.pack;
      const deaths = deathEndingsOf(pack.endings);
      if (deaths.length === 0) return; // nothing to render-check
      const index = indexParserPack(pack);
      const start = initStateForParserPack(index, 7);
      const { witness, cappedOut } = deathWitnesses(
        parserRollRuleSets(index),
        start,
        new Set(deaths.map((d) => d.id)),
      );
      expect(cappedOut, "state-space search hit the cap (witnesses unproven)").toBe(false);
      for (const def of deaths) {
        const s = witness.get(def.id);
        expect(s, `death ending ${def.id} never reached by concrete play`).toBeDefined();
        if (!s) continue;
        assertCleanDeathRender(buildParserObservation(index, s), def, pack.meta.max_score ?? 0);
      }
    });
  }

  for (const file of rpgFiles) {
    it(`${file} (rpg): each declared death ending renders cleanly when reached`, () => {
      const loaded = loadRpgPackFile(join(RPG_DIR, file));
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) return;
      const pack = loaded.compiled.pack;
      const deaths = deathEndingsOf(pack.endings);
      if (deaths.length === 0) return; // nothing to render-check
      const index = indexRpgPack(pack);
      const start = initStateForRpgPack(index, 7);
      const { witness, cappedOut } = deathWitnesses(
        [buildRpgRules(index, bestRng), buildRpgRules(index, worstRng)],
        start,
        new Set(deaths.map((d) => d.id)),
      );
      expect(cappedOut, "state-space search hit the cap (witnesses unproven)").toBe(false);
      for (const def of deaths) {
        const s = witness.get(def.id);
        expect(s, `death ending ${def.id} never reached by concrete play`).toBeDefined();
        if (!s) continue;
        // RPG reuses the parser observation builder (cf. cold_forge_death_ending_render).
        assertCleanDeathRender(buildParserObservation(index, s), def, pack.meta.max_score ?? 0);
      }
    });
  }
});
