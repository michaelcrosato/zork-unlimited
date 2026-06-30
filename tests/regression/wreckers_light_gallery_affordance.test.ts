/**
 * Regression (§15) for bug_0257 — content_fix: the Storm Gallery's wreckers'-light
 * affordance is now LEGIBLE to a tool-less player.
 *
 * A fresh source-blind MCP playtester (wreckers_light, seeds 7/23/41,
 * ai-runs/2026-06-04T22-58-44-750Z/playtest.md §4/§5) rated the pack clarity 5/5,
 * enjoyment 5/5 with ZERO functional bugs — its one design flaw was that the gallery's
 * vivid wreckers'-trick prose implied a false-light interaction, but a player arriving
 * WITHOUT both tools (the most natural first visit, and the tester's seed-23 path) saw
 * only the death-climb: the implemented `hang_false_light` → `ending_wrecker` route is
 * gated on carrying BOTH lamp_oil and striker, and the BASE gallery text never told the
 * player the trick needs the cask + flint. It read as a Chekhov's gun that's a trapdoor.
 *
 * The fix is a reactive-prose SIGNPOST in the base gallery text only, mirroring the
 * existing `truth_known` empty-hands variant ("the rail gives you nothing without the
 * cask below and the keeper's flint in hand"). This test locks:
 *   (1) the tool-less gallery text now names the cask + flint requirement (the affordance
 *       is legible) — without surfacing the gated wreck choice;
 *   (2) the gating is UNCHANGED: arming with oil + striker still surfaces hang_false_light
 *       and reaches ending_wrecker;
 *   (3) the death-climb is unchanged: still offered tool-less, still reaches ending_drowned;
 *   (4) the fix is prose-only — same available actions in the tool-less gallery as before
 *       (climb_to_wreck + back_in, no hang_false_light).
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";

const loaded = loadPackFile("content/cyoa/pack/wreckers_light.yaml");
if (!loaded.ok) throw new Error("wreckers_light pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string) => ({ type: "CHOOSE", choiceId: id }) as const;

function play(ids: string[]) {
  const step = makeStep(rules);
  let s = initStateForPack(index, 1);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}
const obs = (s: ReturnType<typeof play>) => buildObservation(index, s);
const actionIds = (s: ReturnType<typeof play>) =>
  obs(s)
    .available_actions.map((a) => a.id)
    .sort();

// Tool-less gallery (no oil, no striker, journal unread) — the blind tester's seed-23 path.
const AT_GALLERY = ["enter", "out_gallery"];
// Arm with both tools, then out to the gallery (oil from the store, striker from the mantel).
const ARM = ["take_striker", "go_down", "take_oil", "back_up"];
const ARMED_GALLERY = ["enter", ...ARM, "out_gallery"];

describe("wreckers_light — the gallery wrecker affordance is legible tool-less (bug_0257)", () => {
  it("the tool-less gallery text signposts the cask + flint requirement", () => {
    const text = obs(play(AT_GALLERY)).text.toLowerCase();
    // The base prose still sets up the wreckers' trick...
    expect(text).toContain("wreckers' trick");
    // ...but now tells the player WHY the bracket is inert and what it would take.
    expect(text).toContain("cask of oil below and the keeper's flint");
    expect(text).toContain("lures no one");
  });

  it("the signpost does not surface the gated wreck choice (prose-only)", () => {
    // Tool-less, the only forward actions remain the death-climb and the retreat.
    expect(actionIds(play(AT_GALLERY))).toEqual(["back_in", "climb_to_wreck"]);
  });

  it("arming with oil + striker still surfaces hang_false_light → ending_wrecker", () => {
    const armed = obs(play(ARMED_GALLERY));
    expect(armed.available_actions.map((a) => a.id)).toContain("hang_false_light");
    const wrecked = obs(play([...ARMED_GALLERY, "hang_false_light"]));
    expect(wrecked.ended).toBe(true);
    expect(wrecked.ending_id).toBe("ending_wrecker");
  });

  it("the death-climb is unchanged: offered tool-less, reaches ending_drowned", () => {
    const drowned = obs(play([...AT_GALLERY, "climb_to_wreck"]));
    expect(drowned.ended).toBe(true);
    expect(drowned.ending_id).toBe("ending_drowned");
  });

  it("the gating itself is untouched — hang_false_light still requires both tools", () => {
    const choice = loaded.compiled.pack.scenes
      .find((sc) => sc.id === "gallery")!
      .choices!.find((c) => c.id === "hang_false_light")!;
    expect(choice.conditions).toEqual([{ has_item: "lamp_oil" }, { has_item: "striker" }]);
    expect(choice.next).toBe("ending_wrecker");
  });
});
