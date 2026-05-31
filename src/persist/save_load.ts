/**
 * Save / load (spec §8.7).
 *
 * A save = the full GameState + the content-pack id + its content hash. Loading
 * MUST verify the content hash against the pack it will be played on; a mismatch
 * is a hard error, never a silent re-interpretation (§8.8, §16 "integrity at
 * load"). This prevents replaying a save against edited content and corrupting it.
 */
import type { GameState } from "../core/state.js";
import { canonicalize } from "../core/hash.js";

export const SAVE_VERSION = 1 as const;

export type SaveBundle = {
  version: typeof SAVE_VERSION;
  packId: string;
  contentHash: string;
  state: GameState;
};

/** Serialize a save to canonical bytes (stable across machines/runs). */
export function save(state: GameState, packId: string, contentHash: string): string {
  const bundle: SaveBundle = { version: SAVE_VERSION, packId, contentHash, state };
  return canonicalize(bundle);
}

export class SaveIntegrityError extends Error {}

/**
 * Deserialize a save. If `expectedContentHash` is given, the save's contentHash
 * must match it exactly — otherwise a SaveIntegrityError is thrown (§8.7).
 */
export function load(bytes: string, expectedContentHash?: string): SaveBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes);
  } catch (e) {
    throw new SaveIntegrityError(`Save is not valid JSON: ${(e as Error).message}`);
  }
  const bundle = parsed as SaveBundle;
  if (bundle.version !== SAVE_VERSION) {
    throw new SaveIntegrityError(`Unsupported save version: ${String(bundle.version)}`);
  }
  if (expectedContentHash !== undefined && bundle.contentHash !== expectedContentHash) {
    throw new SaveIntegrityError(
      `Content hash mismatch: save was made against ${bundle.contentHash}, ` +
        `but the loaded pack is ${expectedContentHash}.`,
    );
  }
  return bundle;
}
