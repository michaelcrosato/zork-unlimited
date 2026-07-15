import { hashState } from "../core/hash.js";
import {
  cloneCampaignCharacterState,
  type CampaignCharacterState,
} from "./campaign_character_state.js";
import {
  applyOpeningReliefAllocationOption,
  formatOpeningReliefAllocationCost,
  openingReliefAllocationOptionById,
  parseOpeningReliefAllocation,
  type OpeningReliefAllocation,
  type OpeningReliefAllocationOption,
  type OpeningReliefAllocationTerms,
} from "./opening_relief_allocation.js";
import type { OpeningPreparationJournalProof } from "./opening_preparation_journal.js";
import { parseTimeLabel } from "./session_journal_codec.js";
import type {
  OverworldJournalDecisionBoundary,
  OverworldJournalEntry,
} from "./session_snapshot.js";

export const OPENING_RELIEF_ALLOCATION_JOURNAL_PREFIX = "relief_allocation:" as const;
export const OPENING_RELIEF_ALLOCATION_LEGACY_JOURNAL_PREFIX = "relief_allocation_legacy:" as const;
export const OPENING_RELIEF_ALLOCATION_OFFER_JOURNAL_PREFIX = "relief_allocation_offer:" as const;

const WORLD_HASH_PATTERN = /^[0-9a-f]{64}$/;
const OPENING_RELIEF_ALLOCATION_LEGACY_JOURNAL_TITLE =
  "Legacy journey: Albany relief allocation grandfathered";
const OPENING_RELIEF_ALLOCATION_LEGACY_JOURNAL_TEXT =
  "This journey departed for Wolf-Winter under a trusted earlier Albany docket. It receives no retroactive relief allocation, knowledge, relationship effect, field recovery, return service, or time cost.";

export type OpeningReliefAllocationJournalDraft = Readonly<
  Pick<OverworldJournalEntry, "id" | "kind" | "title" | "text">
>;

export type OpeningReliefAllocationJournalProof = Readonly<{
  characterAfterAllocation: CampaignCharacterState;
  offered: boolean;
  legacy: boolean;
  legacySourceWorldHash: string | null;
  offerBoundary: OverworldJournalDecisionBoundary | null;
  legacyBoundary: OverworldJournalDecisionBoundary | null;
  option: OpeningReliefAllocationOption | null;
  selectionBoundary: OverworldJournalDecisionBoundary | null;
  terms: OpeningReliefAllocationTerms | null;
  journalIndex: number | null;
  recordedAt: number | null;
}>;

export function openingReliefAllocationOfferJournalId(sceneId: string): string {
  return `${OPENING_RELIEF_ALLOCATION_OFFER_JOURNAL_PREFIX}${sceneId}`;
}

export function openingReliefAllocationJournalId(sceneId: string, optionId: string): string {
  return `${OPENING_RELIEF_ALLOCATION_JOURNAL_PREFIX}${sceneId}:${optionId}`;
}

export function openingReliefAllocationLegacySourceWorldHash(entryId: string): string | null {
  if (!entryId.startsWith(OPENING_RELIEF_ALLOCATION_LEGACY_JOURNAL_PREFIX)) return null;
  const sourceWorldHash = entryId.slice(OPENING_RELIEF_ALLOCATION_LEGACY_JOURNAL_PREFIX.length);
  return WORLD_HASH_PATTERN.test(sourceWorldHash) ? sourceWorldHash : null;
}

export function openingReliefAllocationOfferJournalDraft(
  scene: OpeningReliefAllocation,
): OpeningReliefAllocationJournalDraft {
  const parsed = parseOpeningReliefAllocation(scene);
  return Object.freeze({
    id: openingReliefAllocationOfferJournalId(parsed.id),
    kind: "relief_allocation_offer" as const,
    title: parsed.title,
    text: parsed.message,
  });
}

