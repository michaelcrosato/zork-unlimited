import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { formatGoalPassageLog } from "../../ui/src/goalPassage.js";

type GoalPassageResult = Parameters<typeof formatGoalPassageLog>[0];
type GoalPassageLeg = GoalPassageResult["legs"][number];

function leg(
  fromId: string,
  from: string,
  toId: string,
  to: string,
  arrivedAt: number,
): GoalPassageLeg {
  return {
    edgeId: `road_${fromId}__${toId}`,
    fromId,
    toId,
    from,
    to,
    route: "dispatch road",
    distanceMi: 12,
    baseMinutes: 22,
    delayMinutes: 0,
    minutes: 22,
    arrivedAt,
    suppliesUsed: 1,
    suppliesAfter: 6,
    fatigueGained: 1,
    fatigueAfter: 1,
    roadEvent: null,
  };
}

function passageResult(overrides: Partial<GoalPassageResult> = {}): GoalPassageResult {
  return {
    goalId: "oneonta_tanners_fever",
    destination: "Oneonta city",
    stoppedAt: "Colonie town",
    stopReason: "road_encounter",
    legs: [
      leg("queensbury_town", "Queensbury town", "saratoga_city", "Saratoga city", 502),
      leg("saratoga_city", "Saratoga city", "albany_city", "Albany city", 524),
      leg("albany_city", "Albany city", "colonie_town", "Colonie town", 546),
    ],
    baseMinutes: 66,
    delayMinutes: 0,
    minutes: 66,
    suppliesUsed: 3,
    suppliesAfter: 3,
    fatigueGained: 3,
    fatigueAfter: 3,
    travelConditionAfter: "ready",
    journeyDecision: { countsTowardJourney: true, reason: "movement" },
    ...overrides,
  };
}

describe("Goal Passage human UI", () => {
  it("builds its montage only from traversed legs and the returned stop reason", () => {
    const text = formatGoalPassageLog(passageResult());

    expect(text).toContain(
      "from Queensbury town, through Saratoga city, Albany city, to Colonie town",
    );
    expect(text).toContain("3 roads, 66 road min");
    expect(text).toContain("Supplies -3 to 3; fatigue +3 to 3 (ready)");
    expect(text).toContain("A road incident stops the passage for your decision.");
    expect(text).not.toContain("Oneonta city");
    expect(text).not.toContain("oneonta_tanners_fever");
    expect(text).not.toContain("road_");
  });

  it("names objective and resource-boundary halts without inventing route content", () => {
    expect(
      formatGoalPassageLog(
        passageResult({
          destination: "Colonie town",
          stopReason: "objective",
        }),
      ),
    ).toContain("You have reached the objective town.");
    expect(
      formatGoalPassageLog(
        passageResult({
          stopReason: "resource_boundary",
          delayMinutes: 6,
          minutes: 72,
        }),
      ),
    ).toContain("+6 min delay");
    expect(
      formatGoalPassageLog(
        passageResult({
          stopReason: "resource_boundary",
        }),
      ),
    ).toContain("before another road would worsen your travel condition");
  });

  it("builds a Night Watch action from the engine forecast and wires the engine-owned action", () => {
    const app = readFileSync("ui/src/App.tsx", "utf8");
    const screen = readFileSync("ui/src/OverworldPlayScreen.tsx", "utf8");
    const modelStart = app.indexOf("if (journey.goalPassage)");
    const modelEnd = app.indexOf("const dispatchActions", modelStart);
    expect(modelStart).toBeGreaterThanOrEqual(0);
    expect(modelEnd).toBeGreaterThan(modelStart);
    const model = app.slice(modelStart, modelEnd);

    expect(app).toContain("worldSession.followGoalPassage()");
    expect(app).toContain("formatGoalPassageLog(result)");
    expect(app).toContain("setQuestSession(null)");
    expect(app).toContain("setQuestView(null)");
    expect(app).toContain("setActiveQuest(null)");
    expect(model).toContain("id: `goal:${passage.id}`");
    expect(model).toContain('group: "Goal passage"');
    expect(model).toContain('buttonLabel: "Follow goal"');
    expect(model).toContain("onChoose: followGoalPassage");
    for (const field of [
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
    ]) {
      expect(model).toContain(`passage.${field}`);
    }
    expect(app).toContain("sections={worldActionSections}");
    expect(screen).toContain("section.actions.map((action)");
    expect(screen).toContain("action.disabledReason !== undefined");
    expect(screen).toContain("disabled={disabled}");
  });

  it("keeps manual roads but never reads raw manifest events into road cards", () => {
    const app = readFileSync("ui/src/App.tsx", "utf8");

    expect(app).toContain("worldView.exits.map((exit)");
    expect(app).toContain("onChoose: () => travel(exit.id)");
    expect(app).toContain("worldView.pendingRoadEncounter.event.title");
    expect(app).not.toContain("OVERWORLD.road_events");
  });
});
