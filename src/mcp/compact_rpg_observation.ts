import type { RpgObservation } from "../rpg/observation.js";
import {
  compactHead,
  compactRecent,
  compactText,
  compactTrailingOmissionCounts,
  omittedCount,
} from "./compact_truncation.js";
import {
  compactMcpTranscriptSceneId,
  compactMcpTranscriptSummaryValue,
  compactMcpTranscriptTitle,
} from "./action_labels.js";
import { RPG_COMPACT_EVENT_LEGEND } from "./compact_rpg_event.js";
const CORE_STATE_VARS = new Set(["attack", "defense", "hp", "max_score", "score"]);
export const COMPACT_ACTION_LIMIT = 24;
export const COMPACT_EXIT_LIMIT = 12;
export const COMPACT_VISIBLE_REF_LIMIT = 16;
export const COMPACT_BLOCKED_EXIT_LIMIT = 8;
export const COMPACT_ENEMY_LIMIT = 16;
export const COMPACT_VAR_LIMIT = 16;
const COMPACT_INVENTORY_LIMIT = 16;
const COMPACT_FLAG_LIMIT = 16;
const COMPACT_JOURNAL_LIMIT = 5;
export const COMPACT_DESCRIPTION_CHAR_LIMIT = 360;
export const COMPACT_DIALOGUE_CHAR_LIMIT = 280;
export const COMPACT_BLOCKED_EXIT_CHAR_LIMIT = 180;
export const COMPACT_ENDING_TEXT_CHAR_LIMIT = 360;
export const RPG_COMPACT_OBSERVATION_VERSION = 15 as const;

export type RpgCompactRef = string;
export type RpgCompactExit = string | readonly [direction: string, to: string];
export type RpgCompactBlockedExit = readonly [direction: string, message: string];
export type RpgCompactDialogue = readonly [npc: string, text: string];
export type RpgCompactEnemy = readonly [id: string, hp: number];
export type RpgCompactMore = readonly [
  inventory: number,
  flags?: number,
  vars?: number,
  journal?: number,
  actions?: number,
  exits?: number,
  objects?: number,
  npcs?: number,
  blocked?: number,
  enemies?: number,
];
export type RpgCompactVitals = readonly [
  hp: number,
  attack: number,
  defense: number,
  score: number,
  maxScore: number,
];

export type RpgCompactObservation = {
  v?: typeof RPG_COMPACT_OBSERVATION_VERSION;
  here: readonly [room: string, title: string];
  text: string;
  exits?: RpgCompactExit[];
  vitals: RpgCompactVitals;
  actions?: string[];
  objects?: RpgCompactRef[];
  npcs?: RpgCompactRef[];
  blocked?: RpgCompactBlockedExit[];
  inv?: string[];
  flags?: string[];
  vars?: Record<string, number>;
  journal?: string[];
  more?: RpgCompactMore;
  dialogue?: RpgCompactDialogue;
  enemies?: RpgCompactEnemy[];
  ended?: true;
  ending_id?: string;
  ending?: RpgObservation["ending"];
};

/**
 * Agent-facing legend for the positional fields of RpgCompactObservation, plus the
 * compact step_action event tuples. Co-located with the encoder so they cannot
 * drift: the `satisfies` clause forces an entry for every observation field, and
 * tests/unit/compact_legend.test.ts asserts emitted contexts stay covered. Sent
 * ONCE per RPG session (new_game / start_world_quest / load_game), never repeated
 * in per-step payloads.
 */
export const RPG_COMPACT_LEGEND = {
  v: "compact observation schema version",
  here: "[room_id, room_title] current room",
  text: "room description",
  exits: "open exits: 'direction' or [direction, dest_room_id]",
  vitals: "[hp, attack, defense, score, max_score]",
  actions: "legal action ids (include_actions only; list_legal_actions always has them)",
  objects: "visible object ids",
  npcs: "ids of NPCs present",
  blocked: "[[direction, reason], ...] blocked exits",
  inv: "carried item ids",
  flags: "set story flags",
  vars: "story variables (core stats already shown in vitals are omitted)",
  journal: "recent journal entries",
  more: "[inv, flags, vars, journal, actions, exits, objects, npcs, blocked, enemies] counts omitted by truncation, trailing zeros dropped",
  dialogue: "[npc_id, npc_line] active dialogue",
  enemies: "[[enemy_id, hp], ...] enemies present",
  ended: "true when the quest has ended",
  ending_id: "ending id when ended",
  ending: "{id, title, text} ending details when ended",
  events: RPG_COMPACT_EVENT_LEGEND,
} as const satisfies Record<keyof RpgCompactObservation | "events", string>;

export type RpgCompactLegend = typeof RPG_COMPACT_LEGEND;

export type CompactRpgObservationOptions = {
  includeActions?: boolean;
  includeVersion?: boolean;
};

function compactProse(value: string, limit: number): string {
  return compactText(value.trimEnd(), limit);
}

function compactEnding(ending: RpgObservation["ending"]): RpgObservation["ending"] {
  return ending === null
    ? null
    : {
        ...ending,
        id: compactMcpTranscriptSummaryValue(ending.id),
        title: compactMcpTranscriptTitle(ending.title),
        text: compactProse(ending.text, COMPACT_ENDING_TEXT_CHAR_LIMIT),
      };
}

type CompactVarsResult = {
  vars?: Record<string, number>;
  omitted: number;
};

