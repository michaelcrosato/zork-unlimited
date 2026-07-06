/**
 * Regression (§15) for bug_0188 — reactive OBJECT NAME, surfaced by a blind playtest
 * of The Dawn Beacon (content/rpg/pack/dawn_beacon.yaml, seed 7).
 *
 * The engine already carried reactive room `variants` (bug_0011) and reactive object
 * examine `variants` (bug_0023) — a thing could narrate state it CHANGED on examine.
 * But its display NAME, shown in `visible_objects` AND baked into every enumerated
 * command ("look at toppled cresset", "lever toppled cresset with iron winch-bar"),
 * stayed frozen at the base `name`. So an object whose name encodes a transient state
 * — Dawn Beacon's "toppled cresset" — kept contradicting a room AND an examine text
 * that had already moved on once the cresset was levered upright. The blind playtester
 * hit exactly this: "the object ... is still named 'toppled cresset' ... after the
 * cresset is righted."
 *
 * The fix closes the asymmetry generically: `ObjectVariantSchema` gains an optional
 * `name`, and `objectName(object, state)` (the name analogue of `objectDescription`)
 * resolves it everywhere the name renders — `visible_objects` and every command label
 * in the legal-action set. Absent the field (every other pack today) the base `name`
 * is used byte-identically, so the change is purely additive. Dawn Beacon's righted
 * cresset variant now also carries `name: "upright cresset"`.
 *
 * Locked here, on the REAL pack's observation surface:
 *   (1) before the cresset is righted, both visible_objects and the examine command
 *       label call it "toppled cresset" (the base name still applies);
 *   (2) once the cresset_raised quest stage holds, the SAME object re-labels itself
 *       "upright cresset" in visible_objects AND in the examine command label, and the
 *       stale "toppled cresset" is gone everywhere;
 *   (3) an object with NO variant name (the orders-board) keeps its base name in both
 *       states — the fallback is intact, so the capability is opt-in per variant.
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { indexRpgPack, initStateForRpgPack } from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadRpgSourceFile("content/rpg/pack/dawn_beacon.yaml");
if (!loaded.ok) throw new Error("dawn_beacon must compile");
const index = indexRpgPack(loaded.compiled.pack);

/** A state standing on the beacon-stage, with the cresset_raised quest stage set or
 *  not — the only condition the reactive cresset name keys on. Built directly rather
 *  than fought to: the two-fight gauntlet + might check are RNG, and this regression
 *  is about NAME rendering at a known quest state, not the combat path (that route is
 *  proven by the auto-discovered reachability suite). */
function onStage(raised: boolean): GameState {
  const s = initStateForRpgPack(index, 1);
  return {
    ...s,
    current: "beacon_stage",
    questStage: raised ? { ...s.questStage, beacon: "cresset_raised" } : s.questStage,
  };
}

const cressetName = (s: GameState): string | undefined =>
  buildRpgObservation(index, s).visible_objects.find((o) => o.id === "cresset")?.name;

const cressetExamineCmd = (s: GameState): string | undefined =>
  buildRpgObservation(index, s).available_actions.find((a) => a.id === "examine_cresset")?.command;

describe("bug_0188 — The Dawn Beacon cresset re-labels itself once righted (reactive object name)", () => {
  it("before righting: visible_objects and the examine command call it 'toppled cresset'", () => {
    const s = onStage(false);
    expect(cressetName(s)).toBe("toppled cresset");
    expect(cressetExamineCmd(s)).toBe("look at toppled cresset");
  });

  it("after righting: the SAME object is 'upright cresset' everywhere the name renders", () => {
    const s = onStage(true);
    expect(cressetName(s)).toBe("upright cresset");
    expect(cressetExamineCmd(s)).toBe("look at upright cresset");
    // The stale word is gone from both surfaces (no contradiction with the righted prose).
    expect(cressetName(s)).not.toContain("toppled");
    expect(cressetExamineCmd(s)).not.toContain("toppled");
  });

  it("an object with no variant name keeps its base name in both states (opt-in fallback)", () => {
    // The orders-board lives in lower_ward; check the base-name fallback there, in both
    // the un-righted and righted worlds — the capability never touches a name-less variant.
    const board = (raised: boolean): string | undefined => {
      const s = { ...onStage(raised), current: "lower_ward" };
      return buildRpgObservation(index, s).visible_objects.find((o) => o.id === "orders_board")
        ?.name;
    };
    expect(board(false)).toBe("orders-board");
    expect(board(true)).toBe("orders-board");
  });
});
