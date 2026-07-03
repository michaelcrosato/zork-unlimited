import { describe, it, expect } from "vitest";
import { makeStep, actionEquals } from "../../src/core/engine.js";
import { MICRO_ACTIONS, microRules, microInitState } from "../../src/demo/micro.js";

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
    const cave = step(s, MICRO_ACTIONS.enterCave).state;
    const r = step(cave, MICRO_ACTIONS.grabGold); // requires has_torch
    expect(r.ok).toBe(false);
  });

  it("applies effects and advances the step counter", () => {
    const s = microInitState();
    const r = step(s, MICRO_ACTIONS.takeTorch);
    expect(r.ok).toBe(true);
    expect(r.state.flags["has_torch"]).toBe(true);
    expect(r.state.inventory).toEqual(["torch"]);
    expect(r.state.step).toBe(1);
  });

  it("fires on_enter effects on a location transition", () => {
    const s = microInitState();
    const r = step(s, MICRO_ACTIONS.enterCave);
    expect(r.ok).toBe(true);
    expect(r.state.current).toBe("cave");
    expect(r.state.journal).toContain("The cave breathes cold air.");
  });

  it("a condition-gated action succeeds once the flag is set", () => {
    let s = microInitState();
    s = step(s, MICRO_ACTIONS.takeTorch).state;
    s = step(s, MICRO_ACTIONS.enterCave).state;
    const r = step(s, MICRO_ACTIONS.grabGold);
    expect(r.ok).toBe(true);
    expect(r.state.current).toBe("treasure");
    expect(r.state.vars["score"]).toBe(10);
  });

  it("a finished game accepts no further actions", () => {
    let s = microInitState();
    s = step(s, MICRO_ACTIONS.enterCave).state;
    s = step(s, MICRO_ACTIONS.leaveCave).state;
    s = step(s, MICRO_ACTIONS.leaveWorld).state;
    expect(s.ended).toBe(true);
    const r = step(s, MICRO_ACTIONS.leaveWorld);
    expect(r.ok).toBe(false);
  });

  it("actionEquals compares structurally", () => {
    expect(actionEquals(MICRO_ACTIONS.takeTorch, { type: "TAKE", item: "torch" })).toBe(true);
    expect(actionEquals(MICRO_ACTIONS.takeTorch, MICRO_ACTIONS.grabGold)).toBe(false);
  });
});
