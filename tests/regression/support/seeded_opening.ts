import { seededOpeningFlagForSeed } from "../../../src/rpg/seeded_opening.js";

/**
 * Selects a small, non-certification seed for a test that needs one authored
 * seeded-opening branch. This keeps unrelated mechanic tests explicit about
 * the branch they exercise without mutating the immutable opening flags.
 */
export function seedForSeededOpeningFlag(
  flags: readonly string[] | undefined,
  expectedFlag: string,
): number {
  if (!flags?.includes(expectedFlag)) {
    throw new Error(`Unknown seeded opening flag: ${expectedFlag}`);
  }

  for (let seed = -100; seed <= 100; seed += 1) {
    if (seededOpeningFlagForSeed(flags, seed) === expectedFlag) return seed;
  }

  throw new Error(`No small test seed selects seeded opening flag: ${expectedFlag}`);
}
