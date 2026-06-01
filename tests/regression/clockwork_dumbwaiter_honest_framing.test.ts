/**
 * Regression (§15) for bug_0046 — *The Clockwork Heist*'s `dumbwaiter` choice
 * (kitchen → gallery) was framed as a clever stealth bypass ("Ride the dumbwaiter
 * up to the gallery") but is mechanically identical to climbing the grand stair: it
 * deposits you on the exact same patrolled gallery, charging the same gallery tick.
 * A fresh, MCP-only blind playtester (seed 101, report
 * ai-runs/2026-06-01T13-42-28-631Z/playtest.md, §4/§5) reached all three endings,
 * rated the pack clarity 5/5 / enjoyment 4/5 with zero bugs, and surfaced exactly
 * one concrete soft spot: the dumbwaiter "is framed like a clever stealth bypass but
 * is mechanically identical to the stairs ... a curious player will try it expecting
 * an alternate/safer route and get nothing different."
 *
 * The fix is content-only and honest-reframing only: the choice text + a new
 * `narrate` effect name the dumbwaiter the cramped servants' lift — a quieter, more
 * direct way up from the kitchens that "leaves you no closer to the vault than the
 * open steps would." It deliberately does NOT become a mechanical bypass: a real
 * stealth route past the watchman would duplicate the load-bearing ledger clue
 * (bug_0040 tuned the ledger to be the *only* safe late crossing), so the right fix
 * is to stop the prose over-promising, not to add a second safe route. The choice
 * still routes to `landing`; no tick/flag/item/gating/reachable-ending change.
 *
 * Locked here:
 *   (1) the dumbwaiter still goes kitchen -> landing and now emits the honest
 *       servants'-lift narration (no "stealth bypass" over-promise);
 *   (2) it is NOT a mechanical shortcut — arriving via the dumbwaiter lands you in
 *       the same scene at the same tick count as arriving via the grand stair;
 *   (3) reachability/gating unchanged — gold->rich and letter->truth via the
 *       dumbwaiter route, force->caught via the stair, crawlspace truth unaffected.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";
import type { GameEvent } from "../../src/core/events.js";

const loaded = loadPackFile("content/cyoa/pack/clockwork_heist.yaml");
if (!loaded.ok) throw new Error("clockwork_heist pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

function play(ids: string[]): GameState {
  const step = makeStep(rules);
  let s = initStateForPack(index, 101);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}

// Like play(), but returns the events emitted by the FINAL step too.
function playCapturing(ids: string[]): { state: GameState; events: GameEvent[] } {
  const step = makeStep(rules);
  let s = initStateForPack(index, 101);
  let events: GameEvent[] = [];
  for (const id of ids) {
    const r = step(s, choose(id));
    s = r.state;
    events = r.events;
  }
  return { state: s, events };
}

const narration = (events: GameEvent[]) =>
  events
    .filter((e): e is Extract<GameEvent, { type: "narration" }> => e.type === "narration")
    .map((e) => e.text)
    .join(" ");

// Up to the gallery the two ways: the servants' lift vs. doubling back to the stair.
const VIA_DUMBWAITER = ["kitchens", "take_pick", "dumbwaiter"];
const VIA_STAIR = ["kitchens", "take_pick", "back_foyer", "climb_stairs"];

describe("bug_0046 — the dumbwaiter is honestly framed (a quieter way up, not a fake stealth bypass)", () => {
  it("still goes kitchen -> landing and narrates the cramped servants' lift", () => {
    const { state, events } = playCapturing(VIA_DUMBWAITER);
    expect(state.current).toBe("landing");
    const text = narration(events).toLowerCase();
    expect(text).toContain("servants' lift");
    // The over-promise is gone: the prose explicitly tells you it is no shortcut.
    expect(text).toContain("no closer to the vault");
    // ...and the old "Ride the dumbwaiter up" stealth-bypass framing is retired.
    const dumbwaiter = index.pack.scenes
      .find((sc) => sc.id === "kitchen")!
      .choices!.find((c) => c.id === "dumbwaiter")!;
    expect(dumbwaiter.text.toLowerCase()).not.toBe("ride the dumbwaiter up to the gallery.");
    expect(dumbwaiter.text.toLowerCase()).toContain("servants' dumbwaiter");
  });

  it("is NOT a mechanical bypass — same scene and same tick count as the grand stair", () => {
    const lift = play(VIA_DUMBWAITER);
    const stair = play(VIA_STAIR);
    expect(lift.current).toBe("landing");
    expect(stair.current).toBe("landing");
    // Identical clock cost: the lift saves a move, never a tick, and lands you on the
    // same patrolled gallery — so it cannot cheat the watchman/ledger tuning.
    expect(lift.vars.ticks).toBe(stair.vars.ticks);
    expect(lift.vars.ticks).toBe(2);
  });

  it("reachability/gating unchanged — endings still fire across routes", () => {
    expect(play([...VIA_DUMBWAITER, "approach_vault", "pick_lock", "grab_gold"]).endingId).toBe(
      "ending_rich",
    );
    expect(play([...VIA_DUMBWAITER, "approach_vault", "pick_lock", "take_letter"]).endingId).toBe(
      "ending_truth",
    );
    expect(play(["climb_stairs", "approach_vault", "force_door"]).endingId).toBe("ending_caught");
    // The crawlspace truth route never touches the dumbwaiter and is unaffected.
    expect(
      play(["inspect_clock", "kitchens", "take_pick", "back_foyer", "pry_panel", "open_strongbox"])
        .endingId,
    ).toBe("ending_truth");
  });
});
