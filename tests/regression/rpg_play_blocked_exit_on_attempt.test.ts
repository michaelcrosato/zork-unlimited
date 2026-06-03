/**
 * Regression (§15) for bug_0207 — the RPG CLI's ON-ATTEMPT message reaches parity
 * with the parser CLI's. bug_0201 surfaced a barred exit's authored `locked_msg` in
 * the structured `blocked_exits` hint (agent surface); bug_0206 rendered that hint on
 * the human surfaces (CLI bins + UI). But one human path stayed generic: when a player
 * actually TYPED a move onto a barred exit, `bin/parser_play.ts` answered with the
 * exit's `locked_msg` (via illegalReason), while `bin/rpg_play.ts` printed a flat
 * "You can't do that right now." — dropping the very string the author wrote to explain
 * the wall. This pins the RPG bin's `illegalReason` to the parser bin's behaviour.
 *
 * WITNESS: drives the REAL sunken_barrow pack through the REAL engine to guard_crypt
 * with the wight alive (its east exit barred), then asserts illegalReason() for a MOVE
 * east returns the authored locked_msg — paired with negatives (an ATTACK and a
 * non-existent direction fall back to the flat message). Reverting the fix (the flat
 * string at the call site / helper) fails the positive case — not vacuous green.
 */
import { describe, it, expect } from "vitest";
import { illegalReason } from "../../bin/rpg_play.js";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadRpgPackFile("content/rpg/pack/sunken_barrow.yaml");
if (!loaded.ok) throw new Error("sunken_barrow must compile");
const index = indexRpgPack(loaded.compiled.pack);
const step = makeStep(buildRpgRules(index));
const WIGHT_MSG = "The barrow-wight bars the way; you cannot pass while it stands.";

function move(s: GameState, direction: string): GameState {
  const r = step(s, { type: "MOVE", direction } as Action);
  expect(r.ok, `move ${direction} in ${s.current}`).toBe(true);
  return r.state;
}

describe("bug_0207 — RPG CLI on-attempt message surfaces a barred exit's locked_msg", () => {
  it("a typed MOVE onto the barred east at guard_crypt returns the authored locked_msg", () => {
    let s = initStateForRpgPack(index, 1);
    s = move(s, "down"); // barrow_mouth → entry_hall
    s = move(s, "north"); // entry_hall → guard_crypt
    expect(s.current).toBe("guard_crypt");
    expect(s.flags["wight_slain"]).not.toBe(true);
    // east is present-but-barred while the wight stands (the action set hides it).
    expect(illegalReason(index, s, { type: "MOVE", direction: "east" } as Action)).toBe(WIGHT_MSG);
  });

  it("falls back to the generic message for a non-MOVE illegal action and a non-existent direction", () => {
    let s = initStateForRpgPack(index, 1);
    s = move(s, "down");
    s = move(s, "north");
    // An ATTACK is not a MOVE → generic.
    expect(illegalReason(index, s, { type: "ATTACK", enemy: "barrow_wight" } as Action)).toBe(
      "You can't do that right now.",
    );
    // A direction with no exit at all → generic (no false locked_msg).
    expect(illegalReason(index, s, { type: "MOVE", direction: "up" } as Action)).toBe(
      "You can't do that right now.",
    );
  });

  it("once the barred way clears, the move is legal and no locked_msg is owed there", () => {
    // After the wight falls the east exit's conditions are met, so illegalReason would
    // never be consulted for it; assert the exit is no longer condition-blocked.
    let s = initStateForRpgPack(index, 1);
    s = move(s, "down");
    s = move(s, "north");
    // Drive combat to slay the wight (seed 1 is the acceptance-proven survivable seed).
    let guard = 0;
    while (!s.flags["wight_slain"] && guard++ < 50) {
      const r = step(s, { type: "ATTACK", enemy: "barrow_wight" } as Action);
      expect(r.ok).toBe(true);
      s = r.state;
    }
    expect(s.flags["wight_slain"]).toBe(true);
    // east's conditions are now MET (the move itself is legal), so the helper no longer
    // owes a locked_msg there — it falls through to the generic line. The author's wall
    // text is surfaced ONLY while the way is genuinely barred, never after it clears.
    const eastExit = index.rooms.get("guard_crypt")?.exits.find((e) => e.direction === "east");
    expect(eastExit).toBeTruthy();
    expect(illegalReason(index, s, { type: "MOVE", direction: "east" } as Action)).toBe(
      "You can't do that right now.",
    );
  });
});
