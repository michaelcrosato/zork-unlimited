import { describe, expect, it } from "vitest";
import {
  canRestAtOverworldTown,
  canResupplyAtOverworldTown,
  planOverworldTownRest,
  planOverworldTownResupply,
} from "../../src/world/session_services.js";
import { OVERWORLD_MAX_SUPPLIES } from "../../src/world/travel_mechanics.js";

describe("overworld town service planning", () => {
  it("checks rest and resupply availability from town service tags", () => {
    expect(canRestAtOverworldTown(["inn"])).toBe(true);
    expect(canRestAtOverworldTown(["healer"])).toBe(true);
    expect(canRestAtOverworldTown(["market", "stable"])).toBe(false);

    expect(canResupplyAtOverworldTown(["market"])).toBe(true);
    expect(canResupplyAtOverworldTown(["inn"])).toBe(true);
    expect(canResupplyAtOverworldTown(["stable"])).toBe(true);
    expect(canResupplyAtOverworldTown(["healer"])).toBe(false);
  });

  it("plans rest without mutating session state", () => {
    expect(() =>
      planOverworldTownRest({
        townName: "Alden",
        services: ["market"],
        supplies: 3,
        fatigue: 20,
      }),
    ).toThrow(/no inn or healer/);

    expect(
      planOverworldTownRest({
        townName: "Alden",
        services: ["inn"],
        supplies: 3,
        fatigue: 0,
      }),
    ).toEqual({
      action: "rest",
      minutes: 0,
      changed: false,
      suppliesBefore: 3,
      suppliesAfter: 3,
      fatigueBefore: 0,
      fatigueAfter: 0,
      message: "You are already rested.",
      entryDraft: null,
    });

    expect(
      planOverworldTownRest({
        townName: "Alden",
        services: ["healer"],
        supplies: 2,
        fatigue: 81,
      }),
    ).toEqual({
      action: "rest",
      minutes: 300,
      changed: true,
      suppliesBefore: 2,
      suppliesAfter: 2,
      fatigueBefore: 81,
      fatigueAfter: 0,
      message:
        "You spend 300 minutes recovering at a safe local service. Fatigue falls from 81 to 0.",
      entryDraft: {
        id: "service:rest",
        kind: "service",
        town: "Alden",
        title: "Rested in Alden",
        text: "You spend 300 minutes recovering at a safe local service. Fatigue falls from 81 to 0.",
      },
    });
  });

  it("plans resupply without mutating session state", () => {
    expect(() =>
      planOverworldTownResupply({
        townName: "Alden",
        services: ["healer"],
        supplies: 3,
        fatigue: 20,
      }),
    ).toThrow(/no market, inn, or stable/);

    expect(
      planOverworldTownResupply({
        townName: "Alden",
        services: ["market"],
        supplies: OVERWORLD_MAX_SUPPLIES,
        fatigue: 7,
      }),
    ).toEqual({
      action: "resupply",
      minutes: 0,
      changed: false,
      suppliesBefore: OVERWORLD_MAX_SUPPLIES,
      suppliesAfter: OVERWORLD_MAX_SUPPLIES,
      fatigueBefore: 7,
      fatigueAfter: 7,
      message: "Your supplies are already full.",
      entryDraft: null,
    });

    expect(
      planOverworldTownResupply({
        townName: "Alden",
        services: ["stable"],
        supplies: 2,
        fatigue: 7,
      }),
    ).toEqual({
      action: "resupply",
      minutes: 45,
      changed: true,
      suppliesBefore: 2,
      suppliesAfter: OVERWORLD_MAX_SUPPLIES,
      fatigueBefore: 7,
      fatigueAfter: 7,
      message: `You spend 45 minutes buying food, lamp oil, and road gear. Supplies rise from 2 to ${OVERWORLD_MAX_SUPPLIES}.`,
      entryDraft: {
        id: "service:resupply",
        kind: "service",
        town: "Alden",
        title: "Resupplied in Alden",
        text: `You spend 45 minutes buying food, lamp oil, and road gear. Supplies rise from 2 to ${OVERWORLD_MAX_SUPPLIES}.`,
      },
    });
  });
});
