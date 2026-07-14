import { hashState } from "../core/hash.js";
import {
  cloneCampaignCharacterState,
  createInitialCampaignCharacterState,
  type CampaignCharacterState,
} from "./campaign_character_state.js";
import {
  getOpeningRegistrationProfile,
  parseOpeningRegistration,
  type OpeningRegistration,
  type OpeningRegistrationProfile,
} from "./opening_registration.js";
import { overworldContactTalkJournalId } from "./overworld.js";
import { parseTimeLabel } from "./session_journal_codec.js";
import type { OverworldJournalEntry } from "./session_snapshot.js";

export const OPENING_REGISTRATION_JOURNAL_PREFIX = "registration:" as const;
export const OPENING_REGISTRATION_LEGACY_JOURNAL_PREFIX = "registration_legacy:" as const;
export const OPENING_REGISTRATION_OFFER_JOURNAL_PREFIX = "registration_offer:" as const;

const OPENING_REGISTRATION_LEGACY_JOURNAL_TITLE = "Legacy journey: registration grandfathered";
const OPENING_REGISTRATION_LEGACY_JOURNAL_TEXT =
  "This journey began before Albany required Relief Compact background registration. Its neutral campaign record is grandfathered; new journeys must register with Rowan Quill.";

export type OpeningRegistrationJournalDraft = Readonly<
  Pick<OverworldJournalEntry, "id" | "kind" | "title" | "text">
>;

export type OpeningRegistrationJournalProof = Readonly<{
  characterAtRegistration: CampaignCharacterState;
  offered: boolean;
  offerBoundary: NonNullable<OverworldJournalEntry["registrationBoundary"]> | null;
  profile: OpeningRegistrationProfile | null;
  selectionBoundary: NonNullable<OverworldJournalEntry["registrationBoundary"]> | null;
  journalIndex: number | null;
  recordedAt: number | null;
}>;

export function openingRegistrationOfferJournalId(registrationId: string): string {
  return `${OPENING_REGISTRATION_OFFER_JOURNAL_PREFIX}${registrationId}`;
}

export function openingRegistrationJournalId(registrationId: string, profileId: string): string {
  return `${OPENING_REGISTRATION_JOURNAL_PREFIX}${registrationId}:${profileId}`;
}

export function openingRegistrationLegacySourceWorldHash(entryId: string): string | null {
  if (!entryId.startsWith(OPENING_REGISTRATION_LEGACY_JOURNAL_PREFIX)) return null;
  const sourceWorldHash = entryId.slice(OPENING_REGISTRATION_LEGACY_JOURNAL_PREFIX.length);
  return /^[0-9a-f]{64}$/.test(sourceWorldHash) ? sourceWorldHash : null;
}

export function openingRegistrationLegacyJournalDraft(
  sourceWorldHash: string,
): OpeningRegistrationJournalDraft {
  if (!/^[0-9a-f]{64}$/.test(sourceWorldHash)) {
    throw new Error(`Invalid legacy opening registration source hash "${sourceWorldHash}".`);
  }
  return Object.freeze({
    id: `${OPENING_REGISTRATION_LEGACY_JOURNAL_PREFIX}${sourceWorldHash}`,
    kind: "registration_legacy" as const,
    title: OPENING_REGISTRATION_LEGACY_JOURNAL_TITLE,
    text: OPENING_REGISTRATION_LEGACY_JOURNAL_TEXT,
  });
}

export function openingRegistrationJournalDraft(
  registration: OpeningRegistration,
  profileId: string,
): OpeningRegistrationJournalDraft {
  const parsed = parseOpeningRegistration(registration);
  const profile = getOpeningRegistrationProfile(parsed, profileId);
  if (!profile) {
    throw new Error(`Unknown opening registration profile "${profileId}".`);
  }
  return Object.freeze({
    id: openingRegistrationJournalId(parsed.id, profile.id),
    kind: "registration" as const,
    title: `Registered: ${profile.title}`,
    text: `${profile.summary} ${profile.preview} ${profile.consequence}`,
  });
}

export function openingRegistrationOfferJournalDraft(
  registration: OpeningRegistration,
): OpeningRegistrationJournalDraft {
  const parsed = parseOpeningRegistration(registration);
  return Object.freeze({
    id: openingRegistrationOfferJournalId(parsed.id),
    kind: "registration_offer" as const,
    title: parsed.title,
    text: parsed.message,
  });
}

