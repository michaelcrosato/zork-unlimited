/**
 * bug_0168 / bug_0199 — the procedural PARSER generator emits a THREE-TIER (depth-3) obtainability
 * chain.
 *
 * bug_0167's next-focus named the deepening: the parser generator was "a fixed 3-room spine with
 * one key/one gate", and "a second lock tier or multi-room obtainability chain would exercise the
 * [obtainability] fixpoint deeper" — parser owning the strictest validator in the suite
 * (src/validate/parser_validator.ts: the obtainability fixpoint, soft-lock, score economy). v2
 * (bug_0168) grew the second tier. v3 (bug_0199) grows the THIRD: bug_0198's mode-matched benchmark
 * found the parser generator's packs read bot-EASIER than the hand-authored ones (the generator had
 * stopped at v2 while the RPG generator went to v3). v3 closes that — a LESSER key in an unlocked
 * entrance coffer opens a LOCKED hub strongbox holding a MIDDLE key, which opens a LOCKED inner chest
 * (a new inner room) holding the GREAT key that opens the gate (win) and the hazard (death fork). So
 * the goal's obtainability chain runs key→lock→key→lock→key→lock across three rooms — depth-3.
 *
 * tests/unit/parser_generator.test.ts already holds every emitted pack to the full shipped bar
 * (schema-valid, validator-clean, exhaustively solvable, exact 5+5+5+5=20 economy) across 24 seeds,
 * held_out_corpus_sealed.test.ts pins the re-mint determinism + generator_version, and
 * parser_generator_depth_floor.test.ts is the validator-INDEPENDENT tier-knockout depth oracle +
 * known-shallow negative corpus. THIS guard is the standing proof of the depth-3 SHAPE specifically:
 * it fails loudly if a future change flattens the generator (which would still pass the generic bar
 * but quietly hollow out the deepening). It asserts both the static structure and the BEHAVIORAL
 * load-bearingness of the second AND third tiers.
 */
import { describe, it, expect } from "vitest";
import { generateParserPack, PARSER_GENERATOR_VERSION } from "../../src/gen/parser_generator.js";
import { indexParserPack, initStateForParserPack } from "../../src/parser/model.js";
import type { Action } from "../../src/api/types.js";
import { exhaustiveEndingsMulti } from "./support/exhaustive_endings.js";
import { parserRollRuleSets } from "./support/parser_rolls.js";

const SEEDS = Array.from({ length: 12 }, (_, i) => i);
const MAX_STATES = 200_000;

