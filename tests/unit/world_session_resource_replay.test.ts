import { describe, expect, it } from "vitest";
import {
  buildCampaignCharacterState,
  createInitialCampaignCharacterState,
} from "../../src/world/campaign_character_state.js";
import { campaignStoryChoiceRefKey } from "../../src/world/campaign_story_choices.js";
import { createInitialJourneyContractSnapshot } from "../../src/world/journey_contract.js";
import type {
  OverworldCampaignServiceRule,
  OverworldEdge,
  OverworldRoadEvent,
} from "../../src/world/overworld.js";
import {
  assertSnapshotResourceReplay,
  recordRoadJournalResolution,
  recordServiceJournalReplay,
  roadJournalResolutionIndex,
  type OverworldRoadJournalResolutionEntry,
  type OverworldServiceJournalReplayEntry,
  type OverworldCampaignBoundaryReplayIndex,
} from "../../src/world/session_resource_replay.js";
import {
  campaignServiceJournalCopy,
  campaignServiceJourneyActionId,
} from "../../src/world/session_services.js";
import {
  OVERWORLD_SESSION_SAVE_VERSION,
  type OverworldJournalEntry,
  type OverworldSessionSnapshot,
  type TravelLogEntrySnapshot,
} from "../../src/world/session_snapshot.js";
import { snapshotTravelTimelineIndex } from "../../src/world/session_snapshot_timeline.js";

function edge(overrides: Partial<OverworldEdge> = {}): OverworldEdge {
  return {
    id: "road:a-b",
    from: "town_a",
    to: "town_b",
    route: "Test Road",
    road_class: "state_route",
    distance_mi: 10,
    travel_minutes: 60,
    ...overrides,
  };
}

function roadEvent(overrides: Partial<OverworldRoadEvent> = {}): OverworldRoadEvent {
  return {
    id: "road_event:a-b",
    edge: "road:a-b",
    title: "Blocked road",
    risk: "medium",
    summary: "A test road event.",
    requires_choice: true,
    responses: {
      cautious_scout: {
        label: "Scout the road problem",
        outcome:
          "You slow down, read the situation, and leave a useful warning for the next traveler.",
      },
      assist_travelers: {
        label: "Help resolve it",
        outcome:
          "You spend supplies and effort stabilizing the road trouble instead of merely passing it.",
      },
      press_on: {
        label: "Press on",
        outcome:
          "You keep moving and accept the extra strain rather than spending daylight on the encounter.",
      },
    },
    ...overrides,
  };
}

function ambientRoadEvent(overrides: Partial<OverworldRoadEvent> = {}): OverworldRoadEvent {
  return {
    id: "ambient:a-b",
    edge: "road:a-b",
    title: "Routine road report",
    risk: "medium",
    summary: "Rain makes the road slow but passable.",
    ...overrides,
  };
}

function travelEntry(overrides: Partial<TravelLogEntrySnapshot> = {}): TravelLogEntrySnapshot {
  return {
    edgeId: "road:a-b",
    fromId: "town_a",
    toId: "town_b",
    delayMinutes: 0,
    minutes: 60,
    arrivedAt: 540,
    suppliesUsed: 1,
    suppliesAfter: 5,
    fatigueGained: 2,
    fatigueAfter: 2,
    ...overrides,
  };
}

function journalEntry(
  kind: OverworldJournalEntry["kind"],
  id: string,
  recordedAt = "Day 1, 08:00",
): OverworldJournalEntry {
  return {
    id,
    kind,
    town: "Town",
    title: "Title",
    text: "Text",
    recordedAt,
  };
}