export function allOpeningRegistrationJournalDrafts(
  registration: OpeningRegistration,
): readonly OpeningRegistrationJournalDraft[] {
  const parsed = parseOpeningRegistration(registration);
  return Object.freeze(
    parsed.profiles.map((profile) => openingRegistrationJournalDraft(parsed, profile.id)),
  );
}

export function openingRegistrationJournalEntry(args: {
  registration: OpeningRegistration;
  profileId: string;
  town: string;
  recordedAt: string;
  registrationBoundary: NonNullable<OverworldJournalEntry["registrationBoundary"]>;
}): OverworldJournalEntry {
  const draft = openingRegistrationJournalDraft(args.registration, args.profileId);
  const registrationBoundary = Object.freeze({ ...args.registrationBoundary });
  return Object.freeze({
    ...draft,
    town: args.town,
    recordedAt: args.recordedAt,
    registrationBoundary,
  });
}

export function openingRegistrationOfferJournalEntry(args: {
  registration: OpeningRegistration;
  town: string;
  recordedAt: string;
  registrationBoundary: NonNullable<OverworldJournalEntry["registrationBoundary"]>;
}): OverworldJournalEntry {
  const registrationBoundary = Object.freeze({ ...args.registrationBoundary });
  return Object.freeze({
    ...openingRegistrationOfferJournalDraft(args.registration),
    town: args.town,
    recordedAt: args.recordedAt,
    registrationBoundary,
  });
}

export function openingRegistrationLegacyJournalEntry(args: {
  sourceWorldHash: string;
  town: string;
  recordedAt: string;
  registrationBoundary: NonNullable<OverworldJournalEntry["registrationBoundary"]>;
}): OverworldJournalEntry {
  const registrationBoundary = Object.freeze({ ...args.registrationBoundary });
  return Object.freeze({
    ...openingRegistrationLegacyJournalDraft(args.sourceWorldHash),
    town: args.town,
    recordedAt: args.recordedAt,
    registrationBoundary,
  });
}

/**
 * Recover the only legal character baseline from journal evidence. Registration
 * is a zero-minute choice made immediately after the authored contact line and
 * before any quest completion. Those constraints make the selected package
 * replayable without trusting the mutable character payload in the save.
 */
