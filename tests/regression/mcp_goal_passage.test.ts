/**
 * Regression for the game-native Goal Passage MCP surface. The player commits
 * to the already-presented current goal without supplying route/content ids;
 * MCP must return exactly the roads that happened and share the core journey.
 */
import { describe, expect, it } from "vitest";

import { createToolApi } from "../../src/mcp/tools.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { OverworldSession } from "../../ui/src/overworld.js";

const WORLD = loadOverworldManifest(process.cwd());
const FIRST_ROAD = "road_albany_city__saratoga_springs_city";
const FUTURE_ROAD = "road_saratoga_springs_city__queensbury_town";
const FIRST_EVENT_TITLE = "The northbound relief line";
const FUTURE_EVENT_TITLE = "Moor sign on the Queensbury road";

function moveToArea(session: OverworldSession, destinationAreaId: string): void {
  const route = session
    .view()
    .areaExits.find((candidate) => candidate.destination.id === destinationAreaId);
  if (!route) throw new Error(`expected a route to ${destinationAreaId}`);
  session.moveArea(route.id);
}

function sessionAtQueensburyGoalPassage(): OverworldSession {
  const session = new OverworldSession(WORLD);
  const opening = session.view();
  session.scoutPoi(opening.pois[0]!.id);
  const talked = session.talkToCharacter(opening.characters[0]!.id);
  expect(talked.discoveredQuests?.map((candidate) => candidate.id)).not.toContain("wolf_winter");
  if (session.journey().storyChoice?.kind === "registration") {
    session.chooseJourneyStory("albany:ledger_advocate");
  }
  expect(session.journey().storyChoice?.kind).toBe("lead_source");
  session.chooseJourneyStory("albany:source_rowan_civic_docket");
  expect(session.journey().storyChoice?.kind).toBe("preparation");
  expect(session.view().quests.map((candidate) => candidate.id)).not.toContain("wolf_winter");
  session.chooseJourneyStory("albany:prep_works_fortification");
  const quest = session.view().quests.find((candidate) => candidate.id === "wolf_winter");
  if (!quest) throw new Error("expected the Albany Wolf-Winter lead");
  moveToArea(session, quest.area);
  session.startQuest(quest.id);
  session.completeQuest(quest.id, {
    endingId: "ending_held_timber_saved",
    endingTitle: "The Byre Held, Paling Timber Saved",
    death: false,
  });
  session.chooseJourney("continue");
  session.chooseJourneyStory("send_wagon_to_cade");
  if (!session.journey().goalPassage) throw new Error("expected a visible Queensbury passage");
  return session;
}

