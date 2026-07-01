import type { GameState } from "../core/state.js";
import { SaveIntegrityError } from "../persist/save_load.js";
import type { RpgIndex } from "./runner.js";

/**
 * Collect item ids that can legitimately enter inventory through authored effects.
 * This is intentionally structural: add_item can live under room effects,
 * interactions, skill-check branches, dialogue topics, or future RPG effect sites.
 */
function collectAddItemTargets(node: unknown, acc: Set<string>): Set<string> {
  if (Array.isArray(node)) {
    for (const el of node) collectAddItemTargets(el, acc);
  } else if (node !== null && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === "add_item" && typeof v === "string") acc.add(v);
      collectAddItemTargets(v, acc);
    }
  }
  return acc;
}

/**
 * Pack-aware referential-integrity gate for loaded RPG state. The generic save
 * schema can prove shape/finiteness, but only the RPG index can prove that
 * rendered symbols such as current room, ending id, and inventory item ids exist
 * in the pack the state is about to run against.
 */
export function assertRpgStateReferences(index: RpgIndex, state: GameState): void {
  const items = collectAddItemTargets(index.pack, new Set<string>());
  const locations = new Set<string>(index.rooms.keys());
  const endings = new Set<string>(index.pack.endings.map((e) => e.id));
  for (const id of index.objects.keys()) items.add(id);
  if (!locations.has(state.current)) {
    throw new SaveIntegrityError(`Save references unknown room "${state.current}".`);
  }
  if (state.endingId !== null && !endings.has(state.endingId)) {
    throw new SaveIntegrityError(`Save references unknown ending "${state.endingId}".`);
  }
  for (const id of state.inventory) {
    if (!items.has(id)) {
      throw new SaveIntegrityError(`Save references unknown item "${id}".`);
    }
  }
}
