/**
 * Validator/runner parity: an interaction that carries BOTH `effects` and a
 * `skill_check` must fire its base effects as well as the roll's outcome
 * effects — matching CYOA semantics (choice.effects apply before the roll) and
 * the validator's own accounting (`interactionEffects` counts base + both
 * branches as firable writes).
 *
 * Before this fix the RPG runner returned ONLY the skill-check resolution,
 * silently dropping `it.effects` — so a pack whose sole win gate was set in
 * those base effects validated GREEN (0 findings) yet was unwinnable at
 * runtime. The validator was truthful; the runner lied.
 */
import { describe, it, expect } from "vitest";
import { RpgPackSchema } from "../../src/rpg/schema.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import { validateRpgFoundation } from "../../src/validate/rpg_foundation_validator.js";
import { makeStep } from "../../src/core/engine.js";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";

// Forced d20s: the verification seam every proof harness uses (§8.5).
const bestRoll: Rng = { next: () => 0.999, int: (_min, max) => max };
const worstRoll: Rng = { next: () => 0, int: (min, _max) => min };

const rawPack = {
  meta: { id: "skill_base_fx", title: "Winch House", start_room: "hall", vars_init: { might: 2 } },
  rooms: [
    {
      id: "hall",
      name: "Winch Hall",
      description: "A rusted winch is bolted to the wall. The gate stands north.",
      objects: ["winch"],
      exits: [{ direction: "north", to: "yard", conditions: [{ has_flag: "gate_up" }] }],
    },
    { id: "yard", name: "Yard", description: "Open air.", exits: [] },
  ],
  objects: [
    {
      id: "winch",
      name: "rusted winch",
      description: "Stiff with rust, but the pawl looks sound.",
      interactions: [
        {
          verb: "USE",
          target: "winch",
          conditions: [{ not_flag: "gate_up" }],
          // Base effects: the winch pawl engages whatever the roll says —
          // exactly the shape the audit's probe P2 proved was dropped.
          effects: [{ set_flag: "gate_up" }],
          skill_check: {
            skill: "might",
            difficulty: 10,
            on_success: [{ narrate: "The gate rattles all the way up." }],
            on_failure: [{ narrate: "It rises with a shriek of rust." }],
          },
        },
      ],
    },
  ],
  npcs: [],
  enemies: [],
  win_conditions: [{ id: "w", conditions: [{ visited: "yard" }], ending: "out" }],
  endings: [{ id: "out", title: "Out", text: "You walk out under the raised gate." }],
};

function playToEnding(rng: Rng): { state: GameState; flags: string[] } {
  const pack = RpgPackSchema.parse(rawPack);
  const index = indexRpgPack(pack);
  const step = makeStep(buildRpgRules(index, () => rng));
  let s = initStateForRpgPack(index, 1);
  const use = step(s, { type: "USE", target: "winch" });
  expect(use.ok).toBe(true);
  s = use.state;
  const move = step(s, { type: "MOVE", direction: "north" });
  return { state: move.ok ? move.state : s, flags: Object.keys(s.flags) };
}

describe("skill_check interactions fire their base effects (rpg)", () => {
  it("the pack validates green — the validator has always counted base effects", () => {
    const pack = RpgPackSchema.parse(rawPack);
    const report = validateRpgFoundation(pack);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
  });

  it.each([
    ["best roll", bestRoll],
    ["worst roll", worstRoll],
  ])(
    "base set_flag applies regardless of the roll (%s) and the pack is winnable",
    (_label, rng) => {
      const { state, flags } = playToEnding(rng);
      expect(flags).toContain("gate_up");
      expect(state.ended).toBe(true);
      expect(state.endingId).toBe("out");
    },
  );

  it("base effects precede roll-outcome effects, mirroring CYOA order", () => {
    const pack = RpgPackSchema.parse(rawPack);
    const index = indexRpgPack(pack);
    const rules = buildRpgRules(index, () => bestRoll);
    const res = rules.resolve(initStateForRpgPack(index, 1), {
      type: "USE",
      target: "winch",
    });
    expect(res).not.toBeNull();
    const kinds = (res?.effects ?? []).map((e) => Object.keys(e)[0]);
    expect(kinds.indexOf("set_flag")).toBeGreaterThanOrEqual(0);
    expect(kinds.indexOf("set_flag")).toBeLessThan(kinds.indexOf("narrate"));
  });
});
