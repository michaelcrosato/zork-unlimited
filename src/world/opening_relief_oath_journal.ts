import { hashState } from "../core/hash.js";
import {
  cloneCampaignCharacterState,
  type CampaignCharacterState,
} from "./campaign_character_state.js";
import type { OpeningRegistrationJournalProof } from "./opening_registration_journal.js";
import {
  applyOpeningReliefOathOption,
  formatOpeningReliefOathCost,
  openingReliefOathOptionById,
  parseOpeningReliefOath,
  type OpeningReliefOath,
  type OpeningReliefOathOption,
  type OpeningReliefOathTerms,
} from "./opening_relief_oath.js";
import { parseTimeLabel } from "./session_journal_codec.js";
import type {
  OverworldJournalDecisionBoundary,
  OverworldJournalEntry,
} from "./session_snapshot.js";

export const OPENING_RELIEF_OATH_JOURNAL_PREFIX = "relief_oath:" as const;
export const OPENING_RELIEF_OATH_LEGACY_JOURNAL_PREFIX = "relief_oath_legacy:" as const;
export const OPENING_RELIEF_OATH_OFFER_JOURNAL_PREFIX = "relief_oath_offer:" as const;

const WORLD_HASH_PATTERN = /^[0-9a-f]{64}$/;
const OPENING_RELIEF_OATH_LEGACY_JOURNAL_TITLE = "Legacy journey: Albany relief oath grandfathered";
const OPENING_RELIEF_OATH_LEGACY_JOURNAL_TEXT =
  "This journey crossed Albany's relief-oath boundary under a trusted earlier docket. It receives no retroactive oath, access, duty, campaign-character effect, or time cost.";

export type OpeningReliefOathJournalDraft = Readonly<
  Pick<OverworldJournalEntry, "id" | "kind" | "title" | "text">
>;

export type OpeningReliefOathJournalProof = Readonly<{
  characterAfterOath: CampaignCharacterState;
  offered: boolean;
  legacy: boolean;
  legacySourceWorldHash: string | null;
  offerBoundary: OverworldJournalDecisionBoundary | null;
  option: OpeningReliefOathOption | null;
  selectionBoundary: OverworldJournalDecisionBoundary | null;
  terms: OpeningReliefOathTerms | null;
  journalIndex: number | null;
  recordedAt: number | null;
}>;

export function openingReliefOathOfferJournalId(sceneId: string): string {
  return `${OPENING_RELIEF_OATH_OFFER_JOURNAL_PREFIX}${sceneId}`;
}

export function openingReliefOathJournalId(sceneId: string, optionId: string): string {
  return `${OPENING_RELIEF_OATH_JOURNAL_PREFIX}${sceneId}:${optionId}`;
}

export function openingReliefOathLegacySourceWorldHash(entryId: string): string | null {
  if (!entryId.startsWith(OPENING_RELIEF_OATH_LEGACY_JOURNAL_PREFIX)) return null;
  const sourceWorldHash = entryId.slice(OPENING_RELIEF_OATH_LEGACY_JOURNAL_PREFIX.length);
  return WORLD_HASH_PATTERN.test(sourceWorldHash) ? sourceWorldHash : null;
}

export function openingReliefOathOfferJournalDraft(
  scene: OpeningReliefOath,
): OpeningReliefOathJournalDraft {
  const parsed = parseOpeningReliefOath(scene);
  return Object.freeze({
    id: openingReliefOathOfferJournalId(parsed.id),
    kind: "relief_oath_offer" as const,
    title: parsed.title,
    text: parsed.message,
  });
}

export function openingReliefOathJournalDraft(args: {
  scene: OpeningReliefOath;
  character: CampaignCharacterState;
  optionId: string;
}): OpeningReliefOathJournalDraft {
  const scene = parseOpeningReliefOath(args.scene);
  const applied = applyOpeningReliefOathOption({
    scene,
    character: args.character,
    optionId: args.optionId,
  });
  return Object.freeze({
    id: openingReliefOathJournalId(scene.id, applied.option.id),
    kind: "relief_oath" as const,
    title: `Relief oath: ${applied.option.title}`,
    text:
      `${applied.option.summary} ${applied.option.preview} ` +
      `Access: ${applied.option.access} Duty: ${applied.option.duty} ` +
      `Actual cost: ${formatOpeningReliefOathCost(applied.terms)}. ${applied.option.consequence}`,
  });
}

