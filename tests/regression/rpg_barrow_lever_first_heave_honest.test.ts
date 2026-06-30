/**
 * Regression (§15) for bug_0069 — the slab's base examine in The Sunken Barrow
 * over-promised an iterative grind that the mechanic does not deliver.
 *
 * A fresh, MCP-only blind playtester (seed 13, ai-runs/2026-06-01T18-34-30-790Z,
 * rotated off the mandated clockwork target) levered the slab on the FIRST use, then
 * noted the examine — "not by one heroic effort, but ... heaving again and again
 * until the old stone gives" — flatly promised a multi-heave grind that never
 * happened, and contradicted the single-heave on_success line "you heave — and the
 * slab grinds aside". The lever is a single seeded d20 + might(=3) vs DC 12 that
 * succeeds ~60% on the first attempt, so "again and again" is false on the common path.
 *
 * The fix is CONTENT-only (no engine/validator/DC/skill/effect/gating change). The base
 * description now reads true on BOTH paths — "it may give on the first heave or take
 * several" — while STRENGTHENING bug_0027's two load-bearing signals: persistence (so a
 * player who DOES fail still reads "keep at it") and anti-strength-threshold ("leverage —
 * not raw strength", so no one hunts a non-existent strength item).
 *
 * This test guards the NEW invariant (first-heave honesty + retained persistence/anti-
 * strength cues + unchanged success/failure mechanics). bug_0027's and bug_0047's own
 * tests continue to guard their invariants; the three are complementary.
 */
import { describe, it, expect } from "vitest";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import { makeStep } from "../../src/core/engine.js";
import type { RpgAction } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";
import type { Effect } from "../../src/core/effects.js";

const loaded = loadRpgPackFile("content/rpg/pack/sunken_barrow.yaml");
if (!loaded.ok) throw new Error("sunken_barrow must compile");
const index = indexRpgPack(loaded.compiled.pack);
const pack = loaded.compiled.pack;
const rules = buildRpgRules(index);
const step = makeStep(rules);

const LEVER: RpgAction = { type: "USE", item: "iron_bar", target: "stone_slab" };

const narrations = (effects: readonly Effect[]): string[] =>
  effects
    .filter((e): e is { narrate: string } => "narrate" in e)
    .map((e) => (e as { narrate: string }).narrate);

const slabDescription = pack.objects.find((o) => o.id === "stone_slab")!.description;

/** Reach the slab passage (bar in hand, wight slain, slab not yet moved) at `seed`. */
function atSlab(seed: number): GameState {
  let s = initStateForRpgPack(index, seed);
  const path: RpgAction[] = [
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

describe("bug_0069 — the slab's base examine is honest about the single-heave success path", () => {
  it("no longer flatly promises a multi-heave grind ('heroic effort' / 'again and again')", () => {
    const d = slabDescription.toLowerCase();
    expect(d).not.toContain("again and again");
    expect(d).not.toContain("heroic effort");
    // It must still concede the slab CAN give on the first attempt (the ~60% path).
    expect(d).toMatch(/first heave|on the first|may give/);
  });

  it("still carries bug_0027's persistence cue and never implies a strength wall", () => {
    const d = slabDescription.toLowerCase();
    // persistence (a failing player must still read "keep going") …
    expect(d).toMatch(/again and again|persist|stubborn|keep|or take/);
    // … but NOT as a fixed strength threshold / missing-item dead end.
    expect(d).not.toMatch(/real might|not strong enough|need more/);
    expect(d).toContain("leverage");
  });

  it("the success mechanic is unchanged — seed 1 levers on the first heave and wins 50/50", () => {
    let s = atSlab(1);
    expect(narrations(rules.resolve(s, LEVER)!.effects)[0]).toContain("success");
    const lever = step(s, LEVER);
    expect(lever.ok).toBe(true);
    s = lever.state;
    expect(s.questStage["barrow"]).toBe("slab_moved");
    const down = step(s, { type: "MOVE", direction: "down" });
    expect(down.ok).toBe(true);
    const claim = step(down.state, { type: "TAKE", item: "circlet" });
    expect(claim.ok).toBe(true);
    expect(claim.state.ended).toBe(true);
    expect(claim.state.endingId).toBe("ending_victory");
    expect(claim.state.vars["score"]).toBe(pack.meta.max_score);
  });

  it("the failure mechanic is unchanged — seed 3 first lever fails penalty-free and stays retryable", () => {
    // seed 3 survives the wight under-armed (bug_0102 retune hp22/atk5/def2) AND its
    // first lever roll fails — verified live; the on_failure effects are seed-independent.
    const s = atSlab(3);
    const res = rules.resolve(s, LEVER);
    expect(res).not.toBeNull();
    const ns = narrations(res!.effects).join(" ").toLowerCase();
    expect(ns).toContain("failure");
    expect(ns).toMatch(/heave again|keep at it/); // bug_0027 retry guidance still shown
    const r = step(s, LEVER);
    expect(r.ok).toBe(true);
    expect(r.state.questStage["barrow"]).not.toBe("slab_moved");
    expect(r.state.current).toBe("slab_passage");
    expect(r.state.ended).toBe(false);
  });
});
