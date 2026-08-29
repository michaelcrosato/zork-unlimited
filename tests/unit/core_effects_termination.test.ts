import { describe, it, expect } from "vitest";
import { initState } from "../../src/core/state.js";
import { applyEffects } from "../../src/core/effects.js";
import { makeStep, type EngineAction, type Rules } from "../../src/core/engine.js";

const base = () => initState({ seed: 1, start: "room0" });

/**
 * Termination is a property of the STATE, so the effect reducer has to enforce it.
 * Every ended-guard in the engine sits outside `applyEffects` (next action, on_enter,
 * checkWin), which means each one can only stop the NEXT effect list — never the rest
 * of the list that just ended the game.
 */
describe("effects stop at end_game", () => {
  it("applies nothing after the game ends and keeps the FIRST ending", () => {
    const { state, events } = applyEffects(
      [{ end_game: "died" }, { goto: "room_b" }, { add_item: "sword" }, { end_game: "won" }],
      base(),
    );

    // The ending that actually happened, not the last one authored. Before the
    // short-circuit this state was ended AND in room_b AND carrying a sword, with
    // endingId silently overwritten to "won".
    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("died");
    expect(state.current).toBe("room0");
    expect(state.inventory).toEqual([]);

    // Exactly one ending reaches the player, and it is the last thing they hear.
    expect(events).toEqual([{ type: "ending", endingId: "died" }]);
  });

  it("still emits the terminal effect's own event and everything before it", () => {
    // The break must land AFTER the end_game is applied, or a death narrates nothing.
    const { state, events } = applyEffects(
      [{ narrate: "The gore takes you." }, { end_game: "ending_gored" }],
      base(),
    );

    expect(state.endingId).toBe("ending_gored");
    expect(events).toEqual([
      { type: "narration", text: "The gore takes you." },
      { type: "ending", endingId: "ending_gored" },
    ]);
  });

  it("does not let a decorated resolution mutate a game its own effects just ended", () => {
    // The live composition route: a lethal check's effects, then the dialogue-close
    // `set_var` that withRpgDialogueInterruption appends after ALL of them, then a
    // score award. One step, one reducer pass — the engine's ended-guards never see
    // the boundary in the middle of the list.
    const rules: Rules<EngineAction> = {
      legalActions: () => [{ type: "LEAP" }],
      resolve: () => ({
        conditions: [],
        effects: [
          { narrate: "The span gives under you." },
          { end_game: "ending_swept" },
          { set_var: { name: "__dlg_hedrick", value: 0 } },
          { inc_var: { name: "score", by: 15 } },
        ],
      }),
    };
    const step = makeStep<EngineAction>(rules);

    const result = step(base(), { type: "LEAP" });

    expect(result.ok).toBe(true);
    expect(result.state.ended).toBe(true);
    expect(result.state.endingId).toBe("ending_swept");
    // No post-mortem score, no post-mortem bookkeeping write.
    expect(result.state.vars).toEqual({});
    expect(result.events.filter((event) => event.type === "ending")).toHaveLength(1);
    expect(result.events.at(-1)).toEqual({ type: "ending", endingId: "ending_swept" });
  });
});