export function allOpeningReliefOathJournalDrafts(
  scene: OpeningReliefOath,
  character: CampaignCharacterState,
): readonly OpeningReliefOathJournalDraft[] {
  const parsed = parseOpeningReliefOath(scene);
  return Object.freeze(
    parsed.options.map((option) =>
      openingReliefOathJournalDraft({
        scene: parsed,
        character,
        optionId: option.id,
      }),
    ),
  );
}

export function openingReliefOathLegacyJournalDraft(
  sourceWorldHash: string,
): OpeningReliefOathJournalDraft {
  if (!WORLD_HASH_PATTERN.test(sourceWorldHash)) {
    throw new Error(`Invalid legacy opening relief-oath hash "${sourceWorldHash}".`);
  }
  return Object.freeze({
    id: `${OPENING_RELIEF_OATH_LEGACY_JOURNAL_PREFIX}${sourceWorldHash}`,
    kind: "relief_oath_legacy" as const,
    title: OPENING_RELIEF_OATH_LEGACY_JOURNAL_TITLE,
    text: OPENING_RELIEF_OATH_LEGACY_JOURNAL_TEXT,
  });
}

function freezeBoundary(
  boundary: OverworldJournalDecisionBoundary,
): OverworldJournalDecisionBoundary {
  return Object.freeze({ ...boundary });
}

export function openingReliefOathOfferJournalEntry(args: {
  scene: OpeningReliefOath;
  town: string;
  recordedAt: string;
  storyChoiceBoundary: OverworldJournalDecisionBoundary;
}): OverworldJournalEntry {
  return Object.freeze({
    ...openingReliefOathOfferJournalDraft(args.scene),
    town: args.town,
    recordedAt: args.recordedAt,
    storyChoiceBoundary: freezeBoundary(args.storyChoiceBoundary),
  });
}

export function openingReliefOathJournalEntry(args: {
  scene: OpeningReliefOath;
  character: CampaignCharacterState;
  optionId: string;
  town: string;
  recordedAt: string;
  storyChoiceBoundary: OverworldJournalDecisionBoundary;
}): OverworldJournalEntry {
  return Object.freeze({
    ...openingReliefOathJournalDraft(args),
    town: args.town,
    recordedAt: args.recordedAt,
    storyChoiceBoundary: freezeBoundary(args.storyChoiceBoundary),
  });
}

/**
 * Migration-only evidence. Restore must supply the same trusted predecessor
 * hash to proof; an ordinary current session cannot mint this authority.
 */
