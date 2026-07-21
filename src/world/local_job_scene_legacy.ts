import type { OverworldArea, OverworldLocalJob } from "./overworld.js";
import type {
  OverworldJournalDecisionBoundary,
  OverworldJournalEntry,
  OverworldLocalSceneProof,
} from "./session_snapshot.js";
import { describeOverworldJobAction } from "./local_actions.js";
import {
  AUTHORED_ALBANY_GREENWAY_PREDECESSOR_WORLD_HASH,
  AUTHORED_ALBANY_MARKET_PREDECESSOR_WORLD_HASH,
  WINTER_RETURN_DOCKET_GENERIC_PREDECESSOR_WORLD_HASHES,
} from "./local_event_scene_legacy.js";

export type AuthoredLocalJobLegacyDefinition = Readonly<{
  /** Hash whose generic job copy and terms are preserved by this marker. */
  sourceWorldHash: string;
  jobId: string;
  sceneId: string;
  legacyJob: OverworldLocalJob;
  /** Optional exact source-manifest fence for conversions that are not historically global. */
  acceptedSourceWorldHashes?: ReadonlySet<string>;
}>;

export type AuthoredLocalJobLegacyCompletion = Readonly<{
  definition: AuthoredLocalJobLegacyDefinition;
  optionId: string;
}>;

/**
 * Exact semantics marker for the generic job replaced by the first authored
 * local-job scene. Additional conversions extend the registry with their exact
 * predecessor job; replay/migration consumers remain job-agnostic.
 */
export const OVERWORLD_AUTHORED_LOCAL_JOB_PREDECESSOR_WORLD_HASH =
  "69604947643a24fc2d7c2377a85963742282ac7f83e7cec18a58bfc5eb8f53fc";
export const AUTHORED_ALBANY_WORKS_JOB_ID = "albany_city__industrial__job";
export const AUTHORED_ALBANY_WORKS_SCENE_ID = "albany:works-yard-winter-shift";
export const AUTHORED_ALBANY_CIVIC_JOB_ID = "albany_city__civic_core__job";
export const AUTHORED_ALBANY_CIVIC_SCENE_ID = "albany:winter-return-docket";
export const AUTHORED_ALBANY_CIVIC_PREDECESSOR_WORLD_HASH =
  "815a138cbeeafbc9595c04e37260ccaba9d2d52d6a3341b3c38afe9eade62636";
/** Exact manifest immediately before Albany Campus gained its authored archive scene. */
export const AUTHORED_ALBANY_CAMPUS_PREDECESSOR_WORLD_HASH =
  "db23dea42bb2cd62beb8ac5871e4b5c74ee127c05b36941b4e170247ab8a5858";
export const AUTHORED_ALBANY_CAMPUS_JOB_ID = "albany_city__campus__job";
export const AUTHORED_ALBANY_CAMPUS_SCENE_ID = "albany:campus-wolf-archive-query";
/** Exact manifest immediately before Albany Station gained Cade's authored return packet. */
export const AUTHORED_ALBANY_STATION_PREDECESSOR_WORLD_HASH =
  "a27b2db04b359e9ca38380ca2b0b7a328df4008d1f899bf65e1332d0998aa6b2";
export const AUTHORED_ALBANY_STATION_JOB_ID = "albany_city__transport_hub__job";
export const AUTHORED_ALBANY_STATION_SCENE_ID = "albany:cade-return-packet";
export const AUTHORED_ALBANY_MARKET_JOB_ID = "albany_city__market__job";
export const AUTHORED_ALBANY_MARKET_SCENE_ID = "albany:disputed-winter-crates";
export const AUTHORED_ALBANY_GREENWAY_JOB_ID = "albany_city__greenway__job";
export const AUTHORED_ALBANY_GREENWAY_JOB_SCENE_ID = "albany:greenway-corridor-survey";

export const AUTHORED_ALBANY_WORKS_LEGACY_JOB: OverworldLocalJob = Object.freeze({
  id: AUTHORED_ALBANY_WORKS_JOB_ID,
  home: "albany_city",
  area: "albany_city__industrial",
  kind: "repair",
  title: "Albany Works District: Works Yard Repair",
  summary:
    "Albany Works District has loading doors, tools, machine noise, and labor disputes. The job is small enough to finish locally but specific enough to make Albany City feel worked-in rather than decorative.",
  objective:
    "Spend time in Albany Works District to trace a failing piece of infrastructure before it turns into a wider hazard.",
  reward: "Earn 4 Capital / Mohawk renown and a concrete lead about Albany City.",
  minutes: 83,
  difficulty: 4,
  visibility: "local_job_board",
});

