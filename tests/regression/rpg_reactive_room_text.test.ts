/**
 * Regression (§15) for bug_0011 — stale room text contradicted changed state in
 * the RPG pack The Sunken Barrow.
 *
 * A blind MCP playtester (ai-runs/2026-06-01T06-31-55-193Z, seed 11) solved the
 * barrow to ending_victory and flagged — as its top finding, hit twice — that two
 * rooms kept narrating the world as it was BEFORE the player changed it (report §5):
 *   - Guard Crypt still read "An archway east is choked with the cold the thing
 *     gives off" AFTER the barrow-wight was slain and the journal said the cold
 *     had lifted from the east arch.
 *   - Slab Passage still read "a great stone slab set flush with the floor" AFTER
 *     a successful might check levered it aside and bared the stair down.
 *
 * This is the same class fixed for the parser pack in bug_0010, and the engine
 * already carries the generic feature: rooms may declare reactive `variants`
 * ({ when, text }); the first whose conditions hold replaces the base description,
 * read identically by the observation builder and the LOOK action. The fix here is
 * pure CONTENT — one variant on each of the two rooms — so it changes only narrated
 * text, never flags/items/exits/gating/reachable endings.
 *
 * Locked here:
 *   (1) Guard Crypt flips from the cold-choked text to the cold-lifted text once
 *       the wight is slain, and never again claims the arch is choked with cold;
 *   (2) Slab Passage flips from the flush-slab text to the levered-aside text once
 *       the slab is moved, and never again claims the slab lies flush;
 *   (3) a room with no variants (Barrow Mouth) returns its base description
 *       byte-identically (backward-compat: rooms that don't opt in are unaffected).
 */
import { describe, it, expect } from "vitest";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { roomDescription } from "../../src/parser/model.js";
import { makeStep, actionEquals } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadRpgPackFile("content/rpg/pack/sunken_barrow.yaml");
if (!loaded.ok) throw new Error("sunken_barrow must compile");
const index = indexRpgPack(loaded.compiled.pack);
const rules = buildRpgRules(index);
const step = makeStep(rules);

/** Issue an action, asserting it was legal first (legal ⊇ executable). */
function act(state: GameState, action: Action): GameState {
  const legal = rules.legalActions(state).some((a) => actionEquals(a, action));
  expect(legal, `action ${JSON.stringify(action)} must be legal in ${state.current}`).toBe(true);
  const r = step(state, action);
  expect(r.ok).toBe(true);
  return r.state;
}

const desc = (s: GameState): string => buildRpgObservation(index, s).description;

describe("bug_0011 — reactive room text replaces stale descriptions in the barrow", () => {
  it("Guard Crypt flips from cold-choked to cold-lifted once the wight is slain", () => {
    let s = initStateForRpgPack(index, 1);
    s = act(s, { type: "MOVE", direction: "down" }); // entry_hall
    s = act(s, { type: "TAKE", item: "iron_bar" });
    s = act(s, { type: "MOVE", direction: "north" }); // guard_crypt
    // Before the fight: the base description still narrates the wight's cold.
    expect(s.current).toBe("guard_crypt");
    expect(desc(s)).toContain("choked with the cold");

    for (let i = 0; i < 40 && !s.ended && !s.flags["wight_slain"]; i++) {
      s = act(s, { type: "ATTACK", enemy: "barrow_wight" });
    }
    expect(s.flags["wight_slain"]).toBe(true);
    expect(s.ended).toBe(false);
    expect(s.current).toBe("guard_crypt");
    // After: the variant takes over; the contradiction is gone.
    expect(desc(s)).toContain("The cold has lifted");
    expect(desc(s)).not.toContain("choked with the cold");
  });

  it("Slab Passage flips from flush-slab to levered-aside once the slab is moved", () => {
    let s = initStateForRpgPack(index, 1);
    s = act(s, { type: "MOVE", direction: "down" });
    s = act(s, { type: "TAKE", item: "iron_bar" });
    s = act(s, { type: "MOVE", direction: "north" });
    for (let i = 0; i < 40 && !s.ended && !s.flags["wight_slain"]; i++) {
      s = act(s, { type: "ATTACK", enemy: "barrow_wight" });
    }
    s = act(s, { type: "MOVE", direction: "east" }); // slab_passage
    // Before levering: the base description still narrates the slab flush.
    expect(s.current).toBe("slab_passage");
    expect(desc(s)).toContain("set flush with the floor");

    for (let i = 0; i < 40 && s.questStage["barrow"] !== "slab_moved"; i++) {
      s = act(s, { type: "USE", item: "iron_bar", target: "stone_slab" });
    }
    expect(s.questStage["barrow"]).toBe("slab_moved");
    expect(s.ended).toBe(false);
    expect(s.current).toBe("slab_passage");
    // After: the variant takes over; the slab now reads as moved, stair bared.
    expect(desc(s)).toContain("Levered aside now");
    expect(desc(s)).not.toContain("set flush with the floor");
  });

  it("a room with no variants returns its base description unchanged (backward-compat)", () => {
    const s0 = initStateForRpgPack(index, 1);
    const mouth = index.rooms.get("barrow_mouth")!;
    expect(mouth.variants).toBeUndefined();
    expect(roomDescription(mouth, s0)).toBe(mouth.description);
    expect(desc(s0)).toBe(mouth.description);
  });
});
