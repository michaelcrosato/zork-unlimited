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

function collectFlagTargets(node: unknown, acc: Set<string>): Set<string> {
  if (Array.isArray(node)) {
    for (const el of node) collectFlagTargets(el, acc);
  } else if (node !== null && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if ((k === "set_flag" || k === "clear_flag") && typeof v === "string") {
        acc.add(v);
      } else if (k === "unlock_exit" && v !== null && typeof v === "object") {
        const edge = v as Record<string, unknown>;
        if (typeof edge.from === "string" && typeof edge.to === "string") {
          acc.add(exitFlag(edge.from, edge.to));
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
  const flags = collectFlagTargets(index.pack, new Set(index.pack.meta.flags_init));
  const vars = collectVarTargets(index.pack, new Set(Object.keys(index.pack.meta.vars_init)));
  const dialogueVars = new Map<string, { room: string; maxOrdinal: number }>();
  const enemyHpVars = new Map<string, number>();
  for (const id of objects) items.add(id);
  for (const npc of index.pack.npcs) {
    const key = dlgVar(npc.id);
    vars.add(key);
    dialogueVars.set(key, { room: npc.room, maxOrdinal: npc.dialogue.nodes.length });
  }
  for (const enemy of index.pack.enemies) {
    if (enemy.defeat_flag !== undefined) flags.add(enemy.defeat_flag);
    const key = enemyHpVar(enemy.id);
    vars.add(key);
    enemyHpVars.set(key, enemy.hp);
  }
  if (!locations.has(state.current)) {
    throw new SaveIntegrityError(`Save references unknown room "${state.current}".`);
  }
  for (const id of Object.keys(state.visited)) {
    if (!locations.has(id)) {
      throw new SaveIntegrityError(`Save references unknown visited room "${id}".`);
    }
  }
  if (state.endingId !== null && !endings.has(state.endingId)) {
    throw new SaveIntegrityError(`Save references unknown ending "${state.endingId}".`);
  }
  for (const id of Object.keys(state.flags)) {
    if (!flags.has(id)) {
      throw new SaveIntegrityError(`Save references unknown flag "${id}".`);
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
  for (const id of state.inventory) {
    if (!items.has(id)) {
      throw new SaveIntegrityError(`Save references unknown item "${id}".`);
    }
  }
  for (const [id, runtime] of Object.entries(state.objectState)) {
    if (!objects.has(id)) {
      throw new SaveIntegrityError(`Save references unknown object "${id}".`);
    }
    if (runtime.room !== undefined && !locations.has(runtime.room)) {
      throw new SaveIntegrityError(
        `Save references unknown object room "${runtime.room}" for "${id}".`,
      );
    }
    for (const childId of runtime.contents ?? []) {
      if (!objects.has(childId)) {
        throw new SaveIntegrityError(
          `Save references unknown contained object "${childId}" for "${id}".`,
        );
      }
    }
  }
  for (const [quest, stage] of Object.entries(state.questStage)) {
    if (questStages.get(quest)?.has(stage) !== true) {
      throw new SaveIntegrityError(`Save references unknown quest stage "${quest}:${stage}".`);
    }
  }
}
