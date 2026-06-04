/**
 * bug_0219 — a VALIDATOR-INDEPENDENT depth oracle for the CYOA generator's v3 depth-3 chain.
 *
 * Background. The CYOA generator was the SHALLOWEST of the three: parser and RPG both reached v3 (a
 * depth-3 obtainability fixpoint) while CYOA's best-act gate stayed depth-1 — learn the ally and the
 * `best` act appeared immediately. v3 deepens the PERSONAL axis's gate to depth-3 by interposing a
 * fourth `reckoning` scene: the best act now gates on `resolved`, which is set ONLY by committing in
 * the reckoning, which is in turn reachable ONLY after hearing the ally out. The chain is now three
 * ordered, individually load-bearing state-flips: learn_ally ⇒ go_reckon ⇒ commit ⇒ best.
 *
 * Why a SEPARATE oracle (the DGM lesson, arXiv:2505.22954 — the same rationale as the parser depth-
 * floor oracle, parser_generator_depth_floor.test.ts). Any "depth" the generator STAMPS and a
 * checker READS BACK is gameable: paper-deep, practice-easy. So this suite never trusts a generator
 * field or the validator's accept/reject. It recomputes depth from EMITTED CONTENT by the
 * CHOICE-KNOCKOUT technique — for each enabling choice on the best-ending path, remove just that
 * action via the shared solver's `explore` filter and assert `ending_best` becomes UNREACHABLE while
 * the OTHER endings stay reachable. Three distinct mandatory ordered flips proven load-bearing this
 * way = depth-3, recomputed independently of validateCyoa and of CYOA_GENERATOR_VERSION.
 *
 * Both directions are pinned: HARDER (≥3 load-bearing tiers on the best path) AND still SOLVABLE
 * (every declared ending reachable via the bug_0121 exhaustive solver, `cappedOut=false`) — the
 * EvilGenie setter-solver feasibility requirement (arXiv:2511.21654). Difficulty is never bought by
 * making a pack unsolvable, and the deepened gate must remove ONLY the best act, never the game.
 */
import { describe, it, expect } from "vitest";
import { generateCyoaPack } from "../../src/gen/cyoa_generator.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import type { Action } from "../../src/api/types.js";
import { exhaustiveEndings } from "./support/exhaustive_endings.js";

const SEEDS = Array.from({ length: 12 }, (_, i) => i);
const MAX_STATES = 50_000;
const BEST = "ending_best";

// The three ordered, individually-mandatory choices on the best-ending path. Each is UNIQUE in the
// pack (the hub navigation into the personal investigation, the hub navigation into the reckoning,
// and the reckoning's commitment), so removing one by id cleanly severs exactly its tier.
const CHAIN = ["learn_ally", "go_reckon", "commit"] as const;

/** Run the SAME exhaustive solver but with one choice id removed from the action policy. */
const withoutChoice = (seed: number, removeId: string) => {
  const pack = generateCyoaPack(seed);
  const index = indexPack(pack);
  const rules = buildRules(index);
  const explore = (a: Action): boolean => !(a.type === "CHOOSE" && a.choiceId === removeId);
  return exhaustiveEndings(rules, initStateForPack(index, seed), MAX_STATES, undefined, {
    explore,
  });
};

describe("bug_0219 — the CYOA generator's best-ending gate is a load-bearing depth-3 chain", () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: full play reaches ending_best with no cap-out`, () => {
      const pack = generateCyoaPack(seed);
      const index = indexPack(pack);
      const rules = buildRules(index);
      const { reached, cappedOut } = exhaustiveEndings(
        rules,
        initStateForPack(index, seed),
        MAX_STATES,
      );
      expect(cappedOut, `seed ${seed} hit the state cap`).toBe(false);
      expect(reached.has(BEST), `seed ${seed}: ending_best unreachable in full play`).toBe(true);
    });

    for (const removeId of CHAIN) {
      it(`seed ${seed}: removing "${removeId}" makes ending_best UNREACHABLE (the tier is load-bearing)`, () => {
        const { reached, cappedOut } = withoutChoice(seed, removeId);
        expect(cappedOut).toBe(false);
        expect(
          reached.has(BEST),
          `seed ${seed}: ending_best still reachable without "${removeId}" — that tier is a shortcut, not depth`,
        ).toBe(false);
        // The deepened gate removes ONLY the best act, never the whole game: the always-available
        // acts (hold, dark) stay reachable, so no knockout ever soft-locks the pack.
        expect(
          reached.has("ending_hold"),
          `seed ${seed}: hold lost when removing "${removeId}"`,
        ).toBe(true);
        expect(
          reached.has("ending_dark"),
          `seed ${seed}: dark lost when removing "${removeId}"`,
        ).toBe(true);
      });
    }
  }
});