function snapshot(
  travelLog: TravelLogEntrySnapshot[],
  overrides: Partial<OverworldSessionSnapshot> = {},
): OverworldSessionSnapshot {
  return {
    version: OVERWORLD_SESSION_SAVE_VERSION,
    worldId: "new_york_overworld",
    worldHash: "a".repeat(64),
    character: createInitialCampaignCharacterState(),
    currentId: "town_b",
    currentAreaId: null,
    minutes: 540,
    supplies: 5,
    fatigue: 2,
    discoveredIds: ["town_a", "town_b"],
    visitedIds: ["town_a", "town_b"],
    currentAreaByTown: [],
    travelLog,
    journalEntries: [],
    resolvedEventIds: [],
    discoveredAreaIds: [],
    visitedAreaIds: [],
    discoveredJobIds: [],
    completedJobIds: [],
    discoveredSiteIds: [],
    discoveredQuestIds: [],
    startedQuestIds: [],
    completedQuestIds: [],
    questOutcomes: [],
    exploredSiteIds: [],
    regionRenown: [],
    completedRegionalArcIds: [],
    pendingRoadEncounter: null,
    journey: createInitialJourneyContractSnapshot(),
    ...overrides,
  };
}

function timeline(snapshotValue: OverworldSessionSnapshot) {
  return snapshotTravelTimelineIndex(snapshotValue, (townId) => townId, "town_a");
}

function campaignServiceRule(
  overrides: Partial<OverworldCampaignServiceRule> = {},
): OverworldCampaignServiceRule {
  return {
    id: "service_rule:test_rest",
    home: "town_b",
    area: "area_b",
    action: "rest",
    title: "A private recovery room",
    summary: "A trusted contact clears a private room for you.",
    minutes: 120,
    requires_all_world_facts: ["fact:trusted_contact"],
    ...overrides,
  };
}

const SERVICE_DECISION_ORDINAL = 7;
const SERVICE_DECISION_HASH = "b".repeat(64);

function proofBoundServiceEntry(
  rule: OverworldCampaignServiceRule,
  recordedAt: number,
  overrides: Partial<OverworldJournalEntry> = {},
): OverworldJournalEntry {
  const copy = campaignServiceJournalCopy(rule, { supplies: 5, fatigue: 2 });
  return {
    ...journalEntry(
      "service",
      `service:${rule.action}:${recordedAt}`,
      `Day 1, ${String(Math.floor(recordedAt / 60)).padStart(2, "0")}:${String(recordedAt % 60).padStart(2, "0")}`,
    ),
    ...copy,
    serviceRuleId: rule.id,
    serviceAreaId: rule.area,
    serviceBoundary: {
      acceptedDecisions: SERVICE_DECISION_ORDINAL,
      decisionProofHash: SERVICE_DECISION_HASH,
      townId: rule.home,
      areaId: rule.area,
      minutes: recordedAt,
    },
    ...overrides,
  };
}

function campaignBoundaryIndex(
  rule: OverworldCampaignServiceRule,
  worldFactProofOrdinalById: ReadonlyMap<string, number | null>,
  includeSecondUse = false,
  storyChoiceProofOrdinalByKey: ReadonlyMap<string, number> = new Map(),
): OverworldCampaignBoundaryReplayIndex {
  const byAcceptedDecisions = new Map([
    [
      SERVICE_DECISION_ORDINAL,
      {
        decision: {
          number: SERVICE_DECISION_ORDINAL,
          surface: "overworld" as const,
          actionId: campaignServiceJourneyActionId(rule.id, rule.action),
          reason: "preparation" as const,
        },
        decisionProofHash: SERVICE_DECISION_HASH,
        townId: rule.home,
        areaId: rule.area,
      },
    ],
  ]);
  if (includeSecondUse) {
    byAcceptedDecisions.set(SERVICE_DECISION_ORDINAL + 1, {
      decision: {
        number: SERVICE_DECISION_ORDINAL + 1,
        surface: "overworld",
        actionId: campaignServiceJourneyActionId(rule.id, rule.action),
        reason: "preparation",
      },
      decisionProofHash: "c".repeat(64),
      townId: rule.home,
      areaId: rule.area,
    });
  }
  return {
    byAcceptedDecisions,
    worldFactProofOrdinalById,
    storyChoiceProofOrdinalByKey,
  };
}

