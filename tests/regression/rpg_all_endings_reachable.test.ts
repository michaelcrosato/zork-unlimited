/**
 * Structural verification (§15) — every declared ending of every shipped RPG pack is
 * dynamically reachable by concrete play and renders as the player sees it. The two
 * extreme legal RNG regimes bracket combat and skill outcomes; an unsupported raw HP
 * condition, a capped search, a missing declaration, or a dangling end target fails
 * closed. Packs are auto-discovered from content/rpg/quests.
 *
 * This is deliberately the single exhaustive pass for ending proof. The former death and
 * non-death render suites retain fast declaration-classification guards, while this pass
 * collects each terminal witness and checks both absolute player-facing render contracts.
 */
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { Action } from "../../src/api/types.js";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";
import { endingText } from "../../src/rpg/model.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import type { Ending } from "../../src/rpg/schema.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { exhaustiveEndingsMulti } from "./support/exhaustive_endings.js";
import { hpConditionSupportForPack } from "./support/rpg_hp_condition_support.js";
import {
  seededOpeningTransferFailureMessage,
  seededOpeningTransferSupportForPack,
} from "./support/seeded_opening_transfer.js";
import {
  isWolfReleasedHuntSolverAction,
  replayRpgCampaignSeed,
  WOLF_JUNE_RELEASE_SEED,
} from "./support/rpg_campaign_seed.js";

const PACK_DIR = "content/rpg/quests";
const packFiles = readdirSync(PACK_DIR)
  .filter((f) => f.endsWith(".yaml"))
  .sort();

// The route-rich Wolf-Winter graph exhausts at 315,100 states and the campaign-seeded
// June release graph at 8,793. Keep bounded headroom while making a future blowup loud.
const MAX_STATES = 400_000;
const SOLVER_TEST_TIMEOUT_MS = 360_000;
const WORLD = loadOverworldManifest(process.cwd());

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

// An attack draws player strike then enemy reply. These two legal regimes cover best and
// worst combat/skill outcomes without inventing any transition.
const bestRng = (): Rng => fixedSeqRng([HIGH, LOW]);
const worstRng = (): Rng => fixedSeqRng([LOW, HIGH]);

function assertCleanDeathRender(
  obs: ReturnType<typeof buildRpgObservation>,
  def: Ending,
  maxScore: number,
): void {
  expect(obs.ended).toBe(true);
  expect(obs.ending_id).toBe(def.id);
  expect(obs.ending).not.toBeNull();
  expect(obs.ending!.id).toBe(def.id);
  expect(obs.ending!.death).toBe(true);
  expect(obs.ending!.title).toBe(def.title);
  expect(obs.ending!.text).toBe(def.text);
  expect(obs.title).toBe(def.title);
  expect(obs.description.startsWith(def.text.trimEnd())).toBe(true);
  expect(obs.ending!.text).not.toContain("Final score");
  if (maxScore > 0) {
    expect(obs.description).toContain(`Final score: ${obs.score} of ${maxScore}.`);
  }
}

function assertCleanNonDeathRender(
  obs: ReturnType<typeof buildRpgObservation>,
  def: Ending,
  state: GameState,
  maxScore: number,
): void {
  const resolvedText = endingText(def, state);
  expect(obs.ended).toBe(true);
  expect(obs.ending_id).toBe(def.id);
  expect(obs.ending).not.toBeNull();
  expect(obs.ending!.id).toBe(def.id);
  expect(obs.ending!.death).toBe(false);
  expect(obs.ending!.title).toBe(def.title);
  expect(obs.ending!.text).toBe(resolvedText);
  expect(obs.title).toBe(def.title);
  expect(obs.description.startsWith(resolvedText.trimEnd())).toBe(true);
  expect(obs.ending!.text).not.toContain("Final score");
  if (maxScore > 0) {
    expect(obs.description).toContain(`Final score: ${obs.score} of ${maxScore}.`);
  }
}

