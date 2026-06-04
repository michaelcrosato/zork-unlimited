/**
 * CYOA scoring capability (mechanic-palette standardization, RPG-STANDARDIZATION-PLAN §4.4).
 *
 * Scoring was first-class only in parser/RPG (max_score + the Zork-style "[Your score
 * has gone up…]" feedback). This proves it now works in CYOA mode too — a choice's
 * `inc_var` on the conventional `score` var produces the same feedback when the pack
 * declares `meta.max_score` — AND that the capability is a true no-op for a pack that
 * does NOT declare max_score (every existing CYOA pack), so their behaviour/hashes are
 * unchanged. The feedback is appended as a narration EVENT only; the engine never
 * mutates state with it (engine.ts decorateEvents), so determinism is untouched.
 */
import { describe, it, expect } from "vitest";
import { makeStep } from "../../src/core/engine.js";
import { CyoaPackSchema } from "../../src/cyoa/schema.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import type { Action } from "../../src/api/types.js";

const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

/** A 1-choice pack that awards `score` on the way to its ending. `max_score` is a param
 *  so the same content can be tested with scoring on (10) and off (undefined). */
function scorePack(maxScore: number | undefined) {
  return CyoaPackSchema.parse({
    meta: {
      id: "score_cap_v1",
      title: "Score Capability",
      start: "vault",
      ...(maxScore === undefined ? {} : { max_score: maxScore }),
    },
    scenes: [
      {
        id: "vault",
        title: "The Vault",
        text: "The strongbox stands open before you.",
        choices: [
          {
            id: "grab_loot",
            text: "Take the loot and go.",
            effects: [{ inc_var: { name: "score", by: 10 } }],
            next: "ending_rich",
          },
        ],
      },
    ],
    endings: [{ id: "ending_rich", title: "Rich", text: "You walk out a wealthy thief." }],
  });
}

describe("CYOA scoring capability", () => {
  it("emits Zork-style score feedback when meta.max_score is set", () => {
    const index = indexPack(scorePack(10));
    const step = makeStep(buildRules(index));
    const r = step(initStateForPack(index, 1), choose("grab_loot"));
    expect(r.ok).toBe(true);
    expect(r.state.vars.score).toBe(10);
    const narrations = r.events
      .filter((e) => e.type === "narration")
      .map((e) => (e as { text: string }).text);
    expect(narrations).toContain("[Your score has gone up by 10 points; it is now 10 of 10.]");
  });

  it("is a no-op when max_score is absent (every existing CYOA pack) — score still tracked, no feedback", () => {
    const index = indexPack(scorePack(undefined));
    const step = makeStep(buildRules(index));
    const r = step(initStateForPack(index, 1), choose("grab_loot"));
    expect(r.ok).toBe(true);
    expect(r.state.vars.score).toBe(10); // the var still moves…
    const narrations = r.events
      .filter((e) => e.type === "narration")
      .map((e) => (e as { text: string }).text);
    // …but no score-feedback chrome is appended (proves the capability can't perturb
    // a pack that doesn't opt in — the byte-identical-hash guarantee at runtime).
    expect(narrations.some((t) => t.includes("Your score has gone"))).toBe(false);
  });

  it("absent max_score keeps the compiled meta free of the field (hash-safety)", () => {
    expect("max_score" in scorePack(undefined).meta).toBe(false);
    expect(scorePack(10).meta.max_score).toBe(10);
  });
});
