/**
 * Legal-action generator + resolver (spec §9, §9.2) — the Jericho idea applied
 * to a parser game: compute every currently-valid command and expose a stable
 * `id`, a human-style `command`, and the structured `Action`. The same function
 * that lists an action (`resolveParserAction`) is what the engine calls to
 * resolve it, so the legal set never contains an action `step` would then reject
 * as *illegal* (legal ⊇ executable, §14). Conditions may still be re-checked by
 * the engine; the generator only lists condition-satisfied actions.
 */
import { evalConditions, type Condition } from "../core/conditions.js";
import type { Effect } from "../core/effects.js";
import type { Action } from "../api/types.js";
import type { Resolution } from "../core/engine.js";
import type { GameState } from "../core/state.js";
import type { Interaction } from "./schema.js";
import {
  type ParserIndex,
  activeDialogue,
  dlgVar,
  isLocked,
  isOpen,
  locateObject,
  nodeOrdinal,
  objectDescription,
  roomDescription,
  visibleObjectIds,
} from "./model.js";

export type ParserActionOption = { id: string; command: string; action: Action };

const objName = (index: ParserIndex, id: string): string => index.objects.get(id)?.name ?? id;

/** True if `id` is reachable for the player right now (held or visible in the room). */
function present(index: ParserIndex, state: GameState, id: string): boolean {
  if (state.inventory.includes(id)) return true;
  return visibleObjectIds(index, state, state.current).includes(id);
}

/** Find the USE interaction (if any) for using `item` on `target`. Exported so the
 *  RPG runner (Stage 4) can detect a skill-check interaction before resolving. */
export function useInteraction(index: ParserIndex, target: string, item: string): Interaction | undefined {
  return index.objects.get(target)?.interactions.find((it) => it.verb === "USE" && it.item === item && it.target === target);
}

function readInteractions(index: ParserIndex, target: string): Interaction[] {
  return (index.objects.get(target)?.interactions ?? []).filter((it) => it.verb === "READ");
}

/**
 * Resolve a structured action into conditions + effects for the engine, or null
 * if the action is structurally impossible in this state (wrong room, object not
 * present, etc.). Pure: same (index, state, action) ⇒ same resolution.
 */
export function resolveParserAction(index: ParserIndex, state: GameState, action: Action): Resolution | null {
  const here = state.current;
  switch (action.type) {
    case "LOOK": {
      if (action.target === undefined) {
        const room = index.rooms.get(here);
        return room ? { conditions: [], effects: [{ narrate: roomDescription(room, state) }] } : null;
      }
      if (!present(index, state, action.target)) return null;
      const o = index.objects.get(action.target);
      return o ? { conditions: [], effects: [{ narrate: objectDescription(o, state) }] } : null;
    }
    case "INVENTORY": {
      const items = state.inventory.length ? state.inventory.map((i) => objName(index, i)).join(", ") : "nothing";
      return { conditions: [], effects: [{ narrate: `You are carrying: ${items}.` }] };
    }
    case "READ": {
      if (!present(index, state, action.target)) return null;
      const o = index.objects.get(action.target);
      if (!o) return null;
      const reads = readInteractions(index, action.target);
      const effects: Effect[] = [];
      if (o.read_text) effects.push({ narrate: o.read_text });
      for (const it of reads) effects.push(...it.effects);
      if (effects.length === 0) return null; // nothing to read
      const conditions: Condition[] = reads.flatMap((it) => it.conditions);
      return { conditions, effects };
    }
    case "TAKE": {
      const o = index.objects.get(action.item);
      if (!o || !o.takeable || state.inventory.includes(action.item)) return null;
      if (!visibleObjectIds(index, state, here).includes(action.item)) return null;
      return { conditions: [], effects: [{ add_item: action.item }, { narrate: `You take the ${o.name}.` }] };
    }
    case "DROP": {
      if (!state.inventory.includes(action.item)) return null;
      const o = index.objects.get(action.item);
      if (!o) return null;
      return {
        conditions: [],
        effects: [{ remove_item: action.item }, { place_object: { id: action.item, room: here } }, { narrate: `You drop the ${o.name}.` }],
      };
    }
    case "OPEN": {
      const o = index.objects.get(action.target);
      if (!o || !o.openable || !present(index, state, action.target)) return null;
      if (isLocked(index, state, action.target) || isOpen(state, action.target)) return null;
      const reveal = o.contents.length ? ` Inside: ${o.contents.map((c) => objName(index, c)).join(", ")}.` : "";
      return { conditions: [], effects: [{ open_object: action.target }, { narrate: `You open the ${o.name}.${reveal}` }] };
    }
    case "UNLOCK": {
      const o = index.objects.get(action.target);
      if (!o || !present(index, state, action.target) || !isLocked(index, state, action.target)) return null;
      if (o.key_id === undefined || action.with !== o.key_id || !state.inventory.includes(o.key_id)) return null;
      return {
        conditions: [{ has_item: o.key_id }],
        effects: [{ set_object_locked: { id: action.target, locked: false } }, { narrate: `You unlock the ${o.name}.` }],
      };
    }
    case "USE": {
      const it = useInteraction(index, action.target, action.item);
      if (!it || !state.inventory.includes(action.item) || !present(index, state, action.target)) return null;
      return { conditions: [{ has_item: action.item }, ...it.conditions], effects: it.effects };
    }
    case "MOVE": {
      const room = index.rooms.get(here);
      const exit = room?.exits.find((e) => e.direction === action.direction);
      if (!exit) return null;
      return { conditions: exit.conditions, effects: [{ goto: exit.to }] };
    }
    case "TALK": {
      const npc = index.npcs.get(action.npc);
      if (!npc || npc.room !== here || activeDialogue(index, state)) return null;
      const ord = nodeOrdinal(npc, npc.dialogue.root);
      const root = npc.dialogue.nodes[ord - 1];
      if (!root) return null;
      return {
        conditions: [],
        effects: [{ set_var: { name: dlgVar(npc.id), value: ord } }, ...root.effects, { narrate: `${npc.name}: "${root.npc_text}"` }],
      };
    }
    case "ASK": {
      const active = activeDialogue(index, state);
      if (!active || active.npc.id !== action.npc) return null;
      const topic = active.node.topics.find((t) => t.id === action.topic);
      if (!topic) return null;
      // A gated topic is filtered from the legal set (via `option`) and re-checked
      // here by the engine, so a told-once info topic can retire itself.
      const conditions = topic.conditions ?? [];
      if (topic.end || topic.goto === undefined) {
        return { conditions, effects: [{ set_var: { name: dlgVar(active.npc.id), value: 0 } }, { narrate: `(You end the conversation.)` }] };
      }
      const targetOrd = nodeOrdinal(active.npc, topic.goto);
      const target = active.npc.dialogue.nodes[targetOrd - 1];
      if (!target) return null;
      return {
        conditions,
        effects: [{ set_var: { name: dlgVar(active.npc.id), value: targetOrd } }, ...target.effects, { narrate: `${active.npc.name}: "${target.npc_text}"` }],
      };
    }
    default:
      return null;
  }
}

