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
import {
  compactSourceRefFromMetadata,
  compactSourceRefValidationError,
  type CompactSourceRef,
} from "../world/source_ref.js";

export const SAVE_VERSION = 1 as const;
export const SAVE_MODE = "rpg" as const;
export type SaveMode = typeof SAVE_MODE;

/**
 * Structural + finiteness validator for a loaded GameState (§16 "integrity at
 * load"). This mirrors `GameState` (src/core/state.ts) field-for-field, and is
 * the load-side complement to the effects-layer `guardFinite` (effects.ts) —
 * which only ever runs on EFFECT APPLICATION during play and so never sees a
 * value injected by a forged save. The contentHash check below guards WHICH
 * pack a save was made against; this guards WHETHER the state is well-formed.
 *
 * The load-bearing gate is `vars: z.record(z.number().finite())`:
 * `JSON.parse('{"...":1e999}')` yields `Infinity`, which — left unguarded —
 * flows into `conditions.ts:75` `var_gte` and makes EVERY `var_gte` gate
 * always-true (NaN makes every `var_*` always-false). The gate REJECTS such a
 * save (throws `SaveIntegrityError`); it never coerces/clamps.
 *
 * `seed`/`step` are gated to the INTEGER domain `rngForStep` (rng.ts:44)
 * consumes via `seed >>> 0` / `step >>> 0` — a non-integer would silently
 * truncate to a DIFFERENT value than the one the save's content hash
 * (hash.ts `canonicalize`) committed to. This restores entry↔disk symmetry
 * with the MCP entry boundary (server.ts:147), which already gates
 * `seed: z.number().int()`; `step` is a counter from 0 (state.ts:20), so it is
 * additionally `.nonnegative()`. No sign/range bound is placed on `seed` —
 * negative seeds are legitimate (`mulberry32` does `seed >>> 0`, defined for
 * negatives) and the entry boundary accepts them.
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
    // identity / determinism — INTEGER domain only (the values rngForStep
    // consumes via `>>> 0`); rejects non-integers AND Infinity/-Infinity/NaN.
    // Matches the MCP entry gate (server.ts:147) exactly: bare .int() on seed
    // (negative seeds are legitimate); step is a counter from 0 so .nonnegative().
    seed: z.number().int(),
    step: z.number().int().nonnegative(),
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

/**
 * Assert a (possibly untrusted) GameState is well-formed + FINITE per §16
 * "integrity at load". REUSED at every untrusted-state-from-disk boundary: the
 * save load() guard below and the trace/CLI load gates. Same
 * safeParse-without-substitution path as load() — a valid state's bytes/hash stay
 * identical. Throws (never coerces).
 */
export function assertWellFormedState(state: unknown): GameState {
  const parsed = GameStateSchema.safeParse(state);
  if (!parsed.success) {
    throw new SaveIntegrityError(`State is malformed or non-finite: ${parsed.error.message}`);
  }
  return state as GameState;
}

export type SaveBundle = {
  version: typeof SAVE_VERSION;
  packId: string;
  contentHash: string;
  /** Pack mode. Required so persisted state is bound to the unified RPG engine. */
  mode: SaveMode;
  /** Compact canonical source identity. Legacy fields below remain compatibility mirrors. */
  source_ref?: SaveSourceRef;
  /** Shipped world quest id, when the save belongs to the open-world graph. */
  worldQuestId?: string;
  /** Procedural RPG generation seed, when the save belongs to an in-memory generated pack. */
  generatedRpgSeed?: number;
  state: GameState;
};

export type SaveSourceRef = CompactSourceRef;

export type SaveMetadata = {
  worldQuestId?: string | null;
  generatedRpgSeed?: number | null;
};

const SAVE_SOURCE_LABELS = {
  source: "Save source",
  worldQuestId: "Save worldQuestId",
  generatedRpgSeed: "Save generatedRpgSeed",
} as const;

/** Serialize a save to canonical bytes (stable across machines/runs). */
export function save(
  state: GameState,
  packId: string,
  contentHash: string,
  mode: SaveMode = SAVE_MODE,
  metadata: SaveMetadata = {},
): string {
  assertRpgMode(mode, "Save mode");
  const sourceRef = saveSourceRef(packId, metadata);
  const bundle: SaveBundle = {
    version: SAVE_VERSION,
    packId,
    contentHash,
    state,
    mode,
    source_ref: sourceRef,
    ...(sourceRef[0] === "wq" ? { worldQuestId: sourceRef[1] } : {}),
    ...(sourceRef[0] === "gen" ? { generatedRpgSeed: sourceRef[1] } : {}),
  };
  return canonicalize(bundle);
}

export class SaveIntegrityError extends Error {}

