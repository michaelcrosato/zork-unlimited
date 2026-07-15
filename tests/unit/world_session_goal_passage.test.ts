import { describe, expect, it } from "vitest";

import { loadOverworldManifest } from "../../src/world/source.js";
import {
  goalPassageHitsResourceBoundary,
  overworldTravelDelayTier,
} from "../../src/world/session_goal_passage.js";
import { OverworldSession, type TravelLogEntry } from "../../src/world/session.js";
import { resolveOverworldTravelLeg } from "../../src/world/travel_mechanics.js";

const WORLD = loadOverworldManifest(process.cwd());
const ALBANY_TO_SARATOGA = "road_albany_city__saratoga_springs_city";
const SARATOGA_TO_QUEENSBURY = "road_saratoga_springs_city__queensbury_town";
const ALBANY_TO_COLONIE = "road_colonie_town__albany_city";

function moveToArea(session: OverworldSession, destinationAreaId: string): void {
  const route = session
    .view()
    .areaExits.find((candidate) => candidate.destination.id === destinationAreaId);
  if (!route) throw new Error(`Expected a visible area route to ${destinationAreaId}.`);
  session.moveArea(route.id);
}

function sessionAtGallowmereGoal(): OverworldSession {
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
  if (!quest) throw new Error("Expected Wolf-Winter to be discovered in Albany.");
  moveToArea(session, quest.area);
  session.startQuest(quest.id, "albany:wolf_approach_sheltered_stockway");
  session.completeQuest(quest.id, {
    endingId: "ending_held",
    endingTitle: "The Byre Held",
    death: false,
  });
  session.chooseJourney("continue");
  session.chooseJourneyStory("send_wagon_to_cade");
  return session;
}

function finishGallowmereAndActivateTanner(session: OverworldSession): void {
  const first = session.followGoalPassage();
  expect(first.stopReason).toBe("road_encounter");
  session.resolveRoadEncounter("press_on");
  const second = session.followGoalPassage();
  expect(second.stopReason).toBe("objective");
  session.exploreArea("queensbury_town__civic_core");
  moveToArea(session, "queensbury_town__market");
  session.startQuest("gallowmere");
  session.completeQuest("gallowmere", {
    endingId: "ending_victory",
    endingTitle: "The Gallowmere Broken",
    death: false,
  });
  session.chooseJourney("continue");
  expect(session.journey().goal.id).toBe("oneonta_tanners_fever");
}

function sessionAtResolvedColonieRoad(): OverworldSession {
  const session = sessionAtGallowmereGoal();
  finishGallowmereAndActivateTanner(session);
  session.travel(SARATOGA_TO_QUEENSBURY);
  if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
  session.travel(ALBANY_TO_SARATOGA);
  if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
  session.travel(ALBANY_TO_COLONIE);
  expect(session.view().pendingRoadEncounter).not.toBeNull();
  session.resolveRoadEncounter("press_on");
  expect(session.view().current.id).toBe("colonie_town");
  return session;
}

function withoutJourneyDecision(result: ReturnType<OverworldSession["travel"]>): TravelLogEntry {
  const { journeyDecision: _journeyDecision, ...entry } = result;
  return entry;
}

