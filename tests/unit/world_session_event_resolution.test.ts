import { describe, expect, it } from "vitest";
import {
  assertSnapshotEventResolutionProofs,
  assertSnapshotRegionalArcCompletionProofs,
  regionalArcResolutionProof,
} from "../../src/world/session_event_resolution.js";
import type {
  OverworldEventResolutionJournalIndex,
  OverworldResolutionProofIndex,
} from "../../src/world/session_journal_timeline.js";
import type { OverworldLocalEvent, OverworldRegionalArc } from "../../src/world/overworld.js";

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