export const AUTHORED_ALBANY_CIVIC_LEGACY_JOB: OverworldLocalJob = Object.freeze({
  id: AUTHORED_ALBANY_CIVIC_JOB_ID,
  home: "albany_city",
  area: "albany_city__civic_core",
  kind: "civic_errand",
  title: "Albany Civic Center: Civic Ledger Run",
  summary:
    "The Civic Ledger Run is not make-work: a relief petition, a market license, and a basement seal all need matching before noon.",
  objective:
    "Verify the Notice Hall mark, witness names, and counter records before Rowan has to close the file.",
  reward: "Earn 3 Capital / Mohawk renown and leave with a cleaner Albany lead.",
  minutes: 61,
  difficulty: 3,
  visibility: "local_job_board",
});

export const AUTHORED_ALBANY_CAMPUS_LEGACY_JOB: OverworldLocalJob = Object.freeze({
  id: AUTHORED_ALBANY_CAMPUS_JOB_ID,
  home: "albany_city",
  area: "albany_city__campus",
  kind: "research",
  title: "Albany Campus Row: Archive Query",
  summary:
    "Albany Campus Row has archives, labs, libraries, and student messengers. The job is small enough to finish locally but specific enough to make Albany City feel worked-in rather than decorative.",
  objective:
    "Spend time in Albany Campus Row to compare notes, maps, and local testimony for a researcher who needs field confirmation.",
  reward: "Earn 4 Capital / Mohawk renown and a concrete lead about Albany City.",
  minutes: 91,
  difficulty: 4,
  visibility: "local_job_board",
});

export const AUTHORED_ALBANY_STATION_LEGACY_JOB: OverworldLocalJob = Object.freeze({
  id: AUTHORED_ALBANY_STATION_JOB_ID,
  home: "albany_city",
  area: "albany_city__transport_hub",
  kind: "courier",
  title: "Albany Station Quarter: Relief Packet",
  summary:
    "Drivers and dispatchers sort road reports beside crates marked for hill farms; one packet keeps returning with the words wolf-winter penciled on the tag.",
  objective:
    "Spend time in Albany Station Quarter to match route notes, passenger names, and weather warnings to the relief wagon that never checked in.",
  reward:
    "Earn 4 Capital / Mohawk renown and a concrete lead about Albany's hill-country relief work.",
  minutes: 79,
  difficulty: 4,
  visibility: "local_job_board",
});

export const AUTHORED_ALBANY_MARKET_LEGACY_JOB: OverworldLocalJob = Object.freeze({
  id: AUTHORED_ALBANY_MARKET_JOB_ID,
  home: "albany_city",
  area: "albany_city__market",
  kind: "supply_run",
  title: "Albany Market Streets: Market Shortfall",
  summary:
    "Albany Market Streets has trade gossip, missing crates, and practical bargaining. The job is small enough to finish locally but specific enough to make Albany City feel worked-in rather than decorative.",
  objective:
    "Spend time in Albany Market Streets to move supplies between stalls, kitchens, and a buyer who cannot wait for a formal posting.",
  reward: "Earn 3 Capital / Mohawk renown and a concrete lead about Albany City.",
  minutes: 65,
  difficulty: 3,
  visibility: "local_job_board",
});

export const AUTHORED_ALBANY_GREENWAY_LEGACY_JOB: OverworldLocalJob = Object.freeze({
  id: AUTHORED_ALBANY_GREENWAY_JOB_ID,
  home: "albany_city",
  area: "albany_city__greenway",
  kind: "survey",
  title: "Albany Greenway: Greenway Survey",
  summary:
    "Albany Greenway has trailheads, utility cuts, camps, and quiet witnesses. The job is small enough to finish locally but specific enough to make Albany City feel worked-in rather than decorative.",
  objective:
    "Spend time in Albany Greenway to walk the paths, mark fresh tracks, and confirm which approach is still passable.",
  reward: "Earn 4 Capital / Mohawk renown and a concrete lead about Albany City.",
  minutes: 87,
  difficulty: 4,
  visibility: "local_job_board",
});