export function assertSaveContentHash(
  bundle: Pick<SaveBundle, "contentHash">,
  expectedContentHash: string,
): void {
  if (bundle.contentHash !== expectedContentHash) {
    throw new SaveIntegrityError(
      `Content hash mismatch: save was made against ${bundle.contentHash}, ` +
        `but the loaded pack is ${expectedContentHash}.`,
    );
  }
}

function assertRpgMode(mode: unknown, label: string): asserts mode is SaveMode {
  if (mode !== SAVE_MODE) {
    throw new SaveIntegrityError(`${label} must be "${SAVE_MODE}", got ${JSON.stringify(mode)}.`);
  }
}

function assertOptionalRpgMode(mode: unknown, label: string): asserts mode is SaveMode | undefined {
  if (mode !== undefined) assertRpgMode(mode, label);
}

function assertGeneratedRpgSeed(seed: unknown, label: string): asserts seed is number {
  if (typeof seed !== "number" || !Number.isInteger(seed)) {
    throw new SaveIntegrityError(`${label} must be an integer, got ${JSON.stringify(seed)}.`);
  }
}

function saveSourceRef(packId: string, metadata: SaveMetadata): SaveSourceRef {
  const sourceRef = compactSourceRefFromMetadata(packId, metadata, SAVE_SOURCE_LABELS);
  if (!sourceRef.ok) throw new SaveIntegrityError(sourceRef.error);
  return sourceRef.sourceRef;
}

function assertSaveSourceRef(raw: unknown): asserts raw is SaveSourceRef {
  if (raw === undefined) return;
  const error = compactSourceRefValidationError(raw, "Save source_ref");
  if (error !== undefined) throw new SaveIntegrityError(error);
}

function assertSaveSourceRefConsistency(bundle: SaveBundle): void {
  const sourceRef = (bundle as { source_ref?: unknown }).source_ref;
  if (sourceRef === undefined) return;
  assertSaveSourceRef(sourceRef);

  const worldQuestId = (bundle as { worldQuestId?: unknown }).worldQuestId;
  const generatedRpgSeed = (bundle as { generatedRpgSeed?: unknown }).generatedRpgSeed;

  if (sourceRef[0] === "wq") {
    if (worldQuestId !== undefined && worldQuestId !== sourceRef[1]) {
      throw new SaveIntegrityError(
        `Save source_ref world quest ${JSON.stringify(
          sourceRef[1],
        )} does not match worldQuestId ${JSON.stringify(worldQuestId)}.`,
      );
    }
    if (generatedRpgSeed !== undefined) {
      throw new SaveIntegrityError("Save source_ref world quest conflicts with generatedRpgSeed.");
    }
  } else if (sourceRef[0] === "gen") {
    if (generatedRpgSeed !== undefined && generatedRpgSeed !== sourceRef[1]) {
      throw new SaveIntegrityError(
        `Save source_ref generated seed ${JSON.stringify(
          sourceRef[1],
        )} does not match generatedRpgSeed ${JSON.stringify(generatedRpgSeed)}.`,
      );
    }
    if (worldQuestId !== undefined) {
      throw new SaveIntegrityError("Save source_ref generated seed conflicts with worldQuestId.");
    }
  } else if (worldQuestId !== undefined || generatedRpgSeed !== undefined) {
    throw new SaveIntegrityError(
      "Save source_ref pack fallback conflicts with explicit save source metadata.",
    );
  }
}

/**
 * Deserialize a save. If `expectedContentHash` is given, the save's contentHash
 * must match it exactly (§8.7). Saves must carry the RPG mode; missing or
 * legacy modes are integrity failures, not migration inputs.
 */
export function load(
  bytes: string,
  expectedContentHash?: string,
  expectedMode?: SaveMode,
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
  assertRpgMode((bundle as { mode?: unknown }).mode, "Save mode");
  assertOptionalRpgMode(expectedMode, "Expected mode");
  if (
    "worldQuestId" in (bundle as Record<string, unknown>) &&
    typeof (bundle as { worldQuestId?: unknown }).worldQuestId !== "string"
  ) {
    throw new SaveIntegrityError(
      `Save worldQuestId must be a string when present, got ${JSON.stringify(
        (bundle as { worldQuestId?: unknown }).worldQuestId,
      )}.`,
    );
  }
  if ("generatedRpgSeed" in (bundle as Record<string, unknown>)) {
    assertGeneratedRpgSeed(
      (bundle as { generatedRpgSeed?: unknown }).generatedRpgSeed,
      "Save generatedRpgSeed",
    );
  }
  if (
    (bundle as { worldQuestId?: unknown }).worldQuestId !== undefined &&
    (bundle as { generatedRpgSeed?: unknown }).generatedRpgSeed !== undefined
  ) {
    throw new SaveIntegrityError(
      "Save source cannot carry both worldQuestId and generatedRpgSeed.",
    );
  }
  assertSaveSourceRefConsistency(bundle);
  if (expectedContentHash !== undefined) assertSaveContentHash(bundle, expectedContentHash);
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
