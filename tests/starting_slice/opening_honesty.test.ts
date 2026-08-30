/**
 * Opening honesty: Wolf-Winter is the named local lead, sheltered LURE / Full
 * Compact / Aid-Only copy match the live checks, and post-commit leave/north
 * copy describe the locked plan.
 */
import { describe, expect, it } from "vitest";

import { makeStep } from "../../src/core/engine.js";
import { createToolApi } from "../../src/mcp/tools.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { buildRpgRules, enumerateRpgActions, indexRpgPack } from "../../src/rpg/runner.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import type { GameState } from "../../src/core/state.js";
import {
  INITIAL_JOURNEY_GOAL,
  INITIAL_JOURNEY_GOAL_GUIDANCE,
} from "../../src/world/journey_contract.js";
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { revealCurrentJourneyStoryOptions } from "../regression/support/journey_story.js";

const WORLD = loadOverworldManifest(process.cwd());
const CIVIC_EVENT = "albany_city__civic_core__event";
const NORTH_LURE_PENDING =
  "North is blocked. Finish the shown LURE action first. Feed is west; the hatch is west then up.";
const FULL = { compact_context: false, compact_result: false } as const;

const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("Wolf-Winter must compile");
const index = indexRpgPack(loaded.compiled.pack);

function act(state: GameState, actionId: string): GameState {
  const option = enumerateRpgActions(index, state).find((candidate) => candidate.id === actionId);
  expect(option, `${actionId} must be legal`).toBeDefined();
  if (!option) throw new Error(`Missing ${actionId}`);
  const result = makeStep(buildRpgRules(index))(state, option.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  return result.state;
}

describe("opening honesty", () => {
  it("names Wolf-Winter as the completable Albany lead and hides the civic charter as an opening lead", () => {
    const session = new OverworldSession(WORLD);
    const journey = session.journey();
    expect(journey.goal.text).toBe("Complete Wolf-Winter in Albany.");
    expect(journey.goal.text).toBe(INITIAL_JOURNEY_GOAL.text);
    expect(journey.goalGuidance).toBe(INITIAL_JOURNEY_GOAL_GUIDANCE);
    expect(INITIAL_JOURNEY_GOAL_GUIDANCE).toContain("Finish The Wolf-Winter");
    expect(INITIAL_JOURNEY_GOAL_GUIDANCE).not.toMatch(/jobs, events, and sites/i);
    expect(INITIAL_JOURNEY_GOAL.text).not.toMatch(/find one local lead/i);

    const civic = session.view().events.find((event) => event.id === CIVIC_EVENT);
    expect(civic?.authored_scene?.advertise_blocked_lead).toBe(false);
    expect(civic?.summary).toMatch(/does not complete Wolf-Winter/i);
    expect(session.compactView().event_leads).toBeUndefined();
    expect(session.compactView().events).toContainEqual([CIVIC_EVENT, civic?.title]);
  });

  it("presents Full Compact Repair and Aid-Only alarm copy that match the listed checks", () => {
    const session = new OverworldSession(WORLD);
    session.scoutPoi("albany_city__civic_core__poi");
    session.talkToCharacter("albany_city__civic_core__contact");
    session.chooseJourneyStory("albany:ledger_advocate");
    revealCurrentJourneyStoryOptions(session, WORLD.opening_relief_oath!.id);
    const oath = session.journey().storyChoice;
    expect(oath?.kind).toBe("relief_oath");
    const compact = oath?.options.find((option) => option.id === "albany:oath_full_compact_duty");
    const aid = oath?.options.find((option) => option.id === "albany:oath_limited_aid_only");
    const compactText = JSON.stringify(compact);
    const aidText = JSON.stringify(aid);
    expect(compactText).toMatch(/DC 12 instead of 14/i);
    expect(compactText).not.toMatch(/2 DC easier/i);
    expect(aidText).toMatch(/First LAY still \+1/i);
    expect(aidText).toMatch(/last feed skips \+1 if LAY succeeded/i);
  });

  it("keeps sheltered LURE LAY at Fieldcraft DC 12 and post-commit leave/north on the locked plan", () => {
    const api = createToolApi({ root: process.cwd() });
    const started = api.start_overworld({ compact_context: false });
    const sessionId = started.session_id;
    api.scout_overworld_session_poi({
      ...FULL,
      session_id: sessionId,
      poi_id: started.observation.pois[0]!.id,
    });
    api.talk_overworld_session_contact({
      ...FULL,
      session_id: sessionId,
      character_id: "albany_city__civic_core__contact",
    });
    api.choose_overworld_session_story({
      ...FULL,
      session_id: sessionId,
      choice: "albany:ledger_advocate",
    });
    api.choose_overworld_session_story({
      ...FULL,
      session_id: sessionId,
      choice: "albany:oath_limited_aid_only",
    });
    const sourced = api.choose_overworld_session_story({
      ...FULL,
      session_id: sessionId,
      choice: "albany:source_jamie_market_testimony",
    });
    const prepRoute = sourced.observation.areaExits.find(
      (exit) => exit.destination.id === "albany_city__transport_hub",
    );
    if (!prepRoute) throw new Error("expected station route");
    api.move_overworld_session_area({
      ...FULL,
      session_id: sessionId,
      area_route_id: prepRoute.id,
    });
    api.choose_overworld_session_story({
      ...FULL,
      session_id: sessionId,
      story_choice_id: "albany:wolf_preparation",
      choice: "albany:prep_relief_protocol",
    });
    api.choose_overworld_session_story({
      ...FULL,
      session_id: sessionId,
      story_choice_id: "albany:wolf_relief_allocation",
      choice: "albany:relief_resident_shelter",
    });
    const launched = api.start_overworld_session_quest({
      ...FULL,
      compact_observation: false,
      compact_actions: false,
      include_actions: true,
      session_id: sessionId,
      quest_id: "wolf_winter",
      approach_id: "albany:wolf_approach_sheltered_stockway",
      seed: 4174,
    });
    let state = structuredClone(api.sessions.get(launched.rpg_session_id).state);
    state = act(state, "use_sheltered_stockway_last_mile");
    expect(state.journal.join("\n")).toMatch(/still Fieldcraft DC 12/i);
    expect(state.journal.join("\n")).toMatch(/do not skip the check/i);

    state = act(state, "talk_houndsman");
    state = act(state, "ask_lure");
    state = act(state, "ask_commit_lure");
    expect(state.flags.strategy_lure_committed).toBe(true);
    const committedTalk = buildRpgObservation(index, state, {
      availableActions: enumerateRpgActions(index, state),
    });
    expect(
      committedTalk.available_actions.find((action) => action.id.startsWith("ask_leave"))?.command,
    ).toMatch(/LEAVE — Begin LURE/i);

    state = act(state, "ask_leave");
    const yard = buildRpgObservation(index, state, {
      availableActions: enumerateRpgActions(index, state),
    });
    expect(yard.blocked_exits).toContainEqual({
      direction: "north",
      message: NORTH_LURE_PENDING,
    });
    expect(yard.blocked_exits.find((exit) => exit.direction === "north")?.message).not.toMatch(
      /chooses HUNT/i,
    );

    state = act(state, "go_west");
    state = act(state, "take_winter_feed_sack");
    state = act(state, "go_east");
    state = act(state, "go_north");
    const lay = enumerateRpgActions(index, state).find(
      (action) => action.id === "use_winter_feed_sack_on_downwind_feed_line",
    );
    expect(lay?.skill_check).toMatchObject({ skill: "fieldcraft", difficulty: 12, die: "d20" });

    state = act(state, "go_south");
    state = act(state, "talk_houndsman");
    const afterReturn = buildRpgObservation(index, state, {
      availableActions: enumerateRpgActions(index, state),
    });
    expect(
      afterReturn.available_actions.find((action) => action.id.startsWith("ask_leave"))?.command,
    ).toBe("ask: LEAVE — Return to the yard.");
  });
});
