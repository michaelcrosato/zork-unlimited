/**
 * Structural verification (§15) — every skill_check in a shipped CYOA pack is CONVERGENT:
 * its on_success and on_failure branches leave IDENTICAL BFS-fingerprinted state (only the
 * excluded journal/narration differs). This locks the load-bearing invariant the CYOA
 * single-rules exhaustive proofs SILENTLY depend on (bug_0252).
 *
 * Why this matters — the soundness gap it closes:
 *   The CYOA every-ending-reachable (cyoa_all_endings_reachable) and score-economy
 *   (cyoa_score_economy_sound) proofs both run a SINGLE-rules breadth-first search and rest
 *   on the determinism property in support/exhaustive_endings.ts (#1): same state + action ⇒
 *   same result, so ONE step per (state, action) explores every transition. A `skill_check`
 *   breaks raw determinism — it draws a seeded d20 (resolveSkillCheck via rngForStep), so one
 *   (state, action) can resolve two ways. Three SCORED shipped packs nonetheless carry a
 *   skill_check (clockwork_heist, watchtower_road, midnight_edition), and the single-rules
 *   BFS stays sound over them for exactly ONE reason: every such check is CONVERGENT — both
 *   die outcomes `goto` the same scene and touch no flag/var/tick/quest/ending, so both
 *   produce the SAME stateKey (the fingerprint the BFS dedupes on). The seeded roll the BFS
 *   happens to draw is then irrelevant: whichever branch fires, the search lands on the same
 *   fingerprint and explores the same region.
 *
 *   Nothing tested that invariant. cyoa_skill_check_capability.test.ts proves a DIVERGENT
 *   synthetic check routes correctly (two different endings) — the opposite shape. If a future
 *   edit gave one branch of a shipped check a flag/score/tick or a different destination, the
 *   two branches would fingerprint differently; the single-rules BFS would silently explore
 *   only the seed's branch and could miss a state — an UNSOUND proof with NO failure anywhere.
 *   This test makes that regression LOUD: it steps each shipped skill-checked choice under a
 *   forced max roll (20, success) and a forced min roll (1, failure) from the same reachable
 *   pre-state and asserts the two result states share an identical stateKey.
 *
 * Non-vacuity: it also asserts the two rolls genuinely DIVERGED (the success/failure narration
 * differs) — so a check whose branches were identical by accident (and thus trivially
 * "convergent") can't pass for the wrong reason; the roll must really pick different effects
 * that nonetheless settle to the same fingerprint. And a corpus-level guard requires at least
 * one shipped pack to actually exercise a skill_check, so the suite can never pass vacuously.
 *
 * Packs are auto-discovered from content/cyoa/pack, so a new CYOA pack with a skill_check is
 * covered the moment it ships (the health-covers-all-packs bar, bug_0096).
 */
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { makeStep } from "../../src/core/engine.js";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, initStateForPack, buildRules, type CyoaIndex } from "../../src/cyoa/runner.js";
import { exhaustiveEndings, stateKey } from "./support/exhaustive_endings.js";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";
import type { Action } from "../../src/api/types.js";

const PACK_DIR = "content/cyoa/pack";
const packFiles = readdirSync(PACK_DIR)
  .filter((f) => f.endsWith(".yaml"))
  .sort();

// An rng that returns `roll` for any int() — the same best/worst-roll verification seam the
// skill-check capability test uses. 20 clears any shipped difficulty (+ skill ≥ 12); 1 fails it.
const forcedRng = (roll: number): Rng => ({ int: () => roll }) as unknown as Rng;
const MAX_STATES = 200_000;
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

/** Every (sceneId, choiceId) in a pack whose choice carries a skill_check. */
function skillCheckedChoices(index: CyoaIndex): { sceneId: string; choiceId: string }[] {
  const out: { sceneId: string; choiceId: string }[] = [];
  for (const [sceneId, scene] of index.scenes) {
    if (scene.is_ending) continue;
    for (const c of scene.choices) {
      if (c.skill_check) out.push({ sceneId, choiceId: c.id });
    }
  }
  return out;
}

/**
 * One reachable state in which `choiceId` is actually legal — found by walking the pack's own
 * BFS (default seeded rules; legality is rng-independent) and capturing the first visited state
 * that offers the choice. Returns undefined if the choice is unreachable (a severed route — a
 * separate concern the reachability proof owns; here we simply have nothing to converge-test).
 */
function reachableStateOffering(index: CyoaIndex, choiceId: string): GameState | undefined {
  const rules = buildRules(index);
  let found: GameState | undefined;
  exhaustiveEndings(rules, initStateForPack(index, 7), MAX_STATES, (s) => {
    if (found) return;
    if (rules.legalActions(s).some((a) => a.type === "CHOOSE" && a.choiceId === choiceId)) {
      found = s;
    }
  });
  return found;
}

function narration(events: { type: string }[]): string {
  return events
    .filter((e) => e.type === "narration")
    .map((e) => (e as unknown as { text: string }).text)
    .join("\n");
}

describe("CYOA convergent-skill-check soundness — both branches share one BFS fingerprint", () => {
  // Corpus guard: the single-rules CYOA proofs are only at risk (and this suite only meaningful)
  // when some shipped pack actually carries a skill_check. Keep it honest about that.
  const corpus = packFiles.flatMap((file) => {
    const loaded = loadPackFile(join(PACK_DIR, file));
    if (!loaded.ok) throw new Error(`pack must compile: ${file}`);
    const index = indexPack(loaded.compiled.pack);
    return skillCheckedChoices(index).map((sc) => ({ file, index, ...sc }));
  });

  it("the shipped corpus actually exercises CYOA skill checks (else this suite is vacuous)", () => {
    expect(corpus.length).toBeGreaterThanOrEqual(1);
  });

  for (const { file, index, sceneId, choiceId } of corpus) {
    it(`${file} · ${sceneId}/${choiceId}: success and failure leave an identical stateKey`, () => {
      const pre = reachableStateOffering(index, choiceId);
      expect(pre, `skill-checked choice ${choiceId} must be reachable`).toBeDefined();
      if (!pre) return;

      // Step the SAME pre-state under a forced success (max roll) and a forced failure (min roll).
      // Legality is rng-independent, so the choice is offered under both regimes.
      const win = makeStep(buildRules(index, () => forcedRng(20)))(pre, choose(choiceId));
      const lose = makeStep(buildRules(index, () => forcedRng(1)))(pre, choose(choiceId));
      expect(win.ok && lose.ok, "the skill-checked choice must resolve under both rolls").toBe(
        true,
      );
      if (!win.ok || !lose.ok) return;

      // The load-bearing invariant: identical BFS fingerprint. If a future edit diverges the
      // branches (a flag/var/tick/quest/ending on one side only), this fails — exactly the
      // silent-unsoundness the single-rules cyoa_all_endings / cyoa_score_economy proofs would
      // otherwise inherit.
      expect(
        stateKey(win.state),
        "skill_check branches must converge to one BFS fingerprint (the single-rules CYOA " +
          "exhaustive proofs depend on it); they diverge here",
      ).toBe(stateKey(lose.state));

      // Non-vacuity: the roll genuinely picked different branches (different narration), so the
      // convergence is a real property of two distinct outcomes, not an accident of identical effects.
      expect(
        narration(win.events),
        "the forced success and failure rolls must produce different narration (else the check " +
          "is not actually exercised)",
      ).not.toBe(narration(lose.events));
    });
  }
});
