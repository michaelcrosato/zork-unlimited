/**
 * Regression (§15) for bug_0047 — stale OBJECT examine on the moved slab in The
 * Sunken Barrow's Slab Passage.
 *
 * A fresh, MCP-only blind playtester (seed 59, ai-runs/2026-06-01T13-52-40-224Z,
 * rotated off the mandated clockwork target) solved the lever puzzle and then ran
 * `look at stone slab` — and got the PRE-MOVE text back: "Wedge the bar beneath the
 * lip and it can be levered … heaving again and again until the old stone gives."
 * That instructs the player to lever a slab that is already open, directly
 * contradicting the room, which correctly flips to "Levered aside now … it has bared
 * a stair" on the `slab_moved` quest stage. Same stale-state class as
 * bug_0007/0010/0028/0039/0044, but on the slab OBJECT's examine rather than the
 * room: the room had its reactive `variant` (bug_0011), the object never did.
 *
 * Fix (content): the stone_slab object gains ONE reactive `variant` gated on the same
 * `quest_stage barrow/slab_moved` the room variant uses — once the slab is levered,
 * the examine reads it bared-and-angled with a stair beneath, never the "wedge the
 * bar and heave" instruction. Examine-only: no engine/validator/schema/flag/item/
 * score/exit/interaction/gating/reachable-ending change. The lever's one-shot retire
 * (bug_0015) and the seeded might check (bug_0027) are untouched.
 *
 * Locked here:
 *   (a) before levering, `look at stone slab` reads the base "wedge the bar … heave"
 *       instruction (the puzzle is still unsolved);
 *   (b) after levering, the examine flips to the levered-aside text and NO LONGER
 *       tells the player to wedge the bar / heave — it agrees with the room;
 *   (c) the variant is purely cosmetic: examining changes no state, and the canonical
 *       seed-1 route still levers the slab and reaches ending_victory at full score.
 */
import { describe, it, expect } from "vitest";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";
import type { Effect } from "../../src/core/effects.js";

const loaded = loadRpgPackFile("content/rpg/pack/sunken_barrow.yaml");
if (!loaded.ok) throw new Error("sunken_barrow must compile");
const index = indexRpgPack(loaded.compiled.pack);
const pack = loaded.compiled.pack;
const rules = buildRpgRules(index);
const step = makeStep(rules);

const LEVER: Action = { type: "USE", item: "iron_bar", target: "stone_slab" };
const EXAMINE_SLAB: Action = { type: "LOOK", target: "stone_slab" };

const narrations = (effects: readonly Effect[]): string[] =>
  effects
    .filter((e): e is { narrate: string } => "narrate" in e)
    .map((e) => (e as { narrate: string }).narrate);

/** The text the explicit `look at stone slab` examine emits in this state. */
function examineSlab(s: GameState): string {
  const res = rules.resolve(s, EXAMINE_SLAB);
  expect(res, "look at stone slab must resolve").not.toBeNull();
  const text = narrations(res!.effects).join(" ");
  expect(text.length, "examine must produce narration").toBeGreaterThan(0);
  return text;
}

const roomDesc = (s: GameState): string => buildRpgObservation(index, s).description;

/** Reach the slab passage (bar in hand, wight slain, slab not yet moved) at `seed`. */
function atSlab(seed: number): GameState {
  let s = initStateForRpgPack(index, seed);
  const path: Action[] = [
    { type: "MOVE", direction: "down" },
    { type: "TAKE", item: "iron_bar" },
    { type: "MOVE", direction: "north" },
  ];
  for (const a of path) {
    const r = step(s, a);
    expect(r.ok).toBe(true);
    s = r.state;
  }
  for (let i = 0; i < 40 && !s.ended && !s.flags["wight_slain"]; i++) {
    const r = step(s, { type: "ATTACK", enemy: "barrow_wight" });
    expect(r.ok).toBe(true);
    s = r.state;
  }
  expect(s.ended, `player must survive the wight at seed ${seed}`).toBe(false);
  const east = step(s, { type: "MOVE", direction: "east" });
  expect(east.ok).toBe(true);
  s = east.state;
  expect(s.current).toBe("slab_passage");
  expect(s.questStage["barrow"]).not.toBe("slab_moved");
  return s;
}

describe("bug_0047 — the stone slab's examine reacts to being levered aside", () => {
  it("before levering, the examine reads the base 'wedge the bar and heave' instruction", () => {
    const s = atSlab(1);
    const text = examineSlab(s).toLowerCase();
    expect(text).toContain("wedge the bar");
    expect(text).toMatch(/heaving again and again|until the old stone gives/);
    // It must NOT yet claim the slab is open.
    expect(text).not.toContain("levered aside");
  });

  it("after levering, the examine flips to the levered-aside text and no longer instructs to wedge/heave", () => {
    let s = atSlab(1); // seed 1 (the canonical trace seed): first lever succeeds
    expect(narrations(rules.resolve(s, LEVER)!.effects)[0]).toContain("success");
    const lever = step(s, LEVER);
    expect(lever.ok).toBe(true);
    s = lever.state;
    expect(s.questStage["barrow"]).toBe("slab_moved");

    const text = examineSlab(s).toLowerCase();
    // The stale instruction is gone — no contradiction with the just-solved puzzle.
    expect(text).toContain("levered aside");
    expect(text).toMatch(/stair drops away|bared a stair|a stair/);
    expect(text).not.toContain("wedge the bar");
    expect(text).not.toMatch(/heaving again and again/);
    // …and it agrees with the room, which also reads the slab as moved.
    expect(roomDesc(s).toLowerCase()).toContain("levered aside now");
  });

  it("the slab variant is purely cosmetic — examining changes no state and the seed-1 route still wins 50/50", () => {
    let s = atSlab(1);
    const lever = step(s, LEVER);
    expect(lever.ok).toBe(true);
    s = lever.state;
    expect(s.questStage["barrow"]).toBe("slab_moved");

    // Examining the moved slab must not perturb state (no quest/score/room change).
    const before = JSON.stringify({
      stage: s.questStage["barrow"],
      score: s.vars["score"],
      room: s.current,
    });
    examineSlab(s);
    const after = JSON.stringify({
      stage: s.questStage["barrow"],
      score: s.vars["score"],
      room: s.current,
    });
    expect(after).toBe(before);

    const down = step(s, { type: "MOVE", direction: "down" });
    expect(down.ok).toBe(true);
    expect(down.state.ended).toBe(false); // the win is the claim, not entry (bug_0056)
    const claim = step(down.state, { type: "TAKE", item: "circlet" });
    expect(claim.ok).toBe(true);
    expect(claim.state.ended).toBe(true);
    expect(claim.state.endingId).toBe("ending_victory");
    expect(claim.state.vars["score"]).toBe(pack.meta.max_score);
  });
});
