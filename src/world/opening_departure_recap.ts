import { resolveOpeningDispatchManifestChain } from "./opening_dispatch_briefing.js";
import { proveOpeningAllyJournal } from "./opening_ally_journal.js";
import { proveOpeningLeadSourceJournal } from "./opening_lead_source_journal.js";
import { proveOpeningPreparationJournal } from "./opening_preparation_journal.js";
import { proveOpeningRegistrationJournal } from "./opening_registration_journal.js";
import { proveOpeningReliefAllocationJournal } from "./opening_relief_allocation_journal.js";
import { proveOpeningReliefOathJournal } from "./opening_relief_oath_journal.js";
import { presentOpeningAlly } from "./opening_ally_presentation.js";
import { presentOpeningLeadSource } from "./opening_lead_source_presentation.js";
import { presentOpeningPreparation } from "./opening_preparation_presentation.js";
import { presentOpeningRegistration } from "./opening_registration_presentation.js";
import { presentOpeningReliefAllocation } from "./opening_relief_allocation_presentation.js";
import { presentOpeningReliefOath } from "./opening_relief_oath_presentation.js";
import type { JourneyStoryChoicePrompt } from "./journey_contract.js";
import type { OverworldManifest } from "./overworld.js";
import type { OverworldJournalEntry } from "./session_snapshot.js";

export const OPENING_DEPARTURE_RECAP_VERSION = 2 as const;
export const OPENING_DEPARTURE_RECAP_FIELD_TERM_CHAR_LIMIT = 120;

export type OpeningDepartureRecapSlot =
  | "role"
  | "duty"
  | "evidence"
  | "preparation"
  | "relief_allocation"
  | "field_team";

export type OpeningDepartureRecapStatus =
  | "selected"
  | "legacy"
  | "open_optional"
  | "available_after_preparation";

export type OpeningDepartureRecapEntry = Readonly<{
  slot: OpeningDepartureRecapSlot;
  label: string;
  status: OpeningDepartureRecapStatus;
  title: string | null;
  activeFieldTerm: string | null;
}>;

export type OpeningDepartureRecap = Readonly<{
  version: typeof OPENING_DEPARTURE_RECAP_VERSION;
  questId: string;
  questTitle: string;
  entries: readonly OpeningDepartureRecapEntry[];
}>;

export type OpeningCompactDepartureRecapEntry = readonly [
  slot: OpeningDepartureRecapSlot,
  label: string,
  status: OpeningDepartureRecapStatus,
  title: string | null,
  activeFieldTerm: string | null,
];

export type OpeningCompactDepartureRecap = readonly [
  version: typeof OPENING_DEPARTURE_RECAP_VERSION,
  questId: string,
  questTitle: string,
  entries: readonly OpeningCompactDepartureRecapEntry[],
];

export type OpeningDepartureRecapInputs = Readonly<{
  world: OverworldManifest;
  journalEntries: readonly OverworldJournalEntry[];
  trustedLegacySourceWorldHash?: string | null;
  trustedCivicSourceWorldHash?: string | null;
}>;

function recapEntry(
  slot: OpeningDepartureRecapSlot,
  label: string,
  status: OpeningDepartureRecapStatus,
  title: string | null,
  activeFieldTerm: string | null = null,
): OpeningDepartureRecapEntry {
  return Object.freeze({ slot, label, status, title, activeFieldTerm });
}

/**
 * Reuse one concise term from the canonical selected-choice presentation.
 * Broad field-trigger prose can be several hundred characters, so only authored
 * trigger categories qualify directly; other choices use their scannable tradeoff.
 */
function selectedFieldTerm(prompt: JourneyStoryChoicePrompt, selectedId: string): string {
  const selected = prompt.options.find((option) => option.id === selectedId);
  if (!selected?.summary) {
    throw new Error(`Opening departure recap cannot resolve selected field term "${selectedId}".`);
  }
  const value =
    selected.summary.fieldTriggerScope === "category"
      ? selected.summary.fieldTrigger
      : selected.summary.tradeoff;
  if (value.length > OPENING_DEPARTURE_RECAP_FIELD_TERM_CHAR_LIMIT) {
    throw new Error(
      `Opening departure recap field term exceeds ${String(
        OPENING_DEPARTURE_RECAP_FIELD_TERM_CHAR_LIMIT,
      )} characters.`,
    );
  }
  return value;
}

/**
 * Reconstruct the player's accumulated Albany departure plan from the same
 * authenticated evidence used by save restore. No alternative or consequence
 * copy is projected, and contradictory evidence fails closed.
 */
