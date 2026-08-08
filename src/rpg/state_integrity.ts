import type { GameState } from "../core/state.js";
import { dlgVar } from "../core/dialogue_state.js";
import { SaveIntegrityError } from "../persist/save_load.js";
import type { RpgIndex } from "./runner.js";
import { ATTACK_VAR, DEFENSE_VAR, HP_VAR, SCORE_VAR, enemyHpVar } from "./schema.js";
import { maneuverChildren, maneuverParent, rootManeuvers } from "./maneuver_sequence.js";
import { campaignImportReceiptTargetIssues } from "./campaign_character_import.js";
import { wolfWinterDispatchOverlayFlagForPack } from "../core/embedded_launch_overlay_receipt.js";
import { npcForState } from "./model.js";

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

const PLAYER_STAT_VARS = new Set<string>([HP_VAR, ATTACK_VAR, DEFENSE_VAR]);

type AuthoredStatCeiling = {
  /** Highest value an authored set_var can establish directly. */
  maxSet: bigint;
  /** Pack-wide positive delta budget for one engine step. */
  positiveDeltaPerStep: bigint;
};

/** Round upward before entering the exact integer comparison domain. */
function conservativeIntegerCeiling(value: number): bigint {
  return BigInt(Math.ceil(value));
}

function maxBigInt(left: bigint, right: bigint): bigint {
  return left > right ? left : right;
}

/**
 * Collect a deliberately loose ceiling from every authored effect occurrence.
 * One engine action can fire only a subset of the pack, so summing EVERY positive
 * delta is a safe per-step over-approximation. `dec_var` permits a negative `by`,
 * which is a gain and must be counted just like a positive `inc_var`.
 */
function collectAuthoredStatCeilings(
  node: unknown,
  acc: Map<string, AuthoredStatCeiling>,
): Map<string, AuthoredStatCeiling> {
  if (Array.isArray(node)) {
    for (const element of node) collectAuthoredStatCeilings(element, acc);
    return acc;
  }
  if (node === null || typeof node !== "object") return acc;

  for (const [key, value] of Object.entries(node)) {
    if (
      (key === "set_var" || key === "inc_var" || key === "dec_var") &&
      value !== null &&
      typeof value === "object"
    ) {
      const write = value as Record<string, unknown>;
      const name = write["name"];
      if (typeof name === "string" && PLAYER_STAT_VARS.has(name)) {
        const current = acc.get(name) ?? {
          maxSet: 0n,
          positiveDeltaPerStep: 0n,
        };
        if (key === "set_var" && typeof write["value"] === "number") {
          current.maxSet = maxBigInt(current.maxSet, conservativeIntegerCeiling(write["value"]));
        } else if (typeof write["by"] === "number") {
          const delta = key === "inc_var" ? write["by"] : -write["by"];
          if (delta > 0) {
            current.positiveDeltaPerStep += conservativeIntegerCeiling(delta);
          }
        }
        acc.set(name, current);
      }
    }
    collectAuthoredStatCeilings(value, acc);
  }
  return acc;
}

function playerStatUpperBound(
  index: RpgIndex,
  state: GameState,
  stat: string,
  authored: Map<string, AuthoredStatCeiling>,
): bigint {
  const ceiling = authored.get(stat);
  let base = maxBigInt(
    conservativeIntegerCeiling(index.pack.meta.vars_init[stat] ?? 0),
    ceiling?.maxSet ?? 0n,
  );

  // Campaign imports happen before the starting room's on_enter effects. Their
  // exact persisted receipt value is therefore another legitimate starting base.
  for (const effect of state.campaignImportReceipt?.effects ?? []) {
    if (
      (effect.type === "health_current_to_var" || effect.type === "skill_rank_to_var") &&
      effect.target_var === stat
    ) {
      base = maxBigInt(base, conservativeIntegerCeiling(effect.value));
    }
  }

  // initRuntimeState applies start-room on_enter at step 0, then each accepted
  // action increments step once. `step + 1` safely budgets that initial effect
  // application plus every action; multiplying by the sum of ALL authored gains
  // intentionally over-approximates any real route.
  // Convert each already-validated integer separately. `step + 1` in Number
  // space can lose the increment at the safe-integer boundary; BigInt keeps both
  // the counter and multiplication exact without a fail-open Infinity sentinel.
  return base + (BigInt(state.step) + 1n) * (ceiling?.positiveDeltaPerStep ?? 0n);
}

