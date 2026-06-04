/**
 * Regression (§15) for bug_0232 — blind-playtest polish for The Tide-Mill
 * (content/parser/pack/tide_mill.yaml, seed 23). A fresh blind playtester won the pack
 * 45/45 with clarity 5/5 and reached all three endings, flagging two narration-vs-state
 * honesty flaws (neither affecting winnability):
 *
 *  (1) PRIMARY — STALE WHEEL-ROOM DESCRIPTION. The base room text named BOTH faults as
 *      still wrong ("its brake-pawl is dropped and locked into the gear, and the race that
 *      should drive it runs choked and slack"), and the pack carried only a gate_up variant
 *      — so after freeing the pawl AND/OR clearing the race the Wheel-Room kept asserting
 *      the faults the player had just put right, right up until the gate was wound. The fix
 *      adds intermediate reactive variants (pawl-only / sluice-only / both-fixed) so the
 *      room narrates each solved fault instead of contradicting it (§7.3).
 *
 *  (2) SECONDARY — STALE OBJECT NAME. The cleared head-race object kept its "choked
 *      head-race" NAME in visible_objects + the enumerated examine command after it was
 *      cut, though its examine TEXT and the room prose updated. The fix is the bug_0188
 *      reactive-name override: the sluice_clear variant now also carries name "head-race".
 *
 * Locked BEHAVIOURALLY on the REAL pack surfaces via buildParserObservation, at each flag
 * state the player actually stands in — so this pins the variant-resolved text/name a live
 * player sees, not the raw YAML. max_score stays 45; reachability/score-economy/liveness
 * are re-proven by the auto-discovered generic bar (tide_mill_nonlinear.test.ts + the
 * all_packs bar).
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import { indexParserPack, initStateForParserPack } from "../../src/parser/runner.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadParserPackFile("content/parser/pack/tide_mill.yaml");
if (!loaded.ok) throw new Error("tide_mill must compile");
const pack = loaded.compiled.pack;
const index = indexParserPack(pack);

/** A state standing in `room` with the given flags set — the only inputs the reactive
 *  room text / object names key on (sluice_clear / pawl_free / gate_up). Built directly:
 *  this regression is about text/name RENDERING at a known flag state, not the play route
 *  (which tide_mill_nonlinear.test.ts proves end to end). */
function inRoom(room: string, flags: Record<string, boolean>): GameState {
  const s = initStateForParserPack(index, 1);
  return { ...s, current: room, flags: { ...s.flags, ...flags } };
}

const roomText = (s: GameState): string => buildParserObservation(index, s).description;
const objName = (s: GameState, id: string): string | undefined =>
  buildParserObservation(index, s).visible_objects.find((o) => o.id === id)?.name;

// The two fault-claims the base Wheel-Room text carries — the regression witnesses. Loose
// enough to match the variant phrasings too ("still dropped and locked"), so a variant that
// honestly KEEPS a still-unfixed fault matches, and one that drops a fixed fault does not.
const PAWL_FAULT = /dropped and locked/i;
const RACE_FAULT = /runs choked and slack/i;

describe("bug_0232 — The Tide-Mill blind polish: the Wheel-Room stops contradicting solved faults", () => {
  it("the base Wheel-Room (no faults fixed) still names BOTH faults as wrong (witness)", () => {
    const text = roomText(inRoom("wheel_room", {}));
    expect(text).toMatch(PAWL_FAULT); // pawl dropped & locked
    expect(text).toMatch(RACE_FAULT); // race choked & slack
  });

  it("after freeing ONLY the pawl, the room no longer calls the pawl locked (race still choked)", () => {
    const text = roomText(inRoom("wheel_room", { pawl_free: true }));
    expect(text).not.toMatch(PAWL_FAULT); // the just-fixed fault is gone…
    expect(text).toMatch(/levered up clear/i); // …and the room says so
    expect(text).toMatch(RACE_FAULT); // the still-unfixed race is honestly still choked
  });

  it("after clearing ONLY the race, the room no longer calls the race choked (pawl still locked)", () => {
    const text = roomText(inRoom("wheel_room", { sluice_clear: true }));
    expect(text).not.toMatch(RACE_FAULT); // the just-fixed fault is gone…
    expect(text).toMatch(/freed race running/i); // …and the room says so
    expect(text).toMatch(PAWL_FAULT); // the still-unfixed pawl is honestly still locked
  });

  it("with BOTH faults fixed (gate not yet wound) the room asserts neither fault, and reads ready", () => {
    const text = roomText(inRoom("wheel_room", { sluice_clear: true, pawl_free: true }));
    expect(text).not.toMatch(PAWL_FAULT);
    expect(text).not.toMatch(RACE_FAULT);
    expect(text).toMatch(/both faults put right/i);
    expect(text).toMatch(/wheel turns free/i); // the wheel is now driving the gear
    expect(text).not.toMatch(/wound fully up/i); // …but the gate is NOT yet wound (that is gate_up)
  });

  it("the existing gate_up climax variant still wins out as the most-specific match", () => {
    const text = roomText(
      inRoom("wheel_room", { sluice_clear: true, pawl_free: true, gate_up: true }),
    );
    expect(text).toMatch(/wound fully up/i); // the climax text, not the both-fixed text
    expect(text).toMatch(/way down to the staith/i);
  });

  it("the cleared head-race object drops 'choked' from its NAME once cut (reactive name)", () => {
    expect(objName(inRoom("head_race", {}), "choked_sluice")).toBe("choked head-race");
    const cleared = objName(inRoom("head_race", { sluice_clear: true }), "choked_sluice");
    expect(cleared).toBe("head-race");
    expect(cleared).not.toMatch(/choked/i); // no longer contradicts the cleared prose
  });
});
