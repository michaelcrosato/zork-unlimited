/**
 * Regression (§15) for bug_0291 — the PARSER validator (and so the RPG validator,
 * which delegates to it) now flags OBJECT_STATE_REF_MISSING: an `open_object`,
 * `set_object_locked`, or `place_object` effect whose target object id is absent from
 * `pack.objects`. It is the object-id analogue of ITEM_REF_MISSING (bug_0281) and
 * EXIT_TARGET_MISSING (a room you can navigate to that doesn't exist), completing
 * intra-frame reference-integrity across object-state effect kinds.
 *
 * THE LATENT FOOTGUN: a typo'd `open_object: "chst"` silently populates openableObjects
 * with the phantom string "chst". At runtime the engine's applyEffect calls
 * patchObject(state, "chst", { open: true }), writing into objectState["chst"] — a key
 * with no corresponding declared object. No description, no interactions, no rendering
 * path. The phantom state entry persists invisibly. A typo'd
 * `set_object_locked: { id: "chst", locked: false }` silently writes
 * objectState["chst"].locked = false — the keyed UNLOCK verb guards on the real object
 * "chest" (which remains locked), the puzzle cannot be completed, and no error is
 * reported. A typo'd `place_object: { id: "chst", room: "vault" }` silently places a
 * nonexistent object into the vault room — the object is never rendered, the
 * puzzle-design intent is defeated, and validation currently says nothing.
 *
 * SOUNDNESS: keyed STRICTLY on `objById` membership (the Map built from pack.objects at
 * the top of validateParser). Error severity is sound: a dangling object-state ref is a
 * structural defect, not a deliberate transient. Purely ADDITIVE — one new error code;
 * weakens no existing matcher.
 *
 * Locked here:
 *   (a) ALL shipped parser + RPG packs produce ZERO OBJECT_STATE_REF_MISSING findings
 *       and stay green (verified: no shipped pack uses open_object, set_object_locked, or
 *       place_object — only content/engine_contract.yaml names them as vocabulary
 *       declarations).
 *   (b) Positive (open_object): an `open_object` targeting an undeclared object id IS
 *       flagged at severity `error` with code `OBJECT_STATE_REF_MISSING` and the phantom
 *       id in the message.
 *   (c) Positive (set_object_locked): a `set_object_locked` with a dangling id IS
 *       flagged at severity `error` with code `OBJECT_STATE_REF_MISSING`.
 *   (d) NON-VACUITY (mandatory): correcting the bogus id to a declared object id clears
 *       the finding, proving the check keys on the genuine dangling ref, not the mere
 *       presence of an open_object/set_object_locked/place_object effect.
 *   (e) All three effect kinds covered: `open_object`, `set_object_locked`, AND
 *       `place_object.id` each dangling independently each fires
 *       OBJECT_STATE_REF_MISSING (the check covers all three effect kinds).
 */
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { compileParserPack, loadParserPackFile } from "../../src/parser/pack.js";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import { validateParser } from "../../src/validate/parser_validator.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";

function parserCodes(src: string): string[] {
  const r = compileParserPack(src);
  expect(r.ok).toBe(true);
  if (!r.ok) return [];
  return validateParser(r.compiled.pack).findings.map((f) => f.code);
}

/** A minimal winnable two-room (a/b) parser pack with an object (`chest`) whose given
 *  verb interaction has the given effects. The declared objects are `chest` and `box`.
 *  The two declared rooms are `a` and `b`. */
const pack = (verb: string, effects: string): string => `
meta: { id: t, title: T, start_room: a }
rooms:
  - id: a
    name: A
    description: "base"
    objects: [chest]
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: "B"
    exits: [{ direction: south, to: a }]
objects:
  - id: chest
    name: chest
    description: "a chest"
    openable: true
    interactions:
      - { verb: ${verb}, effects: [ ${effects} ] }
  - id: box
    name: box
    description: "a box"
    openable: true
    interactions: []
win_conditions: [{ id: w, conditions: [{ visited: b }], ending: e }]
endings: [{ id: e, title: E, text: "done" }]
`;

