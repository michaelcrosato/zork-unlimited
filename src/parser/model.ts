/**
 * Parser world model (spec §7.3, §8.4) — the shared, pure helpers the runner,
 * legal-action generator, observation builder, and validator all read from.
 *
 * Object location is a precedence rule, not a stored field:
 *   held (in inventory)  >  dropped/moved (objectState[id].room)  >  static home
 * An object's static home is either a room (room.objects) or a container
 * (object.contents). Container contents are only visible once the container is
 * open. Dialogue state is carried in a numeric var per NPC (0 = not talking,
 * otherwise the 1-based ordinal of the current node) so it flows through the
 * existing pure effect/condition DSLs — no engine change (§16).
 */
import { initState, type GameState } from "../core/state.js";
import { applyEffects } from "../core/effects.js";
import {
  indexObjectHomes,
  isLocked as coreIsLocked,
  isOpen,
  locateObject,
  visibleObjectIds as coreVisibleObjectIds,
  type ObjectLocation,
} from "../core/object_locations.js";
import { reactiveName, reactiveText } from "../core/reactive_text.js";
import type { ParserPack, Room, GameObject, Npc, DialogueNode, ParserEnding } from "./schema.js";

export type ParserIndex = {
  pack: ParserPack;
  rooms: Map<string, Room>;
  objects: Map<string, GameObject>;
  npcs: Map<string, Npc>;
  npcByRoom: Map<string, Npc[]>;
  /** Static home room for an object id (room.objects), if any. */
  homeRoom: Map<string, string>;
  /** Container id that statically holds an object id (object.contents), if any. */
  containerOf: Map<string, string>;
};

export function indexParserPack(pack: ParserPack): ParserIndex {
  const rooms = new Map(pack.rooms.map((r) => [r.id, r]));
  const objects = new Map(pack.objects.map((o) => [o.id, o]));
  const npcs = new Map(pack.npcs.map((n) => [n.id, n]));
  const npcByRoom = new Map<string, Npc[]>();
  for (const n of pack.npcs) {
    const list = npcByRoom.get(n.room) ?? [];
    list.push(n);
    npcByRoom.set(n.room, list);
  }
  const { homeRoom, containerOf } = indexObjectHomes(pack.rooms, pack.objects);
  return { pack, rooms, objects, npcs, npcByRoom, homeRoom, containerOf };
}

export type Location = ObjectLocation;

export { isOpen, locateObject };

/** The room's effective description in the current state: the first reactive
 *  `variant` whose `when` conditions all hold (declared order), else the base
 *  `description`. Lets a room narrate state it changed — a tied rope, an opened
 *  gate — instead of contradicting it (§7.3). Pure; same (room, state) ⇒ same
 *  text, so both the observation and the LOOK action read identically. */
export function roomDescription(room: Room, state: GameState): string {
  return reactiveText(room.description, room.variants, state);
}

/** The object's effective examine description in the current state: the first
 *  reactive `variant` whose `when` conditions all hold (declared order), else the
 *  base `description`. The object analogue of `roomDescription` — lets a thing
 *  narrate state it changed (an opened box, a levered-open grate) on examine
 *  instead of repeating its sealed-shut prose (§7.3). Pure; same (object, state)
 *  ⇒ same text. */
export function objectDescription(object: GameObject, state: GameState): string {
  return reactiveText(object.description, object.variants, state);
}

/** The object's effective display NAME in the current state: the first reactive
 *  `variant` whose `when` holds AND carries a `name` override wins, else the base
 *  `name` (bug_0188). The name analogue of `objectDescription` — lets a thing whose
 *  name encodes a transient state (a "toppled" cresset) re-label itself once it has
 *  changed, so `visible_objects` and the enumerated commands stop contradicting a
 *  room/examine that already moved on. A variant with no `name` is skipped for the
 *  name (its `text` still drives the description), so this is purely additive. Pure;
 *  same (object, state) ⇒ same name. */
export function objectName(object: GameObject, state: GameState): string {
  return reactiveName(object.name, object.variants, state);
}

