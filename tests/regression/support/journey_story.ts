import type { OverworldSession } from "../../../src/world/session.js";

/**
 * Open the current story prompt's authored progressive disclosure before a test
 * selects one of its initially hidden options. Tests should call this explicitly:
 * the production session remains the sole owner of the reveal receipt and legality.
 */
export function revealCurrentJourneyStoryOptions(
  session: OverworldSession,
  storyChoiceId?: string,
): void {
  const story = storyChoiceId
    ? session.inspectJourneyStory(storyChoiceId)
    : session.journey().storyChoice;
  if (!story) throw new Error("There is no current journey story choice to reveal.");
  const disclosure = story.progressiveDisclosure;
  if (!disclosure) return;
  session.revealJourneyStory(story.id, disclosure.reveal.id);
}
