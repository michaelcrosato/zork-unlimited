/**
 * The AI writer → adapter → validator authoring loop (§12.1–3).
 *
 * With the deterministic MockAuthorProvider (§12.7) the whole pipeline runs with
 * no keys: the writer drafts a story+beats, the adapter emits a CYOA pack and
 * classifies each beat (§11), and it loops against the validator until green —
 * the validator, not the model, decides correctness (§16). The mock's first
 * attempt ships a dangling reference, so the loop must take a correcting round.
 */
import { describe, it, expect } from "vitest";
import { MockAuthorProvider } from "../../agents/authoring/mock_author.js";
import { loadEngineContract, runWriter } from "../../agents/authoring/writer.js";
import { runAdapter } from "../../agents/authoring/adapter.js";
import { validateCyoa } from "../../src/validate/cyoa_validator.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";

const provider = new MockAuthorProvider();
const contract = loadEngineContract();
const PREMISE = "A keeper must relight a dead lighthouse before a ship wrecks.";

describe("writer (§12.1)", () => {
  it("drafts a chaptered story with a beat list", async () => {
    const story = await runWriter(provider, { premise: PREMISE, contract });
    expect(story.title.length).toBeGreaterThan(0);
    expect(story.chapters.length).toBeGreaterThanOrEqual(1);
    expect(story.beats.length).toBeGreaterThanOrEqual(3);
  });
});

describe("adapter (§12.2–3)", () => {
  it("loops against the validator and converges to a GREEN pack", async () => {
    const story = await runWriter(provider, { premise: PREMISE, contract });
    const result = await runAdapter(provider, { story, contract });
    expect(result.ok).toBe(true);
    expect(result.report.ok).toBe(true);
    // The mock's first attempt is broken, so convergence takes a correcting round.
    expect(result.rounds).toBeGreaterThanOrEqual(2);
    // The produced pack independently re-validates green.
    expect(validateCyoa(result.pack).ok).toBe(true);
  });

  it("classifies every beat against the §11 adaptation labels", async () => {
    const story = await runWriter(provider, { premise: PREMISE, contract });
    const result = await runAdapter(provider, { story, contract });
    const beatIds = story.beats.map((b) => b.id).sort();
    expect(result.classifications.map((c) => c.beat_id).sort()).toEqual(beatIds);
    const labels = new Set(result.classifications.map((c) => c.label));
    // The pipeline exercises more than the trivial label.
    expect(labels.has("fully_supported")).toBe(true);
    expect(labels.has("requires_cutscene")).toBe(true);
  });

  it("the authored pack is actually playable to an ending through the engine", async () => {
    const story = await runWriter(provider, { premise: PREMISE, contract });
    const { pack } = await runAdapter(provider, { story, contract });
    const index = indexPack(pack);
    const step = makeStep(buildRules(index));
    let state = initStateForPack(index, 1);
    // Drive a path the adapter wired: climb → enter → light the lamp.
    for (const id of ["climb", "enter", "light"]) {
      const obs = buildObservation(index, state);
      const choice = obs.available_actions.find((a) => a.id === id);
      expect(choice, `choice ${id} should be offered`).toBeTruthy();
      state = step(state, { type: "CHOOSE", choiceId: id }).state;
    }
    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_saved");
  });
});