export const AUTHORED_LOCAL_JOB_LEGACY_DEFINITIONS: readonly AuthoredLocalJobLegacyDefinition[] =
  Object.freeze([
    Object.freeze({
      sourceWorldHash: OVERWORLD_AUTHORED_LOCAL_JOB_PREDECESSOR_WORLD_HASH,
      jobId: AUTHORED_ALBANY_WORKS_JOB_ID,
      sceneId: AUTHORED_ALBANY_WORKS_SCENE_ID,
      legacyJob: AUTHORED_ALBANY_WORKS_LEGACY_JOB,
    }),
    Object.freeze({
      sourceWorldHash: AUTHORED_ALBANY_CIVIC_PREDECESSOR_WORLD_HASH,
      jobId: AUTHORED_ALBANY_CIVIC_JOB_ID,
      sceneId: AUTHORED_ALBANY_CIVIC_SCENE_ID,
      legacyJob: AUTHORED_ALBANY_CIVIC_LEGACY_JOB,
      acceptedSourceWorldHashes: WINTER_RETURN_DOCKET_GENERIC_PREDECESSOR_WORLD_HASHES,
    }),
    Object.freeze({
      sourceWorldHash: AUTHORED_ALBANY_CAMPUS_PREDECESSOR_WORLD_HASH,
      jobId: AUTHORED_ALBANY_CAMPUS_JOB_ID,
      sceneId: AUTHORED_ALBANY_CAMPUS_SCENE_ID,
      legacyJob: AUTHORED_ALBANY_CAMPUS_LEGACY_JOB,
      acceptedSourceWorldHashes: new Set([AUTHORED_ALBANY_CAMPUS_PREDECESSOR_WORLD_HASH]),
    }),
    Object.freeze({
      sourceWorldHash: AUTHORED_ALBANY_STATION_PREDECESSOR_WORLD_HASH,
      jobId: AUTHORED_ALBANY_STATION_JOB_ID,
      sceneId: AUTHORED_ALBANY_STATION_SCENE_ID,
      legacyJob: AUTHORED_ALBANY_STATION_LEGACY_JOB,
      acceptedSourceWorldHashes: new Set([AUTHORED_ALBANY_STATION_PREDECESSOR_WORLD_HASH]),
    }),
    Object.freeze({
      sourceWorldHash: AUTHORED_ALBANY_MARKET_PREDECESSOR_WORLD_HASH,
      jobId: AUTHORED_ALBANY_MARKET_JOB_ID,
      sceneId: AUTHORED_ALBANY_MARKET_SCENE_ID,
      legacyJob: AUTHORED_ALBANY_MARKET_LEGACY_JOB,
      acceptedSourceWorldHashes: new Set([AUTHORED_ALBANY_MARKET_PREDECESSOR_WORLD_HASH]),
    }),
    Object.freeze({
      sourceWorldHash: AUTHORED_ALBANY_GREENWAY_PREDECESSOR_WORLD_HASH,
      jobId: AUTHORED_ALBANY_GREENWAY_JOB_ID,
      sceneId: AUTHORED_ALBANY_GREENWAY_JOB_SCENE_ID,
      legacyJob: AUTHORED_ALBANY_GREENWAY_LEGACY_JOB,
      acceptedSourceWorldHashes: new Set([
        AUTHORED_ALBANY_MARKET_PREDECESSOR_WORLD_HASH,
        AUTHORED_ALBANY_GREENWAY_PREDECESSOR_WORLD_HASH,
      ]),
    }),
  ]);

export function authoredLocalJobLegacyOptionId(sourceWorldHash: string): string {
  return `legacy_generic@${sourceWorldHash}`;
}

export const AUTHORED_ALBANY_WORKS_LEGACY_OPTION_ID = authoredLocalJobLegacyOptionId(
  OVERWORLD_AUTHORED_LOCAL_JOB_PREDECESSOR_WORLD_HASH,
);

export const AUTHORED_ALBANY_STATION_LEGACY_OPTION_ID = authoredLocalJobLegacyOptionId(
  AUTHORED_ALBANY_STATION_PREDECESSOR_WORLD_HASH,
);

