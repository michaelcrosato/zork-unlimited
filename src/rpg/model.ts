/**
 * RPG world model helpers.
 *
 * These are the pure index, location, reactive-text, dialogue, and fresh-state
 * helpers used by the RPG runner. They intentionally live under `src/rpg` so the
 * RPG runtime no longer depends on the legacy parser model module for its core
 * world state layout.
 */
import { evalConditions } from "../core/conditions.js";
import { applyEffects } from "../core/effects.js";
import { initState, type GameState } from "../core/state.js";
import type { DialogueNode, Ending, GameObject, Npc, Room, RpgPack } from "./schema.js";

export type RpgModelIndex = {
  pack: RpgPack;
  rooms: Map<string, Room>;
  objects: Map<string, GameObject>;
  npcs: Map<string, Npc>;
  npcByRoom: Map<string, Npc[]>;
  homeRoom: Map<string, string>;
  containerOf: Map<string, string>;
};

export function indexRpgModel(pack: RpgPack): RpgModelIndex {
  const rooms = new Map(pack.rooms.map((r) => [r.id, r]));
  const objects = new Map(pack.objects.map((o) => [o.id, o]));
  const npcs = new Map(pack.npcs.map((n) => [n.id, n]));
  const npcByRoom = new Map<string, Npc[]>();
  for (const n of pack.npcs) {
    const list = npcByRoom.get(n.room) ?? [];
    list.push(n);
    npcByRoom.set(n.room, list);
  }
  const homeRoom = new Map<string, string>();
  for (const r of pack.rooms) for (const oid of r.objects) homeRoom.set(oid, r.id);
  const containerOf = new Map<string, string>();
  for (const o of pack.objects) for (const cid of o.contents) containerOf.set(cid, o.id);
  return { pack, rooms, objects, npcs, npcByRoom, homeRoom, containerOf };
}

export type Location =
  | { kind: "inventory" }
  | { kind: "room"; room: string }
  | { kind: "container"; container: string }
  | { kind: "nowhere" };

export function locateObject(index: RpgModelIndex, state: GameState, id: string): Location {
  if (state.inventory.includes(id)) return { kind: "inventory" };
  const moved = state.objectState[id]?.room;
  if (moved) return { kind: "room", room: moved };
  const home = index.homeRoom.get(id);
  if (home) return { kind: "room", room: home };
  const container = index.containerOf.get(id);
  if (container) return { kind: "container", container };
  return { kind: "nowhere" };
}

export function isOpen(state: GameState, id: string): boolean {
  return state.objectState[id]?.open === true;
}

export function roomDescription(room: Room, state: GameState): string {
  for (const v of room.variants ?? []) {
    if (evalConditions(v.when, state)) return v.text;
  }
  return room.description;
}

export function objectDescription(object: GameObject, state: GameState): string {
  for (const v of object.variants ?? []) {
    if (evalConditions(v.when, state)) return v.text;
  }
  return object.description;
}

export function objectName(object: GameObject, state: GameState): string {
  for (const v of object.variants ?? []) {
    if (v.name !== undefined && evalConditions(v.when, state)) return v.name;
  }
  return object.name;
}

export function nodeText(node: DialogueNode, state: GameState): string {
  for (const v of node.variants ?? []) {
    if (evalConditions(v.when, state)) return v.text;
  }
  return node.npc_text;
}

export function endingText(ending: Ending, state: GameState): string {
  for (const v of ending.variants ?? []) {
    if (evalConditions(v.when, state)) return v.text;
  }
  return ending.text;
}

export function isLocked(index: RpgModelIndex, state: GameState, id: string): boolean {
  const runtimeLocked = state.objectState[id]?.locked;
  if (runtimeLocked !== undefined) return runtimeLocked;
  return index.objects.get(id)?.locked ?? false;
}

export function visibleObjectIds(index: RpgModelIndex, state: GameState, room: string): string[] {
  const out: string[] = [];
  for (const id of index.objects.keys()) {
    const loc = locateObject(index, state, id);
    if (loc.kind === "room" && loc.room === room) {
      out.push(id);
    } else if (loc.kind === "container") {
      const containerLoc = locateObject(index, state, loc.container);
      if (
        containerLoc.kind === "room" &&
        containerLoc.room === room &&
        isOpen(state, loc.container)
      ) {
        out.push(id);
      }
    }
  }
  return out.sort();
}

export function dlgVar(npcId: string): string {
  return `__dlg_${npcId}`;
}

export function nodeOrdinal(npc: Npc, nodeId: string): number {
  const index = npc.dialogue.nodes.findIndex((n) => n.id === nodeId);
  return index < 0 ? 0 : index + 1;
}

export function nodeByOrdinal(npc: Npc, ordinal: number): DialogueNode | undefined {
  return npc.dialogue.nodes[ordinal - 1];
}

export function activeDialogue(
  index: RpgModelIndex,
  state: GameState,
): { npc: Npc; node: DialogueNode } | null {
  for (const npc of index.npcs.values()) {
    const ordinal = state.vars[dlgVar(npc.id)] ?? 0;
    if (ordinal > 0) {
      const node = nodeByOrdinal(npc, ordinal);
      if (node) return { npc, node };
    }
  }
  return null;
}

export function initStateForRpgModel(index: RpgModelIndex, seed: number): GameState {
  const meta = index.pack.meta;
  const seeded = initState({
    seed,
    start: meta.start_room,
    varsInit: meta.vars_init,
    flagsInit: meta.flags_init,
  });
  const heldIds = index.pack.objects.filter((o) => o.held).map((o) => o.id);
  const base = heldIds.length
    ? { ...seeded, inventory: [...seeded.inventory, ...heldIds] }
    : seeded;
  const startRoom = index.rooms.get(meta.start_room);
  if (!startRoom || startRoom.on_enter.length === 0) return base;
  return applyEffects(startRoom.on_enter, base).state;
}
