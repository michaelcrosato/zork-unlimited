import { hashState } from "../core/hash.js";
import {
  cloneCampaignCharacterState,
  type CampaignCharacterState,
} from "./campaign_character_state.js";
import type { OpeningPreparationJournalProof } from "./opening_preparation_journal.js";
import type { OpeningReliefAllocationJournalProof } from "./opening_relief_allocation_journal.js";
import {
  applyOpeningAllyOption,
  formatOpeningAllyCost,
  openingAllyOptionById,
  parseOpeningAlly,
  type OpeningAlly,
  type OpeningAllyOption,
  type OpeningAllyTerms,
} from "./opening_ally.js";
import { parseTimeLabel } from "./session_journal_codec.js";
import type {
  OverworldJournalDecisionBoundary,
  OverworldJournalEntry,
} from "./session_snapshot.js";

export const OPENING_ALLY_JOURNAL_PREFIX = "ally:" as const;
export const OPENING_ALLY_LEGACY_JOURNAL_PREFIX = "ally_legacy:" as const;
export const OPENING_ALLY_OFFER_JOURNAL_PREFIX = "ally_offer:" as const;

const WORLD_HASH_PATTERN = /^[0-9a-f]{64}$/;
const OPENING_ALLY_LEGACY_JOURNAL_TITLE = "Legacy journey: Albany field team grandfathered";
const OPENING_ALLY_LEGACY_JOURNAL_TEXT =
  "This journey departed for Wolf-Winter under a trusted earlier Albany docket. It remains a solo run: no ally, promise, relationship effect, return claim, or retroactive field capability is invented.";

export type OpeningAllyJournalDraft = Readonly<
  Pick<OverworldJournalEntry, "id" | "kind" | "title" | "text">
>;

export type OpeningAllyJournalProof = Readonly<{
  characterAfterAlly: CampaignCharacterState;
  offered: boolean;
  legacy: boolean;
  legacySourceWorldHash: string | null;
  offerBoundary: OverworldJournalDecisionBoundary | null;
  option: OpeningAllyOption | null;
  selectionBoundary: OverworldJournalDecisionBoundary | null;
  terms: OpeningAllyTerms | null;
  journalIndex: number | null;
  recordedAt: number | null;
}>;

export function openingAllyOfferJournalId(sceneId: string): string {
  return `${OPENING_ALLY_OFFER_JOURNAL_PREFIX}${sceneId}`;
}

export function openingAllyJournalId(sceneId: string, optionId: string): string {
  return `${OPENING_ALLY_JOURNAL_PREFIX}${sceneId}:${optionId}`;
}

export function openingAllyLegacySourceWorldHash(entryId: string): string | null {
  if (!entryId.startsWith(OPENING_ALLY_LEGACY_JOURNAL_PREFIX)) return null;
  const sourceWorldHash = entryId.slice(OPENING_ALLY_LEGACY_JOURNAL_PREFIX.length);
  return WORLD_HASH_PATTERN.test(sourceWorldHash) ? sourceWorldHash : null;
}

export function openingAllyOfferJournalDraft(scene: OpeningAlly): OpeningAllyJournalDraft {
  const parsed = parseOpeningAlly(scene);
  return Object.freeze({
    id: openingAllyOfferJournalId(parsed.id),
    kind: "ally_offer" as const,
    title: parsed.title,
    text: `${parsed.message} Capability: ${parsed.capability} Condition: ${parsed.condition}`,
  });
}

export function openingAllyJournalDraft(args: {
  scene: OpeningAlly;
  character: CampaignCharacterState;
  optionId: string;
}): OpeningAllyJournalDraft {
  const parsed = parseOpeningAlly(args.scene);
  const applied = applyOpeningAllyOption(args);
  return Object.freeze({
    id: openingAllyJournalId(parsed.id, applied.option.id),
    kind: "ally" as const,
    title: `Field team: ${applied.option.title}`,
    text: `${applied.option.summary} ${applied.option.preview} Actual cost: ${formatOpeningAllyCost(applied.terms)}. ${applied.option.consequence}`,
  });
}

