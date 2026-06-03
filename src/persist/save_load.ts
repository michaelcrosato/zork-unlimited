/**
 * Save / load (spec §8.7).
 *
 * A save = the full GameState + the content-pack id + its content hash. Loading
 * MUST verify the content hash against the pack it will be played on; a mismatch
 * is a hard error, never a silent re-interpretation (§8.8, §16 "integrity at
 * load"). This prevents replaying a save against edited content and corrupting it.
 */
import { z } from "zod";
import type { GameState } from "../core/state.js";
import { canonicalize } from "../core/hash.js";

export const SAVE_VERSION = 1 as const;

/**
 * Structural + finiteness validator for a loaded GameState (§16 "integrity at
 * load"). This mirrors `GameState` (src/core/state.ts) field-for-field, and is
 * the load-side complement to the effects-layer `guardFinite` (effects.ts) —
 * which only ever runs on EFFECT APPLICATION during play and so never sees a
 * value injected by a forged save. The contentHash check below guards WHICH
 * pack a save was made against; this guards WHETHER the state is well-formed.
 *
 * The load-bearing gates are `vars: z.record(z.number().finite())` and the
 * finite `seed`/`step`: `JSON.parse('{"...":1e999}')` yields `Infinity`, which
 * — left unguarded — flows into `conditions.ts:75` `var_gte` and makes EVERY
 * `var_gte` gate always-true (NaN makes every `var_*` always-false). The gate
 * REJECTS such a save (throws `SaveIntegrityError`); it never coerces/clamps.
 *
 * `objectState` mirrors `ObjectRuntime` (state.ts:9–15) with `.strict()` so an
 * unknown or wrong-typed key is rejected, not silently carried into the engine.
 */
const ObjectRuntimeSchema = z
  .object({
    open: z.boolean().optional(),
    locked: z.boolean().optional(),
    contents: z.array(z.string()).optional(),
    takenBy: z.enum(["player", "world"]).optional(),
    room: z.string().optional(),
  })
  .strict();

const GameStateSchema = z
  .object({
    // identity / determinism — finite numbers only (rejects Infinity/-Infinity/NaN)
    seed: z.number().finite(),
    step: z.number().finite(),
    // location
    current: z.string(),
    visited: z.record(z.boolean()),
    // world state
    flags: z.record(z.boolean()),
    // THE load-bearing finiteness gate (the Infinity/NaN -> conditions.ts:75 hole):
    vars: z.record(z.number().finite()),
    inventory: z.array(z.string()),
    objectState: z.record(ObjectRuntimeSchema),
    // narrative
    journal: z.array(z.string()),
    questStage: z.record(z.string()),
    // termination
    ended: z.boolean(),
    endingId: z.string().nullable(),
  })
  .strict();

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
  // §16 integrity at load: the state must be a well-formed, FINITE GameState
  // before it is handed back to the engine. Reject (never coerce) — a poisoned
  // save is an integrity failure, not a value to repair. We validate WITHOUT
  // substituting parsedState.data, so a valid state's bytes/hash stay identical.
  const parsedState = GameStateSchema.safeParse((bundle as { state?: unknown }).state);
  if (!parsedState.success) {
    throw new SaveIntegrityError(
      `Save state is malformed or non-finite: ${parsedState.error.message}`,
    );
  }
  return bundle;
}