function sources(
  roadEvents: readonly OverworldRoadEvent[] = [],
  campaignServiceRules: readonly OverworldCampaignServiceRule[] = [],
) {
  return {
    areaHomes: new Map([["area_b", "town_b"]]),
    campaignServiceRulesById: new Map(campaignServiceRules.map((rule) => [rule.id, rule])),
    edgesById: new Map([["road:a-b", edge()]]),
    roadEventsByEdgeId: new Map(roadEvents.map((event) => [event.edge, event])),
    townNameForSource: () => "Town",
  };
}

describe("overworld snapshot resource replay", () => {
  it("accepts a coherent travel-only resource replay", () => {
    const snapshotValue = snapshot([travelEntry()]);
    const travelTimeline = timeline(snapshotValue);
    const roadJournal = roadJournalResolutionIndex(
      sources(),
      { roadJournalEntries: [] },
      travelTimeline,
      null,
    );

    expect(() =>
      assertSnapshotResourceReplay(
        snapshotValue,
        sources(),
        travelTimeline,
        roadJournal,
        { entries: [] },
        { entries: [] },
      ),
    ).not.toThrow();
  });

  it("rejects forged travel resource transitions", () => {
    const snapshotValue = snapshot(
      [
        travelEntry({
          suppliesAfter: 4,
        }),
      ],
      {
        supplies: 4,
      },
    );
    const travelTimeline = timeline(snapshotValue);
    const roadJournal = roadJournalResolutionIndex(
      sources(),
      { roadJournalEntries: [] },
      travelTimeline,
      null,
    );

    expect(() =>
      assertSnapshotResourceReplay(
        snapshotValue,
        sources(),
        travelTimeline,
        roadJournal,
        { entries: [] },
        { entries: [] },
      ),
    ).toThrow(/supplies after.*resource replay/);
  });

  it("requires choice-event travel to have a road journal resolution unless still pending", () => {
    const snapshotValue = snapshot([travelEntry({ fatigueGained: 3, fatigueAfter: 3 })], {
      fatigue: 3,
    });
    const travelTimeline = timeline(snapshotValue);
    const missingResolution = roadJournalResolutionIndex(
      sources([roadEvent()]),
      { roadJournalEntries: [] },
      travelTimeline,
      null,
    );
    const pendingResolution = roadJournalResolutionIndex(
      sources([roadEvent()]),
      { roadJournalEntries: [] },
      travelTimeline,
      { edgeId: "road:a-b" },
    );

    expect([...missingResolution.requiredKeys]).toEqual(["road:a-b@540"]);
    expect(() =>
      assertSnapshotResourceReplay(
        snapshotValue,
        sources([roadEvent()]),
        travelTimeline,
        missingResolution,
        { entries: [] },
        { entries: [] },
      ),
    ).toThrow(/missing a journal resolution/);
    expect([...pendingResolution.requiredKeys]).toEqual([]);
  });

  it("replays ambient road risk without requiring a road-choice journal", () => {
    const ambient = ambientRoadEvent();
    const snapshotValue = snapshot([travelEntry({ fatigueGained: 3, fatigueAfter: 3 })], {
      fatigue: 3,
    });
    const travelTimeline = timeline(snapshotValue);
    const roadJournal = roadJournalResolutionIndex(
      sources([ambient]),
      { roadJournalEntries: [] },
      travelTimeline,
      null,
    );

    expect([...roadJournal.requiredKeys]).toEqual([]);
    expect(() =>
      assertSnapshotResourceReplay(
        snapshotValue,
        sources([ambient]),
        travelTimeline,
        roadJournal,
        { entries: [] },
        { entries: [] },
      ),
    ).not.toThrow();
  });

  it("rejects road journals bound to ambient or explicitly suppressed travel", () => {
    const resolution: OverworldRoadJournalResolutionEntry = {
      entry: journalEntry("road", "road:road:a-b:540:press_on"),
      key: "road:a-b@540",
      parsed: {
        edgeId: "road:a-b",
        arrivedAt: 540,
        strategy: "press_on",
      },
      recordedAt: 540,
    };

    for (const [event, entry] of [
      [ambientRoadEvent(), travelEntry({ fatigueGained: 3, fatigueAfter: 3 })],
      [roadEvent(), travelEntry({ roadEventId: null })],
    ] as const) {
      const snapshotValue = snapshot([entry], {
        fatigue: entry.fatigueAfter,
      });
      expect(() =>
        roadJournalResolutionIndex(
          sources([event]),
          { roadJournalEntries: [resolution] },
          timeline(snapshotValue),
          null,
        ),
      ).toThrow(/not bound to a choice encounter/);
    }
  });

  it("rejects a one-shot choice event repeated anywhere in travel history", () => {
    const snapshotValue = snapshot(
      [
        travelEntry({
          fromId: "town_b",
          toId: "town_a",
          arrivedAt: 600,
          suppliesAfter: 4,
          fatigueGained: 3,
          fatigueAfter: 6,
        }),
        travelEntry({ fatigueGained: 3, fatigueAfter: 3 }),
      ],
      {
        currentId: "town_a",
        minutes: 600,
        supplies: 4,
        fatigue: 6,
      },
    );

    expect(() =>
      roadJournalResolutionIndex(
        sources([roadEvent()]),
        { roadJournalEntries: [] },
        timeline(snapshotValue),
        null,
      ),
    ).toThrow(/repeats one-shot road encounter/);
  });

  it("treats explicit null road event ids as suppressed plain travel", () => {
    const snapshotValue = snapshot([travelEntry({ roadEventId: null })]);
    const travelTimeline = timeline(snapshotValue);
    const roadJournal = roadJournalResolutionIndex(
      sources([roadEvent()]),
      { roadJournalEntries: [] },
      travelTimeline,
      null,
    );

    expect([...roadJournal.requiredKeys]).toEqual([]);
    expect(() =>
      assertSnapshotResourceReplay(
        snapshotValue,
        sources([roadEvent()]),
        travelTimeline,
        roadJournal,
        { entries: [] },
        { entries: [] },
      ),
    ).not.toThrow();
  });

  it("replays road encounter and rest service costs in chronological order", () => {
    const snapshotValue = snapshot([travelEntry({ fatigueGained: 3, fatigueAfter: 3 })], {
      minutes: 770,
      fatigue: 0,
    });
    const travelTimeline = timeline(snapshotValue);
    const roadResolution: OverworldRoadJournalResolutionEntry = {
      entry: journalEntry("road", "road:road:a-b:540:cautious_scout"),
      key: "road:a-b@540",
      parsed: {
        edgeId: "road:a-b",
        arrivedAt: 540,
        strategy: "cautious_scout",
      },
      recordedAt: 590,
    };
    const roadJournal = roadJournalResolutionIndex(
      sources([roadEvent()]),
      { roadJournalEntries: [roadResolution] },
      travelTimeline,
      null,
    );
    const serviceJournal = {
      entries: [
        {
          entry: journalEntry("service", "service:rest:770"),
          parsed: { action: "rest" as const, recordedAt: 770 },
          recordedAt: 770,
        },
      ],
    };

    expect(() =>
      assertSnapshotResourceReplay(
        snapshotValue,
        sources([roadEvent()]),
        travelTimeline,
        roadJournal,
        serviceJournal,
        { entries: [] },
      ),
    ).not.toThrow();
  });

  it("replays a proof-bound one-time service with its authored duration", () => {
    const rule = campaignServiceRule();
    const snapshotValue = snapshot([travelEntry()], {
      minutes: 660,
      fatigue: 0,
    });
    const travelTimeline = timeline(snapshotValue);
    const replaySources = sources([], [rule]);
    const roadJournal = roadJournalResolutionIndex(
      replaySources,
      { roadJournalEntries: [] },
      travelTimeline,
      null,
    );
    const serviceJournal = {
      entries: [
        {
          entry: {
            ...proofBoundServiceEntry(rule, 660),
          },
          parsed: { action: "rest" as const, recordedAt: 660 },
          recordedAt: 660,
        },
      ],
    };

    expect(() =>
      assertSnapshotResourceReplay(
        snapshotValue,
        replaySources,
        travelTimeline,
        roadJournal,
        serviceJournal,
        { entries: [] },
        campaignBoundaryIndex(rule, new Map([["fact:trusted_contact", 6]])),
      ),
    ).not.toThrow();
  });

  it("checks companion and promise predicates at the historical service boundary", () => {
    const rule = campaignServiceRule({
      requires_all_companions: ["npc:test_ally"],
      requires_all_promises: [{ promise_id: "promise:test_bond", status: "kept" }],
    });
    const beforeRemoval = buildCampaignCharacterState({
      companions: ["npc:test_ally"],
      promises: [
        {
          promiseId: "promise:test_bond",
          recipientId: "npc:test_ally",
          status: "kept",
        },
      ],
    });
    const afterRemoval = buildCampaignCharacterState({
      promises: [
        {
          promiseId: "promise:test_bond",
          recipientId: "npc:test_ally",
          status: "broken",
        },
      ],
    });
    const replayAt = (recordedAt: number) => {
      const snapshotValue = snapshot([travelEntry()], {
        minutes: recordedAt,
        fatigue: 0,
      });
      const replaySources = sources([], [rule]);
      const travelTimeline = timeline(snapshotValue);
      return () =>
        assertSnapshotResourceReplay(
          snapshotValue,
          replaySources,
          travelTimeline,
          roadJournalResolutionIndex(
            replaySources,
            { roadJournalEntries: [] },
            travelTimeline,
            null,
          ),
          {
            entries: [
              {
                entry: proofBoundServiceEntry(rule, recordedAt),
                parsed: { action: "rest", recordedAt },
                recordedAt,
              },
            ],
          },
          { entries: [] },
          campaignBoundaryIndex(rule, new Map([["fact:trusted_contact", 6]])),
          (_entry, serviceTime) => (serviceTime < 700 ? beforeRemoval : afterRemoval),
        );
    };

    expect(replayAt(660)).not.toThrow();
    expect(replayAt(720)).toThrow(/companion and promise conditions.*service boundary/i);
  });

  it("rejects forged campaign service identity, action, area, town, duration, and reuse", () => {
    const rule = campaignServiceRule();
    const makeReplay = (args: {
      entryOverrides?: Partial<OverworldJournalEntry>;
      id?: string;
      recordedAt?: number;
      rules?: readonly OverworldCampaignServiceRule[];
      secondUse?: boolean;
    }) => {
      const recordedAt = args.recordedAt ?? 660;
      const entry: OverworldJournalEntry = {
        ...proofBoundServiceEntry(rule, recordedAt),
        ...(args.id ? { id: args.id } : {}),
        ...args.entryOverrides,
      };
      const serviceEntries: OverworldServiceJournalReplayEntry[] = [
        {
          entry,
          parsed: {
            action: entry.id.includes(":resupply:") ? "resupply" : "rest",
            recordedAt,
          },
          recordedAt,
        },
      ];
      if (args.secondUse) {
        serviceEntries.push({
          entry: {
            ...entry,
            id: "service:rest:780",
            recordedAt: "Day 1, 13:00",
            serviceBoundary: {
              ...entry.serviceBoundary!,
              acceptedDecisions: SERVICE_DECISION_ORDINAL + 1,
              decisionProofHash: "c".repeat(64),
              minutes: 780,
            },
          },
          parsed: { action: "rest", recordedAt: 780 },
          recordedAt: 780,
        });
      }
      const snapshotValue = snapshot([travelEntry()], {
        minutes: args.secondUse ? 780 : recordedAt,
        fatigue: 0,
      });
      const replaySources = sources([], args.rules ?? [rule]);
      const travelTimeline = timeline(snapshotValue);
      return () =>
        assertSnapshotResourceReplay(
          snapshotValue,
          replaySources,
          travelTimeline,
          roadJournalResolutionIndex(
            replaySources,
            { roadJournalEntries: [] },
            travelTimeline,
            null,
          ),
          { entries: serviceEntries },
          { entries: [] },
          campaignBoundaryIndex(rule, new Map([["fact:trusted_contact", 6]]), args.secondUse),
        );
    };

    expect(makeReplay({ rules: [] })).toThrow(/unknown campaign service rule/i);
    expect(makeReplay({ id: "service:resupply:660" })).toThrow(/action does not match/i);
    expect(makeReplay({ entryOverrides: { serviceAreaId: "area_elsewhere" } })).toThrow(
      /area does not match/i,
    );
    expect(makeReplay({ entryOverrides: { town: "Elsewhere" } })).toThrow(/bound to town/i);
    expect(makeReplay({ entryOverrides: { title: "Relabeled quick service" } })).toThrow(
      /canonical authored copy/i,
    );
    expect(makeReplay({ entryOverrides: { text: "Relabeled service consequence." } })).toThrow(
      /canonical authored copy/i,
    );
    expect(makeReplay({ recordedAt: 650 })).toThrow(/before enough clock time elapsed/i);
    expect(makeReplay({ secondUse: true })).toThrow(/used more than once/i);
  });

  it("checks required and forbidden facts at the service timestamp, not final state", () => {
    const rule = campaignServiceRule({
      forbids_any_world_facts: ["fact:contact_betrayed"],
    });
    const snapshotValue = snapshot([travelEntry()], { minutes: 660, fatigue: 0 });
    const replaySources = sources([], [rule]);
    const travelTimeline = timeline(snapshotValue);
    const roadJournal = roadJournalResolutionIndex(
      replaySources,
      { roadJournalEntries: [] },
      travelTimeline,
      null,
    );
    const serviceJournal = {
      entries: [
        {
          entry: proofBoundServiceEntry(rule, 660),
          parsed: { action: "rest" as const, recordedAt: 660 },
          recordedAt: 660,
        },
      ],
    };
    const replay = (proofs: ReadonlyMap<string, number | null>) =>
      assertSnapshotResourceReplay(
        snapshotValue,
        replaySources,
        travelTimeline,
        roadJournal,
        serviceJournal,
        { entries: [] },
        campaignBoundaryIndex(rule, proofs),
      );

    expect(() =>
      replay(
        new Map([
          ["fact:trusted_contact", 8],
          ["fact:contact_betrayed", 9],
        ]),
      ),
    ).toThrow(/lacks required world fact/i);
    expect(() =>
      replay(
        new Map([
          ["fact:trusted_contact", 6],
          ["fact:contact_betrayed", 6],
        ]),
      ),
    ).toThrow(/does not precede forbidden world fact/i);
    expect(() =>
      replay(
        new Map([
          ["fact:trusted_contact", 6],
          ["fact:contact_betrayed", SERVICE_DECISION_ORDINAL],
        ]),
      ),
    ).not.toThrow();
    expect(() =>
      replay(
        new Map([
          ["fact:trusted_contact", 6],
          ["fact:contact_betrayed", 8],
        ]),
      ),
    ).not.toThrow();
  });

  it("checks required and forbidden story choices before the service decision", () => {
    const requiredRef = {
      story_choice_id: "albany_dawn_dispatch",
      choice_id: "send_wagon_to_cade",
    } as const;
    const forbiddenRef = {
      story_choice_id: "albany_dawn_dispatch",
      choice_id: "send_wardens_north",
    } as const;
    const rule = campaignServiceRule({
      requires_all_world_facts: undefined,
      requires_all_story_choices: [requiredRef],
      forbids_any_story_choices: [forbiddenRef],
    });
    const snapshotValue = snapshot([travelEntry()], { minutes: 660, fatigue: 0 });
    const replaySources = sources([], [rule]);
    const travelTimeline = timeline(snapshotValue);
    const roadJournal = roadJournalResolutionIndex(
      replaySources,
      { roadJournalEntries: [] },
      travelTimeline,
      null,
    );
    const serviceJournal = {
      entries: [
        {
          entry: proofBoundServiceEntry(rule, 660),
          parsed: { action: "rest" as const, recordedAt: 660 },
          recordedAt: 660,
        },
      ],
    };
    const replay = (proofs: ReadonlyMap<string, number>) =>
      assertSnapshotResourceReplay(
        snapshotValue,
        replaySources,
        travelTimeline,
        roadJournal,
        serviceJournal,
        { entries: [] },
        campaignBoundaryIndex(rule, new Map(), false, proofs),
      );
    const requiredKey = campaignStoryChoiceRefKey(requiredRef);
    const forbiddenKey = campaignStoryChoiceRefKey(forbiddenRef);

    expect(() => replay(new Map())).toThrow(/lacks required story choice/i);
    expect(() => replay(new Map([[requiredKey, SERVICE_DECISION_ORDINAL]]))).toThrow(
      /lacks required story choice/i,
    );
    expect(() =>
      replay(
        new Map([
          [requiredKey, SERVICE_DECISION_ORDINAL - 1],
          [forbiddenKey, SERVICE_DECISION_ORDINAL - 1],
        ]),
      ),
    ).toThrow(/does not precede forbidden story choice/i);
    expect(() =>
      replay(
        new Map([
          [requiredKey, SERVICE_DECISION_ORDINAL - 1],
          [forbiddenKey, SERVICE_DECISION_ORDINAL],
        ]),
      ),
    ).not.toThrow();
    expect(() => replay(new Map([[requiredKey, SERVICE_DECISION_ORDINAL - 1]]))).not.toThrow();
  });

  it("rejects quest completion journals recorded before enough time elapsed", () => {
    const forgedEarlyCompletion = snapshot([], {
      minutes: 540,
      supplies: 6,
      fatigue: 0,
    });
    const travelTimeline = timeline(forgedEarlyCompletion);
    const roadJournal = roadJournalResolutionIndex(
      sources(),
      { roadJournalEntries: [] },
      travelTimeline,
      null,
    );
    const localActionJournal = {
      entries: [
        {
          entry: journalEntry("quest_done", "quest_done:quest_a", "Day 1, 09:00"),
          recordedAt: 540,
          duration: 140,
        },
      ],
    };

    expect(() =>
      assertSnapshotResourceReplay(
        forgedEarlyCompletion,
        sources(),
        travelTimeline,
        roadJournal,
        { entries: [] },
        localActionJournal,
      ),
    ).toThrow(/quest_done.*before enough clock time elapsed/);
  });

  it("records road and service replay entries from journal rows", () => {
    const roadEntries: OverworldRoadJournalResolutionEntry[] = [];
    const serviceEntries: OverworldServiceJournalReplayEntry[] = [];

    recordRoadJournalResolution(
      roadEntries,
      journalEntry("road", "road:road:a-b:540:press_on"),
      550,
    );
    recordServiceJournalReplay(
      serviceEntries,
      journalEntry("service", "service:resupply:600"),
      600,
    );

    expect(roadEntries[0]?.key).toBe("road:a-b@540");
    expect(roadEntries[0]?.parsed.strategy).toBe("press_on");
    expect(serviceEntries[0]?.parsed).toEqual({ action: "resupply", recordedAt: 600 });
  });
});
