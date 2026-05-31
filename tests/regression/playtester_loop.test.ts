/**
 * Regression (§15) for two related playtester defects, fixed together:
 *
 *  1. Loop detection was DEAD. The cycle guard compared full state hashes, but a
 *     GameState carries a monotonic `step` counter that the engine bumps every
 *     turn — so two visits to the same world position never hashed equal and the
 *     "looped" status could never occur. Detection is now keyed on the world
 *     signature minus `step`, and fires soundly on an immediate no-progress step.
 *
 *  2. The "fell into a loop near X" finding reported `scenes_visited.at(-1)`,
 *     which is the ALPHABETICALLY last visited scene (the set is sorted), not the
 *     scene where the looping choice was actually made.
 *
 * The fixture loops at a scene ("alpha") that is alphabetically FIRST among the
 * visited scenes, so a correct temporal report ("alpha") is distinguishable from
 * the old alphabetical bug (which would have said "zulu").
 */
import { describe, it, expect } from "vitest";
import { compilePack } from "../../src/cyoa/pack.js";
import { indexPack } from "../../src/cyoa/runner.js";
import { runPlaytest, runRoster } from "../../agents/playtester.js";
import { MockProvider } from "../../agents/llm/provider.js";

// zulu (start) → alpha → alpha (self-loop, no effects ⇒ no world progress).
const LOOP_PACK = `
meta:
  id: loop_fixture_v1
  title: Loop Fixture
  start: zulu
scenes:
  - id: zulu
    title: Zulu
    text: The start.
    choices:
      - { id: go, text: Go to alpha, next: alpha }
  - id: alpha
    title: Alpha
    text: A dead loop.
    choices:
      - { id: stay, text: Stay forever, next: alpha }
`;

const compiled = compilePack(LOOP_PACK);
if (!compiled.ok) throw new Error("loop fixture must compile");
const pack = compiled.compiled.pack;
const index = indexPack(pack);

describe("playtester loop detection (regression)", () => {
  it("flags a no-progress self-loop as 'looped' (the guard is no longer dead)", async () => {
    const rec = await runPlaytest(index, new MockProvider("mainline"), { persona: "mainline", seed: 1 });
    expect(rec.status).toBe("looped");
    // It made progress (zulu → alpha) before stalling on the self-loop at alpha.
    expect(rec.steps.at(-1)?.scene_id).toBe("alpha");
    expect(rec.steps.at(-1)?.result).toBe("loop");
  });

  it("reports the loop at the TEMPORAL scene, not the alphabetically-last one", async () => {
    const { coverage } = await runRoster(pack, { personas: ["mainline"], seeds: [1] });
    const loopFinding = coverage.findings.find((f) => f.includes("fell into a loop"));
    expect(loopFinding).toBeDefined();
    // alpha is where the loop happened; zulu is the alphabetically-last visited
    // scene the old code would have (incorrectly) named.
    expect(loopFinding).toContain('near "alpha"');
    expect(loopFinding).not.toContain('near "zulu"');
  });
});
