import { describe, expect, it } from "vitest";
import type { OverworldRoadEvent } from "../../src/world/overworld.js";
import {
  OVERWORLD_MAX_FATIGUE,
  OVERWORLD_MAX_SUPPLIES,
  OVERWORLD_STARTING_MINUTES,
  OVERWORLD_STARTING_SUPPLIES,
  isOverworldRoadEncounterStrategy,
  roadEncounterOptionFor,
  roadEncounterOptionsFor,
  resolveOverworldTravelLeg,
  travelCondition,
  travelDelayMinutes,
  travelFatigueGain,
  travelSupplyCost,
} from "../../src/world/travel_mechanics.js";

const highRiskRoadEvent: OverworldRoadEvent = {
  id: "washed_bridge",
  edge: "road:albany:colonie",
  title: "Washed Bridge",
  risk: "high",
  summary: "Floodwater has damaged the bridge approach.",
};

describe("overworld travel mechanics", () => {
  it("exposes stable starting resource caps for session snapshots", () => {
    expect(OVERWORLD_MAX_SUPPLIES).toBe(8);
    expect(OVERWORLD_STARTING_SUPPLIES).toBe(6);
    expect(OVERWORLD_MAX_FATIGUE).toBe(100);
    expect(OVERWORLD_STARTING_MINUTES).toBe(480);
  });

  it("calculates travel supply, fatigue, and delay curves", () => {
    expect(travelSupplyCost(60)).toBe(1);
    expect(travelSupplyCost(180)).toBe(1);
    expect(travelSupplyCost(181)).toBe(2);

    expect(travelFatigueGain(90, null)).toBe(2);
    expect(travelFatigueGain(90, { ...highRiskRoadEvent, risk: "medium" })).toBe(3);
    expect(travelFatigueGain(90, highRiskRoadEvent)).toBe(5);

    expect(travelDelayMinutes(100, 0, 0)).toBe(0);
    expect(travelDelayMinutes(100, 25, 0)).toBe(10);
    expect(travelDelayMinutes(100, 50, 0)).toBe(20);
    expect(travelDelayMinutes(100, 80, 0)).toBe(35);
    expect(travelDelayMinutes(100, 0, 2)).toBe(60);
  });

  it("resolves a single travel leg through the shared resource transition", () => {
    expect(resolveOverworldTravelLeg(60, null, { supplies: 6, fatigue: 0 })).toEqual({
      baseMinutes: 60,
      delayMinutes: 0,
      elapsedMinutes: 60,
      suppliesNeeded: 1,
      suppliesUsed: 1,
      supplyDeficit: 0,
      suppliesAfter: 5,
      fatigueGained: 2,
      fatigueAfter: 2,
      travelConditionAfter: "ready",
    });

    expect(resolveOverworldTravelLeg(240, highRiskRoadEvent, { supplies: 1, fatigue: 99 })).toEqual(
      {
        baseMinutes: 240,
        delayMinutes: 114,
        elapsedMinutes: 354,
        suppliesNeeded: 2,
        suppliesUsed: 1,
        supplyDeficit: 1,
        suppliesAfter: 0,
        fatigueGained: 13,
        fatigueAfter: OVERWORLD_MAX_FATIGUE,
        travelConditionAfter: "exhausted and out of supplies",
      },
    );
  });

  it("labels travel condition from fatigue and supplies", () => {
    expect(travelCondition(0, 6)).toBe("ready");
    expect(travelCondition(25, 6)).toBe("tired");
    expect(travelCondition(0, 0)).toBe("out of supplies");
    expect(travelCondition(50, 6)).toBe("worn down");
    expect(travelCondition(50, 0)).toBe("worn down and out of supplies");
    expect(travelCondition(80, 6)).toBe("exhausted");
    expect(travelCondition(80, 0)).toBe("exhausted and out of supplies");
  });

  it("builds deterministic road encounter options by strategy", () => {
    expect(isOverworldRoadEncounterStrategy("assist_travelers")).toBe(true);
    expect(isOverworldRoadEncounterStrategy("wait_here")).toBe(false);

    const options = roadEncounterOptionsFor(highRiskRoadEvent);
    expect(options.map((option) => option.strategy)).toEqual([
      "cautious_scout",
      "assist_travelers",
      "press_on",
    ]);

    expect(roadEncounterOptionFor(highRiskRoadEvent, "assist_travelers")).toMatchObject({
      minutes: 70,
      suppliesCost: 2,
      fatigueGained: 3,
      renownGained: 4,
    });
  });
});
