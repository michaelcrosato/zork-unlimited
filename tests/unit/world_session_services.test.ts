import { describe, expect, it } from "vitest";
import type { CampaignServiceRule } from "../../src/world/campaign_service_rules.js";
import type { OverworldActionJournalState } from "../../src/world/session_action_recording.js";
import {
  applyOverworldServicePlan,
  canRestAtOverworldTown,
  canResupplyAtOverworldTown,
  planOverworldTownRest,
  planOverworldTownResupply,
} from "../../src/world/session_services.js";
import { OVERWORLD_MAX_SUPPLIES } from "../../src/world/travel_mechanics.js";

function actionJournalState(minutes = 480): OverworldActionJournalState {
  return {
    minutes,
    journalEntries: [],
    journalEntriesById: new Map(),
  };
}

function campaignServiceRule(
  action: CampaignServiceRule["action"],
  overrides: Partial<CampaignServiceRule> = {},
): CampaignServiceRule {
  return {
    id: `service:test_${action}`,
    home: "albany_city",
    area: "albany_city__transport_hub",
    action,
    title: action === "rest" ? "Relief-room rest" : "Relief-store resupply",
    summary:
      action === "rest"
        ? "An unused relief room is ready beside the dispatch desk."
        : "The dispatch stores have enough road gear for one traveler.",
    minutes: action === "rest" ? 30 : 15,
    requires_all_world_facts: ["fact:wolf_winter_repair_timber_available"],
    ...overrides,
  };
}

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

  it("prefers an active one-time rule and can enable a service without normal tags", () => {
    const rest = planOverworldTownRest({
      townName: "Albany city",
      services: [],
      activeCampaignServiceRules: [campaignServiceRule("rest")],
      supplies: 2,
      fatigue: 40,
    });
    expect(rest).toEqual({
      action: "rest",
      minutes: 30,
      changed: true,
      suppliesBefore: 2,
      suppliesAfter: 2,
      fatigueBefore: 40,
      fatigueAfter: 0,
      message:
        "An unused relief room is ready beside the dispatch desk. The service takes 30 minutes; fatigue falls from 40 to 0.",
      entryDraft: {
        id: "service:rest",
        kind: "service",
        town: "Albany city",
        title: "Relief-room rest",
        text: "An unused relief room is ready beside the dispatch desk. The service takes 30 minutes; fatigue falls from 40 to 0.",
        serviceRuleId: "service:test_rest",
        serviceAreaId: "albany_city__transport_hub",
      },
    });

    const resupply = planOverworldTownResupply({
      townName: "Albany city",
      services: ["market"],
      activeCampaignServiceRules: [campaignServiceRule("resupply")],
      supplies: 1,
      fatigue: 7,
    });
    expect(resupply).toMatchObject({
      action: "resupply",
      minutes: 15,
      changed: true,
      suppliesAfter: OVERWORLD_MAX_SUPPLIES,
      entryDraft: {
        title: "Relief-store resupply",
        serviceRuleId: "service:test_resupply",
        serviceAreaId: "albany_city__transport_hub",
      },
    });
    expect(resupply.message).toContain("The service takes 15 minutes");
  });

  it("rejects overlapping internal rules instead of choosing by manifest order", () => {
    expect(() =>
      planOverworldTownRest({
        townName: "Albany city",
        services: ["inn"],
        activeCampaignServiceRules: [
          campaignServiceRule("rest", { id: "service:first_rest" }),
          campaignServiceRule("rest", { id: "service:second_rest" }),
        ],
        supplies: 2,
        fatigue: 20,
      }),
    ).toThrow(/multiple active.*rest/i);
  });

  it("applies unchanged service plans without recording journal entries", () => {
    const state = actionJournalState();
    const plan = planOverworldTownRest({
      townName: "Alden",
      services: ["inn"],
      supplies: 3,
      fatigue: 0,
    });

    expect(applyOverworldServicePlan(state, plan)).toEqual({
      action: "rest",
      minutes: 0,
      changed: false,
      suppliesBefore: 3,
      suppliesAfter: 3,
      fatigueBefore: 0,
      fatigueAfter: 0,
      message: "You are already rested.",
      entry: null,
      minutesAfter: 480,
      stateChanged: false,
    });
    expect(state.journalEntries).toEqual([]);
    expect(state.journalEntriesById.size).toBe(0);
  });

  it("applies changed service plans as repeatable timestamped journal entries", () => {
    const state = actionJournalState();
    const plan = planOverworldTownResupply({
      townName: "Alden",
      services: ["stable"],
      supplies: 2,
      fatigue: 7,
    });

    const result = applyOverworldServicePlan(state, plan);

    expect(result).toMatchObject({
      action: "resupply",
      minutes: 45,
      changed: true,
      suppliesBefore: 2,
      suppliesAfter: OVERWORLD_MAX_SUPPLIES,
      fatigueBefore: 7,
      fatigueAfter: 7,
      message: `You spend 45 minutes buying food, lamp oil, and road gear. Supplies rise from 2 to ${OVERWORLD_MAX_SUPPLIES}.`,
      minutesAfter: 525,
      stateChanged: true,
    });
    expect(result.entry).toMatchObject({
      id: "service:resupply:525",
      kind: "service",
      town: "Alden",
      title: "Resupplied in Alden",
      recordedAt: "Day 1, 08:45",
      text: `You spend 45 minutes buying food, lamp oil, and road gear. Supplies rise from 2 to ${OVERWORLD_MAX_SUPPLIES}.`,
    });
    expect(state.journalEntries).toEqual([result.entry]);
    expect(state.journalEntriesById.get("service:resupply:525")).toBe(result.entry);
  });
});
