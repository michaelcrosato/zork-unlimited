import type { RpgObservation } from "../rpg/observation.js";
const CORE_STATE_VARS = new Set(["attack", "defense", "hp", "max_score", "score"]);
const COMPACT_INVENTORY_LIMIT = 16;
const COMPACT_FLAG_LIMIT = 16;
const COMPACT_JOURNAL_LIMIT = 5;
export const RPG_COMPACT_OBSERVATION_VERSION = 5 as const;

export type RpgCompactRef = readonly [id: string, name: string];
export type RpgCompactExit = string | readonly [direction: string, to: string];
export type RpgCompactBlockedExit = readonly [direction: string, message: string];
export type RpgCompactDialogue = readonly [npc: string, text: string];
export type RpgCompactEnemy = readonly [id: string, name: string, hp: number];
export type RpgCompactMore = readonly [inventory: number, flags: number, journal: number];
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

function compactVars(vars: Record<string, number>): Record<string, number> | undefined {
  const compact: Record<string, number> = {};
  let hasCompactVar = false;
  for (const key in vars) {
    if (!Object.prototype.hasOwnProperty.call(vars, key) || CORE_STATE_VARS.has(key)) continue;
    compact[key] = vars[key]!;
    hasCompactVar = true;
  }
  return hasCompactVar ? compact : undefined;
}

function compactHead(values: readonly string[], limit: number): string[] {
  const compact: string[] = [];
  for (let index = 0; index < values.length && index < limit; index += 1) {
    compact.push(values[index]!);
  }
  return compact;
}

function compactRecent(values: readonly string[], limit: number): string[] {
  const compact: string[] = [];
  const start = Math.max(0, values.length - limit);
  for (let index = start; index < values.length; index += 1) compact.push(values[index]!);
  return compact;
}

function omittedCount(values: readonly string[], compacted: readonly string[]): number | undefined {
  return values.length > compacted.length ? values.length - compacted.length : undefined;
}

export function compactRpgObservation(
  obs: RpgObservation,
  actionIds: string[],
): RpgCompactObservation {
  const vars = compactVars(obs.state.vars);
  const inv = compactHead(obs.inventory, COMPACT_INVENTORY_LIMIT);
  const flags = compactHead(obs.state.flags, COMPACT_FLAG_LIMIT);
  const journal = compactRecent(obs.state.journal, COMPACT_JOURNAL_LIMIT);
  const omittedInv = omittedCount(obs.inventory, inv);
  const omittedFlags = omittedCount(obs.state.flags, flags);
  const omittedJournal = omittedCount(obs.state.journal, journal);
  const exits: RpgCompactExit[] = [];
  for (const exit of obs.exits) {
    exits.push(exit.to === undefined ? exit.direction : [exit.direction, exit.to]);
  }
  const objects: RpgCompactRef[] = [];
  for (const object of obs.visible_objects) objects.push([object.id, object.name]);
  const npcs: RpgCompactRef[] = [];
  for (const npc of obs.npcs_present) npcs.push([npc.id, npc.name]);
  const blocked: RpgCompactBlockedExit[] = [];
  for (const exit of obs.blocked_exits) blocked.push([exit.direction, exit.message]);
  const enemies: RpgCompactEnemy[] = [];
  for (const enemy of obs.enemies_present) enemies.push([enemy.id, enemy.name, enemy.hp]);
  const more =
    omittedInv !== undefined || omittedFlags !== undefined || omittedJournal !== undefined
      ? ([omittedInv ?? 0, omittedFlags ?? 0, omittedJournal ?? 0] as const)
      : undefined;
  return {
    v: RPG_COMPACT_OBSERVATION_VERSION,
    here: [obs.room, obs.title],
    text: obs.description,
    ...(exits.length > 0 ? { exits } : {}),
    vitals: [obs.stats.hp, obs.stats.attack, obs.stats.defense, obs.score, obs.max_score],
    ...(actionIds.length > 0 ? { actions: actionIds } : {}),
    ...(objects.length > 0 ? { objects } : {}),
    ...(npcs.length > 0 ? { npcs } : {}),
    ...(blocked.length > 0 ? { blocked } : {}),
    ...(inv.length > 0 ? { inv } : {}),
    ...(flags.length > 0 ? { flags } : {}),
    ...(vars ? { vars } : {}),
    ...(journal.length > 0 ? { journal } : {}),
    ...(more ? { more } : {}),
    ...(obs.dialogue ? { dialogue: [obs.dialogue.npc, obs.dialogue.npc_text] as const } : {}),
    ...(enemies.length > 0 ? { enemies } : {}),
    ...(obs.ended ? { ended: true as const } : {}),
    ...(obs.ending_id ? { ending_id: obs.ending_id } : {}),
    ...(obs.ending ? { ending: obs.ending } : {}),
  };
}
