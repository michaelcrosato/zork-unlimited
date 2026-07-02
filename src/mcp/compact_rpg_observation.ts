import type { RpgObservation } from "../rpg/observation.js";
import type { McpActionOption } from "./types.js";

const CORE_STATE_VARS = new Set(["attack", "defense", "hp"]);
const COMPACT_INVENTORY_LIMIT = 16;
const COMPACT_FLAG_LIMIT = 16;
const COMPACT_JOURNAL_LIMIT = 5;
export const RPG_COMPACT_OBSERVATION_VERSION = 2 as const;

export type RpgCompactRef = readonly [id: string, name: string];
export type RpgCompactExit = string | readonly [direction: string, to: string];
export type RpgCompactBlockedExit = readonly [direction: string, message: string];
export type RpgCompactDialogue = readonly [npc: string, text: string];
export type RpgCompactEnemy = readonly [id: string, name: string, hp: number];
export type RpgCompactVitals = readonly [
  hp: number,
  attack: number,
  defense: number,
  score: number,
  maxScore: number,
];

export type RpgCompactObservation = {
  v: typeof RPG_COMPACT_OBSERVATION_VERSION;
  here: readonly [room: string, title: string];
  text: string;
  exits: RpgCompactExit[];
  vitals: RpgCompactVitals;
  actions?: McpActionOption[];
  objects?: RpgCompactRef[];
  npcs?: RpgCompactRef[];
  blocked?: RpgCompactBlockedExit[];
  inv?: string[];
  flags?: string[];
  vars?: Record<string, number>;
  journal?: string[];
  more?: {
    inv?: number;
    flags?: number;
    journal?: number;
  };
  dialogue?: RpgCompactDialogue;
  enemies?: RpgCompactEnemy[];
  ended?: true;
  ending_id?: string;
  ending?: RpgObservation["ending"];
};

function ref(value: { id: string; name: string }): RpgCompactRef {
  return [value.id, value.name];
}

function compactVars(vars: Record<string, number>): Record<string, number> | undefined {
  const compact = Object.fromEntries(
    Object.entries(vars).filter(([key]) => !CORE_STATE_VARS.has(key)),
  );
  return Object.keys(compact).length > 0 ? compact : undefined;
}

function compactHead(values: readonly string[], limit: number): string[] {
  return values.slice(0, limit);
}

function compactRecent(values: readonly string[], limit: number): string[] {
  return values.slice(Math.max(0, values.length - limit));
}

function omittedCount(values: readonly string[], compacted: readonly string[]): number | undefined {
  return values.length > compacted.length ? values.length - compacted.length : undefined;
}

export function compactRpgObservation(
  obs: RpgObservation,
  actions: McpActionOption[],
): RpgCompactObservation {
  const vars = compactVars(obs.state.vars);
  const inv = compactHead(obs.inventory, COMPACT_INVENTORY_LIMIT);
  const flags = compactHead(obs.state.flags, COMPACT_FLAG_LIMIT);
  const journal = compactRecent(obs.state.journal, COMPACT_JOURNAL_LIMIT);
  const omittedInv = omittedCount(obs.inventory, inv);
  const omittedFlags = omittedCount(obs.state.flags, flags);
  const omittedJournal = omittedCount(obs.state.journal, journal);
  const more = {
    ...(omittedInv !== undefined ? { inv: omittedInv } : {}),
    ...(omittedFlags !== undefined ? { flags: omittedFlags } : {}),
    ...(omittedJournal !== undefined ? { journal: omittedJournal } : {}),
  };
  return {
    v: RPG_COMPACT_OBSERVATION_VERSION,
    here: [obs.room, obs.title],
    text: obs.description,
    exits: obs.exits.map((exit) =>
      exit.to === undefined ? exit.direction : [exit.direction, exit.to],
    ),
    vitals: [obs.stats.hp, obs.stats.attack, obs.stats.defense, obs.score, obs.max_score],
    ...(actions.length > 0 ? { actions } : {}),
    ...(obs.visible_objects.length > 0 ? { objects: obs.visible_objects.map(ref) } : {}),
    ...(obs.npcs_present.length > 0 ? { npcs: obs.npcs_present.map(ref) } : {}),
    ...(obs.blocked_exits.length > 0
      ? { blocked: obs.blocked_exits.map((exit) => [exit.direction, exit.message] as const) }
      : {}),
    ...(inv.length > 0 ? { inv } : {}),
    ...(flags.length > 0 ? { flags } : {}),
    ...(vars ? { vars } : {}),
    ...(journal.length > 0 ? { journal } : {}),
    ...(Object.keys(more).length > 0 ? { more } : {}),
    ...(obs.dialogue ? { dialogue: [obs.dialogue.npc, obs.dialogue.npc_text] as const } : {}),
    ...(obs.enemies_present.length > 0
      ? { enemies: obs.enemies_present.map((enemy) => [enemy.id, enemy.name, enemy.hp] as const) }
      : {}),
    ...(obs.ended ? { ended: true as const } : {}),
    ...(obs.ending_id ? { ending_id: obs.ending_id } : {}),
    ...(obs.ending ? { ending: obs.ending } : {}),
  };
}
