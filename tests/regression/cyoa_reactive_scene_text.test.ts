/**
 * Regression (§15) for bug_0018 — CYOA scenes had no reactive-text mechanism, so
 * *The Clockwork Heist*'s Cold Kitchen kept narrating "a servant has left a slim
 * roll of lockpicks" after the player had pocketed them. Surfaced by a blind
 * MCP playtester (seed 53, report ai-runs/2026-06-01T07-43-50-884Z/playtest.md,
 * §5, hit twice) and matching the deferred bug_0017 §5(b) next-focus note.
 *
 * The fix brings the parser/RPG `variants` reactive-text feature (bug_0010/0011)
 * to CYOA scenes: SceneSchema.variants (optional), the pure sceneText(scene,state)
 * helper, and the observation builder routing a scene's text through it.
 *
 * Locked here:
 *   (1) the kitchen reads the lockpicks-present prose before take_pick, and the
 *       bare-spot variant after — both in place AND after leaving and re-entering
 *       (the variant is state-driven, not a one-shot);
 *   (2) all three endings still fire (ending_rich, ending_truth, ending_caught) —
 *       this was text-only, no gating change;
 *   (3) backward-compat: a scene with NO variants returns its base text
 *       byte-identically regardless of state (so packs that don't use the field
 *       are unaffected and their content hashes are unchanged).
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack, sceneText } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadPackFile("content/cyoa/pack/clockwork_heist.yaml");
if (!loaded.ok) throw new Error("clockwork_heist pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

function run(ids: string[]): GameState {
  const step = makeStep(rules);
  let s = initStateForPack(index, 53);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}

const PRESENT = /servant\s+has left a slim roll/i;
const TAKEN = /the spot where the lockpicks lay is bare|in your pocket now/i;

describe("bug_0018 — reactive CYOA scene text (the kitchen lockpicks)", () => {
  it("narrates the lockpicks as present before take_pick, gone after — in place", () => {
    const before = buildObservation(index, run(["kitchens"]));
    expect(before.scene_id).toBe("kitchen");
    expect(before.text).toMatch(PRESENT);
    expect(before.text).not.toMatch(TAKEN);

    const after = buildObservation(index, run(["kitchens", "take_pick"]));
    expect(after.scene_id).toBe("kitchen");
    expect(after.text).toMatch(TAKEN);
    expect(after.text).not.toMatch(PRESENT);
  });

  it("the reactive text persists after leaving and re-entering the kitchen", () => {
    const reentered = buildObservation(
      index,
      run(["kitchens", "take_pick", "back_foyer", "kitchens"]),
    );
    expect(reentered.scene_id).toBe("kitchen");
    expect(reentered.text).toMatch(TAKEN);
    expect(reentered.text).not.toMatch(PRESENT);
  });

  it("all three endings still fire — text-only, no gating change", () => {
    const rich = run(["kitchens", "take_pick", "dumbwaiter", "approach_vault", "pick_lock", "grab_gold"]);
    expect(rich.ended).toBe(true);
    expect(rich.endingId).toBe("ending_rich");

    const truth = run(["inspect_clock", "pry_panel", "pry_strongbox"]);
    expect(truth.ended).toBe(true);
    expect(truth.endingId).toBe("ending_truth");

    const caught = run(["climb_stairs", "approach_vault", "force_door"]);
    expect(caught.ended).toBe(true);
    expect(caught.endingId).toBe("ending_caught");
  });

  it("backward-compat: a variant-less scene returns its base text byte-identically", () => {
    // foyer gained reactive variants in bug_0020; use a scene that still has none.
    const vaultDoor = index.pack.scenes.find((sc) => sc.id === "vault_door");
    expect(vaultDoor).toBeDefined();
    expect(vaultDoor!.variants).toBeUndefined();
    // Two arbitrary states must both yield the base text unchanged.
    const s0 = initStateForPack(index, 53);
    const s1 = run(["kitchens", "take_pick", "back_foyer"]);
    expect(sceneText(vaultDoor!, s0)).toBe(vaultDoor!.text);
    expect(sceneText(vaultDoor!, s1)).toBe(vaultDoor!.text);
  });
});
