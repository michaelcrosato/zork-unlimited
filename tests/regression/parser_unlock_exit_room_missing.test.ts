/**
 * Regression (§15) for bug_0278 — the PARSER validator (and so the RPG validator,
 * which delegates to it) now flags an UNLOCK_EXIT_ROOM_MISSING: an `unlock_exit` effect
 * whose `from` or `to` names a room id absent from `pack.rooms`. It is the room-id
 * analogue of EXIT_TARGET_MISSING specifically for the unlock_exit effect, and seals
 * the final gap in INTRA-FRAME room-reference integrity — completing the assume-guarantee
 * ladder toward the deferred world-frame manifest.
 *
 * THE LATENT FOOTGUN: a typo'd `unlock_exit.from` or `.to` silently writes an
 * unreachable exit-flag key (__exit:phantom->real instead of __exit:real->real).
 * At runtime the effect APPEARS to succeed (no exception is thrown), but the written
 * flag can never match any exit's conditions check (which uses the same exitFlag formula
 * keyed on DECLARED room ids), making the unlock a permanent silent no-op — harder to
 * diagnose than a dead gate because the effect fires without error.
 *
 * SOUNDNESS: keyed STRICTLY on `roomIds` membership (the same set the start_room /
 * exit.to / npc.room / UNRESOLVED_ROOM_REFERENCE checks use). Error severity is sound:
 * a dangling unlock_exit room id is a structural defect, not a deliberate transient.
 * Purely ADDITIVE — one new error code; weakens no existing matcher.
 *
 * Locked here:
 *   (a) ALL shipped parser + RPG packs produce ZERO UNLOCK_EXIT_ROOM_MISSING findings
 *       and stay green. The 5 packs that use unlock_exit — lamplighters_round ×2,
 *       sealed_crypt ×2, tide_mill ×1 — specifically must produce zero findings.
 *   (b) Positive (`from` side): a `unlock_exit: { from: ghost_room, to: b }` where
 *       `ghost_room` is not declared IS flagged at severity `error`, message contains
 *       `ghost_room`.
 *   (c) Positive (`to` side): a `unlock_exit: { from: a, to: ghost_room }` where
 *       `ghost_room` is not declared IS flagged at severity `error`, message contains
 *       `ghost_room`.
 *   (d) NON-VACUITY (mandatory): correcting the bogus id to a DECLARED room clears the
 *       finding, proving the check keys on the genuine dangling ref, not the mere
 *       presence of `unlock_exit` — the same SoundnessBench discipline (arXiv:2412.03154)
 *       the INERT_OBJECT_STATE / negative corpora use.
 *   (e) Both sides dangle: `unlock_exit: { from: ghost_a, to: ghost_b }` where BOTH are
 *       undeclared — assert the findings include UNLOCK_EXIT_ROOM_MISSING for each
 *       dangling side.
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

/** A minimal winnable two-room (a/b) parser pack with an object (`lever`) whose USE
 *  interaction has the given effects. The two declared rooms are `a` and `b`. */
const pack = (effects: string): string => `
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
      - { verb: USE, effects: [ ${effects} ] }
win_conditions: [{ id: w, conditions: [{ visited: b }], ending: e }]
endings: [{ id: e, title: E, text: "done" }]
`;

describe("bug_0278 — the parser/RPG validator flags a dangling unlock_exit room reference", () => {
  it("(a) all shipped parser + RPG packs produce ZERO UNLOCK_EXIT_ROOM_MISSING findings and stay green", () => {
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
          ).not.toContain("UNLOCK_EXIT_ROOM_MISSING");
        } else {
          const r = loadParserPackFile(path);
          expect(r.ok, path).toBe(true);
          if (!r.ok) continue;
          const codes = validateParser(r.compiled.pack).findings.map((f) => f.code);
          expect(codes, path).not.toContain("UNLOCK_EXIT_ROOM_MISSING");
        }
      }
    }
  });

  it("(b) flags `unlock_exit: { from: ghost_room, to: b }` (dangling `from`) at severity error", () => {
    const src = pack("{ unlock_exit: { from: ghost_room, to: b } }");
    const codes = parserCodes(src);
    expect(codes).toContain("UNLOCK_EXIT_ROOM_MISSING");
    const r = compileParserPack(src);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const f = validateParser(r.compiled.pack).findings.find(
        (x) => x.code === "UNLOCK_EXIT_ROOM_MISSING",
      );
      expect(f?.severity).toBe("error");
      expect(f?.message).toContain("ghost_room");
    }
  });

  it("(c) flags `unlock_exit: { from: a, to: ghost_room }` (dangling `to`) at severity error", () => {
    const src = pack("{ unlock_exit: { from: a, to: ghost_room } }");
    const codes = parserCodes(src);
    expect(codes).toContain("UNLOCK_EXIT_ROOM_MISSING");
    const r = compileParserPack(src);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const f = validateParser(r.compiled.pack).findings.find(
        (x) => x.code === "UNLOCK_EXIT_ROOM_MISSING",
      );
      expect(f?.severity).toBe("error");
      expect(f?.message).toContain("ghost_room");
    }
  });

  it("(d) NON-VACUITY: correcting the bogus id to a DECLARED room clears the finding", () => {
    // Both from and to point to declared rooms → no dangling ref.
    const src = pack("{ unlock_exit: { from: a, to: b } }");
    const codes = parserCodes(src);
    expect(codes).not.toContain("UNLOCK_EXIT_ROOM_MISSING");
  });

  it("(e) both sides dangle: unlock_exit with both from and to undeclared fires UNLOCK_EXIT_ROOM_MISSING for each side", () => {
    const src = pack("{ unlock_exit: { from: ghost_a, to: ghost_b } }");
    const r = compileParserPack(src);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const findings = validateParser(r.compiled.pack).findings.filter(
        (x) => x.code === "UNLOCK_EXIT_ROOM_MISSING",
      );
      // One finding per dangling side: ghost_a (from) and ghost_b (to).
      const messages = findings.map((f) => f.message);
      expect(messages.some((m) => m.includes("ghost_a"))).toBe(true);
      expect(messages.some((m) => m.includes("ghost_b"))).toBe(true);
    }
  });
});
