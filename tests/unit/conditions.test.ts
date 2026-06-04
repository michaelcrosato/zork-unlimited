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

  it("in_room reads the CURRENT room, distinct from the sticky visited", () => {
    // Start in room0, then move to room1: both are `visited`, but only room1 is current.
    const s = { ...base(), current: "room1", visited: { room0: true, room1: true } };
    expect(evalCondition({ in_room: "room1" }, s)).toBe(true);
    expect(evalCondition({ in_room: "room0" }, s)).toBe(false); // visited, but not current
    expect(evalCondition({ visited: "room0" }, s)).toBe(true);
    expect(evalCondition({ in_room: "room9" }, s)).toBe(false);
  });

  it("runtime object-state predicates read GameState.objectState (default false)", () => {
    const s0 = base();
    // No objectState yet ⇒ both default false (the box is treated as closed & locked).
    expect(evalCondition({ is_open: "box" }, s0)).toBe(false);
    expect(evalCondition({ is_unlocked: "box" }, s0)).toBe(false);
    // Unlocked at runtime (locked explicitly cleared) ⇒ is_unlocked true, still closed.
    const unlocked = { ...s0, objectState: { box: { locked: false } } };
    expect(evalCondition({ is_unlocked: "box" }, unlocked)).toBe(true);
    expect(evalCondition({ is_open: "box" }, unlocked)).toBe(false);
    // Opened ⇒ is_open true.
    const open = { ...s0, objectState: { box: { open: true, locked: false } } };
    expect(evalCondition({ is_open: "box" }, open)).toBe(true);
    // A still-locked runtime override is NOT unlocked.
    const stillLocked = { ...s0, objectState: { box: { locked: true } } };
    expect(evalCondition({ is_unlocked: "box" }, stillLocked)).toBe(false);
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
    expect(ConditionSchema.safeParse({ is_open: "box" }).success).toBe(true);
    expect(ConditionSchema.safeParse({ is_unlocked: "box" }).success).toBe(true);
    expect(ConditionSchema.safeParse({ in_room: "crypt" }).success).toBe(true);
    expect(ConditionSchema.safeParse({ in_room: "" }).success).toBe(false);
    expect(ConditionSchema.safeParse({ is_open: "" }).success).toBe(false);
    expect(ConditionSchema.safeParse({ all_of: [{ has_flag: "x" }] }).success).toBe(true);
    expect(ConditionSchema.safeParse({ bogus: "x" }).success).toBe(false);
    expect(ConditionSchema.safeParse({ has_flag: "x", extra: 1 }).success).toBe(false);
  });
});
