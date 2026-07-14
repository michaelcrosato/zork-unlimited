import { hashState } from "../core/hash.js";
import {
  cloneCampaignCharacterState,
  type CampaignCharacterState,
} from "./campaign_character_state.js";
import {
  applyOpeningLeadSourceOption,
  formatOpeningLeadSourceCost,
  openingLeadSourceOptionById,
  parseOpeningLeadSource,
  type OpeningLeadSource,
  type OpeningLeadSourceOption,
  type OpeningLeadSourceTerms,
} from "./opening_lead_source.js";
import type { OpeningRegistrationJournalProof } from "./opening_registration_journal.js";
import { parseTimeLabel } from "./session_journal_codec.js";
import type {
  OverworldJournalDecisionBoundary,
  OverworldJournalEntry,
} from "./session_snapshot.js";

export const OPENING_LEAD_SOURCE_JOURNAL_PREFIX = "lead_source:" as const;
export const OPENING_LEAD_SOURCE_LEGACY_JOURNAL_PREFIX = "lead_source_legacy:" as const;
export const OPENING_LEAD_SOURCE_OFFER_JOURNAL_PREFIX = "lead_source_offer:" as const;

const OPENING_LEAD_SOURCE_LEGACY_JOURNAL_TITLE =
  "Legacy journey: Albany source packet grandfathered";
const OPENING_LEAD_SOURCE_LEGACY_JOURNAL_TEXT =
  "This journey received its Wolf-Winter lead before Albany required one certified source packet. The earlier docket remains valid; new journeys must choose which account Rowan attaches.";

export type OpeningLeadSourceJournalDraft = Readonly<
  Pick<OverworldJournalEntry, "id" | "kind" | "title" | "text">
>;

export type OpeningLeadSourceJournalProof = Readonly<{
  characterAfterSource: CampaignCharacterState;
  offered: boolean;
  offerBoundary: OverworldJournalDecisionBoundary | null;
  option: OpeningLeadSourceOption | null;
  selectionBoundary: OverworldJournalDecisionBoundary | null;
  terms: OpeningLeadSourceTerms | null;
  journalIndex: number | null;
  recordedAt: number | null;
}>;

export function openingLeadSourceOfferJournalId(sceneId: string): string {
  return `${OPENING_LEAD_SOURCE_OFFER_JOURNAL_PREFIX}${sceneId}`;
}

export function openingLeadSourceJournalId(sceneId: string, optionId: string): string {
  return `${OPENING_LEAD_SOURCE_JOURNAL_PREFIX}${sceneId}:${optionId}`;
}

export function openingLeadSourceLegacySourceWorldHash(entryId: string): string | null {
  if (!entryId.startsWith(OPENING_LEAD_SOURCE_LEGACY_JOURNAL_PREFIX)) return null;
  const sourceWorldHash = entryId.slice(OPENING_LEAD_SOURCE_LEGACY_JOURNAL_PREFIX.length);
  return /^[0-9a-f]{64}$/.test(sourceWorldHash) ? sourceWorldHash : null;
}

export function openingLeadSourceOfferJournalDraft(
  scene: OpeningLeadSource,
): OpeningLeadSourceJournalDraft {
  const parsed = parseOpeningLeadSource(scene);
  return Object.freeze({
    id: openingLeadSourceOfferJournalId(parsed.id),
    kind: "lead_source_offer" as const,
    title: parsed.title,
    text: parsed.message,
  });
}

export function openingLeadSourceJournalDraft(args: {
  scene: OpeningLeadSource;
  character: CampaignCharacterState;
  optionId: string;
}): OpeningLeadSourceJournalDraft {
  const parsed = parseOpeningLeadSource(args.scene);
  const applied = applyOpeningLeadSourceOption({
    scene: parsed,
    character: args.character,
    optionId: args.optionId,
  });
  const sponsorship = applied.terms.sponsorNote ? ` ${applied.terms.sponsorNote}` : "";
  return Object.freeze({
    id: openingLeadSourceJournalId(parsed.id, applied.option.id),
    kind: "lead_source" as const,
    title: `Certified source: ${applied.option.title}`,
    text: `${applied.option.summary} ${applied.option.preview} Actual cost: ${formatOpeningLeadSourceCost(applied.terms)}.${sponsorship} ${applied.option.consequence}`,
  });
}

export function openingLeadSourceLegacyJournalDraft(
  sourceWorldHash: string,
): OpeningLeadSourceJournalDraft {
  if (!/^[0-9a-f]{64}$/.test(sourceWorldHash)) {
    throw new Error(`Invalid legacy opening lead-source hash "${sourceWorldHash}".`);
  }
  return Object.freeze({
    id: `${OPENING_LEAD_SOURCE_LEGACY_JOURNAL_PREFIX}${sourceWorldHash}`,
    kind: "lead_source_legacy" as const,
    title: OPENING_LEAD_SOURCE_LEGACY_JOURNAL_TITLE,
    text: OPENING_LEAD_SOURCE_LEGACY_JOURNAL_TEXT,
  });
}

