/**
 * bug_0218 — a SoundnessBench-style NEGATIVE CORPUS for `validateParser`: a set of
 * deliberately-UNSOUND parser packs the validator MUST REJECT, each pinning ONE
 * previously-untested error branch in the REJECTION direction. This is the parser leg
 * of the negative-corpus trilogy (the CYOA leg is the sibling file; the RPG leg is the
 * original `rpg_validator_negative_corpus.test.ts`, bug_0182).
 *
 * The motivating gap (SoundnessBench, arXiv:2412.03154; the single-checker blind
 * spot, arXiv:2510.14253 / [[verifier-assertion-guard]]): a checker is only proven
 * sound if its FAILING branches are exercised on input that SHOULD fail. bug_0182
 * closed this for `validateRpg` only; an audit of the suite (this cycle) found a large
 * set of `validateParser`'s `error`-severity branches have ZERO rejection-direction
 * witness anywhere — they are exercised almost entirely in the ACCEPT direction by the
 * curated + generated clean packs. A future regression that drops a `findings.push`,
 * inverts a guard, or adds a `??` default swallowing the case would leave every
 * existing test GREEN — the present-but-untested-checker surface.
 *
 * The `error` codes this corpus closes (each confirmed un-witnessed this cycle):
 *   - START_MISSING            — meta.start_room is not a room
 *   - ROOM_OBJECT_MISSING      — a room lists an object that is not defined
 *   - CONTAINER_CONTENT_MISSING— a container lists a content object not defined
 *   - LOCKED_NO_KEY            — a locked object has no key_id (no unlock path)
 *   - NPC_ROOM_MISSING         — an npc stands in a room that does not exist
 *   - KEY_UNOBTAINABLE         — a locked object's key cannot be obtained
 *   - DIALOGUE_ROOT_MISSING    — an npc's dialogue root node does not exist
 *   - DIALOGUE_GOTO_MISSING    — a dialogue topic goes to a missing node
 *   - ENDING_UNDECLARED        — a win_condition ends in an undeclared ending
 *
 * NOTE on coverage (honest, not inflated). The remaining `validateParser` `error`
 * codes already carry a rejection-direction witness in `tests/unit/parser_validator.ts`
 * or a regression test (DUPLICATE_ID, EXIT_TARGET_MISSING, KEY_MISSING, AMBIGUOUS_ALIAS,
 * IMPOSSIBLE_GATE, ITEM_REQUIRED_UNOBTAINABLE, SOFTLOCK, SOFTLOCK_QUEST_ITEM,
 * WIN_UNREACHABLE, WIN_IS_DEATH, NO_WINNABLE_ENDING, SCORE_UNREACHABLE,
 * END_GAME_UNDECLARED, DIALOGUE_NONTERMINATING, WIN_FIRES_AT_START), so they are
 * intentionally NOT re-pinned here.
 *
 * Method (the bug_0182 copy-mutate discipline): the GREEN base is the canonical sound
 * pack `generateParserPack(0)` — it validates clean and carries the four-room spine,
 * the three-tier key chain, an npc with a two-node dialogue, and one win_condition
 * that each defect needs. Each case `structuredClone()`s it and introduces EXACTLY ONE
 * defect, so the rejection is attributable to that mutation alone. Where a minimal
 * single defect unavoidably trips a companion code (making a key unobtainable also
 * strands the deeper chain), we assert the targeted code via `.includes(...)` (NOT
 * exact-set-equals) plus the GREEN differential anchor, exactly as the RPG corpus does.
 *
 * IMPORTANT: the validator is called directly on the mutated (already-parsed) object,
 * NOT re-parsed through ParserPackSchema — so a schema-level superRefine (e.g.
 * "unlock_effects require a key_id") never runs here; these tests pin the VALIDATOR's
 * own structural branches, exactly as shipped.
 *
 * PURELY ADDITIVE: a new regression test + a bug artifact. No source/validator/engine/
 * schema/generator/corpus/scorecard change, no hash re-pin — the validator is
 * exercised exactly as shipped, and the generator is called in-memory (pure, §8.5,
 * no disk write).
 */
import { describe, it, expect } from "vitest";
import { generateParserPack } from "../../src/gen/parser_generator.js";
import { validateParser } from "../../src/validate/parser_validator.js";
import type { ParserPack } from "../../src/parser/schema.js";

// The canonical sound pack: validates clean (pinned green by the generator's own test).
const GREEN: ParserPack = generateParserPack(0);

const codesOf = (pack: ParserPack): string[] =>
  validateParser(pack)
    .findings.filter((f) => f.severity === "error")
    .map((f) => f.code);

