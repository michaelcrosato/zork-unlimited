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
import { type ParserIndex, activeDialogue, roomDescription, visibleObjectIds } from "./model.js";
import { enumerateActions } from "./legal_actions.js";
import { SCORE_VAR } from "./schema.js";

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
  score: number;
  max_score: number;
  ended: boolean;
  ending_id: string | null;
  ending: { id: string; title: string; text: string; death: boolean } | null;
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
  const endingDef = state.ended && state.endingId ? index.pack.endings.find((e) => e.id === state.endingId) : undefined;

  const maxScore = index.pack.meta.max_score ?? 0;
  const score = state.vars[SCORE_VAR] ?? 0;
  // At an ending, in a pack that tracks score, give the player closure: append a
  // "Final score: X of Y." tally to the rendered ending text. The canonical
  // `ending.text` (and the pack YAML) stay pure — only the player-facing
  // `description` carries the summary, so every renderer (CLI play bins, the MCP
  // observation, the UI) surfaces it without any per-pack content edit. Packs with
  // no score (max_score 0 — e.g. the CYOA packs use a different observation
  // entirely) are untouched.
  const endingText = endingDef
    ? maxScore > 0
      ? `${endingDef.text.trimEnd()}\n\nFinal score: ${score} of ${maxScore}.`
      : endingDef.text
    : undefined;

  const visObjs = visibleObjectIds(index, state, state.current).map((id) => ({ id, name: index.objects.get(id)?.name ?? id }));
  const npcs = (index.npcByRoom.get(state.current) ?? []).map((n) => ({ id: n.id, name: n.name }));
  const exits = room
    ? room.exits.filter((e) => evalConditions(e.conditions, state)).map((e) => ({ direction: e.direction, to: e.to })).sort((a, b) => a.direction.localeCompare(b.direction))
    : [];

  return {
    mode: "parser",
    room: state.current,
    title: endingDef ? endingDef.title : room?.name ?? state.current,
    description: endingText ?? (room ? roomDescription(room, state) : ""),
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
    score,
    max_score: maxScore,
    ended: state.ended,
    ending_id: state.endingId,
    ending: endingDef ? { id: endingDef.id, title: endingDef.title, text: endingDef.text, death: endingDef.death } : null,
  };
}
