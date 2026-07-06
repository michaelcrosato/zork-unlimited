/**
 * Regression (§15) for bug_0321 — breaking_weir storm-walk (weir_walk) room description
 * said "clip on" regardless of whether the life-line was in the player's inventory, implying
 * the crossing action was available when it was not.
 *
 * Fix: a `not_item: life_line` variant was added to weir_walk, ordered after walk_crossed
 * and before the existing not_flag:heard_walk gamble-cue variant. When the player is on the
 * walk without the rope, this variant fires and replaces "clip on" with text that notes the
 * rope is absent and points back to the lodge.
 *
 * Locked here:
 *   - no rope → no-rope variant fires (contains "no life-line")
 *   - no rope → "clip on" absent from room description
 *   - no rope + not heard_walk → gamble cue ("raw nerve") absent (no-rope wins)
 *   - has rope + not heard_walk → gamble cue present (not_flag:heard_walk wins)
 *   - walk_crossed → crossed variant wins regardless of rope state
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { indexRpgPack, initStateForRpgPack } from "../../src/rpg/runner.js";
import { roomDescription } from "../../src/rpg/model.js";
import type { GameState } from "../../src/core/state.js";

const PACK_PATH = "content/rpg/quests/breaking_weir.yaml";
const loaded = loadRpgSourceFile(PACK_PATH);
if (!loaded.ok) throw new Error("breaking_weir must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const room = pack.rooms.find((r) => r.id === "weir_walk")!;

function onWalk(flags: Record<string, boolean>, inv: string[] = []): GameState {
  const s = initStateForRpgPack(index, 1);
  return { ...s, current: "weir_walk", flags: { ...s.flags, ...flags }, inventory: inv };
}

describe("bug_0321 — breaking_weir storm-walk shows no-rope text when life-line not held", () => {
  it("no rope → no-rope variant fires (describes missing rope)", () => {
    const desc = roomDescription(room, onWalk({}));
    expect(desc.toLowerCase()).toContain("no life-line");
  });

  it("no rope → 'clip on' absent from room description", () => {
    const desc = roomDescription(room, onWalk({}));
    expect(desc.toLowerCase()).not.toContain("clip on");
  });

  it("no rope + not heard_walk → gamble cue absent (no-rope variant preempts heard_walk check)", () => {
    const desc = roomDescription(room, onWalk({ heard_walk: false }));
    expect(desc).not.toMatch(/raw nerve/i);
  });

  it("has rope + not heard_walk → gamble cue present (not_item variant does not fire)", () => {
    const desc = roomDescription(room, onWalk({}, ["life_line"]));
    expect(desc).toMatch(/raw nerve/i);
  });

  it("walk_crossed → crossed variant wins regardless of rope state", () => {
    const noRopeCrossed = roomDescription(room, onWalk({ walk_crossed: true }));
    const ropeAndCrossed = roomDescription(room, onWalk({ walk_crossed: true }, ["life_line"]));
    expect(noRopeCrossed.toLowerCase()).toContain("crossed now");
    expect(ropeAndCrossed.toLowerCase()).toContain("crossed now");
    expect(noRopeCrossed.toLowerCase()).not.toContain("no life-line");
    expect(ropeAndCrossed.toLowerCase()).not.toContain("no life-line");
  });
});
