/**
 * Pure crawl oracles — no engine stepping, no I/O.
 *
 * `textDefect` / `renderDefects` catch content that RENDERS wrong (an unresolved
 * template marker, a literal "undefined"/"[object Object]"/"NaN" leaking into
 * player-facing prose, or an empty string). `sampleIllegalAction` synthesizes an
 * action that is deterministically NOT in the current legal set, for the
 * negative-legality probe in the quest crawler's stepping loop.
 */
import type { RpgAction } from "../api/types.js";
import type { GameEvent } from "../core/events.js";
import type { Rng } from "../core/rng.js";
import type { GameState } from "../core/state.js";
import type { RpgActionOption } from "../rpg/legal_actions.js";
import { buildRpgObservation } from "../rpg/observation.js";
import type { RpgIndex } from "../rpg/runner.js";

const UNDEFINED_WORD = /\bundefined\b/;
const OBJECT_OBJECT = /\[object Object\]/;
const NAN_WORD = /\bNaN\b/;
const UNRESOLVED_TEMPLATE = /\{\{|\}\}|\$\{/;

/** Returns a defect description or null. Pure string check — no engine access. */
export function textDefect(text: string): string | null {
  if (text.trim().length === 0) return "empty or whitespace-only text";
  if (UNDEFINED_WORD.test(text))
    return `text contains a literal "undefined": ${JSON.stringify(text)}`;
  if (OBJECT_OBJECT.test(text))
    return `text contains a literal "[object Object]": ${JSON.stringify(text)}`;
  if (NAN_WORD.test(text)) return `text contains a literal "NaN": ${JSON.stringify(text)}`;
  if (UNRESOLVED_TEMPLATE.test(text))
    return `text contains an unresolved template marker: ${JSON.stringify(text)}`;
  return null;
}

/**
 * Scan everything the current step just made player-visible: the observation's
 * title/description/ending text, plus every `narration` event's text. Never
 * throws on content defects (those become messages); a THROW out of this
 * function (e.g. the observation builder itself blowing up) is the caller's
 * CRASH oracle to catch.
 */
export function renderDefects(index: RpgIndex, state: GameState, events: GameEvent[]): string[] {
  const messages: string[] = [];
  const obs = buildRpgObservation(index, state, { includeAvailableActions: false });

  const titleDefect = textDefect(obs.title);
  if (titleDefect) messages.push(`observation title: ${titleDefect}`);

  const descriptionDefect = textDefect(obs.description);
  if (descriptionDefect) messages.push(`observation description: ${descriptionDefect}`);

  if (obs.ending) {
    const endingDefect = textDefect(obs.ending.text);
    if (endingDefect) messages.push(`ending text: ${endingDefect}`);
  }

  for (const event of events) {
    if (event.type === "narration") {
      const defect = textDefect(event.text);
      if (defect) messages.push(`narration event: ${defect}`);
    }
  }

  return messages;
}

const COMPASS_DIRECTIONS = [
  "north",
  "south",
  "east",
  "west",
  "up",
  "down",
  "in",
  "out",
  "northeast",
  "northwest",
  "southeast",
  "southwest",
] as const;

/**
 * Deterministically synthesize an action NOT in the legal set, for the
 * negative-legality probe (a listed-illegal action must be rejected cleanly,
 * never silently accepted or thrown). Tries, in order: an unlisted MOVE
 * direction, a TAKE of an item that is not currently present/held, then — only
 * while mid-dialogue — an ASK of a topic id no live topic uses. Returns null if
 * none of these can be built (e.g. every compass direction is already legal).
 */
export function sampleIllegalAction(
  index: RpgIndex,
  state: GameState,
  legal: RpgActionOption[],
  rng: Rng,
): RpgAction | null {
  const legalMoveDirections = new Set<string>();
  const legalTakeItems = new Set<string>();
  let dialogueNpc: string | null = null;
  const legalAskTopics = new Set<string>();
  for (const option of legal) {
    const { action } = option;
    if (action.type === "MOVE") legalMoveDirections.add(action.direction);
    else if (action.type === "TAKE") legalTakeItems.add(action.item);
    else if (action.type === "ASK") {
      dialogueNpc = action.npc;
      legalAskTopics.add(action.topic);
    }
  }

  const candidateDirections = COMPASS_DIRECTIONS.filter((d) => !legalMoveDirections.has(d));
  if (candidateDirections.length > 0) {
    const direction = candidateDirections[rng.int(0, candidateDirections.length - 1)]!;
    return { type: "MOVE", direction };
  }

  const candidateItems = [...index.objects.keys()].filter(
    (id) => !legalTakeItems.has(id) && !state.inventory.includes(id),
  );
  if (candidateItems.length > 0) {
    const item = candidateItems[rng.int(0, candidateItems.length - 1)]!;
    return { type: "TAKE", item };
  }

  if (dialogueNpc !== null) {
    let topic = `__illegal_topic_${rng.int(0, 999_999)}`;
    while (legalAskTopics.has(topic)) topic = `__illegal_topic_${rng.int(0, 999_999)}`;
    return { type: "ASK", npc: dialogueNpc, topic };
  }

  return null;
}