describe("bug_0291 — the parser/RPG validator flags a dangling open_object, set_object_locked, or place_object object reference", () => {
  it("(a) all shipped parser + RPG packs produce ZERO OBJECT_STATE_REF_MISSING findings and stay green", () => {
    for (const dir of ["content/parser/pack", "content/rpg/pack"]) {
      if (!existsSync(dir)) continue;
      const isRpg = dir.includes("/rpg/");
      for (const file of readdirSync(dir)) {
        if (!file.endsWith(".yaml")) continue;
        const path = `${dir}/${file}`;
        if (isRpg) {
          const r = loadRpgPackFile(path);
          expect(r.ok, path).toBe(true);
          if (!r.ok) continue;
          const report = validateRpg(r.compiled.pack);
          expect(
            report.findings.map((f) => f.code),
            path,
          ).not.toContain("OBJECT_STATE_REF_MISSING");
        } else {
          const r = loadParserPackFile(path);
          expect(r.ok, path).toBe(true);
          if (!r.ok) continue;
          const codes = validateParser(r.compiled.pack).findings.map((f) => f.code);
          expect(codes, path).not.toContain("OBJECT_STATE_REF_MISSING");
        }
      }
    }
  });

  it("(b) flags `open_object: phantom_box` (undeclared object id) at severity error", () => {
    const src = pack("OPEN", "{ open_object: phantom_box }");
    const codes = parserCodes(src);
    expect(codes).toContain("OBJECT_STATE_REF_MISSING");
    const r = compileParserPack(src);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const f = validateParser(r.compiled.pack).findings.find(
        (x) => x.code === "OBJECT_STATE_REF_MISSING",
      );
      expect(f?.severity).toBe("error");
      expect(f?.message).toContain("phantom_box");
    }
  });

  it("(c) flags `set_object_locked: { id: phantom_box, locked: false }` (undeclared object id) at severity error", () => {
    const src = pack("USE", "{ set_object_locked: { id: phantom_box, locked: false } }");
    const codes = parserCodes(src);
    expect(codes).toContain("OBJECT_STATE_REF_MISSING");
    const r = compileParserPack(src);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const f = validateParser(r.compiled.pack).findings.find(
        (x) => x.code === "OBJECT_STATE_REF_MISSING",
      );
      expect(f?.severity).toBe("error");
      expect(f?.message).toContain("phantom_box");
    }
  });

  it("(d) NON-VACUITY: correcting the bogus id to a DECLARED object id clears the finding", () => {
    // open_object targets the declared object `box` → no dangling ref.
    const src = pack("OPEN", "{ open_object: box }");
    const codes = parserCodes(src);
    expect(codes).not.toContain("OBJECT_STATE_REF_MISSING");
  });

  it("(e) all three effect kinds (open_object, set_object_locked, place_object) each independently fire OBJECT_STATE_REF_MISSING when dangling", () => {
    // Three separate interactions on `chest`, each with a different dangling effect kind.
    const src = `
meta: { id: t, title: T, start_room: a }
rooms:
  - id: a
    name: A
    description: "base"
    objects: [chest]
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: "B"
    exits: [{ direction: south, to: a }]
objects:
  - id: chest
    name: chest
    description: "a chest"
    openable: true
    interactions:
      - { verb: OPEN, effects: [ { open_object: phantom_open } ] }
      - { verb: USE, effects: [ { set_object_locked: { id: phantom_locked, locked: false } } ] }
      - { verb: READ, effects: [ { place_object: { id: phantom_placed, room: a } } ] }
win_conditions: [{ id: w, conditions: [{ visited: b }], ending: e }]
endings: [{ id: e, title: E, text: "done" }]
`;
    const r = compileParserPack(src);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const findings = validateParser(r.compiled.pack).findings.filter(
        (x) => x.code === "OBJECT_STATE_REF_MISSING",
      );
      // One finding per dangling object ref: phantom_open, phantom_locked, phantom_placed.
      const messages = findings.map((f) => f.message);
      expect(messages.some((m) => m.includes("phantom_open"))).toBe(true);
      expect(messages.some((m) => m.includes("phantom_locked"))).toBe(true);
      expect(messages.some((m) => m.includes("phantom_placed"))).toBe(true);
    }
  });
});
