import {
  deriveQuestDispatchPresentationWindow,
  type QuestDispatchPresentationWindow,
} from "./quest_dispatch_window.js";
import { resolveOpeningDispatchManifestChain } from "./opening_dispatch_briefing.js";
import {
  replayOpeningDispatchChoices,
  type OpeningDispatchReplayChoice,
} from "./opening_dispatch_choice_replay.js";
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

export const OPENING_DEPARTURE_RECAP_VERSION = 7 as const;
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
  | "solo_default"
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

/**
 * A read-only timing line for the authenticated plan currently shown at the
 * Station. "committed" deliberately does not call the plan final: the named
 * optional selections can still change it. Its minutes are exposed only when
 * the canonical dispatch authority has authenticated that partial receipt.
 */
export type OpeningDepartureRecapDispatch = Readonly<{
  state: "committed" | "direct_launch" | "sealed";
  minutes: number;
  timing: "on_time" | "delayed" | null;
  remainingOptional: readonly Exclude<OpeningDepartureRecapSlot, "role" | "duty" | "evidence">[];
}>;

export type OpeningDepartureRecap = Readonly<{
  version: typeof OPENING_DEPARTURE_RECAP_VERSION;
  questId: string;
  questTitle: string;
  entries: readonly OpeningDepartureRecapEntry[];
  dispatch: OpeningDepartureRecapDispatch | null;
}>;

export type OpeningCompactDepartureRecapEntry = readonly [
  slot: OpeningDepartureRecapSlot,
  status: OpeningDepartureRecapStatus,
  title: string | null,
];

export type OpeningCompactDepartureRecap = readonly [
  version: typeof OPENING_DEPARTURE_RECAP_VERSION,
  questId: string,
  questTitle: string,
  entries: readonly OpeningCompactDepartureRecapEntry[],
  dispatch:
    | readonly [
        state: OpeningDepartureRecapDispatch["state"],
        minutes: number,
        timing: OpeningDepartureRecapDispatch["timing"],
        remainingOptional: readonly OpeningDepartureRecapDispatch["remainingOptional"][number][],
      ]
    | null,
];

