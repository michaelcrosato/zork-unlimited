import type { OverworldLocalEvent } from "./overworld.js";
import { describeOverworldEventResolution } from "./session_event_resolution.js";
import type {
  OverworldJournalDecisionBoundary,
  OverworldJournalEntry,
  OverworldLocalSceneProof,
} from "./session_snapshot.js";
import {
  AUTHORED_ALBANY_GREENWAY_GENERIC_PREDECESSOR_WORLD_HASHES,
  AUTHORED_ALBANY_GREENWAY_PREDECESSOR_WORLD_HASH,
  AUTHORED_ALBANY_MARKET_GENERIC_PREDECESSOR_WORLD_HASHES,
  AUTHORED_ALBANY_MARKET_PREDECESSOR_WORLD_HASH,
  WINTER_RETURN_DOCKET_GENERIC_PREDECESSOR_WORLD_HASHES,
  WINTER_RETURN_DOCKET_PREDECESSOR_WORLD_HASH,
} from "./local_scene_legacy_sources.js";

export {
  AUTHORED_ALBANY_GREENWAY_GENERIC_PREDECESSOR_WORLD_HASHES,
  AUTHORED_ALBANY_GREENWAY_PREDECESSOR_WORLD_HASH,
  AUTHORED_ALBANY_MARKET_GENERIC_PREDECESSOR_WORLD_HASHES,
  AUTHORED_ALBANY_MARKET_PREDECESSOR_WORLD_HASH,
  WINTER_RETURN_DOCKET_GENERIC_PREDECESSOR_WORLD_HASHES,
  WINTER_RETURN_DOCKET_PREDECESSOR_WORLD_HASH,
} from "./local_scene_legacy_sources.js";

export const AUTHORED_ALBANY_CHARTER_EVENT_ID = "albany_city__civic_core__event";
export const AUTHORED_ALBANY_CHARTER_EVENT_SCENE_ID = "albany:winter-return-charter-record";
export const AUTHORED_ALBANY_MARKET_EVENT_ID = "albany_city__market__event";
export const AUTHORED_ALBANY_MARKET_EVENT_SCENE_ID = "albany:winter-price-policy";
export const AUTHORED_ALBANY_GREENWAY_EVENT_ID = "albany_city__greenway__event";
export const AUTHORED_ALBANY_GREENWAY_EVENT_SCENE_ID = "albany:greenway-trail-policy";

export const AUTHORED_ALBANY_CHARTER_LEGACY_EVENT: OverworldLocalEvent = Object.freeze({
  id: AUTHORED_ALBANY_CHARTER_EVENT_ID,
  home: "albany_city",
  area: "albany_city__civic_core",
  title: "Albany Civic Center: charter backlog",
  pressure: "rumor",
  intensity: 2,
  summary:
    "Charter runners stack sealed files by the public stair while a deputy keeps sending people to the wrong counter. To clear the backlog, read the Notice Hall marks, ask Rowan which docket matters, then inspect the stair and underrooms.",
});

export const AUTHORED_ALBANY_MARKET_LEGACY_EVENT: OverworldLocalEvent = Object.freeze({
  id: AUTHORED_ALBANY_MARKET_EVENT_ID,
  home: "albany_city",
  area: "albany_city__market",
  title: "Albany Market Streets: supply price spike",
  pressure: "opportunity",
  intensity: 3,
  summary:
    "Albany Market Streets is under opportunity pressure around shortages, disputed deliveries, and late counters. Resolving it requires scouting this area, talking to its contact, and investigating on site.",
});

export const AUTHORED_ALBANY_GREENWAY_LEGACY_EVENT: OverworldLocalEvent = Object.freeze({
  id: AUTHORED_ALBANY_GREENWAY_EVENT_ID,
  home: "albany_city",
  area: "albany_city__greenway",
  title: "Albany Greenway: trail sign damage",
  pressure: "hazard",
  intensity: 3,
  summary:
    "Albany Greenway is under hazard pressure around tracks, utility cuts, and witnesses who avoid main streets. Resolving it requires scouting this area, talking to its contact, and investigating on site.",
});