export function proveOpeningRegistrationJournal(args: {
  registration: OpeningRegistration | null | undefined;
  journalEntries: readonly OverworldJournalEntry[];
  expectedTown: string | null;
}): OpeningRegistrationJournalProof {
  const entries = args.journalEntries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.kind === "registration");
  const offers = args.journalEntries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.kind === "registration_offer");
  if (entries.length > 1) {
    throw new Error("Overworld session snapshot must contain at most one opening registration.");
  }
  if (offers.length > 1) {
    throw new Error(
      "Overworld session snapshot must contain at most one opening registration offer.",
    );
  }
  if (entries.length === 0 && offers.length === 0) {
    return Object.freeze({
      characterAtRegistration: createInitialCampaignCharacterState(),
      offered: false,
      offerBoundary: null,
      profile: null,
      selectionBoundary: null,
      journalIndex: null,
      recordedAt: null,
    });
  }
  if (!args.registration) {
    throw new Error(
      "Overworld session snapshot has opening registration evidence, but this world has no opening registration.",
    );
  }
  const registration = parseOpeningRegistration(args.registration);
  const offered = offers[0];
  if (!offered) {
    throw new Error("Overworld session snapshot registration has no replayable opening offer.");
  }
  const expectedOffer = openingRegistrationOfferJournalDraft(registration);
  if (
    offered.entry.id !== expectedOffer.id ||
    offered.entry.title !== expectedOffer.title ||
    offered.entry.text !== expectedOffer.text
  ) {
    throw new Error(
      `Overworld session snapshot registration offer "${offered.entry.id}" does not match its authored copy.`,
    );
  }
  if (args.expectedTown !== null && offered.entry.town !== args.expectedTown) {
    throw new Error(
      `Overworld session snapshot registration offer "${offered.entry.id}" is bound to town "${offered.entry.town}", expected "${args.expectedTown}".`,
    );
  }
  const offerBoundary = offered.entry.registrationBoundary;
  if (!offerBoundary) {
    throw new Error(
      "Overworld session snapshot registration offer has no durable registration boundary.",
    );
  }
  const expectedContactId = overworldContactTalkJournalId(registration.contact, null);
  const contact = args.journalEntries
    .map((entry, index) => ({ entry, index }))
    .find(
      ({ entry, index }) =>
        index > offered.index && entry.kind === "contact" && entry.id === expectedContactId,
    );
  if (!contact) {
    throw new Error(
      "Overworld session snapshot registration offer has no earlier authored contact conversation.",
    );
  }
  const offeredAt = parseTimeLabel(offered.entry.recordedAt);
  if (
    offerBoundary.townId !== registration.home ||
    offerBoundary.areaId !== registration.area ||
    offerBoundary.minutes !== offeredAt
  ) {
    throw new Error(
      "Overworld session snapshot registration offer boundary does not match its authored location and time.",
    );
  }
  const contactedAt = parseTimeLabel(contact.entry.recordedAt);
  const immediateOffer = contact.index === offered.index + 1 && contactedAt === offeredAt;
  const delayedReoffer = contactedAt < offeredAt;
  if (!immediateOffer && !delayedReoffer) {
    throw new Error(
      "Overworld session snapshot registration offer must immediately follow its authored contact conversation at the same time or be a later re-offer.",
    );
  }
  for (
    let olderIndex = offered.index + 1;
    olderIndex < args.journalEntries.length;
    olderIndex += 1
  ) {
    if (
      args.journalEntries[olderIndex]!.kind === "quest" ||
      args.journalEntries[olderIndex]!.kind === "quest_done"
    ) {
      throw new Error(
        "Overworld session snapshot registration offer cannot follow a started or completed quest.",
      );
    }
  }

  if (entries.length === 0) {
    if (offered.index !== 0) {
      throw new Error(
        "Overworld session snapshot pending registration offer must remain the latest journal boundary.",
      );
    }
    return Object.freeze({
      characterAtRegistration: createInitialCampaignCharacterState(),
      offered: true,
      offerBoundary: { ...offerBoundary },
      profile: null,
      selectionBoundary: null,
      journalIndex: null,
      recordedAt: offeredAt,
    });
  }

  const { entry, index } = entries[0]!;
  const profile = registration.profiles.find(
    (candidate) => openingRegistrationJournalId(registration.id, candidate.id) === entry.id,
  );
  if (!profile) {
    throw new Error(
      `Overworld session snapshot registration entry references an unknown profile in "${entry.id}".`,
    );
  }
  const expected = openingRegistrationJournalDraft(registration, profile.id);
  if (entry.title !== expected.title || entry.text !== expected.text) {
    throw new Error(
      `Overworld session snapshot registration entry "${entry.id}" does not match its authored copy.`,
    );
  }
  if (args.expectedTown !== null && entry.town !== args.expectedTown) {
    throw new Error(
      `Overworld session snapshot registration entry "${entry.id}" is bound to town "${entry.town}", expected "${args.expectedTown}".`,
    );
  }
  const selectionBoundary = entry.registrationBoundary;
  if (!selectionBoundary) {
    throw new Error(
      "Overworld session snapshot registration selection has no durable registration boundary.",
    );
  }

  if (offered.index !== index + 1 || offered.entry.recordedAt !== entry.recordedAt) {
    throw new Error(
      "Overworld session snapshot registration must immediately follow its opening offer at the same time.",
    );
  }
  const expectedDecisionNumber = offerBoundary.acceptedDecisions + 1;
  const expectedLastDecision = {
    number: expectedDecisionNumber,
    surface: "overworld" as const,
    actionId: `campaign_story:${registration.id}:${profile.id}`,
    reason: "situation_changed" as const,
  };
  const expectedDecisionProofHash = hashState({
    previous: offerBoundary.decisionProofHash,
    ...expectedLastDecision,
  });
  if (
    selectionBoundary.acceptedDecisions !== expectedDecisionNumber ||
    selectionBoundary.decisionProofHash !== expectedDecisionProofHash ||
    selectionBoundary.townId !== offerBoundary.townId ||
    selectionBoundary.areaId !== offerBoundary.areaId ||
    selectionBoundary.minutes !== offerBoundary.minutes
  ) {
    throw new Error(
      "Overworld session snapshot registration selection does not match its journey decision boundary.",
    );
  }
  return Object.freeze({
    characterAtRegistration: cloneCampaignCharacterState(profile.character),
    offered: true,
    offerBoundary: { ...offerBoundary },
    profile,
    selectionBoundary: { ...selectionBoundary },
    journalIndex: index,
    recordedAt: parseTimeLabel(entry.recordedAt),
  });
}
