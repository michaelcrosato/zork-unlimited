import { describe, expect, it } from "vitest";

import type { RpgAction } from "../../src/api/types.js";
import { makeStep, type Rules } from "../../src/core/engine.js";
import type { GameEvent } from "../../src/core/events.js";
import type { GameState } from "../../src/core/state.js";
import { createToolApi } from "../../src/mcp/tools.js";
import { activeDialogue } from "../../src/rpg/model.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
  isRpgCheckpointSafeBoundary,
  type RpgIndex,
} from "../../src/rpg/runner.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import {
  createInitialJourneyContractSnapshot,
  recordJourneyAcceptedDecision,
  recordJourneyDecision,
  type JourneyContractSnapshot,
} from "../../src/world/journey_contract.js";
import { classifyRpgJourneyDecision } from "../../src/world/journey_decision.js";
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const loaded = loadRpgSourceFile("content/rpg/quests/gallowmere.yaml");
if (!loaded.ok) throw new Error("gallowmere must compile");
const index = indexRpgPack(loaded.compiled.pack);
const rules = buildRpgRules(index);
const world = loadOverworldManifest(process.cwd());

type Driven = {
  state: GameState;
  action: RpgAction;
  events: GameEvent[];
  isSkillCheck: boolean;
};

function drive(
  rpgIndex: RpgIndex,
  rpgRules: Rules<RpgAction>,
  state: GameState,
  actionId: string,
): Driven {
  const option = enumerateRpgActions(rpgIndex, state).find(
    (candidate) => candidate.id === actionId,
  );
  if (!option) {
    throw new Error(
      `Missing ${actionId} in ${state.current}; legal=[${enumerateRpgActions(rpgIndex, state)
        .map((candidate) => candidate.id)
        .join(", ")}]`,
    );
  }
  const result = makeStep(rpgRules)(state, option.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  if (!result.ok) throw new Error("unreachable rejected RPG action");
  return {
    state: result.state,
    action: option.action,
    events: result.events,
    isSkillCheck: option.skill_check !== undefined,
  };
}

function journeyAt(target: number): JourneyContractSnapshot {
  let journey = createInitialJourneyContractSnapshot();
  while (journey.acceptedDecisions < target) {
    journey = recordJourneyAcceptedDecision(
      journey,
      {
        surface: "quest",
        actionId: `setup:${String(journey.acceptedDecisions + 1)}`,
        reason: "situation_changed",
      },
      false,
    );
  }
  return journey;
}

function fullPrepToHollow(): GameState {
  let state = initStateForRpgPack(index, 7);
  for (const actionId of [
    "go_west",
    "talk_hedrick",
    "ask_ask_sow",
    "read_shepherd_log",
    "go_east",
    "go_north",
    "go_east",
    "use_hunting_knife_on_spoor_ground",
    "go_west",
    "go_north",
    "use_hunting_knife_on_wind_stone",
    "go_north",
  ]) {
    state = drive(index, rules, state, actionId).state;
  }
  expect(state.current).toBe("moor_hollow");
  return state;
}

function registeredQueensburyMarketSession(): OverworldSession {
  const session = new OverworldSession(world);
  session.scoutPoi("albany_city__civic_core__poi");
  session.talkToCharacter("albany_city__civic_core__contact");
  session.chooseJourneyStory("albany:road_warden");
  if (session.journey().storyChoice?.kind === "relief_oath") {
    session.chooseJourneyStory("albany:oath_limited_aid_only");
  }
  if (session.journey().storyChoice?.kind === "lead_source") {
    session.chooseJourneyStory("albany:source_rowan_civic_docket");
  }
  session.travel("road_albany_city__saratoga_springs_city");
  if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
  session.travel("road_saratoga_springs_city__queensbury_town");
  if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
  session.exploreArea("queensbury_town__civic_core");
  session.moveArea("queensbury_town__area_route__civic_core__market__1");
  expect(session.view().quests.map((quest) => quest.id)).toContain("gallowmere");
  return session;
}

describe("journey checkpoints wait for embedded RPG safe boundaries", () => {
  it("surfaces decision 40 immediately when a real movement ends at a safe scene", () => {
    const before = initStateForRpgPack(index, 7);
    const moved = drive(index, rules, before, "go_north");
    expect(isRpgCheckpointSafeBoundary(index, moved.state)).toBe(true);

    const journey = recordJourneyDecision(
      journeyAt(39),
      { surface: "quest", actionId: "go_north" },
      classifyRpgJourneyDecision({
        action: moved.action,
        before,
        after: moved.state,
        events: moved.events,
        accepted: true,
      }),
      isRpgCheckpointSafeBoundary(index, moved.state),
    );
    expect(journey).toMatchObject({
      status: "awaiting_choice",
      acceptedDecisions: 40,
      pendingChoice: { atDecision: 40, checkpoint: 40 },
    });
  });

  it("lets a non-counting dialogue close surface an overdue checkpoint without changing proof", () => {
    let state = initStateForRpgPack(index, 7);
    state = drive(index, rules, state, "go_west").state;
    state = drive(index, rules, state, "talk_hedrick").state;
    expect(activeDialogue(index, state)?.npc.id).toBe("hedrick");
    expect(isRpgCheckpointSafeBoundary(index, state)).toBe(false);

    const before = state;
    const closed = drive(index, rules, state, "ask_leave_hedrick");
    const classification = classifyRpgJourneyDecision({
      action: closed.action,
      before,
      after: closed.state,
      events: closed.events,
      accepted: true,
    });
    expect(classification).toEqual({
      countsTowardJourney: false,
      reason: "dialogue_closure",
    });
    expect(isRpgCheckpointSafeBoundary(index, closed.state)).toBe(true);

    const deferred = journeyAt(42);
    const proof = structuredClone(deferred.decisionProof);
    const surfaced = recordJourneyDecision(
      deferred,
      { surface: "quest", actionId: "ask_leave_hedrick" },
      classification,
      isRpgCheckpointSafeBoundary(index, closed.state),
    );
    expect(surfaced).toMatchObject({
      status: "awaiting_choice",
      acceptedDecisions: 42,
      decisionProof: proof,
      pendingChoice: { atDecision: 42, checkpoint: 40 },
    });
  });

  it("does not interrupt the real Gallowmere fight at decision 40", () => {
    let rpgState = fullPrepToHollow();
    expect(isRpgCheckpointSafeBoundary(index, rpgState)).toBe(false);
    let journey = journeyAt(39);

    const firstBefore = rpgState;
    const first = drive(index, rules, rpgState, "attack_gallowmere_sow");
    rpgState = first.state;
    journey = recordJourneyDecision(
      journey,
      { surface: "quest", actionId: "attack_gallowmere_sow" },
      classifyRpgJourneyDecision({
        action: first.action,
        before: firstBefore,
        after: rpgState,
        events: first.events,
        accepted: true,
      }),
      isRpgCheckpointSafeBoundary(index, rpgState),
    );
    expect(journey).toMatchObject({
      status: "active",
      acceptedDecisions: 40,
      nextCheckpoint: 40,
      pendingChoice: null,
    });
    expect(isRpgCheckpointSafeBoundary(index, rpgState)).toBe(false);

    for (let guard = 0; guard < 20 && journey.pendingChoice === null; guard += 1) {
      const before = rpgState;
      const attack = drive(index, rules, rpgState, "attack_gallowmere_sow");
      rpgState = attack.state;
      journey = recordJourneyDecision(
        journey,
        { surface: "quest", actionId: "attack_gallowmere_sow" },
        classifyRpgJourneyDecision({
          action: attack.action,
          before,
          after: rpgState,
          events: attack.events,
          accepted: true,
        }),
        isRpgCheckpointSafeBoundary(index, rpgState),
      );
    }

    expect(isRpgCheckpointSafeBoundary(index, rpgState)).toBe(true);
    expect(journey.status).toBe("awaiting_choice");
    expect(journey.acceptedDecisions).toBeGreaterThan(40);
    expect(journey.pendingChoice).toMatchObject({
      checkpoint: 40,
      atDecision: journey.acceptedDecisions,
    });
  });

  it("keeps the MCP player's real Gallowmere action menu live when the fight begins at decision 40", () => {
    const parent = registeredQueensburyMarketSession();
    while (parent.journey().acceptedDecisions < 28) {
      parent.recordQuestDecision(
        `test:mcp-fight-setup:${String(parent.journey().acceptedDecisions + 1)}`,
        { countsTowardJourney: true, reason: "combat" },
        false,
      );
    }
    expect(parent.journey()).toMatchObject({
      status: "active",
      acceptedDecisions: 28,
      pendingChoice: null,
    });

    const api = createToolApi({ root: process.cwd(), embeddedQuestSeed: 7 });
    const restored = api.restore_overworld_session({
      snapshot: parent.snapshot(),
      compact_context: true,
    });
    const started = api.start_overworld_session_quest({
      session_id: restored.session_id,
      quest_id: "gallowmere",
      seed: 7,
      compact_observation: true,
      include_actions: true,
      compact_result: false,
    });
    const rpgSessionId = started.rpg_session_id;
    let stateHash = started.rpg_session.state_hash;
    let turn: ReturnType<typeof api.step_action> | null = null;
    for (const actionId of [
      "go_west",
      "talk_hedrick",
      "ask_ask_sow",
      "read_shepherd_log",
      "go_east",
      "go_north",
      "go_east",
      "use_hunting_knife_on_spoor_ground",
      "go_west",
      "go_north",
      "use_hunting_knife_on_wind_stone",
      "go_north",
    ]) {
      turn = api.step_action({
        session_id: rpgSessionId,
        action_id: actionId,
        expected_state_hash: stateHash,
        compact_observation: true,
        include_actions: true,
      });
      expect(turn.ok, actionId).toBe(true);
      stateHash = turn.state_hash;
    }
    if (!turn) throw new Error("Expected the Gallowmere approach to run.");
    expect(turn.journey).toMatchObject({
      status: "active",
      acceptedDecisions: 40,
      nextCheckpoint: 40,
      pendingChoice: null,
    });
    expect((turn as { context?: { actions?: string[] } }).context?.actions).toContain(
      "attack_gallowmere_sow",
    );
  });

  it("replays the verified seed-4664 decision-40 Gallowmere incident through legal actions", () => {
    // Exact player path from verified pure Terra run
    // 20260723T120939Z_overworld_seed4664 on clean build 0890ee96. This starts
    // fresh and earns every parent/quest decision; there is no synthetic prefill.
    const api = createToolApi({ root: process.cwd(), embeddedQuestSeed: 4664 });
    const started = api.start_overworld();
    const overworldSessionId = started.session_id;

    api.scout_overworld_session_poi({
      session_id: overworldSessionId,
      poi_id: "albany_city__civic_core__poi",
    });
    api.talk_overworld_session_contact({
      session_id: overworldSessionId,
      character_id: "albany_city__civic_core__contact",
    });
    api.choose_overworld_session_story({
      session_id: overworldSessionId,
      choice: "albany:road_warden",
    });
    api.choose_overworld_session_story({
      session_id: overworldSessionId,
      choice: "albany:oath_limited_aid_only",
    });
    api.choose_overworld_session_story({
      session_id: overworldSessionId,
      choice: "albany:source_hayden_frost_report",
    });
    api.move_overworld_session_area({
      session_id: overworldSessionId,
      area_route_id: "albany_city__area_route__civic_core__transport_hub__shortcut_1",
    });
    api.choose_overworld_session_story({
      session_id: overworldSessionId,
      story_choice_id: "albany:wolf_preparation",
      choice: "albany:prep_works_fortification",
    });
    api.choose_overworld_session_story({
      session_id: overworldSessionId,
      story_choice_id: "albany:wolf_relief_allocation",
      choice: "albany:relief_mobile_reserve",
    });

    const wolf = api.start_overworld_session_quest({
      session_id: overworldSessionId,
      quest_id: "wolf_winter",
      approach_id: "albany:wolf_approach_sheltered_stockway",
    });
    expect(wolf.journey.acceptedDecisions).toBe(9);
    let wolfStateHash = wolf.rpg_session.state_hash;
    let wolfTurn: ReturnType<typeof api.step_action> | null = null;
    for (const actionId of [
      "examine_relief_spear",
      "examine_sheltered_stockway_last_mile",
      "use_sheltered_stockway_last_mile",
      "talk_houndsman",
      "ask_fortify",
      "ask_commit_cade_terms",
      "examine_cade_household_shutters",
      "take_cade_household_shutters",
      "go_north",
      "examine_fortify_outer_seal",
      "use_cade_household_shutters_on_fortify_outer_seal",
      "go_north",
      "examine_fortify_threshold_seal",
      "use_cade_household_shutters_on_fortify_threshold_seal",
      "go_north",
      "examine_fortify_dawn_watch",
      "use_fortify_dawn_watch",
    ]) {
      wolfTurn = api.step_action({
        session_id: wolf.rpg_session_id,
        action_id: actionId,
        expected_state_hash: wolfStateHash,
      });
      expect(wolfTurn.ok, actionId).toBe(true);
      wolfStateHash = wolfTurn.state_hash;
    }
    if (!wolfTurn) throw new Error("Expected the verified Wolf-Winter route to run.");
    expect(wolfTurn.journey).toMatchObject({
      status: "awaiting_choice",
      acceptedDecisions: 18,
      pendingChoice: { reasons: ["goal_completed"], checkpoint: null },
    });

    api.choose_overworld_session_journey({
      session_id: overworldSessionId,
      choice: "continue",
    });
    api.choose_overworld_session_story({
      session_id: overworldSessionId,
      choice: "send_wagon_to_cade",
    });
    api.resupply_overworld_session({ session_id: overworldSessionId });
    const firstPassage = api.follow_overworld_session_goal({
      session_id: overworldSessionId,
    });
    expect(firstPassage.passage.stop_reason).toBe("road_encounter");
    api.resolve_overworld_session_road_encounter({
      session_id: overworldSessionId,
      strategy: "assist_travelers",
    });
    const secondPassage = api.follow_overworld_session_goal({
      session_id: overworldSessionId,
    });
    expect(secondPassage.passage.stop_reason).toBe("objective");
    api.scout_overworld_session_poi({
      session_id: overworldSessionId,
      poi_id: "queensbury_town__civic_core__poi",
    });
    api.move_overworld_session_area({
      session_id: overworldSessionId,
      area_route_id: "queensbury_town__area_route__civic_core__market__1",
    });

    const gallowmere = api.start_overworld_session_quest({
      session_id: overworldSessionId,
      quest_id: "gallowmere",
    });
    expect(gallowmere.journey).toMatchObject({
      status: "active",
      acceptedDecisions: 26,
      nextCheckpoint: 40,
    });
    let gallowmereStateHash = gallowmere.rpg_session.state_hash;
    for (const actionId of [
      "go_west",
      "talk_hedrick",
      "ask_ask_father",
      "ask_ask_sow",
      "read_shepherd_log",
      "ask_leave_hedrick",
      "go_east",
      "go_north",
      "go_east",
      "examine_spoor_ground",
      "use_hunting_knife_on_spoor_ground",
      "go_west",
      "examine_peat_sign",
      "go_north",
      "examine_wind_stone",
      "use_hunting_knife_on_wind_stone",
      "go_north",
      "examine_sow_blind_side",
      "use_hunting_knife_on_sow_blind_side",
    ]) {
      const turn = api.step_action({
        session_id: gallowmere.rpg_session_id,
        action_id: actionId,
        expected_state_hash: gallowmereStateHash,
      });
      expect(turn.ok, actionId).toBe(true);
      gallowmereStateHash = turn.state_hash;
    }

    const thresholdAttack = api.step_action({
      session_id: gallowmere.rpg_session_id,
      action_id: "attack_gallowmere_sow",
      expected_state_hash: gallowmereStateHash,
      include_actions: true,
    });
    expect(thresholdAttack).toMatchObject({
      ok: true,
      journey: {
        status: "active",
        acceptedDecisions: 40,
        nextCheckpoint: 40,
        pendingChoice: null,
      },
      context: {
        enemies: [["gallowmere_sow", 3]],
        actions: expect.arrayContaining(["attack_gallowmere_sow"]),
      },
    });

    const safeDefeat = api.step_action({
      session_id: gallowmere.rpg_session_id,
      action_id: "attack_gallowmere_sow",
      expected_state_hash: thresholdAttack.state_hash,
      include_actions: true,
    });
    if (safeDefeat.ok !== true) throw new Error("Expected seed-4664's second attack to succeed.");
    expect(safeDefeat).toMatchObject({
      ok: true,
      journey: {
        status: "awaiting_choice",
        acceptedDecisions: 41,
        nextCheckpoint: 40,
        pendingChoice: {
          atDecision: 41,
          reasons: ["checkpoint"],
          checkpoint: 40,
        },
      },
    });
    expect(safeDefeat.context).not.toHaveProperty("actions");
    expect(api.sessions.get(gallowmere.rpg_session_id).state.flags.sow_slain).toBe(true);
  });

  it("treats terminal RPG state as safe even if a live foe remains authored in the room", () => {
    const state = fullPrepToHollow();
    expect(isRpgCheckpointSafeBoundary(index, state)).toBe(false);
    expect(isRpgCheckpointSafeBoundary(index, { ...state, ended: true })).toBe(true);
  });
});
