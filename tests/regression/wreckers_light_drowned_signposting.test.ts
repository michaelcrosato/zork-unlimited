/**
 * Regression (§15) for bug_0100 — content_fix: the Storm Gallery's `climb_to_wreck`
 * is a CHOSEN, plainly-lethal act, not a punish for curiosity.
 *
 * A fresh source-blind MCP playtester (wreckers_light, seed 7,
 * ai-runs/2026-06-02T01-45-25-898Z/playtest.md §5) rated the pack clarity 5/5,
 * enjoyment 4/5 and found ZERO functional bugs — its one design flaw was that the
 * gallery's only death route read as an "unsignposted instant-death trap": the old
 * choice label "Climb down the cliff toward the rocks now" read as purposeful
 * exploration, so the instant drown landed as a punish for curiosity rather than a
 * fate the player elects. The pack's own design discipline wants terminal beats to be
 * DELIBERATE (see the tend_keeper comment: "Deliberate and terminal ... never an
 * accidental dead end"); this route missed that bar.
 *
 * The fix is honest choice-text reframing only (the clockwork bug_0046 dumbwaiter
 * pattern): the label now NAMES the lethal descent — over the rail, down the
 * storm-slick rungs, into the breaking sea below — so the choice foreshadows its own
 * outcome. This test locks:
 *   (1) the gallery's climb choice text now names the breaking sea / the descent (no
 *       longer the bare "toward the rocks now" exploration framing);
 *   (2) the route still reaches ending_drowned (no route/ending change);
 *   (3) the choice carries NO conditions — it is offered in every gallery state
 *       (geared or not), so the fix is purely the label, not a new gate;
 *   (4) the label is consistent with the ending prose (rungs down the cliff).
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadPackFile("content/cyoa/pack/wreckers_light.yaml");
if (!loaded.ok) throw new Error("wreckers_light pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

function play(ids: string[]) {
  const step = makeStep(rules);
  let s = initStateForPack(index, 1);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}
const obs = (s: ReturnType<typeof play>) => buildObservation(index, s);

// On the gallery (before choosing), with no gear — the state the blind tester hit.
const AT_GALLERY = ["enter", "out_gallery"];
const DROWNED = [...AT_GALLERY, "climb_to_wreck"];

describe("wreckers_light — the gallery climb is a signposted, chosen fate (bug_0100)", () => {
  it("the climb label names the lethal descent, not bare exploration", () => {
    const actions = obs(play(AT_GALLERY)).available_actions;
    const climb = actions.find((a) => a.id === "climb_to_wreck");
    expect(climb).toBeDefined();
    const text = (climb as { text: string }).text.toLowerCase();
    // Foreshadows the outcome: you go into the breaking sea / down the rungs.
    expect(text).toContain("breaking sea");
    expect(text).toMatch(/rungs|over the rail/);
    // The old framing ("toward the rocks now") read as purposeful exploration — gone.
    expect(text).not.toContain("toward the rocks now");
  });

  it("still reaches ending_drowned (the fix is text only, no route/ending change)", () => {
    const end = obs(play(DROWNED));
    expect(end.ended).toBe(true);
    expect(end.ending_id).toBe("ending_drowned");
  });

  it("the climb is offered unconditionally in the gallery (no new gate added)", () => {
    const climb = loaded.compiled.pack.scenes
      .find((sc) => sc.id === "gallery")!
      .choices!.find((c) => c.id === "climb_to_wreck")!;
    // Purely a label reframe: no conditions were added to gate the death.
    expect(climb.conditions ?? []).toEqual([]);
    expect(climb.next).toBe("ending_drowned");
  });

  it("the label is consistent with the drowned ending's prose (rungs down the cliff)", () => {
    const climb = obs(play(AT_GALLERY)).available_actions.find((a) => a.id === "climb_to_wreck")!;
    const endingText = obs(play(DROWNED)).text.toLowerCase();
    expect((climb as { text: string }).text.toLowerCase()).toContain("rungs");
    expect(endingText).toContain("rungs down the cliff");
  });
});