export function authoredLocalJobLegacyDefinitionForJob(
  jobId: string,
  definitions: readonly AuthoredLocalJobLegacyDefinition[] = AUTHORED_LOCAL_JOB_LEGACY_DEFINITIONS,
): AuthoredLocalJobLegacyDefinition | null {
  return definitions.find((definition) => definition.jobId === jobId) ?? null;
}

export function authoredLocalJobLegacyCompletion(
  jobId: string,
  proof: OverworldLocalSceneProof | undefined,
  definitions: readonly AuthoredLocalJobLegacyDefinition[] = AUTHORED_LOCAL_JOB_LEGACY_DEFINITIONS,
): AuthoredLocalJobLegacyCompletion | null {
  if (!proof) return null;
  const definition = definitions.find(
    (candidate) =>
      candidate.jobId === jobId &&
      candidate.sceneId === proof.sceneId &&
      (candidate.sourceWorldHash === proof.sourceWorldHash ||
        candidate.acceptedSourceWorldHashes?.has(proof.sourceWorldHash ?? "")),
  );
  if (!definition) return null;
  const sourceWorldHash = proof.sourceWorldHash ?? definition.sourceWorldHash;
  const optionId = authoredLocalJobLegacyOptionId(sourceWorldHash);
  return proof.optionId === optionId ? { definition, optionId } : null;
}

export function describeAuthoredLocalJobLegacyAction(
  completion: AuthoredLocalJobLegacyCompletion,
  area: OverworldArea | null,
) {
  return describeOverworldJobAction(completion.definition.legacyJob, area);
}

/**
 * Normalize one exact generic predecessor entry into an authored-scene marker.
 * The caller supplies the independently replayed decision boundary, when one
 * exists; old pre-registration completions intentionally remain boundaryless.
 */
export function migrateAuthoredLocalJobLegacyEntry(args: {
  area: OverworldArea | null;
  boundary?: OverworldJournalDecisionBoundary | undefined;
  currentJob: OverworldLocalJob;
  definition: AuthoredLocalJobLegacyDefinition;
  entry: OverworldJournalEntry;
  sourceWorldHash?: string | undefined;
  townName: string;
}): OverworldJournalEntry {
  if (
    args.currentJob.id !== args.definition.jobId ||
    args.currentJob.authored_scene?.id !== args.definition.sceneId
  ) {
    throw new Error(
      `Authored local-job migration target does not match registered scene "${args.definition.sceneId}".`,
    );
  }
  const sourceWorldHash = args.sourceWorldHash ?? args.definition.sourceWorldHash;
  if (
    sourceWorldHash !== args.definition.sourceWorldHash &&
    !args.definition.acceptedSourceWorldHashes?.has(sourceWorldHash)
  ) {
    throw new Error(
      `Authored local-job predecessor for "${args.definition.jobId}" names an unsupported source manifest.`,
    );
  }
  const completion = {
    definition: args.definition,
    optionId: authoredLocalJobLegacyOptionId(sourceWorldHash),
  };
  const expected = describeAuthoredLocalJobLegacyAction(completion, args.area);
  if (
    args.entry.id !== `job:${args.definition.jobId}` ||
    args.entry.kind !== expected.kind ||
    args.entry.title !== expected.title ||
    args.entry.text !== expected.text ||
    args.entry.town !== args.townName ||
    args.entry.localSceneProof !== undefined
  ) {
    throw new Error(
      `Authored local-job predecessor entry for "${args.definition.jobId}" does not match its exact trusted copy.`,
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

/** Backward-compatible named predicate for callers/tests from the first conversion. */
export function isAuthoredAlbanyWorksLegacyProof(
  jobId: string,
  proof: OverworldLocalSceneProof | undefined,
): proof is OverworldLocalSceneProof & { sourceWorldHash: string } {
  return (
    authoredLocalJobLegacyCompletion(jobId, proof)?.definition.jobId ===
    AUTHORED_ALBANY_WORKS_JOB_ID
  );
}

/** Backward-compatible exact Works copy helper. */
export function describeAuthoredAlbanyWorksLegacyAction(area: OverworldArea | null) {
  const definition = authoredLocalJobLegacyDefinitionForJob(AUTHORED_ALBANY_WORKS_JOB_ID);
  if (!definition) throw new Error("Albany Works legacy semantics are not registered.");
  return describeAuthoredLocalJobLegacyAction(
    { definition, optionId: authoredLocalJobLegacyOptionId(definition.sourceWorldHash) },
    area,
  );
}