export type OpeningCompactDepartureRecapTerms = readonly [
  version: typeof OPENING_DEPARTURE_RECAP_VERSION,
  questId: string,
  terms: readonly (readonly [slot: OpeningDepartureRecapSlot, activeFieldTerm: string])[],
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

function deriveDispatchRecap(
  window: QuestDispatchPresentationWindow,
): OpeningDepartureRecapDispatch | null {
  if (window.status === "support_choices_open") {
    const remainingOptional = Object.freeze([
      ...(window.receipt.preparation.kind === "open_optional" ? (["preparation"] as const) : []),
      ...(window.receipt.reliefAllocation.kind === "open_optional"
        ? (["relief_allocation"] as const)
        : []),
      ...(window.receipt.juneCommitment.kind === "open_optional" ? (["field_team"] as const) : []),
    ]);
    return Object.freeze({
      state: "committed",
      minutes: window.committedMinutes,
      timing: null,
      remainingOptional,
    });
  }
  if (
    (window.status !== "on_time" && window.status !== "delayed") ||
    window.ledgerMinutes === undefined
  ) {
    return null;
  }
  return Object.freeze({
    state: "sealed",
    minutes: window.ledgerMinutes,
    timing: window.status,
    remainingOptional: Object.freeze([]),
  });
}

/**
 * Reuse the binding boundary from the canonical selected-choice presentation.
 * Roleplay-first receipts defer field mechanics until their actual consumer, so
 * the recap keeps the selected promise's concise "give up" term instead.
 */
function selectedFieldTerm(prompt: JourneyStoryChoicePrompt, selectedId: string): string {
  const selected = prompt.options.find((option) => option.id === selectedId);
  if (!selected?.summary) {
    throw new Error(`Opening departure recap cannot resolve selected field term "${selectedId}".`);
  }
  const value =
    selected.summary.fieldTriggerScope === "category" && selected.summary.fieldTrigger
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
      leadSourceProof,
      preparationScene: chain.preparation,
      journalEntries: args.journalEntries,
      expectedTown: null,
      trustedLegacySourceWorldHash,
    });
    const allyProof = proveOpeningAllyJournal({
      scene: chain.ally,
      preparationProof,
      reliefAllocationProof,
      leadSourceProof,
      preparationScene: chain.preparation,
      reliefAllocationScene: chain.reliefAllocation,
      journalEntries: args.journalEntries,
      expectedTown: null,
      trustedLegacySourceWorldHash,
    });
    const dispatchWindow = deriveQuestDispatchPresentationWindow({
      questId: chain.quest.id,
      journalEntries: args.journalEntries,
      openingRegistration: chain.registration,
      openingReliefOath: chain.reliefOath,
      openingLeadSource: chain.leadSource,
      openingPreparation: chain.preparation,
      openingReliefAllocation: chain.reliefAllocation,
      openingAlly: chain.ally,
      trustedLegacySourceWorldHash,
    });
    const dispatch = deriveDispatchRecap(dispatchWindow);
    const selectedSupport: OpeningDispatchReplayChoice[] = [
      ...(preparationProof.profile && preparationProof.journalIndex !== null
        ? [
            {
              kind: "preparation" as const,
              journalIndex: preparationProof.journalIndex,
              scene: chain.preparation,
              optionId: preparationProof.profile.id,
            },
          ]
        : []),
      ...(reliefAllocationProof.option && reliefAllocationProof.journalIndex !== null
        ? [
            {
              kind: "relief_allocation" as const,
              journalIndex: reliefAllocationProof.journalIndex,
              scene: chain.reliefAllocation,
              optionId: reliefAllocationProof.option.id,
            },
          ]
        : []),
      ...(allyProof.option && allyProof.journalIndex !== null
        ? [
            {
              kind: "ally" as const,
              journalIndex: allyProof.journalIndex,
              scene: chain.ally,
              optionId: allyProof.option.id,
            },
          ]
        : []),
    ];
    const characterBeforeSupport = (journalIndex: number) =>
      replayOpeningDispatchChoices({
        characterAfterSource: leadSourceProof.characterAfterSource,
        choices: selectedSupport,
        beforeJournalIndex: journalIndex,
      });
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
              presentOpeningPreparation(
                chain.preparation,
                characterBeforeSupport(preparationProof.journalIndex!),
              ),
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
                characterBeforeSupport(reliefAllocationProof.journalIndex!),
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
          : recapEntry("relief_allocation", "Relief allocation", "open_optional", null),
      allyProof.option
        ? recapEntry(
            "field_team",
            "Field team",
            "selected",
            allyProof.option.title,
            selectedFieldTerm(
              presentOpeningAlly(chain.ally, characterBeforeSupport(allyProof.journalIndex!)),
              allyProof.option.id,
            ),
          )
        : allyProof.legacy
          ? recapEntry("field_team", "Field team", "legacy", "Legacy solo team preserved")
          : recapEntry("field_team", "Field team", "open_optional", null),
    ]);

    return Object.freeze({
      version: OPENING_DEPARTURE_RECAP_VERSION,
      questId: chain.quest.id,
      questTitle: chain.quest.title,
      entries,
      dispatch,
    });
  } catch {
    return null;
  }
}

export function cloneOpeningDepartureRecap(recap: OpeningDepartureRecap): OpeningDepartureRecap {
  return {
    ...recap,
    entries: recap.entries.map((entry) => ({ ...entry })),
    dispatch: recap.dispatch
      ? { ...recap.dispatch, remainingOptional: [...recap.dispatch.remainingOptional] }
      : null,
  };
}

export function compactOpeningDepartureRecap(
  recap: OpeningDepartureRecap,
): OpeningCompactDepartureRecap {
  const entries =
    recap.dispatch?.state === "committed"
      ? recap.entries.filter((entry) => entry.status !== "open_optional")
      : recap.entries;
  return [
    recap.version,
    recap.questId,
    recap.questTitle,
    entries.map((entry) => [entry.slot, entry.status, entry.title] as const),
    recap.dispatch
      ? [
          recap.dispatch.state,
          recap.dispatch.minutes,
          recap.dispatch.timing,
          [...recap.dispatch.remainingOptional],
        ]
      : null,
  ];
}

export function compactOpeningDepartureRecapTerms(
  recap: OpeningDepartureRecap,
): OpeningCompactDepartureRecapTerms {
  return [
    recap.version,
    recap.questId,
    recap.entries.flatMap((entry) =>
      entry.activeFieldTerm ? [[entry.slot, entry.activeFieldTerm] as const] : [],
    ),
  ];
}
