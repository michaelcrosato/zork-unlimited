import { hashState } from "../core/hash.js";
import { WOLF_WINTER_DISPATCH_ON_TIME_MAX_MINUTES } from "../core/embedded_launch_overlay_receipt.js";
import type { OpeningAlly } from "./opening_ally.js";
import { openingAllyOfferJournalId, proveOpeningAllyJournal } from "./opening_ally_journal.js";
import type { OpeningLeadSource } from "./opening_lead_source.js";
import { proveOpeningLeadSourceJournal } from "./opening_lead_source_journal.js";
import type { OpeningPreparation } from "./opening_preparation.js";
import { proveOpeningPreparationJournal } from "./opening_preparation_journal.js";
import type { OpeningRegistration } from "./opening_registration.js";
import { proveOpeningRegistrationJournal } from "./opening_registration_journal.js";
import type { OpeningReliefAllocation } from "./opening_relief_allocation.js";
import { proveOpeningReliefAllocationJournal } from "./opening_relief_allocation_journal.js";
import type { OpeningReliefOath } from "./opening_relief_oath.js";
import { proveOpeningReliefOathJournal } from "./opening_relief_oath_journal.js";
import type {
  OverworldJournalDecisionBoundary,
  OverworldJournalEntry,
} from "./session_snapshot.js";

export const QUEST_DISPATCH_WINDOW_SCHEMA_VERSION = 1 as const;
export const WOLF_WINTER_DISPATCH_WINDOW_QUEST_ID = "wolf_winter" as const;

type QuestDispatchWindowBoundary = Readonly<{
  acceptedDecisions: number;
  decisionProofHash: string;
  townId: string;
  areaId: string;
  minutes: number;
}>;

export type QuestDispatchWindowReceipt = Readonly<{
  reliefOath: Readonly<{
    optionId: string;
    journalId: string;
    minutes: number;
    boundary: QuestDispatchWindowBoundary;
  }>;
  leadSource: Readonly<{
    optionId: string;
    journalId: string;
    minutes: number;
    boundary: QuestDispatchWindowBoundary;
  }>;
  preparation: Readonly<{
    profileId: string;
    journalId: string;
    minutes: number;
    boundary: QuestDispatchWindowBoundary;
  }>;
  reliefAllocation: Readonly<
    | {
        kind: "selected";
        optionId: string;
        journalId: string;
        minutes: number;
        boundary: QuestDispatchWindowBoundary;
      }
    | {
        kind: "unassigned";
        minutes: 0;
        boundary: QuestDispatchWindowBoundary;
      }
  >;
  juneCommitment: Readonly<
    | {
        kind: "selected";
        optionId: string;
        journalId: string;
        minutes: number;
        boundary: QuestDispatchWindowBoundary;
      }
    | {
        kind: "solo_unasked";
        minutes: 0;
        boundary: QuestDispatchWindowBoundary;
      }
  >;
}>;

/**
 * A frozen, proof-carrying classification for the Wolf-Winter launch. It is a
 * ledger of the departure choices only; it deliberately excludes clock time,
 * exploration, work, travel, and the hill approach.
 */
export type QuestDispatchWindow = Readonly<{
  schemaVersion: typeof QUEST_DISPATCH_WINDOW_SCHEMA_VERSION;
  questId: string;
  status: "on_time" | "delayed" | "legacy_neutral";
  ledgerMinutes?: number;
  receipt?: QuestDispatchWindowReceipt;
  proofHash: string;
}>;

type QuestDispatchPrefixReceipt = Readonly<
  Pick<QuestDispatchWindowReceipt, "reliefOath" | "leadSource" | "preparation" | "reliefAllocation">
>;

