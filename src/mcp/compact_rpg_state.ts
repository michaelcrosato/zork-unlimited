import type { GameState, ObjectRuntime } from "../core/state.js";
import { ATTACK_VAR, DEFENSE_VAR, HP_VAR, SCORE_VAR } from "../rpg/schema.js";
import {
  publicFlags,
  publicInventory,
  publicJournal,
  publicVars,
} from "../rpg/observation_state.js";
import {
  compactHead,
  compactRecent,
  compactTrailingOmissionCounts,
  omittedCount,
} from "./compact_truncation.js";
import { compactMcpTranscriptSceneId, compactMcpTranscriptSummaryValue } from "./action_labels.js";

const MAX_SCORE_VAR = "max_score";
const CORE_STATE_VARS = new Set([ATTACK_VAR, DEFENSE_VAR, HP_VAR, MAX_SCORE_VAR, SCORE_VAR]);

export const RPG_COMPACT_STATE_VERSION = 1 as const;
export const COMPACT_STATE_INVENTORY_LIMIT = 16;
export const COMPACT_STATE_FLAG_LIMIT = 16;
export const COMPACT_STATE_VAR_LIMIT = 16;
export const COMPACT_STATE_JOURNAL_LIMIT = 5;
export const COMPACT_STATE_VISITED_LIMIT = 16;
export const COMPACT_STATE_OBJECT_LIMIT = 16;
export const COMPACT_STATE_OBJECT_CONTENT_LIMIT = 8;
export const COMPACT_STATE_QUEST_LIMIT = 16;

export type RpgCompactStateVitals = readonly [
  hp: number,
  attack: number,
  defense: number,
  score: number,
  maxScore: number,
];

export type RpgCompactStateObject = {
  id: string;
  open?: true;
  locked?: boolean;
  by?: "p" | "w";
  room?: string;
  contents?: string[];
  contents_more?: number;
};

export type RpgCompactQuestStage = readonly [quest: string, stage: string];

export type RpgCompactStateMore = readonly [
  inventory: number,
  flags?: number,
  vars?: number,
  journal?: number,
  visited?: number,
  objects?: number,
  quests?: number,
];

export type RpgCompactState = {
  v: typeof RPG_COMPACT_STATE_VERSION;
  at: string;
  step: number;
  seed: number;
  vitals: RpgCompactStateVitals;
  inv?: string[];
  flags?: string[];
  vars?: Record<string, number>;
  journal?: string[];
  visited?: string[];
  objects?: RpgCompactStateObject[];
  quests?: RpgCompactQuestStage[];
  more?: RpgCompactStateMore;
  ended?: true;
  ending_id?: string;
};

type CompactStateOptions = {
  maxScore?: number;
};

type CompactVarsResult = {
  vars?: Record<string, number>;
  omitted: number;
};

function compactVisibleVars(state: GameState): CompactVarsResult {
  const vars = publicVars(state);
  const keys = Object.keys(vars)
    .filter((key) => !CORE_STATE_VARS.has(key))
    .sort();
  const capped = Math.min(keys.length, COMPACT_STATE_VAR_LIMIT);
  const compact: Record<string, number> = {};
  for (let index = 0; index < capped; index += 1) {
    const key = keys[index]!;
    compact[compactMcpTranscriptSummaryValue(key)] = vars[key]!;
  }
  return {
    ...(capped > 0 ? { vars: compact } : {}),
    omitted: keys.length - capped,
  };
}

function visibleVisitedRooms(state: GameState): string[] {
  return Object.keys(state.visited)
    .filter((room) => state.visited[room] === true)
    .sort();
}

