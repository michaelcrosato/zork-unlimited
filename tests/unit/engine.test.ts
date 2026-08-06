import { describe, it, expect } from "vitest";
import { makeStep, actionEquals } from "../../src/core/engine.js";
import { MAX_ENGINE_STEP } from "../../src/core/state.js";
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

  it("rejects actions at the maximum safe step count", () => {
    const s = { ...microInitState(), step: MAX_ENGINE_STEP };
    const r = step(s, MICRO_ACTIONS.takeTorch);
    expect(r.ok).toBe(false);
    expect(r.state).toBe(s);
    expect(r.rejectionReason).toMatch(/maximum safe step count/);
  });

  it("actionEquals compares structurally", () => {
    expect(actionEquals(MICRO_ACTIONS.takeTorch, { type: "TAKE", item: "torch" })).toBe(true);
    expect(actionEquals(MICRO_ACTIONS.takeTorch, MICRO_ACTIONS.grabGold)).toBe(false);
  });
});

// decorateEvents is the engine's only extension seam, and its contract says the hook
// is pure. The engine used to hand it the live array it was about to return, so the
// contract was a promise the hook had to keep rather than a property the engine held.
// microRules ships no decorateEvents, so each case supplies its own by spread.
describe("engine.step decorateEvents seam (contract is enforced, not trusted)", () => {
  const takeTorch = (rules: typeof microRules): ReturnType<ReturnType<typeof makeStep>> =>
    makeStep(rules)(microInitState(), MICRO_ACTIONS.takeTorch);

  const baseline = takeTorch(microRules);

  it("baseline: the plain step produces at least one event", () => {
    expect(baseline.ok).toBe(true);
    expect(baseline.events.length).toBeGreaterThan(0);
  });

  it("a decorator that clears its argument cannot erase the step's events", () => {
    const r = takeTorch({
      ...microRules,
      decorateEvents: (events) => {
        events.length = 0;
        return [{ type: "narration", text: "chrome" }];
      },
    });
    expect(r.ok).toBe(true);
    expect(r.events.slice(0, baseline.events.length)).toEqual(baseline.events);
    expect(r.events.at(-1)).toEqual({ type: "narration", text: "chrome" });
  });

  it("a decorator that pushes into its argument cannot smuggle an event through", () => {
    const r = takeTorch({
      ...microRules,
      decorateEvents: (events) => {
        events.push({ type: "narration", text: "smuggled" });
        return [];
      },
    });
    expect(r.ok).toBe(true);
    expect(r.events).toEqual(baseline.events);
  });

  it("a decorator that returns its own argument appends nothing (no duplication)", () => {
    const r = takeTorch({ ...microRules, decorateEvents: (events) => events });
    expect(r.ok).toBe(true);
    expect(r.events).toEqual(baseline.events);
  });

  it("a well-behaved decorator still appends, last, after the action's own narration", () => {
    const r = takeTorch({
      ...microRules,
      decorateEvents: (events) => [
        { type: "narration", text: `saw ${String(events.length)} events` },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.events).toEqual([
      ...baseline.events,
      { type: "narration", text: `saw ${String(baseline.events.length)} events` },
    ]);
  });
});