export function openingReliefAllocationJournalDraft(args: {
  scene: OpeningReliefAllocation;
  character: CampaignCharacterState;
  optionId: string;
}): OpeningReliefAllocationJournalDraft {
  const parsed = parseOpeningReliefAllocation(args.scene);
  const applied = applyOpeningReliefAllocationOption(args);
  return Object.freeze({
    id: openingReliefAllocationJournalId(parsed.id, applied.option.id),
    kind: "relief_allocation" as const,
    title: `Allocated relief: ${applied.option.title}`,
    text:
      `${applied.option.summary} ${applied.option.preview} ` +
      `Protects: ${applied.option.protects} Leaves exposed: ${applied.option.leaves_exposed} ` +
      `Actual cost: ${formatOpeningReliefAllocationCost(applied.terms)}. ${applied.option.consequence}`,
  });
}

export function allOpeningReliefAllocationJournalDrafts(
  scene: OpeningReliefAllocation,
  character: CampaignCharacterState,
): readonly OpeningReliefAllocationJournalDraft[] {
  const parsed = parseOpeningReliefAllocation(scene);
  return Object.freeze(
    parsed.options.map((option) =>
      openingReliefAllocationJournalDraft({
        scene: parsed,
        character,
        optionId: option.id,
      }),
    ),
  );
}

export function openingReliefAllocationLegacyJournalDraft(
  sourceWorldHash: string,
): OpeningReliefAllocationJournalDraft {
  if (!WORLD_HASH_PATTERN.test(sourceWorldHash)) {
    throw new Error(`Invalid legacy opening relief allocation hash "${sourceWorldHash}".`);
  }
  return Object.freeze({
    id: `${OPENING_RELIEF_ALLOCATION_LEGACY_JOURNAL_PREFIX}${sourceWorldHash}`,
    kind: "relief_allocation_legacy" as const,
    title: OPENING_RELIEF_ALLOCATION_LEGACY_JOURNAL_TITLE,
    text: OPENING_RELIEF_ALLOCATION_LEGACY_JOURNAL_TEXT,
  });
}

function freezeBoundary(
  boundary: OverworldJournalDecisionBoundary,
): OverworldJournalDecisionBoundary {
  return Object.freeze({ ...boundary });
}

export function openingReliefAllocationOfferJournalEntry(args: {
  scene: OpeningReliefAllocation;
  town: string;
  recordedAt: string;
  storyChoiceBoundary: OverworldJournalDecisionBoundary;
}): OverworldJournalEntry {
  return Object.freeze({
    ...openingReliefAllocationOfferJournalDraft(args.scene),
    town: args.town,
    recordedAt: args.recordedAt,
    storyChoiceBoundary: freezeBoundary(args.storyChoiceBoundary),
  });
}

export function openingReliefAllocationJournalEntry(args: {
  scene: OpeningReliefAllocation;
  character: CampaignCharacterState;
  optionId: string;
  town: string;
  recordedAt: string;
  storyChoiceBoundary: OverworldJournalDecisionBoundary;
}): OverworldJournalEntry {
  return Object.freeze({
    ...openingReliefAllocationJournalDraft(args),
    town: args.town,
    recordedAt: args.recordedAt,
    storyChoiceBoundary: freezeBoundary(args.storyChoiceBoundary),
  });
}

/** Migration-only evidence; ordinary current sessions cannot mint its authority. */
export function openingReliefAllocationLegacyJournalEntry(args: {
  sourceWorldHash: string;
  town: string;
  recordedAt: string;
  storyChoiceBoundary: OverworldJournalDecisionBoundary;
}): OverworldJournalEntry {
  return Object.freeze({
    ...openingReliefAllocationLegacyJournalDraft(args.sourceWorldHash),
    town: args.town,
    recordedAt: args.recordedAt,
    storyChoiceBoundary: freezeBoundary(args.storyChoiceBoundary),
  });
}

function emptyAllocationProof(
  character: CampaignCharacterState,
): OpeningReliefAllocationJournalProof {
  return Object.freeze({
    characterAfterAllocation: cloneCampaignCharacterState(character),
    offered: false,
    legacy: false,
    legacySourceWorldHash: null,
    offerBoundary: null,
    legacyBoundary: null,
    option: null,
    selectionBoundary: null,
    terms: null,
    journalIndex: null,
    recordedAt: null,
  });
}

