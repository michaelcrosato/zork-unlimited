import { describe, expect, it } from "vitest";
import {
  assertOverworldEventResolutionReady,
  assertSnapshotEventResolutionProofs,
  assertSnapshotRegionalArcCompletionProofs,
  missingOverworldEventResolutionStepLabels,
  overworldEventResolutionReadiness,
  regionalArcResolutionProof,
} from "../../src/world/session_event_resolution.js";
import type {
  OverworldEventResolutionJournalIndex,
  OverworldResolutionProofIndex,
} from "../../src/world/session_journal_timeline.js";
import type {
  OverworldCharacter,
  OverworldLocalEvent,
  OverworldPoi,
  OverworldRegionalArc,
} from "../../src/world/overworld.js";

function event(id: string, home: string, area: string): OverworldLocalEvent {
  return {
    id,
    home,
    area,
    title: id,
    pressure: "hazard",
    intensity: 2,
    summary: `${id} summary`,
  };
}

function poi(id: string, area = "area_a"): OverworldPoi {
  return {
    id,
    home: "town_a",
    area,
    kind: "landmark",
    title: id,
    summary: `${id} summary`,
  };
}

function character(id: string, area = "area_a"): OverworldCharacter {
  return {
    id,
    home: "town_a",
    area,
    name: id,
    role: "contact",
    faction: "locals",
    summary: `${id} summary`,
    agenda: `${id} agenda`,
  };
}

function arc(
  id: string,
  anchorTowns: readonly string[],
  requiredResolutions: number,
): OverworldRegionalArc {
  return {
    id,
    region: "North",
    title: id,
    summary: `${id} summary`,
    required_resolutions: requiredResolutions,
    anchor_towns: [...anchorTowns],
    reward: `${id} reward`,
  };
}

function resolutionSources(events: readonly OverworldLocalEvent[]): OverworldResolutionProofIndex {
  return {
    charactersById: new Map(),
    eventsById: new Map(events.map((entry) => [entry.id, entry])),
    poisById: new Map(),
  };
}

function journal(
  overrides: Partial<OverworldEventResolutionJournalIndex> = {},
): OverworldEventResolutionJournalIndex {
  return {
    contactTimeByArea: new Map([["area_a", 590]]),
    recordedAtById: new Map([
      ["investigate:event_a", 600],
      ["resolve:event_a", 620],
    ]),
    resolutionTimeByTown: new Map(),
    scoutTimeByArea: new Map([["area_a", 580]]),
    ...overrides,
  };
}

describe("overworld event and regional arc proof replay", () => {
  it("evaluates live event-resolution readiness from local journal prerequisites", () => {
    const localEvent = event("event_a", "town_a", "area_a");
    const sources = {
      event: localEvent,
      poisByArea: new Map([["area_a", [poi("poi_a")]]]),
      charactersByArea: new Map([["area_a", [character("character_a")]]]),
      journalEntryIds: new Set(["scout:poi_a", "talk:character_a", "investigate:event_a"]),
    };

    expect(overworldEventResolutionReadiness(sources)).toEqual({
      scoutedPoi: true,
      talkedContact: true,
      investigatedEvent: true,
      missing: [],
    });
    expect(() => assertOverworldEventResolutionReady(sources)).not.toThrow();
  });

  it("labels missing live event-resolution prerequisites in action order", () => {
    const localEvent = event("event_a", "town_a", "area_a");
    const readiness = overworldEventResolutionReadiness({
      event: localEvent,
      poisByArea: new Map([["area_a", [poi("poi_a")]]]),
      charactersByArea: new Map([["area_a", [character("character_a")]]]),
      journalEntryIds: new Set(["talk:character_a"]),
    });

    expect(readiness).toEqual({
      scoutedPoi: false,
      talkedContact: true,
      investigatedEvent: false,
      missing: ["scout_poi", "investigate_event"],
    });
    expect(missingOverworldEventResolutionStepLabels(readiness.missing)).toEqual([
      "scout a local point of interest",
      "investigate the event",
    ]);
    expect(() =>
      assertOverworldEventResolutionReady({
        event: localEvent,
        poisByArea: new Map([["area_a", [poi("poi_a")]]]),
        charactersByArea: new Map([["area_a", [character("character_a")]]]),
        journalEntryIds: new Set(["talk:character_a"]),
      }),
    ).toThrow(
      /Before resolving this event, scout a local point of interest, investigate the event\./,
    );
  });

  it("accepts resolved events with local scout, contact, and investigation prerequisites", () => {
    expect(() =>
      assertSnapshotEventResolutionProofs(
        new Set(["event_a"]),
        resolutionSources([event("event_a", "town_a", "area_a")]),
        journal(),
      ),
    ).not.toThrow();
  });

  it("rejects resolved events with missing or late prerequisites", () => {
    const sources = resolutionSources([event("event_a", "town_a", "area_a")]);

    expect(() =>
      assertSnapshotEventResolutionProofs(
        new Set(["event_a"]),
        sources,
        journal({ scoutTimeByArea: new Map() }),
      ),
    ).toThrow(/missing a local scout prerequisite/);
    expect(() =>
      assertSnapshotEventResolutionProofs(
        new Set(["event_a"]),
        sources,
        journal({ contactTimeByArea: new Map([["area_a", 630]]) }),
      ),
    ).toThrow(/missing a local contact prerequisite/);
    expect(() =>
      assertSnapshotEventResolutionProofs(
        new Set(["event_a"]),
        sources,
        journal({
          recordedAtById: new Map([
            ["investigate:event_a", 630],
            ["resolve:event_a", 620],
          ]),
        }),
      ),
    ).toThrow(/missing an investigated event prerequisite/);
  });

  it("computes regional arc completion proof time from the required earliest anchors", () => {
    expect(
      regionalArcResolutionProof(
        arc("arc_a", ["town_a", "town_b", "town_c"], 2),
        new Map([
          ["town_a", 700],
          ["town_b", 600],
          ["town_c", 650],
        ]),
      ),
    ).toEqual({
      completionProofAt: 650,
      resolvedCount: 3,
    });
  });

  it("rejects forged regional arc completion state", () => {
    const regionalArc = arc("arc_a", ["town_a", "town_b"], 2);

    expect(() =>
      assertSnapshotRegionalArcCompletionProofs(
        { eventsById: new Map(), regionalArcs: [regionalArc] },
        journal({ resolutionTimeByTown: new Map([["town_a", 600]]) }),
        new Set(["arc_a"]),
      ),
    ).toThrow(/lacks required resolved anchor towns/);
    expect(() =>
      assertSnapshotRegionalArcCompletionProofs(
        { eventsById: new Map(), regionalArcs: [regionalArc] },
        journal({
          resolutionTimeByTown: new Map([
            ["town_a", 600],
            ["town_b", 640],
          ]),
        }),
        new Set(),
      ),
    ).toThrow(/missing completed regional arc/);
    expect(() =>
      assertSnapshotRegionalArcCompletionProofs(
        { eventsById: new Map(), regionalArcs: [regionalArc] },
        journal({
          recordedAtById: new Map([["arc:arc_a", 620]]),
          resolutionTimeByTown: new Map([
            ["town_a", 600],
            ["town_b", 640],
          ]),
        }),
        new Set(["arc_a"]),
      ),
    ).toThrow(/before enough anchor resolutions/);
  });
});
