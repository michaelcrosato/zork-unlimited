import { isRuntimeSeed, type GameState } from "../core/state.js";
import type { EngineAction } from "../core/engine.js";
import { assertWellFormedState, SaveIntegrityError } from "../persist/save_load.js";
import { generatedRpgSeedValidationMessage, isGeneratedRpgSeed } from "../gen/seed.js";
import {
  compactSourceRefLegacyConsistency,
  compactSourceRefValidationError,
  type CompactSourceRef,
} from "../world/source_ref.js";

export type TraceIdentityFields = {
  trace_id: string;
  pack_id: string;
  content_hash: string;
};

export type TraceStepHashFields = {
  per_step_hashes?: string[];
};

export type TraceActionFields = {
  actions: EngineAction[];
};

export type TraceStateFields = {
  seed: number;
  initial_state: GameState;
};

export type TraceExpectedFinalHashFields = {
  expected_final_hash?: string;
};

export type TraceSourceRefFields = {
  source_ref?: CompactSourceRef;
  worldQuestId?: string;
  generatedRpgSeed?: number;
};

const TRACE_SOURCE_REF_CONSISTENCY_MESSAGES = {
  sourceConflict: "Trace source cannot carry both worldQuestId and generatedRpgSeed.",
  worldQuestMismatch: (sourceRefWorldQuestId: string, worldQuestId: string) =>
    `Trace source_ref world quest ${JSON.stringify(
      sourceRefWorldQuestId,
    )} does not match worldQuestId ${JSON.stringify(worldQuestId)}.`,
  generatedSeedMismatch: (sourceRefGeneratedSeed: number, generatedRpgSeed: number) =>
    `Trace source_ref generated seed ${JSON.stringify(
      sourceRefGeneratedSeed,
    )} does not match generatedRpgSeed ${JSON.stringify(generatedRpgSeed)}.`,
  sourceRefConflictsWithGeneratedRpgSeed:
    "Trace source_ref world quest conflicts with generatedRpgSeed.",
  sourceRefConflictsWithWorldQuestId:
    "Trace source_ref generated seed conflicts with worldQuestId.",
  sourceRefPackFallbackConflict:
    "Trace source_ref pack fallback conflicts with explicit trace source metadata.",
} as const;

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new SaveIntegrityError(
      `${label} must be a non-empty string, got ${JSON.stringify(value)}.`,
    );
  }
}

export function assertTraceIdentityFields<
  T extends {
    trace_id?: unknown;
    pack_id?: unknown;
    content_hash?: unknown;
  },
>(trace: T): asserts trace is T & TraceIdentityFields {
  assertNonEmptyString(trace.trace_id, "Trace trace_id");
  assertNonEmptyString(trace.pack_id, "Trace pack_id");
  assertNonEmptyString(trace.content_hash, "Trace content_hash");
}

export function assertTraceActions<T extends { actions?: unknown }>(
  trace: T,
): asserts trace is T & TraceActionFields {
  if (!Array.isArray(trace.actions)) {
    throw new SaveIntegrityError("Trace actions must be an array.");
  }
  trace.actions.forEach((action, i) => {
    if (action === null || typeof action !== "object" || Array.isArray(action)) {
      throw new SaveIntegrityError(
        `Trace actions[${i}] must be an object with a non-empty string type, got ${JSON.stringify(
          action,
        )}.`,
      );
    }
    const type = (action as { type?: unknown }).type;
    if (typeof type !== "string" || type.length === 0) {
      throw new SaveIntegrityError(
        `Trace actions[${i}].type must be a non-empty string, got ${JSON.stringify(type)}.`,
      );
    }
  });
}

export function assertTraceState<T extends { seed?: unknown; initial_state?: unknown }>(
  trace: T,
): asserts trace is T & TraceStateFields {
  if (!isRuntimeSeed(trace.seed)) {
    throw new SaveIntegrityError(
      `Trace seed must be an integer within JavaScript's safe range, got ${JSON.stringify(
        trace.seed,
      )}.`,
    );
  }
  const state = assertWellFormedState(trace.initial_state);
  if (state.seed !== trace.seed) {
    throw new SaveIntegrityError(
      `Trace seed ${JSON.stringify(trace.seed)} must match initial_state.seed ${JSON.stringify(
        state.seed,
      )}.`,
    );
  }
}

export function assertTraceExpectedFinalHash<T extends { expected_final_hash?: unknown }>(
  trace: T,
): asserts trace is T & TraceExpectedFinalHashFields {
  if (trace.expected_final_hash === undefined) return;
  assertNonEmptyString(trace.expected_final_hash, "Trace expected_final_hash");
}

export function assertTraceStepHashes<
  T extends {
    actions?: unknown;
    per_step_hashes?: unknown;
  },
>(trace: T): asserts trace is T & TraceStepHashFields {
  if (trace.per_step_hashes === undefined) return;
  if (!Array.isArray(trace.per_step_hashes)) {
    throw new SaveIntegrityError("Trace per_step_hashes must be an array when present.");
  }
  assertTraceActions(trace);
  if (trace.per_step_hashes.length !== trace.actions.length) {
    throw new SaveIntegrityError(
      `Trace per_step_hashes length ${trace.per_step_hashes.length} must match actions length ${trace.actions.length}.`,
    );
  }
  trace.per_step_hashes.forEach((hash, i) => {
    assertNonEmptyString(hash, `Trace per_step_hashes[${i}]`);
  });
}

export function assertTraceSourceRefConsistency<
  T extends {
    source_ref?: unknown;
    worldQuestId?: unknown;
    generatedRpgSeed?: unknown;
  },
>(trace: T): asserts trace is T & TraceSourceRefFields {
  if (trace.worldQuestId !== undefined && typeof trace.worldQuestId !== "string") {
    throw new SaveIntegrityError(
      `Trace worldQuestId must be a string when present, got ${JSON.stringify(
        trace.worldQuestId,
      )}.`,
    );
  }
  if (trace.generatedRpgSeed !== undefined && !isGeneratedRpgSeed(trace.generatedRpgSeed)) {
    throw new SaveIntegrityError(
      generatedRpgSeedValidationMessage("Trace generatedRpgSeed", trace.generatedRpgSeed),
    );
  }
  if (trace.worldQuestId !== undefined && trace.generatedRpgSeed !== undefined) {
    throw new SaveIntegrityError(
      "Trace source cannot carry both worldQuestId and generatedRpgSeed.",
    );
  }
  if (trace.source_ref === undefined) return;
  const error = compactSourceRefValidationError(trace.source_ref, "Trace source_ref");
  if (error !== undefined) throw new SaveIntegrityError(error);
  const consistency = compactSourceRefLegacyConsistency(
    trace.source_ref as CompactSourceRef,
    {
      ...(trace.worldQuestId !== undefined ? { worldQuestId: trace.worldQuestId } : {}),
      ...(trace.generatedRpgSeed !== undefined ? { generatedRpgSeed: trace.generatedRpgSeed } : {}),
    },
    TRACE_SOURCE_REF_CONSISTENCY_MESSAGES,
  );
  if (!consistency.ok) throw new SaveIntegrityError(consistency.error);
}
