/**
 * Regression (§15) for bug_0116 — the parser validator (and so the RPG validator,
 * which delegates to it) now flags SCORE_PEAKS_BEFORE_WIN: the bug_0104 smell caught
 * STRUCTURALLY at authoring time instead of by a blind playtester.
 *
 * bug_0104's blind report (alchemists_tower, seed 89) flagged a "perfect score yet
 * unfinished" state: read +5, steep +10, decant +20 = 35 = max_score, ALL before the
 * cure — the deliberate USE-antidote-on-master act the win turns on, the literal point
 * of the pack — which awarded nothing. bug_0104 fixed THAT pack (the cure now carries
 * the final +5, max_score 35 → 40). This check generalizes the lesson: when a SINGLE
 * win_condition turns on a `has_flag` the player must deliberately set, the perfect
 * score should not already be reachable WITHOUT performing that climactic act.
 *
 * Sound & conservative — it fires ONLY when all hold (so it detects fewer cases, never
 * wrong ones): exactly one win_condition; the win requires a guaranteed `has_flag` F
 * (top-level or in all_of; any_of/none_of are opaque); F is settable; and max_score is
 * reachable by score awards none co-located with a setter of F. A WARNING, not an error
 * (a peaked-early score is a quality nit, not a broken game).
 *
 * Locked here:
 *   (1) the four shipped SCORING packs produce ZERO SCORE_PEAKS_BEFORE_WIN findings and
 *       stay green (their wins turn on `visited`/`has_item`, and alchemists' cure carries
 *       the +5 — exactly the bug_0104 fix this check would otherwise have flagged);
 *   (2) the pre-bug_0104 shape (win turns on a flag set by an UNSCORED act, while
 *       max_score is fully reachable before it) IS flagged — bug-first;
 *   (3) moving the capstone award ONTO that flag-setting act clears the finding;
 *   (4) a navigation-only win (`visited`, no required has_flag) is NEVER flagged, even
 *       when the full score is reachable before the final step (the sealed_crypt /
 *       cold_forge / sunken_barrow denouement-step shape — not the smell);
 *   (5) a pack with MORE THAN ONE win_condition is left alone (a second, flagless win
 *       could be the real climax — the multi-win soundness guard);
 *   (6) an RPG pack reaches the check through validateRpg (the delegation path).
 */
import { describe, it, expect } from "vitest";
import { compileParserPack, loadParserPackFile } from "../../src/parser/pack.js";
import { compileRpgPack, loadRpgPackFile } from "../../src/rpg/pack.js";
import { validateParser } from "../../src/validate/parser_validator.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";

const CODE = "SCORE_PEAKS_BEFORE_WIN";

function parserCodes(src: string): string[] {
  const r = compileParserPack(src);
  expect(r.ok).toBe(true);
  if (!r.ok) return [];
  return validateParser(r.compiled.pack).findings.map((f) => f.code);
}

/**
 * A two-room pack whose win turns on a `has_flag` set by the `shrine` READ act. The
 * `book` READ awards `bookScore` points (never on the win-trigger act); the shrine
 * READ sets the win flag and awards `cureScore`. With bookScore == max_score and
 * cureScore 0, the perfect score is reachable before the win-trigger act (the smell);
 * moving the capstone onto the shrine (bookScore < max, cureScore > 0) clears it.
 */
const flagWinPack = (bookScore: number, cureScore: number, maxScore: number): string => `
meta: { id: t, title: T, start_room: a, max_score: ${maxScore} }
rooms:
  - id: a
    name: A
    description: "base"
    objects: [book, shrine]
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: "B"
    exits: [{ direction: south, to: a }]
objects:
  - id: book
    name: book
    description: "a book"
    read_text: "words"
    interactions:
      - verb: READ
        target: book
        conditions: [{ not_flag: read_book }]
        effects:
          - set_flag: read_book
          - inc_var: { name: score, by: ${bookScore} }
  - id: shrine
    name: shrine
    description: "a shrine"
    interactions:
      - verb: READ
        target: shrine
        conditions: [{ not_flag: cured }]
        effects:
          - set_flag: cured
${cureScore > 0 ? `          - inc_var: { name: score, by: ${cureScore} }` : ""}
win_conditions: [{ id: w, conditions: [{ has_flag: cured }, { has_flag: read_book }], ending: e }]
endings: [{ id: e, title: E, text: "done" }]
`;

/** A navigation-only win (visited b): no required has_flag, full score reachable before
 *  the final step — the denouement-step shape, which must NOT be flagged. */
const navWinPack = `
meta: { id: t, title: T, start_room: a, max_score: 15 }
rooms:
  - id: a
    name: A
    description: "base"
    objects: [book]
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: "B"
    exits: [{ direction: south, to: a }]
objects:
  - id: book
    name: book
    description: "a book"
    read_text: "words"
    interactions:
      - verb: READ
        target: book
        conditions: [{ not_flag: read_book }]
        effects:
          - set_flag: read_book
          - inc_var: { name: score, by: 15 }
win_conditions: [{ id: w, conditions: [{ visited: b }], ending: e }]
endings: [{ id: e, title: E, text: "done" }]
`;

