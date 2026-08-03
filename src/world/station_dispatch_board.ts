import { compactText } from "../core/compact_text.js";
import type {
  OpeningDepartureRecap,
  OpeningDepartureRecapStatus,
} from "./opening_departure_recap.js";
import type { OverworldQuestView } from "./session_local_discovery.js";
import type { OverworldCompactQuestStart } from "./compact_view.js";
import type { OverworldDepartureContactLead } from "./session_departure_interactions.js";

/** A read-only arrangement of the existing Albany Station dispatch surfaces. */
export const STATION_DISPATCH_BOARD_VERSION = 1 as const;
export const STATION_DISPATCH_BOARD_GUIDANCE_CHAR_LIMIT = 240;
export const STATION_DISPATCH_BOARD_SUPPORT_COPY_CHAR_LIMIT = 160;

const SUPPORT_SLOTS = ["preparation", "relief_allocation", "field_team"] as const;
type StationDispatchSupportSlot = (typeof SUPPORT_SLOTS)[number];

const GUIDANCE =
  "Preparation, relief allocation, and field-team terms are independent and optional. Launch choices remain in the Station launch list; inspect only the support you want before departure.";

const SUPPORT_COPY: Readonly<
  Record<
    StationDispatchSupportSlot,
    Readonly<{ label: string; purpose: string; detailHint: string }>
  >
> = Object.freeze({
  preparation: {
    label: "Preparation",
    purpose: "Choose one specialist packet; each changes one named Wolf-Winter field line.",
    detailHint: "Inspect to compare its exact cost and field trigger.",
  },
  relief_allocation: {
    label: "Relief allocation",
    purpose:
      "Place one relief wagon; each option protects one named crisis line and leaves the others exposed.",
    detailHint: "Inspect to compare exact timing and protected/exposed lines.",
  },
  field_team: {
    label: "Field team",
    purpose: "Set field-team crisis authority or go solo; this never adds combat power.",
    detailHint: "Talk with the field lead to review exact time and terms.",
  },
});

export type StationDispatchBoardSupport = Readonly<{
  slot: StationDispatchSupportSlot;
  label: string;
  status: OpeningDepartureRecapStatus;
  selectedTitle: string | null;
  purpose: string;
  detailHint: string;
}>;

export type StationDispatchBoardApproach = Readonly<{
  id: string;
  title: string;
  availableNow: boolean;
}>;

export type StationDispatchBoard = Readonly<{
  version: typeof STATION_DISPATCH_BOARD_VERSION;
  questId: string;
  questTitle: string;
  guidance: string;
  support: readonly StationDispatchBoardSupport[];
  launch: Readonly<{
    id: string;
    prompt: string;
    approaches: readonly StationDispatchBoardApproach[];
  }>;
}>;

export type OpeningCompactStationDispatchBoardSupport = readonly [
  slot: StationDispatchSupportSlot,
  purpose: string,
];

export type OpeningCompactStationDispatchBoard = readonly [
  version: typeof STATION_DISPATCH_BOARD_VERSION,
  guidance: string,
  support: readonly OpeningCompactStationDispatchBoardSupport[],
];

function bounded(
  value: string,
  label: string,
  limit = STATION_DISPATCH_BOARD_SUPPORT_COPY_CHAR_LIMIT,
): string {
  if (value.length > limit) {
    throw new Error(`Station dispatch board ${label} exceeds ${String(limit)} characters.`);
  }
  return value;
}

function supportEntry(
  recap: OpeningDepartureRecap,
  slot: StationDispatchSupportSlot,
  fieldTeamContactName: string | null,
): StationDispatchBoardSupport | null {
  const entry = recap.entries.find((candidate) => candidate.slot === slot);
  if (!entry) return null;
  const copy = SUPPORT_COPY[slot];
  return Object.freeze({
    slot,
    label:
      slot === "field_team" && fieldTeamContactName
        ? `${fieldTeamContactName} field team`
        : copy.label,
    status: entry.status,
    selectedTitle: entry.title,
    purpose: bounded(copy.purpose, `${slot} purpose`),
    detailHint: bounded(copy.detailHint, `${slot} detail hint`),
  });
}

/**
 * Build no new authority: all source values are already public, authenticated
 * view projections. A malformed pairing simply withholds the board.
 */
export function deriveStationDispatchBoard(args: {
  recap: OpeningDepartureRecap | null;
  quests: readonly OverworldQuestView[];
  questStarts: readonly OverworldCompactQuestStart[];
  departureContactLeads: readonly OverworldDepartureContactLead[];
}): StationDispatchBoard | null {
  const recap = args.recap;
  if (!recap) return null;
  const quest = args.quests.find((candidate) => candidate.id === recap.questId);
  if (!quest?.launch || quest.title !== recap.questTitle || quest.launch.options.length === 0) {
    return null;
  }
  const matchingContacts = args.departureContactLeads.filter(
    (lead) => lead.questId === recap.questId && lead.kind === "ally",
  );
  if (matchingContacts.length > 1) return null;
  const fieldTeamContactName = matchingContacts[0]?.contactName ?? null;
  const support = SUPPORT_SLOTS.map((slot) => supportEntry(recap, slot, fieldTeamContactName));
  const selectedSupport: StationDispatchBoardSupport[] = [];
  for (const entry of support) {
    if (!entry) return null;
    selectedSupport.push(entry);
  }
  const optionIds = new Set(quest.launch.options.map((option) => option.id));
  const legalApproachIds = new Set<string>();
  for (const [questId, approachId] of args.questStarts) {
    if (questId !== recap.questId) continue;
    if (approachId === null || !optionIds.has(approachId)) return null;
    legalApproachIds.add(approachId);
  }
  return Object.freeze({
    version: STATION_DISPATCH_BOARD_VERSION,
    questId: recap.questId,
    questTitle: recap.questTitle,
    guidance: bounded(GUIDANCE, "guidance", STATION_DISPATCH_BOARD_GUIDANCE_CHAR_LIMIT),
    support: Object.freeze(selectedSupport),
    launch: Object.freeze({
      id: quest.launch.id,
      prompt: quest.launch.prompt,
      approaches: Object.freeze(
        quest.launch.options.map((option) =>
          Object.freeze({
            id: option.id,
            title: option.title,
            availableNow: legalApproachIds.has(option.id),
          }),
        ),
      ),
    }),
  });
}

export function cloneStationDispatchBoard(board: StationDispatchBoard): StationDispatchBoard {
  return {
    ...board,
    support: board.support.map((entry) => ({ ...entry })),
    launch: {
      ...board.launch,
      approaches: board.launch.approaches.map((approach) => ({ ...approach })),
    },
  };
}

export function compactStationDispatchBoard(
  board: StationDispatchBoard,
): OpeningCompactStationDispatchBoard {
  return [
    board.version,
    compactText(board.guidance, STATION_DISPATCH_BOARD_GUIDANCE_CHAR_LIMIT),
    board.support.map(
      (entry) =>
        [
          entry.slot,
          compactText(entry.purpose, STATION_DISPATCH_BOARD_SUPPORT_COPY_CHAR_LIMIT),
        ] as const,
    ),
  ];
}

export function cloneCompactStationDispatchBoard(
  board: OpeningCompactStationDispatchBoard,
): OpeningCompactStationDispatchBoard {
  return [
    board[0],
    board[1],
    board[2].map((entry) => [...entry] as OpeningCompactStationDispatchBoardSupport),
  ];
}