/** Replay one current allocation or one exact predecessor marker without trusting character state. */
export function proveOpeningReliefAllocationJournal(args: {
  scene: OpeningReliefAllocation | null | undefined;
  preparationProof: OpeningPreparationJournalProof;
  journalEntries: readonly OverworldJournalEntry[];
  expectedTown: string | null;
  trustedLegacySourceWorldHash?: string | null;
}): OpeningReliefAllocationJournalProof {
  const indexed = args.journalEntries.map((entry, index) => ({ entry, index }));
  const selections = indexed.filter(({ entry }) => entry.kind === "relief_allocation");
  const offers = indexed.filter(({ entry }) => entry.kind === "relief_allocation_offer");
  const legacies = indexed.filter(({ entry }) => entry.kind === "relief_allocation_legacy");
  if (selections.length > 1 || offers.length > 1 || legacies.length > 1) {
    throw new Error(
      "Overworld session snapshot must contain at most one relief allocation offer, choice, and legacy marker.",
    );
  }
  if (legacies.length > 0 && (selections.length > 0 || offers.length > 0)) {
    throw new Error(
      "Overworld session snapshot cannot combine legacy and current relief allocation evidence.",
    );
  }
  if (selections.length === 0 && offers.length === 0 && legacies.length === 0) {
    return emptyAllocationProof(args.preparationProof.characterAfterPreparation);
  }
  if (!args.scene) {
    throw new Error(
      "Overworld session snapshot has relief allocation evidence, but this world has no opening relief allocation scene.",
    );
  }
  if (
    (!args.preparationProof.profile && !args.preparationProof.legacy) ||
    args.preparationProof.journalIndex === null
  ) {
    throw new Error(
      "Overworld session snapshot relief allocation evidence has no resolved opening preparation.",
    );
  }
  const scene = parseOpeningReliefAllocation(args.scene);

  const legacy = legacies[0];
  if (legacy) {
    const sourceWorldHash = openingReliefAllocationLegacySourceWorldHash(legacy.entry.id);
    if (
      !sourceWorldHash ||
      args.trustedLegacySourceWorldHash === undefined ||
      args.trustedLegacySourceWorldHash === null ||
      sourceWorldHash !== args.trustedLegacySourceWorldHash
    ) {
      throw new Error(
        "Overworld session snapshot legacy relief allocation has no matching trusted predecessor hash.",
      );
    }
    const expected = openingReliefAllocationLegacyJournalDraft(sourceWorldHash);
    if (legacy.entry.title !== expected.title || legacy.entry.text !== expected.text) {
      throw new Error(
        `Overworld session snapshot legacy relief allocation entry "${legacy.entry.id}" does not match its canonical copy.`,
      );
    }
    if (args.expectedTown !== null && legacy.entry.town !== args.expectedTown) {
      throw new Error(
        `Overworld session snapshot legacy relief allocation entry "${legacy.entry.id}" is bound to town "${legacy.entry.town}", expected "${args.expectedTown}".`,
      );
    }
    const legacyBoundary = legacy.entry.storyChoiceBoundary;
    const questEntry = args.journalEntries[legacy.index - 1];
    if (
      !legacyBoundary ||
      !questEntry ||
      questEntry.kind !== "quest" ||
      questEntry.id !== `quest:${scene.target_quest}` ||
      legacy.index >= args.preparationProof.journalIndex ||
      legacyBoundary.townId !== scene.home ||
      legacyBoundary.areaId !== scene.area ||
      legacyBoundary.minutes !== parseTimeLabel(legacy.entry.recordedAt)
    ) {
      throw new Error(
        "Overworld session snapshot legacy relief allocation must sit immediately before replayable target-quest departure at its exact Station boundary.",
      );
    }
    return Object.freeze({
      ...emptyAllocationProof(args.preparationProof.characterAfterPreparation),
      legacy: true,
      legacySourceWorldHash: sourceWorldHash,
      legacyBoundary: { ...legacyBoundary },
      journalIndex: legacy.index,
      recordedAt: parseTimeLabel(legacy.entry.recordedAt),
    });
  }

  const offered = offers[0];
  const selected = selections[0];
  if (!offered) {
    throw new Error("Overworld session snapshot relief allocation choice has no durable offer.");
  }
  const expectedOffer = openingReliefAllocationOfferJournalDraft(scene);
  if (
    offered.entry.id !== expectedOffer.id ||
    offered.entry.title !== expectedOffer.title ||
    offered.entry.text !== expectedOffer.text
  ) {
    throw new Error(
      `Overworld session snapshot relief allocation offer "${offered.entry.id}" does not match its authored copy.`,
    );
  }
  if (args.expectedTown !== null && offered.entry.town !== args.expectedTown) {
    throw new Error(
      `Overworld session snapshot relief allocation offer "${offered.entry.id}" is bound to town "${offered.entry.town}", expected "${args.expectedTown}".`,
    );
  }
  const offerBoundary = offered.entry.storyChoiceBoundary;
  if (
    !offerBoundary ||
    offerBoundary.townId !== scene.home ||
    offerBoundary.areaId !== scene.area ||
    offerBoundary.minutes !== parseTimeLabel(offered.entry.recordedAt) ||
    offered.index >= args.preparationProof.journalIndex
  ) {
    throw new Error(
      "Overworld session snapshot relief allocation offer is not bound after preparation at its authored departure location, time, and journey boundary.",
    );
  }
  if (!selected) {
    if (offered.index !== 0) {
      throw new Error(
        "Overworld session snapshot pending relief allocation offer must remain the latest journal boundary.",
      );
    }
    return Object.freeze({
      ...emptyAllocationProof(args.preparationProof.characterAfterPreparation),
      offered: true,
      offerBoundary: { ...offerBoundary },
      recordedAt: parseTimeLabel(offered.entry.recordedAt),
    });
  }

  const option = scene.options.find(
    (candidate) => openingReliefAllocationJournalId(scene.id, candidate.id) === selected.entry.id,
  );
  if (!option || !openingReliefAllocationOptionById(scene, option.id)) {
    throw new Error(
      `Overworld session snapshot relief allocation entry references an unknown option in "${selected.entry.id}".`,
    );
  }
  const application = applyOpeningReliefAllocationOption({
    scene,
    character: args.preparationProof.characterAfterPreparation,
    optionId: option.id,
  });
  const expectedSelection = openingReliefAllocationJournalDraft({
    scene,
    character: args.preparationProof.characterAfterPreparation,
    optionId: option.id,
  });
  if (
    selected.entry.title !== expectedSelection.title ||
    selected.entry.text !== expectedSelection.text ||
    (args.expectedTown !== null && selected.entry.town !== args.expectedTown)
  ) {
    throw new Error(
      `Overworld session snapshot relief allocation entry "${selected.entry.id}" does not match its authored terms, copy, or town.`,
    );
  }
  const selectionBoundary = selected.entry.storyChoiceBoundary;
  if (!selectionBoundary || selected.index + 1 !== offered.index) {
    throw new Error(
      "Overworld session snapshot relief allocation selection must immediately follow its durable offer.",
    );
  }
  for (let index = selected.index + 1; index < args.journalEntries.length; index += 1) {
    const entry = args.journalEntries[index]!;
    if (
      (entry.kind === "quest" && entry.id === `quest:${scene.target_quest}`) ||
      (entry.kind === "quest_done" && entry.id === `quest_done:${scene.target_quest}`)
    ) {
      throw new Error(
        "Overworld session snapshot relief allocation selection must precede the target quest boundary.",
      );
    }
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
      "Overworld session snapshot relief allocation selection does not match its journey decision, location, or paid-time boundary.",
    );
  }
  return Object.freeze({
    characterAfterAllocation: cloneCampaignCharacterState(application.characterAfter),
    offered: true,
    legacy: false,
    legacySourceWorldHash: null,
    offerBoundary: { ...offerBoundary },
    legacyBoundary: null,
    option,
    selectionBoundary: { ...selectionBoundary },
    terms: { ...application.terms },
    journalIndex: selected.index,
    recordedAt: expectedMinutes,
  });
}
