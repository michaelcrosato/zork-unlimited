import type { OverworldJournalEntry } from "./session_snapshot.js";
import type { OpeningPreparation, OpeningPreparationProfile } from "./opening_preparation.js";
import { openingPreparationJournalId } from "./opening_preparation_journal.js";
import { DROVER_ROUTE_FAIL_FORWARD_PREDECESSOR_PREVIEW } from "./drover_route_fail_forward_legacy.js";

export type OpeningPreparationJournalCopyField = Extract<
  keyof OpeningPreparationProfile,
  "summary" | "preview" | "consequence"
>;

export type OpeningPreparationJournalCopyReplacement = Readonly<{
  field: OpeningPreparationJournalCopyField;
  predecessor: string;
}>;

export type OpeningPreparationJournalCopyMigration = Readonly<{
  id: string;
  profileId: string;
  sourceWorldHashes: ReadonlySet<string>;
  replacements: readonly OpeningPreparationJournalCopyReplacement[];
}>;

/** Exact manifest immediately before failed Drover checks became pressure-neutral. */
export const OVERWORLD_DROVER_ROUTE_FAIL_FORWARD_PREDECESSOR_WORLD_HASH =
  "1d8ed584e39c462a7eb5132c23796ea39b8f76a545add86a88080ecf926b9f9c";

/**
 * Exact supported manifests that shipped opening preparation with the same
 * predecessor copy. Earlier hashes intentionally remain absent: they predate
 * the preparation scene, so a matching journal entry would be later evidence.
 */
export const OVERWORLD_DROVER_ROUTE_FAIL_FORWARD_TRUSTED_PREDECESSOR_WORLD_HASHES: ReadonlySet<string> =
  new Set([
    "f5835e15e6ccf5432ea6b39b87edf957ebc3ffb8a2518b48b46098f09aa92572",
    "2d10f959279a12166d521a774779acc46481fb6ff40d5982f9c955a30677a7b6",
    "1e74d32c28c3d563f6e8103034768506e25f13ff1f8e410b190cbb344589add8",
    "abd3b623a502b688a501bceae68994a4eb0e591d450420b5093532b5dae22179",
    "634fd4e93143343fd813edd9c59d3a8c098c0d78b94497cf689988492de154e3",
    "50350884ebb7d118849fca040256a19c0c63ed4bfe3353d4cd202ee7a6ba8e7f",
    "a2ddc6e9042a208f2821451f10b0152874ef55bc77b0f7801f3ea58591357474",
    "69604947643a24fc2d7c2377a85963742282ac7f83e7cec18a58bfc5eb8f53fc",
    "9b8cc75b05e77af160f46dbcd177333cc0f27af89e56f504af0bf6c6a2422c31",
    "815a138cbeeafbc9595c04e37260ccaba9d2d52d6a3341b3c38afe9eade62636",
    "db23dea42bb2cd62beb8ac5871e4b5c74ee127c05b36941b4e170247ab8a5858",
    "be2bb804d5e107449aeab1fd6e96cbfb6f0b71d587ee40283d0aac8b28298f6f",
    "a27b2db04b359e9ca38380ca2b0b7a328df4008d1f899bf65e1332d0998aa6b2",
    "9ae4b2be87d9f5bf0ede03aed8c7c775bdd7ac327dfd96c2f1e4b2154ee610f0",
    "8e0bd691f77d7be3154866531b18c5e8c2920e51317beab97bf8d267ae6d6bfa",
    "9238b5f273e03e0a49487058233443e872c18a542525dcd449531708cd3003e5",
    "53afa5830619f12b547f8a6c9d55798477a09676afe02debba155081ea115edc",
    "282cf14228d10495a12632919a50567960d06325e9182aa77232fc1c333d0aa9",
    "951c541f10fefa869449427ef15666a7546ced7172144c85866e465d6f3f9de0",
    "42357dc467518106d3a4753a246ea672de03638a2d8f0aca240f5818a579ed3d",
    "a37f9fc6bc1752017c69c175efe506e97c393f3052d9ae27a7c69b1d6c62962f",
    OVERWORLD_DROVER_ROUTE_FAIL_FORWARD_PREDECESSOR_WORLD_HASH,
  ]);

const OPENING_PREPARATION_JOURNAL_COPY_MIGRATIONS: readonly OpeningPreparationJournalCopyMigration[] =
  Object.freeze([
    Object.freeze({
      id: "drover_route_fail_forward",
      profileId: "albany:prep_drover_route",
      sourceWorldHashes: OVERWORLD_DROVER_ROUTE_FAIL_FORWARD_TRUSTED_PREDECESSOR_WORLD_HASHES,
      replacements: Object.freeze([
        Object.freeze({
          field: "preview" as const,
          predecessor: DROVER_ROUTE_FAIL_FORWARD_PREDECESSOR_PREVIEW,
        }),
      ]),
    }),
  ]);

export function openingPreparationJournalCopyMigrationsForSourceWorldHash(
  sourceWorldHash: string,
): readonly OpeningPreparationJournalCopyMigration[] {
  return OPENING_PREPARATION_JOURNAL_COPY_MIGRATIONS.filter((migration) =>
    migration.sourceWorldHashes.has(sourceWorldHash),
  );
}

function replaceExactDeclaredCopy(args: {
  entry: OverworldJournalEntry;
  migrationId: string;
  before: string;
  after: string;
}): OverworldJournalEntry {
  const firstMatch = args.entry.text.indexOf(args.before);
  if (
    firstMatch < 0 ||
    args.entry.text.indexOf(args.before, firstMatch + args.before.length) >= 0
  ) {
    throw new Error(
      `Opening preparation copy migration "${args.migrationId}" journal entry "${args.entry.id}" does not match its exact authored copy.`,
    );
  }
  return Object.freeze({
    ...args.entry,
    text: `${args.entry.text.slice(0, firstMatch)}${args.after}${args.entry.text.slice(firstMatch + args.before.length)}`,
  });
}

export function normalizeOpeningPreparationJournalCopies(args: {
  preparation: OpeningPreparation | null;
  journalEntries: readonly OverworldJournalEntry[];
  migrations: readonly OpeningPreparationJournalCopyMigration[];
}): OverworldJournalEntry[] {
  let journalEntries = [...args.journalEntries];
  for (const migration of args.migrations) {
    const profile = args.preparation?.profiles.find(
      (candidate) => candidate.id === migration.profileId,
    );
    if (!args.preparation || !profile) {
      throw new Error(
        `Opening preparation copy migration "${migration.id}" target profile is absent from the current manifest.`,
      );
    }
    const selectionId = openingPreparationJournalId(args.preparation.id, profile.id);
    journalEntries = journalEntries.map((entry) => {
      if (entry.id !== selectionId) return entry;
      if (entry.kind !== "preparation") {
        throw new Error(
          `Opening preparation copy migration "${migration.id}" journal entry "${entry.id}" is not a preparation selection.`,
        );
      }
      return migration.replacements.reduce(
        (current, replacement) =>
          replaceExactDeclaredCopy({
            entry: current,
            migrationId: migration.id,
            before: replacement.predecessor,
            after: profile[replacement.field],
          }),
        entry,
      );
    });
  }
  return journalEntries;
}
