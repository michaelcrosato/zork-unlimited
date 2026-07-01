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
 * win_condition turns on a deliberate climactic ACT the player must perform, the perfect
 * score should not already be reachable WITHOUT performing it. bug_0117 widened "act"
 * from `has_flag` (SET the win flag) to also cover `has_item` (CLAIM the relic the win
 * turns on — taking it is a chosen act, structurally the alchemists cure / the sunken
 * barrow circlet's +25 take_effects). `visited` stays excluded: a navigation win's final
 * step can still be mere LOCOMOTION, a denouement that rightly awards nothing.
 *
 * Sound & conservative — it fires ONLY when all hold (so it detects fewer cases, never
 * wrong ones): exactly one win_condition; the win requires a guaranteed `has_flag` F or
 * `has_item` I (top-level or in all_of; any_of/none_of are opaque); the act is
 * performable (some list sets F / grants I); and max_score is reachable by score awards
 * none co-located with it. A WARNING, not an error (a peaked-early score is a quality nit).
 *
 * Locked here:
 *   (1) the four shipped SCORING packs produce ZERO SCORE_PEAKS_BEFORE_WIN findings and
 *       stay green (their wins turn on `visited`/`has_item`, and alchemists' cure carries
 *       the +5 — exactly the bug_0104 fix this check would otherwise have flagged);
 *   (2) the pre-bug_0104 shape (win turns on a flag set by an UNSCORED act, while
 *       max_score is fully reachable before it) IS flagged — bug-first;
 *   (3) moving the capstone award ONTO that flag-setting act clears the finding;
 *   (4) a navigation-only win (`visited`, no required has_flag) is NEVER flagged, even
 *       when the full score is reachable before the final step (the cold_forge-style
 *       denouement-step shape — not the smell);
 *   (5) a pack with MORE THAN ONE win_condition is left alone (a second, flagless win
 *       could be the real climax — the multi-win soundness guard);
 *   (6) an RPG pack reaches the check through validateRpg (the delegation path);
 *   (7) bug_0117 — a `has_item` win whose winning relic is CLAIMED by an UNSCORED act
 *       (take_effects present but no score) while max_score is reachable before it IS
 *       flagged; moving the capstone onto the relic's take_effects (or an add_item that
 *       grants it) clears it; and a purely-implicit take (a takeable relic with NO
 *       take_effects / add_item — no scriptable act list) is conservatively NOT flagged.
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

/**
 * bug_0117 — a `has_item` win: the player wins by CLAIMING the `relic` in room b (the
 * sunken_barrow circlet shape). The `book` READ in room a awards `bookScore`; the relic
 * is claimed by TAKE.
 *  - `relicScore > 0` → the relic's take_effects award it (the capstone lives on the
 *    claim, like the circlet's +25);
 *  - `relicScore === 0` → take_effects exist but carry no score (the smell: a scripted
 *    claim act that awards nothing while max is reached on the book);
 *  - `implicit` → the relic has NO take_effects at all (a purely implicit take — no
 *    scriptable act list, conservatively NOT flagged).
 */
const itemWinPack = (
  bookScore: number,
  relicScore: number,
  maxScore: number,
  implicit = false,
): string => {
  const takeBlock = implicit
    ? ""
    : `
    take_effects:
${relicScore > 0 ? `      - inc_var: { name: score, by: ${relicScore} }` : `      - narrate: "You lift the relic."`}`;
  return `
meta: { id: t, title: T, start_room: a, max_score: ${maxScore} }
rooms:
  - id: a
    name: A
    description: "base"
    objects: [book]
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: "B"
    objects: [relic]
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
  - id: relic
    name: relic
    description: "a relic"
    takeable: true${takeBlock}
win_conditions: [{ id: w, conditions: [{ has_item: relic }], ending: e }]
endings: [{ id: e, title: E, text: "done" }]
`;
};

describe("bug_0116 — the parser/RPG validator flags a perfect score reachable before the win", () => {
  it("the four shipped scoring packs produce ZERO SCORE_PEAKS_BEFORE_WIN findings and stay green", () => {
    for (const path of ["content/parser/pack/sealed_crypt.yaml"]) {
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

  // ── bug_0117: the has_item extension ───────────────────────────────────────────
  it("flags a has_item win when the winning relic's claim awards nothing and max is reached first", () => {
    // book +15 == max, relic take_effects exist but score 0 → perfect score before the claim.
    const codes = parserCodes(itemWinPack(15, 0, 15));
    expect(codes).toContain(CODE);
    const r = compileParserPack(itemWinPack(15, 0, 15));
    expect(r.ok).toBe(true);
    if (r.ok) {
      const f = validateParser(r.compiled.pack).findings.find((x) => x.code === CODE);
      expect(f?.severity).toBe("warning");
      expect(f?.message).toContain("relic");
      expect(f?.message).toContain("claiming");
    }
  });

  it("clears the finding once the capstone award lives on the relic's claim (take_effects)", () => {
    // book +10 (not on the claim) + relic claim +5 = 15 = max, co-located with the win act.
    expect(parserCodes(itemWinPack(10, 5, 15))).not.toContain(CODE);
  });

  it("never flags a purely-implicit take (no take_effects / add_item — no scriptable claim act)", () => {
    // book +15 == max; relic has NO take_effects, so there is no act list to score —
    // conservatively skipped (WIN_UNREACHABLE's territory), mirroring an unsettable flag.
    expect(parserCodes(itemWinPack(15, 0, 15, true))).not.toContain(CODE);
  });

  it("clears the finding when the relic is granted by a scored add_item act", () => {
    // The relic is handed over (add_item) by a lever pull that also awards the capstone,
    // so max is NOT reachable without that act. book +10 + grant +5 = 15 = max.
    const src = `
meta: { id: t, title: T, start_room: a, max_score: 15 }
rooms:
  - id: a
    name: A
    description: "base"
    objects: [book, lever]
    exits: []
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
          - inc_var: { name: score, by: 10 }
  - id: lever
    name: lever
    description: "a lever"
    interactions:
      - verb: USE
        target: lever
        conditions: [{ not_flag: pulled }]
        effects:
          - set_flag: pulled
          - add_item: relic
          - inc_var: { name: score, by: 5 }
  - id: relic
    name: relic
    description: "a relic"
    takeable: true
win_conditions: [{ id: w, conditions: [{ has_item: relic }], ending: e }]
endings: [{ id: e, title: E, text: "done" }]
`;
    expect(parserCodes(src)).not.toContain(CODE);
  });

  it("flags a has_item win when the granting add_item act is unscored and max is reached first", () => {
    // Same shape, but the lever grant awards nothing and the book carries the full max.
    const src = `
meta: { id: t, title: T, start_room: a, max_score: 15 }
rooms:
  - id: a
    name: A
    description: "base"
    objects: [book, lever]
    exits: []
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
  - id: lever
    name: lever
    description: "a lever"
    interactions:
      - verb: USE
        target: lever
        conditions: [{ not_flag: pulled }]
        effects:
          - set_flag: pulled
          - add_item: relic
  - id: relic
    name: relic
    description: "a relic"
    takeable: true
win_conditions: [{ id: w, conditions: [{ has_item: relic }], ending: e }]
endings: [{ id: e, title: E, text: "done" }]
`;
    expect(parserCodes(src)).toContain(CODE);
  });
});
