/**
 * bug_0168 — the procedural PARSER generator emits a TWO-TIER (depth-2) obtainability chain.
 *
 * bug_0167's next-focus named the deepening: the parser generator was "a fixed 3-room spine with
 * one key/one gate", and "a second lock tier or multi-room obtainability chain would exercise the
 * [obtainability] fixpoint deeper" — parser owning the strictest validator in the suite
 * (src/validate/parser_validator.ts: the obtainability fixpoint, soft-lock, score economy). v2
 * grows that second tier: a LESSER key in an unlocked entrance coffer opens a LOCKED hub strongbox
 * holding the GREAT key that opens the gate (win) and the hazard (death fork). So the goal's
 * obtainability chain runs key→lock→key→lock across two rooms — depth-2, not depth-1.
 *
 * tests/unit/parser_generator.test.ts already holds every emitted pack to the full shipped bar
 * (schema-valid, validator-clean, exhaustively solvable, exact 5+5+5=15 economy) across 24 seeds,
 * and held_out_corpus_sealed.test.ts pins the re-mint determinism + generator_version. THIS guard
 * is the standing proof of the depth-2 SHAPE specifically: it fails loudly if a future change
 * flattens the generator back to a single key/single gate (which would still pass the generic bar
 * but quietly hollow out the deepening). It asserts both the static structure and the BEHAVIORAL
 * load-bearingness of the second tier.
 */
import { describe, it, expect } from "vitest";
import { generateParserPack, PARSER_GENERATOR_VERSION } from "../../src/gen/parser_generator.js";
import { indexParserPack, initStateForParserPack } from "../../src/parser/model.js";
import { buildParserRules } from "../../src/parser/runner.js";
import type { Action } from "../../src/api/types.js";
import { exhaustiveEndings } from "./support/exhaustive_endings.js";

const SEEDS = Array.from({ length: 12 }, (_, i) => i);
const MAX_STATES = 200_000;

describe("bug_0168 — the parser generator emits a two-tier (depth-2) obtainability chain", () => {
  it("the generator version is bumped to 2 (the v2 deepening; the corpus is re-sealed to match)", () => {
    expect(PARSER_GENERATOR_VERSION).toBe(2);
  });

  for (const seed of SEEDS) {
    it(`seed ${seed}: distinct lesser/great keys, the great key cased behind a locked strongbox`, () => {
      const pack = generateParserPack(seed);
      const byId = new Map(pack.objects.map((o) => [o.id, o]));

      const lesser = byId.get("lesser_key");
      const great = byId.get("key");
      const coffer = byId.get("coffer");
      const strongbox = byId.get("strongbox");
      const gate = byId.get("gate");
      const hazard = byId.get("hazard");
      expect(lesser, "missing tier-1 lesser_key").toBeDefined();
      expect(great, "missing tier-2 great key").toBeDefined();
      expect(coffer, "missing entrance coffer").toBeDefined();
      expect(strongbox, "missing hub strongbox").toBeDefined();

      // Two DISTINCT quest-critical keys (a flattened single-key generator would fail here).
      expect(lesser!.quest_critical).toBe(true);
      expect(great!.quest_critical).toBe(true);
      expect(lesser!.name).not.toBe(great!.name);
      expect(lesser!.id).not.toBe(great!.id);

      // Tier 1: the coffer is an UNLOCKED openable container holding the LESSER key (freely
      //         obtainable first link).
      expect(coffer!.container).toBe(true);
      expect(coffer!.locked ?? false).toBe(false);
      expect(coffer!.contents).toEqual(["lesser_key"]);

      // Tier 2: the strongbox is a LOCKED openable container keyed to the LESSER key, holding the
      //         GREAT key. This is the depth-2 link: the great key is NOT freely obtainable — it
      //         is gated behind a lock the lesser key opens.
      expect(strongbox!.container).toBe(true);
      expect(strongbox!.locked).toBe(true);
      expect(strongbox!.key_id).toBe("lesser_key");
      expect(strongbox!.contents).toEqual(["key"]);

      // The GREAT key (not the lesser) is the gate/hazard fork — the same key opens both.
      expect(gate!.key_id).toBe("key");
      expect(hazard!.key_id).toBe("key");
      // The lesser key opens the strongbox ONLY, never the win/death locks.
      expect(lesser!.id).not.toBe(gate!.key_id);
      expect(lesser!.id).not.toBe(hazard!.key_id);

      // Rooms: the chain spans two rooms — coffer in the entrance, strongbox in the hub.
      const entranceRoom = pack.rooms.find((r) => r.id === "entrance")!;
      const hubRoom = pack.rooms.find((r) => r.id === "hub")!;
      expect(entranceRoom.objects).toContain("coffer");
      expect(hubRoom.objects).toContain("strongbox");

      // Economy: three one-shot +5 milestones (read clue, unlock strongbox, unlock gate) = 15.
      expect(pack.meta.max_score).toBe(15);
      const strongboxScore = (strongbox!.unlock_effects ?? []).find((e) => "inc_var" in e);
      expect(strongboxScore, "strongbox unlock must award the second milestone").toBeDefined();
    });
  }

  it("the SECOND tier is load-bearing: without the lesser key, the great key (and both endings) are unreachable", () => {
    // Prove the depth-2 lock is real, not decorative: walking only the moves available WITHOUT ever
    // taking the lesser key can never open the strongbox, so the great key is never obtained and
    // NEITHER ending (win on the gate, death on the hazard — both need the great key) can fire.
    const pack = generateParserPack(0);
    const index = indexParserPack(pack);
    const rules = buildParserRules(index);
    const noLesserKey = (a: Action): boolean => !(a.type === "TAKE" && a.item === "lesser_key");
    const { reached, cappedOut } = exhaustiveEndings(
      rules,
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
});