function compactVars(vars: Record<string, number>): CompactVarsResult {
  const keys = Object.keys(vars)
    .filter((key) => !CORE_STATE_VARS.has(key))
    .sort();
  const compact: Record<string, number> = {};
  const capped = Math.min(keys.length, COMPACT_VAR_LIMIT);
  for (let index = 0; index < capped; index += 1) {
    const key = keys[index]!;
    compact[compactMcpTranscriptSummaryValue(key)] = vars[key]!;
  }
  return {
    ...(capped > 0 ? { vars: compact } : {}),
    omitted: keys.length - capped,
  };
}

export function compactRpgObservation(
  obs: RpgObservation,
  actionIds: string[],
  opts: CompactRpgObservationOptions = {},
): RpgCompactObservation {
  const vars = compactVars(obs.state.vars);
  const includeActions = opts.includeActions === true;
  const includeVersion = opts.includeVersion === true;
  const actions = includeActions ? compactHead(actionIds, COMPACT_ACTION_LIMIT) : [];
  const inv = compactHead(obs.inventory, COMPACT_INVENTORY_LIMIT).map(
    compactMcpTranscriptSummaryValue,
  );
  const flags = compactHead(obs.state.flags, COMPACT_FLAG_LIMIT).map(
    compactMcpTranscriptSummaryValue,
  );
  const journal = compactRecent(obs.state.journal, COMPACT_JOURNAL_LIMIT).map(
    compactMcpTranscriptSummaryValue,
  );
  const compactExits = compactHead(obs.exits, COMPACT_EXIT_LIMIT);
  const compactObjects = compactHead(obs.visible_objects, COMPACT_VISIBLE_REF_LIMIT);
  const compactNpcs = compactHead(obs.npcs_present, COMPACT_VISIBLE_REF_LIMIT);
  const compactBlockedExits = compactHead(obs.blocked_exits, COMPACT_BLOCKED_EXIT_LIMIT);
  const compactEnemies = compactHead(obs.enemies_present, COMPACT_ENEMY_LIMIT);
  const omittedActions = includeActions ? omittedCount(actionIds, actions) : 0;
  const omittedInv = omittedCount(obs.inventory, inv);
  const omittedFlags = omittedCount(obs.state.flags, flags);
  const omittedJournal = omittedCount(obs.state.journal, journal);
  const omittedExits = omittedCount(obs.exits, compactExits);
  const omittedObjects = omittedCount(obs.visible_objects, compactObjects);
  const omittedNpcs = omittedCount(obs.npcs_present, compactNpcs);
  const omittedBlocked = omittedCount(obs.blocked_exits, compactBlockedExits);
  const omittedEnemies = omittedCount(obs.enemies_present, compactEnemies);
  const exits: RpgCompactExit[] = [];
  for (const exit of compactExits) {
    const direction = compactMcpTranscriptSummaryValue(exit.direction);
    exits.push(
      exit.to === undefined ? direction : [direction, compactMcpTranscriptSceneId(exit.to)],
    );
  }
  const objects: RpgCompactRef[] = [];
  for (const object of compactObjects) {
    objects.push(compactMcpTranscriptSummaryValue(object.id));
  }
  const npcs: RpgCompactRef[] = [];
  for (const npc of compactNpcs) {
    npcs.push(compactMcpTranscriptSummaryValue(npc.id));
  }
  const blocked: RpgCompactBlockedExit[] = [];
  for (const exit of compactBlockedExits) {
    blocked.push([
      compactMcpTranscriptSummaryValue(exit.direction),
      compactProse(exit.message, COMPACT_BLOCKED_EXIT_CHAR_LIMIT),
    ]);
  }
  const enemies: RpgCompactEnemy[] = [];
  for (const enemy of compactEnemies) {
    enemies.push([compactMcpTranscriptSummaryValue(enemy.id), enemy.hp]);
  }
  const more = compactTrailingOmissionCounts([
    omittedInv ?? 0,
    omittedFlags ?? 0,
    vars.omitted,
    omittedJournal ?? 0,
    omittedActions ?? 0,
    omittedExits ?? 0,
    omittedObjects ?? 0,
    omittedNpcs ?? 0,
    omittedBlocked ?? 0,
    omittedEnemies ?? 0,
  ]) as RpgCompactMore | undefined;
  return {
    ...(includeVersion ? { v: RPG_COMPACT_OBSERVATION_VERSION } : {}),
    here: [compactMcpTranscriptSceneId(obs.room), compactMcpTranscriptTitle(obs.title)],
    text: compactProse(obs.description, COMPACT_DESCRIPTION_CHAR_LIMIT),
    ...(exits.length > 0 ? { exits } : {}),
    vitals: [obs.stats.hp, obs.stats.attack, obs.stats.defense, obs.score, obs.max_score],
    ...(includeActions && actions.length > 0 ? { actions } : {}),
    ...(objects.length > 0 ? { objects } : {}),
    ...(npcs.length > 0 ? { npcs } : {}),
    ...(blocked.length > 0 ? { blocked } : {}),
    ...(inv.length > 0 ? { inv } : {}),
    ...(flags.length > 0 ? { flags } : {}),
    ...(vars.vars ? { vars: vars.vars } : {}),
    ...(journal.length > 0 ? { journal } : {}),
    ...(more ? { more } : {}),
    ...(obs.dialogue
      ? {
          dialogue: [
            compactMcpTranscriptSummaryValue(obs.dialogue.npc),
            compactProse(obs.dialogue.npc_text, COMPACT_DIALOGUE_CHAR_LIMIT),
          ] as const,
        }
      : {}),
    ...(enemies.length > 0 ? { enemies } : {}),
    ...(obs.ended ? { ended: true as const } : {}),
    ...(obs.ending_id ? { ending_id: compactMcpTranscriptSummaryValue(obs.ending_id) } : {}),
    ...(obs.ending ? { ending: compactEnding(obs.ending) } : {}),
  };
}
