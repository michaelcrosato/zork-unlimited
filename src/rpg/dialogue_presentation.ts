import type { GameState } from "../core/state.js";
import { nodeText } from "./model.js";
import type { DialogueNode } from "./schema.js";

const WOLF_WINTER_INITIAL_STRATEGY_SOURCE =
  "Albany sent you. Save/cost—HUNT: herd+stores/wolves risk death; LURE: herd+pack/feed+paling/cattle risk; DRIVE: people+pack/outer line; crisis=wound/2 cattle/rig; FORTIFY: herd+pack+byre/property vs seals+help. Name HUNT here, or cross uncommitted into it; crossing north commits it and closes the other plans.";

const WOLF_WINTER_INITIAL_STRATEGY_SCORECARD = `Albany sent you. Any of the four plans can finish Wolf-Winter, but each protects something by spending something else. Choose the cost you accept; I will not name a best answer.

HUNT — protects herd and stores; wolves may die.
LURE — protects herd and wolves; spends the last feed, leaves the paling broken, and a foul can cost cattle.
DRIVE — protects people and wolves; gives up the outer line, then a crisis costs a wound, two cattle, or the rig.
FORTIFY — protects byre, herd, and wolves; trades Cade's outer property against public seals and his aid.

Ask about any plan before committing; asking does not commit your strategy. Name HUNT here, or cross uncommitted into it. Cross north uncommitted and HUNT becomes final; the other plans close.`;

/**
 * Resolve one player-visible dialogue line for both action narration and the
 * active observation. Presentation-only overlays live here so every client sees
 * the same words without changing authored content hashes or deterministic state.
 */
export function dialogueNodeText(state: GameState, node: DialogueNode): string {
  const authoredText = nodeText(node, state);
  // Authored prose, unlike pack/node/flag ids, survives the engine's supported
  // identifier relabeling and distinguishes the base root from its reactive variants.
  return authoredText.trimEnd() === WOLF_WINTER_INITIAL_STRATEGY_SOURCE
    ? WOLF_WINTER_INITIAL_STRATEGY_SCORECARD
    : authoredText;
}
