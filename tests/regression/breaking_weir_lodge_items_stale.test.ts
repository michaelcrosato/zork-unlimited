/**
 * Regression (§15) for bug_0314 — stale room description in the Keeper's Lodge
 * after the weir-iron and/or life-line are taken (reactive-description-blindness,
 * same class as bug_0282–0313).
 *
 * The base description of keeper_lodge names both items in place: "his weir-iron…
 * leans by the door, and his life-line… hangs on its peg beside it." Once either
 * or both items are in the player's inventory, those references become factually
 * false — the player holds the tools, but the scene still describes them as present.
 *
 * Blind playtest (ai-runs/2026-06-08T11-29-53-717Z/playtest.md, Bug 1) confirmed
 * the issue: both items remained in the description on every return visit between
 * taking the tools and opening the relief-race.
 *
 * Fix (content, pure prose): three new variants added to keeper_lodge, ordered
 * after the race_open variant (first-match-wins):
 *   (a) both weir_iron + life_line in inventory → "the tools already in your hands"
 *   (b) only weir_iron in inventory → life_line still on peg (iron absent)
 *   (c) only life_line in inventory → weir-iron still by door (line absent)
 *
 * Locked here:
 *   (1) fresh state → base text names both items; no "tools already" phrase
 *   (2) both in inventory → "tools already in your hands"; neither item named
 *   (3) only weir_iron in inventory → life_line mentioned; weir_iron not
 *   (4) only life_line in inventory → weir_iron mentioned; life_line not
 *   (5) race_open set → calmed-water variant wins (tools absent, both item refs absent)
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import type { GameState } from "../../src/core/state.js";

const PACK = "content/rpg/pack/breaking_weir.yaml";
const loaded = loadRpgSourceFile(PACK);
if (!loaded.ok) throw new Error("breaking_weir must compile");
const index = indexRpgPack(loaded.compiled.pack);
buildRpgRules(index);

const desc = (s: GameState): string => buildRpgObservation(index, s).description;

const IRON_IN_ROOM = "leans by the door";
const LINE_IN_ROOM = "hangs on its peg";
const BOTH_TAKEN = "tools already in your hands";

describe("bug_0314 — keeper's lodge stale item descriptions after tools are taken", () => {
  it("(1) fresh state: description names both iron and life-line in place", () => {
    const s = initStateForRpgPack(index, 1);
    expect(s.current).toBe("keeper_lodge");
    expect(s.inventory).not.toContain("weir_iron");
    expect(s.inventory).not.toContain("life_line");
    const d = desc(s);
    expect(d).toContain(IRON_IN_ROOM);
    expect(d).toContain(LINE_IN_ROOM);
    expect(d).not.toContain(BOTH_TAKEN);
  });

  it("(2) both items in inventory: neither item named; 'tools already in your hands' shown", () => {
    const base = initStateForRpgPack(index, 1);
    const s: GameState = { ...base, inventory: ["weir_iron", "life_line"] };
    const d = desc(s);
    expect(d).toContain(BOTH_TAKEN);
    expect(d).not.toContain(IRON_IN_ROOM);
    expect(d).not.toContain(LINE_IN_ROOM);
  });

  it("(3) only weir_iron in inventory: life-line still on peg; iron not mentioned in room", () => {
    const base = initStateForRpgPack(index, 1);
    const s: GameState = { ...base, inventory: ["weir_iron"] };
    const d = desc(s);
    expect(d).toContain(LINE_IN_ROOM);
    expect(d).not.toContain(IRON_IN_ROOM);
    expect(d).not.toContain(BOTH_TAKEN);
  });

  it("(4) only life_line in inventory: weir-iron still by door; life-line not mentioned in room", () => {
    const base = initStateForRpgPack(index, 1);
    const s: GameState = { ...base, inventory: ["life_line"] };
    const d = desc(s);
    expect(d).toContain(IRON_IN_ROOM);
    expect(d).not.toContain(LINE_IN_ROOM);
    expect(d).not.toContain(BOTH_TAKEN);
  });

  it("(5) race_open set: calmed-water variant wins; neither item reference shown", () => {
    const base = initStateForRpgPack(index, 1);
    const s: GameState = {
      ...base,
      flags: { ...base.flags, race_open: true },
      inventory: ["weir_iron", "life_line"],
    };
    const d = desc(s);
    expect(d).toContain("voice outside has changed");
    expect(d).not.toContain(IRON_IN_ROOM);
    expect(d).not.toContain(LINE_IN_ROOM);
    expect(d).not.toContain(BOTH_TAKEN);
  });
});
