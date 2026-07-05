import type { GameState } from "../core/state.js";
import { dlgVar } from "../core/dialogue_state.js";
import { exitFlag } from "../core/effects.js";
import { SaveIntegrityError } from "../persist/save_load.js";
import type { RpgIndex } from "./runner.js";
import { enemyHpVar } from "./schema.js";

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

function addQuestStageTarget(acc: Map<string, Set<string>>, quest: string, stage: string): void {
  const stages = acc.get(quest) ?? new Set<string>();
  stages.add(stage);
  acc.set(quest, stages);
}

/**
 * Collect quest stages that can legitimately appear in runtime state through
 * authored effects. Fresh state starts with an empty questStage map, so any
 * persisted entry must correspond to a set_quest_stage effect in the active pack.
 */
function collectQuestStageTargets(
  node: unknown,
  acc: Map<string, Set<string>>,
): Map<string, Set<string>> {
  if (Array.isArray(node)) {
    for (const el of node) collectQuestStageTargets(el, acc);
  } else if (node !== null && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === "set_quest_stage" && v !== null && typeof v === "object") {
        const stageRef = v as Record<string, unknown>;
        if (typeof stageRef.quest === "string" && typeof stageRef.stage === "string") {
          addQuestStageTarget(acc, stageRef.quest, stageRef.stage);
        }
      }
      collectQuestStageTargets(v, acc);
    }
  }
  return acc;
}

type BooleanRuntimeTargets = Map<string, Set<boolean>>;

function addBooleanRuntimeTarget(acc: BooleanRuntimeTargets, id: string, value: boolean): void {
  const values = acc.get(id) ?? new Set<boolean>();
  values.add(value);
  acc.set(id, values);
}

function collectFlagTargets(node: unknown, acc: BooleanRuntimeTargets): BooleanRuntimeTargets {
  if (Array.isArray(node)) {
    for (const el of node) collectFlagTargets(el, acc);
  } else if (node !== null && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === "set_flag" && typeof v === "string") {
        addBooleanRuntimeTarget(acc, v, true);
      } else if (k === "clear_flag" && typeof v === "string") {
        addBooleanRuntimeTarget(acc, v, false);
      } else if (k === "unlock_exit" && v !== null && typeof v === "object") {
        const edge = v as Record<string, unknown>;
        if (typeof edge.from === "string" && typeof edge.to === "string") {
          addBooleanRuntimeTarget(acc, exitFlag(edge.from, edge.to), true);
        }
      }
      collectFlagTargets(v, acc);
    }
  }
  return acc;
}

function collectVarTargets(node: unknown, acc: Set<string>): Set<string> {
  if (Array.isArray(node)) {
    for (const el of node) collectVarTargets(el, acc);
  } else if (node !== null && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (
        (k === "set_var" || k === "inc_var" || k === "dec_var") &&
        v !== null &&
        typeof v === "object"
      ) {
        const ref = v as Record<string, unknown>;
        if (typeof ref.name === "string") acc.add(ref.name);
      }
      collectVarTargets(v, acc);
    }
  }
  return acc;
}

type ObjectRuntimeTargets = {
  open: Set<string>;
  locked: Map<string, Set<boolean>>;
};

function addLockedRuntimeTarget(
  acc: ObjectRuntimeTargets["locked"],
  id: string,
  value: boolean,
): void {
  const values = acc.get(id) ?? new Set<boolean>();
  values.add(value);
  acc.set(id, values);
}

