/**
 * Regression (§15) for bug_0250 — stale-text-on-quest-regression in the RPG pack
 * Breaking the Weir (the bug_0248 / bug_0249 class, found by auditing every reactive
 * variant gated on a non-monotonic quest stage; AI_LOOP_STATE.md cycle entry).
 *
 * The Keeper's Lodge carries a reactive `variant` whose text says the river outside
 * has "changed … the rising roar gone over to a steadier, falling note now that the
 * relief-race is carrying the worst of it off" — the world AFTER the player opens the
 * relief-race. The BASE description says the opposite: "the river is loud and wrong
 * outside — too high, too fast."
 *
 * The variant ORIGINALLY keyed off `quest_stage the_weir == race_running`. A quest
 * stage is NON-MONOTONIC: entering `valley_held` re-seats `the_weir` to `weir_held`,
 * at which point the race_running gate stops matching and the lodge would revert to
 * its base "too high, too fast" text — a flat CONTRADICTION of a world where the flood
 * has already been diverted (the exact stale-on-regression footgun of bug_0248 /
 * bug_0249). Today that contradiction is unreachable only by coincidence — the
 * `visited: valley_held` win ends the game the instant `weir_held` is set, so the lodge
 * is never re-observed at that stage — but the prose must not depend on that accident.
 *
 * Fix (content only): re-key the variant onto the MONOTONIC, never-unset `race_open`
 * flag, which is set in the SAME race_winch on_success that sets `race_running` and is
 * never cleared. This mirrors the pack's own sibling rooms (weir_head keys on
 * `rack_freed`, race_house on `race_open`) and the bug_0249 discipline ("flags survive a
 * detour / a stage regression; quest stages do not"). On every state reachable AT the
 * lodge, `race_open` ⟺ `the_weir == race_running`, so play is byte-identical — but the
 * calmed-water prose can now never revert to the contradictory base.
 *
 * Locked here:
 *   (1) at the start (race not opened) the lodge shows the base "too high, too fast"
 *       text and NOT the calmed-water variant (backward-compat / un-opened state);
 *   (2) once `race_open` is set, the lodge shows the calmed-water variant and never the
 *       contradictory base — for BOTH the reachable stage (`race_running`) AND the
 *       regressed stage (`weir_held`). The weir_held case is the teeth: under the old
 *       `quest_stage == race_running` gate it reverts to the base "too high, too fast"
 *       contradiction; under the monotonic flag gate it stays calmed;
 *   (3) the variant's `when` keys off `has_flag race_open`, never a quest_stage — the
 *       structural pin that keeps the prose robust to the stage regression.
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import type { GameState } from "../../src/core/state.js";

const PACK = "content/rpg/quests/breaking_weir.yaml";
const loaded = loadRpgSourceFile(PACK);
if (!loaded.ok) throw new Error("breaking_weir must compile");
const index = indexRpgPack(loaded.compiled.pack);
buildRpgRules(index); // parity with the engine wiring the runtime uses

const desc = (s: GameState): string => buildRpgObservation(index, s).description;

const CALMED = "voice outside has changed";
const TOO_HIGH = "too high, too fast";

describe("bug_0250 — keeper's lodge calmed-water variant survives the quest-stage regression", () => {
  it("(1) un-opened: the lodge shows the base 'too high, too fast' text, not the calmed variant", () => {
    const s = initStateForRpgPack(index, 1);
    expect(s.current).toBe("keeper_lodge");
    expect(s.flags["race_open"]).toBeFalsy();
    expect(desc(s)).toContain(TOO_HIGH);
    expect(desc(s)).not.toContain(CALMED);
  });

  it("(2a) reachable state — race_open ∧ the_weir=race_running: calmed variant shows, base gone", () => {
    const base = initStateForRpgPack(index, 1);
    // The configuration a player is actually in when they walk back DOWN to the lodge after
    // heaving the relief-race open: race_open set, quest at its pre-win stage race_running.
    const opened: GameState = {
      ...base,
      flags: { ...base.flags, race_open: true },
      questStage: { ...base.questStage, the_weir: "race_running" },
    };
    expect(opened.current).toBe("keeper_lodge");
    expect(desc(opened)).toContain(CALMED);
    expect(desc(opened)).not.toContain(TOO_HIGH);
  });

  it("(2b) TEETH — race_open ∧ the_weir=weir_held (the stage regression): still calmed, never the contradiction", () => {
    const base = initStateForRpgPack(index, 1);
    // The regression a future non-terminal valley_held edit would expose: the quest has
    // advanced to weir_held while race_open is (monotonically) still set. The old
    // quest_stage==race_running gate would revert this to the base "too high, too fast"
    // contradiction; the monotonic flag gate keeps the calmed-water prose.
    const held: GameState = {
      ...base,
      flags: { ...base.flags, race_open: true },
      questStage: { ...base.questStage, the_weir: "weir_held" },
    };
    expect(held.current).toBe("keeper_lodge");
    expect(desc(held)).toContain(CALMED);
    expect(desc(held)).not.toContain(TOO_HIGH);
  });

  it("(3) structural pin: the lodge variant keys off has_flag race_open, never a quest_stage", () => {
    const room = loaded.compiled.pack.rooms.find((r) => r.id === "keeper_lodge");
    expect(room, "keeper_lodge must exist").toBeTruthy();
    const whens = (room?.variants ?? []).flatMap((v) => v.when);
    expect(whens.length).toBeGreaterThan(0);
    // At least one guard reads the monotonic flag …
    const json = JSON.stringify(whens);
    expect(json).toContain("race_open");
    // … and NONE of the lodge variant guards read a quest_stage (the regressable kind).
    expect(whens.some((c) => "quest_stage" in c)).toBe(false);
  });
});
