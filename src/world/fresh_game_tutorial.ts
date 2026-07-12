import { INITIAL_JOURNEY_GOAL } from "./journey_contract.js";

export type FreshGameTutorialStep = Readonly<{
  id: "read" | "discover" | "follow" | "remember";
  title: string;
  text: string;
}>;

export type FreshGameTutorial = Readonly<{
  version: 1;
  kicker: string;
  title: string;
  goal: string;
  steps: readonly FreshGameTutorialStep[];
  start_label: string;
}>;

/**
 * The one-screen orientation shared by human and agent-facing fresh-game surfaces.
 * Keep it concise, spoiler-free, and focused on the first useful loop.
 */
export const FRESH_GAME_TUTORIAL = Object.freeze({
  version: 1,
  kicker: "Field guide · Day one",
  title: "Begin where you stand",
  goal: INITIAL_JOURNEY_GOAL.text,
  steps: Object.freeze([
    Object.freeze({
      id: "read",
      title: "Read the moment",
      text: "Check place, supplies, fatigue, and visible opportunities. Choose a shown action.",
    }),
    Object.freeze({
      id: "discover",
      title: "Find a local lead",
      text: "Scout, talk, investigate, and explore nearby areas to reveal local work and quests.",
    }),
    Object.freeze({
      id: "follow",
      title: "Follow it on foot",
      text: "Walk to a lead's local area before starting it. Roads cost time and supplies; towns offer rest and resupply.",
    }),
    Object.freeze({
      id: "remember",
      title: "Choose your horizon",
      text: "The journal supports save/export and resume. Meaningful moves, new clues, dialogue choices, and conflicts count; context checks and unchanged repeats do not. At 40 decisions, 80, then every 40, choose another 40 or end; completing the goal can ask sooner.",
    }),
  ]),
  start_label: "Explore Albany",
} as const satisfies FreshGameTutorial);

/** Give each new MCP session an isolated payload without exposing the canonical object. */
export function freshGameTutorial(): FreshGameTutorial {
  return {
    ...FRESH_GAME_TUTORIAL,
    steps: FRESH_GAME_TUTORIAL.steps.map((step) => ({ ...step })),
  };
}
