/**
 * Regression (§15) for bug_0106 — the PARSER validator (and so the RPG validator,
 * which delegates to it) now flags an INERT FLAG, porting the CYOA check from
 * bug_0104 and completing the soundness family already mirrored here
 * (UNREACHABLE_VARIANT shadowing, UNSATISFIABLE_CONDITION — bug_0091).
 *
 * A flag that some `set_flag` effect writes (a room on_enter, an interaction, an
 * object's unlock_effects, an NPC dialogue node, or — for RPG — an enemy
 * `defeat_flag` / on_defeat / skill-check branch), or that flags_init declares, but
 * that NO condition anywhere READS (has_flag/not_flag, descending all_of/any_of/
 * none_of across exit/interaction/win conditions, room & object variant `when`s, and
 * dialogue-topic gates) is dead bookkeeping — the write changes nothing the game ever
 * consults. A blind playtester cannot judge this from inside the game (bug_0104).
 *
 * Soundness is the bar: a flag is flagged ONLY when it has provably zero readers
 * across the whole pack, so a flag consulted only via not_flag (the one-shot
 * dialogue/interaction idiom these packs lean on) or only inside a disjunction is
 * never flagged. Warning, not error — an inert flag is a no-op, never a soft-lock.
 * Locked here:
 *   (1) the shipped parser + RPG packs produce ZERO INERT_FLAG findings and stay green
 *       (every set_flag/defeat_flag they write is read — the heard_* flags via not_flag);
 *   (2) a flag set by an interaction but never read is flagged;
 *   (3) a flag set by a room on_enter but never read is flagged;
 *   (4) a flags_init flag that nothing reads is flagged;
 *   (5) a flag whose ONLY reader is a not_flag is NOT flagged;
 *   (6) a flag read only inside a disjunction (any_of) is NOT flagged;
 *   (7) an RPG enemy defeat_flag that no condition reads IS flagged (via validateRpg —
 *       proving the runtime-written flag set is covered, not just declared set_flags).
 */
import { describe, it, expect } from "vitest";
import { compileParserPack, loadParserPackFile } from "../../src/parser/pack.js";
import { compileRpgPack, loadRpgPackFile } from "../../src/rpg/pack.js";
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

/** A minimal winnable parser pack whose start room `a` carries the given object
 *  block and (optional) start-room on_enter. Win = reach `b`. */
const pack = (opts: { onEnter?: string; objects?: string; objectRefs?: string } = {}): string => `
meta: { id: t, title: T, start_room: a }
rooms:
  - id: a
    name: A
    description: "base"
${opts.onEnter ? `    on_enter:\n${opts.onEnter}\n` : ""}    objects: [${opts.objectRefs ?? ""}]
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: "B"
    exits: [{ direction: south, to: a }]
${opts.objects ? `objects:\n${opts.objects}` : ""}
win_conditions: [{ id: w, conditions: [{ visited: b }], ending: e }]
endings: [{ id: e, title: E, text: "done" }]
`;

describe("bug_0106 — the parser/RPG validator flags inert (set-but-never-read) flags", () => {
  it("the shipped parser + RPG packs produce ZERO INERT_FLAG findings and stay green", () => {
    for (const path of ["content/parser/pack/sealed_crypt.yaml"]) {
      const r = loadParserPackFile(path);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const codes = validateParser(r.compiled.pack).findings.map((f) => f.code);
      expect(codes).not.toContain("INERT_FLAG");
    }
    for (const path of [
      "content/rpg/pack/cold_forge.yaml",
      "content/rpg/pack/sunken_barrow.yaml",
    ]) {
      const r = loadRpgPackFile(path);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const report = validateRpg(r.compiled.pack);
      expect(report.findings.map((f) => f.code)).not.toContain("INERT_FLAG");
      expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    }
  });

  it("flags a flag set by an interaction but never read by any condition", () => {
    const src = pack({
      objectRefs: "note",
      objects: `  - id: note
    name: note
    description: "a note"
    interactions:
      - { verb: READ, effects: [ { set_flag: dead_flag } ] }`,
    });
    const codes = parserCodes(src);
    expect(codes).toContain("INERT_FLAG");
    const r = compileParserPack(src);
    if (r.ok) {
      const f = validateParser(r.compiled.pack).findings.find((x) => x.code === "INERT_FLAG");
      expect(f?.severity).toBe("warning");
      expect(f?.message).toContain("dead_flag");
    }
  });

  it("flags a flag set by a room on_enter but never read", () => {
    const src = pack({ onEnter: `      - { set_flag: entered_a }` });
    expect(parserCodes(src)).toContain("INERT_FLAG");
  });

  it("flags a flags_init flag that nothing ever reads", () => {
    const src = `
meta: { id: t, title: T, start_room: a, flags_init: [ orphan ] }
rooms:
  - id: a
    name: A
    description: "base"
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: "B"
    exits: [{ direction: south, to: a }]
win_conditions: [{ id: w, conditions: [{ visited: b }], ending: e }]
endings: [{ id: e, title: E, text: "done" }]
`;
    expect(parserCodes(src)).toContain("INERT_FLAG");
  });

  it("does NOT flag a flag whose only reader is a not_flag (the one-shot idiom)", () => {
    const src = pack({
      objectRefs: "lever",
      objects: `  - id: lever
    name: lever
    description: "a lever"
    interactions:
      - { verb: READ, conditions: [ { not_flag: pulled } ], effects: [ { set_flag: pulled } ] }`,
    });
    expect(parserCodes(src)).not.toContain("INERT_FLAG");
  });

  it("does NOT flag a flag read only inside a disjunction (any_of)", () => {
    const src = pack({
      onEnter: `      - { set_flag: seen }`,
      objectRefs: "door",
      objects: `  - id: door
    name: door
    description: "a door"
    interactions:
      - { verb: READ, conditions: [ { any_of: [ { has_flag: seen }, { has_flag: never } ] } ], effects: [] }`,
    });
    // `seen` is read inside an any_of — a real (disjunctive) reader, so NOT inert.
    expect(parserCodes(src)).not.toContain("INERT_FLAG");
  });

  it("flags an RPG enemy defeat_flag that no condition reads (via validateRpg)", () => {
    const src = `
meta: { id: t, title: T, start_room: a, vars_init: { hp: 20, attack: 5, defense: 2 } }
rooms:
  - id: a
    name: A
    description: "base"
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: "B"
    exits: [{ direction: south, to: a }]
enemies:
  - id: foe
    name: foe
    description: "a foe"
    room: a
    hp: 6
    attack: 3
    defense: 1
    defeat_flag: foe_slain
    death_ending: dead
win_conditions: [{ id: w, conditions: [{ visited: b }], ending: e }]
endings:
  - { id: e, title: E, text: "done" }
  - { id: dead, title: D, text: "dead", death: true }
`;
    const codes = rpgCodes(src);
    expect(codes).toContain("INERT_FLAG");
    const r = compileRpgPack(src);
    if (r.ok) {
      const f = validateRpg(r.compiled.pack).findings.find((x) => x.code === "INERT_FLAG");
      expect(f?.message).toContain("foe_slain");
    }
  });
});
