/**
 * Parser observation (spec §9.2) — the only view a player (human or AI) gets:
 * the room, what's visible, where the exits go, the inventory, and the
 * enumerated legal actions (each with a stable `id`, a human `command`, and the
 * structured `action`). No engine internals leak; internal bookkeeping vars/flags
 * (the `__` convention, e.g. dialogue state) are hidden. Locked exits are absent
 * from the traversable `exits` list and the action set, so the action set never
 * spoils *how* to open them.
 *
 * A locked exit whose author gave it a `locked_msg`, however, is surfaced as a
 * `blocked_exits` HINT — its direction and that message — WITHOUT being a
 * selectable action. This brings the structured observation to parity with the
 * free-text parser (where attempting a blocked move prints `locked_msg`, see
 * bin/parser_play.ts): a blind player who reads room prose mentioning a way that
 * isn't in `exits` ("an archway east, choked with cold") now learns the way exists
 * and WHY it's blocked, without learning how to clear it (that action stays hidden).
 * Opt-in per exit: an exit with no `locked_msg` is silent, exactly as before.
 *
 * Difficulty (ULTRAPLAN 2026-06-02 §Week.4): with `hideGraph`, each exit reports
 * only its `direction` and NOT its destination (`to`) — the agent still knows it
 * can go north, but not where north leads until it goes. This turns the structured
 * API from "here is the adjacency list" into a real spatial-reasoning test (the
 * thing TALES/Jericho measure), while the legal MOVE action and the engine's
 * resolution are untouched. Default off: the internal coverage bot and every
 * existing consumer keep the full graph.
 */
import type { GameState } from "../core/state.js";
import type { Action } from "../api/types.js";
import { evalConditions } from "../core/conditions.js";
import {
  type ParserIndex,
  activeDialogue,
  endingText as resolveEndingText,
  nodeText,
  objectName,
  roomDescription,
  visibleObjectIds,
} from "./model.js";
import { enumerateActions } from "./legal_actions.js";
import { SCORE_VAR } from "./schema.js";

/** Agent-facing observation options shared across modes. `hideGraph` omits each
 *  exit's destination (`to`) — see the file header. */
export type ObservationOptions = { hideGraph?: boolean };

export type ParserObservation = {
  mode: "parser";
  room: string;
  title: string;
  description: string;
  visible_objects: { id: string; name: string }[];
  npcs_present: { id: string; name: string }[];
  // `to` is omitted under `hideGraph` (the destination is hidden until traversed).
  exits: { direction: string; to?: string }[];
  // Currently-blocked exits the author hinted with a `locked_msg`: a "there is a
  // way here and it's blocked because X" cue, NOT a selectable action (the action
  // to clear it stays hidden). Only exits whose conditions are unmet AND that carry
  // a `locked_msg` appear; the destination is never leaked (hideGraph-safe).
  blocked_exits: { direction: string; message: string }[];
  inventory: string[];
  state: { flags: string[]; vars: Record<string, number>; journal: string[] };
  dialogue: { npc: string; npc_text: string } | null;
  // A skill-checked USE carries a `skill_check` annotation (rolled stat + difficulty), so
  // a declared skill var no longer reads as vestigial (bug_0274; CYOA sibling bug_0269).
  // Omitted on every plain action ⇒ byte-identical to the legacy shape for non-skill packs.
  available_actions: {
    id: string;
    command: string;
    action: Action;
    skill_check?: { skill: string; difficulty: number };
  }[];
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

export function buildParserObservation(
  index: ParserIndex,
  state: GameState,
  opts: ObservationOptions = {},
): ParserObservation {
  const room = index.rooms.get(state.current);
  const active = activeDialogue(index, state);
  const endingDef =
    state.ended && state.endingId
      ? index.pack.endings.find((e) => e.id === state.endingId)
      : undefined;

  const maxScore = index.pack.meta.max_score ?? 0;
  const score = state.vars[SCORE_VAR] ?? 0;
  // The epilogue the player actually sees: the first reactive ending `variant` whose
  // `when` holds, else the base `text` (model.ts endingText — the terminal analogue of
  // roomDescription). Resolved once so the rendered `description` and the structured
  // `ending.text` block agree on which epilogue fired.
  const resolvedEnding = endingDef ? resolveEndingText(endingDef, state) : undefined;
  // At an ending, in a pack that tracks score, give the player closure: append a
  // "Final score: X of Y." tally to the rendered ending text. The canonical
  // `ending.text` (and the pack YAML) stay pure — only the player-facing
  // `description` carries the summary, so every renderer (CLI play bins, the MCP
  // observation, the UI) surfaces it without any per-pack content edit. Packs with
  // no score (max_score 0 — e.g. the CYOA packs use a different observation
  // entirely) are untouched.
  const endingText =
    endingDef && resolvedEnding !== undefined
      ? maxScore > 0
        ? `${resolvedEnding.trimEnd()}\n\nFinal score: ${score} of ${maxScore}.`
        : resolvedEnding
      : undefined;

  const visObjs = visibleObjectIds(index, state, state.current).map((id) => {
    const o = index.objects.get(id);
    return { id, name: o ? objectName(o, state) : id };
  });
  const npcs = (index.npcByRoom.get(state.current) ?? []).map((n) => ({ id: n.id, name: n.name }));
  const exits = room
    ? room.exits
        .filter((e) => evalConditions(e.conditions, state))
        .map((e) =>
          opts.hideGraph ? { direction: e.direction } : { direction: e.direction, to: e.to },
        )
        .sort((a, b) => a.direction.localeCompare(b.direction))
    : [];
  // Blocked-exit hints: an exit whose conditions are NOT met but which the author
  // gave a `locked_msg`. Never includes traversable exits (those are in `exits`),
  // and never leaks the destination — only the direction and the authored message.
  const blockedExits = room
    ? room.exits
        .filter((e) => e.locked_msg !== undefined && !evalConditions(e.conditions, state))
        .map((e) => ({ direction: e.direction, message: e.locked_msg as string }))
        .sort((a, b) => a.direction.localeCompare(b.direction))
    : [];

  return {
    mode: "parser",
    room: state.current,
    title: endingDef ? endingDef.title : (room?.name ?? state.current),
    description: endingText ?? (room ? roomDescription(room, state) : ""),
    visible_objects: visObjs,
    npcs_present: npcs,
    exits,
    blocked_exits: blockedExits,
    inventory: [...state.inventory].sort(),
    state: {
      flags: Object.keys(state.flags)
        .filter((f) => state.flags[f] === true && !f.startsWith("__"))
        .sort(),
      vars: visible(state.vars, () => true),
      journal: [...state.journal],
    },
    dialogue: active ? { npc: active.npc.id, npc_text: nodeText(active.node, state) } : null,
    available_actions: enumerateActions(index, state).map((o) => ({
      id: o.id,
      command: o.command,
      action: o.action,
      ...(o.skill_check ? { skill_check: o.skill_check } : {}),
    })),
    score,
    max_score: maxScore,
    ended: state.ended,
    ending_id: state.endingId,
    ending: endingDef
      ? {
          id: endingDef.id,
          title: endingDef.title,
          // The reactive epilogue the player saw (the resolved variant, else base text),
          // pure of the score tally — that closure rides `description` only.
          text: resolvedEnding ?? endingDef.text,
          death: endingDef.death,
        }
      : null,
  };
}
