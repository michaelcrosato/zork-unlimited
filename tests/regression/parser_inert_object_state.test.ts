/**
 * Regression (§15) for bug_0262 — the PARSER validator (and so the RPG validator,
 * which delegates to it) now flags an INERT OBJECT-STATE write: the LIVENESS dual of
 * bug_0253's IMPOSSIBLE_OBJECT_STATE (feasibility), the object-state analogue of the
 * INERT_FLAG check (bug_0106).
 *
 * An object whose `is_open` / `is_unlocked` runtime state is WRITTEN by an AUTHORED
 * effect — `open_object: id` or `set_object_locked: { id, locked: false }` — but whose
 * matching state is NEVER read by any condition pack-wide (is_open/is_unlocked,
 * descending all_of/any_of/none_of across exit/interaction/win conditions, room &
 * object variant `when`s, and dialogue-topic gates) is dead bookkeeping: the write
 * changes nothing the game ever consults.
 *
 * CRITICAL SOUNDNESS BOUNDARY: the write-set is keyed STRICTLY on AUTHORED effects, not
 * the over-approximating openableObjects/unlockableObjects (built-in OPEN/UNLOCK verb
 * settability) the bug_0253 feasibility check uses — so an object that is merely openable
 * scenery, or unlocked only via a built-in keyed UNLOCK (the alchemists_tower shape),
 * never warns. Reads descend all three connectives (a disjunction-guarded read counts as
 * consumed), unlike the all_of-only objectStateReqs feasibility helper. Warning, not
 * error — an inert open/unlock is a no-op, never a soft-lock.
 *
 * Locked here:
 *   (a) ALL shipped parser + RPG packs produce ZERO INERT_OBJECT_STATE findings and stay
 *       green (none author an open_object / set_object_locked effect);
 *   (b) an open_object write with no is_open reader IS flagged at severity `warning`;
 *   (c) a set_object_locked(locked:false) write with no is_unlocked reader IS flagged;
 *   (d) NON-VACUITY: adding an is_open reader to the case-(b) mutant clears the warning,
 *       proving the check keys on the genuine write/read slack, not the effect's presence;
 *   (e) an is_open/is_unlocked READ on an object NO authored effect writes (the built-in
 *       verb / alchemists_tower shape) does NOT warn — the dual stays on the write side.
 *
 * bug_0263 completes the check over set_object_locked's FULL domain — the liveness
 * question ("does any condition read is_unlocked?") is independent of the boolean written,
 * so a `locked: true` re-lock is just as inert as a `locked: false` unlock when nothing
 * reads is_unlocked. The original bug_0262 check filtered `locked === false`, letting an
 * unread re-lock escape. Also locked here:
 *   (f) a set_object_locked(locked:true) write with no is_unlocked reader IS flagged at
 *       severity `warning` (the gap bug_0262 left);
 *   (g) NON-VACUITY: adding an is_unlocked reader to the case-(f) mutant clears the warning;
 *   (h) DEDUP: an object both unlocked AND re-locked by effects, with no is_unlocked reader,
 *       warns EXACTLY once (not twice).
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

/** A minimal winnable parser pack whose start room `a` carries the given object block,
 *  object refs, start-room on_enter, and (optional) extra win conditions. Win = reach `b`. */
const pack = (
  opts: { onEnter?: string; objects?: string; objectRefs?: string; winConds?: string } = {},
): string => `
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
win_conditions: [{ id: w, conditions: [{ visited: b }${opts.winConds ?? ""}], ending: e }]
endings: [{ id: e, title: E, text: "done" }]
`;

