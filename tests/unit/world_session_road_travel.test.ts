import { describe, expect, it } from "vitest";

import type { OverworldRoadEvent } from "../../src/world/overworld.js";
import { OverworldSession } from "../../src/world/session.js";
import { roadEventForOverworldSessionTravel } from "../../src/world/session_road_travel.js";
import type { TravelLogEntry } from "../../src/world/session_snapshot.js";
import { loadOverworldManifest } from "../../src/world/source.js";

function choiceEvent(overrides: Partial<OverworldRoadEvent> = {}): OverworldRoadEvent {
  return {
    id: "event:north",
    edge: "road:north",
    title: "Northbound warning",
    risk: "low",
    summary: "Wardens carry a live warning north.",
    requires_choice: true,
    active_goal_ids: ["goal:north"],
    retire_after_quest: "quest:north",
    responses: {
      cautious_scout: {
        label: "Read warden signs",
        outcome: "You read the warden signs and choose the safest line onward.",
      },
      assist_travelers: {
        label: "Free relief wagons",
        outcome: "You free the relief wagons and keep their warning moving north.",
      },
      press_on: {
        label: "Carry warning onward",
        outcome: "You carry the warning onward at pace and accept the strain.",
      },
    },
    ...overrides,
  };
}

function traveled(edgeId: string, roadEvent: OverworldRoadEvent | null): TravelLogEntry {
  return {
    edgeId,
    fromId: "a",
    toId: "b",
    from: "A",
    to: "B",
    route: "Test road",
    distanceMi: 1,
    baseMinutes: 10,
    delayMinutes: 0,
    minutes: 10,
    arrivedAt: 490,
    suppliesUsed: 1,
    suppliesAfter: 5,
    fatigueGained: 1,
    fatigueAfter: 1,
    roadEvent,
  };
}

describe("overworld road-scene cadence", () => {
  it("gates authored choices by goal, retirement, and prior journey history", () => {
    const event = choiceEvent();
    const eligible = {
      activeGoalId: "goal:north",
      completedQuestIds: new Set<string>(),
      travelLog: [] as TravelLogEntry[],
    };

    expect(roadEventForOverworldSessionTravel(event, eligible)).toBe(event);
    expect(
      roadEventForOverworldSessionTravel(event, { ...eligible, activeGoalId: "goal:other" }),
    ).toBeNull();
    expect(
      roadEventForOverworldSessionTravel(event, {
        ...eligible,
        completedQuestIds: new Set(["quest:north"]),
      }),
    ).toBeNull();
    expect(
      roadEventForOverworldSessionTravel(event, {
        ...eligible,
        travelLog: [traveled("road:other", null), traveled(event.edge, event)],
      }),
    ).toBeNull();
  });

  it("keeps generic reports ambient while suppressing only immediate repetition", () => {
    const ambient = choiceEvent({
      id: "event:ambient",
      edge: "road:ambient",
      active_goal_ids: undefined,
      retire_after_quest: undefined,
      requires_choice: undefined,
      responses: undefined,
    });
    const state = {
      activeGoalId: "goal:any",
      completedQuestIds: new Set<string>(),
      travelLog: [traveled(ambient.edge, ambient)],
    };

    expect(roadEventForOverworldSessionTravel(ambient, state)).toBeNull();
    expect(
      roadEventForOverworldSessionTravel(ambient, {
        ...state,
        travelLog: [traveled("road:other", null), ...state.travelLog],
      }),
    ).toBe(ambient);
  });

  it("counts ambient travel once and adds a second decision only for an actual choice", () => {
    const world = loadOverworldManifest(process.cwd());
    const eventsByEdge = new Map(world.road_events.map((event) => [event.edge, event]));

    const ambientSession = new OverworldSession(world);
    const ambientRoad = ambientSession
      .view()
      .exits.find((exit) => eventsByEdge.get(exit.id)?.title.endsWith("road report"));
    expect(ambientRoad).toBeDefined();
    const ambientTravel = ambientSession.travel(ambientRoad!.id);
    expect(ambientTravel.roadEvent?.requires_choice).not.toBe(true);
    expect(ambientSession.view().pendingRoadEncounter).toBeNull();
    expect(ambientSession.snapshot().journey.acceptedDecisions).toBe(1);

    const choiceSession = new OverworldSession(world);
    const truckRoad = choiceSession
      .view()
      .exits.find((exit) => exit.id === "road_colonie_town__albany_city");
    expect(truckRoad).toBeDefined();
    const choiceTravel = choiceSession.travel(truckRoad!.id);
    expect(choiceTravel.roadEvent?.requires_choice).toBe(true);
    expect(choiceSession.view().pendingRoadEncounter?.event.id).toBe(choiceTravel.roadEvent?.id);
    expect(choiceSession.snapshot().journey.acceptedDecisions).toBe(1);

    choiceSession.resolveRoadEncounter("cautious_scout");
    expect(choiceSession.view().pendingRoadEncounter).toBeNull();
    expect(choiceSession.snapshot().journey.acceptedDecisions).toBe(2);
  });
});