/** The NPC node's effective spoken line in the current state: the first reactive
 *  `variant` whose `when` conditions all hold (declared order), else the base
 *  `npc_text`. The dialogue analogue of `roomDescription` / `objectDescription` —
 *  lets an NPC react to state it (or the player) changed, e.g. greet you with the
 *  whole emergency on first contact but a terse line when you come back to the menu,
 *  instead of re-delivering the opening every return. Pure; same (node, state) ⇒ same
 *  text, so the TALK/ASK narration and the observation's `dialogue.npc_text` read
 *  identically. */
export function nodeText(node: DialogueNode, state: GameState): string {
  return reactiveText(node.npc_text, node.variants, state);
}

/** The ending's effective epilogue in the current state: the first reactive
 *  `variant` whose `when` conditions all hold (declared order), else the base
 *  `text`. The terminal-state analogue of `roomDescription` / `objectDescription`
 *  — lets an ending two routes converge on acknowledge how the player reached it
 *  (the lore they learned, the relic they carried) instead of printing one epilogue
 *  that ignores the route just played (§7.3). Pure; same (ending, state) ⇒ same text,
 *  so the observation's rendered `description` and structured `ending.text` agree. */
export function endingText(ending: ParserEnding, state: GameState): string {
  return reactiveText(ending.text, ending.variants, state);
}

/** Is the container `id` locked? Falls back to the pack's static `locked` flag. */
export function isLocked(index: ParserIndex, state: GameState, id: string): boolean {
  return coreIsLocked(index, state, id);
}

/** Object ids visible in `room` right now: objects located in the room, plus the
 *  contents of any open container located in the room. Held objects are not
 *  "in the room" (they show in inventory). */
export function visibleObjectIds(index: ParserIndex, state: GameState, room: string): string[] {
  return coreVisibleObjectIds(index, state, room);
}

// ── Dialogue state (carried in vars, so it flows through the core DSLs) ────────

/** Var name holding the active dialogue node ordinal for an NPC (0 ⇒ not talking). */
export function dlgVar(npcId: string): string {
  return `__dlg_${npcId}`;
}

/** 1-based ordinal of a node within its NPC's node list (0 if not found). */
export function nodeOrdinal(npc: Npc, nodeId: string): number {
  const i = npc.dialogue.nodes.findIndex((n) => n.id === nodeId);
  return i < 0 ? 0 : i + 1;
}

export function nodeByOrdinal(npc: Npc, ord: number): DialogueNode | undefined {
  return npc.dialogue.nodes[ord - 1];
}

/** The NPC the player is currently in conversation with, and the active node. */
export function activeDialogue(
  index: ParserIndex,
  state: GameState,
): { npc: Npc; node: DialogueNode } | null {
  for (const npc of index.npcs.values()) {
    const ord = state.vars[dlgVar(npc.id)] ?? 0;
    if (ord > 0) {
      const node = nodeByOrdinal(npc, ord);
      if (node) return { npc, node };
    }
  }
  return null;
}

/** Fresh state for a parser pack, with the start room's on_enter applied (mirrors
 *  CYOA's initStateForPack). */
export function initStateForParserPack(index: ParserIndex, seed: number): GameState {
  const meta = index.pack.meta;
  const seeded = initState({
    seed,
    start: meta.start_room,
    varsInit: meta.vars_init,
    flagsInit: meta.flags_init,
  });
  // Held objects (worn/equipped/bound — schema `held: true`) are carried from the
  // very first turn and can never be dropped, so the player genuinely possesses
  // them on every reachable path. Listed in pack order for a deterministic state.
  const heldIds = index.pack.objects.filter((o) => o.held).map((o) => o.id);
  const base = heldIds.length
    ? { ...seeded, inventory: [...seeded.inventory, ...heldIds] }
    : seeded;
  const startRoom = index.rooms.get(meta.start_room);
  if (!startRoom || startRoom.on_enter.length === 0) return base;
  return applyEffects(startRoom.on_enter, base).state;
}
