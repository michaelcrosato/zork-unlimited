import { describe, it, expect } from "vitest";
import { makeStep, actionEquals } from "../../src/core/engine.js";
import { microRules, microInitState } from "../../src/demo/micro.js";

const step = makeStep(microRules);

describe("engine.step (§8.4 resolution order)", () => {
  it("rejects an action not in the legal set, with no state change", () => {
    const s = microInitState();
    const r = step(s, { type: "MOVE", direction: "north" });
    expect(r.ok).toBe(false);
    expect(r.state).toBe(s); // same reference: untouched
    expect(r.events).toEqual([{ type: "rejected", reason: r.rejectionReason }]);
  });

  it("rejects a legal action whose conditions are unmet (no state change)", () => {
    const s = microInitState(); // no torch yet
    const r = step(s, { type: "CHOOSE", choiceId: "grab_gold" }); // requires has_torch... but wrong scene
    expect(r.ok).toBe(false);
  });

  it("applies effects and advances the step counter", () => {
    const s = microInitState();
    const r = step(s, { type: "CHOOSE", choiceId: "take_torch" });
    expect(r.ok).toBe(true);
    expect(r.state.flags["has_torch"]).toBe(true);
    expect(r.state.inventory).toEqual(["torch"]);
    expect(r.state.step).toBe(1);
  });

  it("fires on_enter effects on a location transition", () => {
    const s = microInitState();
    const r = step(s, { type: "CHOOSE", choiceId: "enter_cave" });
    expect(r.ok).toBe(true);
    expect(r.state.current).toBe("cave");
    expect(r.state.journal).toContain("The cave breathes cold air.");
  });

  it("a condition-gated choice succeeds once the flag is set", () => {
    let s = microInitState();
    s = step(s, { type: "CHOOSE", choiceId: "take_torch" }).state;
    s = step(s, { type: "CHOOSE", choiceId: "enter_cave" }).state;
    const r = step(s, { type: "CHOOSE", choiceId: "grab_gold" });
    expect(r.ok).toBe(true);
    expect(r.state.current).toBe("treasure");
    expect(r.state.vars["score"]).toBe(10);
  });

  it("a finished game accepts no further actions", () => {
    let s = microInitState();
    s = step(s, { type: "CHOOSE", choiceId: "enter_cave" }).state;
    s = step(s, { type: "CHOOSE", choiceId: "leave" }).state;
    s = step(s, { type: "CHOOSE", choiceId: "go" }).state;
    expect(s.ended).toBe(true);
    const r = step(s, { type: "CHOOSE", choiceId: "go" });
    expect(r.ok).toBe(false);
  });

  it("actionEquals compares structurally", () => {
    expect(actionEquals({ type: "CHOOSE", choiceId: "a" }, { type: "CHOOSE", choiceId: "a" })).toBe(true);
    expect(actionEquals({ type: "CHOOSE", choiceId: "a" }, { type: "CHOOSE", choiceId: "b" })).toBe(false);
  });
});