function collectJournalTargets(node: unknown, acc: Set<string>): Set<string> {
  if (Array.isArray(node)) {
    for (const el of node) collectJournalTargets(el, acc);
  } else if (node !== null && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === "add_journal" && typeof v === "string") acc.add(v);
      collectJournalTargets(v, acc);
    }
  }
  return acc;
}

function countJournalWrites(node: unknown): number {
  if (Array.isArray(node)) {
    return node.reduce((sum, el) => sum + countJournalWrites(el), 0);
  }
  if (node === null || typeof node !== "object") return 0;

  let count = 0;
  for (const [k, v] of Object.entries(node)) {
    if (k === "add_journal" && typeof v === "string") count += 1;
    count += countJournalWrites(v);
  }
  return count;
}

function assertNonnegativeIntegerVar(id: string, value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new SaveIntegrityError(`Save references invalid ${label} var "${id}" (${value}).`);
  }
}

type ObjectRuntimeTargets = {
  open: Set<string>;
  // Ids whose open-state can be written FALSE at runtime: an authored
  // `close_object` target, or any openable object (the built-in CLOSE verb
  // emits close_object for its own target). Split from `open` because a
  // non-openable fixture opened by an authored open_object effect can hold
  // open:true yet never open:false unless something can actually close it.
  closed: Set<string>;
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
      } else if (k === "close_object" && typeof v === "string") {
        acc.closed.add(v);
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
  const authoredStatCeilings = collectAuthoredStatCeilings(
    index.pack,
    new Map<string, AuthoredStatCeiling>(),
  );
  const journals = collectJournalTargets(index.pack, new Set<string>());
  const journalWriteCount = countJournalWrites(index.pack);
  const heldItems = new Set<string>();
  const objectRuntimeTargets = collectObjectRuntimeTargets(index.pack, {
    open: new Set<string>(),
    closed: new Set<string>(),
    locked: new Map<string, Set<boolean>>(),
  });
  const dialogueVars = new Map<
    string,
    { npc: RpgIndex["pack"]["npcs"][number]; maxOrdinal: number }
  >();
  const enemyHpVars = new Map<string, number>();
  if (state.campaignImportReceipt !== undefined) {
    let receiptIssues;
    try {
      receiptIssues = campaignImportReceiptTargetIssues(index.pack, state.campaignImportReceipt);
    } catch (error) {
      throw new SaveIntegrityError(
        `Save has malformed campaign import receipt: ${(error as Error).message}`,
      );
    }
    if (receiptIssues.length > 0) {
      throw new SaveIntegrityError(
        `Save campaign import receipt is incompatible with this pack: ${receiptIssues
          .map((issue) => issue.message)
          .join(" ")}`,
      );
    }
    for (const effect of state.campaignImportReceipt.effects) {
      if (effect.type === "equipment_to_item") {
        items.add(effect.target_object);
      } else if (
        effect.type === "background_to_flag" ||
        effect.type === "ability_to_flag" ||
        effect.type === "knowledge_to_flag" ||
        effect.type === "companion_to_flag"
      ) {
        addBooleanRuntimeTarget(flags, effect.target_flag, true);
      }
    }
  }
  if (state.embeddedLaunchOverlayReceipt !== undefined) {
    const receipt = state.embeddedLaunchOverlayReceipt;
    const packOverlayFlag = wolfWinterDispatchOverlayFlagForPack(index.pack.meta.id);
    if (packOverlayFlag !== receipt.applied_flag) {
      throw new SaveIntegrityError(
        `Save launch overlay is incompatible with RPG pack "${index.pack.meta.id}".`,
      );
    }
    if (state.flags[receipt.applied_flag] !== true) {
      throw new SaveIntegrityError(
        `Save launch overlay is missing its applied flag "${receipt.applied_flag}".`,
      );
    }
    addBooleanRuntimeTarget(flags, packOverlayFlag, true);
  }
  for (const id of index.pack.meta.flags_init) addBooleanRuntimeTarget(flags, id, true);
  // Built-in OPEN/UNLOCK actions write sparse runtime state; static defaults do not.
  for (const object of index.pack.objects) {
    if (object.takeable || object.held) items.add(object.id);
    if (object.held) heldItems.add(object.id);
    if (object.openable) {
      objectRuntimeTargets.open.add(object.id);
      // The built-in CLOSE verb closes any openable object standing open, so
      // open:false is a reachable saved state for every openable object.
      objectRuntimeTargets.closed.add(object.id);
    }
    if (object.locked && object.key_id !== undefined) {
      addLockedRuntimeTarget(objectRuntimeTargets.locked, object.id, false);
    }
  }
  for (const npc of index.pack.npcs) {
    const key = dlgVar(npc.id);
    vars.add(key);
    dialogueVars.set(key, { npc, maxOrdinal: npc.dialogue.nodes.length });
  }
  for (const enemy of index.pack.enemies) {
    if (enemy.defeat_flag !== undefined) addBooleanRuntimeTarget(flags, enemy.defeat_flag, true);
    for (const maneuver of enemy.maneuvers ?? []) {
      // MANEUVER writes its one-shot result flag implicitly in the runner, so
      // pack-aware save validation must recognize the same true value even
      // though there is no authored set_flag effect to discover recursively.
      addBooleanRuntimeTarget(flags, maneuver.result_flag, true);
    }
    const committedRoots = rootManeuvers(enemy).filter(
      (maneuver) => state.flags[maneuver.result_flag] === true,
    );
    if (committedRoots.length > 1) {
      throw new SaveIntegrityError(
        `Save commits multiple opening maneuvers for enemy "${enemy.id}" (${committedRoots
          .map((maneuver) => `"${maneuver.id}"`)
          .join(", ")}).`,
      );
    }
    for (const parent of rootManeuvers(enemy)) {
      const committedChildren = maneuverChildren(enemy, parent.id).filter(
        (maneuver) => state.flags[maneuver.result_flag] === true,
      );
      if (committedChildren.length > 1) {
        throw new SaveIntegrityError(
          `Save commits multiple follow-through maneuvers after "${parent.id}" on enemy "${enemy.id}" (${committedChildren
            .map((maneuver) => `"${maneuver.id}"`)
            .join(", ")}).`,
        );
      }
    }
    for (const maneuver of enemy.maneuvers ?? []) {
      if (maneuver.after === undefined || state.flags[maneuver.result_flag] !== true) continue;
      const parent = maneuverParent(enemy, maneuver);
      if (parent === undefined || state.flags[parent.result_flag] !== true) {
        throw new SaveIntegrityError(
          `Save commits follow-through maneuver "${maneuver.id}" on enemy "${enemy.id}" without its opening "${maneuver.after}".`,
        );
      }
    }
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
  for (const id of Object.keys(index.pack.meta.vars_init)) {
    if (state.vars[id] === undefined) {
      throw new SaveIntegrityError(`Save is missing initialized var "${id}".`);
    }
  }
  for (const [id, value] of Object.entries(state.vars)) {
    if (!vars.has(id)) {
      throw new SaveIntegrityError(`Save references unknown var "${id}".`);
    }
    if (id === HP_VAR) {
      assertNonnegativeIntegerVar(id, value, "player hp");
      if (!state.ended && value === 0) {
        throw new SaveIntegrityError(`Save references invalid player hp var "${id}" (${value}).`);
      }
      const upperBound = playerStatUpperBound(index, state, id, authoredStatCeilings);
      if (BigInt(value) > upperBound) {
        throw new SaveIntegrityError(
          `Save references invalid player hp var "${id}" (${value}); authored upper bound is ${String(upperBound)} at step ${String(state.step)}.`,
        );
      }
    } else if (id === ATTACK_VAR || id === DEFENSE_VAR) {
      assertNonnegativeIntegerVar(id, value, "player stat");
      const upperBound = playerStatUpperBound(index, state, id, authoredStatCeilings);
      if (BigInt(value) > upperBound) {
        throw new SaveIntegrityError(
          `Save references invalid player stat var "${id}" (${value}); authored upper bound is ${String(upperBound)} at step ${String(state.step)}.`,
        );
      }
    } else if (id === SCORE_VAR) {
      assertNonnegativeIntegerVar(id, value, "score");
      if (value > index.pack.meta.max_score) {
        throw new SaveIntegrityError(`Save references invalid score var "${id}" (${value}).`);
      }
    }
    const dialogue = dialogueVars.get(id);
    if (
      dialogue !== undefined &&
      (!Number.isInteger(value) || value < 0 || value > dialogue.maxOrdinal)
    ) {
      throw new SaveIntegrityError(`Save references invalid dialogue var "${id}" (${value}).`);
    }
    const dialogueRoom = dialogue && npcForState(dialogue.npc, state).room;
    if (dialogue !== undefined && value > 0 && state.current !== dialogueRoom) {
      throw new SaveIntegrityError(
        `Save references active dialogue "${id}" outside NPC room "${dialogueRoom}".`,
      );
    }
    const enemyMaxHp = enemyHpVars.get(id);
    if (enemyMaxHp !== undefined && (!Number.isInteger(value) || value < 0 || value > enemyMaxHp)) {
      throw new SaveIntegrityError(`Save references invalid enemy hp var "${id}" (${value}).`);
    }
  }
  for (const entry of state.journal) {
    if (!journals.has(entry)) {
      throw new SaveIntegrityError(`Save references unknown journal entry "${entry}".`);
    }
  }
  const maxJournalEntries = state.step * journalWriteCount;
  if (state.journal.length > maxJournalEntries) {
    throw new SaveIntegrityError(
      `Save references impossible journal entry count (${state.journal.length}) for step ${state.step}.`,
    );
  }
  const inventory = new Set<string>();
  for (const id of state.inventory) {
    if (!items.has(id)) {
      const reason = objects.has(id) ? "non-inventory object" : "unknown item";
      throw new SaveIntegrityError(`Save references ${reason} "${id}".`);
    }
    if (inventory.has(id)) {
      throw new SaveIntegrityError(`Save references duplicate inventory item "${id}".`);
    }
    inventory.add(id);
  }
  for (const id of heldItems) {
    if (!inventory.has(id)) {
      throw new SaveIntegrityError(`Save is missing held item "${id}".`);
    }
  }
  for (const [id, runtime] of Object.entries(state.objectState)) {
    if (!objects.has(id)) {
      throw new SaveIntegrityError(`Save references unknown object "${id}".`);
    }
    if (runtime.open !== undefined) {
      const reachable =
        runtime.open === true
          ? objectRuntimeTargets.open.has(id)
          : runtime.open === false && objectRuntimeTargets.closed.has(id);
      if (!reachable) {
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
    if (runtime.takenBy !== undefined) {
      if (runtime.room === undefined) {
        throw new SaveIntegrityError(`Save references object takenBy without room for "${id}".`);
      }
      if (!items.has(id)) {
        throw new SaveIntegrityError(`Save references invalid object takenBy state for "${id}".`);
      }
    }
  }
  for (const [quest, stage] of Object.entries(state.questStage)) {
    if (questStages.get(quest)?.has(stage) !== true) {
      throw new SaveIntegrityError(`Save references unknown quest stage "${quest}:${stage}".`);
    }
  }
}
