/**
 * Regression (§15) for bug_0281 — the PARSER validator (and so the RPG validator,
 * which delegates to it) now flags an ITEM_REF_MISSING: an `add_item` or `remove_item`
 * effect whose target id is absent from `pack.objects`. It is the item-id analogue of
 * EXIT_TARGET_MISSING (a room you can navigate to that doesn't exist) and
 * UNRESOLVED_ROOM_REFERENCE (a condition that evaluates permanently false because the
 * room id was typo'd), completing intra-frame reference-integrity across all three
 * reference families (room refs, unlock_exit room refs, item refs).
 *
 * THE LATENT FOOTGUN: a typo'd `add_item: "lantren"` silently inserts a phantom string
 * into inventory — no object description, no interaction entries, appears with a nonsense
 * label. A typo'd `remove_item: "lantren"` silently no-ops, leaving puzzle state wrong.
 * Neither is flagged by any existing check: ITEM_REQUIRED_UNOBTAINABLE only fires on
 * `has_item` gates whose item cannot be obtained — it does NOT check that the item is a
 * declared object id.
 *
 * SOUNDNESS: keyed STRICTLY on `objById` membership (the Map built from pack.objects at
 * the top of validateParser). Error severity is sound: a dangling item id is a structural
 * defect, not a deliberate transient. Purely ADDITIVE — one new error code; weakens no
 * existing matcher.
 *
 * Locked here:
 *   (a) ALL shipped parser + RPG packs produce ZERO ITEM_REF_MISSING findings and stay
 *       green (verified: 0 dangling item refs across all 17 shipped packs).
 *   (b) Positive (add_item): an `add_item` targeting an undeclared object id IS flagged
 *       at severity `error` with code `ITEM_REF_MISSING` and the phantom id in the
 *       message.
 *   (c) Positive (remove_item): a `remove_item` targeting an undeclared object id IS
 *       flagged at severity `error` with code `ITEM_REF_MISSING`.
 *   (d) NON-VACUITY (mandatory): correcting the bogus id to a declared object id clears
 *       the finding, proving the check keys on the genuine dangling ref, not the mere
 *       presence of an add_item/remove_item effect.
 *   (e) Both add_item AND remove_item dangle in the same pack — each independently fires
 *       ITEM_REF_MISSING (the check covers both effect kinds).
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
 *  verb interaction has the given effects. The declared objects are `chest` and `key`.
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
    interactions:
      - { verb: ${verb}, effects: [ ${effects} ] }
  - id: key
    name: key
    description: "a key"
    takeable: true
    interactions: []
win_conditions: [{ id: w, conditions: [{ visited: b }], ending: e }]
endings: [{ id: e, title: E, text: "done" }]
`;

describe("bug_0281 — the parser/RPG validator flags a dangling add_item or remove_item item reference", () => {
  it("(a) all shipped parser + RPG packs produce ZERO ITEM_REF_MISSING findings and stay green", () => {
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
          ).not.toContain("ITEM_REF_MISSING");
        } else {
          const r = loadParserPackFile(path);
          expect(r.ok, path).toBe(true);
          if (!r.ok) continue;
          const codes = validateParser(r.compiled.pack).findings.map((f) => f.code);
          expect(codes, path).not.toContain("ITEM_REF_MISSING");
        }
      }
    }
  });

  it("(b) flags `add_item: phantom_key` (undeclared object id) at severity error", () => {
    const src = pack("OPEN", "{ add_item: phantom_key }");
    const codes = parserCodes(src);
    expect(codes).toContain("ITEM_REF_MISSING");
    const r = compileParserPack(src);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const f = validateParser(r.compiled.pack).findings.find((x) => x.code === "ITEM_REF_MISSING");
      expect(f?.severity).toBe("error");
      expect(f?.message).toContain("phantom_key");
    }
  });

  it("(c) flags `remove_item: phantom_key` (undeclared object id) at severity error", () => {
    const src = pack("USE", "{ remove_item: phantom_key }");
    const codes = parserCodes(src);
    expect(codes).toContain("ITEM_REF_MISSING");
    const r = compileParserPack(src);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const f = validateParser(r.compiled.pack).findings.find((x) => x.code === "ITEM_REF_MISSING");
      expect(f?.severity).toBe("error");
      expect(f?.message).toContain("phantom_key");
    }
  });

  it("(d) NON-VACUITY: correcting the bogus id to a DECLARED object id clears the finding", () => {
    // add_item targets the declared object `key` → no dangling ref.
    const src = pack("OPEN", "{ add_item: key }");
    const codes = parserCodes(src);
    expect(codes).not.toContain("ITEM_REF_MISSING");
  });

  it("(e) both add_item AND remove_item dangle in the same pack — each independently fires ITEM_REF_MISSING", () => {
    // Two separate interactions on `chest`: one add_item and one remove_item, both dangling.
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
    interactions:
      - { verb: OPEN, effects: [ { add_item: phantom_add } ] }
      - { verb: USE, effects: [ { remove_item: phantom_remove } ] }
win_conditions: [{ id: w, conditions: [{ visited: b }], ending: e }]
endings: [{ id: e, title: E, text: "done" }]
`;
    const r = compileParserPack(src);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const findings = validateParser(r.compiled.pack).findings.filter(
        (x) => x.code === "ITEM_REF_MISSING",
      );
      // One finding per dangling item ref: phantom_add (add_item) and phantom_remove (remove_item).
      const messages = findings.map((f) => f.message);
      expect(messages.some((m) => m.includes("phantom_add"))).toBe(true);
      expect(messages.some((m) => m.includes("phantom_remove"))).toBe(true);
    }
  });
});
