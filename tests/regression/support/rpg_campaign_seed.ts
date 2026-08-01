/**
 * Concrete RPG solver seeds for quest branches that exist only when an overworld
 * campaign import is present. A seed may set only flags the quest's manifest actually
 * imports, then every authored prefix action is replayed through the real legal-action
 * and reducer seams. The returned trace therefore contains reachable campaign-start
 * states, not hand-built post-choice fixtures.
 */
import { makeStep } from "../../../src/core/engine.js";
import type { Action } from "../../../src/api/types.js";
import type { GameState } from "../../../src/core/state.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  initStateForRpgPack,
  type RpgIndex,
} from "../../../src/rpg/runner.js";
import type { OverworldManifest } from "../../../src/world/overworld.js";

export type RpgCampaignSeedFixture = Readonly<{
  /** Overworld quest id used to validate the imported campaign facts. */
  questId: string;
  /** The RPG pack's internal metadata id (not necessarily the overworld quest id). */
  packId: string;
  seed: number;
  importedFlags: readonly string[];
  actions: readonly string[];
}>;

export type RpgCampaignSeedTrace = Readonly<{
  /** Initial imported quest state followed by the state after every legal prefix action. */
  states: readonly GameState[];
  /** The final state, suitable as an exhaustive solver's additional concrete root. */
  final: GameState;
}>;

export const WOLF_JUNE_RELEASE_SEED: RpgCampaignSeedFixture = Object.freeze({
  questId: "wolf_winter",
  packId: "wolf_winter_v1",
  seed: 7,
  importedFlags: Object.freeze(["june_pike_present"]),
  actions: Object.freeze([
    "go_north",
    "talk_june_pike_combat_boundary",
    "ask_release_june_for_hunt",
  ]),
});

/** Full ordinary yard preparation keeps worst-roll tactical follow-throughs alive. */
export const WOLF_JUNE_PREPARED_RELEASE_SEED: RpgCampaignSeedFixture = Object.freeze({
  ...WOLF_JUNE_RELEASE_SEED,
  actions: Object.freeze([
    "go_north",
    "read_day_book",
    "talk_houndsman",
    "ask_wolves",
    "ask_byre",
    "ask_leave",
    "go_west",
    "take_byre_jerkin",
    "use_byre_jerkin",
    "go_east",
    "talk_june_pike_combat_boundary",
    "ask_release_june_for_hunt",
  ]),
});

/**
 * The released HUNT branch needs only locomotion, authored field uses, and combat.
 * Restricting a supplementary witness search to that real action subset avoids
 * re-exploring unrelated yard conversations and optional clothing permutations. It can
 * only hide a witness (which the calling census fails loudly); every reached state still
 * comes from a legal player action.
 */
const WOLF_RELEASED_HUNT_ACTIONS: ReadonlySet<Action["type"]> = new Set([
  "MOVE",
  "USE",
  "MANEUVER",
  "ATTACK",
]);

export function isWolfReleasedHuntSolverAction(action: Action): boolean {
  return WOLF_RELEASED_HUNT_ACTIONS.has(action.type);
}

export function replayRpgCampaignSeed(
  index: RpgIndex,
  world: OverworldManifest,
  fixture: RpgCampaignSeedFixture,
): RpgCampaignSeedTrace {
  if (index.pack.meta.id !== fixture.packId) {
    throw new Error(
      `Campaign seed for pack "${fixture.packId}" cannot initialize pack "${index.pack.meta.id}".`,
    );
  }
  const quest = world.quests.find((candidate) => candidate.id === fixture.questId);
  if (!quest) throw new Error(`Campaign seed quest "${fixture.questId}" is not in the manifest.`);
  const importedFlags = new Set(
    (quest.campaign_imports?.rules ?? []).flatMap((rule) =>
      "target_flag" in rule ? [rule.target_flag] : [],
    ),
  );
  for (const flag of fixture.importedFlags) {
    if (!importedFlags.has(flag)) {
      throw new Error(
        `Campaign seed flag "${flag}" is not an imported fact for "${fixture.questId}".`,
      );
    }
  }

  let state = initStateForRpgPack(index, fixture.seed);
  for (const flag of fixture.importedFlags) state.flags[flag] = true;
  const states: GameState[] = [state];
  const step = makeStep(buildRpgRules(index));
  for (const actionId of fixture.actions) {
    const options = enumerateRpgActions(index, state);
    const option = options.find((candidate) => candidate.id === actionId);
    if (!option) {
      throw new Error(
        `Campaign seed cannot take "${actionId}" in "${state.current}"; legal: ${options
          .map((candidate) => candidate.id)
          .join(", ")}`,
      );
    }
    const result = step(state, option.action);
    if (!result.ok) {
      throw new Error(`Campaign seed action "${actionId}" rejected: ${result.rejectionReason}`);
    }
    state = result.state;
    states.push(state);
  }
  return { states, final: state };
}
