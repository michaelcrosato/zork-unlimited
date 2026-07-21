/**
 * RPG world model helpers.
 *
 * These are the pure index, location, reactive-text, dialogue, and fresh-state
 * helpers used by the RPG runner. They intentionally live under `src/rpg` so the
 * RPG runtime no longer depends on the legacy parser model module for its core
 * world state layout.
 */
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
import { evalConditions } from "../core/conditions.js";
import { reactiveName, reactiveText } from "../core/reactive_text.js";
import type { GameState } from "../core/state.js";
import type { DialogueNode, Ending, GameObject, Npc, Room, RpgPack } from "./schema.js";
import { initRuntimeState } from "./state_init.js";
import type { CampaignCharacterImportInput } from "./campaign_character_import.js";

export type RpgModelIndex = {
  pack: RpgPack;
  rooms: Map<string, Room>;
  objects: Map<string, GameObject>;
  npcs: Map<string, Npc>;
  npcByRoom: Map<string, Npc[]>;
  homeRoom: Map<string, string>;
  containerOf: Map<string, string>;
  objectsWithUseInteractions: GameObject[];
  /** Target-only USE hubs whose authored rows each have a distinct natural verb. */
  verbIdentifiedTargetOnlyUseTargets: ReadonlySet<string>;
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
  const objectsWithUseInteractions = pack.objects.filter((o) =>
    o.interactions.some((it) => it.verb === "USE" && it.target !== undefined),
  );
  const targetOnlyUseVerbs = new Map<string, (string | undefined)[]>();
  const selfUseTargets = new Set<string>();
  for (const object of objectsWithUseInteractions) {
    for (const interaction of object.interactions) {
      if (
        interaction.verb === "USE" &&
        interaction.item !== undefined &&
        interaction.item === interaction.target
      ) {
        selfUseTargets.add(interaction.target);
      }
      if (
        interaction.verb !== "USE" ||
        interaction.item !== undefined ||
        interaction.target === undefined
      ) {
        continue;
      }
      const verbs = targetOnlyUseVerbs.get(interaction.target) ?? [];
      verbs.push(interaction.command_verb);
      targetOnlyUseVerbs.set(interaction.target, verbs);
    }
  }
  const verbIdentifiedTargetOnlyUseTargets = new Set<string>();
  for (const [target, verbs] of targetOnlyUseVerbs) {
    const authoredVerbs = verbs.filter((verb): verb is string => verb !== undefined);
    if (
      verbs.length > 1 &&
      authoredVerbs.length === verbs.length &&
      new Set(authoredVerbs).size === verbs.length &&
      !selfUseTargets.has(target)
    ) {
      verbIdentifiedTargetOnlyUseTargets.add(target);
    }
  }
  return {
    pack,
    rooms,
    objects,
    npcs,
    npcByRoom,
    homeRoom,
    containerOf,
    objectsWithUseInteractions,
    verbIdentifiedTargetOnlyUseTargets,
  };
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
  const worldVisible = (id: string, ancestors: ReadonlySet<string> = new Set()): boolean => {
    if (ancestors.has(id)) return false;
    const object = index.objects.get(id);
    if (!object || !evalConditions(object.visible_when ?? [], state)) return false;

    // Runtime placement wins over static containment. A moved object is no longer
    // inside its authored container, while a currently-contained object inherits
    // every containing object's world-visibility gate. Inventory is handled by
    // callers before this world-only helper and deliberately bypasses these gates.
    const location = locateObject(index, state, id);
    if (location.kind !== "container") return true;
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(id);
    return worldVisible(location.container, nextAncestors);
  };

  return coreVisibleObjectIds(index, state, room).filter((id) => worldVisible(id));
}

export { dlgVar, nodeByOrdinal, nodeOrdinal };

export function activeDialogue(
  index: RpgModelIndex,
  state: GameState,
): { npc: Npc; node: DialogueNode } | null {
  return coreActiveDialogue(index, state);
}

export function initStateForRpgModel(
  index: RpgModelIndex,
  seed: number,
  campaignImport?: CampaignCharacterImportInput,
): GameState {
  const meta = index.pack.meta;
  const startRoom = index.rooms.get(meta.start_room);
  return initRuntimeState({
    seed,
    start: meta.start_room,
    varsInit: meta.vars_init,
    flagsInit: meta.flags_init,
    heldItems: index.pack.objects.filter((o) => o.held).map((o) => o.id),
    onEnter: startRoom?.on_enter,
    ...(campaignImport !== undefined
      ? { campaignImport: { pack: index.pack, ...campaignImport } }
      : {}),
  });
}
