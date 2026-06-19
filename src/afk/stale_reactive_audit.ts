/**
 * Audit support for the recurring stale reactive-description class.
 *
 * This is deliberately NOT a validator finding yet. A naive rule that promotes every
 * static room/object mention into a warning is too noisy for the shipped corpus. The
 * audit gives the loop a deterministic, suppression-aware signal it can tune before
 * converting any subset into a hard content bar.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { Condition } from "../core/conditions.js";
import type { Effect } from "../core/effects.js";
import type { ParserPack, Room, GameObject, WinCondition } from "../parser/schema.js";
import { loadParserPackFile } from "../parser/pack.js";
import { loadRpgPackFile } from "../rpg/pack.js";
import type { PackMode } from "../mcp/types.js";

export type StaleReactiveRoomItemSite = {
  packPath: string;
  packId: string;
  mode: Extract<PackMode, "parser" | "rpg">;
  roomId: string;
  objectId: string;
  objectName: string;
  matchedTerm: string;
};

export type StaleReactiveAudit = {
  sites: StaleReactiveRoomItemSite[];
};

const PACK_DIRS = [
  ["content/parser/pack", "parser"],
  ["content/rpg/pack", "rpg"],
] as const;

const MIN_TERM_LENGTH = 4;

export function auditStaleReactiveRoomItems(root: string): StaleReactiveAudit {
  const sites: StaleReactiveRoomItemSite[] = [];
  for (const [dir, mode] of PACK_DIRS) {
    const abs = join(root, dir);
    for (const file of readdirSync(abs).sort()) {
      if (!file.endsWith(".yaml")) continue;
      const path = `${dir}/${file}`;
      const loaded =
        mode === "rpg" ? loadRpgPackFile(join(root, path)) : loadParserPackFile(join(root, path));
      if (!loaded.ok) continue;
      sites.push(...auditParserPackForStaleRoomItems(loaded.compiled.pack, path, mode));
    }
  }
  return { sites };
}

export function auditParserPackForStaleRoomItems(
  pack: ParserPack,
  packPath: string,
  mode: Extract<PackMode, "parser" | "rpg">,
): StaleReactiveRoomItemSite[] {
  const objects = new Map(pack.objects.map((object) => [object.id, object]));
  const sites: StaleReactiveRoomItemSite[] = [];
  for (const room of pack.rooms) {
    for (const objectId of room.objects) {
      const object = objects.get(objectId);
      if (!object?.takeable) continue;
      if (roomVariantsCoverItemRemoval(room, object)) continue;
      if (takeGuaranteesImmediateTerminal(pack, room, object)) continue;
      const matchedTerm = firstMentionedObjectTerm(room.description, object);
      if (!matchedTerm) continue;
      sites.push({
        packPath,
        packId: pack.meta.id,
        mode,
        roomId: room.id,
        objectId,
        objectName: object.name,
        matchedTerm,
      });
    }
  }
  return sites;
}

function roomVariantsCoverItemRemoval(room: Room, object: GameObject): boolean {
  const writes = new Set(stateWritesFromTaking(object));
  const reads = (room.variants ?? []).flatMap((variant) =>
    variant.when.flatMap(conditionStateReads),
  );
  return reads.some((read) => writes.has(read));
}

function stateWritesFromTaking(object: GameObject): string[] {
  return [stateRef("item", object.id), ...(object.take_effects ?? []).flatMap(effectStateWrites)];
}

function effectStateWrites(effect: Effect): string[] {
  if ("set_flag" in effect) return [stateRef("flag", effect.set_flag)];
  if ("clear_flag" in effect) return [stateRef("flag", effect.clear_flag)];
  if ("set_var" in effect) return [stateRef("var", effect.set_var.name)];
  if ("inc_var" in effect) return [stateRef("var", effect.inc_var.name)];
  if ("dec_var" in effect) return [stateRef("var", effect.dec_var.name)];
  if ("open_object" in effect) return [stateRef("object", effect.open_object)];
  if ("set_object_locked" in effect) return [stateRef("object", effect.set_object_locked.id)];
  if ("set_quest_stage" in effect) return [stateRef("quest", effect.set_quest_stage.quest)];
  return [];
}

function conditionStateReads(condition: Condition): string[] {
  if ("has_item" in condition) return [stateRef("item", condition.has_item)];
  if ("not_item" in condition) return [stateRef("item", condition.not_item)];
  if ("has_flag" in condition) return [stateRef("flag", condition.has_flag)];
  if ("not_flag" in condition) return [stateRef("flag", condition.not_flag)];
  if ("var_gte" in condition) return [stateRef("var", condition.var_gte.name)];
  if ("var_lte" in condition) return [stateRef("var", condition.var_lte.name)];
  if ("var_eq" in condition) return [stateRef("var", condition.var_eq.name)];
  if ("is_open" in condition) return [stateRef("object", condition.is_open)];
  if ("is_unlocked" in condition) return [stateRef("object", condition.is_unlocked)];
  if ("quest_stage" in condition) return [stateRef("quest", condition.quest_stage.quest)];
  if ("all_of" in condition) return condition.all_of.flatMap(conditionStateReads);
  if ("any_of" in condition) return condition.any_of.flatMap(conditionStateReads);
  if ("none_of" in condition) return condition.none_of.flatMap(conditionStateReads);
  return [];
}

function stateRef(kind: string, id: string): string {
  return `${kind}:${id}`;
}

function takeGuaranteesImmediateTerminal(
  pack: ParserPack,
  room: Room,
  object: GameObject,
): boolean {
  if ((object.take_effects ?? []).some((effect) => "end_game" in effect)) return true;
  return pack.win_conditions.some((win) => winConditionsHoldAfterTake(pack, win, room, object));
}

function winConditionsHoldAfterTake(
  pack: ParserPack,
  win: WinCondition,
  room: Room,
  object: GameObject,
): boolean {
  const takeWrites = new Set(stateWritesFromTaking(object));
  const winReadsTakeState = win.conditions
    .flatMap(conditionStateReads)
    .some((read) => takeWrites.has(read));
  if (!winReadsTakeState) return false;
  const facts = factsAfterTaking(pack, room, object);
  return win.conditions.every((condition) => guaranteedByFacts(condition, facts));
}

type GuaranteedFacts = {
  flags: ReadonlySet<string>;
  items: ReadonlySet<string>;
  rooms: ReadonlySet<string>;
};

function factsAfterTaking(pack: ParserPack, room: Room, object: GameObject): GuaranteedFacts {
  const flags = new Set(pack.meta.flags_init);
  for (const effect of object.take_effects ?? []) {
    if ("set_flag" in effect) flags.add(effect.set_flag);
    if ("clear_flag" in effect) flags.delete(effect.clear_flag);
  }
  return {
    flags,
    items: new Set([object.id]),
    rooms: new Set([room.id]),
  };
}

function guaranteedByFacts(condition: Condition, facts: GuaranteedFacts): boolean {
  if ("has_item" in condition) return facts.items.has(condition.has_item);
  if ("has_flag" in condition) return facts.flags.has(condition.has_flag);
  if ("visited" in condition) return facts.rooms.has(condition.visited);
  if ("in_room" in condition) return facts.rooms.has(condition.in_room);
  if ("all_of" in condition)
    return condition.all_of.every((nested) => guaranteedByFacts(nested, facts));
  if ("any_of" in condition)
    return condition.any_of.some((nested) => guaranteedByFacts(nested, facts));
  return false;
}

function firstMentionedObjectTerm(text: string, object: GameObject): string | null {
  const terms = [object.name, ...object.aliases]
    .map((term) => term.trim())
    .filter((term) => term.length >= MIN_TERM_LENGTH)
    .sort((a, b) => b.length - a.length || a.localeCompare(b));
  return terms.find((term) => phraseAppears(text, term)) ?? null;
}

function phraseAppears(text: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const boundary = "[^\\p{L}\\p{N}_]";
  return new RegExp(`(^|${boundary})${escaped}($|${boundary})`, "iu").test(text);
}
