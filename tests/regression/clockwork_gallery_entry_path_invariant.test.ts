/**
 * Regression (§15) for bug_0144 — the gallery's reactive text is a pure function of
 * STATE (ticks/flags), not of the ENTRY PATH, in clockwork_heist.
 *
 * A blind MCP playtester (seed 23) reached three endings, rated the pack 5/5 clarity,
 * and reported ONE concrete "bug": the gallery (`landing`) seemed to show different
 * text depending on whether you arrived via the dumbwaiter or the grand stairs. That is
 * a FALSE positive — verified live via MCP. The `landing` scene advances `ticks` on
 * entry and renders a tick-gated variant, so two visits at different tick counts read
 * differently; the tester's two runs merely correlated the dumbwaiter with a higher
 * tick count, and the dumbwaiter's "cramped servants' lift / complaining rope" flavor is
 * a transient narration EVENT for that one step, never part of the room description.
 *
 * This locks the invariant so the recurring misread is retired AND a genuine future
 * regression — making the gallery's scene text depend on the entry choice (e.g. by
 * folding the dumbwaiter's lift narration into the persistent room description) — fails.
 * Locked here:
 *   (1) `landing` scene text is byte-identical via the grand stairs vs the dumbwaiter at
 *       the SAME ticks (2), and both carry the ticks>=2 chime warning;
 *   (2) the variant is tick-gated, not path-gated: at ticks 1 (stairs) the bare base
 *       text shows with no chime warning, and at ticks 2 the warning appears;
 *   (3) the dumbwaiter's lift flavor is a transient narration EVENT of that step, never
 *       part of `landing`'s persistent scene text.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";
import type { GameEvent } from "../../src/core/events.js";

const loaded = loadPackFile("content/cyoa/pack/clockwork_heist.yaml");
if (!loaded.ok) throw new Error("clockwork_heist pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

/** Run a list of choice ids from a fresh seed; return the final state AND the events of the LAST step. */
function run(ids: string[], seed = 23): { state: GameState; lastEvents: GameEvent[] } {
  const step = makeStep(rules);
  let s = initStateForPack(index, seed);
  let lastEvents: GameEvent[] = [];
  for (const id of ids) {
    const r = step(s, choose(id));
    s = r.state;
    lastEvents = r.events;
  }
  return { state: s, lastEvents };
}
const sceneText = (s: GameState): string => {
  const o = buildObservation(index, s) as { scene?: { text?: string }; text?: string };
  return o.scene?.text ?? o.text ?? "";
};

const CHIME_WARNING = /no place to be caught standing when it chimes/i;

describe("bug_0144 — the gallery's reactive text is entry-path-invariant (a pure function of ticks)", () => {
  it("landing scene text is byte-identical via the grand stairs vs the dumbwaiter at the same ticks (2)", () => {
    // Stairs route to the gallery at ticks 2: kitchens (tick 1) -> back -> climb_stairs (tick 2).
    const viaStairs = run(["kitchens", "back_foyer", "climb_stairs"]).state;
    // Dumbwaiter route to the gallery at ticks 2: kitchens (tick 1) -> dumbwaiter (tick 2).
    const viaDumbwaiter = run(["kitchens", "dumbwaiter"]).state;

    // Same scene, same tick count via two different entries.
    expect(viaStairs.current).toBe("landing");
    expect(viaDumbwaiter.current).toBe("landing");
    expect(viaStairs.vars.ticks).toBe(2);
    expect(viaDumbwaiter.vars.ticks).toBe(2);

    // The scene text is identical regardless of how you got here...
    expect(sceneText(viaDumbwaiter)).toBe(sceneText(viaStairs));
    // ...and both carry the ticks>=2 chime warning the tester saw.
    expect(CHIME_WARNING.test(sceneText(viaStairs))).toBe(true);
    expect(CHIME_WARNING.test(sceneText(viaDumbwaiter))).toBe(true);
  });

  it("the gallery variant is tick-gated, not path-gated: bare base text at ticks 1, the warning at ticks 2", () => {
    // Straight up the stairs: gallery at ticks 1 -> bare base text, no chime warning.
    const tick1 = run(["climb_stairs"]).state;
    expect(tick1.current).toBe("landing");
    expect(tick1.vars.ticks).toBe(1);
    expect(CHIME_WARNING.test(sceneText(tick1))).toBe(false);
    expect(/grinds toward the hour/i.test(sceneText(tick1))).toBe(false);

    // Same scene, one tick later -> the warning appears. The clock advancing is what
    // flips the text, NOT the door the player came through.
    const tick2 = run(["kitchens", "back_foyer", "climb_stairs"]).state;
    expect(tick2.vars.ticks).toBe(2);
    expect(CHIME_WARNING.test(sceneText(tick2))).toBe(true);
    expect(sceneText(tick2)).not.toBe(sceneText(tick1));
  });

  it("the dumbwaiter's lift flavor is a transient narration EVENT, never part of landing's scene text", () => {
    const { state, lastEvents } = run(["kitchens", "dumbwaiter"]);
    // The lift narration fires as an event on the dumbwaiter step...
    const narrations = lastEvents
      .filter((e): e is Extract<GameEvent, { type: "narration" }> => e.type === "narration")
      .map((e) => e.text)
      .join("\n");
    expect(/complaining rope|servants' lift/i.test(narrations)).toBe(true);
    // ...but it does NOT leak into the gallery's persistent scene description.
    expect(/complaining rope|servants' lift/i.test(sceneText(state))).toBe(false);
  });
});
