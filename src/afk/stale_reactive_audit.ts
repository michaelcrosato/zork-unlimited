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
import type { ParserPack, Room, GameObject } from "../parser/schema.js";
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
      if (roomVariantsReadItem(room, objectId)) continue;
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

function roomVariantsReadItem(room: Room, itemId: string): boolean {
  const walk = (condition: Condition): boolean => {
    if ("has_item" in condition) return condition.has_item === itemId;
    if ("not_item" in condition) return condition.not_item === itemId;
    if ("all_of" in condition) return condition.all_of.some(walk);
    if ("any_of" in condition) return condition.any_of.some(walk);
    if ("none_of" in condition) return condition.none_of.some(walk);
    return false;
  };
  return (room.variants ?? []).some((variant) => variant.when.some(walk));
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