export type PendingJuneDispatchPresentation = Readonly<{
  schemaVersion: typeof QUEST_DISPATCH_WINDOW_SCHEMA_VERSION;
  questId: string;
  status: "june_commitment_pending";
  committedMinutes: number;
  finalMinutes: Readonly<{
    minimum: number;
    maximum: number;
  }>;
  receipt: Readonly<
    QuestDispatchPrefixReceipt & {
      juneCommitment: Readonly<{
        kind: "pending";
        journalId: string;
        optionMinutes: readonly number[];
        boundary: QuestDispatchWindowBoundary;
      }>;
    }
  >;
  proofHash: string;
}>;

export type QuestDispatchPresentationWindow = QuestDispatchWindow | PendingJuneDispatchPresentation;

export type QuestDispatchWindowInputs = Readonly<{
  questId: string;
  journalEntries?: readonly OverworldJournalEntry[];
  openingRegistration?: OpeningRegistration | null;
  openingReliefOath?: OpeningReliefOath | null;
  openingLeadSource?: OpeningLeadSource | null;
  openingPreparation?: OpeningPreparation | null;
  openingReliefAllocation?: OpeningReliefAllocation | null;
  openingAlly?: OpeningAlly | null;
  trustedLegacySourceWorldHash?: string | null;
}>;

function freezeBoundary(boundary: OverworldJournalDecisionBoundary): QuestDispatchWindowBoundary {
  return Object.freeze({ ...boundary });
}

function neutralWindow(questId: string): QuestDispatchWindow {
  const proofHash = hashState({
    schemaVersion: QUEST_DISPATCH_WINDOW_SCHEMA_VERSION,
    questId,
    status: "legacy_neutral" as const,
  });
  return Object.freeze({
    schemaVersion: QUEST_DISPATCH_WINDOW_SCHEMA_VERSION,
    questId,
    status: "legacy_neutral",
    proofHash,
  });
}

function currentScenesForQuest(args: QuestDispatchWindowInputs): boolean {
  return (
    args.openingRegistration !== null &&
    args.openingRegistration !== undefined &&
    args.openingReliefOath?.target_quest === args.questId &&
    args.openingLeadSource?.target_quest === args.questId &&
    args.openingPreparation?.target_quest === args.questId &&
    args.openingReliefAllocation?.target_quest === args.questId &&
    args.openingAlly?.target_quest === args.questId
  );
}

function hasJuneContactAfterPreparation(args: {
  journalEntries: readonly OverworldJournalEntry[];
  contactId: string;
  preparationJournalIndex: number;
}): boolean {
  return args.journalEntries.some(
    (entry, index) =>
      index < args.preparationJournalIndex && entry.id.startsWith(`talk:${args.contactId}`),
  );
}

/**
 * Derive authenticated Wolf-Winter dispatch state from the departure journal.
 * Legacy, direct, malformed, and incomplete prefix proofs remain neutral; the
 * one current offered June decision may become a presentation-only pending proof.
 */
