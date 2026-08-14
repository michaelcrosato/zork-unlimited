import { compactText } from "../core/compact_text.js";
import type {
  OpeningDepartureRecap,
  OpeningDepartureRecapStatus,
} from "./opening_departure_recap.js";
import type { OverworldQuestView } from "./session_local_discovery.js";
import type { OverworldCompactQuestStart } from "./compact_view.js";
import type {
  OverworldDepartureContactLead,
  OverworldDepartureInteraction,
} from "./session_departure_interactions.js";

/** A read-only, coverage-complete index of the current Station dispatch. */
export const STATION_DISPATCH_BOARD_VERSION = 4 as const;
export const STATION_DISPATCH_BOARD_GUIDANCE_CHAR_LIMIT = 240;
export const STATION_DISPATCH_BOARD_SUPPORT_COPY_CHAR_LIMIT = 160;

const SUPPORT_SLOTS = ["preparation", "relief_allocation", "field_team"] as const;
type StationDispatchSupportSlot = (typeof SUPPORT_SLOTS)[number];
const PLAN_SLOTS = ["role", "duty", "evidence", ...SUPPORT_SLOTS] as const;
type StationDispatchPlanSlot = (typeof PLAN_SLOTS)[number];

const READY_GUIDANCE =
  "Cade's herd is under pressure. Depart now, or use an open support row. Support changes cost and aftermath, not your Wolf-Winter plan.";
const WAITING_GUIDANCE =
  "Cade's herd is under pressure. No road is open. You may still use any open support row; support changes cost and aftermath, not which plan you can choose.";

const SUPPORT_COPY: Readonly<
  Record<
    StationDispatchSupportSlot,
    Readonly<{ label: string; purpose: string; inlinePurpose: string; detailHint: string }>
  >
> = Object.freeze({
  preparation: {
    label: "One field kit",
    purpose:
      "Field kit: optionally choose one specialist kit for a named danger at Cade's steading.",
    inlinePurpose: "Choose one specialist kit for a named danger.",
    detailHint: "Compare kits only if you want their exact cost and field use.",
  },
  relief_allocation: {
    label: "Albany's last relief wagon",
    purpose:
      "Relief wagon: optionally send Albany's last wagon to one crisis; the other two go without it.",
    inlinePurpose: "Send Albany's last relief wagon to one crisis.",
    detailHint: "Compare destinations only if you want to decide who is protected.",
  },
  field_team: {
    label: "Second rider",
    purpose: "Second rider: optionally ask about cattle-first authority, or ride alone.",
    inlinePurpose: "Ask about cattle-first help for one line, never combat.",
    detailHint: "Talk only to compare exact terms; this adds no combat power.",
  },
});

export type StationDispatchBoardAction =
  | Readonly<{
      kind: "inspect";
      tool: "inspect_overworld_session_story";
      storyChoiceId: string;
      title: string;
    }>
  | Readonly<{
      kind: "talk";
      tool: "talk_overworld_session_contact";
      characterId: string;
      contactName: string;
    }>;

export type StationDispatchBoardPlanRow = Readonly<{
  slot: StationDispatchPlanSlot;
  label: string;
  status: OpeningDepartureRecapStatus;
  selectedTitle: string | null;
}>;

export type StationDispatchBoardSupport = Readonly<{
  slot: StationDispatchSupportSlot;
  label: string;
  status: OpeningDepartureRecapStatus;
  selectedTitle: string | null;
  purpose: string;
  detailHint: string;
  action: StationDispatchBoardAction | null;
}>;

export type StationDispatchBoardApproach = Readonly<{
  id: string;
  title: string;
  availableNow: boolean;
}>;

export type StationDispatchBoardDispatch = Readonly<{
  state: "committed" | "direct_launch" | "sealed";
  minutes: number;
  timing: "on_time" | "delayed" | null;
  remainingOptional: readonly StationDispatchSupportSlot[];
}>;

export type StationDispatchBoard = Readonly<{
  version: typeof STATION_DISPATCH_BOARD_VERSION;
  questId: string;
  questTitle: string;
  guidance: string;
  dispatch: StationDispatchBoardDispatch | null;
  plan: readonly StationDispatchBoardPlanRow[];
  support: readonly StationDispatchBoardSupport[];
  launch: Readonly<{
    id: string;
    prompt: string;
    approaches: readonly StationDispatchBoardApproach[];
  }>;
}>;