describe("MCP Goal Passage", () => {
  it("shares the core passage, counts once, guards hashes, and reveals only traversed roads", () => {
    const source = sessionAtQueensburyGoalPassage();
    const beforeJourney = source.journey();
    const beforePassage = beforeJourney.goalPassage;
    if (!beforePassage) throw new Error("expected the pre-action goal passage");

    expect(Object.keys(beforePassage).sort()).toEqual([
      "baseMinutes",
      "consequence",
      "destination",
      "estimatedMinutes",
      "fatigueAfter",
      "id",
      "label",
      "roadCount",
      "stopRule",
      "suppliesAfter",
      "suppliesNeeded",
      "supplyDeficit",
      "travelConditionAfter",
    ]);
    expect(beforePassage).toMatchObject({
      id: "follow_current_goal",
      destination: "Queensbury town",
      roadCount: 2,
    });
    expect(JSON.stringify(beforePassage)).not.toMatch(
      /saratoga_springs_city|road_albany|northbound relief|Moor sign|targetQuestId|targetTownId|targetAreaId|endingId|questOutcomeIds|content\/rpg|win_conditions|maneuver_/i,
    );

    const snapshot = source.snapshot();
    const api = createToolApi({ root: process.cwd() });
    const restored = api.restore_overworld_session({
      snapshot,
      compact_context: false,
      compact_result: false,
    });
    expect(restored.journey).toEqual(beforeJourney);
    expect(
      api.get_overworld_session_context({ session_id: restored.session_id }).journey.goalPassage,
    ).toEqual(beforePassage);

    const coreBranch = OverworldSession.restore(WORLD, snapshot);
    const expected = coreBranch.followGoalPassage();
    const full = api.follow_overworld_session_goal({
      session_id: restored.session_id,
      expected_snapshot_hash: restored.snapshot_hash,
      compact_context: false,
      compact_result: false,
    });
    if (!full.ok) throw new Error(full.rejection_reason);

    expect(full.passage).toEqual(expected);
    expect(full.journey).toEqual(coreBranch.journey());
    expect(full.journey.acceptedDecisions).toBe(beforeJourney.acceptedDecisions + 1);
    expect(full.journeyDecision).toEqual({ countsTowardJourney: true, reason: "movement" });
    expect(full.passage).toMatchObject({
      destination: "Queensbury town",
      stoppedAt: "Saratoga Springs city",
      stopReason: "road_encounter",
      journeyDecision: { countsTowardJourney: true, reason: "movement" },
    });
    expect(full.passage.legs).toHaveLength(1);
    expect(full.passage.legs[0]).toMatchObject({
      edgeId: FIRST_ROAD,
      roadEvent: { title: FIRST_EVENT_TITLE },
    });
    expect(JSON.stringify(full.passage)).not.toMatch(
      new RegExp(`${FUTURE_ROAD}|${FUTURE_EVENT_TITLE}`, "i"),
    );

    const stale = api.follow_overworld_session_goal({
      session_id: restored.session_id,
      expected_snapshot_hash: restored.snapshot_hash,
    });
    expect(stale).toMatchObject({
      ok: false,
      snapshot_hash: full.snapshot_hash,
      rejection_reason: expect.stringMatching(/snapshot hash mismatch/i),
      journeyDecision: { countsTowardJourney: false, reason: "rejected" },
      journey: full.journey,
    });
    expect(stale).not.toHaveProperty("passage");

    const compactRestore = api.restore_overworld_session({ snapshot });
    const compact = api.follow_overworld_session_goal({
      session_id: compactRestore.session_id,
      expected_snapshot_hash: compactRestore.snapshot_hash,
    });
    if (!compact.ok) throw new Error(compact.rejection_reason);
    expect(compact.passage).toMatchObject({
      goal_id: expected.goalId,
      destination: expected.destination,
      stopped_at: expected.stoppedAt,
      stop_reason: expected.stopReason,
      minutes: [expected.baseMinutes, expected.delayMinutes, expected.minutes],
      supplies: [expected.suppliesUsed, expected.suppliesAfter],
      fatigue: [expected.fatigueGained, expected.fatigueAfter],
      travel_condition: expected.travelConditionAfter,
    });
    expect(compact.passage.legs).toHaveLength(1);
    expect(compact.passage.legs[0]?.[0]).toBe(FIRST_ROAD);
    expect(compact.passage.legs[0]?.[8]).toBe(FIRST_EVENT_TITLE);
    expect(compact.passage).not.toHaveProperty("goalId");
    expect(compact.passage).not.toHaveProperty("stopReason");
    expect(JSON.stringify(compact.passage)).not.toMatch(
      new RegExp(`${FUTURE_ROAD}|${FUTURE_EVENT_TITLE}`, "i"),
    );

    const manualRestore = api.restore_overworld_session({ snapshot });
    const manual = api.travel_overworld_session({
      session_id: manualRestore.session_id,
      road_id: FIRST_ROAD,
      expected_snapshot_hash: manualRestore.snapshot_hash,
    });
    if (!manual.ok) throw new Error(manual.rejection_reason);
    expect(manual).not.toHaveProperty("passage");
    expect(manual.travel).toEqual(compact.passage.legs[0]);
    expect(manual.journey.acceptedDecisions).toBe(beforeJourney.acceptedDecisions + 1);
  });
});
