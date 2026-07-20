import { describe, expect, it } from "vitest";

import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const WORLD = loadOverworldManifest(process.cwd());
const CHOICE_ROAD = "road_colonie_town__albany_city";

function sessionAtRoadEncounter(): OverworldSession {
  const session = new OverworldSession(WORLD);
  const road = session.view().exits.find((candidate) => candidate.id === CHOICE_ROAD);
  if (!road) throw new Error(`Expected visible road ${CHOICE_ROAD}.`);

  const travel = session.travel(road.id);
  expect(travel.roadEvent?.requires_choice).toBe(true);
  expect(session.view().pendingRoadEncounter).not.toBeNull();
  return session;
}

describe("pending road encounter next action", () => {
  it("names the resolver and strategy source in full and compact views only while pending", () => {
    const session = sessionAtRoadEncounter();

    expect(session.view().pendingRoadEncounter?.nextAction).toEqual({
      tool: "resolve_overworld_session_road_encounter",
      argument: "strategy",
      valuesFrom: "options[*].strategy",
    });
    expect(session.compactView().pending_road?.next_action).toEqual({
      tool: "resolve_overworld_session_road_encounter",
      argument: "strategy",
      values_from: "options[*][0]",
    });

    session.resolveRoadEncounter("press_on");

    expect(session.view().pendingRoadEncounter).toBeNull();
    expect(session.compactView().pending_road).toBeUndefined();
  });

  it("re-derives the descriptor after restore without changing the snapshot schema", () => {
    const session = sessionAtRoadEncounter();
    const snapshot = session.snapshot();

    expect(snapshot.pendingRoadEncounter).toEqual({ edgeId: CHOICE_ROAD });
    expect(JSON.stringify(snapshot)).not.toMatch(/nextAction|next_action|valuesFrom|values_from/);

    const restored = OverworldSession.restore(WORLD, snapshot);

    expect(restored.snapshot()).toEqual(snapshot);
    expect(restored.snapshotHash()).toBe(session.snapshotHash());
    expect(restored.view().pendingRoadEncounter?.nextAction).toEqual({
      tool: "resolve_overworld_session_road_encounter",
      argument: "strategy",
      valuesFrom: "options[*].strategy",
    });
    expect(restored.compactView().pending_road?.next_action).toEqual({
      tool: "resolve_overworld_session_road_encounter",
      argument: "strategy",
      values_from: "options[*][0]",
    });
  });
});