export function deriveOpeningDepartureRecap(
  args: OpeningDepartureRecapInputs,
): OpeningDepartureRecap | null {
  const chain = resolveOpeningDispatchManifestChain(args.world);
  if (!chain?.ally) return null;
  const trustedLegacySourceWorldHash = args.trustedLegacySourceWorldHash ?? null;

  try {
    const registrationProof = proveOpeningRegistrationJournal({
      registration: chain.registration,
      journalEntries: args.journalEntries,
      expectedTown: null,
    });
    if (!registrationProof.profile) return null;

    const reliefOathProof = proveOpeningReliefOathJournal({
      scene: chain.reliefOath,
      registrationProof,
      journalEntries: args.journalEntries,
      expectedTown: null,
      trustedLegacySourceWorldHash,
    });
    if (!reliefOathProof.option && !reliefOathProof.legacy) return null;

    const leadSourceProof = proveOpeningLeadSourceJournal({
      scene: chain.leadSource,
      registrationProof,
      reliefOathProof,
      journalEntries: args.journalEntries,
      expectedTown: null,
    });
    if (!leadSourceProof.option) return null;

    const preparationProof = proveOpeningPreparationJournal({
      scene: chain.preparation,
      leadSourceProof,
      journalEntries: args.journalEntries,
      expectedTown: null,
      trustedLegacySourceWorldHash,
      trustedCivicSourceWorldHash: args.trustedCivicSourceWorldHash ?? null,
    });
    const reliefAllocationProof = proveOpeningReliefAllocationJournal({
      scene: chain.reliefAllocation,
      preparationProof,
      journalEntries: args.journalEntries,
      expectedTown: null,
      trustedLegacySourceWorldHash,
    });
    const allyProof = proveOpeningAllyJournal({
      scene: chain.ally,
      preparationProof,
      reliefAllocationProof,
      journalEntries: args.journalEntries,
      expectedTown: null,
      trustedLegacySourceWorldHash,
    });
    const preparationResolved = Boolean(preparationProof.profile || preparationProof.legacy);

    const entries = Object.freeze([
      recapEntry(
        "role",
        "Role",
        "selected",
        registrationProof.profile.title,
        selectedFieldTerm(
          presentOpeningRegistration(chain.registration),
          registrationProof.profile.id,
        ),
      ),
      reliefOathProof.option
        ? recapEntry(
            "duty",
            "Duty",
            "selected",
            reliefOathProof.option.title,
            selectedFieldTerm(
              presentOpeningReliefOath(chain.reliefOath, registrationProof.profile.character),
              reliefOathProof.option.id,
            ),
          )
        : recapEntry("duty", "Duty", "legacy", "Legacy duty preserved"),
      recapEntry(
        "evidence",
        "Evidence",
        "selected",
        leadSourceProof.option.title,
        selectedFieldTerm(
          presentOpeningLeadSource(chain.leadSource, reliefOathProof.characterAfterOath),
          leadSourceProof.option.id,
        ),
      ),
      preparationProof.profile
        ? recapEntry(
            "preparation",
            "Preparation",
            "selected",
            preparationProof.profile.title,
            selectedFieldTerm(
              presentOpeningPreparation(chain.preparation, leadSourceProof.characterAfterSource),
              preparationProof.profile.id,
            ),
          )
        : preparationProof.legacy
          ? recapEntry("preparation", "Preparation", "legacy", "Legacy preparation preserved")
          : recapEntry("preparation", "Preparation", "open_optional", null),
      reliefAllocationProof.option
        ? recapEntry(
            "relief_allocation",
            "Relief allocation",
            "selected",
            reliefAllocationProof.option.title,
            selectedFieldTerm(
              presentOpeningReliefAllocation(
                chain.reliefAllocation,
                preparationProof.characterAfterPreparation,
              ),
              reliefAllocationProof.option.id,
            ),
          )
        : reliefAllocationProof.legacy
          ? recapEntry(
              "relief_allocation",
              "Relief allocation",
              "legacy",
              "Legacy relief allocation preserved",
            )
          : recapEntry(
              "relief_allocation",
              "Relief allocation",
              preparationResolved ? "open_optional" : "available_after_preparation",
              null,
            ),
      allyProof.option
        ? recapEntry(
            "field_team",
            "Field team",
            "selected",
            allyProof.option.title,
            selectedFieldTerm(
              presentOpeningAlly(chain.ally, reliefAllocationProof.characterAfterAllocation),
              allyProof.option.id,
            ),
          )
        : allyProof.legacy
          ? recapEntry("field_team", "Field team", "legacy", "Legacy solo team preserved")
          : recapEntry(
              "field_team",
              "Field team",
              preparationResolved ? "open_optional" : "available_after_preparation",
              null,
            ),
    ]);

    return Object.freeze({
      version: OPENING_DEPARTURE_RECAP_VERSION,
      questId: chain.quest.id,
      questTitle: chain.quest.title,
      entries,
    });
  } catch {
    return null;
  }
}

export function cloneOpeningDepartureRecap(recap: OpeningDepartureRecap): OpeningDepartureRecap {
  return {
    ...recap,
    entries: recap.entries.map((entry) => ({ ...entry })),
  };
}

export function compactOpeningDepartureRecap(
  recap: OpeningDepartureRecap,
): OpeningCompactDepartureRecap {
  return [
    recap.version,
    recap.questId,
    recap.questTitle,
    recap.entries.map(
      (entry) =>
        [entry.slot, entry.label, entry.status, entry.title, entry.activeFieldTerm] as const,
    ),
  ];
}
