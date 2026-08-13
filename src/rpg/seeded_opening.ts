import { sha256Hex } from "../core/sha256.js";
import { assertRuntimeSeed } from "../core/state.js";

/**
 * A separate, versioned randomness domain for authored opening conditions.
 *
 * This must not call `rngForStep`: choosing a fresh game's opening must neither
 * consume nor couple itself to combat/skill-check randomness. Pack and flag ids
 * are deliberately absent from the selector input, so a consistent identifier
 * relabel preserves the selected array ordinal.
 */
export const SEEDED_OPENING_SELECTOR_DOMAIN = "AdventureForge/RPG/seeded-opening-flags/v1";

/** Select an authored-array ordinal from a numeric runtime seed. Pure and id-invariant. */
export function seededOpeningFlagIndex(seed: number, optionCount: number): number {
  assertRuntimeSeed(seed, "Seeded opening seed");
  if (!Number.isSafeInteger(optionCount) || optionCount < 1) {
    throw new Error(
      `Seeded opening option count must be a positive safe integer, got ${JSON.stringify(optionCount)}.`,
    );
  }

  const digest = sha256Hex(
    `${SEEDED_OPENING_SELECTOR_DOMAIN}\0seed:${String(seed)}\0options:${String(optionCount)}`,
  );
  return Number(BigInt(`0x${digest}`) % BigInt(optionCount));
}

/** Return the exact authored flag selected for this seed. */
export function seededOpeningFlagForSeed(flags: readonly string[], seed: number): string {
  if (flags.length === 0) throw new Error("Seeded opening flags cannot be empty.");
  return flags[seededOpeningFlagIndex(seed, flags.length)]!;
}
