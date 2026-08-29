/**
 * Regression for the validate-subsystem audit finding "generated pack ids collide
 * across sign-symmetric seeds while the packs themselves differ".
 *
 * `meta.id` was minted from `Math.abs(Math.trunc(seed))` while `makeRng` is keyed on
 * the SIGNED seed, so seed and -seed drew a different skill difficulty and different
 * score awards — two structurally different packs — and stamped them with ONE id
 * (measured before the fix: 5 and -5 both minted `genrpg_5_v1`, max_score 70 vs 55).
 * Negative seeds are legal (`isGeneratedRpgSeed(-1)` and `MIN_SAFE_INTEGER` are pinned
 * true in tests/unit/seed.test.ts) and reach the generator through MCP new_game /
 * generate_rpg_pack. Replay was never at risk — saves, traces and source refs bind by
 * the SIGNED seed — but `meta.id` is what every observation, transcript, corpus row and
 * crawler/blind artifact carries, so a collision makes two different packs
 * indistinguishable in recorded evidence, and `bin/seal-corpus.ts` writes both to the
 * same `corpus/rpg/<id>.yaml`. The generator suites never covered a negative seed:
 * `SEEDS = Array.from({length: 24}, (_, i) => i)`.
 */
import { describe, it, expect } from "vitest";
import { generateRpgPack } from "../../src/gen/rpg_generator.js";
import type { RpgPack } from "../../src/rpg/schema.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";

/** The pack with its identity erased — what must still differ between ±seed. */
const shape = (pack: RpgPack): string =>
  JSON.stringify({ ...pack, meta: { ...pack.meta, id: "" } });

const PAIRS = [1, 3, 5, 7, 23];

describe("generated pack ids separate the packs the seed separates", () => {
  it("keeps every NON-negative id byte-identical (the sealed corpus window)", () => {
    // corpus/manifest.json seals seeds 0..3 by pack_id and content hash; those ids
    // must not move. This is the compatibility half of the fix.
    for (const seed of [0, 1, 2, 3, 24]) {
      expect(generateRpgPack(seed).meta.id).toBe(`genrpg_${seed}_v1`);
    }
  });

  it("gives a negative seed its own id", () => {
    expect(generateRpgPack(-5).meta.id).toBe("genrpg_n5_v1");
    expect(generateRpgPack(-1).meta.id).toBe("genrpg_n1_v1");
  });

  it("never mints one id for two different packs across ±seed", () => {
    for (const seed of PAIRS) {
      const positive = generateRpgPack(seed);
      const negative = generateRpgPack(-seed);
      // The premise: the two really are different packs, so a shared id would be a
      // false identity rather than a harmless alias.
      expect(shape(negative)).not.toEqual(shape(positive));
      expect(negative.meta.id).not.toBe(positive.meta.id);
    }
  });

  it("still emits a valid, id-unique pack at the extreme legal seeds", () => {
    for (const seed of [-1, -5, Number.MIN_SAFE_INTEGER]) {
      const pack = generateRpgPack(seed);
      expect(pack.meta.id).toMatch(/^genrpg_n\d+_v1$/);
      expect(validateRpg(pack).ok).toBe(true);
    }
  });

  it("is deterministic: the same seed re-mints the same id", () => {
    for (const seed of [-7, 0, 7]) {
      expect(generateRpgPack(seed).meta.id).toBe(generateRpgPack(seed).meta.id);
    }
  });
});
