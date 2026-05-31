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
    expect(r.event).toEqual({ type: "state_change", effect: "place_object", id: "lantern", room: "cellar" });
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