const objById = (p: ParserPack, id: string) => {
  const o = p.objects.find((x) => x.id === id);
  if (!o) throw new Error(`base pack has no object "${id}" to mutate`);
  return o;
};

/** Each case = one single-defect mutation of the GREEN base, expected to emit `code`. */
interface NegativeCase {
  code: string;
  why: string;
  mutate: (p: ParserPack) => void;
}

const CASES: NegativeCase[] = [
  {
    code: "START_MISSING",
    why: "meta.start_room names a room that does not exist",
    mutate: (p) => {
      p.meta.start_room = "no_such_room";
    },
  },
  {
    code: "ROOM_OBJECT_MISSING",
    why: "a room lists an object id that is not defined",
    mutate: (p) => {
      const entrance = p.rooms.find((r) => r.id === "entrance");
      if (!entrance) throw new Error("base pack has no entrance room");
      entrance.objects.push("no_such_object");
    },
  },
  {
    code: "CONTAINER_CONTENT_MISSING",
    why: "a container lists a content object id that is not defined",
    mutate: (p) => {
      // coffer is the entrance container; add a bogus content id (one defect).
      objById(p, "coffer").contents.push("no_such_content");
    },
  },
  {
    code: "LOCKED_NO_KEY",
    why: "a locked object has no key_id (and so no unlock path)",
    mutate: (p) => {
      // The hazard is a locked death-fork object off the win path: dropping its key_id
      // makes it a locked-with-no-key, with no win/obtainability cascade.
      const hazard = objById(p, "hazard");
      delete (hazard as { key_id?: string }).key_id;
    },
  },
  {
    code: "NPC_ROOM_MISSING",
    why: "an npc stands in a room that does not exist",
    mutate: (p) => {
      const guide = p.npcs[0];
      if (!guide) throw new Error("base pack has no npc to mutate");
      guide.room = "no_such_room";
    },
  },
  {
    code: "KEY_UNOBTAINABLE",
    why: "a locked object's defined key cannot be obtained",
    mutate: (p) => {
      // lesser_key (in the entrance coffer) is the strongbox's key. Make it un-takeable
      // ⇒ it can never be picked up ⇒ the strongbox's key is unobtainable. (This also
      // strands the deeper chain, so we assert .includes(KEY_UNOBTAINABLE) per discipline.)
      objById(p, "lesser_key").takeable = false;
    },
  },
  {
    code: "DIALOGUE_ROOT_MISSING",
    why: "an npc's dialogue root node id does not exist",
    mutate: (p) => {
      const guide = p.npcs[0];
      if (!guide) throw new Error("base pack has no npc to mutate");
      guide.dialogue.root = "no_such_node";
    },
  },
  {
    code: "DIALOGUE_GOTO_MISSING",
    why: "a dialogue topic goes to a node that does not exist",
    mutate: (p) => {
      const guide = p.npcs[0];
      if (!guide) throw new Error("base pack has no npc to mutate");
      const greet = guide.dialogue.nodes.find((n) => n.id === "greet");
      const hint = greet?.topics.find((t) => t.id === "hint");
      if (!hint) throw new Error("base pack npc greet node has no `hint` topic");
      hint.goto = "no_such_node";
    },
  },
  {
    code: "ENDING_UNDECLARED",
    why: "a win_condition resolves to an ending that is not declared",
    mutate: (p) => {
      const wc = p.win_conditions[0];
      if (!wc) throw new Error("base pack has no win_condition to mutate");
      wc.ending = "no_such_ending";
    },
  },
];

describe("validateParser negative corpus — rejection-direction witnesses (bug_0218)", () => {
  it("the GREEN base validates clean and carries none of the targeted codes (differential anchor)", () => {
    const base = codesOf(GREEN);
    expect(validateParser(GREEN).ok).toBe(true);
    for (const c of CASES) expect(base).not.toContain(c.code);
  });

  for (const c of CASES) {
    it(`REJECTS ${c.code}: ${c.why}`, () => {
      const mutant = structuredClone(GREEN);
      c.mutate(mutant);
      const report = validateParser(mutant);
      expect(report.ok).toBe(false);
      expect(report.findings.map((f) => f.code)).toContain(c.code);
    });
  }

  it("the corpus is non-degenerate: every case flips a clean pack into a rejection", () => {
    for (const c of CASES) {
      const mutant = structuredClone(GREEN);
      c.mutate(mutant);
      expect(codesOf(mutant).length).toBeGreaterThan(0);
    }
  });
});