export function allOpeningAllyJournalDrafts(
  scene: OpeningAlly,
  character: CampaignCharacterState,
): readonly OpeningAllyJournalDraft[] {
  const parsed = parseOpeningAlly(scene);
  return Object.freeze(
    parsed.options.map((option) =>
      openingAllyJournalDraft({ scene: parsed, character, optionId: option.id }),
    ),
  );
}

export function openingAllyLegacyJournalDraft(sourceWorldHash: string): OpeningAllyJournalDraft {
  if (!WORLD_HASH_PATTERN.test(sourceWorldHash)) {
    throw new Error(`Invalid legacy opening ally hash "${sourceWorldHash}".`);
  }
  return Object.freeze({
    id: `${OPENING_ALLY_LEGACY_JOURNAL_PREFIX}${sourceWorldHash}`,
    kind: "ally_legacy" as const,
    title: OPENING_ALLY_LEGACY_JOURNAL_TITLE,
    text: OPENING_ALLY_LEGACY_JOURNAL_TEXT,
  });
}

function freezeBoundary(
  boundary: OverworldJournalDecisionBoundary,
): OverworldJournalDecisionBoundary {
  return Object.freeze({ ...boundary });
}

export function openingAllyOfferJournalEntry(args: {
  scene: OpeningAlly;
  town: string;
  recordedAt: string;
  storyChoiceBoundary: OverworldJournalDecisionBoundary;
}): OverworldJournalEntry {
  return Object.freeze({
    ...openingAllyOfferJournalDraft(args.scene),
    town: args.town,
    recordedAt: args.recordedAt,
    storyChoiceBoundary: freezeBoundary(args.storyChoiceBoundary),
  });
}

export function openingAllyJournalEntry(args: {
  scene: OpeningAlly;
  character: CampaignCharacterState;
  optionId: string;
  town: string;
  recordedAt: string;
  storyChoiceBoundary: OverworldJournalDecisionBoundary;
}): OverworldJournalEntry {
  return Object.freeze({
    ...openingAllyJournalDraft(args),
    town: args.town,
    recordedAt: args.recordedAt,
    storyChoiceBoundary: freezeBoundary(args.storyChoiceBoundary),
  });
}

/** Migration-only marker; proof accepts it only with the matching trusted predecessor hash. */
export function openingAllyLegacyJournalEntry(args: {
  sourceWorldHash: string;
  town: string;
  recordedAt: string;
}): OverworldJournalEntry {
  return Object.freeze({
    ...openingAllyLegacyJournalDraft(args.sourceWorldHash),
    town: args.town,
    recordedAt: args.recordedAt,
  });
}

