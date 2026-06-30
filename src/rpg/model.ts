/**
 * RPG world model helpers.
 *
 * These are the pure index, location, reactive-text, dialogue, and fresh-state
 * helpers used by the RPG runner. They intentionally live under `src/rpg` so the
 * RPG runtime no longer depends on the legacy parser model module for its core
 * world state layout.
 */
import { applyEffects } from "../core/effects.js";
import {
  activeDialogue as coreActiveDialogue,
  dlgVar,
  nodeByOrdinal,
  nodeOrdinal,
} from "../core/dialogue_state.js";
import {
  indexObjectHomes,
  isLocked as coreIsLocked,
  isOpen,
  locateObject,
  visibleObjectIds as coreVisibleObjectIds,
  type ObjectLocation,
} from "../core/object_locations.js";
import { reactiveName, reactiveText } from "../core/reactive_text.js";
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
  const { homeRoom, containerOf } = indexObjectHomes(pack.rooms, pack.objects);
  return { pack, rooms, objects, npcs, npcByRoom, homeRoom, containerOf };
}

export type Location = ObjectLocation;

export { isOpen, locateObject };

export function roomDescription(room: Room, state: GameState): string {
  return reactiveText(room.description, room.variants, state);
}

export function objectDescription(object: GameObject, state: GameState): string {
  return reactiveText(object.description, object.variants, state);
}

export function objectName(object: GameObject, state: GameState): string {
  return reactiveName(object.name, object.variants, state);
}

export function nodeText(node: DialogueNode, state: GameState): string {
  return reactiveText(node.npc_text, node.variants, state);
}

export function endingText(ending: Ending, state: GameState): string {
  return reactiveText(ending.text, ending.variants, state);
}

export function isLocked(index: RpgModelIndex, state: GameState, id: string): boolean {
  return coreIsLocked(index, state, id);
}

export function visibleObjectIds(index: RpgModelIndex, state: GameState, room: string): string[] {
  return coreVisibleObjectIds(index, state, room);
}

export { dlgVar, nodeByOrdinal, nodeOrdinal };

export function activeDialogue(
  index: RpgModelIndex,
  state: GameState,
): { npc: Npc; node: DialogueNode } | null {
  return coreActiveDialogue(index, state);
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
