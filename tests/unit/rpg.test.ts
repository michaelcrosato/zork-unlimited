/**
 * Stage 4 mechanic unit tests (spec §14: "Unit tests for the new mechanic").
 *
 * Covers the gated core DSL additions (set_quest_stage / quest_stage) and the
 * seeded combat + skill-check resolvers. The determinism contract is the point:
 * the same (state) always yields the same rolls, because randomness is derived
 * only from (seed, step).
 */
import { describe, it, expect } from "vitest";
import { applyEffect } from "../../src/core/effects.js";
import { evalCondition } from "../../src/core/conditions.js";
import { initState, type GameState } from "../../src/core/state.js";
import { resolveAttack, resolveSkillCheck, enemyHp, enemyAlive } from "../../src/rpg/combat.js";
import { enemyHpVar, type Enemy } from "../../src/rpg/schema.js";

const baseState = () => ({ ...initState({ seed: 1, start: "room" }), vars: { hp: 20, attack: 4, defense: 2, might: 3 } });

const wight: Enemy = {
  id: "wight",
  name: "wight",
  description: "x",
  room: "room",
  hp: 12,
  attack: 3,
  defense: 1,
  defeat_flag: "wight_slain",
  death_ending: "ending_fallen",
  on_defeat: [{ set_flag: "spoils" }],
};

describe("gated DSL: quest stages (§13, §14)", () => {
  it("set_quest_stage writes questStage and quest_stage reads it", () => {
    const s0 = initState({ seed: 1, start: "a" });
    const { state, event } = applyEffect({ set_quest_stage: { quest: "main", stage: "act2" } }, s0);
    expect(state.questStage["main"]).toBe("act2");
    expect(event).toMatchObject({ type: "state_change", effect: "set_quest_stage", quest: "main", stage: "act2" });
    expect(evalCondition({ quest_stage: { quest: "main", stage: "act2" } }, state)).toBe(true);
    expect(evalCondition({ quest_stage: { quest: "main", stage: "act1" } }, state)).toBe(false);
    expect(evalCondition({ quest_stage: { quest: "main", stage: "act2" } }, s0)).toBe(false);
  });

  it("does not mutate the input state (purity, §8.1)", () => {
    const s0 = initState({ seed: 1, start: "a" });
    applyEffect({ set_quest_stage: { quest: "q", stage: "s" } }, s0);
    expect(s0.questStage).toEqual({});
  });
});

describe("seeded combat (§8.5)", () => {
  it("resolveAttack is deterministic for a fixed state", () => {
    const s = baseState();
    expect(resolveAttack(s, wight)).toEqual(resolveAttack(s, wight));
  });

  it("a full fight is reproducible and ends with the wight defeated", () => {
    const fight = (): { hp: number; flags: Record<string, boolean>; rounds: number } => {
      let state: GameState = baseState();
      let rounds = 0;
      while (enemyAlive(state, wight) && (state.vars["hp"] ?? 0) > 0 && rounds < 50) {
        const res = resolveAttack(state, wight);
        for (const e of res.effects) state = applyEffect(e, state).state;
        state = { ...state, step: state.step + 1 }; // engine advances the step each round
        rounds++;
      }
      return { hp: state.vars["hp"] ?? 0, flags: state.flags, rounds };
    };
    const a = fight();
    const b = fight();
    expect(a).toEqual(b); // identical outcome — fully replayable
    expect(a.flags["wight_slain"]).toBe(true);
    expect(a.flags["spoils"]).toBe(true); // on_defeat fired
    expect(a.hp).toBeGreaterThan(0);
  });

  it("enemy HP tracking uses the hidden var", () => {
    const s = baseState();
    expect(enemyHp(s, wight)).toBe(12);
    const wounded = { ...s, vars: { ...s.vars, [enemyHpVar("wight")]: 3 } };
    expect(enemyHp(wounded, wight)).toBe(3);
    expect(enemyAlive({ ...s, vars: { ...s.vars, [enemyHpVar("wight")]: 0 } }, wight)).toBe(false);
  });
});

describe("seeded skill checks (§8.5)", () => {
  const check = { skill: "might", difficulty: 12, on_success: [{ set_flag: "moved" } as const], on_failure: [{ narrate: "nope" } as const] };

  it("is deterministic for a fixed state", () => {
    const s = baseState();
    expect(resolveSkillCheck(s, check)).toEqual(resolveSkillCheck(s, check));
  });

  it("a high skill makes an easy check always pass at some step", () => {
    // d20 + 3 vs 12 — at least one of several steps must succeed.
    let succeeded = false;
    for (let step = 0; step < 10; step++) {
      const s = { ...baseState(), step };
      const res = resolveSkillCheck(s, check);
      if (res.effects.some((e) => "set_flag" in e && e.set_flag === "moved")) succeeded = true;
    }
    expect(succeeded).toBe(true);
  });
});