function compactObjectState(id: string, runtime: ObjectRuntime): RpgCompactStateObject {
  const contents =
    runtime.contents === undefined
      ? undefined
      : compactHead(runtime.contents, COMPACT_STATE_OBJECT_CONTENT_LIMIT).map(
          compactMcpTranscriptSummaryValue,
        );
  const contentsMore =
    runtime.contents === undefined ? undefined : omittedCount(runtime.contents, contents ?? []);
  return {
    id: compactMcpTranscriptSummaryValue(id),
    ...(runtime.open === true ? { open: true as const } : {}),
    ...(runtime.locked !== undefined ? { locked: runtime.locked } : {}),
    ...(runtime.takenBy
      ? { by: runtime.takenBy === "player" ? ("p" as const) : ("w" as const) }
      : {}),
    ...(runtime.room ? { room: compactMcpTranscriptSceneId(runtime.room) } : {}),
    ...(contents !== undefined ? { contents } : {}),
    ...(contentsMore !== undefined ? { contents_more: contentsMore } : {}),
  };
}

function compactObjectStates(state: GameState): RpgCompactStateObject[] {
  return compactHead(Object.keys(state.objectState).sort(), COMPACT_STATE_OBJECT_LIMIT).map((id) =>
    compactObjectState(id, state.objectState[id]!),
  );
}

function compactQuestStages(state: GameState): RpgCompactQuestStage[] {
  return compactHead(Object.keys(state.questStage).sort(), COMPACT_STATE_QUEST_LIMIT).map(
    (quest) =>
      [
        compactMcpTranscriptSummaryValue(quest),
        compactMcpTranscriptSummaryValue(state.questStage[quest]!),
      ] as const,
  );
}

export function compactRpgState(state: GameState, opts: CompactStateOptions = {}): RpgCompactState {
  const inventory = publicInventory(state, { sort: true });
  const flags = publicFlags(state);
  const vars = compactVisibleVars(state);
  const journal = publicJournal(state);
  const visited = visibleVisitedRooms(state);
  const objectIds = Object.keys(state.objectState).sort();
  const questIds = Object.keys(state.questStage).sort();

  const compactInventory = compactHead(inventory, COMPACT_STATE_INVENTORY_LIMIT).map(
    compactMcpTranscriptSummaryValue,
  );
  const compactFlags = compactHead(flags, COMPACT_STATE_FLAG_LIMIT).map(
    compactMcpTranscriptSummaryValue,
  );
  const compactJournal = compactRecent(journal, COMPACT_STATE_JOURNAL_LIMIT).map(
    compactMcpTranscriptSummaryValue,
  );
  const compactVisited = compactHead(visited, COMPACT_STATE_VISITED_LIMIT).map(
    compactMcpTranscriptSceneId,
  );
  const objects = compactObjectStates(state);
  const quests = compactQuestStages(state);
  const more = compactTrailingOmissionCounts([
    omittedCount(inventory, compactInventory) ?? 0,
    omittedCount(flags, compactFlags) ?? 0,
    vars.omitted,
    omittedCount(journal, compactJournal) ?? 0,
    omittedCount(visited, compactVisited) ?? 0,
    Math.max(0, objectIds.length - objects.length),
    Math.max(0, questIds.length - quests.length),
  ]) as RpgCompactStateMore | undefined;

  return {
    v: RPG_COMPACT_STATE_VERSION,
    at: compactMcpTranscriptSceneId(state.current),
    step: state.step,
    seed: state.seed,
    vitals: [
      state.vars[HP_VAR] ?? 0,
      state.vars[ATTACK_VAR] ?? 0,
      state.vars[DEFENSE_VAR] ?? 0,
      state.vars[SCORE_VAR] ?? 0,
      opts.maxScore ?? state.vars[MAX_SCORE_VAR] ?? 0,
    ],
    ...(compactInventory.length > 0 ? { inv: compactInventory } : {}),
    ...(compactFlags.length > 0 ? { flags: compactFlags } : {}),
    ...(vars.vars ? { vars: vars.vars } : {}),
    ...(compactJournal.length > 0 ? { journal: compactJournal } : {}),
    ...(compactVisited.length > 0 ? { visited: compactVisited } : {}),
    ...(objects.length > 0 ? { objects } : {}),
    ...(quests.length > 0 ? { quests } : {}),
    ...(more ? { more } : {}),
    ...(state.ended ? { ended: true as const } : {}),
    ...(state.endingId ? { ending_id: compactMcpTranscriptSummaryValue(state.endingId) } : {}),
  };
}
