/**
 * Regression for the pre-choice road-encounter leak: authored per-strategy outcome
 * prose (roadEvent.responses[*].outcome) rode into every verbose outward projection —
 * the view's pendingRoadEncounter event/options, travel-result road events, travel-log
 * entries, and route plans — so a blind MCP player could read exactly what each
 * strategy would do before choosing, while the UI and compact context deliberately
 * withheld it. Outward projections now carry no response outcomes; the prose surfaces
 * only through the resolution result after the choice is made.
 */
import { describe, expect, it } from "vitest";

import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const world = loadOverworldManifest(process.cwd());
const roadEventsByEdgeId = new Map(world.road_events.map((event) => [event.edge, event]));

function blockingRoadForFreshSession(session: OverworldSession) {
  const activeGoalId = session.journey().goal.id;
  const exit = session.view().exits.find((candidate) => {
    const event = roadEventsByEdgeId.get(candidate.id);
    return (
      event?.requires_choice === true &&
      event.responses !== undefined &&
      (event.active_goal_ids === undefined || event.active_goal_ids.includes(activeGoalId))
    );
  });
  if (!exit) throw new Error("Expected a goal-active blocking road event from the start town.");
  const event = roadEventsByEdgeId.get(exit.id)!;
  return { exit, event };
}

describe("road encounter outcome secrecy", () => {
  it("withholds authored response outcomes from every pre-choice projection", () => {
    const session = new OverworldSession(world);
    const { exit, event } = blockingRoadForFreshSession(session);
    const authoredOutcomes = [
      event.responses!.cautious_scout.outcome,
      event.responses!.assist_travelers.outcome,
      event.responses!.press_on.outcome,
    ];

    const travel = session.travel(exit.id);
    const travelJson = JSON.stringify(travel);
    for (const outcome of authoredOutcomes) {
      expect(travelJson).not.toContain(JSON.stringify(outcome).slice(1, -1));
    }

    const view = session.view();
    const pending = view.pendingRoadEncounter;
    expect(pending?.event.id).toBe(event.id);
    expect(pending?.event.responses).toBeUndefined();
    for (const option of pending?.options ?? []) {
      expect(option.outcome).toBeUndefined();
      expect(option.label.length).toBeGreaterThan(0);
    }
    const viewJson = JSON.stringify(view);
    for (const outcome of authoredOutcomes) {
      expect(viewJson).not.toContain(JSON.stringify(outcome).slice(1, -1));
    }

    const resolution = session.resolveRoadEncounter("press_on");
    expect(resolution.entry.text).toContain(event.responses!.press_on.outcome);

    const afterView = JSON.stringify(session.view());
    expect(afterView).not.toContain(
      JSON.stringify(event.responses!.cautious_scout.outcome).slice(1, -1),
    );
    expect(afterView).not.toContain(
      JSON.stringify(event.responses!.assist_travelers.outcome).slice(1, -1),
    );
  });

  it("keeps discovered route plans free of response outcomes", () => {
    const session = new OverworldSession(world);
    const { exit, event } = blockingRoadForFreshSession(session);
    session.travel(exit.id);
    session.resolveRoadEncounter("press_on");

    const routesJson = JSON.stringify(session.view().routeOptions);
    for (const response of Object.values(event.responses!)) {
      expect(routesJson).not.toContain(JSON.stringify(response.outcome).slice(1, -1));
    }
  });
});