describe("bug_0262 — the parser/RPG validator flags inert (written-but-never-read) object state", () => {
  it("(a) all shipped parser + RPG packs produce ZERO INERT_OBJECT_STATE findings and stay green", () => {
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
          ).not.toContain("INERT_OBJECT_STATE");
        } else {
          const r = loadParserPackFile(path);
          expect(r.ok, path).toBe(true);
          if (!r.ok) continue;
          const codes = validateParser(r.compiled.pack).findings.map((f) => f.code);
          expect(codes, path).not.toContain("INERT_OBJECT_STATE");
        }
      }
    }
  });

  it("(b) flags an open_object write whose open state no condition reads, at severity warning", () => {
    const src = pack({
      objectRefs: "chest",
      objects: `  - id: chest
    name: chest
    description: "a chest"
    openable: true
    interactions:
      - { verb: READ, effects: [ { open_object: chest } ] }`,
    });
    const codes = parserCodes(src);
    expect(codes).toContain("INERT_OBJECT_STATE");
    const r = compileParserPack(src);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const f = validateParser(r.compiled.pack).findings.find(
        (x) => x.code === "INERT_OBJECT_STATE",
      );
      expect(f?.severity).toBe("warning");
      expect(f?.message).toContain("chest");
      expect(f?.message).toContain("is_open");
    }
  });

  it("(c) flags a set_object_locked(locked:false) write whose unlocked state no condition reads", () => {
    const src = pack({
      objectRefs: "gate",
      objects: `  - id: gate
    name: gate
    description: "a gate"
    locked: true
    key_id: brass_key
    interactions:
      - { verb: USE, effects: [ { set_object_locked: { id: gate, locked: false } } ] }`,
    });
    const codes = parserCodes(src);
    expect(codes).toContain("INERT_OBJECT_STATE");
    const r = compileParserPack(src);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const f = validateParser(r.compiled.pack).findings.find(
        (x) => x.code === "INERT_OBJECT_STATE",
      );
      expect(f?.severity).toBe("warning");
      expect(f?.message).toContain("gate");
      expect(f?.message).toContain("is_unlocked");
    }
  });

  it("(d) NON-VACUITY: adding an is_open reader to the case-(b) mutant clears the warning", () => {
    const src = pack({
      objectRefs: "chest",
      objects: `  - id: chest
    name: chest
    description: "a chest"
    openable: true
    interactions:
      - { verb: READ, effects: [ { open_object: chest } ] }`,
      // A win condition that reads the written open state — a genuine reader, so NOT inert.
      winConds: ", { is_open: chest }",
    });
    expect(parserCodes(src)).not.toContain("INERT_OBJECT_STATE");
  });

  it("(e) does NOT flag an is_open/is_unlocked READ on an object no authored effect writes (built-in-verb shape)", () => {
    // `box` is openable scenery the player opens via the built-in OPEN verb, and a room
    // variant READS its open state. No authored open_object / set_object_locked effect
    // exists, so the write-keyed liveness check never touches it (the alchemists_tower shape).
    const src = `
meta: { id: t, title: T, start_room: a }
rooms:
  - id: a
    name: A
    description: "base"
    variants:
      - when: [{ is_open: box }]
        text: "The box stands open."
    objects: [box]
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: "B"
    exits: [{ direction: south, to: a }]
objects:
  - id: box
    name: box
    description: "a box"
    openable: true
win_conditions: [{ id: w, conditions: [{ visited: b }], ending: e }]
endings: [{ id: e, title: E, text: "done" }]
`;
    expect(parserCodes(src)).not.toContain("INERT_OBJECT_STATE");
  });

  it("(f) bug_0263: flags a set_object_locked(locked:true) re-lock whose unlocked state no condition reads", () => {
    const src = pack({
      objectRefs: "gate",
      objects: `  - id: gate
    name: gate
    description: "a gate"
    locked: true
    key_id: brass_key
    interactions:
      - { verb: USE, effects: [ { set_object_locked: { id: gate, locked: true } } ] }`,
    });
    const codes = parserCodes(src);
    expect(codes).toContain("INERT_OBJECT_STATE");
    const r = compileParserPack(src);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const f = validateParser(r.compiled.pack).findings.find(
        (x) => x.code === "INERT_OBJECT_STATE",
      );
      expect(f?.severity).toBe("warning");
      expect(f?.message).toContain("gate");
      expect(f?.message).toContain("is_unlocked");
    }
  });

  it("(g) NON-VACUITY: adding an is_unlocked reader to the case-(f) re-lock mutant clears the warning", () => {
    const src = pack({
      objectRefs: "gate",
      objects: `  - id: gate
    name: gate
    description: "a gate"
    locked: true
    key_id: brass_key
    interactions:
      - { verb: USE, effects: [ { set_object_locked: { id: gate, locked: true } } ] }`,
      // A win condition that reads the written lock state — a genuine reader, so NOT inert.
      winConds: ", { is_unlocked: gate }",
    });
    expect(parserCodes(src)).not.toContain("INERT_OBJECT_STATE");
  });

  it("(h) DEDUP: an object both unlocked AND re-locked by effects, never read, warns exactly once", () => {
    const src = pack({
      objectRefs: "gate",
      objects: `  - id: gate
    name: gate
    description: "a gate"
    locked: true
    key_id: brass_key
    interactions:
      - { verb: USE, effects: [ { set_object_locked: { id: gate, locked: false } }, { set_object_locked: { id: gate, locked: true } } ] }`,
    });
    const r = compileParserPack(src);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const inert = validateParser(r.compiled.pack).findings.filter(
        (x) => x.code === "INERT_OBJECT_STATE" && x.where.includes("object:gate"),
      );
      expect(inert).toHaveLength(1);
    }
  });
});