describe("current-goal passage", () => {
  it("derives an immutable, secret-safe selection only for an active follow-up route", () => {
    const opening = new OverworldSession(WORLD);
    expect(opening.journey().goalPassage).toBeNull();

    const session = sessionAtGallowmereGoal();
    const passage = session.journey().goalPassage;
    expect(passage).toEqual({
      id: "follow_current_goal",
      label: "Follow the road to Queensbury town",
      destination: "Queensbury town",
      roadCount: 2,
      baseMinutes: 60,
      estimatedMinutes: 60,
      suppliesNeeded: 2,
      supplyDeficit: 0,
      suppliesAfter: 2,
      fatigueAfter: 12,
      travelConditionAfter: "ready",
      consequence:
        "Travel toward Queensbury town, preserving every road's normal time, supplies, fatigue, discoveries, and encounters.",
      stopRule:
        "The passage stops at the objective, at a road encounter, or before the next road would add a supply shortfall or a worse fatigue-delay tier; the first road always accepts your current condition.",
    });
    expect(Object.isFrozen(passage)).toBe(true);
    expect(Object.keys(passage!).sort()).toEqual(
      [
        "id",
        "label",
        "destination",
        "roadCount",
        "baseMinutes",
        "estimatedMinutes",
        "suppliesNeeded",
        "supplyDeficit",
        "suppliesAfter",
        "fatigueAfter",
        "travelConditionAfter",
        "consequence",
        "stopRule",
      ].sort(),
    );
    expect(JSON.stringify(passage)).not.toMatch(
      /road_albany|saratoga_springs_city|queensbury_town|gallowmere|targetTownId|active_goal|road_event/i,
    );

    session.followGoalPassage();
    expect(session.journey().goalPassage).toBeNull();
  });

  it("stops at an authored road choice, counts once, and restores the exact interruption", () => {
    const session = sessionAtGallowmereGoal();
    const before = session.journey();
    const result = session.followGoalPassage();

    expect(result).toMatchObject({
      goalId: "carry_hedricks_packet_north",
      destination: "Queensbury town",
      stoppedAt: "Saratoga Springs city",
      stopReason: "road_encounter",
      baseMinutes: 34,
      delayMinutes: 0,
      minutes: 34,
      suppliesUsed: 1,
      suppliesAfter: 3,
      fatigueGained: 1,
      fatigueAfter: 11,
      travelConditionAfter: "ready",
      journeyDecision: { countsTowardJourney: true, reason: "movement" },
    });
    expect(result.legs).toHaveLength(1);
    expect(result.legs[0]?.edgeId).toBe(ALBANY_TO_SARATOGA);
    expect(session.journey()).toMatchObject({
      acceptedDecisions: before.acceptedDecisions + 1,
      decisionProof: {
        last: {
          number: before.acceptedDecisions + 1,
          surface: "overworld",
          actionId:
            "follow_current_goal:carry_hedricks_packet_north:via:road_albany_city__saratoga_springs_city",
          reason: "movement",
        },
      },
      goalPassage: null,
    });

    const snapshot = session.snapshot();
    const restored = OverworldSession.restore(WORLD, snapshot);
    expect(restored.snapshot()).toEqual(snapshot);
    expect(restored.snapshotHash()).toBe(session.snapshotHash());
    expect(restored.view().pendingRoadEncounter?.edgeId).toBe(ALBANY_TO_SARATOGA);
    expect(restored.journey().goalPassage).toBeNull();
    restored.resolveRoadEncounter("press_on");
    expect(restored.followGoalPassage()).toMatchObject({
      stopReason: "objective",
      stoppedAt: "Queensbury town",
      legs: [{ edgeId: SARATOGA_TO_QUEENSBURY }],
    });
  });

  it("preserves a required road encounter when the passage lands on checkpoint 40", () => {
    const session = sessionAtGallowmereGoal();
    while (session.journey().acceptedDecisions < 39) {
      const areaRoute = session.view().areaExits[0];
      if (!areaRoute) throw new Error("Expected a reversible Albany area route.");
      session.moveArea(areaRoute.id);
    }
    expect(session.journey()).toMatchObject({ status: "active", acceptedDecisions: 39 });

    const result = session.followGoalPassage();
    expect(result).toMatchObject({
      stopReason: "road_encounter",
      stoppedAt: "Saratoga Springs city",
      legs: [{ edgeId: ALBANY_TO_SARATOGA }],
    });
    expect(session.journey()).toMatchObject({
      status: "awaiting_choice",
      acceptedDecisions: 40,
      pendingChoice: { atDecision: 40, reasons: ["checkpoint"], checkpoint: 40 },
      goalPassage: null,
    });
    expect(session.view().pendingRoadEncounter?.edgeId).toBe(ALBANY_TO_SARATOGA);

    const exported = session.snapshot();
    const restored = OverworldSession.restore(WORLD, exported);
    expect(restored.snapshot()).toEqual(exported);
    expect(restored.snapshotHash()).toBe(session.snapshotHash());
    const beforeContinue = restored.snapshot();
    restored.chooseJourney("continue");
    const afterContinue = restored.snapshot();
    expect(afterContinue).toMatchObject({
      currentId: beforeContinue.currentId,
      currentAreaId: beforeContinue.currentAreaId,
      minutes: beforeContinue.minutes,
      supplies: beforeContinue.supplies,
      fatigue: beforeContinue.fatigue,
      travelLog: beforeContinue.travelLog,
      pendingRoadEncounter: beforeContinue.pendingRoadEncounter,
    });
    expect(restored.journey()).toMatchObject({
      status: "active",
      acceptedDecisions: 40,
      nextCheckpoint: 80,
      goalPassage: null,
    });
    const blockedHash = restored.snapshotHash();
    expect(() => restored.followGoalPassage()).toThrow(/pending road encounter/i);
    expect(restored.snapshotHash()).toBe(blockedHash);

    restored.resolveRoadEncounter("press_on");
    expect(restored.journey().goalPassage).not.toBeNull();
  });

  it("matches the existing per-road reducer across a quiet multi-leg passage", () => {
    const prepared = sessionAtResolvedColonieRoad();
    prepared.resupplyAtTown();
    const snapshot = prepared.snapshot();
    const passageSession = OverworldSession.restore(WORLD, snapshot);
    const manualSession = OverworldSession.restore(WORLD, snapshot);
    const beforeDecisions = passageSession.journey().acceptedDecisions;

    const passage = passageSession.followGoalPassage();
    const manualLegs = passage.legs.map((leg) =>
      withoutJourneyDecision(manualSession.travel(leg.edgeId)),
    );

    expect(passage.stopReason).toBe("objective");
    expect(passage.stoppedAt).toBe("Oneonta city");
    expect(passage.legs).toHaveLength(3);
    expect(passage.legs).toEqual(manualLegs);
    const {
      journey: _passageJourney,
      openingLeadSourceDecisionTrail: _passageSourceTrail,
      ...passageWorld
    } = passageSession.snapshot();
    const {
      journey: _manualJourney,
      openingLeadSourceDecisionTrail: _manualSourceTrail,
      ...manualWorld
    } = manualSession.snapshot();
    expect(passageWorld).toEqual(manualWorld);
    expect(passageSession.journey().acceptedDecisions).toBe(beforeDecisions + 1);
    expect(manualSession.journey().acceptedDecisions).toBe(beforeDecisions + 3);
    expect(passage).toMatchObject({
      baseMinutes: passage.legs.reduce((sum, leg) => sum + leg.baseMinutes, 0),
      delayMinutes: passage.legs.reduce((sum, leg) => sum + leg.delayMinutes, 0),
      minutes: passage.legs.reduce((sum, leg) => sum + leg.minutes, 0),
      suppliesUsed: passage.legs.reduce((sum, leg) => sum + leg.suppliesUsed, 0),
      suppliesAfter: passage.legs.at(-1)?.suppliesAfter,
      fatigueGained: passage.legs.reduce((sum, leg) => sum + leg.fatigueGained, 0),
      fatigueAfter: passage.legs.at(-1)?.fatigueAfter,
    });

    const restored = OverworldSession.restore(WORLD, passageSession.snapshot());
    expect(restored.snapshotHash()).toBe(passageSession.snapshotHash());
    expect(restored.view().current.id).toBe("oneonta_city");
  });

  it("pauses before a newly introduced shortfall but accepts an already undersupplied start", () => {
    const session = sessionAtResolvedColonieRoad();
    session.resupplyAtTown();
    for (const roadId of [
      ALBANY_TO_COLONIE,
      ALBANY_TO_SARATOGA,
      SARATOGA_TO_QUEENSBURY,
      SARATOGA_TO_QUEENSBURY,
      ALBANY_TO_SARATOGA,
      ALBANY_TO_SARATOGA,
      ALBANY_TO_SARATOGA,
    ]) {
      session.travel(roadId);
      if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
    }
    expect(session.view().current.id).toBe("albany_city");
    expect(session.view().supplies).toBe(1);

    const bounded = session.followGoalPassage();
    expect(bounded).toMatchObject({
      stopReason: "resource_boundary",
      stoppedAt: "Colonie town",
      suppliesUsed: 1,
      suppliesAfter: 0,
    });
    expect(bounded.legs).toHaveLength(1);

    const acceptedUndersupplied = session.followGoalPassage();
    expect(acceptedUndersupplied).toMatchObject({
      stopReason: "objective",
      stoppedAt: "Oneonta city",
      suppliesAfter: 0,
    });
    expect(acceptedUndersupplied.legs).toHaveLength(3);
    expect(acceptedUndersupplied.legs.every((leg) => leg.suppliesUsed === 0)).toBe(true);
  });

  it("rejects blocked or absent passages without changing state", () => {
    const opening = new OverworldSession(WORLD);
    const openingHash = opening.snapshotHash();
    expect(() => opening.followGoalPassage()).toThrow(/no current goal passage/i);
    expect(opening.snapshotHash()).toBe(openingHash);
    expect(opening.journey().acceptedDecisions).toBe(0);

    const interrupted = sessionAtGallowmereGoal();
    interrupted.followGoalPassage();
    const interruptedHash = interrupted.snapshotHash();
    const interruptedDecisions = interrupted.journey().acceptedDecisions;
    expect(() => interrupted.followGoalPassage()).toThrow(/pending road encounter/i);
    expect(interrupted.snapshotHash()).toBe(interruptedHash);
    expect(interrupted.journey().acceptedDecisions).toBe(interruptedDecisions);
  });

  it("recognizes only newly introduced shortfalls and worse starting delay tiers", () => {
    const deficitPreview = resolveOverworldTravelLeg(30, null, { supplies: 0, fatigue: 0 });
    expect(deficitPreview.supplyDeficit).toBe(1);
    expect(
      goalPassageHitsResourceBoundary({
        traversedRoadCount: 1,
        selectionDelayTier: overworldTravelDelayTier(0),
        selectionSupplies: 1,
        currentFatigue: 0,
        preview: deficitPreview,
      }),
    ).toBe(true);
    expect(
      goalPassageHitsResourceBoundary({
        traversedRoadCount: 1,
        selectionDelayTier: overworldTravelDelayTier(0),
        selectionSupplies: 0,
        currentFatigue: 0,
        preview: deficitPreview,
      }),
    ).toBe(false);
    expect(
      goalPassageHitsResourceBoundary({
        traversedRoadCount: 1,
        selectionDelayTier: overworldTravelDelayTier(0),
        selectionSupplies: 0,
        currentFatigue: 25,
        preview: deficitPreview,
      }),
    ).toBe(true);
    expect(
      goalPassageHitsResourceBoundary({
        traversedRoadCount: 0,
        selectionDelayTier: overworldTravelDelayTier(0),
        selectionSupplies: 1,
        currentFatigue: 25,
        preview: deficitPreview,
      }),
    ).toBe(false);
  });
});