export type AuthoredLocalEventLegacyDefinition = Readonly<{
  /** Canonical hash for the exact generic event definition being preserved. */
  sourceWorldHash: string;
  eventId: string;
  sceneId: string;
  legacyEvent: OverworldLocalEvent;
  /** Exact additional manifests that carried byte-for-byte equivalent copy. */
  acceptedSourceWorldHashes?: ReadonlySet<string>;
}>;

export type AuthoredLocalEventLegacyCompletion = Readonly<{
  definition: AuthoredLocalEventLegacyDefinition;
  optionId: string;
}>;

/**
 * Exact-definition registry for generic events converted into authored scenes.
 * New conversions add their predecessor definition here; all restore/replay
 * consumers remain event-agnostic and the marker stays choice-neutral.
 */
export const AUTHORED_LOCAL_EVENT_LEGACY_DEFINITIONS: readonly AuthoredLocalEventLegacyDefinition[] =
  Object.freeze([
    Object.freeze({
      sourceWorldHash: WINTER_RETURN_DOCKET_PREDECESSOR_WORLD_HASH,
      eventId: AUTHORED_ALBANY_CHARTER_EVENT_ID,
      sceneId: AUTHORED_ALBANY_CHARTER_EVENT_SCENE_ID,
      legacyEvent: AUTHORED_ALBANY_CHARTER_LEGACY_EVENT,
      acceptedSourceWorldHashes: WINTER_RETURN_DOCKET_GENERIC_PREDECESSOR_WORLD_HASHES,
    }),
    Object.freeze({
      sourceWorldHash: AUTHORED_ALBANY_MARKET_PREDECESSOR_WORLD_HASH,
      eventId: AUTHORED_ALBANY_MARKET_EVENT_ID,
      sceneId: AUTHORED_ALBANY_MARKET_EVENT_SCENE_ID,
      legacyEvent: AUTHORED_ALBANY_MARKET_LEGACY_EVENT,
      acceptedSourceWorldHashes: AUTHORED_ALBANY_MARKET_GENERIC_PREDECESSOR_WORLD_HASHES,
    }),
    Object.freeze({
      sourceWorldHash: AUTHORED_ALBANY_GREENWAY_PREDECESSOR_WORLD_HASH,
      eventId: AUTHORED_ALBANY_GREENWAY_EVENT_ID,
      sceneId: AUTHORED_ALBANY_GREENWAY_EVENT_SCENE_ID,
      legacyEvent: AUTHORED_ALBANY_GREENWAY_LEGACY_EVENT,
      acceptedSourceWorldHashes: AUTHORED_ALBANY_GREENWAY_GENERIC_PREDECESSOR_WORLD_HASHES,
    }),
  ]);

export function authoredLocalEventLegacyOptionId(sourceWorldHash: string): string {
  return `legacy_generic@${sourceWorldHash}`;
}

export const AUTHORED_ALBANY_CHARTER_LEGACY_OPTION_ID = authoredLocalEventLegacyOptionId(
  WINTER_RETURN_DOCKET_PREDECESSOR_WORLD_HASH,
);

export function authoredLocalEventLegacyDefinitionForEvent(
  eventId: string,
  definitions: readonly AuthoredLocalEventLegacyDefinition[] = AUTHORED_LOCAL_EVENT_LEGACY_DEFINITIONS,
): AuthoredLocalEventLegacyDefinition | null {
  return definitions.find((definition) => definition.eventId === eventId) ?? null;
}

export function authoredLocalEventLegacyDefinitionsForSourceWorldHash(
  sourceWorldHash: string,
  definitions: readonly AuthoredLocalEventLegacyDefinition[] = AUTHORED_LOCAL_EVENT_LEGACY_DEFINITIONS,
): readonly AuthoredLocalEventLegacyDefinition[] {
  return definitions.filter(
    (definition) =>
      definition.sourceWorldHash === sourceWorldHash ||
      definition.acceptedSourceWorldHashes?.has(sourceWorldHash),
  );
}

