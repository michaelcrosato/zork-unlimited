/**
 * Regression (§15) for bug_0092 — the soft-lock graph no longer counts a PROVABLY-DEAD
 * terminal as a real escape edge, so a true SOFTLOCK behind one is no longer masked.
 *
 * The parser/RPG validator carried a latent unsoundness:
 *   - every `win_condition`'s `visited` room was added to `winRooms` —
 *     the soft-lock escape set — even when the win's `conditions` are internally
 *     contradictory (UNSATISFIABLE_CONDITION, bug_0091) and can therefore never fire.
 * A dead terminal acted as a phantom escape: a region whose ONLY way out was
 * that terminal read as "can still reach a win/ending" when in truth it is soft-locked.
 *
 * The fix excludes the dead terminal from the escape graph (the separate
 * UNSATISFIABLE_CONDITION warning still names it), so the
 * masked SOFTLOCK surfaces. Sound & conditional: when the SAME terminal is satisfiable /
 * fireable it stays a real escape edge and no spurious SOFTLOCK appears.
 *
 * Locked here:
 *   (1) parser: a region whose only "win" is an UNSATISFIABLE win_condition is now
 *       flagged SOFTLOCK (was masked); the same region with a SATISFIABLE win is NOT;
 *   (2) the shipped parser packs gain NO new SOFTLOCK (none has a dead terminal to begin with).
 */
import { describe, it, expect } from "vitest";
import { compileParserPack, loadParserPackFile } from "../../src/parser/pack.js";
import { validateParser } from "../../src/validate/parser_validator.js";

function parserCodes(src: string): string[] {
  const r = compileParserPack(src);
  expect(r.ok).toBe(true);
  if (!r.ok) return [];
  return validateParser(r.compiled.pack).findings.map((f) => f.code);
}

// A start `s` branching into a GOOD wing (s → good_path → good_room) and a closed,
// one-way TRAP wing (s → trap ⇄ trap_room) with no path back to the good wing. The
// trap wing's only "win" is whatever `deadWin` says about `trap_room`. When that win is
// unsatisfiable the trap wing can reach NO real win → SOFTLOCK; when satisfiable, the
// trap_room itself is the win → no SOFTLOCK.
const parserPack = (deadWinConds: string): string => `
meta: { id: t, title: T, start_room: s }
rooms:
  - id: s
    name: S
    description: "The start — branches two ways."
    exits: [{ direction: north, to: good_path }, { direction: south, to: trap }]
  - id: good_path
    name: GP
    description: "The path toward the goal."
    exits: [{ direction: north, to: good_room }, { direction: south, to: s }]
  - id: good_room
    name: GR
    description: "The goal room."
    exits: [{ direction: south, to: good_path }]
  - id: trap
    name: TR
    description: "A one-way trap branch."
    exits: [{ direction: north, to: trap_room }]
  - id: trap_room
    name: TRM
    description: "A closed loop with the trap."
    exits: [{ direction: south, to: trap }]
win_conditions:
  - { id: w_good, conditions: [{ visited: good_room }], ending: e_good }
  - { id: w_dead, conditions: ${deadWinConds}, ending: e_dead }
endings:
  - { id: e_good, title: G, text: "You reach the goal." }
  - { id: e_dead, title: D, text: "The other ending." }
`;

describe("bug_0092 (parser) — an unsatisfiable win no longer masks a SOFTLOCK", () => {
  it("the trap wing is flagged SOFTLOCK when its only win is unsatisfiable", () => {
    // w_dead pins flag x both true and false → unsatisfiable → trap_room is NOT a real
    // escape → the trap wing can reach no live win.
    const codes = parserCodes(
      parserPack("[{ visited: trap_room }, { has_flag: x }, { not_flag: x }]"),
    );
    expect(codes).toContain("SOFTLOCK");
    expect(codes).toContain("UNSATISFIABLE_CONDITION");
  });

  it("the SAME trap wing is NOT a SOFTLOCK when its win is satisfiable (soundness)", () => {
    // Drop the contradiction: {visited: trap_room} alone is a real, reachable win, so
    // trap_room legitimately escapes the trap wing — no SOFTLOCK, no UNSATISFIABLE.
    const codes = parserCodes(parserPack("[{ visited: trap_room }]"));
    expect(codes).not.toContain("SOFTLOCK");
    expect(codes).not.toContain("UNSATISFIABLE_CONDITION");
  });

  it("the shipped parser packs gain NO SOFTLOCK", () => {
    for (const path of ["content/parser/pack/sealed_crypt.yaml"]) {
      const loaded = loadParserPackFile(path);
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) return;
      const codes = validateParser(loaded.compiled.pack).findings.map((f) => f.code);
      expect(codes).not.toContain("SOFTLOCK");
    }
  });
});