function emptyAllyProof(character: CampaignCharacterState): OpeningAllyJournalProof {
  return Object.freeze({
    characterAfterAlly: cloneCampaignCharacterState(character),
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

/** Replay the departure offer, selected field-team contract, or one trusted solo marker. */
export function proveOpeningAllyJournal(args: {
  scene: OpeningAlly | null | undefined;
  preparationProof: OpeningPreparationJournalProof;
  reliefAllocationProof?: OpeningReliefAllocationJournalProof;
  journalEntries: readonly OverworldJournalEntry[];
  expectedTown: string | null;
  trustedLegacySourceWorldHash?: string | null;
}): OpeningAllyJournalProof {
  const indexed = args.journalEntries.map((entry, index) => ({ entry, index }));
  const selections = indexed.filter(({ entry }) => entry.kind === "ally");
  const offers = indexed.filter(({ entry }) => entry.kind === "ally_offer");
  const legacies = indexed.filter(({ entry }) => entry.kind === "ally_legacy");
  const allocationSelected =
    args.reliefAllocationProof?.option !== null && args.reliefAllocationProof?.option !== undefined;
  const allocationJournalIndex = args.reliefAllocationProof?.journalIndex ?? null;
  const allyEvidenceIndex = selections[0]?.index ?? offers[0]?.index ?? legacies[0]?.index ?? null;
  // Current journeys allocate relief before speaking to June. A migrated F12
  // journey may already have committed its field team when the real F06 offer
  // is added, so in that chronology the later allocation cannot be replayed as
  // an input to the earlier ally choice.
  const allocationPrecedesAlly =
    allocationSelected &&
    allocationJournalIndex !== null &&
    allyEvidenceIndex !== null &&
    allocationJournalIndex > allyEvidenceIndex;
  const characterBeforeAlly = allocationPrecedesAlly
    ? args.reliefAllocationProof!.characterAfterAllocation
    : args.preparationProof.characterAfterPreparation;
  const predecessorJournalIndex = allocationPrecedesAlly
    ? allocationJournalIndex
    : args.preparationProof.journalIndex;
  if (selections.length > 1 || offers.length > 1 || legacies.length > 1) {
    throw new Error(
      "Overworld session snapshot must contain at most one ally offer, choice, and legacy marker.",
    );
  }
  if (legacies.length > 0 && (selections.length > 0 || offers.length > 0)) {
    throw new Error(
      "Overworld session snapshot cannot combine legacy and current opening ally evidence.",
    );
  }
  if (selections.length === 0 && offers.length === 0 && legacies.length === 0) {
    return emptyAllyProof(
      allocationSelected
        ? args.reliefAllocationProof!.characterAfterAllocation
        : args.preparationProof.characterAfterPreparation,
    );
  }
  if (!args.scene) {
    throw new Error(
      "Overworld session snapshot has opening ally evidence, but this world has no opening ally scene.",
    );
  }
  if (
    (!args.preparationProof.profile && !args.preparationProof.legacy) ||
    args.preparationProof.journalIndex === null
  ) {
    throw new Error(
      "Overworld session snapshot opening ally evidence has no resolved preparation.",
    );
  }
  const scene = parseOpeningAlly(args.scene);

  const legacy = legacies[0];
  if (legacy) {
    const sourceWorldHash = openingAllyLegacySourceWorldHash(legacy.entry.id);
    if (
      !sourceWorldHash ||
      args.trustedLegacySourceWorldHash === undefined ||
      args.trustedLegacySourceWorldHash === null ||
      sourceWorldHash !== args.trustedLegacySourceWorldHash
    ) {
      throw new Error(
        "Overworld session snapshot legacy opening ally has no matching trusted predecessor hash.",
      );
    }
    const expected = openingAllyLegacyJournalDraft(sourceWorldHash);
    if (legacy.entry.title !== expected.title || legacy.entry.text !== expected.text) {
      throw new Error(
        `Overworld session snapshot legacy opening ally entry "${legacy.entry.id}" does not match its canonical copy.`,
      );
    }
    if (args.expectedTown !== null && legacy.entry.town !== args.expectedTown) {
      throw new Error(
        `Overworld session snapshot legacy opening ally entry "${legacy.entry.id}" is bound to town "${legacy.entry.town}", expected "${args.expectedTown}".`,
      );
    }
    const questEntry = args.journalEntries[legacy.index - 1];
    if (
      !questEntry ||
      questEntry.kind !== "quest" ||
      questEntry.id !== `quest:${scene.target_quest}` ||
      questEntry.recordedAt !== legacy.entry.recordedAt ||
      legacy.index >= args.preparationProof.journalIndex
    ) {
      throw new Error(
        "Overworld session snapshot legacy opening ally marker must sit immediately before replayable target-quest departure and after preparation.",
      );
    }
    return Object.freeze({
      ...emptyAllyProof(characterBeforeAlly),
      legacy: true,
      legacySourceWorldHash: sourceWorldHash,
      journalIndex: legacy.index,
      recordedAt: parseTimeLabel(legacy.entry.recordedAt),
    });
  }

  const offered = offers[0];
  const selected = selections[0];
  if (!offered) {
    throw new Error(
      "Overworld session snapshot ally choice has no durable offer; direct departures remain solo without invented ally evidence.",
    );
  }
  const expectedOffer = openingAllyOfferJournalDraft(scene);
  if (
    offered.entry.id !== expectedOffer.id ||
    offered.entry.title !== expectedOffer.title ||
    offered.entry.text !== expectedOffer.text
  ) {
    throw new Error(
      `Overworld session snapshot ally offer "${offered.entry.id}" does not match its authored copy.`,
    );
  }
  if (args.expectedTown !== null && offered.entry.town !== args.expectedTown) {
    throw new Error(
      `Overworld session snapshot ally offer "${offered.entry.id}" is bound to town "${offered.entry.town}", expected "${args.expectedTown}".`,
    );
  }
  const offerBoundary = offered.entry.storyChoiceBoundary;
  const contactEntry = args.journalEntries[offered.index + 1];
  if (
    !offerBoundary ||
    !contactEntry ||
    !contactEntry.id.startsWith(`talk:${scene.contact}`) ||
    contactEntry.recordedAt !== offered.entry.recordedAt ||
    offerBoundary.townId !== scene.home ||
    offerBoundary.areaId !== scene.area ||
    offerBoundary.minutes !== parseTimeLabel(offered.entry.recordedAt) ||
    predecessorJournalIndex === null ||
    offered.index >= predecessorJournalIndex
  ) {
    throw new Error(
      "Overworld session snapshot ally offer is not bound to June's post-preparation contact, departure location, time, and journey proof.",
    );
  }
  if (selections.length === 0) {
    for (let index = 0; index < offered.index; index += 1) {
      const entry = args.journalEntries[index]!;
      if (entry.kind === "quest" || entry.kind === "quest_done") {
        throw new Error(
          "Overworld session snapshot pending ally offer cannot survive target-quest progress.",
        );
      }
    }
    if (offered.index !== 0) {
      throw new Error(
        "Overworld session snapshot pending ally offer must remain the latest journal boundary.",
      );
    }
    return Object.freeze({
      ...emptyAllyProof(characterBeforeAlly),
      offered: true,
      offerBoundary: { ...offerBoundary },
      recordedAt: parseTimeLabel(offered.entry.recordedAt),
    });
  }

  const selectedAfterOffer = selected!;
  const option = scene.options.find(
    (candidate) => openingAllyJournalId(scene.id, candidate.id) === selectedAfterOffer.entry.id,
  );
  if (!option || !openingAllyOptionById(scene, option.id)) {
    throw new Error(
      `Overworld session snapshot ally entry references an unknown option in "${selectedAfterOffer.entry.id}".`,
    );
  }
  const application = applyOpeningAllyOption({
    scene,
    character: characterBeforeAlly,
    optionId: option.id,
  });
  const expectedSelection = openingAllyJournalDraft({
    scene,
    character: characterBeforeAlly,
    optionId: option.id,
  });
  if (
    selectedAfterOffer.entry.title !== expectedSelection.title ||
    selectedAfterOffer.entry.text !== expectedSelection.text ||
    (args.expectedTown !== null && selectedAfterOffer.entry.town !== args.expectedTown)
  ) {
    throw new Error(
      `Overworld session snapshot ally entry "${selectedAfterOffer.entry.id}" does not match its authored terms, copy, or town.`,
    );
  }
  const selectionBoundary = selectedAfterOffer.entry.storyChoiceBoundary;
  if (!selectionBoundary || selectedAfterOffer.index + 1 !== offered.index) {
    throw new Error(
      "Overworld session snapshot ally selection must immediately follow its durable offer.",
    );
  }
  for (let index = selectedAfterOffer.index + 1; index < args.journalEntries.length; index += 1) {
    const entry = args.journalEntries[index]!;
    if (entry.kind === "quest" || entry.kind === "quest_done") {
      throw new Error(
        "Overworld session snapshot ally selection must precede every quest boundary.",
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
    parseTimeLabel(selectedAfterOffer.entry.recordedAt) !== expectedMinutes
  ) {
    throw new Error(
      "Overworld session snapshot ally selection does not match its journey decision, location, or paid-time boundary.",
    );
  }
  return Object.freeze({
    characterAfterAlly: cloneCampaignCharacterState(application.characterAfter),
    offered: true,
    legacy: false,
    legacySourceWorldHash: null,
    offerBoundary: { ...offerBoundary },
    option,
    selectionBoundary: { ...selectionBoundary },
    terms: { ...application.terms },
    journalIndex: selectedAfterOffer.index,
    recordedAt: expectedMinutes,
  });
}
