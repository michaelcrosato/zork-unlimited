import { describe, it, expect } from "vitest";
import { initState } from "../../src/core/state.js";
import { applyEffect, applyEffects, exitFlag, EffectSchema } from "../../src/core/effects.js";

const base = () => initState({ seed: 1, start: "room0" });

describe("effect reducer", () => {
  it("does not mutate input state", () => {
    const s = base();
    const before = JSON.stringify(s);
    applyEffect({ set_flag: "x" }, s);
    expect(JSON.stringify(s)).toBe(before);
  });

  it("flags, items, vars, journal", () => {
    let s = base();
    s = applyEffect({ set_flag: "lit" }, s).state;
    expect(s.flags["lit"]).toBe(true);
    s = applyEffect({ add_item: "key" }, s).state;
    s = applyEffect({ add_item: "key" }, s).state; // idempotent
    expect(s.inventory).toEqual(["key"]);
    s = applyEffect({ remove_item: "key" }, s).state;
    expect(s.inventory).toEqual([]);
    s = applyEffect({ inc_var: { name: "score", by: 5 } }, s).state;
    s = applyEffect({ dec_var: { name: "score", by: 2 } }, s).state;
    expect(s.vars["score"]).toBe(3);
    s = applyEffect({ add_journal: "hi" }, s).state;
    expect(s.journal).toEqual(["hi"]);
  });

  it("detaches inventory when duplicate add_item is idempotent", () => {
    const s = applyEffect({ add_item: "key" }, base()).state;
    const r = applyEffect({ add_item: "key" }, s);

    expect(r.state.inventory).toEqual(["key"]);
    expect(r.state.inventory).not.toBe(s.inventory);

    r.state.inventory.push("coin");
    expect(s.inventory).toEqual(["key"]);
  });

  it("goto sets current, marks visited, and emits move", () => {
    const r = applyEffect({ goto: "room1" }, base());
    expect(r.state.current).toBe("room1");
    expect(r.state.visited["room1"]).toBe(true);
    expect(r.event).toEqual({ type: "move", from: "room0", to: "room1" });
  });

  it("unlock_exit sets the canonical exit flag", () => {
    const r = applyEffect({ unlock_exit: { from: "a", to: "b" } }, base());
    expect(r.state.flags[exitFlag("a", "b")]).toBe(true);
  });

  it("object open/lock state", () => {
    let s = applyEffect({ open_object: "chest" }, base()).state;
    expect(s.objectState["chest"]?.open).toBe(true);
    s = applyEffect({ set_object_locked: { id: "chest", locked: false } }, s).state;
    expect(s.objectState["chest"]).toEqual({ open: true, locked: false });
  });

  it("place_object records the object's room without disturbing other state", () => {
    let s = applyEffect({ open_object: "chest" }, base()).state;
    const r = applyEffect({ place_object: { id: "lantern", room: "cellar" } }, s);
    expect(r.state.objectState["lantern"]).toEqual({ room: "cellar" });
    expect(r.state.objectState["chest"]?.open).toBe(true); // unrelated object untouched
    expect(r.event).toEqual({
      type: "state_change",
      effect: "place_object",
      id: "lantern",
      room: "cellar",
    });
    // overwrites a prior placement
    s = applyEffect({ place_object: { id: "lantern", room: "attic" } }, r.state).state;
    expect(s.objectState["lantern"]?.room).toBe("attic");
  });

  it("end_game terminates", () => {
    const r = applyEffect({ end_game: "ending_x" }, base());
    expect(r.state.ended).toBe(true);
    expect(r.state.endingId).toBe("ending_x");
    expect(r.event).toEqual({ type: "ending", endingId: "ending_x" });
  });

  it("applies effects in declared order", () => {
    const { state, events } = applyEffects(
      [{ set_var: { name: "n", value: 1 } }, { inc_var: { name: "n", by: 4 } }],
      base(),
    );
    expect(state.vars["n"]).toBe(5);
    expect(events).toHaveLength(2);
  });

  it("schema rejects unknown effect kinds", () => {
    expect(EffectSchema.safeParse({ set_flag: "x" }).success).toBe(true);
    expect(EffectSchema.safeParse({ teleport: "x" }).success).toBe(false);
  });
});

describe("finite-number guard (vars never become NaN/Infinity)", () => {
  it("schema rejects non-finite var literals as hard validation errors", () => {
    expect(EffectSchema.safeParse({ set_var: { name: "s", value: Infinity } }).success).toBe(false);
    expect(EffectSchema.safeParse({ set_var: { name: "s", value: NaN } }).success).toBe(false);
    expect(EffectSchema.safeParse({ inc_var: { name: "s", by: -Infinity } }).success).toBe(false);
    expect(EffectSchema.safeParse({ set_var: { name: "s", value: 42 } }).success).toBe(true);
  });

  it("rejects a runtime overflow to Infinity, keeps the prior value, reports a diagnostic", () => {
    let s = base();
    s = applyEffect({ set_var: { name: "score", value: Number.MAX_VALUE } }, s).state;
    const r = applyEffect({ inc_var: { name: "score", by: Number.MAX_VALUE } }, s);
    expect(Number.isFinite(r.state.vars["score"])).toBe(true);
    expect(r.state.vars["score"]).toBe(Number.MAX_VALUE); // unchanged — write rejected
    expect(r.event).toMatchObject({ effect: "inc_var", value: Number.MAX_VALUE, delta: 0 });
    expect((r.event as Record<string, unknown>).diagnostic).toContain("non-finite");
  });

  it("normal finite arithmetic is unchanged and carries no diagnostic", () => {
    let s = base();
    s = applyEffect({ inc_var: { name: "score", by: 5 } }, s).state;
    const r = applyEffect({ dec_var: { name: "score", by: 2 } }, s);
    expect(r.state.vars["score"]).toBe(3);
    expect(r.event).toMatchObject({ effect: "dec_var", value: 3, delta: -2 });
    expect((r.event as Record<string, unknown>).diagnostic).toBeUndefined();
  });
});
