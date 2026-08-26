import { describe, expect, it } from "vitest";

import {
  explainJourneyOpportunity,
  type JourneyOpportunityExplanationState,
} from "../../src/world/journey_opportunity_explainer.js";

const EVENT_ID = "fixture:event";
const JOB_ID = "fixture:job";
const HOME = "fixture:town";
const HERE = "fixture:harbor";
const MAPPED = "fixture:works";

const eventScene = {
  version: 1 as const,
  id: "fixture:event_scene",
  prompt: "Private authored event prompt.",
  required_poi_id: "fixture:signal",
  required_contact_id: "fixture:keeper",
  options: [
    {
      id: "fixture:shield",
      title: "Shield the signal",
      preview: "Private preview.",
      consequence: "Private consequence.",
      terms: { minutes: 30, renown: 2 },
    },
  ],
};

const jobScene = {
  version: 1 as const,
  id: "fixture:job_scene",
  prompt: "Private authored job prompt.",
  required_poi_id: "fixture:crane",
  required_contact_id: "fixture:rigger",
  requires_completed_quests: ["fixture:quest"],
  options: [
    {
      id: "fixture:brace",
      title: "Brace the crane",
      preview: "Private job preview.",
      consequence: "Private job consequence.",
      terms: { minutes: 60, renown: 4 },
    },
  ],
};

function state(
  overrides: Partial<JourneyOpportunityExplanationState> = {},
): JourneyOpportunityExplanationState {
  return {
    opportunities: {
      guidance: "Synthetic pursuit guidance.",
      leads: [
        { id: EVENT_ID, kind: "event", title: "Harbor signal", area: "Harbor", access: "here" },
        { id: JOB_ID, kind: "job", title: "Harbor crane", area: "Works", access: "mapped" },
      ],
    },
    currentTownId: HOME,
    currentAreaId: HERE,
    areasById: new Map([
      [HERE, { id: HERE, name: "Harbor" }],
      [MAPPED, { id: MAPPED, name: "Works" }],
    ]),
    areaExitsByArea: new Map([
      [HERE, [{ id: "fixture:harbor_works", destination: { id: MAPPED, name: "Works" } }]],
    ]),
    discoveredAreaIds: new Set([HERE, MAPPED]),
    visitedAreaIds: new Set([HERE]),
    eventsById: new Map([
      [
        EVENT_ID,
        {
          id: EVENT_ID,
          home: HOME,
          area: HERE,
          title: "Harbor signal",
          authored_scene: eventScene,
        },
      ],
    ]),
    jobsById: new Map([
      [
        JOB_ID,
        {
          id: JOB_ID,
          home: HOME,
          area: MAPPED,
          title: "Harbor crane",
          authored_scene: jobScene,
        },
      ],
    ]),
    journalEntryIds: new Set(),
    eventChoices: [],
    jobChoices: [],
    nextRoadToward: () => ({
      roadId: "fixture:road",
      destinationId: HOME,
      destinationName: "Fixture Town",
    }),
    currentAreaDiscoveryAction: () => ({
      tool: "explore_overworld_session_area",
      arguments: { area_id: HERE },
      command: `explore ${HERE}`,
      label: "Explore Harbor to advance local discovery.",
    }),
    ...overrides,
  };
}

