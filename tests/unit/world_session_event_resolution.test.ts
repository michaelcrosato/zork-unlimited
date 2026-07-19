import { describe, expect, it } from "vitest";
import {
  applyOverworldEventResolution,
  assertOverworldEventResolutionReady,
  assertSnapshotEventResolutionProofs,
  assertSnapshotRegionalArcCompletionProofs,
  missingOverworldEventResolutionStepLabels,
  overworldEventResolutionReadiness,
  planOverworldEventResolution,
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
import type { OverworldJournalEntry } from "../../src/world/session_snapshot.js";

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

function authoredEvent(id: string, home: string, area: string): OverworldLocalEvent {
  return {
    ...event(id, home, area),
    authored_scene: {
      version: 1,
      id: `${id}:scene`,
      prompt: "Choose one durable record.",
      required_poi_id: "poi_exact",
      required_contact_id: "character_exact",
      options: [
        {
          id: "open",
          title: "Open the record",
          preview: "Publish the record.",
          consequence: "The record is public.",
          terms: { minutes: 50, renown: 2 },
        },
        {
          id: "seal",
          title: "Seal the record",
          preview: "Protect the record.",
          consequence: "The record stays sealed.",
          terms: { minutes: 50, renown: 2 },
        },
      ],
    },
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
    contactPresentationsByJournalId: new Map(),
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

function journalEntry(
  id: string,
  kind: OverworldJournalEntry["kind"],
  recordedAt = "Day 1, 10:00",
): OverworldJournalEntry {
  return {
    id,
    kind,
    town: "Alden",
    title: id,
    text: id,
    recordedAt,
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

  it("plans live event resolution journal entries and renown without mutating sources", () => {
    const localEvent = event("event_a", "town_a", "area_a");
    const journalEntries = new Map([
      ["scout:poi_a", journalEntry("scout:poi_a", "poi")],
      ["talk:character_a", journalEntry("talk:character_a", "contact")],
      ["investigate:event_a", journalEntry("investigate:event_a", "event")],
    ]);

    expect(
      planOverworldEventResolution({
        eventId: localEvent.id,
        eventsById: new Map([[localEvent.id, localEvent]]),
        currentTownId: "town_a",
        currentTownName: "Alden",
        currentRegion: "North",
        currentAreaId: "area_a",
        completedQuestIds: new Set<string>(),
        resolvedEventIds: new Set(),
        journalEntries,
        poisByArea: new Map([["area_a", [poi("poi_a")]]]),
        charactersByArea: new Map([["area_a", [character("character_a")]]]),
      }),
    ).toEqual({
      alreadyKnown: false,
      event: localEvent,
      minutes: 50,
      renown: 2,
      region: "North",
      entryDraft: {
        id: "resolve:event_a",
        kind: "resolution",
        town: "Alden",
        title: "Resolved event_a",
        text: "Alden stabilizes around event_a. Your work reduces hazard pressure and earns 2 North renown.",
      },
    });
    expect([...journalEntries.keys()]).toEqual([
      "scout:poi_a",
      "talk:character_a",
      "investigate:event_a",
    ]);
  });

  it("applies live event resolution into lifecycle ids and regional renown", () => {
    const localEvent = event("event_a", "town_a", "area_a");
    const plan = planOverworldEventResolution({
      eventId: localEvent.id,
      eventsById: new Map([[localEvent.id, localEvent]]),
      currentTownId: "town_a",
      currentTownName: "Alden",
      currentRegion: "North",
      currentAreaId: "area_a",
      completedQuestIds: new Set<string>(),
      resolvedEventIds: new Set(),
      journalEntries: new Map([
        ["scout:poi_a", journalEntry("scout:poi_a", "poi")],
        ["talk:character_a", journalEntry("talk:character_a", "contact")],
        ["investigate:event_a", journalEntry("investigate:event_a", "event")],
      ]),
      poisByArea: new Map([["area_a", [poi("poi_a")]]]),
      charactersByArea: new Map([["area_a", [character("character_a")]]]),
    });
    if (plan.alreadyKnown) throw new Error("expected a new event resolution plan");
    const resolvedEventIds = new Set<string>();
    const resolvedEventHomeIds = new Set<string>();
    const regionRenown = new Map([["North", 3]]);

    expect(
      applyOverworldEventResolution({ resolvedEventIds, resolvedEventHomeIds, regionRenown }, plan),
    ).toEqual({
      eventId: "event_a",
      eventHome: "town_a",
      renownRegion: "North",
      renownGained: 2,
      renownAfter: 5,
    });
    expect([...resolvedEventIds]).toEqual(["event_a"]);
    expect([...resolvedEventHomeIds]).toEqual(["town_a"]);
    expect(regionRenown.get("North")).toBe(5);
  });

  it("reuses an existing resolved-event journal entry before checking prerequisites", () => {
    const localEvent = event("event_a", "town_a", "area_a");
    const existing = journalEntry("resolve:event_a", "resolution", "Day 1, 11:00");

    expect(
      planOverworldEventResolution({
        eventId: localEvent.id,
        eventsById: new Map([[localEvent.id, localEvent]]),
        currentTownId: "town_a",
        currentTownName: "Alden",
        currentRegion: "North",
        currentAreaId: "area_a",
        completedQuestIds: new Set<string>(),
        resolvedEventIds: new Set([localEvent.id]),
        journalEntries: new Map([[existing.id, existing]]),
        poisByArea: new Map(),
        charactersByArea: new Map(),
      }),
    ).toEqual({
      alreadyKnown: true,
      event: localEvent,
      minutes: 0,
      entry: existing,
    });
  });

  it("rejects event resolution plans outside the active town and area", () => {
    const localEvent = event("event_a", "town_a", "area_a");
    const baseState = {
      eventId: localEvent.id,
      eventsById: new Map([[localEvent.id, localEvent]]),
      currentTownId: "town_a",
      currentTownName: "Alden",
      currentRegion: "North",
      currentAreaId: "area_a",
      completedQuestIds: new Set<string>(),
      resolvedEventIds: new Set<string>(),
      journalEntries: new Map<string, OverworldJournalEntry>(),
      poisByArea: new Map<string, readonly OverworldPoi[]>(),
      charactersByArea: new Map<string, readonly OverworldCharacter[]>(),
    };

    expect(() => planOverworldEventResolution({ ...baseState, eventId: "missing_event" })).toThrow(
      /not active in this town/,
    );
    expect(() => planOverworldEventResolution({ ...baseState, currentTownId: "town_b" })).toThrow(
      /not active in this town/,
    );
    expect(() => planOverworldEventResolution({ ...baseState, currentAreaId: "area_b" })).toThrow(
      /Move to that local area/,
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

  it("requires exact authored scene setup and strict pre-resolution chronology", () => {
    const localEvent = authoredEvent("event_a", "town_a", "area_a");
    const sources: OverworldResolutionProofIndex = {
      charactersById: new Map([
        ["character_exact", character("character_exact")],
        ["character_other", character("character_other")],
      ]),
      contactPresentationsByJournalId: new Map(),
      eventsById: new Map([[localEvent.id, localEvent]]),
      poisById: new Map([
        ["poi_exact", poi("poi_exact")],
        ["poi_other", poi("poi_other")],
      ]),
    };
    const exactTimes = new Map([
      ["scout:poi_exact", 580],
      ["talk:character_exact", 590],
      ["investigate:event_a", 600],
      ["resolve:event_a", 620],
    ]);
    const exactJournal = journal({ recordedAtById: exactTimes });
    expect(() =>
      assertSnapshotEventResolutionProofs(new Set([localEvent.id]), sources, exactJournal),
    ).not.toThrow();

    const sameAreaScoutOnly = new Map(exactTimes);
    sameAreaScoutOnly.delete("scout:poi_exact");
    sameAreaScoutOnly.set("scout:poi_other", 580);
    expect(() =>
      assertSnapshotEventResolutionProofs(
        new Set([localEvent.id]),
        sources,
        journal({ recordedAtById: sameAreaScoutOnly }),
      ),
    ).toThrow(/exact point-of-interest scout prerequisite/i);

    const sameAreaContactOnly = new Map(exactTimes);
    sameAreaContactOnly.delete("talk:character_exact");
    sameAreaContactOnly.set("talk:character_other", 590);
    expect(() =>
      assertSnapshotEventResolutionProofs(
        new Set([localEvent.id]),
        sources,
        journal({ recordedAtById: sameAreaContactOnly }),
      ),
    ).toThrow(/exact contact prerequisite/i);

    for (const prerequisiteId of [
      "scout:poi_exact",
      "talk:character_exact",
      "investigate:event_a",
    ]) {
      const reordered = new Map(exactTimes);
      reordered.set(prerequisiteId, 620);
      expect(() =>
        assertSnapshotEventResolutionProofs(
          new Set([localEvent.id]),
          sources,
          journal({ recordedAtById: reordered }),
        ),
      ).toThrow(/earlier exact/i);
    }
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
