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
 *   - IMPOSSIBLE_QUEST_STAGE   — a quest_stage gate no set_quest_stage effect writes
 *   - IMPOSSIBLE_OBJECT_STATE  — an is_open/is_unlocked gate no effect or built-in
 *                                OPEN/UNLOCK verb path can ever establish (bug_0253)
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
  {
    // bug_0244: the IMPOSSIBLE_GATE reachability family silently skipped the
    // `quest_stage` condition kind. gen(0) writes NO set_quest_stage effect, so any
    // positively-required quest_stage gate references a (quest, stage) pair that no
    // effect ever sets ⇒ IMPOSSIBLE_QUEST_STAGE. The error severity is pinned by the
    // differential/non-degenerate anchors, which use the error-only `codesOf`.
    code: "IMPOSSIBLE_QUEST_STAGE",
    why: "a win condition requires a quest_stage that no set_quest_stage effect ever writes",
    mutate: (p) => {
      const wc = p.win_conditions[0];
      if (!wc) throw new Error("base pack has no win_condition to mutate");
      wc.conditions.push({ quest_stage: { quest: "phantom_quest", stage: "phantom_stage" } });
    },
  },
  {
    // bug_0253: the IMPOSSIBLE_GATE reachability family silently skipped the
    // `is_open` object-state condition kind. The `hazard` is a NON-openable object
    // (openable falsy in gen(0)) and gen(0) writes no `open_object: hazard` effect, so
    // it is in neither the authored-effect nor the built-in-OPEN settable set — an
    // `is_open: hazard` gate can never become true ⇒ IMPOSSIBLE_OBJECT_STATE.
    code: "IMPOSSIBLE_OBJECT_STATE",
    why: "a win condition requires is_open on a non-openable object no open_object effect ever opens",
    mutate: (p) => {
      const hazard = objById(p, "hazard");
      hazard.openable = false; // explicit: never openable by the built-in OPEN verb
      const wc = p.win_conditions[0];
      if (!wc) throw new Error("base pack has no win_condition to mutate");
      wc.conditions.push({ is_open: "hazard" });
    },
  },
  {
    // bug_0277: a `visited` condition naming a room id absent from pack.rooms is a
    // dangling reference (the gate evaluates false forever) ⇒ UNRESOLVED_ROOM_REFERENCE,
    // the room-id analogue of EXIT_TARGET_MISSING. gen(0)'s sole win_condition gates on
    // `{ visited: goal }`; repointing it at a bogus room id is the single defect.
    code: "UNRESOLVED_ROOM_REFERENCE",
    why: "a win condition's `visited` names a room that does not exist",
    mutate: (p) => {
      const wc = p.win_conditions[0];
      if (!wc) throw new Error("base pack has no win_condition to mutate");
      const visited = wc.conditions.find((c) => "visited" in c) as { visited: string } | undefined;
      if (!visited) throw new Error("base pack win_condition has no `visited` gate to mutate");
      visited.visited = "no_such_room";
    },
  },
  {
    // bug_0253: the `is_unlocked` arm of the same gap. `phantom_vault` is an undefined
    // object id (in neither the authored set_object_locked(locked:false) set nor the
    // built-in keyed-UNLOCK set, which requires a defined statically-locked object with
    // an obtainable key) ⇒ an `is_unlocked: phantom_vault` gate can never become true
    // ⇒ IMPOSSIBLE_OBJECT_STATE. The undefined-id case is carried by the same
    // settable-set miss (no objById pre-check), confirming that arm too.
    code: "IMPOSSIBLE_OBJECT_STATE",
    why: "a win condition requires is_unlocked on an object with no effect or keyed-unlock path",
    mutate: (p) => {
      const wc = p.win_conditions[0];
      if (!wc) throw new Error("base pack has no win_condition to mutate");
      wc.conditions.push({ is_unlocked: "phantom_vault" });
    },
  },
  {
    // bug_0278: an `unlock_exit` effect whose `from` is absent from pack.rooms silently
    // writes an unreachable exit-flag key (__exit:phantom_room->hub), making the unlock a
    // permanent no-op. A typo'd room id passes schema validation but the validator must
    // catch it ⇒ UNLOCK_EXIT_ROOM_MISSING. Injected on a fresh interaction on the coffer
    // (the entrance container), which has no interactions in gen(0) — a single defect.
    code: "UNLOCK_EXIT_ROOM_MISSING",
    why: "an unlock_exit effect's `from` names a room that does not exist",
    mutate: (p) => {
      const coffer = objById(p, "coffer");
      coffer.interactions.push({
        verb: "USE",
        conditions: [],
        effects: [{ unlock_exit: { from: "phantom_room", to: "hub" } }],
      });
    },
  },
  {
    // bug_0281: an `add_item` effect targeting an object id absent from pack.objects
    // silently inserts a phantom string into inventory — no description, no interactions,
    // nonsense label — that no existing check catches. A typo'd object id passes schema
    // validation but the validator must catch it ⇒ ITEM_REF_MISSING. Injected on a fresh
    // interaction on the coffer (the entrance container), which has no interactions in
    // gen(0) — a single defect.
    code: "ITEM_REF_MISSING",
    why: "an add_item effect targets an object id that does not exist",
    mutate: (p) => {
      const coffer = objById(p, "coffer");
      coffer.interactions.push({
        verb: "OPEN",
        conditions: [],
        effects: [{ add_item: "phantom_lantern" }],
      });
    },
  },
  {
    // bug_0291: an `open_object` effect targeting an object id absent from pack.objects
    // silently populates openableObjects with a phantom string — no declared object,
    // no description, no interaction entries — and writes into objectState[phantom] at
    // runtime, a key with no corresponding declared object. A typo'd object id passes
    // schema validation but the validator must catch it ⇒ OBJECT_STATE_REF_MISSING.
    // Injected on a fresh interaction on the coffer (the entrance container), which has
    // no interactions in gen(0) — a single defect.
    code: "OBJECT_STATE_REF_MISSING",
    why: "an open_object effect targets an object id that does not exist",
    mutate: (p) => {
      const coffer = objById(p, "coffer");
      coffer.interactions.push({
        verb: "USE",
        conditions: [],
        effects: [{ open_object: "phantom_coffer" }],
      });
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
