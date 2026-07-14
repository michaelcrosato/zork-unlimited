/**
 * Regression for bug_0505: preserving the split guard or brace-stake once changed HP
 * and prose, but the quest ignored the surviving material at the terminal boundary.
 * Saved wood now creates a final, equal-score choice: bar the herd's inner gate now or
 * carry the cross-piece into dawn for repairing the broken paling.
 */
import { describe, expect, it } from "vitest";
import { makeStep } from "../../src/core/engine.js";
import { hashState } from "../../src/core/hash.js";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";
import { overworldQuestCompletionFromRpgSession } from "../../src/mcp/overworld_quest_bridge.js";
import { createToolApi } from "../../src/mcp/tools.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { assertRpgStateReferences } from "../../src/rpg/state_integrity.js";
import { createInitialCampaignCharacterState } from "../../src/world/campaign_character_state.js";
import { JOURNEY_CONTRACT_VERSION } from "../../src/world/journey_contract.js";
import { OverworldSession } from "../../src/world/session.js";
import { OVERWORLD_SESSION_LEGACY_SAVE_VERSION } from "../../src/world/session_snapshot.js";
import {
  OVERWORLD_CAMPAIGN_EXPORTS_WORLD_HASH,
  OVERWORLD_CAMPAIGN_IMPORTS_WORLD_HASH,
  OVERWORLD_CAMPAIGN_IMPORTS_MIGRATION_TARGET_WORLD_HASH,
  OVERWORLD_OPENING_REGISTRATION_MIGRATION_TARGET_WORLD_HASH,
  OVERWORLD_PRE_CAMPAIGN_EXPORTS_WORLD_HASH,
} from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const WORLD = loadOverworldManifest(process.cwd());