describe("generic journey opportunity explainer", () => {
  it("walks an event through only exact currently lawful setup and action ids", () => {
    expect(explainJourneyOpportunity(state(), { kind: "event", id: EVENT_ID }).nextAction).toEqual({
      tool: "scout_overworld_session_poi",
      arguments: { poi_id: "fixture:signal" },
      command: "scout fixture:signal",
      label: "Scout the required point of interest.",
    });
    expect(
      explainJourneyOpportunity(state({ journalEntryIds: new Set(["scout:fixture:signal"]) }), {
        kind: "event",
        id: EVENT_ID,
      }).nextAction,
    ).toMatchObject({
      tool: "talk_overworld_session_contact",
      arguments: { character_id: "fixture:keeper" },
    });
    expect(
      explainJourneyOpportunity(
        state({
          journalEntryIds: new Set(["scout:fixture:signal", "talk:fixture:keeper@first"]),
        }),
        { kind: "event", id: EVENT_ID },
      ).nextAction,
    ).toMatchObject({
      tool: "investigate_overworld_session_event",
      arguments: { event_id: EVENT_ID },
    });
    const resolve = explainJourneyOpportunity(
      state({
        journalEntryIds: new Set([
          "scout:fixture:signal",
          "talk:fixture:keeper",
          `investigate:${EVENT_ID}`,
        ]),
        eventChoices: [[EVENT_ID, "fixture:shield"]],
      }),
      { kind: "event", id: EVENT_ID },
    );
    expect(resolve.nextAction).toEqual({
      tool: "resolve_overworld_session_event",
      arguments: { event_id: EVENT_ID, option_id: "fixture:shield" },
      command: `resolve ${EVENT_ID} fixture:shield`,
      label: "Choose “Shield the signal” for this event.",
    });
    expect(JSON.stringify(resolve)).not.toMatch(
      /private|preview|consequence|minutes|renown|reward|prompt/i,
    );
  });

  it("returns one legal road, mapped-area, or discovery step without mutating input", () => {
    const mappedState = state();
    const before = [...mappedState.journalEntryIds];
    expect(explainJourneyOpportunity(mappedState, { kind: "job", id: JOB_ID }).nextAction).toEqual({
      tool: "move_overworld_session_area",
      arguments: { area_route_id: "fixture:harbor_works" },
      command: `enter ${MAPPED}`,
      label: "Take one local route toward Works.",
    });
    expect([...mappedState.journalEntryIds]).toEqual(before);

    expect(
      explainJourneyOpportunity(
        state({ currentTownId: "fixture:away", currentAreaId: "fixture:away_area" }),
        { kind: "job", id: JOB_ID },
      ).nextAction,
    ).toEqual({
      tool: "travel_overworld_session",
      arguments: { road_id: "fixture:road" },
      command: `go ${HOME}`,
      label: "Take one road toward Fixture Town.",
    });

    const hiddenArea = "fixture:marsh";
    expect(
      explainJourneyOpportunity(
        state({
          opportunities: {
            guidance: "Synthetic pursuit guidance.",
            leads: [
              {
                id: EVENT_ID,
                kind: "event",
                title: "Harbor signal",
                area: "Marsh",
                access: "route_unmapped",
              },
            ],
          },
          eventsById: new Map([
            [
              EVENT_ID,
              {
                id: EVENT_ID,
                home: HOME,
                area: hiddenArea,
                title: "Harbor signal",
                authored_scene: eventScene,
              },
            ],
          ]),
        }),
        { kind: "event", id: EVENT_ID },
      ).nextAction,
    ).toEqual({
      tool: "explore_overworld_session_area",
      arguments: { area_id: HERE },
      command: `explore ${HERE}`,
      label: "Explore Harbor to advance local discovery.",
    });
  });

  it("fails closed for stale, wrong-kind, and unreachable identities", () => {
    expect(() =>
      explainJourneyOpportunity(state({ opportunities: null }), {
        kind: "event",
        id: EVENT_ID,
      }),
    ).toThrow(`Opportunity lead "event:${EVENT_ID}" is not currently projected.`);
    expect(() => explainJourneyOpportunity(state(), { kind: "job", id: EVENT_ID })).toThrow(
      `Opportunity lead "job:${EVENT_ID}" is not currently projected.`,
    );
    expect(() =>
      explainJourneyOpportunity(
        state({
          areaExitsByArea: new Map(),
          currentAreaDiscoveryAction: () => null,
          visitedAreaIds: new Set([HERE, MAPPED]),
        }),
        { kind: "job", id: JOB_ID },
      ),
    ).toThrow(/no available local action/i);
  });
});
