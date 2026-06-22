/**
 * Regression for bug_0423 -- the shared world-intro renderer prefixed opening
 * prose with a labeled "From Charterhaven:" metadata line. A blind White Stag
 * playtest read that as scaffolding leaking into the narrative voice.
 */
import { describe, expect, it } from "vitest";
import { buildObservation } from "../../src/cyoa/observation.js";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, initStateForPack } from "../../src/cyoa/runner.js";

const loaded = loadPackFile("content/cyoa/pack/white_stag.yaml");
if (!loaded.ok) throw new Error("white_stag pack must compile");
const index = indexPack(loaded.compiled.pack);

describe("bug_0423 -- world intro reads as player-facing prose", () => {
  it("keeps the world hook but removes metadata-style labels from the opening", () => {
    const opening = buildObservation(index, initStateForPack(index, 7), {
      includeWorldIntro: true,
    }).text;
    const [worldIntro, sceneText] = opening.split("\n\n");

    expect(worldIntro).toContain("Charterhaven");
    expect(worldIntro).toContain("White Stag Forest");
    expect(worldIntro).toContain("forest petitioner");
    expect(worldIntro).toContain("choose how the forest claim is resolved");
    expect(worldIntro).toContain("old rights and city warrants");
    expect(worldIntro).toMatch(/^You have come from Charterhaven to White Stag Forest/);
    expect(worldIntro).not.toMatch(/^From Charterhaven:/);
    expect(worldIntro).not.toContain("You enter White Stag Forest as forest petitioner;");
    expect(sceneText).toMatch(/^Four days you have followed it/);
  });
});