export function openingReliefOathLegacyJournalEntry(args: {
  sourceWorldHash: string;
  town: string;
  recordedAt: string;
  storyChoiceBoundary: OverworldJournalDecisionBoundary;
}): OverworldJournalEntry {
  return Object.freeze({
    ...openingReliefOathLegacyJournalDraft(args.sourceWorldHash),
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

function emptyReliefOathProof(character: CampaignCharacterState): OpeningReliefOathJournalProof {
  return Object.freeze({
    characterAfterOath: cloneCampaignCharacterState(character),
    offered: false,
    legacy: false,
    legacySourceWorldHash: null,
    offerBoundary: null,
    option: null,
    selectionBoundary: null,
    terms: null,
    journalIndex: null,
    recordedAt: null,
  });
}

/**
 * Replay the registration-adjacent relief-oath offer, its paid selection, or
 * one trusted neutral predecessor marker without trusting saved character data.
 */
export function proveOpeningReliefOathJournal(args: {
  scene: OpeningReliefOath | null | undefined;
  registrationProof: OpeningRegistrationJournalProof;
  journalEntries: readonly OverworldJournalEntry[];
  expectedTown: string | null;
  trustedLegacySourceWorldHash?: string | null;
}): OpeningReliefOathJournalProof {
  const selections = args.journalEntries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.kind === "relief_oath");
  const offers = args.journalEntries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.kind === "relief_oath_offer");
  const legacies = args.journalEntries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.kind === "relief_oath_legacy");
  if (selections.length > 1) {
    throw new Error("Overworld session snapshot must contain at most one opening relief oath.");
  }
  if (offers.length > 1) {
    throw new Error(
      "Overworld session snapshot must contain at most one opening relief-oath offer.",
    );
  }
  if (legacies.length > 1) {
    throw new Error(
      "Overworld session snapshot must contain at most one legacy opening relief oath.",
    );
  }
  if (legacies.length > 0 && (selections.length > 0 || offers.length > 0)) {
    throw new Error(
      "Overworld session snapshot cannot combine legacy and current opening relief-oath evidence.",
    );
  }
  if (selections.length === 0 && offers.length === 0 && legacies.length === 0) {
    return emptyReliefOathProof(args.registrationProof.characterAtRegistration);
  }
  if (!args.scene) {
    throw new Error(
      "Overworld session snapshot has opening relief-oath evidence, but this world has no opening relief-oath scene.",
    );
  }
  if (
    !args.registrationProof.profile ||
    args.registrationProof.journalIndex === null ||
    !args.registrationProof.selectionBoundary
  ) {
    throw new Error(
      "Overworld session snapshot opening relief oath has no selected character registration.",
    );
  }
  const scene = parseOpeningReliefOath(args.scene);
  const registrationBoundary = args.registrationProof.selectionBoundary;
  const registrationJournalIndex = args.registrationProof.journalIndex;
  const registrationEntry = args.journalEntries[registrationJournalIndex];
  if (!registrationEntry) {
    throw new Error(
      "Overworld session snapshot opening relief oath cannot locate its registration journal boundary.",
    );
  }

  const legacy = legacies[0];
  if (legacy) {
    const sourceWorldHash = openingReliefOathLegacySourceWorldHash(legacy.entry.id);
    if (
      !sourceWorldHash ||
      args.trustedLegacySourceWorldHash === undefined ||
      args.trustedLegacySourceWorldHash === null ||
      sourceWorldHash !== args.trustedLegacySourceWorldHash
    ) {
      throw new Error(
        "Overworld session snapshot legacy opening relief oath has no matching trusted predecessor hash.",
      );
    }
    const expected = openingReliefOathLegacyJournalDraft(sourceWorldHash);
    if (legacy.entry.title !== expected.title || legacy.entry.text !== expected.text) {
      throw new Error(
        `Overworld session snapshot legacy opening relief-oath entry "${legacy.entry.id}" does not match its canonical neutral copy.`,
      );
    }
    if (args.expectedTown !== null && legacy.entry.town !== args.expectedTown) {
      throw new Error(
        `Overworld session snapshot legacy opening relief-oath entry "${legacy.entry.id}" is bound to town "${legacy.entry.town}", expected "${args.expectedTown}".`,
      );
    }
    const legacyBoundary = legacy.entry.storyChoiceBoundary;
    if (
      !legacyBoundary ||
      legacy.index + 1 !== registrationJournalIndex ||
      legacy.entry.recordedAt !== registrationEntry.recordedAt ||
      !boundariesEqual(legacyBoundary, registrationBoundary) ||
      legacyBoundary.townId !== scene.home ||
      legacyBoundary.areaId !== scene.area ||
      legacyBoundary.minutes !== parseTimeLabel(legacy.entry.recordedAt)
    ) {
      throw new Error(
        "Overworld session snapshot legacy opening relief oath must sit immediately newer than registration and share its exact story boundary.",
      );
    }
    return Object.freeze({
      characterAfterOath: cloneCampaignCharacterState(
        args.registrationProof.characterAtRegistration,
      ),
      offered: false,
      legacy: true,
      legacySourceWorldHash: sourceWorldHash,
      offerBoundary: null,
      option: null,
      selectionBoundary: null,
      terms: null,
      journalIndex: legacy.index,
      recordedAt: parseTimeLabel(legacy.entry.recordedAt),
    });
  }

  const offered = offers[0];
  if (!offered) {
    throw new Error("Overworld session snapshot relief-oath selection has no replayable offer.");
  }
  const expectedOffer = openingReliefOathOfferJournalDraft(scene);
  if (
    offered.entry.id !== expectedOffer.id ||
    offered.entry.title !== expectedOffer.title ||
    offered.entry.text !== expectedOffer.text
  ) {
    throw new Error(
      `Overworld session snapshot relief-oath offer "${offered.entry.id}" does not match its authored copy.`,
    );
  }
  if (args.expectedTown !== null && offered.entry.town !== args.expectedTown) {
    throw new Error(
      `Overworld session snapshot relief-oath offer "${offered.entry.id}" is bound to town "${offered.entry.town}", expected "${args.expectedTown}".`,
    );
  }
  const offerBoundary = offered.entry.storyChoiceBoundary;
  if (!offerBoundary) {
    throw new Error(
      "Overworld session snapshot relief-oath offer has no durable story-choice boundary.",
    );
  }
  if (
    offered.index + 1 !== registrationJournalIndex ||
    offered.entry.recordedAt !== registrationEntry.recordedAt ||
    !boundariesEqual(offerBoundary, registrationBoundary) ||
    offerBoundary.townId !== scene.home ||
    offerBoundary.areaId !== scene.area ||
    offerBoundary.minutes !== parseTimeLabel(offered.entry.recordedAt)
  ) {
    throw new Error(
      "Overworld session snapshot relief-oath offer must immediately follow registration at the same world and story boundary.",
    );
  }
  for (let index = offered.index + 1; index < args.journalEntries.length; index += 1) {
    const kind = args.journalEntries[index]!.kind;
    if (kind === "quest" || kind === "quest_done") {
      throw new Error(
        "Overworld session snapshot relief-oath offer cannot follow a started or completed quest.",
      );
    }
  }

  if (selections.length === 0) {
    if (offered.index !== 0) {
      throw new Error(
        "Overworld session snapshot pending relief-oath offer must remain the latest journal boundary.",
      );
    }
    return Object.freeze({
      characterAfterOath: cloneCampaignCharacterState(
        args.registrationProof.characterAtRegistration,
      ),
      offered: true,
      legacy: false,
      legacySourceWorldHash: null,
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
    (candidate) => openingReliefOathJournalId(scene.id, candidate.id) === selected.entry.id,
  );
  if (!option || !openingReliefOathOptionById(scene, option.id)) {
    throw new Error(
      `Overworld session snapshot relief-oath entry references an unknown option in "${selected.entry.id}".`,
    );
  }
  const application = applyOpeningReliefOathOption({
    scene,
    character: args.registrationProof.characterAtRegistration,
    optionId: option.id,
  });
  const expectedSelection = openingReliefOathJournalDraft({
    scene,
    character: args.registrationProof.characterAtRegistration,
    optionId: option.id,
  });
  if (
    selected.entry.title !== expectedSelection.title ||
    selected.entry.text !== expectedSelection.text
  ) {
    throw new Error(
      `Overworld session snapshot relief-oath entry "${selected.entry.id}" does not match its authored terms and copy.`,
    );
  }
  if (args.expectedTown !== null && selected.entry.town !== args.expectedTown) {
    throw new Error(
      `Overworld session snapshot relief-oath entry "${selected.entry.id}" is bound to town "${selected.entry.town}", expected "${args.expectedTown}".`,
    );
  }
  const selectionBoundary = selected.entry.storyChoiceBoundary;
  if (!selectionBoundary) {
    throw new Error(
      "Overworld session snapshot relief-oath selection has no durable story-choice boundary.",
    );
  }
  if (selected.index + 1 !== offered.index) {
    throw new Error(
      "Overworld session snapshot relief-oath selection must immediately follow its offer.",
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
      "Overworld session snapshot relief-oath selection does not match its journey decision, location, or paid-time boundary.",
    );
  }
  return Object.freeze({
    characterAfterOath: cloneCampaignCharacterState(application.characterAfter),
    offered: true,
    legacy: false,
    legacySourceWorldHash: null,
    offerBoundary: { ...offerBoundary },
    option,
    selectionBoundary: { ...selectionBoundary },
    terms: { ...application.terms },
    journalIndex: selected.index,
    recordedAt: expectedMinutes,
  });
}
