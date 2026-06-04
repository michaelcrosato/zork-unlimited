/**
 * CYOA skill-check capability (mechanic-palette standardization, RPG-STANDARDIZATION-PLAN §4.5).
 *
 * Skill checks (d20 + a stat var vs a difficulty) were a parser/RPG-only mechanic. This brings
 * them to CYOA: a choice may carry a `skill_check` (instead of a plain `next`); the runner rolls
 * via the SAME shared resolver (resolveSkillCheck) the RPG mode uses, and the on_success /
 * on_failure effects carry their own goto/end_game routing. Proven here under forced best/worst
 * rolls (the verification seam), plus the schema's exactly-one-of(next, skill_check) invariant.
 * Hash-neutral: no shipped pack uses skill_check, so every pack compiles byte-identically.
 */
import { describe, it, expect } from "vitest";
import { makeStep } from "../../src/core/engine.js";
import { CyoaPackSchema } from "../../src/cyoa/schema.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import type { Rng } from "../../src/core/rng.js";
import type { Action } from "../../src/api/types.js";

const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });
/** A rng that always returns `roll` for any int() — the best/worst-roll verification seam. */
const forcedRng = (roll: number): Rng => ({ int: () => roll }) as unknown as Rng;

const pack = CyoaPackSchema.parse({
  meta: { id: "skill_cap_v1", title: "Skill Capability", start: "gate", vars_init: { wits: 3 } },
  scenes: [
    {
      id: "gate",
      title: "The Gate",
      text: "A riddle bars the way.",
      choices: [
        {
          id: "solve",
          text: "Match wits with the riddle.",
          skill_check: {
            skill: "wits",
            difficulty: 12,
            on_success: [{ goto: "ending_through" }, { end_game: "ending_through" }],
            on_failure: [{ goto: "ending_lost" }, { end_game: "ending_lost" }],
          },
        },
      ],
    },
  ],
  endings: [
    { id: "ending_through", title: "Through", text: "The gate swings wide." },
    { id: "ending_lost", title: "Lost", text: "The riddle defeats you." },
  ],
});
const index = indexPack(pack);

describe("CYOA skill-check capability", () => {
  it("routes to on_success when the d20 check passes (forced max roll) + names the die", () => {
    const r = makeStep(buildRules(index, () => forcedRng(20)))(
      initStateForPack(index, 1),
      choose("solve"),
    );
    expect(r.ok).toBe(true);
    expect(r.state.ended).toBe(true);
    expect(r.state.endingId).toBe("ending_through");
    const narr = r.events
      .filter((e) => e.type === "narration")
      .map((e) => (e as { text: string }).text);
    expect(narr).toContain("wits check: d20 20 + 3 = 23 vs 12 — success.");
  });

  it("routes to on_failure when the d20 check fails (forced min roll)", () => {
    const r = makeStep(buildRules(index, () => forcedRng(1)))(
      initStateForPack(index, 1),
      choose("solve"),
    );
    expect(r.ok).toBe(true);
    expect(r.state.ended).toBe(true);
    expect(r.state.endingId).toBe("ending_lost");
  });

  it("a skill-checked choice is offered like any choice (no `next` needed)", () => {
    expect(
      buildObservation(index, initStateForPack(index, 1)).available_actions.map((a) => a.id),
    ).toEqual(["solve"]);
  });

  it("schema requires EXACTLY ONE of next / skill_check", () => {
    const both = CyoaPackSchema.safeParse({
      meta: { id: "x", title: "x", start: "s" },
      scenes: [
        {
          id: "s",
          title: "s",
          text: "t",
          choices: [
            {
              id: "c",
              text: "c",
              next: "e",
              skill_check: { skill: "w", difficulty: 1, on_success: [], on_failure: [] },
            },
          ],
        },
      ],
      endings: [{ id: "e", title: "e", text: "e" }],
    });
    expect(both.success).toBe(false);
    const neither = CyoaPackSchema.safeParse({
      meta: { id: "x", title: "x", start: "s" },
      scenes: [{ id: "s", title: "s", text: "t", choices: [{ id: "c", text: "c" }] }],
      endings: [],
    });
    expect(neither.success).toBe(false);
  });
});