/** Two win_conditions — one flag-triggered & maxable-without, one navigation-only.
 *  The multi-win guard means NEITHER is flagged. */
const multiWinPack = `
meta: { id: t, title: T, start_room: a, max_score: 15 }
rooms:
  - id: a
    name: A
    description: "base"
    objects: [book, shrine]
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: "B"
    exits: [{ direction: south, to: a }]
objects:
  - id: book
    name: book
    description: "a book"
    read_text: "words"
    interactions:
      - verb: READ
        target: book
        conditions: [{ not_flag: read_book }]
        effects:
          - set_flag: read_book
          - inc_var: { name: score, by: 15 }
  - id: shrine
    name: shrine
    description: "a shrine"
    interactions:
      - verb: READ
        target: shrine
        conditions: [{ not_flag: cured }]
        effects: [{ set_flag: cured }]
win_conditions:
  - { id: w_flag, conditions: [{ has_flag: cured }], ending: e }
  - { id: w_nav, conditions: [{ visited: b }], ending: e }
endings: [{ id: e, title: E, text: "done" }]
`;

describe("bug_0116 — the parser/RPG validator flags a perfect score reachable before the win", () => {
  it("the four shipped scoring packs produce ZERO SCORE_PEAKS_BEFORE_WIN findings and stay green", () => {
    for (const path of [
      "content/parser/pack/sealed_crypt.yaml",
      "content/parser/pack/alchemists_tower.yaml",
    ]) {
      const r = loadParserPackFile(path);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const report = validateParser(r.compiled.pack);
      expect(report.findings.map((f) => f.code)).not.toContain(CODE);
      expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    }
    for (const path of [
      "content/rpg/pack/cold_forge.yaml",
      "content/rpg/pack/sunken_barrow.yaml",
    ]) {
      const r = loadRpgPackFile(path);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const report = validateRpg(r.compiled.pack);
      expect(report.findings.map((f) => f.code)).not.toContain(CODE);
      expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    }
  });

  it("flags the pre-bug_0104 shape: max_score reachable before the win-trigger flag is set", () => {
    const codes = parserCodes(flagWinPack(15, 0, 15));
    expect(codes).toContain(CODE);
    const r = compileParserPack(flagWinPack(15, 0, 15));
    expect(r.ok).toBe(true);
    if (r.ok) {
      const f = validateParser(r.compiled.pack).findings.find((x) => x.code === CODE);
      expect(f?.severity).toBe("warning");
      expect(f?.message).toContain("cured");
    }
  });

  it("clears the finding once the capstone award lives on the flag-setting act (the bug_0104 fix)", () => {
    // book +10 (not on the win act) + shrine +5 (sets `cured`, the win trigger) = 15 = max.
    expect(parserCodes(flagWinPack(10, 5, 15))).not.toContain(CODE);
  });

  it("never flags a navigation-only win, even with the full score reachable before the final step", () => {
    expect(parserCodes(navWinPack)).not.toContain(CODE);
  });

  it("leaves a multi-win pack alone (a second, flagless win could be the real climax)", () => {
    expect(parserCodes(multiWinPack)).not.toContain(CODE);
  });

  it("reaches the check through validateRpg (the RPG validator delegates to the parser one)", () => {
    // A minimal RPG pack whose win turns on a flag the player sets, with the full score
    // reachable before it — proving the delegation path carries the check. (No current
    // RPG pack wins on a has_flag, so this exercises the path a future one would hit.)
    const src = `
meta:
  id: rt
  title: RT
  start_room: a
  vars_init: { hp: 10, attack: 3, defense: 1, score: 0 }
  flags_init: []
  max_score: 15
rooms:
  - id: a
    name: A
    description: "base"
    objects: [book, shrine]
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: "B"
    exits: [{ direction: south, to: a }]
objects:
  - id: book
    name: book
    description: "a book"
    read_text: "words"
    interactions:
      - verb: READ
        target: book
        conditions: [{ not_flag: read_book }]
        effects:
          - set_flag: read_book
          - inc_var: { name: score, by: 15 }
  - id: shrine
    name: shrine
    description: "a shrine"
    interactions:
      - verb: READ
        target: shrine
        conditions: [{ not_flag: cured }]
        effects: [{ set_flag: cured }]
npcs: []
enemies: []
win_conditions: [{ id: w, conditions: [{ has_flag: cured }, { has_flag: read_book }], ending: e }]
endings: [{ id: e, title: E, text: "done" }]
`;
    const r = compileRpgPack(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(validateRpg(r.compiled.pack).findings.map((f) => f.code)).toContain(CODE);
  });
});
