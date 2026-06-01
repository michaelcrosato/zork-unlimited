/**
 * Regression (§15) for bug_0044 — stale Bell Tower text after the rope is taken.
 *
 * Blind MCP playtest of The Sealed Crypt (ai-runs/2026-06-01T13-07-14-415Z, seed 47)
 * flagged that the Bell Tower kept narrating "its great hemp pull-rope still hangs
 * coiled on a peg" AFTER the player had pocketed the rope — the room's static
 * description hard-coded the rope's presence while visible_objects correctly dropped
 * it. Same stale-state class as bug_0007/0010/0039, but the one room with a takeable
 * object that never got a reactive `variant` (old_well and crypt already had theirs).
 *
 * Fix (content): a bell_tower `variant` keyed on `has_item rope` — while the coil is
 * in your hands the peg reads bare, so the base "still hangs coiled" line no longer
 * describes a rope you just took.
 *
 * Keying on has_item (NOT the rope_attached_to_well flag) is deliberate and load-
 * bearing: `remove_item` at the well (bug_0034) only empties your hands — it does NOT
 * place the rope in any room — so the object falls back to its declared home room and
 * is shown present in the Bell Tower again. In that state (and never-taken / dropped-
 * back) the rope IS visible here, so the base "coiled on a peg" text correctly applies
 * and never contradicts visible_objects. This test pins exactly that invariant: the
 * "bare" text shows iff the rope is in hand, and the room text and visible_objects
 * never disagree about whether the rope is present.
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  indexParserPack,
  buildParserRules,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { enumerateActions, resolveParserAction } from "../../src/parser/legal_actions.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const crypt = loadParserPackFile("content/parser/pack/sealed_crypt.yaml");
if (!crypt.ok) throw new Error("sealed_crypt must compile");
const index = indexParserPack(crypt.compiled.pack);
const step = makeStep(buildParserRules(index));

function play(s: GameState, ids: string[]): GameState {
  for (const id of ids) {
    const opt = enumerateActions(index, s).find((o) => o.id === id);
    if (!opt)
      throw new Error(
        `"${id}" not legal in ${s.current}: [${enumerateActions(index, s)
          .map((o) => o.id)
          .join(", ")}]`,
      );
    const r = step(s, opt.action);
    expect(r.ok).toBe(true);
    s = r.state;
  }
  return s;
}

const obs = (s: GameState) => buildParserObservation(index, s);
const ropeVisible = (s: GameState): boolean => obs(s).visible_objects.some((o) => o.id === "rope");

/** The narrate text the explicit `look` action would emit in this state. */
function lookNarration(s: GameState): string {
  const res = resolveParserAction(index, s, { type: "LOOK" });
  const eff = res?.effects[0];
  if (!eff || !("narrate" in eff)) throw new Error("LOOK produced no narration");
  return eff.narrate;
}

describe("bug_0044 — Bell Tower text reacts to the rope being taken", () => {
  it("before taking: the peg reads coiled and the rope is present (text agrees with objects)", () => {
    const s = play(initStateForParserPack(index, 47), ["go_north", "go_up"]);
    expect(s.current).toBe("bell_tower");
    expect(obs(s).description).toContain("still hangs coiled on a peg");
    expect(ropeVisible(s)).toBe(true);
  });

  it("after taking the rope: the peg reads bare and the rope is gone (no stale presence)", () => {
    const s = play(initStateForParserPack(index, 47), ["go_north", "go_up", "take_rope"]);
    expect(s.inventory).toContain("rope");
    expect(obs(s).description).toContain("bare now");
    expect(obs(s).description).not.toContain("still hangs coiled");
    expect(ropeVisible(s)).toBe(false);
    // The explicit `look` reads the same reactive text — no divergence.
    expect(lookNarration(s)).toBe(obs(s).description);
  });

  it("once the rope is spent at the well it returns home; the tower reverts to base text and the rope is shown present (no text/object contradiction)", () => {
    // Tie the rope off (remove_item empties the hand but places it nowhere, so the
    // object falls back to its home room = bell_tower) then climb back up.
    const s = play(initStateForParserPack(index, 47), [
      "go_north",
      "go_up",
      "take_rope",
      "go_down",
      "go_east",
      "use_rope_on_old_well",
      "go_west",
      "go_up",
    ]);
    expect(s.current).toBe("bell_tower");
    expect(s.flags["rope_attached_to_well"]).toBe(true);
    expect(s.inventory).not.toContain("rope");
    // Rope is no longer in hand, so the variant does NOT fire: base text shows…
    expect(obs(s).description).toContain("still hangs coiled on a peg");
    expect(obs(s).description).not.toContain("bare now");
    // …and that is correct, because the rope object is genuinely present here.
    expect(ropeVisible(s)).toBe(true);
  });

  it("the bell_tower variant is purely cosmetic — the full route still wins 35/35", () => {
    const WIN_ROUTE = [
      "go_north",
      "go_up",
      "take_rope",
      "go_down",
      "go_west",
      "read_headstone",
      "go_north",
      "open_stone_coffer",
      "take_brass_key",
      "go_south",
      "go_east",
      "go_east",
      "use_rope_on_old_well",
      "go_down",
      "unlock_oak_chest",
      "open_oak_chest",
      "take_iron_key",
      "go_up",
      "go_west",
      "go_north",
      "go_down",
      "unlock_crypt_gate",
      "go_north",
    ];
    const s = play(initStateForParserPack(index, 47), WIN_ROUTE);
    expect(s.ended).toBe(true);
    expect(s.visited.catacombs).toBe(true);
    expect(s.vars.score).toBe(35);
  });
});