export function authoredLocalEventLegacyCompletion(
  eventId: string,
  proof: OverworldLocalSceneProof | undefined,
  definitions: readonly AuthoredLocalEventLegacyDefinition[] = AUTHORED_LOCAL_EVENT_LEGACY_DEFINITIONS,
): AuthoredLocalEventLegacyCompletion | null {
  if (!proof?.sourceWorldHash) return null;
  const definition = definitions.find(
    (candidate) =>
      candidate.eventId === eventId &&
      candidate.sceneId === proof.sceneId &&
      (candidate.sourceWorldHash === proof.sourceWorldHash ||
        candidate.acceptedSourceWorldHashes?.has(proof.sourceWorldHash ?? "")),
  );
  if (!definition) return null;
  const optionId = authoredLocalEventLegacyOptionId(proof.sourceWorldHash);
  return proof.optionId === optionId ? { definition, optionId } : null;
}

/** @deprecated Civic-specific alias retained for existing callers. */
export const authoredAlbanyCharterLegacyCompletion = authoredLocalEventLegacyCompletion;

export function describeAuthoredLocalEventLegacyResolution(
  completion: AuthoredLocalEventLegacyCompletion,
  townName: string,
  region: string,
) {
  return describeOverworldEventResolution(completion.definition.legacyEvent, townName, region);
}

export function migrateAuthoredLocalEventLegacyEntry(args: {
  boundary?: OverworldJournalDecisionBoundary | undefined;
  currentEvent: OverworldLocalEvent;
  definition: AuthoredLocalEventLegacyDefinition;
  entry: OverworldJournalEntry;
  region: string;
  sourceWorldHash?: string | undefined;
  townName: string;
}): OverworldJournalEntry {
  if (
    args.currentEvent.id !== args.definition.eventId ||
    args.currentEvent.authored_scene?.id !== args.definition.sceneId
  ) {
    throw new Error(
      `Authored local-event migration target does not match registered scene "${args.definition.sceneId}".`,
    );
  }
  const sourceWorldHash = args.sourceWorldHash ?? args.definition.sourceWorldHash;
  if (
    sourceWorldHash !== args.definition.sourceWorldHash &&
    !args.definition.acceptedSourceWorldHashes?.has(sourceWorldHash)
  ) {
    throw new Error(
      `Authored local-event predecessor for "${args.definition.eventId}" names an unsupported source manifest.`,
    );
  }
  const completion = {
    definition: args.definition,
    optionId: authoredLocalEventLegacyOptionId(sourceWorldHash),
  };
  const expected = describeAuthoredLocalEventLegacyResolution(
    completion,
    args.townName,
    args.region,
  );
  if (
    args.entry.id !== `resolve:${args.definition.eventId}` ||
    args.entry.kind !== "resolution" ||
    args.entry.title !== expected.title ||
    args.entry.text !== expected.text ||
    args.entry.town !== args.townName ||
    args.entry.localSceneProof !== undefined
  ) {
    throw new Error(
      `Authored local-event predecessor entry for "${args.definition.eventId}" does not match its exact trusted copy.`,
    );
  }
  return Object.freeze({
    ...args.entry,
    localSceneProof: {
      sceneId: args.definition.sceneId,
      optionId: completion.optionId,
      sourceWorldHash,
      ...(args.boundary ? { boundary: { ...args.boundary } } : {}),
    },
  });
}

/** @deprecated Civic-specific wrapper retained for compatibility. */
export function migrateAuthoredAlbanyCharterLegacyEntry(
  args: Omit<Parameters<typeof migrateAuthoredLocalEventLegacyEntry>[0], "definition">,
): OverworldJournalEntry {
  return migrateAuthoredLocalEventLegacyEntry({
    ...args,
    definition: AUTHORED_LOCAL_EVENT_LEGACY_DEFINITIONS[0]!,
  });
}
