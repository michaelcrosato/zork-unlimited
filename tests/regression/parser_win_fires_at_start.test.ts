/**
 * Regression (§15) for the parser/RPG analogue of bug_0089 — the validator now flags
 * a `win_condition` that ALREADY HOLDS in the initial state and can never be
 * falsified, so it fires on the player's FIRST action on every path. The engine's
 * §8.4.5 checkWin runs against the POST-action state (src/core/engine.ts), never at
 * game start, so such a win ends the game at turn 1 with no room past the start ever
 * played and the goal granted for nothing — unplayable, hence an ERROR
 * (WIN_FIRES_AT_START). It brackets the OPPOSITE degeneracy the parser validator
 * already guards (IMPOSSIBLE_GATE / ITEM_REQUIRED_UNOBTAINABLE / WIN_UNREACHABLE = a
 * win that can never fire), exactly as DEADLINE_FIRES_AT_START brackets
 * DEADLINE_UNFIREABLE for the CYOA deadline.
 *
 * Sound & conservative — only fires when firing-at-start is PROVABLE:
 *   (a) the initial state is the engine's own (initStateForParserPack, start on_enter
 *       applied, start room marked visited), evaluated by the engine's own
 *       evalConditions; and
 *   (b) un-falsifiability is proven only for a flat conjunction of monotone-stable
 *       atoms (sign-significant var arithmetic; object open/unlock state — `is_open`
 *       is monotone since nothing can close an object, `is_unlocked` stable unless a
 *       `set_object_locked: locked: true` can relock it; any disjunction/negation,
 *       not_visited, quest state, or a combat-volatile var bails to falsifiable).
 *
 * Locked here:
 *   (1) the shipped packs are NOT flagged (their wins fire on reaching a goal room /
 *       claiming a goal item, never at start);
 *   (2) a win {visited: start_room} (true at init, `visited` monotone) IS flagged;
 *   (3) a win on a var already >= its init value but escapable (a dec_var can push it
 *       back below the bound) is NOT flagged (soundness: a first move dodges it);
 *   (4) a win on a monotone-increasing var already at its bound IS flagged;
 *   (5) a win not met at init (a room not yet visited) is NOT flagged;
 *   (6) RPG: a win on the combat-volatile HP var, true at init, is NOT flagged
 *       (combat can drop HP via dynamic set_var the scan never sees), while the SAME
 *       shape in a pure PARSER pack (where that var is inert) IS flagged.
 */
import { describe, it, expect } from "vitest";
import { compileParserPack, loadParserPackFile } from "../../src/parser/pack.js";
import { compileRpgPack } from "../../src/rpg/pack.js";
import { validateParser } from "../../src/validate/parser_validator.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";

function parserCodes(src: string): string[] {
  const r = compileParserPack(src);
  expect(r.ok).toBe(true);
  if (!r.ok) return [];
  return validateParser(r.compiled.pack).findings.map((f) => f.code);
}

function rpgCodes(src: string): string[] {
  const r = compileRpgPack(src);
  expect(r.ok).toBe(true);
  if (!r.ok) return [];
  return validateRpg(r.compiled.pack).findings.map((f) => f.code);
}

// Two-room loop (strongly connected, so no soft-lock), win on a chosen condition.
const parserPack = (winConds: string, opts: { varsInit?: string; extra?: string } = {}): string => `
meta: { id: t, title: T, start_room: a${opts.varsInit ? `, vars_init: ${opts.varsInit}` : ""} }
rooms:
  - id: a
    name: A
    description: "Room A — the start."
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: "Room B."${opts.extra ?? ""}
    exits: [{ direction: south, to: a }]
win_conditions: [{ id: w, conditions: ${winConds}, ending: e }]
endings: [{ id: e, title: End, text: "Done." }]
`;

