import { describe, expect, it } from "vitest";

import {
  authoredLocalEventLegacyCompletion,
  authoredLocalEventLegacyOptionId,
  migrateAuthoredLocalEventLegacyEntry,
  type AuthoredLocalEventLegacyDefinition,
} from "../../src/world/local_event_scene_legacy.js";
import { describeOverworldEventResolution } from "../../src/world/session_event_resolution.js";
import type { OverworldLocalEvent } from "../../src/world/overworld.js";
import { migrateAuthoredLocalEventPredecessorJournal } from "../../src/world/session_snapshot_restore.js";

const SOURCE_HASH = "synthetic_non_civic_hash";
const EVENT_ID = "test_harbor__signals__event";
const SCENE_ID = "test:harbor-signal-policy";
const LEGACY_EVENT: OverworldLocalEvent = {
  id: EVENT_ID,
  home: "test_harbor",
  area: "test_harbor__signals",
  title: "Harbor Signals: generic warning",
  pressure: "hazard",
  intensity: 3,
  summary: "A generic harbor warning needs attention.",
};
const CURRENT_EVENT: OverworldLocalEvent = {
  ...LEGACY_EVENT,
  authored_scene: {
    version: 1,
    id: SCENE_ID,
    prompt: "Choose which warning becomes permanent.",
    required_poi_id: "test:signal_tower",
    required_contact_id: "test:harbor_master",
    options: [
      {
        id: "bell",
        title: "Keep the bell",
        preview: "Keep the public bell.",
        consequence: "The bell remains public.",
        terms: { minutes: 40, renown: 2 },
      },
      {
        id: "flags",
        title: "Raise flags",
        preview: "Use protected signal flags.",
        consequence: "The flags become the warning.",
        terms: { minutes: 40, renown: 2 },
      },
    ],
  },
};
const DEFINITION: AuthoredLocalEventLegacyDefinition = {
  sourceWorldHash: SOURCE_HASH,
  eventId: EVENT_ID,
  sceneId: SCENE_ID,
  legacyEvent: LEGACY_EVENT,
  acceptedSourceWorldHashes: new Set(["synthetic_additional_hash"]),
};

describe("generic authored local-event legacy registry", () => {
  it("migrates an exact non-Civic predecessor to a neutral hash-bound marker", () => {
    const expected = describeOverworldEventResolution(LEGACY_EVENT, "Test Harbor", "Coast");
    const migrated = migrateAuthoredLocalEventLegacyEntry({
      currentEvent: CURRENT_EVENT,
      definition: DEFINITION,
      entry: {
        id: `resolve:${EVENT_ID}`,
        kind: "resolution",
        town: "Test Harbor",
        title: expected.title,
        text: expected.text,
        recordedAt: "Day 1, 09:40",
      },
      region: "Coast",
      sourceWorldHash: SOURCE_HASH,
      townName: "Test Harbor",
    });
    expect(migrated.localSceneProof).toEqual({
      sceneId: SCENE_ID,
      optionId: authoredLocalEventLegacyOptionId(SOURCE_HASH),
      sourceWorldHash: SOURCE_HASH,
    });
    expect(
      authoredLocalEventLegacyCompletion(EVENT_ID, migrated.localSceneProof, [DEFINITION]),
    ).toMatchObject({ definition: DEFINITION });
    expect(migrated.localSceneProof?.optionId).not.toBe("bell");
    expect(migrated.localSceneProof?.optionId).not.toBe("flags");
  });

  it("rejects missing, altered, and wrong-hash generic evidence", () => {
    const expected = describeOverworldEventResolution(LEGACY_EVENT, "Test Harbor", "Coast");
    const base = {
      currentEvent: CURRENT_EVENT,
      definition: DEFINITION,
      entry: {
        id: `resolve:${EVENT_ID}`,
        kind: "resolution" as const,
        town: "Test Harbor",
        title: expected.title,
        text: expected.text,
        recordedAt: "Day 1, 09:40",
      },
      region: "Coast",
      sourceWorldHash: SOURCE_HASH,
      townName: "Test Harbor",
    };
    expect(() =>
      migrateAuthoredLocalEventLegacyEntry({
        ...base,
        entry: { ...base.entry, text: `${base.entry.text} altered` },
      }),
    ).toThrow(/exact trusted copy/i);
    expect(() =>
      migrateAuthoredLocalEventLegacyEntry({ ...base, sourceWorldHash: "wrong_hash" }),
    ).toThrow(/unsupported source manifest/i);
    expect(
      authoredLocalEventLegacyCompletion(
        EVENT_ID,
        {
          sceneId: SCENE_ID,
          optionId: authoredLocalEventLegacyOptionId(SOURCE_HASH),
        },
        [DEFINITION],
      ),
    ).toBeNull();
    expect(
      authoredLocalEventLegacyCompletion(
        EVENT_ID,
        {
          sceneId: SCENE_ID,
          optionId: "bell",
          sourceWorldHash: SOURCE_HASH,
        },
        [DEFINITION],
      ),
    ).toBeNull();
  });

  it("selects exact source definitions at restore level and skips unrelated definitions", () => {
    const expected = describeOverworldEventResolution(LEGACY_EVENT, "Test Harbor", "Coast");
    const unrelatedEvent: OverworldLocalEvent = {
      ...CURRENT_EVENT,
      id: "unrelated__event",
      authored_scene: { ...CURRENT_EVENT.authored_scene!, id: "test:unrelated-scene" },
    };
    const unrelatedDefinition: AuthoredLocalEventLegacyDefinition = {
      sourceWorldHash: "unrelated_source_hash",
      eventId: unrelatedEvent.id,
      sceneId: unrelatedEvent.authored_scene!.id,
      legacyEvent: { ...LEGACY_EVENT, id: unrelatedEvent.id },
    };
    const migrated = migrateAuthoredLocalEventPredecessorJournal({
      campaignBoundaries: { byAcceptedDecisions: new Map() } as never,
      definitions: [DEFINITION, unrelatedDefinition],
      indexes: {
        eventsById: new Map([
          [EVENT_ID, CURRENT_EVENT],
          [unrelatedEvent.id, unrelatedEvent],
        ]),
        nodesById: new Map([[CURRENT_EVENT.home, { id: CURRENT_EVENT.home, region: "Coast" }]]),
        townNameForSource: () => "Test Harbor",
      } as never,
      snapshot: {
        worldHash: SOURCE_HASH,
        resolvedEventIds: [EVENT_ID, unrelatedEvent.id],
        journalEntries: [
          {
            id: `resolve:${EVENT_ID}`,
            kind: "resolution",
            town: "Test Harbor",
            title: expected.title,
            text: expected.text,
            recordedAt: "Day 1, 09:40",
          },
        ],
      } as never,
    });
    expect(migrated).toHaveLength(1);
    expect(migrated[0]?.localSceneProof).toEqual({
      sceneId: SCENE_ID,
      optionId: authoredLocalEventLegacyOptionId(SOURCE_HASH),
      sourceWorldHash: SOURCE_HASH,
    });
  });
});
