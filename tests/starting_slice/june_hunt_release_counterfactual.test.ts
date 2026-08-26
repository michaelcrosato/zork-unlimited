import { describe, expect, it } from "vitest";

import { makeStep } from "../../src/core/engine.js";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";
import { createToolApi } from "../../src/mcp/tools.js";
import { SAVE_MODE, load, save } from "../../src/persist/save_load.js";
import { rpgActionOptionForInputId } from "../../src/rpg/legal_actions.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import type { OverworldManifest } from "../../src/world/overworld.js";
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { revealCurrentJourneyStoryOptions } from "../regression/support/journey_story.js";
import { seedForSeededOpeningFlag } from "../regression/support/seeded_opening.js";

const WORLD = loadOverworldManifest(process.cwd());
const WOLF = WORLD.quests.find((quest) => quest.id === "wolf_winter")!;
const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("wolf_winter must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const ORDINARY_HUNT_FLAG = "opening_condition_steady_scent_channel";
const ORDINARY_HUNT_SEED = seedForSeededOpeningFlag(
  pack.meta.seeded_opening_flags,
  ORDINARY_HUNT_FLAG,
);

const JUNE = "albany:june_pike";
const PROMISE = "albany:promise_june_cattle_first";
const RELEASE_MEMORY = "albany:memory_june_released_before_hunt";
const BROKEN_MEMORY = "albany:memory_june_left_after_blood";
const DEFAULT_OATH = "albany:oath_full_compact_duty";
const RESIDENT_SHELTER = "albany:relief_resident_shelter";
const SHELTERED = "albany:wolf_approach_sheltered_stockway";

const RELEASED_ENDINGS = [
  {
    endingId: "ending_bloodied_byre_evacuated_june_released",
    expectedFacts: [
      "fact:wolf_winter_bloodshed",
      "fact:wolf_winter_old_grey_leader_remains",
      "fact:wolf_winter_bloodied_byre_evacuated",
    ],
  },
  {
    endingId: "ending_held_gate_barred_june_released",
    expectedFacts: [
      "fact:wolf_winter_byre_held",
      "fact:wolf_winter_bloodshed",
      "fact:wolf_winter_inner_gate_barred_at_dawn",
    ],
  },
  {
    endingId: "ending_held_timber_saved_june_released",
    expectedFacts: [
      "fact:wolf_winter_byre_held",
      "fact:wolf_winter_bloodshed",
      "fact:wolf_winter_repair_timber_available",
    ],
  },
  {
    endingId: "ending_held_june_released",
    expectedFacts: [
      "fact:wolf_winter_byre_held",
      "fact:wolf_winter_bloodshed",
      "fact:wolf_winter_repair_timber_spent",
    ],
  },
] as const;

function bestRolls(): Rng {
  return {
    next: () => 0.999999,
    int: (_min, max) => max,
  };
}

function fixedOutcomeRng(outcome: "best" | "worst"): Rng {
  let roll = 0;
  return {
    next: () => (outcome === "best" ? 0.999999 : 0),
    int: (min, max) => {
      const first = roll++ === 0;
      if (outcome === "best") return first ? max : min;
      return first ? min : max;
    },
  };
}

function actionIds(state: GameState): string[] {
  return enumerateRpgActions(index, state).map((option) => option.id);
}

function act(state: GameState, id: string): GameState {
  const options = enumerateRpgActions(index, state);
  const option = options.find((candidate) => candidate.id === id);
  expect(
    option,
    `expected ${id} in ${state.current}; available: ${options.map((candidate) => candidate.id).join(", ")}`,
  ).toBeDefined();
  if (!option) throw new Error(`missing ${id}`);
  const result = makeStep(buildRpgRules(index, bestRolls))(state, option.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  return result.state;
}

function actWorst(state: GameState, id: string): GameState {
  const options = enumerateRpgActions(index, state);
  const option = options.find((candidate) => candidate.id === id);
  expect(
    option,
    `expected ${id} in ${state.current}; available: ${options.map((candidate) => candidate.id).join(", ")}`,
  ).toBeDefined();
  if (!option) throw new Error(`missing ${id}`);
  const result = makeStep(buildRpgRules(index, () => fixedOutcomeRng("worst")))(
    state,
    option.action,
  );
  expect(result.ok, result.rejectionReason).toBe(true);
  return result.state;
}

function atJuneBoundary(prepared = false): GameState {
  let state = initStateForRpgPack(index, ORDINARY_HUNT_SEED);
  expect(state.flags[ORDINARY_HUNT_FLAG]).toBe(true);
  state.flags.june_pike_present = true;
  state = act(state, "go_north");
  if (!prepared) return state;
  for (const id of [
    "read_day_book",
    "talk_houndsman",
    "ask_wolves",
    "ask_byre",
    "ask_leave",
    "go_west",
    "take_byre_jerkin",
    "use_byre_jerkin",
    "go_east",
  ]) {
    state = act(state, id);
  }
  return state;
}

function releaseJune(state = atJuneBoundary(true)): GameState {
  state = act(state, "talk_june_pike");
  return act(state, "ask_release_june_for_hunt");
}

function retainJune(state = atJuneBoundary(true)): GameState {
  state = act(state, "talk_june_pike");
  return act(state, "ask_commit_hunt_and_hold");
}

function finishLeaderWithoutResource(state: GameState): GameState {
  state = act(state, "go_north");
  state = act(state, "maneuver_grey_leader_wait_out_feint");
  if (!state.flags.leader_down) state = act(state, "maneuver_grey_leader_take_true_rush");
  expect(state.flags.leader_down).toBe(true);
  return state;
}

function retainedSplitGuard(state: GameState): GameState {
  state = act(state, "go_north");
  state = act(state, "wedge_paling_rail");
  // Best rolls keep the rail sound; force the already-authored split fixture without
  // changing combat stats or resource costs on either June branch.
  state.flags.rail_split = true;
  state.flags.breach_braced = false;
  state = act(state, "bind_paling_rail");
  state = act(state, "maneuver_yearling_wolf_set_spear");
  state = act(state, "go_north");
  state = act(state, "maneuver_flank_wolf_offside_cut");
  if (!state.flags.flank_wolf_down) state = act(state, "maneuver_flank_wolf_turn_through_return");
  expect(state.inventory).toContain("split_rail_guard");
  return finishLeaderWithoutResource(state);
}

function ordinaryHeld(state: GameState): GameState {
  state = act(state, "go_north");
  state = act(state, "maneuver_yearling_wolf_set_spear");
  if (!state.flags.yearling_down) state = act(state, "attack_yearling_wolf");
  state = act(state, "go_north");
  state = act(state, "maneuver_flank_wolf_offside_cut");
  if (!state.flags.flank_wolf_down) state = act(state, "maneuver_flank_wolf_turn_through_return");
  return finishLeaderWithoutResource(state);
}

function reachBloodiedEvacuation(release: boolean): GameState {
  let state = initStateForRpgPack(index, ORDINARY_HUNT_SEED);
  expect(state.flags[ORDINARY_HUNT_FLAG]).toBe(true);
  state.flags.june_pike_present = true;
  for (const id of ["go_north", "talk_houndsman", "ask_wolves", "ask_leave"]) {
    state = act(state, id);
  }
  state = act(state, "talk_june_pike");
  state = act(state, release ? "ask_release_june_for_hunt" : "ask_commit_hunt_and_hold");
  state = act(state, "go_north");
  state = actWorst(state, "maneuver_yearling_wolf_set_spear");
  if (!state.flags.yearling_down) {
    state = actWorst(state, "maneuver_yearling_wolf_drive_set_spear_unarmored");
  }
  for (let guard = 0; guard < 10 && !state.flags.yearling_down; guard += 1) {
    state = actWorst(state, "attack_yearling_wolf");
  }
  state = act(state, "go_north");
  state = actWorst(state, "maneuver_flank_wolf_offside_cut");
  if (!state.flags.flank_wolf_down) {
    state = actWorst(state, "maneuver_flank_wolf_turn_through_return");
  }
  for (let guard = 0; guard < 10 && !state.flags.flank_wolf_down; guard += 1) {
    state = actWorst(state, "attack_flank_wolf");
  }
  state = act(state, "go_north");
  expect(state).toMatchObject({ current: "byre_mouth", ended: false, vars: { hp: 12 } });
  expect(actionIds(state)).toContain("use_bloodied_byre_evacuation");
  return state;
}

function moveToArea(
  session: OverworldSession,
  world: OverworldManifest,
  targetAreaId: string,
): void {
  const currentAreaId = session.view().currentArea?.id;
  if (!currentAreaId || currentAreaId === targetAreaId) return;
  const edges = world.area_edges.filter((edge) => edge.home === session.view().current.id);
  const queue = [currentAreaId];
  const previous = new Map<string, string>();
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    if (current === targetAreaId) break;
    for (const edge of edges.filter(
      (candidate) => candidate.from_area === current || candidate.to_area === current,
    )) {
      const next = edge.from_area === current ? edge.to_area : edge.from_area;
      if (next === currentAreaId || previous.has(next)) continue;
      previous.set(next, current);
      queue.push(next);
    }
  }
  const path: string[] = [];
  for (let cursor = targetAreaId; cursor !== currentAreaId; ) {
    const prior = previous.get(cursor);
    if (!prior) throw new Error(`No area route to ${targetAreaId}.`);
    path.unshift(cursor);
    cursor = prior;
  }
  for (const areaId of path) {
    const route = session.view().areaExits.find((candidate) => candidate.destination.id === areaId);
    if (!route) throw new Error(`Area route to ${areaId} is not visible.`);
    session.moveArea(route.id);
  }
}

function juneCampaign(): OverworldSession {
  const registration = WORLD.opening_registration!;
  const lead = WORLD.opening_lead_source!;
  const preparation = WORLD.opening_preparation!;
  const ally = WORLD.opening_ally!;
  const session = new OverworldSession(WORLD);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(registration.contact);
  session.chooseJourneyStory(registration.profiles[0]!.id);
  revealCurrentJourneyStoryOptions(session, WORLD.opening_relief_oath!.id);
  session.chooseJourneyStory(DEFAULT_OATH);
  session.chooseJourneyStory(lead.options[0]!.id);
  moveToArea(session, WORLD, preparation.area);
  session.chooseJourneyStory(preparation.profiles[0]!.id);
  session.chooseJourneyStory(RESIDENT_SHELTER);
  moveToArea(session, WORLD, ally.area);
  session.talkToCharacter(ally.contact);
  session.chooseJourneyStory("albany:ally_june_cattle_first");
  return session;
}

function completeCampaign(endingId: string): OverworldSession {
  const session = juneCampaign();
  session.startQuest(WOLF.id, SHELTERED);
  const campaignExport = WOLF.campaign_exports?.find(
    (candidate) => candidate.ending_id === endingId,
  );
  if (!campaignExport) throw new Error(`missing campaign export ${endingId}`);
  session.completeQuest(WOLF.id, {
    endingId,
    endingTitle: campaignExport.ending_title,
    death: false,
  });
  return session;
}

function promiseStatus(session: OverworldSession): string | undefined {
  return session.snapshot().character.promises.find((promise) => promise.promiseId === PROMISE)
    ?.status;
}

describe("June's pre-HUNT release counterfactual", () => {
  it("makes release visible, irreversible, save-safe, and explicit about forfeiting every benefit", () => {
    let boundary = atJuneBoundary();
    expect(actionIds(boundary)).not.toContain("go_north");
    boundary = act(boundary, "talk_june_pike");
    const release = enumerateRpgActions(index, boundary).find(
      (option) => option.id === "ask_release_june_for_hunt",
    );
    const retain = enumerateRpgActions(index, boundary).find(
      (option) => option.id === "ask_commit_hunt_and_hold",
    );
    expect(release?.command).toMatch(
      /CHOOSE HUNT \/ RELEASE JUNE[^]*preserve June's agreement[^]*lose all her help[^]*permanently close LURE, DRIVE, and FORTIFY/i,
    );
    expect(retain?.command).toMatch(
      /KEEP JUNE[^]*keep her cattle-first help[^]*going north chooses HUNT[^]*closes other plans[^]*first wolf death ends her agreement/i,
    );

    const preChoiceSave = save(boundary, loaded.compiled.contentHash, SAVE_MODE, {
      worldQuestId: "wolf_winter",
    });
    const restored = load(preChoiceSave, loaded.compiled.contentHash).state;
    expect(restored).toEqual(boundary);
    expect(actionIds(restored)).toEqual(actionIds(boundary));

    const beforeStats = {
      hp: restored.vars.hp,
      attack: restored.vars.attack,
      defense: restored.vars.defense,
      score: restored.vars.score,
      inventory: restored.inventory,
    };
    let released = act(restored, "ask_release_june_for_hunt");
    expect(released.flags).toMatchObject({
      june_hunt_released: true,
      june_combat_line_acknowledged: true,
    });
    expect(released.flags.june_pike_present).not.toBe(true);
    expect({
      hp: released.vars.hp,
      attack: released.vars.attack,
      defense: released.vars.defense,
      score: released.vars.score,
      inventory: released.inventory,
    }).toEqual(beforeStats);
    expect(actionIds(released)).toContain("go_north");
    expect(actionIds(released)).not.toContain("talk_june_pike");
    const preRestoreFull = buildRpgObservation(index, released);
    const preRestoreActions = actionIds(released);
    const postChoiceSave = save(released, loaded.compiled.contentHash, SAVE_MODE, {
      worldQuestId: "wolf_winter",
    });
    const postChoiceRestored = load(postChoiceSave, loaded.compiled.contentHash).state;
    expect(postChoiceRestored).toEqual(released);
    expect(postChoiceRestored.flags).toMatchObject({
      june_hunt_released: true,
      june_combat_line_acknowledged: true,
    });
    expect(postChoiceRestored.flags.june_pike_present).not.toBe(true);
    expect(actionIds(postChoiceRestored)).toEqual(preRestoreActions);
    expect(actionIds(postChoiceRestored)).toContain("go_north");
    expect(actionIds(postChoiceRestored)).not.toEqual(
      expect.arrayContaining(["ask_lure", "ask_drive", "ask_fortify"]),
    );
    expect(buildRpgObservation(index, postChoiceRestored)).toEqual(preRestoreFull);
    released = postChoiceRestored;
    const full = buildRpgObservation(index, released);
    expect(full.description).toMatch(
      /Go north alone to begin HUNT[^]*June returned to Albany[^]*no field, combat, or cattle bonus[^]*LURE, DRIVE, and FORTIFY are closed[^]*Cade's lessons, store gear, and yard preparation/i,
    );
    const api = createToolApi({ root: process.cwd() });
    const launched = api.start_world_quest({
      world_quest_id: "wolf_winter",
      seed: ORDINARY_HUNT_SEED,
    });
    api.sessions.update(launched.session_id, released);
    expect(
      api.get_observation({
        session_id: launched.session_id,
        compact_observation: false,
        hide_graph: true,
      }).observation.description,
    ).toBe(full.description);
    expect(
      api.get_observation({
        session_id: launched.session_id,
        compact_observation: true,
        hide_graph: true,
      }).context.text,
    ).toMatch(
      /Go north alone to begin HUNT[^]*June returned to Albany[^]*no field, combat, or cattle bonus[^]*LURE, DRIVE, and FORTIFY are closed[^]*Cade's lessons, store gear, and yard preparation/i,
    );
    released = act(released, "talk_houndsman");
    expect(actionIds(released)).toEqual(
      expect.arrayContaining(["ask_wolves_after_june_release", "ask_byre"]),
    );
    expect(
      buildRpgObservation(index, released).available_actions.find(
        (action) => action.id === "ask_wolves_after_june_release",
      )?.command,
    ).toBe(
      "ask: PREPARE SUPPORT — Learn the quick HUNT tactic for +2 attack and +5 score. HUNT is already chosen; other plans stay closed.",
    );
    expect(rpgActionOptionForInputId(enumerateRpgActions(index, released), "ask_wolves")?.id).toBe(
      "ask_wolves_after_june_release",
    );
    expect(actionIds(released)).not.toEqual(
      expect.arrayContaining(["ask_lure", "ask_drive", "ask_fortify"]),
    );
    expect(actionIds(released)).not.toContain("ask_commit_hunt_and_hold");
    expect(buildRpgObservation(index, released).dialogue?.npc_text).toMatch(
      /HUNT is chosen because you RELEASED JUNE[^]*LURE, DRIVE, and FORTIFY are permanently closed[^]*June will provide no help[^]*quick and guarded HUNT tactics[^]*Store-Shed gear/i,
    );
    released = act(released, "ask_leave");
    released = act(released, "go_south");
    released = act(released, "go_north");
    expect(released.flags.june_hunt_released).toBe(true);
    expect(actionIds(released)).not.toContain("talk_june_pike");
  });

  it("removes all three later June intervention surfaces and leaves HUNT stats and RNG unchanged", () => {
    const released = releaseJune();
    const retained = retainJune();
    for (const key of ["hp", "attack", "defense", "score"] as const) {
      expect(released.vars[key]).toBe(retained.vars[key]);
    }
    expect(released.inventory).toEqual(retained.inventory);
    expect(actionIds(released)).toEqual(actionIds(retained));

    const interventionFixtures = [
      {
        action: "talk_june_pike",
        flags: {
          strategy_lure_committed: true,
          lure_trail_fouled: true,
          yearling_redirected: true,
          flank_redirected: true,
        },
      },
      {
        action: "talk_june_pike",
        flags: { strategy_drive_committed: true, drive_flank_turned: true },
      },
      {
        action: "talk_june_pike",
        flags: { strategy_fortify_committed: true, fortify_threshold_sealed: true },
      },
    ] as const;
    for (const fixture of interventionFixtures) {
      const state = structuredClone(released);
      state.current = "byre_mouth";
      Object.assign(state.flags, fixture.flags);
      expect(actionIds(state)).not.toContain(fixture.action);
    }

    const releasedFirstFight = act(released, "go_north");
    const retainedFirstFight = act(retained, "go_north");
    expect(releasedFirstFight.current).toBe(retainedFirstFight.current);
    expect(releasedFirstFight.vars.hp).toBe(retainedFirstFight.vars.hp);
    expect(releasedFirstFight.vars.score).toBe(retainedFirstFight.vars.score);
    expect(releasedFirstFight.inventory).toEqual(retainedFirstFight.inventory);
    expect(actionIds(releasedFirstFight)).toEqual(actionIds(retainedFirstFight));
  });

  it("preserves every held-byre HUNT ending while selecting its three truthful release ids", () => {
    const generic = act(ordinaryHeld(releaseJune()), "go_north");
    expect(generic).toMatchObject({ ended: true, endingId: "ending_held_june_released" });
    expect(buildRpgObservation(index, generic).ending?.text).toMatch(
      /grey leader's feint[^]*true rush[^]*June had already returned to Albany after you released her from HUNT[^]*agreement remains intact[^]*no field aid/i,
    );

    const fork = retainedSplitGuard(releaseJune());
    const saved = act(structuredClone(fork), "go_north");
    expect(saved).toMatchObject({
      ended: true,
      endingId: "ending_held_timber_saved_june_released",
    });
    expect(saved.inventory).toContain("split_rail_guard");
    expect(buildRpgObservation(index, saved).ending?.text).toMatch(
      /grey leader's feint[^]*split-rail guard[^]*June had already returned/i,
    );

    const barredFork = retainedSplitGuard(releaseJune());
    const bar = enumerateRpgActions(index, barredFork).find(
      (option) =>
        option.action.type === "USE" &&
        option.action.item === "split_rail_guard" &&
        option.action.target === "inner_cattle_gate",
    );
    if (!bar) throw new Error("missing split-guard gate action");
    const barredResult = makeStep(buildRpgRules(index, bestRolls))(barredFork, bar.action);
    expect(barredResult.ok).toBe(true);
    expect(barredResult.state).toMatchObject({
      ended: true,
      endingId: "ending_held_gate_barred_june_released",
    });
    expect(buildRpgObservation(index, barredResult.state).ending?.text).toMatch(
      /grey leader's feint[^]*split-rail guard to BAR the inner cattle-gate[^]*June had already returned/i,
    );

    const retained = act(ordinaryHeld(retainJune()), "go_north");
    expect(retained.endingId).toBe("ending_held");
    expect(retained.flags.june_blood_condition_broken).toBe(true);
  });

  it("legally reaches the bloodied evacuation and separates released from retained June", () => {
    const releasedFork = reachBloodiedEvacuation(true);
    const released = act(releasedFork, "use_bloodied_byre_evacuation");
    expect(released).toMatchObject({
      ended: true,
      endingId: "ending_bloodied_byre_evacuated_june_released",
      flags: { june_hunt_released: true, bloodied_byre_evacuated: true },
    });
    expect(buildRpgObservation(index, released).ending?.text).toMatch(
      /grey leader keeps the byre[^]*two cattle are missing[^]*June had already returned to Albany after you released her from HUNT[^]*agreement remains intact[^]*no field aid/i,
    );

    const retainedFork = reachBloodiedEvacuation(false);
    const retained = act(retainedFork, "use_bloodied_byre_evacuation");
    expect(retained).toMatchObject({
      ended: true,
      endingId: "ending_bloodied_byre_evacuated",
      flags: { june_blood_condition_broken: true, bloodied_byre_evacuated: true },
    });

    const retainedCampaign = completeCampaign("ending_bloodied_byre_evacuated");
    expect(promiseStatus(retainedCampaign)).toBe("broken");
    expect(retainedCampaign.snapshot().character.companions).not.toContain(JUNE);
    expect(
      retainedCampaign
        .snapshot()
        .character.relationships.find((relationship) => relationship.npcId === JUNE)?.memories,
    ).toContain(BROKEN_MEMORY);
  });

  it.each(RELEASED_ENDINGS)(
    "folds $endingId into an amicable release, matching testimony, no companion, and no service",
    ({ endingId, expectedFacts }) => {
      const session = completeCampaign(endingId);
      const snapshot = session.snapshot();
      const june = snapshot.character.relationships.find(
        (relationship) => relationship.npcId === JUNE,
      );
      expect(promiseStatus(session)).toBe("released");
      expect(snapshot.character.companions).not.toContain(JUNE);
      expect(june?.memories).toContain(RELEASE_MEMORY);
      expect(june?.memories).not.toContain(BROKEN_MEMORY);
      const worldFacts = (
        session as unknown as { campaignWorldFactIds(): readonly string[] }
      ).campaignWorldFactIds();
      expect(worldFacts).toEqual(expect.arrayContaining([...expectedFacts]));
      expect(session.view().serviceOffers.map((offer) => offer.id)).not.toContain(
        "albany:june_kept_line_station_resupply",
      );
      expect(
        session.view().serviceOffers.some((offer) => offer.id.startsWith("albany:june_")),
      ).toBe(false);
      expect(
        session
          .view()
          .characters.find((character) => character.id === "albany_city__transport_hub__june_pike")
          ?.summary,
      ).toMatch(/released her before HUNT[^]*completed the fight without her help/i);
      expect(OverworldSession.restore(WORLD, snapshot).snapshot()).toEqual(snapshot);
    },
  );

  it("keeps the retained-HUNT first-death breakage distinct from amicable release", () => {
    const retained = completeCampaign("ending_held");
    expect(promiseStatus(retained)).toBe("broken");
    expect(retained.snapshot().character.companions).not.toContain(JUNE);
    expect(
      retained
        .snapshot()
        .character.relationships.find((relationship) => relationship.npcId === JUNE)?.memories,
    ).toContain(BROKEN_MEMORY);
    expect(retained.view().serviceOffers).toEqual([]);
    expect(
      retained
        .view()
        .characters.find((character) => character.id === "albany_city__transport_hub__june_pike")
        ?.summary,
    ).toMatch(/first wolf died[^]*ending the cattle-safety agreement/i);
  });
});