describe("WIN_FIRES_AT_START — a win already met at game start (parser/RPG analogue of bug_0089)", () => {
  it("the shipped packs are NOT flagged (their wins fire on reaching the goal, not at start)", () => {
    for (const path of [
      "content/parser/pack/sealed_crypt.yaml",
      "content/parser/pack/alchemists_tower.yaml",
    ]) {
      const loaded = loadParserPackFile(path);
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) return;
      const found = validateParser(loaded.compiled.pack).findings.map((f) => f.code);
      expect(found).not.toContain("WIN_FIRES_AT_START");
    }
  });

  it("flags a win {visited: start_room} — true at init and `visited` never un-sets", () => {
    expect(parserCodes(parserPack("[{ visited: a }]"))).toContain("WIN_FIRES_AT_START");
  });

  it("flags a win on a monotone-increasing var already at its bound", () => {
    // n init 5, win n>=5 (true now), n only ever rises (+1) → can never drop below 5.
    const src = parserPack("[{ var_gte: { name: n, value: 5 } }]", {
      varsInit: "{ n: 5 }",
      extra: "\n    on_enter: [{ inc_var: { name: n, by: 1 } }]",
    });
    expect(parserCodes(src)).toContain("WIN_FIRES_AT_START");
  });

  it("does NOT flag a win on a var that is true at init but escapable (a dec_var exists)", () => {
    // n init 5, win n>=5 (true now), but room b's on_enter decrements n → a first
    // move can push it below the bound, so it does not fire on every path.
    const src = parserPack("[{ var_gte: { name: n, value: 5 } }]", {
      varsInit: "{ n: 5 }",
      extra: "\n    on_enter: [{ dec_var: { name: n, by: 1 } }]",
    });
    expect(parserCodes(src)).not.toContain("WIN_FIRES_AT_START");
  });

  it("does NOT flag a win not met at init (a room not yet visited)", () => {
    expect(parserCodes(parserPack("[{ visited: b }]"))).not.toContain("WIN_FIRES_AT_START");
  });

  it("RPG: does NOT flag a win on the combat-volatile HP var, but the same shape in a pure parser pack IS flagged", () => {
    // hp init 10, win hp>=1 (true now). In RPG, combat drops HP via a dynamic set_var
    // the scan never sees, so HP is volatile → escapable → NOT flagged.
    const rpgSrc = `
meta: { id: t, title: T, start_room: a, vars_init: { hp: 10, attack: 1, defense: 0 } }
rooms:
  - id: a
    name: A
    description: "Room A — the start."
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: "Room B."
    exits: [{ direction: south, to: a }]
win_conditions: [{ id: w, conditions: [{ var_gte: { name: hp, value: 1 } }], ending: e }]
endings: [{ id: e, title: End, text: "Done." }]
`;
    expect(rpgCodes(rpgSrc)).not.toContain("WIN_FIRES_AT_START");

    // Same condition in a PARSER pack: there `hp` is just an inert var with no
    // writes, so the win really does fire on the first action → flagged.
    const parserSrc = parserPack("[{ var_gte: { name: hp, value: 1 } }]", {
      varsInit: "{ hp: 10 }",
    });
    expect(parserCodes(parserSrc)).toContain("WIN_FIRES_AT_START");
  });
});

/**
 * Object open/unlock-state stability (the deferred WIN_FIRES_AT_START sibling).
 * Before this, winStaysTrueForever bailed to "escapable" on any `is_open`/`is_unlocked`
 * atom, so a win gating on object state that ALREADY holds at start (a start-room
 * `on_enter` that opens/unlocks the object) slipped through as a false negative. Now:
 *   - `is_open` is monotone (the closed effect DSL has no object-CLOSE effect and the
 *     CLOSE verb is unresolvable), so an open-at-start win IS flagged; and
 *   - `is_unlocked` is stable iff nothing can relock the object — flagged when no
 *     `set_object_locked: { locked: true }` exists, NOT flagged when one does.
 */
describe("WIN_FIRES_AT_START — object open/unlock state at start (deferred sibling)", () => {
  // Two-room loop; the start room's on_enter sets the object state under test, so the
  // engine's own initial state already satisfies the win.
  const objPack = (
    onEnter: string,
    winConds: string,
    opts: { roomBExtra?: string; objExtra?: string } = {},
  ): string => `
meta: { id: t, title: T, start_room: a }
rooms:
  - id: a
    name: A
    description: "Room A — the start."
    objects: [thing]
    on_enter: ${onEnter}
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: "Room B."${opts.roomBExtra ?? ""}
    exits: [{ direction: south, to: a }]
objects:
  - id: thing
    name: thing
    description: "A thing."${opts.objExtra ?? ""}
win_conditions: [{ id: w, conditions: ${winConds}, ending: e }]
endings: [{ id: e, title: End, text: "Done." }]
`;

  it("flags an `is_open` win when the start room opens the object — nothing can close it", () => {
    const src = objPack("[{ open_object: thing }]", "[{ is_open: thing }]", {
      objExtra: "\n    openable: true",
    });
    expect(parserCodes(src)).toContain("WIN_FIRES_AT_START");
  });

  it("does NOT flag an `is_open` win when the object is NOT opened at start", () => {
    // No on_enter open ⇒ objectState[thing].open is undefined at init ⇒ win not met.
    const src = objPack("[]", "[{ is_open: thing }]", { objExtra: "\n    openable: true" });
    expect(parserCodes(src)).not.toContain("WIN_FIRES_AT_START");
  });

  it("flags an `is_unlocked` win when the start room unlocks the object and nothing relocks it", () => {
    const src = objPack(
      "[{ set_object_locked: { id: thing, locked: false } }]",
      "[{ is_unlocked: thing }]",
    );
    expect(parserCodes(src)).toContain("WIN_FIRES_AT_START");
  });

  it("does NOT flag an `is_unlocked` win when a `set_object_locked: locked: true` can relock it", () => {
    // The relock lives in room b's on_enter; collectFalsifiers scans every declared
    // effect, so the object is relockable ⇒ a first move can escape ⇒ no finding.
    const src = objPack(
      "[{ set_object_locked: { id: thing, locked: false } }]",
      "[{ is_unlocked: thing }]",
      { roomBExtra: "\n    on_enter: [{ set_object_locked: { id: thing, locked: true } }]" },
    );
    expect(parserCodes(src)).not.toContain("WIN_FIRES_AT_START");
  });
});
