import { describe, it, expect } from "vitest";
import { initState } from "../../src/core/state.js";
import { evalCondition, evalConditions, ConditionSchema } from "../../src/core/conditions.js";

const base = () => initState({ seed: 1, start: "room0" });

describe("condition evaluator", () => {
  it("flags and items", () => {
    const s = { ...base(), flags: { lit: true }, inventory: ["key"] };
    expect(evalCondition({ has_flag: "lit" }, s)).toBe(true);
    expect(evalCondition({ not_flag: "lit" }, s)).toBe(false);
    expect(evalCondition({ has_item: "key" }, s)).toBe(true);
    expect(evalCondition({ not_item: "sword" }, s)).toBe(true);
  });

  it("visited", () => {
    const s = base();
    expect(evalCondition({ visited: "room0" }, s)).toBe(true);
    expect(evalCondition({ not_visited: "room9" }, s)).toBe(true);
  });

  it("numeric comparisons treat missing vars as 0", () => {
    const s = { ...base(), vars: { hp: 5 } };
    expect(evalCondition({ var_gte: { name: "hp", value: 5 } }, s)).toBe(true);
    expect(evalCondition({ var_lte: { name: "hp", value: 4 } }, s)).toBe(false);
    expect(evalCondition({ var_eq: { name: "gold", value: 0 } }, s)).toBe(true);
  });

  it("boolean combinators", () => {
    const s = { ...base(), flags: { a: true } };
    expect(evalCondition({ all_of: [{ has_flag: "a" }, { not_flag: "b" }] }, s)).toBe(true);
    expect(evalCondition({ any_of: [{ has_flag: "b" }, { has_flag: "a" }] }, s)).toBe(true);
    expect(evalCondition({ none_of: [{ has_flag: "b" }] }, s)).toBe(true);
    expect(evalCondition({ none_of: [{ has_flag: "a" }] }, s)).toBe(false);
  });

  it("empty condition list is vacuously true", () => {
    expect(evalConditions([], base())).toBe(true);
  });

  it("schema rejects unknown keys and accepts nesting", () => {
    expect(ConditionSchema.safeParse({ has_flag: "x" }).success).toBe(true);
    expect(ConditionSchema.safeParse({ all_of: [{ has_flag: "x" }] }).success).toBe(true);
    expect(ConditionSchema.safeParse({ bogus: "x" }).success).toBe(false);
    expect(ConditionSchema.safeParse({ has_flag: "x", extra: 1 }).success).toBe(false);
  });
});
