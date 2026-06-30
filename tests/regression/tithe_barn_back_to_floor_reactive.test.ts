/**
 * Regression (§15) for bug_0370 — content_fix: tithe_barn granary_floor now
 * remembers that the thief has spoken after the player returns via back_to_floor.
 *
 * A fresh blind playtest (20260620T064505Z_tithe_barn_seed7) found that the route
 * go_in -> face_thief -> back_to_floor reset the barn hub to its first-look wording:
 * "They do not run. They wait to see what kind of man the lord has set on them."
 * That contradicts the just-seen reckoning scene, where the woman has already met
 * your eye and said "Do what he pays you for."
 *
 * Fix: face_thief sets a pure prose flag, faced_thief, and granary_floor has ordered
 * variants for faced_thief alone and faced_thief + knows_truth. No route, choice gate,
 * ending, or score behavior changes.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";

const loaded = loadPackFile("content/cyoa/pack/tithe_barn.yaml");
if (!loaded.ok) throw new Error("tithe_barn pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string) => ({ type: "CHOOSE", choiceId: id }) as const;

function play(ids: string[]) {
  const step = makeStep(rules);
  let s = initStateForPack(index, 1);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}

const obs = (ids: string[]) => buildObservation(index, play(ids));
const text = (ids: string[]) => obs(ids).text.toLowerCase();
const actionIds = (ids: string[]) => obs(ids).available_actions.map((a) => a.id);

describe("tithe_barn — back_to_floor remembers the thief has spoken", () => {
  it("no-truth return renders the faced_thief hub variant, not the first-look text", () => {
    const o = obs(["go_in", "face_thief", "back_to_floor"]);
    const t = o.text.toLowerCase();

    expect(o.state.flags).toContain("faced_thief");
    expect(t).toContain("she has spoken now");
    expect(t).toContain("do what he pays you for");
    expect(t).not.toContain("wait to see what kind of man");
  });

  it("truth-known return preserves both the spoken encounter and the ledger truth", () => {
    const t = text(["go_in", "read_book", "leave_book", "face_thief", "back_to_floor"]);

    expect(t).toContain("no longer an unknown shape");
    expect(t).toContain("told you to do what he pays you for");
    expect(t).toContain("you have read the steward's book");
    expect(t).not.toContain("wait to see what kind of man");
  });

  it("faced_thief does not unlock the public-justice ending without knows_truth", () => {
    expect(actionIds(["go_in", "face_thief", "back_to_floor", "face_thief"])).not.toContain(
      "open_doors",
    );
    expect(actionIds(["go_in", "read_book", "leave_book", "face_thief"])).toContain("open_doors");
  });
});
