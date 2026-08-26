import { INITIAL_JOURNEY_GOAL, OPENING_CHAPTER_HORIZON } from "./journey_contract.js";

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
  kicker: "Day one",
  title: "Start in Albany",
  goal: INITIAL_JOURNEY_GOAL.text,
  steps: Object.freeze([
    Object.freeze({
      id: "read",
      title: "Check",
      text: "Location, supplies, fatigue, and available actions.",
    }),
    Object.freeze({
      id: "discover",
      title: "Find leads",
      text: "SCOUT, TALK, INVESTIGATE, or EXPLORE.",
    }),
    Object.freeze({
      id: "follow",
      title: "Travel",
      text: "Reach the lead's area. Road cost: time and supplies. Towns: rest/resupply. Follow Goal takes the first road, then stops at the goal, an encounter, or before a new supply shortage or worse fatigue delay.",
    }),
    Object.freeze({
      id: "remember",
      title: "Save",
      text: `Journal: save, export, resume. Accepted consequential actions count; context and repeated information do not. It pauses after goals, at 40 and 80 decisions, then every 40; never during combat or dialogue. ${OPENING_CHAPTER_HORIZON}`,
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