export type OpeningCompactStationDispatchBoardAction =
  | readonly [kind: "inspect", storyChoiceId: string]
  | readonly [kind: "talk", characterId: string, contactName: string];

export type OpeningCompactStationDispatchBoardPlanRow = readonly [
  slot: StationDispatchBoardPlanRow["slot"],
  status: OpeningDepartureRecapStatus,
  selectedTitle: string | null,
  purpose: string | null,
  action: OpeningCompactStationDispatchBoardAction | null,
];

export type OpeningCompactStationDispatchBoardDispatch = readonly [
  state: StationDispatchBoardDispatch["state"],
  minutes: number,
  timing: StationDispatchBoardDispatch["timing"],
  remainingOptional: readonly StationDispatchSupportSlot[],
];

export type OpeningCompactStationDispatchBoard = readonly [
  version: typeof STATION_DISPATCH_BOARD_VERSION,
  questId: string,
  guidance: string,
  dispatch: OpeningCompactStationDispatchBoardDispatch | null,
  rows: readonly OpeningCompactStationDispatchBoardPlanRow[],
];

/** Backward-compatible explicit detail for clients that request Station support separately. */
export type OpeningCompactStationDispatchBoardSupport = readonly [
  slot: StationDispatchSupportSlot,
  purpose: string,
  action: OpeningCompactStationDispatchBoardAction | null,
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

function cloneDispatch(
  dispatch: OpeningDepartureRecap["dispatch"],
): StationDispatchBoardDispatch | null {
  return dispatch
    ? Object.freeze({
        state: dispatch.state,
        minutes: dispatch.minutes,
        timing: dispatch.timing,
        remainingOptional: Object.freeze([...dispatch.remainingOptional]),
      })
    : null;
}

function matchingInteraction(
  interactions: readonly OverworldDepartureInteraction[],
  slot: Exclude<StationDispatchSupportSlot, "field_team">,
): OverworldDepartureInteraction | null {
  const matches = interactions.filter((interaction) => interaction.kind === slot);
  if (matches.length !== 1) return null;
  const interaction = matches[0]!;
  if (
    interaction.id !== interaction.inspect.storyChoiceId ||
    interaction.inspect.arguments.story_choice_id !== interaction.id
  ) {
    return null;
  }
  return interaction;
}

function inspectAction(interaction: OverworldDepartureInteraction): StationDispatchBoardAction {
  return Object.freeze({
    kind: "inspect",
    tool: interaction.inspect.tool,
    storyChoiceId: interaction.inspect.storyChoiceId,
    title: interaction.title,
  });
}

function talkAction(lead: OverworldDepartureContactLead): StationDispatchBoardAction | null {
  if (lead.status !== "ready" || !lead.action) return null;
  if (
    lead.action.characterId !== lead.contactId ||
    lead.action.arguments.character_id !== lead.contactId
  ) {
    return null;
  }
  return Object.freeze({
    kind: "talk",
    tool: lead.action.tool,
    characterId: lead.action.characterId,
    contactName: lead.contactName,
  });
}

function supportEntry(args: {
  recap: OpeningDepartureRecap;
  slot: StationDispatchSupportSlot;
  interactions: readonly OverworldDepartureInteraction[];
  fieldTeamLead: OverworldDepartureContactLead | null;
}): StationDispatchBoardSupport | null {
  const entry = args.recap.entries.find((candidate) => candidate.slot === args.slot);
  if (!entry) return null;
  const copy = SUPPORT_COPY[args.slot];
  let action: StationDispatchBoardAction | null = null;
  if (args.slot === "field_team") {
    action = args.fieldTeamLead ? talkAction(args.fieldTeamLead) : null;
  } else {
    const interaction = matchingInteraction(args.interactions, args.slot);
    if (interaction) action = inspectAction(interaction);
  }
  return Object.freeze({
    slot: args.slot,
    label:
      args.slot === "field_team" && args.fieldTeamLead
        ? `${args.fieldTeamLead.contactName}, second rider`
        : copy.label,
    status: entry.status,
    selectedTitle: entry.title,
    purpose: bounded(copy.purpose, `${args.slot} purpose`),
    detailHint: bounded(copy.detailHint, `${args.slot} detail hint`),
    action,
  });
}

function planRows(recap: OpeningDepartureRecap): readonly StationDispatchBoardPlanRow[] {
  return Object.freeze(
    recap.entries.map((entry) =>
      Object.freeze({
        slot: entry.slot,
        label: entry.label,
        status: entry.status,
        selectedTitle: entry.title,
      }),
    ),
  );
}

function hasExactPlanCoverage(recap: OpeningDepartureRecap): boolean {
  const slots = recap.entries.map((entry) => entry.slot);
  return (
    slots.length === PLAN_SLOTS.length &&
    new Set(slots).size === PLAN_SLOTS.length &&
    PLAN_SLOTS.every((slot) => slots.includes(slot))
  );
}

function actionMatchesStatus(entry: StationDispatchBoardSupport): boolean {
  const requiresAction = entry.status === "open_optional";
  if (requiresAction && entry.selectedTitle !== null) return false;
  if (requiresAction !== (entry.action !== null)) return false;
  if (!entry.action) return true;
  return entry.slot === "field_team"
    ? entry.action.kind === "talk"
    : entry.action.kind === "inspect";
}

function actionsExactlyCovered(args: {
  support: readonly StationDispatchBoardSupport[];
  interactions: readonly OverworldDepartureInteraction[];
  fieldTeamLeads: readonly OverworldDepartureContactLead[];
}): boolean {
  if (!args.support.every(actionMatchesStatus)) return false;
  const indexedInteractionIds = new Set(
    args.support
      .map((entry) => entry.action)
      .filter(
        (action): action is Extract<StationDispatchBoardAction, { kind: "inspect" }> =>
          action?.kind === "inspect",
      )
      .map((action) => action.storyChoiceId),
  );
  if (
    indexedInteractionIds.size !== args.interactions.length ||
    args.interactions.some((interaction) => !indexedInteractionIds.has(interaction.id))
  ) {
    return false;
  }
  const indexedContactIds = new Set(
    args.support
      .map((entry) => entry.action)
      .filter(
        (action): action is Extract<StationDispatchBoardAction, { kind: "talk" }> =>
          action?.kind === "talk",
      )
      .map((action) => action.characterId),
  );
  const actionableLeads = args.fieldTeamLeads.filter((lead) => lead.action !== null);
  return (
    indexedContactIds.size === actionableLeads.length &&
    actionableLeads.every((lead) => indexedContactIds.has(lead.contactId))
  );
}

/**
 * Build no new authority: every row and action is an exact clone of existing
 * authenticated view data. A missing, duplicate, or unindexed input withholds
 * the board so the fallback Station surfaces remain authoritative.
 */
export function deriveStationDispatchBoard(args: {
  recap: OpeningDepartureRecap | null;
  quests: readonly OverworldQuestView[];
  questStarts: readonly OverworldCompactQuestStart[];
  departureInteractions: readonly OverworldDepartureInteraction[];
  departureContactLeads: readonly OverworldDepartureContactLead[];
}): StationDispatchBoard | null {
  const recap = args.recap;
  if (!recap) return null;
  if (!hasExactPlanCoverage(recap)) return null;
  const quest = args.quests.find((candidate) => candidate.id === recap.questId);
  if (!quest?.launch || quest.title !== recap.questTitle || quest.launch.options.length === 0) {
    return null;
  }
  if (
    args.departureInteractions.some(
      (interaction) =>
        interaction.kind !== "preparation" && interaction.kind !== "relief_allocation",
    ) ||
    args.departureContactLeads.some(
      (lead) => lead.kind !== "ally" || lead.questId !== recap.questId,
    )
  ) {
    return null;
  }
  const fieldTeamLeads = args.departureContactLeads.filter(
    (lead) => lead.questId === recap.questId && lead.kind === "ally",
  );
  if (fieldTeamLeads.length > 1) return null;
  const fieldTeamLead = fieldTeamLeads[0] ?? null;
  const support = SUPPORT_SLOTS.map((slot) =>
    supportEntry({
      recap,
      slot,
      interactions: args.departureInteractions,
      fieldTeamLead,
    }),
  );
  if (support.some((entry) => entry === null)) return null;
  const selectedSupport = support as StationDispatchBoardSupport[];
  if (
    !actionsExactlyCovered({
      support: selectedSupport,
      interactions: args.departureInteractions,
      fieldTeamLeads,
    })
  ) {
    return null;
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
    guidance: bounded(
      legalApproachIds.size > 0 ? READY_GUIDANCE : WAITING_GUIDANCE,
      "guidance",
      STATION_DISPATCH_BOARD_GUIDANCE_CHAR_LIMIT,
    ),
    dispatch: cloneDispatch(recap.dispatch),
    plan: planRows(recap),
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

function cloneAction(action: StationDispatchBoardAction | null): StationDispatchBoardAction | null {
  return action ? { ...action } : null;
}

export function cloneStationDispatchBoard(board: StationDispatchBoard): StationDispatchBoard {
  return {
    ...board,
    dispatch: board.dispatch
      ? { ...board.dispatch, remainingOptional: [...board.dispatch.remainingOptional] }
      : null,
    plan: board.plan.map((entry) => ({ ...entry })),
    support: board.support.map((entry) => ({ ...entry, action: cloneAction(entry.action) })),
    launch: {
      ...board.launch,
      approaches: board.launch.approaches.map((approach) => ({ ...approach })),
    },
  };
}

function compactAction(
  action: StationDispatchBoardAction | null,
): OpeningCompactStationDispatchBoardAction | null {
  if (!action) return null;
  return action.kind === "inspect"
    ? ["inspect", action.storyChoiceId]
    : ["talk", action.characterId, action.contactName];
}

export function compactStationDispatchBoard(
  board: StationDispatchBoard,
): OpeningCompactStationDispatchBoard {
  return [
    board.version,
    board.questId,
    compactText(board.guidance, STATION_DISPATCH_BOARD_GUIDANCE_CHAR_LIMIT),
    board.dispatch
      ? [
          board.dispatch.state,
          board.dispatch.minutes,
          board.dispatch.timing,
          [...board.dispatch.remainingOptional],
        ]
      : null,
    board.plan.map((entry) => {
      const support = board.support.find((candidate) => candidate.slot === entry.slot);
      const openSupport =
        entry.status === "open_optional" &&
        entry.selectedTitle === null &&
        support?.status === entry.status &&
        support.selectedTitle === entry.selectedTitle &&
        support.action !== null
          ? support
          : null;
      return [
        entry.slot,
        entry.status,
        entry.selectedTitle,
        openSupport
          ? compactText(
              SUPPORT_COPY[openSupport.slot].inlinePurpose,
              STATION_DISPATCH_BOARD_SUPPORT_COPY_CHAR_LIMIT,
            )
          : null,
        openSupport ? compactAction(openSupport.action) : null,
      ] as const;
    }),
  ];
}

export function compactStationDispatchBoardSupport(
  board: StationDispatchBoard,
): readonly OpeningCompactStationDispatchBoardSupport[] {
  return board.support.map(
    (support) =>
      [
        support.slot,
        compactText(support.purpose, STATION_DISPATCH_BOARD_SUPPORT_COPY_CHAR_LIMIT),
        compactAction(support.action),
      ] as const,
  );
}

export function cloneCompactStationDispatchBoard(
  board: OpeningCompactStationDispatchBoard,
): OpeningCompactStationDispatchBoard {
  return [
    board[0],
    board[1],
    board[2],
    board[3] ? [board[3][0], board[3][1], board[3][2], [...board[3][3]]] : null,
    board[4].map(
      (row) =>
        [
          row[0],
          row[1],
          row[2],
          row[3],
          row[4] ? [...row[4]] : null,
        ] as OpeningCompactStationDispatchBoardPlanRow,
    ),
  ];
}

export function cloneCompactStationDispatchBoardSupport(
  support: readonly OpeningCompactStationDispatchBoardSupport[],
): readonly OpeningCompactStationDispatchBoardSupport[] {
  return support.map((entry) => [entry[0], entry[1], entry[2] ? [...entry[2]] : null] as const);
}