function freezeBoundary(
  boundary: OverworldJournalDecisionBoundary,
): OverworldJournalDecisionBoundary {
  return Object.freeze({ ...boundary });
}

export function openingLeadSourceOfferJournalEntry(args: {
  scene: OpeningLeadSource;
  town: string;
  recordedAt: string;
  storyChoiceBoundary: OverworldJournalDecisionBoundary;
}): OverworldJournalEntry {
  return Object.freeze({
    ...openingLeadSourceOfferJournalDraft(args.scene),
    town: args.town,
    recordedAt: args.recordedAt,
    storyChoiceBoundary: freezeBoundary(args.storyChoiceBoundary),
  });
}

export function openingLeadSourceJournalEntry(args: {
  scene: OpeningLeadSource;
  character: CampaignCharacterState;
  optionId: string;
  town: string;
  recordedAt: string;
  storyChoiceBoundary: OverworldJournalDecisionBoundary;
}): OverworldJournalEntry {
  return Object.freeze({
    ...openingLeadSourceJournalDraft(args),
    town: args.town,
    recordedAt: args.recordedAt,
    storyChoiceBoundary: freezeBoundary(args.storyChoiceBoundary),
  });
}

export function openingLeadSourceLegacyJournalEntry(args: {
  sourceWorldHash: string;
  town: string;
  recordedAt: string;
  storyChoiceBoundary: OverworldJournalDecisionBoundary;
}): OverworldJournalEntry {
  return Object.freeze({
    ...openingLeadSourceLegacyJournalDraft(args.sourceWorldHash),
    town: args.town,
    recordedAt: args.recordedAt,
    storyChoiceBoundary: freezeBoundary(args.storyChoiceBoundary),
  });
}

function boundariesEqual(
  left: OverworldJournalDecisionBoundary,
  right: OverworldJournalDecisionBoundary,
): boolean {
  return (
    left.acceptedDecisions === right.acceptedDecisions &&
    left.decisionProofHash === right.decisionProofHash &&
    left.townId === right.townId &&
    left.areaId === right.areaId &&
    left.minutes === right.minutes
  );
}