describe("every declared RPG ending is reachable and renders cleanly", () => {
  it("discovers the shipped RPG packs", () => {
    expect(packFiles.length).toBeGreaterThanOrEqual(2);
  });

  for (const file of packFiles) {
    it(
      `${file}: exhaustive concrete witnesses reach and render every declared ending`,
      () => {
        const loaded = loadRpgSourceFile(join(PACK_DIR, file));
        expect(loaded.ok).toBe(true);
        if (!loaded.ok) return;
        const pack = loaded.compiled.pack;
        const seededOpeningSupport = seededOpeningTransferSupportForPack(pack);
        expect(
          seededOpeningSupport.unsupported,
          seededOpeningTransferFailureMessage(file, seededOpeningSupport),
        ).toBe(false);
        const declared = new Set(pack.endings.map((ending) => ending.id));
        expect(declared.size).toBeGreaterThan(0);

        const hpSupport = hpConditionSupportForPack(pack);
        expect(
          hpSupport.unsupported,
          `pack gates a condition on an unsupported HP predicate — only player hp <= threshold ` +
            `at or above the maximum one-round counterattack in a combat_guaranteed pack is supported`,
        ).toBe(false);

        const index = indexRpgPack(pack);
        const ruleSets = [buildRpgRules(index, bestRng), buildRpgRules(index, worstRng)];
        const starts: {
          state: GameState;
          explore?: (action: Action) => boolean;
        }[] = [{ state: initStateForRpgPack(index, 7) }];
        // Direct quest starts have no campaign facts. June's HUNT release route needs its
        // legal overworld import, so this concrete root replays that dialogue rather than
        // manufacturing post-choice flags.
        if (pack.meta.id === WOLF_JUNE_RELEASE_SEED.packId) {
          starts.push({
            state: replayRpgCampaignSeed(index, WORLD, WOLF_JUNE_RELEASE_SEED).final,
            explore: isWolfReleasedHuntSolverAction,
          });
        }

        const reached = new Set<string>();
        const witnesses = new Map<string, GameState>();
        let states = 0;
        let cappedOut = false;
        for (const start of starts) {
          const result = exhaustiveEndingsMulti(
            ruleSets,
            start.state,
            MAX_STATES,
            (state) => {
              if (
                state.ended &&
                state.endingId &&
                declared.has(state.endingId) &&
                !witnesses.has(state.endingId)
              ) {
                witnesses.set(state.endingId, state);
              }
            },
            {
              ...(start.explore ? { explore: start.explore } : {}),
            },
          );
          for (const endingId of result.reached) reached.add(endingId);
          states += result.states;
          cappedOut ||= result.cappedOut;
        }

        expect(cappedOut, `state-space search hit the ${MAX_STATES} cap (explored ${states})`).toBe(
          false,
        );
        expect(reached.size).toBeGreaterThan(0);
        const missing = [...declared].filter((endingId) => !reached.has(endingId));
        expect(
          missing,
          `declared endings never reached by concrete play: ${missing.join(", ")}`,
        ).toEqual([]);
        const undeclared = [...reached].filter((endingId) => !declared.has(endingId));
        expect(
          undeclared,
          `reached endings not declared in pack.endings: ${undeclared.join(", ")}`,
        ).toEqual([]);

        for (const ending of pack.endings) {
          const witness = witnesses.get(ending.id);
          expect(
            witness,
            `ending ${ending.id} never received a concrete terminal witness`,
          ).toBeDefined();
          if (!witness) continue;
          const observation = buildRpgObservation(index, witness);
          if (ending.death === true) {
            assertCleanDeathRender(observation, ending, pack.meta.max_score ?? 0);
          } else {
            assertCleanNonDeathRender(observation, ending, witness, pack.meta.max_score ?? 0);
          }
        }
      },
      SOLVER_TEST_TIMEOUT_MS,
    );
  }
});