function option(index: ParserIndex, state: GameState, id: string, command: string, action: Action): ParserActionOption | null {
  const res = resolveParserAction(index, state, action);
  if (!res || !evalConditions(res.conditions, state)) return null;
  return { id, command, action };
}

/**
 * Enumerate every legal action for the current state. Dialogue is modal: while
 * the player is mid-conversation, only the current node's topics are offered
 * (the tree must terminate, so an end-topic always exits — §10.2).
 */
export function enumerateActions(index: ParserIndex, state: GameState): ParserActionOption[] {
  if (state.ended) return [];
  const out: ParserActionOption[] = [];
  const push = (o: ParserActionOption | null): void => {
    if (o) out.push(o);
  };

  const active = activeDialogue(index, state);
  if (active) {
    for (const t of active.node.topics) {
      push(option(index, state, `ask_${t.id}`, `ask: ${t.prompt}`, { type: "ASK", npc: active.npc.id, topic: t.id }));
    }
    return out;
  }

  const here = state.current;
  const room = index.rooms.get(here);
  if (!room) return out;

  // Movement (sorted by direction for determinism).
  for (const exit of [...room.exits].sort((a, b) => a.direction.localeCompare(b.direction))) {
    push(option(index, state, `go_${exit.direction}`, `go ${exit.direction}`, { type: "MOVE", direction: exit.direction }));
  }

  // Objects visible in the room.
  for (const oid of visibleObjectIds(index, state, here)) {
    const o = index.objects.get(oid);
    if (!o) continue;
    push(option(index, state, `examine_${oid}`, `look at ${o.name}`, { type: "LOOK", target: oid }));
    push(option(index, state, `read_${oid}`, `read ${o.name}`, { type: "READ", target: oid }));
    push(option(index, state, `take_${oid}`, `take ${o.name}`, { type: "TAKE", item: oid }));
    push(option(index, state, `open_${oid}`, `open ${o.name}`, { type: "OPEN", target: oid }));
    if (o.key_id !== undefined) {
      push(option(index, state, `unlock_${oid}`, `unlock ${o.name} with ${objName(index, o.key_id)}`, { type: "UNLOCK", target: oid, with: o.key_id }));
    }
  }

  // Held objects: examine, read, drop, and any USE interaction whose target is present.
  for (const item of [...state.inventory].sort()) {
    const o = index.objects.get(item);
    if (!o) continue;
    push(option(index, state, `examine_${item}`, `look at ${o.name}`, { type: "LOOK", target: item }));
    push(option(index, state, `read_${item}`, `read ${o.name}`, { type: "READ", target: item }));
    push(option(index, state, `drop_${item}`, `drop ${o.name}`, { type: "DROP", item }));
  }

  // USE interactions across the pack whose item is held and target is present.
  // A self-targeted USE (item === target) is the "consume this thing" pattern —
  // drink the phial, eat the bread — and reads as `use <obj>`, not the nonsensical
  // `use <obj> on <obj>`.
  for (const o of index.pack.objects) {
    for (const it of o.interactions) {
      if (it.verb !== "USE" || it.item === undefined || it.target === undefined) continue;
      const selfUse = it.item === it.target;
      const id = selfUse ? `use_${it.item}` : `use_${it.item}_on_${it.target}`;
      const command = selfUse
        ? `use ${objName(index, it.item)}`
        : `use ${objName(index, it.item)} on ${objName(index, it.target)}`;
      push(option(index, state, id, command, { type: "USE", item: it.item, target: it.target }));
    }
  }

  // NPCs present.
  for (const npc of index.npcByRoom.get(here) ?? []) {
    push(option(index, state, `talk_${npc.id}`, `talk to ${npc.name}`, { type: "TALK", npc: npc.id }));
  }

  // Always-available informational actions.
  push(option(index, state, "look_around", "look", { type: "LOOK" }));
  push(option(index, state, "inventory", "inventory", { type: "INVENTORY" }));
  return out;
}
