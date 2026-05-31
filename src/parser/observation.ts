/**
 * Parser observation (spec §9.2) — the only view a player (human or AI) gets:
 * the room, what's visible, where the exits go, the inventory, and the
 * enumerated legal actions (each with a stable `id`, a human `command`, and the
 * structured `action`). No engine internals leak; internal bookkeeping vars/flags
 * (the `__` convention, e.g. dialogue state) are hidden. Locked exits are simply
 * absent until traversable, so the action set never spoils *how* to open them.
 */
import type { GameState } from "../core/state.js";
import type { Action } from "../api/types.js";
import { evalConditions } from "../core/conditions.js";
import { type ParserIndex, activeDialogue, visibleObjectIds } from "./model.js";
import { enumerateActions } from "./legal_actions.js";

export type ParserObservation = {
  mode: "parser";
  room: string;
  title: string;
  description: string;
  visible_objects: { id: string; name: string }[];
  npcs_present: { id: string; name: string }[];
  exits: { direction: string; to: string }[];
  inventory: string[];
  state: { flags: string[]; vars: Record<string, number>; journal: string[] };
  dialogue: { npc: string; npc_text: string } | null;
  available_actions: { id: string; command: string; action: Action }[];
  ended: boolean;
  ending_id: string | null;
};

function visible<T>(record: Record<string, T>, keep: (v: T) => boolean): Record<string, T> {
  const out: Record<string, T> = {};
  for (const k of Object.keys(record).sort()) {
    if (!k.startsWith("__") && keep(record[k] as T)) out[k] = record[k] as T;
  }
  return out;
}

export function buildParserObservation(index: ParserIndex, state: GameState): ParserObservation {
  const room = index.rooms.get(state.current);
  const active = activeDialogue(index, state);

  const visObjs = visibleObjectIds(index, state, state.current).map((id) => ({ id, name: index.objects.get(id)?.name ?? id }));
  const npcs = (index.npcByRoom.get(state.current) ?? []).map((n) => ({ id: n.id, name: n.name }));
  const exits = room
    ? room.exits.filter((e) => evalConditions(e.conditions, state)).map((e) => ({ direction: e.direction, to: e.to })).sort((a, b) => a.direction.localeCompare(b.direction))
    : [];

  return {
    mode: "parser",
    room: state.current,
    title: room?.name ?? state.current,
    description: room?.description ?? "",
    visible_objects: visObjs,
    npcs_present: npcs,
    exits,
    inventory: [...state.inventory].sort(),
    state: {
      flags: Object.keys(state.flags).filter((f) => state.flags[f] === true && !f.startsWith("__")).sort(),
      vars: visible(state.vars, () => true),
      journal: [...state.journal],
    },
    dialogue: active ? { npc: active.npc.id, npc_text: active.node.npc_text } : null,
    available_actions: enumerateActions(index, state).map((o) => ({ id: o.id, command: o.command, action: o.action })),
    ended: state.ended,
    ending_id: state.endingId,
  };
}
