import type { OverworldLocalEvent } from "./overworld.js";
import { describeOverworldEventResolution } from "./session_event_resolution.js";
import type {
  OverworldJournalDecisionBoundary,
  OverworldJournalEntry,
  OverworldLocalSceneProof,
} from "./session_snapshot.js";

/** Exact ff630a1e manifest hash; this migration does not accept semantic lookalikes. */
export const WINTER_RETURN_DOCKET_PREDECESSOR_WORLD_HASH =
  "815a138cbeeafbc9595c04e37260ccaba9d2d52d6a3341b3c38afe9eade62636";
/**
 * Exact still-supported manifests that carried the same generic Civic event
 * and job copy. Each entry remains independently fenced by the restore
 * migration and exact journal-copy validation.
 */
export const WINTER_RETURN_DOCKET_GENERIC_PREDECESSOR_WORLD_HASHES: ReadonlySet<string> = new Set([
  "39d32c027d2e826f476dd299bb95cc3911994ec92b4fbf297be8d1216e5b6151",
  "b9416e3c43d9d54085ed9465b4d875811daebaf9834793d3f4a1ffca93b486c4",
  "cad75dafc291709f1d5c756dd70dd1002260bb06ca87d8e1e90aaf905f5f05c7",
  "1d12330f65743a8a2c124f9dae3cf145e6fdcbca9ec59a4c699ecd8757e8e47b",
  "07c2864bcad6eaadbd32e8ecff4460ddb7b63e6ed36b0316f4264aa866c1aa44",
  "2dbc97e2de8063be7b3a49fe3cb9108e8f80270d7d118efd781381659dba97c4",
  "742aa205a254b6f4382749fb63742caf1606024a1f6c044c2f433fda8dac6090",
  "f5835e15e6ccf5432ea6b39b87edf957ebc3ffb8a2518b48b46098f09aa92572",
  "2d10f959279a12166d521a774779acc46481fb6ff40d5982f9c955a30677a7b6",
  "1e74d32c28c3d563f6e8103034768506e25f13ff1f8e410b190cbb344589add8",
  "abd3b623a502b688a501bceae68994a4eb0e591d450420b5093532b5dae22179",
  "634fd4e93143343fd813edd9c59d3a8c098c0d78b94497cf689988492de154e3",
  "50350884ebb7d118849fca040256a19c0c63ed4bfe3353d4cd202ee7a6ba8e7f",
  "a2ddc6e9042a208f2821451f10b0152874ef55bc77b0f7801f3ea58591357474",
  "69604947643a24fc2d7c2377a85963742282ac7f83e7cec18a58bfc5eb8f53fc",
  "9b8cc75b05e77af160f46dbcd177333cc0f27af89e56f504af0bf6c6a2422c31",
  WINTER_RETURN_DOCKET_PREDECESSOR_WORLD_HASH,
]);
export const AUTHORED_ALBANY_CHARTER_EVENT_ID = "albany_city__civic_core__event";
export const AUTHORED_ALBANY_CHARTER_EVENT_SCENE_ID = "albany:winter-return-charter-record";

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

export function authoredLocalEventLegacyOptionId(sourceWorldHash: string): string {
  return `legacy_generic@${sourceWorldHash}`;
}

export const AUTHORED_ALBANY_CHARTER_LEGACY_OPTION_ID = authoredLocalEventLegacyOptionId(
  WINTER_RETURN_DOCKET_PREDECESSOR_WORLD_HASH,
);

export type AuthoredAlbanyCharterLegacyCompletion = Readonly<{
  legacyEvent: OverworldLocalEvent;
  optionId: string;
  sourceWorldHash: string;
}>;

export function authoredAlbanyCharterLegacyCompletion(
  eventId: string,
  proof: OverworldLocalSceneProof | undefined,
): AuthoredAlbanyCharterLegacyCompletion | null {
  if (
    eventId === AUTHORED_ALBANY_CHARTER_EVENT_ID &&
    proof?.sceneId === AUTHORED_ALBANY_CHARTER_EVENT_SCENE_ID &&
    proof.sourceWorldHash !== undefined &&
    WINTER_RETURN_DOCKET_GENERIC_PREDECESSOR_WORLD_HASHES.has(proof.sourceWorldHash) &&
    proof.optionId === authoredLocalEventLegacyOptionId(proof.sourceWorldHash)
  ) {
    return {
      legacyEvent: AUTHORED_ALBANY_CHARTER_LEGACY_EVENT,
      optionId: proof.optionId,
      sourceWorldHash: proof.sourceWorldHash,
    };
  }
  return null;
}

export function migrateAuthoredAlbanyCharterLegacyEntry(args: {
  boundary?: OverworldJournalDecisionBoundary | undefined;
  currentEvent: OverworldLocalEvent;
  entry: OverworldJournalEntry;
  region: string;
  sourceWorldHash: string;
  townName: string;
}): OverworldJournalEntry {
  if (
    args.currentEvent.id !== AUTHORED_ALBANY_CHARTER_EVENT_ID ||
    args.currentEvent.authored_scene?.id !== AUTHORED_ALBANY_CHARTER_EVENT_SCENE_ID
  ) {
    throw new Error(
      `Authored local-event migration target does not match scene "${AUTHORED_ALBANY_CHARTER_EVENT_SCENE_ID}".`,
    );
  }
  if (!WINTER_RETURN_DOCKET_GENERIC_PREDECESSOR_WORLD_HASHES.has(args.sourceWorldHash)) {
    throw new Error("Authored charter-event predecessor names an unsupported source manifest.");
  }
  const expected = describeOverworldEventResolution(
    AUTHORED_ALBANY_CHARTER_LEGACY_EVENT,
    args.townName,
    args.region,
  );
  if (
    args.entry.id !== `resolve:${AUTHORED_ALBANY_CHARTER_EVENT_ID}` ||
    args.entry.kind !== "resolution" ||
    args.entry.title !== expected.title ||
    args.entry.text !== expected.text ||
    args.entry.town !== args.townName ||
    args.entry.localSceneProof !== undefined
  ) {
    throw new Error(
      `Authored charter-event predecessor entry does not match its exact trusted copy.`,
    );
  }
  return Object.freeze({
    ...args.entry,
    localSceneProof: {
      sceneId: AUTHORED_ALBANY_CHARTER_EVENT_SCENE_ID,
      optionId: authoredLocalEventLegacyOptionId(args.sourceWorldHash),
      sourceWorldHash: args.sourceWorldHash,
      ...(args.boundary ? { boundary: { ...args.boundary } } : {}),
    },
  });
}