describe("bug_0168 / bug_0199 — the parser generator emits a three-tier (depth-3) obtainability chain", () => {
  it("the generator version is bumped to 3 (the v3 deepening; the corpus is re-sealed to match)", () => {
    expect(PARSER_GENERATOR_VERSION).toBe(3);
  });

  for (const seed of SEEDS) {
    it(`seed ${seed}: distinct lesser/middle/great keys, each great key cased behind a locked tier`, () => {
      const pack = generateParserPack(seed);
      const byId = new Map(pack.objects.map((o) => [o.id, o]));

      const lesser = byId.get("lesser_key");
      const middle = byId.get("middle_key");
      const great = byId.get("key");
      const coffer = byId.get("coffer");
      const strongbox = byId.get("strongbox");
      const innerChest = byId.get("inner_chest");
      const gate = byId.get("gate");
      const hazard = byId.get("hazard");
      expect(lesser, "missing tier-1 lesser_key").toBeDefined();
      expect(middle, "missing tier-2 middle_key").toBeDefined();
      expect(great, "missing tier-3 great key").toBeDefined();
      expect(coffer, "missing entrance coffer").toBeDefined();
      expect(strongbox, "missing hub strongbox").toBeDefined();
      expect(innerChest, "missing inner chest").toBeDefined();

      // THREE DISTINCT quest-critical keys (a flattened single/double-key generator fails here).
      expect(lesser!.quest_critical).toBe(true);
      expect(middle!.quest_critical).toBe(true);
      expect(great!.quest_critical).toBe(true);
      const ids = new Set([lesser!.id, middle!.id, great!.id]);
      expect(ids.size, "the three keys must be distinct objects").toBe(3);
      const names = new Set([lesser!.name, middle!.name, great!.name]);
      expect(names.size, "the three keys must have distinct names").toBe(3);

      // Tier 1: the coffer is an UNLOCKED openable container holding the LESSER key (freely
      //         obtainable first link).
      expect(coffer!.container).toBe(true);
      expect(coffer!.locked ?? false).toBe(false);
      expect(coffer!.contents).toEqual(["lesser_key"]);

      // Tier 2: the strongbox is a LOCKED openable container keyed to the LESSER key, holding the
      //         MIDDLE key — the middle key is gated behind the lock the lesser key opens.
      expect(strongbox!.container).toBe(true);
      expect(strongbox!.locked).toBe(true);
      expect(strongbox!.key_id).toBe("lesser_key");
      expect(strongbox!.contents).toEqual(["middle_key"]);

      // Tier 3: the inner chest is a LOCKED openable container keyed to the MIDDLE key, holding the
      //         GREAT key — the great key is gated behind the lock the middle key opens.
      expect(innerChest!.container).toBe(true);
      expect(innerChest!.locked).toBe(true);
      expect(innerChest!.key_id).toBe("middle_key");
      expect(innerChest!.contents).toEqual(["key"]);

      // The GREAT key (not the lesser/middle) is the gate/hazard fork — the same key opens both.
      expect(gate!.key_id).toBe("key");
      expect(hazard!.key_id).toBe("key");
      // Each lower key opens its OWN tier's container only, never the win/death locks.
      expect(lesser!.id).not.toBe(gate!.key_id);
      expect(middle!.id).not.toBe(gate!.key_id);
      expect(lesser!.id).not.toBe(innerChest!.key_id); // lesser opens strongbox, not inner chest
      expect(middle!.id).not.toBe(strongbox!.key_id); // middle opens inner chest, not strongbox

      // Rooms: the chain spans three rooms — coffer in the entrance, strongbox in the hub, inner
      // chest in the new inner room (the win is gated off the inner room, not the hub).
      const entranceRoom = pack.rooms.find((r) => r.id === "entrance")!;
      const hubRoom = pack.rooms.find((r) => r.id === "hub")!;
      const innerRoom = pack.rooms.find((r) => r.id === "inner")!;
      expect(innerRoom, "missing the new inner room").toBeDefined();
      expect(entranceRoom.objects).toContain("coffer");
      expect(hubRoom.objects).toContain("strongbox");
      expect(innerRoom!.objects).toContain("inner_chest");
      expect(innerRoom!.objects).toContain("gate");

      // Economy: four one-shot +5 milestones (read clue, unlock strongbox, unlock inner chest,
      // unlock gate) = 20.
      expect(pack.meta.max_score).toBe(20);
      const strongboxScore = (strongbox!.unlock_effects ?? []).find((e) => "inc_var" in e);
      expect(strongboxScore, "strongbox unlock must award a milestone").toBeDefined();
      const innerChestScore = (innerChest!.unlock_effects ?? []).find((e) => "inc_var" in e);
      expect(innerChestScore, "inner chest unlock must award a milestone").toBeDefined();
    });
  }

  it("the SECOND tier is load-bearing: without the lesser key, both endings are unreachable", () => {
    // Prove the depth-2 lock is real, not decorative: walking only the moves available WITHOUT ever
    // taking the lesser key can never open the strongbox, so the middle key (hence the great key) is
    // never obtained and NEITHER ending (win on the gate, death on the hazard — both need the great
    // key) can fire.
    const pack = generateParserPack(0);
    const index = indexParserPack(pack);
    const noLesserKey = (a: Action): boolean => !(a.type === "TAKE" && a.item === "lesser_key");
    const { reached, cappedOut } = exhaustiveEndingsMulti(
      parserRollRuleSets(index),
      initStateForParserPack(index, 0),
      MAX_STATES,
      undefined,
      { explore: noLesserKey },
    );
    expect(cappedOut).toBe(false);
    expect(
      reached.has("ending_win"),
      "win reachable without the lesser key — tier 2 is decorative",
    ).toBe(false);
    expect(
      reached.has("ending_doom"),
      "death fork reachable without the lesser key — tier 2 is decorative",
    ).toBe(false);
  });

  it("the THIRD tier is load-bearing: without the middle key, both endings are unreachable", () => {
    // Prove the depth-3 lock is real: walking only the moves available WITHOUT ever taking the middle
    // key can never open the inner chest, so the great key is never obtained and NEITHER ending fires.
    const pack = generateParserPack(0);
    const index = indexParserPack(pack);
    const noMiddleKey = (a: Action): boolean => !(a.type === "TAKE" && a.item === "middle_key");
    const { reached, cappedOut } = exhaustiveEndingsMulti(
      parserRollRuleSets(index),
      initStateForParserPack(index, 0),
      MAX_STATES,
      undefined,
      { explore: noMiddleKey },
    );
    expect(cappedOut).toBe(false);
    expect(
      reached.has("ending_win"),
      "win reachable without the middle key — tier 3 is decorative",
    ).toBe(false);
    expect(
      reached.has("ending_doom"),
      "death fork reachable without the middle key — tier 3 is decorative",
    ).toBe(false);
  });
});
