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
  goal: "You begin in Albany. Find one local lead, follow it, and let the wider road open from there.",
  steps: Object.freeze([
    Object.freeze({
      id: "read",
      title: "Read the moment",
      text: "Check your place, supplies, fatigue, and visible opportunities. Choose only an action currently shown.",
    }),
    Object.freeze({
      id: "discover",
      title: "Find a local lead",
      text: "Scout landmarks, talk to people, investigate events, and explore nearby areas. Discovery opens work and quests.",
    }),
    Object.freeze({
      id: "follow",
      title: "Follow it on foot",
      text: "Move to a lead's local area before starting it. Roads spend time and supplies and raise fatigue; towns offer rest and resupply.",
    }),
    Object.freeze({
      id: "remember",
      title: "Keep your thread",
      text: "The journal records what changed. Save or export your journey when your client offers it, then resume it later.",
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
