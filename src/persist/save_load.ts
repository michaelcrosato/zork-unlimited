/**
 * Save / load (spec §8.7).
 *
 * A save = the full GameState + compact RPG source identity + content hash.
 * Loading MUST verify the content hash against the content it will be played on;
 * a mismatch is a hard error, never a silent re-interpretation (§8.8, §16
 * "integrity at load"). This prevents replaying a save against edited content
 * and corrupting it.
 */
import { z } from "zod";
import { MAX_ENGINE_STEP, cloneGameState, isRuntimeSeed, type GameState } from "../core/state.js";
import { canonicalize } from "../core/hash.js";
import { generatedRpgSeedValidationMessage, isGeneratedRpgSeed } from "../gen/seed.js";
import {
  compactSourceLegacyMetadata,
  compactSourceRefFromMetadata,
  compactSourceRefLegacyConsistency,
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
 * `seed`/`step` are gated to the safe INTEGER domain. `rngForStep`
 * (rng.ts:44) consumes both via `>>> 0`, so non-integers silently truncate to a
 * DIFFERENT value than the one the save's content hash (hash.ts `canonicalize`)
 * committed to. `step` is also bounded to the engine's safe increment domain;
 * an unsafe integer can make `step + 1` stop advancing precisely. `seed` stays
 * signed — negative seeds are legitimate (`mulberry32` does `seed >>> 0`,
 * defined for negatives) — but unsafe integers are rejected before persistence
 * can commit an imprecise identity.
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
    // (negative seeds are legitimate); step is a bounded monotonic counter.
    seed: z.number().int().refine(isRuntimeSeed, {
      message: "GameState seed must be within JavaScript's safe integer range.",
    }),
    step: z.number().int().nonnegative().max(MAX_ENGINE_STEP),
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
  contentHash: string;
  /** Pack mode. Required so persisted state is bound to the unified RPG engine. */
  mode: SaveMode;
  /** Compact canonical source identity. Legacy fields below remain compatibility mirrors. */
  source_ref: SaveSourceRef;
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

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new SaveIntegrityError(
      `${label} must be a non-empty string, got ${JSON.stringify(value)}.`,
    );
  }
}

function deepFreezeSaveBundle<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return value;
  const object = value as object;
  if (seen.has(object) || Object.isFrozen(object)) return value;
  seen.add(object);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreezeSaveBundle(child, seen);
  }
  return Object.freeze(value);
}

function cloneSaveSourceRef(sourceRef: SaveSourceRef): SaveSourceRef {
  return [sourceRef[0], sourceRef[1]] as SaveSourceRef;
}

function immutableLoadedSaveBundle(bundle: SaveBundle): SaveBundle {
  const sourceRef = cloneSaveSourceRef(bundle.source_ref);
  return deepFreezeSaveBundle({
    ...bundle,
    state: cloneGameState(bundle.state),
    source_ref: sourceRef,
  });
}

const SAVE_SOURCE_LABELS = {
  source: "Save source",
  worldQuestId: "Save worldQuestId",
  generatedRpgSeed: "Save generatedRpgSeed",
} as const;
const SAVE_SOURCE_REF_CONSISTENCY_MESSAGES = {
  sourceConflict: "Save source cannot carry both worldQuestId and generatedRpgSeed.",
  worldQuestMismatch: (sourceRefWorldQuestId: string, worldQuestId: string) =>
    `Save source_ref world quest ${JSON.stringify(
      sourceRefWorldQuestId,
    )} does not match worldQuestId ${JSON.stringify(worldQuestId)}.`,
  generatedSeedMismatch: (sourceRefGeneratedSeed: number, generatedRpgSeed: number) =>
    `Save source_ref generated seed ${JSON.stringify(
      sourceRefGeneratedSeed,
    )} does not match generatedRpgSeed ${JSON.stringify(generatedRpgSeed)}.`,
  sourceRefConflictsWithGeneratedRpgSeed:
    "Save source_ref world quest conflicts with generatedRpgSeed.",
  sourceRefConflictsWithWorldQuestId: "Save source_ref generated seed conflicts with worldQuestId.",
} as const;

/** Serialize a save to canonical bytes (stable across machines/runs). */
export function save(
  state: GameState,
  contentHash: string,
  mode: SaveMode = SAVE_MODE,
  metadata: SaveMetadata = {},
): string {
  assertRpgMode(mode, "Save mode");
  assertNonEmptyString(contentHash, "Save contentHash");
  assertWellFormedState(state);
  const sourceRef = saveSourceRef(metadata);
  const sourceMetadata = compactSourceLegacyMetadata(sourceRef);
  const bundle: SaveBundle = {
    version: SAVE_VERSION,
    contentHash,
    state,
    mode,
    source_ref: sourceRef,
    ...(sourceMetadata.worldQuestId !== undefined
      ? { worldQuestId: sourceMetadata.worldQuestId }
      : {}),
    ...(sourceMetadata.generatedRpgSeed !== undefined
      ? { generatedRpgSeed: sourceMetadata.generatedRpgSeed }
      : {}),
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
  if (!isGeneratedRpgSeed(seed)) {
    throw new SaveIntegrityError(generatedRpgSeedValidationMessage(label, seed));
  }
}

function saveSourceRef(metadata: SaveMetadata): SaveSourceRef {
  const sourceRef = compactSourceRefFromMetadata(metadata, SAVE_SOURCE_LABELS);
  if (!sourceRef.ok) throw new SaveIntegrityError(sourceRef.error);
  return sourceRef.sourceRef;
}

function assertSaveSourceRef(raw: unknown): asserts raw is SaveSourceRef {
  if (raw === undefined) {
    throw new SaveIntegrityError("Save source_ref is required.");
  }
  const error = compactSourceRefValidationError(raw, "Save source_ref");
  if (error !== undefined) throw new SaveIntegrityError(error);
}

function assertSaveSourceRefConsistency(bundle: SaveBundle): void {
  const sourceRef = (bundle as { source_ref?: unknown }).source_ref;
  assertSaveSourceRef(sourceRef);
  const consistency = compactSourceRefLegacyConsistency(
    sourceRef,
    {
      ...((bundle as { worldQuestId?: string }).worldQuestId !== undefined
        ? { worldQuestId: (bundle as { worldQuestId: string }).worldQuestId }
        : {}),
      ...((bundle as { generatedRpgSeed?: number }).generatedRpgSeed !== undefined
        ? { generatedRpgSeed: (bundle as { generatedRpgSeed: number }).generatedRpgSeed }
        : {}),
    },
    SAVE_SOURCE_REF_CONSISTENCY_MESSAGES,
  );
  if (!consistency.ok) throw new SaveIntegrityError(consistency.error);
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
  if ("packId" in (bundle as Record<string, unknown>)) {
    throw new SaveIntegrityError("Save packId is retired; use source_ref plus contentHash.");
  }
  assertRpgMode((bundle as { mode?: unknown }).mode, "Save mode");
  assertOptionalRpgMode(expectedMode, "Expected mode");
  assertNonEmptyString((bundle as { contentHash?: unknown }).contentHash, "Save contentHash");
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
  // save is an integrity failure, not a value to repair. We validate before
  // cloning/freezing, so a valid state's bytes/hash stay identical.
  const parsedState = GameStateSchema.safeParse((bundle as { state?: unknown }).state);
  if (!parsedState.success) {
    throw new SaveIntegrityError(
      `Save state is malformed or non-finite: ${parsedState.error.message}`,
    );
  }
  return immutableLoadedSaveBundle(bundle);
}