function deriveQuestDispatchWindowState(
  args: QuestDispatchWindowInputs,
): QuestDispatchPresentationWindow {
  if (
    args.questId !== WOLF_WINTER_DISPATCH_WINDOW_QUEST_ID ||
    !args.journalEntries ||
    !currentScenesForQuest(args)
  ) {
    return neutralWindow(args.questId);
  }

  try {
    const registrationProof = proveOpeningRegistrationJournal({
      registration: args.openingRegistration!,
      journalEntries: args.journalEntries,
      expectedTown: null,
    });
    if (!registrationProof.profile) return neutralWindow(args.questId);

    const reliefOathProof = proveOpeningReliefOathJournal({
      scene: args.openingReliefOath!,
      registrationProof,
      journalEntries: args.journalEntries,
      expectedTown: null,
      trustedLegacySourceWorldHash: args.trustedLegacySourceWorldHash ?? null,
    });
    if (
      reliefOathProof.legacy ||
      !reliefOathProof.option ||
      !reliefOathProof.terms ||
      !reliefOathProof.selectionBoundary ||
      reliefOathProof.journalIndex === null
    ) {
      return neutralWindow(args.questId);
    }

    const leadSourceProof = proveOpeningLeadSourceJournal({
      scene: args.openingLeadSource!,
      registrationProof,
      reliefOathProof,
      journalEntries: args.journalEntries,
      expectedTown: null,
    });
    if (
      !leadSourceProof.option ||
      !leadSourceProof.terms ||
      !leadSourceProof.selectionBoundary ||
      leadSourceProof.journalIndex === null
    ) {
      return neutralWindow(args.questId);
    }

    const preparationProof = proveOpeningPreparationJournal({
      scene: args.openingPreparation!,
      leadSourceProof,
      journalEntries: args.journalEntries,
      expectedTown: null,
      trustedLegacySourceWorldHash: args.trustedLegacySourceWorldHash ?? null,
    });
    if (
      preparationProof.legacy ||
      !preparationProof.profile ||
      !preparationProof.terms ||
      !preparationProof.selectionBoundary ||
      preparationProof.journalIndex === null
    ) {
      return neutralWindow(args.questId);
    }

    const reliefAllocationProof = proveOpeningReliefAllocationJournal({
      scene: args.openingReliefAllocation!,
      preparationProof,
      journalEntries: args.journalEntries,
      expectedTown: null,
      trustedLegacySourceWorldHash: args.trustedLegacySourceWorldHash ?? null,
    });
    if (reliefAllocationProof.legacy) return neutralWindow(args.questId);
    const reliefAllocation = reliefAllocationProof.option
      ? reliefAllocationProof.terms &&
        reliefAllocationProof.selectionBoundary &&
        reliefAllocationProof.journalIndex !== null
        ? Object.freeze({
            kind: "selected" as const,
            optionId: reliefAllocationProof.option.id,
            journalId: args.journalEntries[reliefAllocationProof.journalIndex]!.id,
            minutes: reliefAllocationProof.terms.minutes,
            boundary: freezeBoundary(reliefAllocationProof.selectionBoundary),
          })
        : null
      : reliefAllocationProof.offered && reliefAllocationProof.offerBoundary
        ? Object.freeze({
            kind: "unassigned" as const,
            minutes: 0 as const,
            boundary: freezeBoundary(reliefAllocationProof.offerBoundary),
          })
        : null;
    if (!reliefAllocation) return neutralWindow(args.questId);

    const prefixReceipt: QuestDispatchPrefixReceipt = Object.freeze({
      reliefOath: Object.freeze({
        optionId: reliefOathProof.option.id,
        journalId: args.journalEntries[reliefOathProof.journalIndex]!.id,
        minutes: reliefOathProof.terms.minutes,
        boundary: freezeBoundary(reliefOathProof.selectionBoundary),
      }),
      leadSource: Object.freeze({
        optionId: leadSourceProof.option.id,
        journalId: args.journalEntries[leadSourceProof.journalIndex]!.id,
        minutes: leadSourceProof.terms.minutes,
        boundary: freezeBoundary(leadSourceProof.selectionBoundary),
      }),
      preparation: Object.freeze({
        profileId: preparationProof.profile.id,
        journalId: args.journalEntries[preparationProof.journalIndex]!.id,
        minutes: preparationProof.terms.minutes,
        boundary: freezeBoundary(preparationProof.selectionBoundary),
      }),
      reliefAllocation,
    });
    const committedMinutes =
      prefixReceipt.reliefOath.minutes +
      prefixReceipt.leadSource.minutes +
      prefixReceipt.preparation.minutes +
      prefixReceipt.reliefAllocation.minutes;

    const allyProof = proveOpeningAllyJournal({
      scene: args.openingAlly!,
      preparationProof,
      reliefAllocationProof,
      journalEntries: args.journalEntries,
      expectedTown: null,
      trustedLegacySourceWorldHash: args.trustedLegacySourceWorldHash ?? null,
    });
    if (allyProof.legacy) return neutralWindow(args.questId);
    if (allyProof.offered && !allyProof.option && allyProof.offerBoundary && args.openingAlly) {
      const optionMinutes = Object.freeze(
        [...new Set(args.openingAlly.options.map((option) => option.terms.minutes))].sort(
          (left, right) => left - right,
        ),
      );
      const minimum = committedMinutes + optionMinutes[0]!;
      const maximum = committedMinutes + optionMinutes.at(-1)!;
      const finalMinutes = Object.freeze({ minimum, maximum });
      const receipt = Object.freeze({
        ...prefixReceipt,
        juneCommitment: Object.freeze({
          kind: "pending" as const,
          journalId: openingAllyOfferJournalId(args.openingAlly.id),
          optionMinutes,
          boundary: freezeBoundary(allyProof.offerBoundary),
        }),
      });
      const proofHash = hashState({
        schemaVersion: QUEST_DISPATCH_WINDOW_SCHEMA_VERSION,
        questId: args.questId,
        status: "june_commitment_pending" as const,
        committedMinutes,
        finalMinutes,
        receipt,
      });
      return Object.freeze({
        schemaVersion: QUEST_DISPATCH_WINDOW_SCHEMA_VERSION,
        questId: args.questId,
        status: "june_commitment_pending",
        committedMinutes,
        finalMinutes,
        receipt,
        proofHash,
      });
    }
    const juneCommitment = allyProof.option
      ? allyProof.terms && allyProof.selectionBoundary && allyProof.journalIndex !== null
        ? Object.freeze({
            kind: "selected" as const,
            optionId: allyProof.option.id,
            journalId: args.journalEntries[allyProof.journalIndex]!.id,
            minutes: allyProof.terms.minutes,
            boundary: freezeBoundary(allyProof.selectionBoundary),
          })
        : null
      : !allyProof.offered &&
          !hasJuneContactAfterPreparation({
            journalEntries: args.journalEntries,
            contactId: args.openingAlly!.contact,
            preparationJournalIndex: preparationProof.journalIndex,
          })
        ? Object.freeze({
            kind: "solo_unasked" as const,
            minutes: 0 as const,
            boundary: freezeBoundary(preparationProof.selectionBoundary),
          })
        : null;
    if (!juneCommitment) return neutralWindow(args.questId);

    const receipt: QuestDispatchWindowReceipt = Object.freeze({
      ...prefixReceipt,
      juneCommitment,
    });
    const ledgerMinutes = committedMinutes + receipt.juneCommitment.minutes;
    const status =
      ledgerMinutes <= WOLF_WINTER_DISPATCH_ON_TIME_MAX_MINUTES ? "on_time" : "delayed";
    const proofHash = hashState({
      schemaVersion: QUEST_DISPATCH_WINDOW_SCHEMA_VERSION,
      questId: args.questId,
      status,
      ledgerMinutes,
      receipt,
    });
    return Object.freeze({
      schemaVersion: QUEST_DISPATCH_WINDOW_SCHEMA_VERSION,
      questId: args.questId,
      status,
      ledgerMinutes,
      receipt,
      proofHash,
    });
  } catch {
    // A malformed or contradictory current record must never become an on-time
    // claim. Preserve the public legacy-neutral result instead.
    return neutralWindow(args.questId);
  }
}

/**
 * Player-facing timing may expose one authenticated, current June decision as
 * provisional. It remains structurally separate from the final launch window.
 */
export function deriveQuestDispatchPresentationWindow(
  args: QuestDispatchWindowInputs,
): QuestDispatchPresentationWindow {
  return deriveQuestDispatchWindowState(args);
}

/**
 * Final quest-launch authority. An offered-but-unselected field team remains
 * neutral here until the player seals one complete departure receipt.
 */
export function deriveQuestDispatchWindow(args: QuestDispatchWindowInputs): QuestDispatchWindow {
  const window = deriveQuestDispatchWindowState(args);
  return window.status === "june_commitment_pending" ? neutralWindow(args.questId) : window;
}
