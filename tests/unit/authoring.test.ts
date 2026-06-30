/**
 * The AI writer → adapter → validator authoring loop (§12.1–3).
 *
 * With the deterministic MockAuthorProvider (§12.7) the whole pipeline runs with
 * no keys: the writer drafts a story+beats, the adapter emits an RPG pack and
 * classifies each beat (§11), and it loops against validateRpg until green —
 * the validator, not the model, decides correctness (§16). The mock's first
 * attempt ships an RPG-layer reference error, so the loop must take a correcting round.
 */
import { describe, it, expect } from "vitest";
import { MockAuthorProvider } from "../../agents/authoring/mock_author.js";
import { loadEngineContract, runWriter } from "../../agents/authoring/writer.js";
import { runRpgAdapter } from "../../agents/authoring/adapter.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import type { RpgAction } from "../../src/api/types.js";
import { actionEquals, makeStep } from "../../src/core/engine.js";
import type { Rng } from "../../src/core/rng.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
  type RpgIndex,
} from "../../src/rpg/runner.js";
import type { GameState } from "../../src/core/state.js";

const provider = new MockAuthorProvider();
const contract = loadEngineContract();
const PREMISE = "A keeper must relight a dead lighthouse before a ship wrecks.";

const bestRng = (): Rng => ({
  next: () => 0.999999,
  int: (_min: number, max: number) => max,
});

function legalAction(index: RpgIndex, state: GameState, action: RpgAction): RpgAction {
  const option = enumerateRpgActions(index, state).find((o) => actionEquals(o.action, action));
  if (!option) throw new Error(`Expected legal RPG action ${JSON.stringify(action)}`);
  return option.action;
}

describe("writer (§12.1)", () => {
  it("drafts a chaptered story with a beat list", async () => {
    const story = await runWriter(provider, { premise: PREMISE, contract });
    expect(story.title.length).toBeGreaterThan(0);
    expect(story.chapters.length).toBeGreaterThanOrEqual(1);
    expect(story.beats.length).toBeGreaterThanOrEqual(3);
  });
});

describe("rpg adapter (§12.2–3, §13 Stage 4, bug_0140)", () => {
  it("loops against the RICHEST validator (validateRpg) and converges to a GREEN pack", async () => {
    const story = await runWriter(provider, { premise: PREMISE, contract });
    const result = await runRpgAdapter(provider, { story, contract });
    expect(result.ok).toBe(true);
    expect(result.report.ok).toBe(true);
    // The mock's first RPG attempt ships an undeclared enemy death_ending, so it revises.
    expect(result.rounds).toBeGreaterThanOrEqual(2);
    // The produced pack independently re-validates green through the RPG validator, and is
    // a genuine Stage-4 shape: combat and skill checks are load-bearing.
    expect(validateRpg(result.pack).ok).toBe(true);
    expect(result.pack.enemies.length).toBeGreaterThanOrEqual(1);
    expect(
      result.pack.objects.some((object) =>
        object.interactions.some((interaction) => interaction.skill_check !== undefined),
      ),
    ).toBe(true);
  });

  it("classifies every beat against the §11 adaptation labels", async () => {
    const story = await runWriter(provider, { premise: PREMISE, contract });
    const result = await runRpgAdapter(provider, { story, contract });
    const beatIds = story.beats.map((b) => b.id).sort();
    expect(result.classifications.map((c) => c.beat_id).sort()).toEqual(beatIds);
    const labels = new Set(result.classifications.map((c) => c.label));
    // The pipeline exercises more than the trivial label.
    expect(labels.has("fully_supported")).toBe(true);
    expect(labels.has("requires_cutscene")).toBe(true);
  });

  it("the authored pack is actually playable to an ending through the engine", async () => {
    const story = await runWriter(provider, { premise: PREMISE, contract });
    const { pack } = await runRpgAdapter(provider, { story, contract });
    const index = indexRpgPack(pack);
    const step = makeStep(buildRpgRules(index, () => bestRng()));
    let state = initStateForRpgPack(index, 1);

    // Drive the actual engine loop: take the lever, move, defeat the stair guard,
    // move through the now-unlocked exit, then pass the lamp skill check.
    for (const action of [
      { type: "TAKE", item: "iron_spike" },
      { type: "MOVE", direction: "north" },
      { type: "ATTACK", enemy: "storm_wight" },
      { type: "ATTACK", enemy: "storm_wight" },
      { type: "MOVE", direction: "up" },
      { type: "USE", item: "iron_spike", target: "lamp" },
    ] satisfies RpgAction[]) {
      const result = step(state, legalAction(index, state, action));
      expect(result.ok, JSON.stringify(action)).toBe(true);
      state = result.state;
    }
    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_saved");
  });
});
