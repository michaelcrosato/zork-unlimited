import type { GameState } from "../core/state.js";
import { nodeText } from "./model.js";
import type { DialogueNode } from "./schema.js";

const WOLF_WINTER_INITIAL_STRATEGY_SOURCE =
  "Albany sent you. Save/cost—HUNT: herd+stores/wolves risk death; LURE: herd+pack/feed+paling/cattle risk; DRIVE: people+pack/outer line; crisis=wound/2 cattle/rig; FORTIFY: herd+pack+byre/property vs seals+help. Name HUNT here, or cross uncommitted into it; crossing north commits it and closes the other plans.";

const WOLF_WINTER_INITIAL_STRATEGY_SCORECARD = `Albany sent you. Choose what must stand at dawn. Every plan can finish Wolf-Winter; none saves everything, and I name no best answer.

HUNT — Tonight: hold the breach to protect herd and stores. Cost: wolves may die; defeat can cost cattle and the line. Albany: bloodshed changes Greenway work; any damage remains.
LURE — Tonight: draw off the pack; herd and wolves can live. Cost: last feed, broken paling, cattle risk on a foul. Albany: broken boundary or scattered cattle change the Station response.
DRIVE — Tonight: clear people and pack from the byre. Cost: abandon the outer line; the crisis takes a wound, two cattle, or the rig. Albany: the abandoned line and chosen loss remain.
FORTIFY — Tonight: hold byre, herd, and pack to dawn. Cost: risk Cade's property or Albany's seals and aid; no retreat. Albany: those terms remain; a no-loss hold opens no Cade repair dispatch.

Asking may teach; it never commits a strategy. HUNT commits on an uncommitted north crossing. LURE, DRIVE, and FORTIFY commit in their branches. Any commitment closes the other three.`;

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
