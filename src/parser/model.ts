/**
 * Legacy parser model compatibility shim.
 *
 * Parser content is still present during normalization, but the canonical world
 * model implementation is the RPG model. This file preserves parser import names
 * while routing indexing, object visibility, reactive text, dialogue state, and
 * fresh-state setup through the RPG runtime.
 */
import type { GameState } from "../core/state.js";
import {
  activeDialogue as rpgActiveDialogue,
  dlgVar,
  endingText as rpgEndingText,
  indexRpgModel,
  initStateForRpgModel,
  isLocked as rpgIsLocked,
  isOpen,
  locateObject,
  nodeByOrdinal,
  nodeOrdinal,
  nodeText as rpgNodeText,
  objectDescription as rpgObjectDescription,
  objectName as rpgObjectName,
  roomDescription as rpgRoomDescription,
  visibleObjectIds as rpgVisibleObjectIds,
  type Location,
  type RpgModelIndex,
} from "../rpg/model.js";
import type {
  DialogueNode as RpgDialogueNode,
  Ending as RpgEnding,
  GameObject as RpgGameObject,
  Room as RpgRoom,
  RpgPack,
} from "../rpg/schema.js";
import type { DialogueNode, GameObject, Npc, ParserEnding, ParserPack, Room } from "./schema.js";

export type ParserIndex = {
  pack: ParserPack;
  rooms: Map<string, Room>;
  objects: Map<string, GameObject>;
  npcs: Map<string, Npc>;
  npcByRoom: Map<string, Npc[]>;
  homeRoom: Map<string, string>;
  containerOf: Map<string, string>;
};

const asRpgIndex = (index: ParserIndex): RpgModelIndex => index as unknown as RpgModelIndex;

export function indexParserPack(pack: ParserPack): ParserIndex {
  return indexRpgModel(pack as unknown as RpgPack) as unknown as ParserIndex;
}

export type { Location };

export { dlgVar, isOpen, locateObject, nodeByOrdinal, nodeOrdinal };

export function roomDescription(room: Room, state: GameState): string {
  return rpgRoomDescription(room as unknown as RpgRoom, state);
}

export function objectDescription(object: GameObject, state: GameState): string {
  return rpgObjectDescription(object as unknown as RpgGameObject, state);
}

export function objectName(object: GameObject, state: GameState): string {
  return rpgObjectName(object as unknown as RpgGameObject, state);
}

export function nodeText(node: DialogueNode, state: GameState): string {
  return rpgNodeText(node as unknown as RpgDialogueNode, state);
}

export function endingText(ending: ParserEnding, state: GameState): string {
  return rpgEndingText(ending as unknown as RpgEnding, state);
}

export function isLocked(index: ParserIndex, state: GameState, id: string): boolean {
  return rpgIsLocked(asRpgIndex(index), state, id);
}

export function visibleObjectIds(index: ParserIndex, state: GameState, room: string): string[] {
  return rpgVisibleObjectIds(asRpgIndex(index), state, room);
}

export function activeDialogue(
  index: ParserIndex,
  state: GameState,
): { npc: Npc; node: DialogueNode } | null {
  return rpgActiveDialogue(asRpgIndex(index), state) as {
    npc: Npc;
    node: DialogueNode;
  } | null;
}

export function initStateForParserPack(index: ParserIndex, seed: number): GameState {
  return initStateForRpgModel(asRpgIndex(index), seed);
}
