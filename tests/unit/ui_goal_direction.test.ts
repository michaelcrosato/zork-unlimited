/**
 * The browser's "Next for current goal" label must point at the CURRENT goal.
 *
 * `goalRelevantAreaIds` reads the journey's visible goal copy and matches quest
 * titles inside it. That copy ends with the engine's end-of-chapter horizon,
 * which names the OPTIONAL next chapter so the player understands the coming
 * Continue/End checkpoint. Matching titles against the horizon made the opening
 * chapter advertise Gallowmere's district as the current goal from turn one —
 * and because `journey.goalPassage` is null while the initial goal is active,
 * this matcher is the only goal-direction signal the opening chapter has, so a
 * wrong answer here is the only answer the player gets.
 */
import { describe, expect, it } from "vitest";
import {
  INITIAL_JOURNEY_GOAL,
  INITIAL_JOURNEY_GOAL_GUIDANCE,
  OPENING_CHAPTER_HORIZON,
} from "../../src/world/journey_contract.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { goalRelevantAreaIds } from "../../ui/src/App.js";

const world = loadOverworldManifest(process.cwd());

function questArea(id: string): string {
  const quest = world.quests.find((candidate) => candidate.id === id);
  if (!quest) throw new Error(`Expected quest ${JSON.stringify(id)} in the shipped manifest.`);
  return quest.area;
}

describe("ui goal direction", () => {
  it("keeps the opening chapter's goal quest as the goal-relevant destination", () => {
    const areas = goalRelevantAreaIds(
      INITIAL_JOURNEY_GOAL.text,
      INITIAL_JOURNEY_GOAL_GUIDANCE,
      world.quests,
    );
    expect(areas).toContain(questArea("wolf_winter"));
  });

  it("does not treat the optional next chapter named by the horizon as the current goal", () => {
    // The horizon is the only place the initial guidance names Gallowmere, and
    // it names it as what Continue leads to AFTER Wolf-Winter, not as direction.
    expect(INITIAL_JOURNEY_GOAL_GUIDANCE).toContain(OPENING_CHAPTER_HORIZON);
    expect(OPENING_CHAPTER_HORIZON).toContain("Gallowmere");
    expect(INITIAL_JOURNEY_GOAL_GUIDANCE.replace(OPENING_CHAPTER_HORIZON, "")).not.toContain(
      "Gallowmere",
    );

    const areas = goalRelevantAreaIds(
      INITIAL_JOURNEY_GOAL.text,
      INITIAL_JOURNEY_GOAL_GUIDANCE,
      world.quests,
    );
    expect(areas).not.toContain(questArea("gallowmere"));
  });

  it("still matches a quest a goal names outside the horizon", () => {
    // The horizon is removed as a phrase, not as a licence to stop matching:
    // guidance that genuinely names a quest still resolves its district.
    const areas = goalRelevantAreaIds(
      "Finish The Gallowmere.",
      `Head for the market. ${OPENING_CHAPTER_HORIZON}`,
      world.quests,
    );
    expect(areas).toContain(questArea("gallowmere"));
  });
});
