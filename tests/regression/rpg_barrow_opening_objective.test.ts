/**
 * Regression (§15) for bug_0037 — The Sunken Barrow's opening room (barrow_mouth)
 * gave the player NO objective: the goal (the Barrow-Lord's circlet) was named only
 * in the final room, so a first-timer descended without knowing what they were after.
 *
 * A fresh, MCP-only blind playtester (seed 99, ai-runs/2026-06-01T11-40-54-593Z)
 * cleared the pack flawlessly but reported the goal was "implicit" — corroborating a
 * finding deferred since bug_0015 deferred[2] / bug_0027 deferred[1].
 *
 * The fix is CONTENT-only (no engine/validator/flag/item/exit/gating/scoring change):
 * barrow_mouth's description now orients the player at the entrance — it names the
 * place (the Sunken Barrow), the prize (the Barrow-Lord's circlet), and the motive
 * (you came to take it) while preserving the original "the only way ... is down" beat.
 *
 * Locked here:
 *   (a) the opening room text names the goal (circlet / Barrow-Lord) and frames it as
 *       what the player came for, and still funnels them downward;
 *   (b) reachability/balance unchanged — the canonical seed-1 route still levers the
 *       slab and reaches ending_victory at full score.
 */
import { describe, it, expect } from "vitest";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import { makeStep } from "../../src/core/engine.js";
import type { RpgAction } from "../../src/api/types.js";

const loaded = loadRpgPackFile("content/rpg/pack/sunken_barrow.yaml");
if (!loaded.ok) throw new Error("sunken_barrow must compile");
const index = indexRpgPack(loaded.compiled.pack);
const pack = loaded.compiled.pack;
const rules = buildRpgRules(index);
const step = makeStep(rules);

const startRoom = pack.rooms.find((r) => r.id === "barrow_mouth")!;
const startText = startRoom.description.toLowerCase();

describe("bug_0037 — the Barrow Mouth opens with a clear objective", () => {
  it("the opening room names the goal (the Barrow-Lord's circlet) and frames it as the player's aim", () => {
    // The prize is named up front, not held back to the relic chamber.
    expect(startText).toContain("circlet");
    expect(startText).toMatch(/barrow-lord/);
    // It reads as the player's objective, not mere scenery.
    expect(startText).toMatch(/came|take/);
    // The original orientation beat — the only way is down — is preserved.
    expect(startText).toContain("down");
  });

  it("reachability/balance intact — the canonical seed-1 route still wins at full score", () => {
    let s = initStateForRpgPack(index, 1);
    const toSlab: RpgAction[] = [
      { type: "MOVE", direction: "down" },
      { type: "TAKE", item: "iron_bar" },
      { type: "MOVE", direction: "north" },
    ];
    for (const a of toSlab) {
      const r = step(s, a);
      expect(r.ok).toBe(true);
      s = r.state;
    }
    for (let i = 0; i < 40 && !s.ended && !s.flags["wight_slain"]; i++) {
      const r = step(s, { type: "ATTACK", enemy: "barrow_wight" });
      expect(r.ok).toBe(true);
      s = r.state;
    }
    expect(s.ended).toBe(false);
    const east = step(s, { type: "MOVE", direction: "east" });
    expect(east.ok).toBe(true);
    s = east.state;
    const lever = step(s, { type: "USE", item: "iron_bar", target: "stone_slab" });
    expect(lever.ok).toBe(true);
    s = lever.state;
    expect(s.questStage["barrow"]).toBe("slab_moved");
    const down = step(s, { type: "MOVE", direction: "down" });
    expect(down.ok).toBe(true);
    // Entering the chamber no longer auto-wins (bug_0056) — the win is the claim.
    expect(down.state.ended).toBe(false);
    s = down.state;
    const claim = step(s, { type: "TAKE", item: "circlet" });
    expect(claim.ok).toBe(true);
    expect(claim.state.ended).toBe(true);
    expect(claim.state.endingId).toBe("ending_victory");
    expect(claim.state.vars["score"]).toBe(pack.meta.max_score);
  });
});
