/**
 * Regression (§15) for bug_0034 — the well rope is SPENT, not carried.
 *
 * Blind playtest (ai-runs/2026-06-01T11-01-06-373Z/playtest.md, sealed_crypt seed 88)
 * flagged a continuity slip: after USE rope ON well the world says the rope "is
 * knotted fast to the iron ring and trails down into the dark," yet the player still
 * carried a "coil of rope" — the same rope both tied to the well and in your pocket.
 *
 * Root cause was a validator FALSE POSITIVE that made the honest fix illegal: the
 * SOFTLOCK_QUEST_ITEM "consumed with no re-grant" branch rejected ANY consumed
 * quest_critical item, even one whose job is fully discharged at the moment it is
 * spent (the rope ties off a well that then stays open by the `rope_attached_to_well`
 * FLAG, never by `has_item rope`). The refinement: a consumed quest item is a
 * soft-lock only if it is still NEEDED IN HAND at a gate that does not consume it.
 *
 * This pins: (1) the rope leaves inventory when tied and the full route still wins
 * 35/35; (2) the shipped pack validates clean (rope spent-safe, not flagged); and
 * (3) the refined check STILL bites when a consumed quest item is genuinely needed
 * while held elsewhere (no weakening). See traces/bugs/bug_0034_sealed_crypt_rope_spent.yaml.
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import { validateParser } from "../../src/validate/parser_validator.js";
import {
  indexParserPack,
  buildParserRules,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";
import { makeStep } from "../../src/core/engine.js";
import type { ParserPack } from "../../src/parser/schema.js";

const loaded = loadParserPackFile("content/parser/pack/sealed_crypt.yaml");
if (!loaded.ok) throw new Error("sealed_crypt must compile");
const goodPack = loaded.compiled.pack;

/** Drive a list of action ids from a fresh game; throws if any id is not legal. */
function run(pack: ParserPack, ids: string[]) {
  const index = indexParserPack(pack);
  const step = makeStep(buildParserRules(index));
  let state = initStateForParserPack(index, 88);
  for (const id of ids) {
    const opt = enumerateActions(index, state).find((o) => o.id === id);
    if (!opt) throw new Error(`action "${id}" not legal in room ${state.current}`);
    state = step(state, opt.action).state;
  }
  return { index, state };
}

/** The canonical full-score solution route, ending in the catacombs (the win). */
const WIN_ROUTE = [
  "go_north", // forest_path → chapel_yard
  "go_up", // → bell_tower
  "take_rope",
  "go_down", // → chapel_yard
  "go_west", // → graveyard
  "read_headstone", // +5
  "go_north", // → mausoleum
  "open_stone_coffer",
  "take_brass_key",
  "go_south", // → graveyard
  "go_east", // → chapel_yard
  "go_east", // → old_well
  "use_rope_on_old_well", // +10, rope SPENT here
  "go_down", // → well_bottom (opened by the flag)
  "unlock_oak_chest",
  "open_oak_chest",
  "take_iron_key",
  "go_up", // → old_well
  "go_west", // → chapel_yard
  "go_north", // → chapel_nave
  "go_down", // → crypt
  "use_iron_key_on_crypt_gate", // +20
  "go_north", // → catacombs (WIN)
];

describe("bug_0034: the well rope is spent, not carried", () => {
  it("the rope leaves inventory the moment it is tied off", () => {
    const before = run(goodPack, WIN_ROUTE.slice(0, 12)); // up to (not incl.) use_rope
    expect(before.state.inventory).toContain("rope");
    const after = run(goodPack, WIN_ROUTE.slice(0, 13)); // through use_rope_on_old_well
    expect(after.state.inventory).not.toContain("rope");
    // The world now holds the rope; the player no longer carries a contradictory coil.
  });

  it("the full route still reaches the catacombs and scores 35", () => {
    const { state } = run(goodPack, WIN_ROUTE);
    expect(state.ended).toBe(true);
    expect(state.visited.catacombs).toBe(true);
    expect(state.vars.score).toBe(35);
  });

  it("the well exit stays open by flag, not by holding the rope (no re-tie needed)", () => {
    // After tying, with the rope GONE, the descent must still be available.
    const { index, state } = run(goodPack, WIN_ROUTE.slice(0, 13));
    expect(state.inventory).not.toContain("rope");
    const down = enumerateActions(index, state).find((o) => o.id === "go_down");
    expect(down).toBeDefined();
  });

  it("the shipped pack validates clean — the spent rope is NOT flagged", () => {
    const report = validateParser(goodPack);
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
  });

  it("the refined check STILL bites a consumed quest item that is needed while held elsewhere", () => {
    // Mutate the shipped pack so the rope is required in hand at a gate that does
    // NOT consume it (the crypt→catacombs exit). Now spending it CAN strand you.
    const broken: ParserPack = structuredClone(goodPack);
    const crypt = broken.rooms.find((r) => r.id === "crypt")!;
    const north = crypt.exits.find((e) => e.direction === "north")!;
    north.conditions = [...north.conditions, { has_item: "rope" }];
    const report = validateParser(broken);
    expect(report.ok).toBe(false);
    expect(report.findings.map((f) => f.code)).toContain("SOFTLOCK_QUEST_ITEM");
  });
});