/** Replay the mandatory source offer and its optional pending/selected state. */
export function proveOpeningLeadSourceJournal(args: {
  scene: OpeningLeadSource | null | undefined;
  registrationProof: OpeningRegistrationJournalProof;
  journalEntries: readonly OverworldJournalEntry[];
  expectedTown: string | null;
}): OpeningLeadSourceJournalProof {
  const selections = args.journalEntries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.kind === "lead_source");
  const offers = args.journalEntries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.kind === "lead_source_offer");
  if (selections.length > 1) {
    throw new Error("Overworld session snapshot must contain at most one opening lead source.");
  }
  if (offers.length > 1) {
    throw new Error(
      "Overworld session snapshot must contain at most one opening lead-source offer.",
    );
  }
  if (selections.length === 0 && offers.length === 0) {
    return Object.freeze({
      characterAfterSource: cloneCampaignCharacterState(
        args.registrationProof.characterAtRegistration,
      ),
      offered: false,
      offerBoundary: null,
      option: null,
      selectionBoundary: null,
      terms: null,
      journalIndex: null,
      recordedAt: null,
    });
  }
  if (!args.scene) {
    throw new Error(
      "Overworld session snapshot has opening lead-source evidence, but this world has no opening lead-source scene.",
    );
  }
  if (!args.registrationProof.profile || args.registrationProof.journalIndex === null) {
    throw new Error(
      "Overworld session snapshot opening lead source has no selected character registration.",
    );
  }
  const scene = parseOpeningLeadSource(args.scene);
  const offered = offers[0];
  if (!offered) {
    throw new Error("Overworld session snapshot lead-source selection has no replayable offer.");
  }
  const expectedOffer = openingLeadSourceOfferJournalDraft(scene);
  if (
    offered.entry.id !== expectedOffer.id ||
    offered.entry.title !== expectedOffer.title ||
    offered.entry.text !== expectedOffer.text
  ) {
    throw new Error(
      `Overworld session snapshot lead-source offer "${offered.entry.id}" does not match its authored copy.`,
    );
  }
  if (args.expectedTown !== null && offered.entry.town !== args.expectedTown) {
    throw new Error(
      `Overworld session snapshot lead-source offer "${offered.entry.id}" is bound to town "${offered.entry.town}", expected "${args.expectedTown}".`,
    );
  }
  const offerBoundary = offered.entry.storyChoiceBoundary;
  const registrationBoundary = args.registrationProof.selectionBoundary;
  if (!offerBoundary || !registrationBoundary) {
    throw new Error(
      "Overworld session snapshot lead-source offer has no durable story-choice boundary.",
    );
  }
  if (
    offered.index + 1 !== args.registrationProof.journalIndex ||
    offered.entry.recordedAt !==
      args.journalEntries[args.registrationProof.journalIndex]!.recordedAt ||
    !boundariesEqual(offerBoundary, registrationBoundary) ||
    offerBoundary.townId !== scene.home ||
    offerBoundary.areaId !== scene.area ||
    offerBoundary.minutes !== parseTimeLabel(offered.entry.recordedAt)
  ) {
    throw new Error(
      "Overworld session snapshot lead-source offer must immediately follow registration at the same world and journey boundary.",
    );
  }
  for (let index = offered.index + 1; index < args.journalEntries.length; index += 1) {
    const kind = args.journalEntries[index]!.kind;
    if (kind === "quest" || kind === "quest_done") {
      throw new Error(
        "Overworld session snapshot lead-source offer cannot follow a started or completed quest.",
      );
    }
  }

  if (selections.length === 0) {
    if (offered.index !== 0) {
      throw new Error(
        "Overworld session snapshot pending lead-source offer must remain the latest journal boundary.",
      );
    }
    return Object.freeze({
      characterAfterSource: cloneCampaignCharacterState(
        args.registrationProof.characterAtRegistration,
      ),
      offered: true,
      offerBoundary: { ...offerBoundary },
      option: null,
      selectionBoundary: null,
      terms: null,
      journalIndex: null,
      recordedAt: parseTimeLabel(offered.entry.recordedAt),
    });
  }

  const selected = selections[0]!;
  const option = scene.options.find(
    (candidate) => openingLeadSourceJournalId(scene.id, candidate.id) === selected.entry.id,
  );
  if (!option || !openingLeadSourceOptionById(scene, option.id)) {
    throw new Error(
      `Overworld session snapshot lead-source entry references an unknown option in "${selected.entry.id}".`,
    );
  }
  const application = applyOpeningLeadSourceOption({
    scene,
    character: args.registrationProof.characterAtRegistration,
    optionId: option.id,
  });
  const expectedSelection = openingLeadSourceJournalDraft({
    scene,
    character: args.registrationProof.characterAtRegistration,
    optionId: option.id,
  });
  if (
    selected.entry.title !== expectedSelection.title ||
    selected.entry.text !== expectedSelection.text
  ) {
    throw new Error(
      `Overworld session snapshot lead-source entry "${selected.entry.id}" does not match its authored terms and copy.`,
    );
  }
  if (args.expectedTown !== null && selected.entry.town !== args.expectedTown) {
    throw new Error(
      `Overworld session snapshot lead-source entry "${selected.entry.id}" is bound to town "${selected.entry.town}", expected "${args.expectedTown}".`,
    );
  }
  const selectionBoundary = selected.entry.storyChoiceBoundary;
  if (!selectionBoundary) {
    throw new Error(
      "Overworld session snapshot lead-source selection has no durable story-choice boundary.",
    );
  }
  if (selected.index + 1 !== offered.index) {
    throw new Error(
      "Overworld session snapshot lead-source selection must immediately follow its offer.",
    );
  }
  const expectedDecisionNumber = offerBoundary.acceptedDecisions + 1;
  const expectedLastDecision = {
    number: expectedDecisionNumber,
    surface: "overworld" as const,
    actionId: `campaign_story:${scene.id}:${option.id}`,
    reason: "situation_changed" as const,
  };
  const expectedDecisionProofHash = hashState({
    previous: offerBoundary.decisionProofHash,
    ...expectedLastDecision,
  });
  const expectedMinutes = offerBoundary.minutes + application.terms.minutes;
  if (
    selectionBoundary.acceptedDecisions !== expectedDecisionNumber ||
    selectionBoundary.decisionProofHash !== expectedDecisionProofHash ||
    selectionBoundary.townId !== offerBoundary.townId ||
    selectionBoundary.areaId !== offerBoundary.areaId ||
    selectionBoundary.minutes !== expectedMinutes ||
    parseTimeLabel(selected.entry.recordedAt) !== expectedMinutes
  ) {
    throw new Error(
      "Overworld session snapshot lead-source selection does not match its journey decision, location, or paid-time boundary.",
    );
  }
  return Object.freeze({
    characterAfterSource: cloneCampaignCharacterState(application.characterAfter),
    offered: true,
    offerBoundary: { ...offerBoundary },
    option,
    selectionBoundary: { ...selectionBoundary },
    terms: { ...application.terms },
    journalIndex: selected.index,
    recordedAt: expectedMinutes,
  });
}
