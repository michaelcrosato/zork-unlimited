/**
 * Regression for bug_0478 -- content_fix: the watch-room door should telegraph the
 * gallery as exposed danger before a first-time player steps outside.
 *
 * A fresh blind pass (blind-tester/reports/20260622T233228Z_wreckers_light_seed7.md)
 * found Wrecker's Light mechanically clean, but noted one remaining friction point:
 * `out_gallery` is available immediately after entering the tower, so a curious "go
 * outside" player can reach the death-rung scene before engaging the central moral setup.
 *
 * The existing bug_0100 fix already makes the actual `climb_to_wreck` death choice
 * honestly lethal. This locks the smaller upstream improvement: the watch-room prose
 * now warns that the low door opens directly onto an exposed gallery and rocks below,
 * while the route remains unchanged and ungated.
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
const sceneText = (ids: string[]) => obs(play(ids)).text.toLowerCase();

describe("wreckers_light -- watch-room gallery door is warned before entry", () => {
  it("the first watch-room read names the exposed gallery and rocks below", () => {
    const text = sceneText(["enter"]);

    expect(text).toContain("low door shudders against the storm");
    expect(text).toContain("exposed gallery");
    expect(text).toContain("rocks below");
  });

  it("the striker-held watch-room variant keeps the same gallery warning", () => {
    const text = sceneText(["enter", "take_striker"]);

    expect(text).toContain("low door shudders against the storm");
    expect(text).toContain("exposed gallery");
    expect(text).toContain("rocks below");
  });

  it("the warning is text-only: the gallery route remains available and ungated", () => {
    const observation = obs(play(["enter"]));
    const galleryAction = observation.available_actions.find((a) => a.id === "out_gallery");

    expect(galleryAction).toBeDefined();
    expect((galleryAction as { text: string }).text.toLowerCase()).toContain("storm gallery");

    const outGallery = loaded.compiled.pack.scenes
      .find((scene) => scene.id === "watch_room")!
      .choices!.find((choice) => choice.id === "out_gallery")!;
    expect(outGallery.conditions ?? []).toEqual([]);
    expect(outGallery.next).toBe("gallery");
  });
});