const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("wolf_winter must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);

function rolls(...values: number[]): Rng {
  let cursor = 0;
  return {
    next: () => 0.5,
    int: (min, max) => {
      const value = values[cursor++] ?? max;
      expect(value).toBeGreaterThanOrEqual(min);
      expect(value).toBeLessThanOrEqual(max);
      return value;
    },
  };
}

function options(state: GameState) {
  return enumerateRpgActions(index, state);
}

function act(state: GameState, id: string, ...fixedRolls: number[]): GameState {
  const available = options(state);
  const chosen = available.find((option) => option.id === id);
  expect(
    chosen,
    `expected ${id} in ${state.current}; available: ${available.map((option) => option.id).join(", ")}`,
  ).toBeDefined();
  if (!chosen) throw new Error(`missing ${id}`);
  const result = makeStep(buildRpgRules(index, () => rolls(...fixedRolls)))(state, chosen.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  return result.state;
}

function fullyPrepared(): GameState {
  let state = initStateForRpgPack(index, 505);
  for (const id of [
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
  ]) {
    state = act(state, id);
  }
  return state;
}

function finishLeaderWithoutResource(state: GameState): GameState {
  state = act(state, "go_north");
  state = act(state, "maneuver_grey_leader_wait_out_feint", 6, 1);
  if (!state.flags.leader_down) {
    state = act(state, "maneuver_grey_leader_take_true_rush", 6);
  }
  expect(state.flags.leader_down).toBe(true);
  expect(state.current).toBe("byre_mouth");
  return state;
}

/** Reach old grey's corpse with the failed rail still bound across the spear. */
function retainSplitGuard(): GameState {
  let state = act(fullyPrepared(), "go_north");
  state = act(state, "use_paling_rail", 1);
  state = act(state, "use_paling_rail");
  state = act(state, "maneuver_yearling_wolf_set_spear", 6);
  state = act(state, "go_north");
  state = act(state, "maneuver_flank_wolf_offside_cut", 6);
  if (!state.flags.flank_wolf_down) {
    state = act(state, "maneuver_flank_wolf_turn_through_return", 6);
  }
  expect(state.inventory).toContain("split_rail_guard");
  return finishLeaderWithoutResource(state);
}

/** Reach old grey's corpse with the funnel's brace-stake still sound and unspent. */
function retainBraceStake(): GameState {
  let state = act(fullyPrepared(), "go_north");
  state = act(state, "use_paling_rail", 20);
  state = act(state, "maneuver_yearling_wolf_set_spear", 6);
  state = act(state, "go_north");
  state = act(state, "maneuver_flank_wolf_funnel_thrust", 3, 6);
  state = act(state, "maneuver_flank_wolf_wrench_brace_stake", 1);
  if (!state.flags.flank_wolf_down) state = act(state, "attack_flank_wolf", 6);
  expect(state.inventory).toContain("saved_brace_stake");
  return finishLeaderWithoutResource(state);
}

type ResourceCase = {
  item: "split_rail_guard" | "saved_brace_stake";
  barredFlag: "cattle_gate_barred_with_split_guard" | "cattle_gate_barred_with_brace_stake";
  reach: () => GameState;
};

const RESOURCE_CASES: readonly ResourceCase[] = [
  {
    item: "split_rail_guard",
    barredFlag: "cattle_gate_barred_with_split_guard",
    reach: retainSplitGuard,
  },
  {
    item: "saved_brace_stake",
    barredFlag: "cattle_gate_barred_with_brace_stake",
    reach: retainBraceStake,
  },
];

function ordinaryHeldFork(): GameState {
  let state = act(fullyPrepared(), "go_north");
  state = act(state, "maneuver_yearling_wolf_set_spear", 6);
  if (!state.flags.yearling_down) state = act(state, "attack_yearling_wolf", 6);
  state = act(state, "go_north");
  state = act(state, "maneuver_flank_wolf_offside_cut", 6);
  if (!state.flags.flank_wolf_down) {
    state = act(state, "maneuver_flank_wolf_turn_through_return", 6);
  }
  expect(state.inventory).not.toContain("split_rail_guard");
  expect(state.inventory).not.toContain("saved_brace_stake");
  return finishLeaderWithoutResource(state);
}

type ToolApi = ReturnType<typeof createToolApi>;

function launchAlbanyWolf(api: ToolApi): {
  overworldSessionId: string;
  rpgSessionId: string;
} {
  const full = { compact_context: false, compact_result: false } as const;
  const started = api.start_overworld({ compact_context: false });
  const overworldSessionId = started.session_id;
  let view = started.observation;

  api.scout_overworld_session_poi({
    ...full,
    session_id: overworldSessionId,
    poi_id: view.pois[0]!.id,
  });
  api.talk_overworld_session_contact({
    ...full,
    session_id: overworldSessionId,
    character_id: view.characters[0]!.id,
  });
  api.choose_overworld_session_story({
    ...full,
    session_id: overworldSessionId,
    choice: "albany:ledger_advocate",
  });
  api.choose_overworld_session_story({
    ...full,
    session_id: overworldSessionId,
    choice: "albany:source_rowan_civic_docket",
  });
  view = api.get_overworld_session({
    session_id: overworldSessionId,
    include_observation: true,
  }).observation;
  const marketRoute = view.areaExits.find(
    (route) => route.destination.id === "albany_city__market",
  );
  if (!marketRoute) throw new Error("expected Albany market route");
  api.move_overworld_session_area({
    ...full,
    session_id: overworldSessionId,
    area_route_id: marketRoute.id,
  });
  view = api.get_overworld_session({
    session_id: overworldSessionId,
    include_observation: true,
  }).observation;
  const revealed = api.scout_overworld_session_poi({
    ...full,
    session_id: overworldSessionId,
    poi_id: view.pois[0]!.id,
  });
  const quest = revealed.observation.quests.find((candidate) => candidate.id === "wolf_winter");
  if (!quest) throw new Error("expected Wolf-Winter lead");
  const questRoute = revealed.observation.areaExits.find(
    (route) => route.destination.id === quest.area,
  );
  if (!questRoute) throw new Error("expected route to Wolf-Winter area");
  api.move_overworld_session_area({
    ...full,
    session_id: overworldSessionId,
    area_route_id: questRoute.id,
  });
  const launched = api.start_overworld_session_quest({
    ...full,
    compact_observation: false,
    session_id: overworldSessionId,
    quest_id: quest.id,
    seed: 505,
  });
  return { overworldSessionId, rpgSessionId: launched.rpg_session_id };
}

function foldAlbanyWolf(args: { state: GameState; finalActionId: string }): {
  api: ToolApi;
  overworldSessionId: string;
  final: ReturnType<ToolApi["step_action"]>;
} {
  const api = createToolApi({ root: process.cwd() });
  const launched = launchAlbanyWolf(api);
  api.sessions.update(launched.rpgSessionId, args.state);
  const final = api.step_action({
    session_id: launched.rpgSessionId,
    action_id: args.finalActionId,
    compact_observation: false,
    compact_events: false,
  });
  expect(final.ok).toBe(true);
  return { api, overworldSessionId: launched.overworldSessionId, final };
}

function barActionId(state: GameState, item: ResourceCase["item"]): string {
  const action = options(state).find(
    (option) =>
      option.action.type === "USE" &&
      option.action.item === item &&
      option.action.target === "inner_cattle_gate",
  );
  expect(action?.command).toMatch(/^bar .*inner cattle-gate.* with /i);
  if (!action) throw new Error(`missing ${item} gate-bar action`);
  return action.id;
}

describe("bug_0505 — Wolf-Winter saved wood has a post-hunt consequence", () => {
  it("offers retain-versus-bar only after old grey falls with sound wood in hand", () => {
    const gate = pack.objects.find((object) => object.id === "inner_cattle_gate");
    expect(gate?.visible_when).toEqual([{ has_flag: "leader_down" }]);

    for (const route of RESOURCE_CASES) {
      const state = route.reach();
      const observation = buildRpgObservation(index, state);
      expect(observation.visible_objects).toContainEqual({
        id: "inner_cattle_gate",
        name: "inner cattle-gate",
      });
      expect(options(state).map((option) => option.id)).toContain("go_north");
      expect(barActionId(state, route.item)).toBeTruthy();
      expect(observation.description).toMatch(/bar their inner gate[^]*carry it into dawn/i);
    }
  });

  it("makes both resource choices terminal, equal-score, and mechanically distinct", () => {
    for (const route of RESOURCE_CASES) {
      const fork = route.reach();

      const retained = act(structuredClone(fork), "go_north");
      expect(retained).toMatchObject({ ended: true, endingId: "ending_held_timber_saved" });
      expect(retained.inventory).toContain(route.item);
      expect(retained.flags[route.barredFlag]).not.toBe(true);
      expect(retained.vars.score).toBe(60);
      expect(buildRpgObservation(index, retained).ending?.title).toBe(
        "The Byre Held, Paling Timber Saved",
      );

      const barred = act(structuredClone(fork), barActionId(fork, route.item));
      expect(barred).toMatchObject({ ended: true, endingId: "ending_held_gate_barred" });
      expect(barred.inventory).not.toContain(route.item);
      expect(barred.flags[route.barredFlag]).toBe(true);
      expect(barred.vars.score).toBe(60);
      expect(buildRpgObservation(index, barred).ending?.title).toBe(
        "The Byre Held, Inner Gate Barred",
      );

      expect(retained.vars.hp).toBe(barred.vars.hp);
      expect(() => assertRpgStateReferences(index, retained)).not.toThrow();
      expect(() => assertRpgStateReferences(index, barred)).not.toThrow();
      expect(enumerateRpgActions(index, retained)).toEqual([]);
      expect(enumerateRpgActions(index, barred)).toEqual([]);
    }
  });

  it("keeps ordinary spent-resource victories on the established generic ending", () => {
    const generic = pack.win_conditions.at(-1);
    expect(generic).toMatchObject({ id: "hold_the_byre", ending: "ending_held" });
    expect(generic?.conditions).toEqual([{ visited: "cattle_stand" }]);

    const special = pack.win_conditions.slice(0, -1).map((condition) => condition.ending);
    expect(special).toEqual([
      "ending_held_gate_barred",
      "ending_held_gate_barred",
      "ending_held_timber_saved",
      "ending_held_timber_saved",
    ]);
  });

  it("exports both consequence identities through the RPG-to-overworld bridge", () => {
    const fork = retainSplitGuard();
    const outcomes = [
      {
        state: act(structuredClone(fork), "go_north"),
        id: "ending_held_timber_saved",
        title: "The Byre Held, Paling Timber Saved",
      },
      {
        state: act(structuredClone(fork), barActionId(fork, "split_rail_guard")),
        id: "ending_held_gate_barred",
        title: "The Byre Held, Inner Gate Barred",
      },
    ] as const;

    for (const expected of outcomes) {
      const api = createToolApi({ root: process.cwd() });
      const started = launchAlbanyWolf(api);
      api.sessions.update(started.rpgSessionId, expected.state);
      const completion = overworldQuestCompletionFromRpgSession(
        api.sessions.get(started.rpgSessionId),
        started.overworldSessionId,
      );
      expect(completion).toEqual({
        questId: "wolf_winter",
        outcome: { endingId: expected.id, endingTitle: expected.title, death: false },
      });
    }
  });

  it("folds a winning decision at checkpoint 40 into one combined goal/checkpoint choice", () => {
    const api = createToolApi({ root: process.cwd() });
    const full = { compact_context: false, compact_result: false } as const;
    const started = api.start_overworld({ compact_context: false });
    const sessionId = started.session_id;

    let view = started.observation;
    api.scout_overworld_session_poi({
      ...full,
      session_id: sessionId,
      poi_id: view.pois[0]!.id,
    });
    api.talk_overworld_session_contact({
      ...full,
      session_id: sessionId,
      character_id: view.characters[0]!.id,
    });
    api.choose_overworld_session_story({
      ...full,
      session_id: sessionId,
      choice: "albany:ledger_advocate",
    });
    api.choose_overworld_session_story({
      ...full,
      session_id: sessionId,
      choice: "albany:source_rowan_civic_docket",
    });
    view = api.get_overworld_session({
      session_id: sessionId,
      include_observation: true,
    }).observation;
    const marketRoute = view.areaExits.find(
      (route) => route.destination.id === "albany_city__market",
    );
    if (!marketRoute) throw new Error("expected Albany market route");
    api.move_overworld_session_area({
      ...full,
      session_id: sessionId,
      area_route_id: marketRoute.id,
    });
    view = api.get_overworld_session({
      session_id: sessionId,
      include_observation: true,
    }).observation;
    const revealed = api.scout_overworld_session_poi({
      ...full,
      session_id: sessionId,
      poi_id: view.pois[0]!.id,
    });
    const quest = revealed.observation.quests.find((candidate) => candidate.id === "wolf_winter");
    if (!quest) throw new Error("expected Wolf-Winter lead");
    const questRoute = revealed.observation.areaExits.find(
      (route) => route.destination.id === quest.area,
    );
    if (!questRoute) throw new Error("expected route to Wolf-Winter area");
    api.move_overworld_session_area({
      ...full,
      session_id: sessionId,
      area_route_id: questRoute.id,
    });

    let journey = api.get_overworld_session_context({ session_id: sessionId }).journey;
    if ((38 - journey.acceptedDecisions) % 2 !== 0) {
      const contact = api.get_overworld_session({
        session_id: sessionId,
        include_observation: true,
      }).observation.characters[0];
      if (!contact) throw new Error("expected a quest-area contact");
      journey = api.talk_overworld_session_contact({
        ...full,
        session_id: sessionId,
        character_id: contact.id,
      }).journey;
    }
    while (journey.acceptedDecisions < 38) {
      const atQuest = api.get_overworld_session({
        session_id: sessionId,
        include_observation: true,
      }).observation;
      const away = atQuest.areaExits[0];
      if (!away) throw new Error("expected a reversible quest-area route");
      api.move_overworld_session_area({
        ...full,
        session_id: sessionId,
        area_route_id: away.id,
      });
      const neighbor = api.get_overworld_session({
        session_id: sessionId,
        include_observation: true,
      }).observation;
      const back = neighbor.areaExits.find((route) => route.destination.id === quest.area);
      if (!back) throw new Error("expected a route back to the quest area");
      journey = api.move_overworld_session_area({
        ...full,
        session_id: sessionId,
        area_route_id: back.id,
      }).journey;
    }
    expect(journey.acceptedDecisions).toBe(38);

    const launched = api.start_overworld_session_quest({
      ...full,
      compact_observation: false,
      session_id: sessionId,
      quest_id: quest.id,
      seed: 505,
    });
    expect(launched.journey.acceptedDecisions).toBe(39);
    api.sessions.update(launched.rpg_session_id, retainSplitGuard());

    const final = api.step_action({
      session_id: launched.rpg_session_id,
      action_id: "go_north",
      compact_observation: false,
      compact_events: false,
    });
    expect(final.ok).toBe(true);
    expect(final.observation.ended).toBe(true);
    expect(final.questCompletion).toMatchObject({
      alreadyKnown: false,
      quest: { id: "wolf_winter" },
      endingId: "ending_held_timber_saved",
      journeyDecision: {
        countsTowardJourney: false,
        reason: "technical_quest_foldback",
      },
    });
    expect(final.journey).toMatchObject({
      status: "awaiting_choice",
      acceptedDecisions: 40,
      goal: { status: "completed", completedAtDecision: 40 },
      pendingChoice: {
        atDecision: 40,
        reasons: ["checkpoint", "goal_completed"],
        checkpoint: 40,
      },
    });
    expect(
      api.get_overworld_session({ session_id: sessionId, include_observation: true }).observation
        .completedQuestIds,
    ).toContain("wolf_winter");
  });

  it("renders a truthful Albany return and the same authored teaser for every non-death ending", () => {
    const split = retainSplitGuard();
    const cases = [
      {
        endingId: "ending_held_gate_barred",
        state: split,
        finalActionId: barActionId(split, "split_rail_guard"),
        returnText: "behind the inner gate you barred",
        memoryId: "memory:wolf_winter_inner_gate_barred",
        worldFactIds: [
          "fact:wolf_winter_byre_held",
          "fact:wolf_winter_guard_wood_committed",
          "fact:wolf_winter_inner_gate_barred_at_dawn",
          "fact:wolf_winter_outer_paling_broken",
        ],
      },
      {
        endingId: "ending_held_timber_saved",
        state: retainSplitGuard(),
        finalActionId: "go_north",
        returnText: "sound timber you carried out",
        memoryId: "memory:wolf_winter_repair_timber_saved",
        worldFactIds: [
          "fact:wolf_winter_byre_held",
          "fact:wolf_winter_outer_paling_broken",
          "fact:wolf_winter_repair_timber_available",
        ],
      },
      {
        endingId: "ending_held",
        state: ordinaryHeldFork(),
        finalActionId: "go_north",
        returnText: "guard wood was spent in the fighting",
        memoryId: "memory:wolf_winter_guard_wood_spent",
        worldFactIds: [
          "fact:wolf_winter_byre_held",
          "fact:wolf_winter_outer_paling_broken",
          "fact:wolf_winter_repair_timber_spent",
        ],
      },
    ] as const;

    for (const expected of cases) {
      const { api, overworldSessionId, final } = foldAlbanyWolf(expected);
      expect(final.questCompletion).toMatchObject({ endingId: expected.endingId });
      expect(final.journey.pendingChoice?.message).toContain(expected.returnText);
      expect(final.journey.pendingChoice?.message).toContain("one dawn relief wagon");
      expect(final.journey.pendingChoice?.message).toContain("Hedrick Cradoc's father");
      expect(final.journey.storyChoice).toBeNull();
      const snapshot = api.export_overworld_session({ session_id: overworldSessionId }).snapshot;
      expect(snapshot.questOutcomes).toContainEqual(["wolf_winter", expected.endingId]);
      expect(snapshot.character.relationships).toHaveLength(3);
      expect(snapshot.character.relationships).toContainEqual({
        npcId: "npc:old_cade",
        trust: 10,
        regard: 10,
        owesPlayer: 1,
        playerOwes: 0,
        memories: [expected.memoryId],
      });

      const restored = OverworldSession.restore(WORLD, snapshot);
      expect(restored.snapshot()).toEqual(snapshot);
      expect(restored.campaignWorldFactIds()).toEqual(expected.worldFactIds);
      const detachedFacts = restored.campaignWorldFactIds();
      detachedFacts.push("fact:test_outside_mutation");
      expect(restored.campaignWorldFactIds()).toEqual(expected.worldFactIds);
    }
  });

  it("makes a repeated ending an exact no-op and rejects outcome replacement", () => {
    const completed = foldAlbanyWolf({ state: ordinaryHeldFork(), finalActionId: "go_north" });
    const snapshot = completed.api.export_overworld_session({
      session_id: completed.overworldSessionId,
    }).snapshot;
    const restored = OverworldSession.restore(WORLD, snapshot);
    const before = restored.snapshot();
    const beforeHash = restored.snapshotHash();

    const repeated = restored.completeQuest("wolf_winter", {
      endingId: "ending_held",
      endingTitle: "The Byre Held",
      death: false,
    });

    expect(repeated.alreadyKnown).toBe(true);
    expect(repeated.renownGained).toBe(0);
    expect(restored.snapshot()).toEqual(before);
    expect(restored.snapshotHash()).toBe(beforeHash);
    expect(() =>
      restored.completeQuest("wolf_winter", {
        endingId: "ending_held_timber_saved",
        endingTitle: "The Byre Held, Paling Timber Saved",
        death: false,
      }),
    ).toThrow(/cannot replace it/);
    expect(restored.snapshot()).toEqual(before);
  });

  it("binds current saves to replayed consequences and the canonical ending journal", () => {
    const gateFork = retainSplitGuard();
    const gate = foldAlbanyWolf({
      state: gateFork,
      finalActionId: barActionId(gateFork, "split_rail_guard"),
    });
    const gateSnapshot = gate.api.export_overworld_session({
      session_id: gate.overworldSessionId,
    }).snapshot;
    const timber = foldAlbanyWolf({
      state: retainSplitGuard(),
      finalActionId: "go_north",
    });
    const timberSnapshot = timber.api.export_overworld_session({
      session_id: timber.overworldSessionId,
    }).snapshot;

    const forgedCharacter = structuredClone(gateSnapshot);
    forgedCharacter.character.relationships[0]!.trust = 11;
    expect(() => OverworldSession.restore(WORLD, forgedCharacter)).toThrow(
      /campaign character does not match replayed quest consequences/,
    );

    const swappedOutcome = structuredClone(gateSnapshot);
    swappedOutcome.questOutcomes = structuredClone(timberSnapshot.questOutcomes);
    swappedOutcome.character = structuredClone(timberSnapshot.character);
    expect(() => OverworldSession.restore(WORLD, swappedOutcome)).toThrow(
      /not bound to its canonical completion journal/,
    );
  });

  it("fences all trusted predecessor save eras to the exact registration target", () => {
    expect(hashState(WORLD)).toBe(OVERWORLD_CAMPAIGN_IMPORTS_MIGRATION_TARGET_WORLD_HASH);
    expect(OVERWORLD_CAMPAIGN_IMPORTS_MIGRATION_TARGET_WORLD_HASH).toBe(
      OVERWORLD_OPENING_REGISTRATION_MIGRATION_TARGET_WORLD_HASH,
    );

    const completed = foldAlbanyWolf({ state: ordinaryHeldFork(), finalActionId: "go_north" });
    const current = completed.api.export_overworld_session({
      session_id: completed.overworldSessionId,
    }).snapshot;
    expect(current.worldHash).toBe(OVERWORLD_CAMPAIGN_IMPORTS_MIGRATION_TARGET_WORLD_HASH);
    expect("campaignWorldFactIds" in current).toBe(false);
    expect(() =>
      OverworldSession.restore(WORLD, {
        ...current,
        campaignWorldFactIds: ["fact:forged_saved_truth"],
      }),
    ).toThrow();

    const prooflessCurrent = structuredClone(current);
    prooflessCurrent.journalEntries = prooflessCurrent.journalEntries.filter(
      (entry) =>
        entry.kind !== "registration_offer" &&
        entry.kind !== "registration" &&
        entry.kind !== "lead_source_offer" &&
        entry.kind !== "lead_source",
    );
    delete prooflessCurrent.openingLeadSourceDecisionTrail;
    const legacyConsequenceCharacter = createInitialCampaignCharacterState();
    legacyConsequenceCharacter.relationships.push({
      npcId: "npc:old_cade",
      trust: 10,
      regard: 10,
      owesPlayer: 1,
      playerOwes: 0,
      memories: ["memory:wolf_winter_guard_wood_spent"],
    });

    for (const predecessorHash of [
      OVERWORLD_PRE_CAMPAIGN_EXPORTS_WORLD_HASH,
      OVERWORLD_CAMPAIGN_EXPORTS_WORLD_HASH,
      OVERWORLD_CAMPAIGN_IMPORTS_WORLD_HASH,
    ]) {
      const opaqueProgress = structuredClone(prooflessCurrent);
      opaqueProgress.worldHash = predecessorHash;
      opaqueProgress.character =
        predecessorHash === OVERWORLD_PRE_CAMPAIGN_EXPORTS_WORLD_HASH
          ? createInitialCampaignCharacterState()
          : structuredClone(legacyConsequenceCharacter);
      expect(() => OverworldSession.restore(WORLD, opaqueProgress)).toThrow(
        /opaque pre-registration quest progress without a replayable registration and lead-source path/i,
      );

      const { character: _character, ...legacyWithoutCharacter } = opaqueProgress;
      const legacyV8 = {
        ...legacyWithoutCharacter,
        version: OVERWORLD_SESSION_LEGACY_SAVE_VERSION,
      };
      expect(() => OverworldSession.restore(WORLD, legacyV8)).toThrow(
        predecessorHash === OVERWORLD_PRE_CAMPAIGN_EXPORTS_WORLD_HASH
          ? /opaque pre-registration quest progress without a replayable registration and lead-source path/i
          : /campaign character does not match replayed quest consequences/i,
      );
    }
    const legacyV9 = structuredClone(prooflessCurrent);
    legacyV9.worldHash = OVERWORLD_PRE_CAMPAIGN_EXPORTS_WORLD_HASH;
    legacyV9.character = createInitialCampaignCharacterState();

    const oldAtRowan = new OverworldSession(WORLD);
    const oldAtRowanOpening = oldAtRowan.view();
    oldAtRowan.scoutPoi(oldAtRowanOpening.pois[0]!.id);
    oldAtRowan.talkToCharacter("albany_city__civic_core__contact");
    const prooflessAtRowan = structuredClone(oldAtRowan.snapshot());
    prooflessAtRowan.worldHash = OVERWORLD_CAMPAIGN_IMPORTS_WORLD_HASH;
    prooflessAtRowan.journalEntries = prooflessAtRowan.journalEntries.filter(
      (entry) => entry.kind !== "registration_offer",
    );
    const restoredProoflessAtRowan = OverworldSession.restore(WORLD, prooflessAtRowan);
    expect(
      restoredProoflessAtRowan
        .snapshot()
        .journalEntries.some((entry) => entry.kind === "registration_legacy"),
    ).toBe(false);
    expect(restoredProoflessAtRowan.journey().storyChoice).toBeNull();
    expect(restoredProoflessAtRowan.campaignCharacterState()).toEqual(
      createInitialCampaignCharacterState(),
    );
    expect(
      OverworldSession.restore(WORLD, restoredProoflessAtRowan.snapshot()).journey().storyChoice,
    ).toBeNull();
    const oldEvent = oldAtRowanOpening.events[0];
    if (!oldEvent) throw new Error("expected Albany's opening event");
    restoredProoflessAtRowan.investigateEvent(oldEvent.id);
    const reopened = restoredProoflessAtRowan.talkToCharacter("albany_city__civic_core__contact");
    expect(reopened.alreadyKnown).toBe(true);
    expect(restoredProoflessAtRowan.journey().storyChoice?.kind).toBe("registration");
    restoredProoflessAtRowan.chooseJourneyStory("albany:ledger_advocate");
    const restoredDelayedRegistration = OverworldSession.restore(
      WORLD,
      restoredProoflessAtRowan.snapshot(),
    );
    expect(restoredDelayedRegistration.campaignCharacterState().background).toBe(
      "albany:ledger_advocate",
    );

    const registered = new OverworldSession(WORLD);
    const registeredOpening = registered.view();
    registered.scoutPoi(registeredOpening.pois[0]!.id);
    registered.talkToCharacter("albany_city__civic_core__contact");
    registered.chooseJourneyStory("albany:road_warden");
    for (const predecessorHash of [
      OVERWORLD_PRE_CAMPAIGN_EXPORTS_WORLD_HASH,
      OVERWORLD_CAMPAIGN_EXPORTS_WORLD_HASH,
      OVERWORLD_CAMPAIGN_IMPORTS_WORLD_HASH,
    ]) {
      const forgedPredecessor = structuredClone(registered.snapshot());
      forgedPredecessor.worldHash = predecessorHash;
      expect(() => OverworldSession.restore(WORLD, forgedPredecessor)).toThrow(
        /opening registration evidence from a later manifest/i,
      );
    }

    const arbitraryOldHash = structuredClone(prooflessCurrent);
    arbitraryOldHash.worldHash = "0".repeat(64);
    expect(() => OverworldSession.restore(WORLD, arbitraryOldHash)).toThrow(
      /different world manifest/,
    );

    const futureWorld = structuredClone(WORLD);
    futureWorld.design_rules.push("A future manifest revision outside the one-time migration.");
    expect(hashState(futureWorld)).not.toBe(OVERWORLD_CAMPAIGN_IMPORTS_MIGRATION_TARGET_WORLD_HASH);
    expect(() => OverworldSession.restore(futureWorld, legacyV9)).toThrow(
      /different world manifest/,
    );

    const forgedLegacyCharacter = structuredClone(legacyV9);
    forgedLegacyCharacter.character.money = 1;
    expect(() => OverworldSession.restore(WORLD, forgedLegacyCharacter)).toThrow(
      /legacy overworld session snapshot has campaign character state without replayable consequence proof/i,
    );
  });

  it("ending at the goal choice records bound retention evidence without activating aftermath", () => {
    const completed = foldAlbanyWolf({ state: ordinaryHeldFork(), finalActionId: "go_north" });
    const ended = completed.api.choose_overworld_session_journey({
      session_id: completed.overworldSessionId,
      choice: "end",
      compact_context: false,
      compact_result: false,
    });

    expect(ended.journey).toMatchObject({ status: "ended", storyChoice: null });
    expect(ended.result.exitReceipt).toMatchObject({
      contractVersion: JOURNEY_CONTRACT_VERSION,
      goalVersion: 1,
      goalId: "albany_local_lead",
      goalStatus: "completed",
      completedGoals: [
        {
          version: 1,
          id: "albany_local_lead",
          status: "completed",
        },
      ],
      retentionHistory: [
        {
          choice: "end",
          reasons: ["goal_completed"],
          goalVersion: 1,
          goalId: "albany_local_lead",
        },
      ],
    });
    const snapshot = completed.api.export_overworld_session({
      session_id: completed.overworldSessionId,
    }).snapshot;
    expect(snapshot.journalEntries.some((entry) => entry.kind === "campaign")).toBe(false);
    expect(snapshot.journey.goal.version).toBe(1);
  });

  it("continues into one blocking, counted, persistent dispatch choice on both branches", () => {
    const choices = [
      {
        id: "send_wagon_to_cade",
        goalId: "carry_hedricks_packet_north",
        goalText: "Carry Hayden's packet",
        consequence: "replaces the broken outer paling",
      },
      {
        id: "send_wardens_north",
        goalId: "travel_north_with_albany_wardens",
        goalText: "Travel with Hayden's wardens",
        consequence: "outer paling waits",
      },
    ] as const;

    for (const expected of choices) {
      const fork = retainSplitGuard();
      const completed = foldAlbanyWolf({
        state: fork,
        finalActionId: barActionId(fork, "split_rail_guard"),
      });
      const beforeDecision = completed.final.journey.acceptedDecisions;
      const continued = completed.api.choose_overworld_session_journey({
        session_id: completed.overworldSessionId,
        choice: "continue",
        compact_context: false,
        compact_result: false,
      });
      expect(continued.journey.goal).toMatchObject({ version: 1, status: "completed" });
      expect(continued.journey.storyChoice).toMatchObject({
        id: "albany_dawn_dispatch",
        options: [{ id: "send_wagon_to_cade" }, { id: "send_wardens_north" }],
      });
      expect(() =>
        completed.api.rest_overworld_session({ session_id: completed.overworldSessionId }),
      ).toThrow(/presented story consequence/i);

      const selected = completed.api.choose_overworld_session_story({
        session_id: completed.overworldSessionId,
        choice: expected.id,
        compact_context: false,
        compact_result: false,
      });
      expect(selected.result).toMatchObject({
        storyChoiceId: "albany_dawn_dispatch",
        choiceId: expected.id,
        consequence: expect.stringContaining(expected.consequence),
        journeyDecision: { countsTowardJourney: true, reason: "situation_changed" },
      });
      expect(selected.journey).toMatchObject({
        status: "active",
        acceptedDecisions: beforeDecision + 1,
        goal: {
          version: 2,
          id: expected.goalId,
          text: expect.stringContaining(expected.goalText),
          status: "active",
        },
        storyChoice: null,
      });

      const exported = completed.api.export_overworld_session({
        session_id: completed.overworldSessionId,
      }).snapshot;
      expect(exported.journalEntries[0]).toMatchObject({
        id: `campaign_goal:2:${expected.goalId}`,
        kind: "campaign",
        text: expect.stringContaining(expected.consequence),
      });
      const restored = completed.api.restore_overworld_session({
        snapshot: exported,
        compact_context: false,
      });
      expect(restored.journey).toEqual(selected.journey);

      const missingJournal = {
        ...exported,
        journalEntries: exported.journalEntries.filter((entry) => entry.kind !== "campaign"),
      };
      expect(() => completed.api.restore_overworld_session({ snapshot: missingJournal })).toThrow(
        /campaign journal entries for 1 activated journey goals/,
      );

      const forgedJournal = {
        ...exported,
        journalEntries: exported.journalEntries.map((entry) =>
          entry.kind === "campaign" ? { ...entry, text: "A forged consequence." } : entry,
        ),
      };
      expect(() => completed.api.restore_overworld_session({ snapshot: forgedJournal })).toThrow(
        /campaign journal entry .* is forged/,
      );
    }
  });

  it("rejects a restored Albany aftermath whose persisted Wolf ending cannot support its prose", () => {
    const completed = foldAlbanyWolf({ state: ordinaryHeldFork(), finalActionId: "go_north" });
    const snapshot = completed.api.export_overworld_session({
      session_id: completed.overworldSessionId,
    }).snapshot;
    const forged = {
      ...snapshot,
      questOutcomes: [["wolf_winter", "ending_pulled_down"]] as [string, string][],
    };

    expect(() => completed.api.restore_overworld_session({ snapshot: forged })).toThrow(
      /no declared campaign export for ending "ending_pulled_down"/,
    );
  });
});
