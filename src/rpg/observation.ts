/**
 * RPG observation (spec §9.2, §13 Stage 4).
 *
 * This is the only structured view a player or agent gets for the RPG runtime:
 * room text, visible objects, exits, blocked-exit hints, inventory, dialogue,
 * score, enemies, stats, and legal actions. It owns the RPG shape directly and
 * does not delegate through the legacy parser observation layer.
 */
import type { RpgAction } from "../api/types.js";
import { evalConditions } from "../core/conditions.js";
import type { GameState } from "../core/state.js";
import { openingWorldText } from "../world/observation.js";
import type { WorldBinding } from "../world/schema.js";
import {
  activeDialogue,
  endingText as resolveEndingText,
  nodeText,
  objectName,
  roomDescription,
  visibleObjectIds,
} from "./model.js";
import { enemyHp } from "./combat.js";
import { publicFlags, publicInventory, publicJournal, publicVars } from "./observation_state.js";
import { ATTACK_VAR, DEFENSE_VAR, HP_VAR, SCORE_VAR } from "./schema.js";
import type { RpgActionOption } from "./legal_actions.js";
import { enemyActive, enumerateRpgActions, type RpgIndex } from "./runner.js";

export type ObservationOptions = {
  hideGraph?: boolean;
  includeWorldIntro?: boolean;
  availableActions?: readonly RpgActionOption[];
};

export type RpgObservation = {
  mode: "rpg";
  room: string;
  title: string;
  description: string;
  world?: WorldBinding | null;
  visible_objects: { id: string; name: string }[];
  npcs_present: { id: string; name: string }[];
  exits: { direction: string; to?: string }[];
  blocked_exits: { direction: string; message: string }[];
  inventory: string[];
  state: { flags: string[]; vars: Record<string, number>; journal: string[] };
  dialogue: { npc: string; npc_text: string } | null;
  enemies_present: { id: string; name: string; hp: number }[];
  stats: { hp: number; attack: number; defense: number };
  available_actions: {
    id: string;
    command: string;
    action: RpgAction;
    skill_check?: { skill: string; difficulty: number; die: string };
  }[];
  score: number;
  max_score: number;
  ended: boolean;
  ending_id: string | null;
  ending: { id: string; title: string; text: string; death: boolean } | null;
};

export function buildRpgObservation(
  index: RpgIndex,
  state: GameState,
  opts: ObservationOptions = {},
): RpgObservation {
  const room = index.rooms.get(state.current);
  const active = activeDialogue(index, state);
  const endingDef =
    state.ended && state.endingId
      ? index.pack.endings.find((e) => e.id === state.endingId)
      : undefined;

  const maxScore = index.pack.meta.max_score ?? 0;
  const score = state.vars[SCORE_VAR] ?? 0;
  const resolvedEnding = endingDef ? resolveEndingText(endingDef, state) : undefined;
  const endingDescription =
    endingDef && resolvedEnding !== undefined
      ? maxScore > 0
        ? `${resolvedEnding.trimEnd()}\n\nFinal score: ${score} of ${maxScore}.`
        : resolvedEnding
      : undefined;
  const baseDescription = room ? roomDescription(room, state) : "";
  const world = index.pack.meta.world;

  const visibleObjects = visibleObjectIds(index, state, state.current).map((id) => {
    const object = index.objects.get(id);
    return { id, name: object ? objectName(object, state) : id };
  });

  const npcs = (index.npcByRoom.get(state.current) ?? [])
    .filter((npc) => evalConditions(npc.conditions ?? [], state))
    .map((npc) => ({ id: npc.id, name: npc.name }));

  const exits = room
    ? room.exits
        .filter((exit) => evalConditions(exit.conditions, state))
        .map((exit) =>
          opts.hideGraph
            ? { direction: exit.direction }
            : { direction: exit.direction, to: exit.to },
        )
        .sort((a, b) => a.direction.localeCompare(b.direction))
    : [];

  const blockedExits = room
    ? room.exits
        .filter((exit) => exit.locked_msg !== undefined && !evalConditions(exit.conditions, state))
        .map((exit) => ({ direction: exit.direction, message: exit.locked_msg as string }))
        .sort((a, b) => a.direction.localeCompare(b.direction))
    : [];

  const enemies = (index.enemyByRoom.get(state.current) ?? [])
    .filter((enemy) => enemyActive(state, enemy))
    .map((enemy) => ({ id: enemy.id, name: enemy.name, hp: enemyHp(state, enemy) }));

  return {
    mode: "rpg",
    room: state.current,
    title: endingDef ? endingDef.title : (room?.name ?? state.current),
    description:
      endingDescription ??
      (opts.includeWorldIntro ? openingWorldText(world, state, baseDescription) : baseDescription),
    ...(opts.includeWorldIntro ? { world: world ?? null } : {}),
    visible_objects: visibleObjects,
    npcs_present: npcs,
    exits,
    blocked_exits: blockedExits,
    inventory: publicInventory(state, { sort: true }),
    state: {
      flags: publicFlags(state),
      vars: publicVars(state),
      journal: publicJournal(state),
    },
    dialogue: active ? { npc: active.npc.id, npc_text: nodeText(active.node, state) } : null,
    enemies_present: enemies,
    stats: {
      hp: state.vars[HP_VAR] ?? 0,
      attack: state.vars[ATTACK_VAR] ?? 0,
      defense: state.vars[DEFENSE_VAR] ?? 0,
    },
    available_actions: (opts.availableActions ?? enumerateRpgActions(index, state)).map(
      (option) => ({
        id: option.id,
        command: option.command,
        action: option.action,
        ...(option.skill_check ? { skill_check: option.skill_check } : {}),
      }),
    ),
    score,
    max_score: maxScore,
    ended: state.ended,
    ending_id: state.endingId,
    ending: endingDef
      ? {
          id: endingDef.id,
          title: endingDef.title,
          text: resolvedEnding ?? endingDef.text,
          death: endingDef.death,
        }
      : null,
  };
}
