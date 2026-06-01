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
  /** Pack mode (cyoa|parser|rpg). Optional for backward-compat with v1 saves
   *  written before multi-mode; when present, load can refuse a mode mismatch. */
  mode?: string;
  state: GameState;
};

/** Serialize a save to canonical bytes (stable across machines/runs). */
export function save(state: GameState, packId: string, contentHash: string, mode?: string): string {
  const bundle: SaveBundle = {
    version: SAVE_VERSION,
    packId,
    contentHash,
    state,
    ...(mode !== undefined ? { mode } : {}),
  };
  return canonicalize(bundle);
}

export class SaveIntegrityError extends Error {}

/**
 * Deserialize a save. If `expectedContentHash` is given, the save's contentHash
 * must match it exactly (§8.7). If `expectedMode` is given AND the save records a
 * mode, the modes must match too — a save can't be loaded against a different
 * mode. A pre-mode (v1) save carries no mode and skips that check (backward-compat).
 */
export function load(
  bytes: string,
  expectedContentHash?: string,
  expectedMode?: string,
): SaveBundle {
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
  if (expectedMode !== undefined && bundle.mode !== undefined && bundle.mode !== expectedMode) {
    throw new SaveIntegrityError(
      `Mode mismatch: save is a "${bundle.mode}" game, but the loaded pack is "${expectedMode}".`,
    );
  }
  return bundle;
}
