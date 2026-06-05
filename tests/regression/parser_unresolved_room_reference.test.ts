/**
 * Regression (§15) for bug_0277 — the PARSER validator (and so the RPG validator,
 * which delegates to it) now flags an UNRESOLVED_ROOM_REFERENCE: a `visited` /
 * `not_visited` / `in_room` condition or a `goto` / `place_object.room` effect that
 * names a room id absent from `pack.rooms`. It is the room-id analogue of the existing
 * EXIT_TARGET_MISSING / NPC_ROOM_MISSING reference checks, and seals INTRA-FRAME
 * room-reference integrity — the next rung on the assume-guarantee ladder toward the
 * deferred world-frame manifest.
 *
 * THE LATENT FOOTGUN: room-naming conditions are bare strings in the schema
 * (conditions.ts: visited/not_visited/in_room are z.string().min(1)); a typo'd room id
 * silently evaluates FALSE forever (visited reads state.visited[id]→undefined→false), a
 * permanently-dead gate the SOFTLOCK pass treats as a deliberate stable-false gate, the
 * exhaustive-BFS solver sees as an unreachable atom, and the metamorphic relabel oracle
 * is bijectively blind to. No existing oracle catches it.
 *
 * SOUNDNESS: keyed STRICTLY on `roomIds` membership (the same set the start_room /
 * exit.to / npc.room checks use). A dangling room ref is a structural bug, NOT a
 * deliberate transient — so error severity is sound here. The read-walker descends all
 * three connectives (all_of/any_of/none_of), so a disjunction-guarded ref still counts.
 * Purely ADDITIVE — one new error code; weakens no existing matcher.
 *
 * Locked here:
 *   (a) ALL shipped parser + RPG packs produce ZERO UNRESOLVED_ROOM_REFERENCE findings
 *       and stay green (14 refs, 0 dangling across all 10 packs);
 *   (b) a `visited`/`in_room` condition naming an undeclared room IS flagged at severity
 *       `error`;
 *   (c) a `goto` and a `place_object: { room }` effect naming an undeclared room ARE
 *       flagged;
 *   (d) NON-VACUITY: correcting the bogus id to a DECLARED room clears the finding,
 *       proving the check keys on the genuine dangling ref, not the condition/effect's
 *       mere presence — the same SoundnessBench discipline (arXiv:2412.03154) the
 *       INERT_OBJECT_STATE / negative corpora use.
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

/** A minimal winnable two-room (a/b) parser pack. `winRoom` is the room id the win
 *  condition gates on (`visited`); `effects` (optional) is a YAML block of effects on a
 *  USE interaction of object `lever` in room `a`. Win = reach the named room. */
const pack = (opts: { winRoom?: string; effects?: string } = {}): string => `
meta: { id: t, title: T, start_room: a }
rooms:
  - id: a
    name: A
    description: "base"
    objects: [${opts.effects ? "lever" : ""}]
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: "B"
    exits: [{ direction: south, to: a }]
${
  opts.effects
    ? `objects:
  - id: lever
    name: lever
    description: "a lever"
    interactions:
      - { verb: USE, effects: [ ${opts.effects} ] }
`
    : ""
}win_conditions: [{ id: w, conditions: [{ visited: ${opts.winRoom ?? "b"} }], ending: e }]
endings: [{ id: e, title: E, text: "done" }]
`;

describe("bug_0277 — the parser/RPG validator flags an unresolved (dangling) room reference", () => {
  it("(a) all shipped parser + RPG packs produce ZERO UNRESOLVED_ROOM_REFERENCE findings and stay green", () => {
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
          ).not.toContain("UNRESOLVED_ROOM_REFERENCE");
        } else {
          const r = loadParserPackFile(path);
          expect(r.ok, path).toBe(true);
          if (!r.ok) continue;
          const codes = validateParser(r.compiled.pack).findings.map((f) => f.code);
          expect(codes, path).not.toContain("UNRESOLVED_ROOM_REFERENCE");
        }
      }
    }
  });

  it("(b) flags a `visited` condition naming an undeclared room, at severity error", () => {
    const src = pack({ winRoom: "nowhere_room" });
    const codes = parserCodes(src);
    expect(codes).toContain("UNRESOLVED_ROOM_REFERENCE");
    const r = compileParserPack(src);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const f = validateParser(r.compiled.pack).findings.find(
        (x) => x.code === "UNRESOLVED_ROOM_REFERENCE",
      );
      expect(f?.severity).toBe("error");
      expect(f?.message).toContain("nowhere_room");
    }
  });

  it("(b') flags an `in_room` condition naming an undeclared room, at severity error", () => {
    // `in_room` gating an interaction on a declared object, naming an undeclared room.
    const src = `
meta: { id: t, title: T, start_room: a }
rooms:
  - id: a
    name: A
    description: "base"
    objects: [lever]
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: "B"
    exits: [{ direction: south, to: a }]
objects:
  - id: lever
    name: lever
    description: "a lever"
    interactions:
      - { verb: USE, conditions: [{ in_room: phantom_room }], effects: [ { add_journal: "click" } ] }
win_conditions: [{ id: w, conditions: [{ visited: b }], ending: e }]
endings: [{ id: e, title: E, text: "done" }]
`;
    const codes = parserCodes(src);
    expect(codes).toContain("UNRESOLVED_ROOM_REFERENCE");
    const r = compileParserPack(src);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const f = validateParser(r.compiled.pack).findings.find(
        (x) => x.code === "UNRESOLVED_ROOM_REFERENCE",
      );
      expect(f?.severity).toBe("error");
      expect(f?.message).toContain("phantom_room");
    }
  });

  it("(c) flags a `goto` effect naming an undeclared room", () => {
    const src = pack({ effects: "{ goto: nowhere_room }" });
    const codes = parserCodes(src);
    expect(codes).toContain("UNRESOLVED_ROOM_REFERENCE");
    const r = compileParserPack(src);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const f = validateParser(r.compiled.pack).findings.find(
        (x) => x.code === "UNRESOLVED_ROOM_REFERENCE",
      );
      expect(f?.severity).toBe("error");
      expect(f?.message).toContain("nowhere_room");
    }
  });

  it("(c') flags a `place_object: { room }` effect naming an undeclared room", () => {
    const src = pack({ effects: "{ place_object: { id: lever, room: phantom_room } }" });
    const codes = parserCodes(src);
    expect(codes).toContain("UNRESOLVED_ROOM_REFERENCE");
    const r = compileParserPack(src);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const f = validateParser(r.compiled.pack).findings.find(
        (x) => x.code === "UNRESOLVED_ROOM_REFERENCE",
      );
      expect(f?.severity).toBe("error");
      expect(f?.message).toContain("phantom_room");
    }
  });

  it("(d) NON-VACUITY: correcting the bogus id to a DECLARED room clears the finding (condition + effect)", () => {
    // The case-(b) condition mutant, but gating on the DECLARED room `b` ⇒ no dangling ref.
    expect(parserCodes(pack({ winRoom: "b" }))).not.toContain("UNRESOLVED_ROOM_REFERENCE");
    // The case-(c) goto mutant, but targeting the DECLARED room `b` ⇒ no dangling ref.
    expect(parserCodes(pack({ effects: "{ goto: b }" }))).not.toContain(
      "UNRESOLVED_ROOM_REFERENCE",
    );
  });
});
