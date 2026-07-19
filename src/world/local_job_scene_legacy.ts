import type { OverworldArea, OverworldLocalJob } from "./overworld.js";
import type {
  OverworldJournalDecisionBoundary,
  OverworldJournalEntry,
  OverworldLocalSceneProof,
} from "./session_snapshot.js";
import { describeOverworldJobAction } from "./local_actions.js";

export type AuthoredLocalJobLegacyDefinition = Readonly<{
  /** Hash whose generic job copy and terms are preserved by this marker. */
  sourceWorldHash: string;
  jobId: string;
  sceneId: string;
  legacyJob: OverworldLocalJob;
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

export const AUTHORED_LOCAL_JOB_LEGACY_DEFINITIONS: readonly AuthoredLocalJobLegacyDefinition[] =
  Object.freeze([
    Object.freeze({
      sourceWorldHash: OVERWORLD_AUTHORED_LOCAL_JOB_PREDECESSOR_WORLD_HASH,
      jobId: AUTHORED_ALBANY_WORKS_JOB_ID,
      sceneId: AUTHORED_ALBANY_WORKS_SCENE_ID,
      legacyJob: AUTHORED_ALBANY_WORKS_LEGACY_JOB,
    }),
  ]);

export function authoredLocalJobLegacyOptionId(sourceWorldHash: string): string {
  return `legacy_generic@${sourceWorldHash}`;
}

export const AUTHORED_ALBANY_WORKS_LEGACY_OPTION_ID = authoredLocalJobLegacyOptionId(
  OVERWORLD_AUTHORED_LOCAL_JOB_PREDECESSOR_WORLD_HASH,
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
      candidate.sourceWorldHash === proof.sourceWorldHash,
  );
  if (!definition) return null;
  const optionId = authoredLocalJobLegacyOptionId(definition.sourceWorldHash);
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
  const completion = {
    definition: args.definition,
    optionId: authoredLocalJobLegacyOptionId(args.definition.sourceWorldHash),
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
      sourceWorldHash: args.definition.sourceWorldHash,
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
