/**
 * Regression (§15) for bug_0204 — blind-playtest polish for The Breaking Weir
 * (content/rpg/pack/breaking_weir.yaml, seed 11). The fresh blind playtester won the
 * pack 50/50 with clarity 5/5 and surfaced ONE design-honesty gap (no winnability
 * effect): the lethal storm-walk's "go cold and rash, the water decides" gamble is
 * heavily advertised in the prose, but at the moment of crossing the room/object read
 * IDENTICALLY whether or not the player had heard Pell's counsel. The prep-vs-gamble is
 * real — crossing un-counselled is base nerve 3 vs DC 9 (~25% death), counselled is nerve
 * 8 (safe on the worst roll), proven by breaking_weir_skill_chain.test.ts — but it was
 * hidden behind a stat, so the danger only ever bit as a dice failure, never as a choice
 * the player could SEE they were taking. "Slightly undersells the agency the prose
 * promises."
 *
 * The fix is purely content (additive reactive `variant`s, no engine/validator/solver
 * surface): the storm-walk ROOM and the walk_span OBJECT each gain a `not_flag heard_walk`
 * variant that names the gamble plainly at the decision point — you go on raw nerve, the
 * water may have you — without hard-gating (you can still cross; it stays a gamble, not a
 * wall) and without over-promising certain death (the bug_0027/0114/0200 honesty
 * discipline). The `walk_crossed` variant is declared first, so a crossed walk never shows
 * the cue; a counselled-but-not-yet-crossed player falls to the base text.
 *
 * Locked here on the REAL pack surfaces (roomDescription / objectDescription), across the
 * three states the cue keys on:
 *   - UN-COUNSELLED (no heard_walk): both room and object surface the gamble cue;
 *   - COUNSELLED (heard_walk): neither does (falls to base, which reads true once you
 *     know the trick);
 *   - CROSSED (walk_crossed): neither does (the crossed variant wins, declared first).
 * Plus: the object's display NAME stays "storm-walk" in every state (the new variant adds
 * no `name`, so the bug_0197 reactive-name pins on head_rack/race_winch are untouched).
 */
import { describe, it, expect } from "vitest";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import { indexRpgPack, initStateForRpgPack } from "../../src/rpg/runner.js";
import { roomDescription, objectDescription, objectName } from "../../src/rpg/model.js";
import type { GameState } from "../../src/core/state.js";

const PACK_PATH = "content/rpg/pack/breaking_weir.yaml";
const loaded = loadRpgPackFile(PACK_PATH);
if (!loaded.ok) throw new Error("breaking_weir must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const room = pack.rooms.find((r) => r.id === "weir_walk")!;
const span = pack.objects.find((o) => o.id === "walk_span")!;

/** Stand on the storm-walk with the given flags and optional inventory. */
function onWalk(flags: Record<string, boolean>, inv: string[] = []): GameState {
  const s = initStateForRpgPack(index, 1);
  return { ...s, current: "weir_walk", flags: { ...s.flags, ...flags }, inventory: inv };
}

const GAMBLE_CUE = /raw nerve/i;

describe("bug_0204 — The Breaking Weir: the storm-walk gamble is legible at the crossing", () => {
  it("UN-COUNSELLED (no heard_walk): room AND object name the gamble plainly", () => {
    // life_line in inventory so the not_item:life_line variant (bug_0321) doesn't preempt
    const s = onWalk({}, ["life_line"]);
    expect(roomDescription(room, s)).toMatch(GAMBLE_CUE);
    expect(objectDescription(span, s)).toMatch(GAMBLE_CUE);
    // It is a CUE, not a wall: the room still points the player onward across the walk.
    expect(roomDescription(room, s).toLowerCase()).toContain("race-house");
  });

  it("COUNSELLED (heard_walk): the gamble cue is gone — Pell's telling defused it", () => {
    // life_line in inventory so we test the counselled+rope path, not the no-rope path
    const s = onWalk({ heard_walk: true }, ["life_line"]);
    expect(roomDescription(room, s)).not.toMatch(GAMBLE_CUE);
    expect(objectDescription(span, s)).not.toMatch(GAMBLE_CUE);
  });

  it("CROSSED (walk_crossed): the crossed variant wins, never the gamble cue", () => {
    const s = onWalk({ walk_crossed: true, heard_walk: true });
    expect(roomDescription(room, s)).not.toMatch(GAMBLE_CUE);
    expect(roomDescription(room, s).toLowerCase()).toContain("crossed now");
    expect(objectDescription(span, s)).not.toMatch(GAMBLE_CUE);
  });

  it("the gamble warning never over-promises CERTAIN death (honesty discipline)", () => {
    // The water MAY have you, not WILL — the un-counselled crossing is still a ~75% pass,
    // so the cue must read as a real gamble, not a guaranteed-death wall.
    // life_line in inventory so the no-rope variant (bug_0321) doesn't preempt the gamble cue.
    const s = onWalk({}, ["life_line"]);
    const text = `${roomDescription(room, s)} ${objectDescription(span, s)}`;
    expect(text.toLowerCase()).toMatch(/may|whether|to say/);
  });

  it("the new variant leaves the storm-walk's display NAME unchanged in every state", () => {
    for (const flags of [{}, { heard_walk: true }, { walk_crossed: true }]) {
      expect(objectName(span, onWalk(flags))).toBe("storm-walk");
    }
  });
});
