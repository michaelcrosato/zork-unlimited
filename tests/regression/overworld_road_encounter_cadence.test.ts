import { describe, expect, it } from "vitest";
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const world = loadOverworldManifest(process.cwd());
const roadEventsByEdgeId = new Map(world.road_events.map((event) => [event.edge, event]));

describe("authored overworld road encounter cadence", () => {
  it("counts ambient travel as one movement decision without a blocking choice", () => {
    const session = new OverworldSession(world);
    const ambientRoad = session
      .view()
      .exits.find((exit) => roadEventsByEdgeId.get(exit.id)?.requires_choice !== true);
    expect(ambientRoad).toBeDefined();

    const result = session.travel(ambientRoad!.id);

    expect(result.roadEvent).toMatchObject({
      id: roadEventsByEdgeId.get(ambientRoad!.id)!.id,
    });
    expect(result.journeyDecision).toEqual({
      countsTowardJourney: true,
      reason: "movement",
    });
    expect(session.view().pendingRoadEncounter).toBeNull();
    expect(session.journey().acceptedDecisions).toBe(1);
  });

  it("counts an authored choice as travel plus resolution, then never blocks on it again", () => {
    const session = new OverworldSession(world);
    const activeGoalId = session.journey().goal.id;
    const choiceRoad = session.view().exits.find((exit) => {
      const event = roadEventsByEdgeId.get(exit.id);
      return (
        event?.requires_choice === true &&
        (event.active_goal_ids === undefined || event.active_goal_ids.includes(activeGoalId))
      );
    });
    expect(choiceRoad).toBeDefined();

    const travel = session.travel(choiceRoad!.id);
    expect(travel.journeyDecision).toEqual({
      countsTowardJourney: true,
      reason: "movement",
    });
    expect(session.journey().acceptedDecisions).toBe(1);
    expect(session.view().pendingRoadEncounter?.event.id).toBe(
      roadEventsByEdgeId.get(choiceRoad!.id)!.id,
    );

    const resolution = session.resolveRoadEncounter("press_on");
    expect(resolution.journeyDecision).toEqual({
      countsTowardJourney: true,
      reason: "situation_changed",
    });
    expect(session.journey().acceptedDecisions).toBe(2);
    expect(session.view().pendingRoadEncounter).toBeNull();

    const returnTravel = session.travel(choiceRoad!.id);
    expect(returnTravel.roadEvent).toBeNull();
    expect(session.view().pendingRoadEncounter).toBeNull();
    expect(session.journey().acceptedDecisions).toBe(3);
  });

  it("does not surface a goal-bound road choice outside its active goal", () => {
    const session = new OverworldSession(world);
    const activeGoalId = session.journey().goal.id;
    const inactiveChoiceRoad = session.view().exits.find((exit) => {
      const event = roadEventsByEdgeId.get(exit.id);
      return (
        event?.requires_choice === true &&
        event.active_goal_ids !== undefined &&
        !event.active_goal_ids.includes(activeGoalId)
      );
    });
    expect(inactiveChoiceRoad).toBeDefined();

    const result = session.travel(inactiveChoiceRoad!.id);

    expect(result.roadEvent).toBeNull();
    expect(session.view().pendingRoadEncounter).toBeNull();
    expect(session.journey().acceptedDecisions).toBe(1);
  });
});