function collectObjectRuntimeTargets(
  node: unknown,
  acc: ObjectRuntimeTargets,
): ObjectRuntimeTargets {
  if (Array.isArray(node)) {
    for (const el of node) collectObjectRuntimeTargets(el, acc);
  } else if (node !== null && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === "open_object" && typeof v === "string") {
        acc.open.add(v);
      } else if (k === "set_object_locked" && v !== null && typeof v === "object") {
        const ref = v as Record<string, unknown>;
        if (typeof ref.id === "string" && typeof ref.locked === "boolean") {
          addLockedRuntimeTarget(acc.locked, ref.id, ref.locked);
        }
      }
      collectObjectRuntimeTargets(v, acc);
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
  const objects = new Set<string>(index.objects.keys());
  const questStages = collectQuestStageTargets(index.pack, new Map<string, Set<string>>());
  const flags = collectFlagTargets(index.pack, new Map<string, Set<boolean>>());
  const vars = collectVarTargets(index.pack, new Set(Object.keys(index.pack.meta.vars_init)));
  const objectRuntimeTargets = collectObjectRuntimeTargets(index.pack, {
    open: new Set<string>(),
    locked: new Map<string, Set<boolean>>(),
  });
  const dialogueVars = new Map<string, { room: string; maxOrdinal: number }>();
  const enemyHpVars = new Map<string, number>();
  for (const id of index.pack.meta.flags_init) addBooleanRuntimeTarget(flags, id, true);
  for (const id of objects) items.add(id);
  // Built-in OPEN/UNLOCK actions write sparse runtime state; static defaults do not.
  for (const object of index.pack.objects) {
    if (object.openable) objectRuntimeTargets.open.add(object.id);
    if (object.locked && object.key_id !== undefined) {
      addLockedRuntimeTarget(objectRuntimeTargets.locked, object.id, false);
    }
  }
  for (const npc of index.pack.npcs) {
    const key = dlgVar(npc.id);
    vars.add(key);
    dialogueVars.set(key, { room: npc.room, maxOrdinal: npc.dialogue.nodes.length });
  }
  for (const enemy of index.pack.enemies) {
    if (enemy.defeat_flag !== undefined) addBooleanRuntimeTarget(flags, enemy.defeat_flag, true);
    const key = enemyHpVar(enemy.id);
    vars.add(key);
    enemyHpVars.set(key, enemy.hp);
  }
  if (!locations.has(state.current)) {
    throw new SaveIntegrityError(`Save references unknown room "${state.current}".`);
  }
  for (const [id, value] of Object.entries(state.visited)) {
    if (!locations.has(id)) {
      throw new SaveIntegrityError(`Save references unknown visited room "${id}".`);
    }
    if (value !== true) {
      throw new SaveIntegrityError(`Save references invalid visited state "${id}" (${value}).`);
    }
  }
  if (state.visited[state.current] !== true) {
    throw new SaveIntegrityError(`Save current room "${state.current}" is not marked visited.`);
  }
  if (state.endingId !== null && !endings.has(state.endingId)) {
    throw new SaveIntegrityError(`Save references unknown ending "${state.endingId}".`);
  }
  for (const id of index.pack.meta.flags_init) {
    if (state.flags[id] === undefined) {
      throw new SaveIntegrityError(`Save is missing initialized flag "${id}".`);
    }
  }
  for (const [id, value] of Object.entries(state.flags)) {
    const values = flags.get(id);
    if (values === undefined) {
      throw new SaveIntegrityError(`Save references unknown flag "${id}".`);
    }
    if (!values.has(value)) {
      throw new SaveIntegrityError(`Save references invalid flag state "${id}" (${value}).`);
    }
  }
  for (const [id, value] of Object.entries(state.vars)) {
    if (!vars.has(id)) {
      throw new SaveIntegrityError(`Save references unknown var "${id}".`);
    }
    const dialogue = dialogueVars.get(id);
    if (
      dialogue !== undefined &&
      (!Number.isInteger(value) || value < 0 || value > dialogue.maxOrdinal)
    ) {
      throw new SaveIntegrityError(`Save references invalid dialogue var "${id}" (${value}).`);
    }
    if (dialogue !== undefined && value > 0 && state.current !== dialogue.room) {
      throw new SaveIntegrityError(
        `Save references active dialogue "${id}" outside NPC room "${dialogue.room}".`,
      );
    }
    const enemyMaxHp = enemyHpVars.get(id);
    if (enemyMaxHp !== undefined && (!Number.isInteger(value) || value < 0 || value > enemyMaxHp)) {
      throw new SaveIntegrityError(`Save references invalid enemy hp var "${id}" (${value}).`);
    }
  }
  const inventory = new Set<string>();
  for (const id of state.inventory) {
    if (!items.has(id)) {
      throw new SaveIntegrityError(`Save references unknown item "${id}".`);
    }
    if (inventory.has(id)) {
      throw new SaveIntegrityError(`Save references duplicate inventory item "${id}".`);
    }
    inventory.add(id);
  }
  for (const [id, runtime] of Object.entries(state.objectState)) {
    if (!objects.has(id)) {
      throw new SaveIntegrityError(`Save references unknown object "${id}".`);
    }
    if (runtime.open !== undefined) {
      if (runtime.open !== true || !objectRuntimeTargets.open.has(id)) {
        throw new SaveIntegrityError(`Save references invalid object open state for "${id}".`);
      }
    }
    if (runtime.locked !== undefined) {
      if (objectRuntimeTargets.locked.get(id)?.has(runtime.locked) !== true) {
        throw new SaveIntegrityError(`Save references invalid object lock state for "${id}".`);
      }
    }
    if (runtime.room !== undefined && !locations.has(runtime.room)) {
      throw new SaveIntegrityError(
        `Save references unknown object room "${runtime.room}" for "${id}".`,
      );
    }
    if (runtime.takenBy !== undefined && runtime.room === undefined) {
      throw new SaveIntegrityError(`Save references object takenBy without room for "${id}".`);
    }
    for (const childId of runtime.contents ?? []) {
      if (!objects.has(childId)) {
        throw new SaveIntegrityError(
          `Save references unknown contained object "${childId}" for "${id}".`,
        );
      }
    }
    if (runtime.contents !== undefined) {
      throw new SaveIntegrityError(`Save references invalid object contents state for "${id}".`);
    }
  }
  for (const [quest, stage] of Object.entries(state.questStage)) {
    if (questStages.get(quest)?.has(stage) !== true) {
      throw new SaveIntegrityError(`Save references unknown quest stage "${quest}:${stage}".`);
    }
  }
}
