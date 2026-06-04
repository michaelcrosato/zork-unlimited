/**
 * Regression (§15) for bug_0258 — the `grip iron key` nerve beat leaked into every room.
 *
 * A blind MCP playtest of The Sealed Crypt (ai-runs/2026-06-04T23-11-54-566Z, seed 43)
 * rated the pack clarity 5/5, enjoyment 4/5, mechanically flawless, but flagged one
 * concrete friction point: the optional self-USE nerve beat (`grip iron key`, the
 * Stage-4 skill_check) is a USE on a CARRIED item, so it surfaced in EVERY room from
 * the moment the key was pocketed at the Bottom of the Well — trailing the player into
 * the graveyard, the yard, the forest path, places where its "steel yourself before
 * the three iron locks" fiction makes no sense ("a small wart … the persistent
 * self-use entry").
 *
 * Fix: a new engine condition `in_room` — the non-monotone dual of `visited` (which is
 * sticky once true). `visited` asks "have you EVER been in room X"; `in_room` asks "are
 * you in room X RIGHT NOW" (state.current === id). The grip beat is now gated
 * `{ in_room: crypt }`, so it offers ONLY where the three iron locks actually stand.
 *
 * It stays optional and CONVERGENT: it gates no exit, ending, score, or variant on
 * either roll outcome (every structural proof + the 35-point economy are byte-identical;
 * the cosmetic-and-still-wins assertions live in sealed_crypt_grip_telegraph.test.ts).
 *
 * This pins: (1) `grip iron key` is ABSENT in every non-crypt room the player carries
 * the key through (well_bottom, old_well, graveyard, chapel_yard); (2) it APPEARS the
 * moment the player descends into the crypt; and (3) `in_room` evaluates as a pure
 * predicate over the CURRENT room, distinct from the sticky `visited`.
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  indexParserPack,
  buildParserRules,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";
import { makeStep } from "../../src/core/engine.js";
import { evalCondition } from "../../src/core/conditions.js";
import { initState } from "../../src/core/state.js";
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

const hasGrip = (s: GameState): boolean =>
  enumerateActions(index, s).some(
    (a) =>
      a.action.type === "USE" && a.action.item === "iron_key" && a.action.target === "iron_key",
  );

// Reach the Bottom of the Well holding the iron key (the old leak point).
const TO_IRON_KEY = [
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
];

describe("bug_0258 — the optional grip/nerve beat is gated to the crypt, not every room", () => {
  it("the grip beat is ABSENT in the non-crypt rooms the player carries the key through", () => {
    // At the Bottom of the Well, key in hand — the beat must NOT yet surface here.
    let s = play(initStateForParserPack(index, 43), TO_IRON_KEY);
    expect(s.inventory).toContain("iron_key");
    expect(s.current).toBe("well_bottom");
    expect(hasGrip(s)).toBe(false);

    // Carry the key back up through the well, the graveyard and the yard — still absent.
    s = play(s, ["go_up"]);
    expect(s.current).toBe("old_well");
    expect(hasGrip(s)).toBe(false);

    s = play(s, ["go_west", "go_west"]);
    expect(s.current).toBe("graveyard");
    expect(s.inventory).toContain("iron_key");
    expect(hasGrip(s)).toBe(false);

    s = play(s, ["go_east"]);
    expect(s.current).toBe("chapel_yard");
    expect(hasGrip(s)).toBe(false);
  });

  it("the grip beat APPEARS the moment the player descends into the crypt", () => {
    const s = play(initStateForParserPack(index, 43), [
      ...TO_IRON_KEY,
      "go_up",
      "go_west",
      "go_north",
      "go_down",
    ]);
    expect(s.current).toBe("crypt");
    expect(hasGrip(s)).toBe(true);
  });

  it("`in_room` reads the CURRENT room and is distinct from the sticky `visited`", () => {
    // Synthetic state: started in 'a', walked to 'b'. visited{a,b}; current 'b'.
    const s0 = initState({ seed: 1, start: "a" });
    const s = { ...s0, current: "b", visited: { a: true, b: true } };
    expect(evalCondition({ in_room: "b" }, s)).toBe(true);
    // 'a' was visited but is NOT the current room — the two predicates diverge.
    expect(evalCondition({ in_room: "a" }, s)).toBe(false);
    expect(evalCondition({ visited: "a" }, s)).toBe(true);
    // A room never entered is neither current nor visited.
    expect(evalCondition({ in_room: "c" }, s)).toBe(false);
    expect(evalCondition({ visited: "c" }, s)).toBe(false);
  });
});
