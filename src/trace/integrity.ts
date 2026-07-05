import { isRuntimeSeed, type GameState } from "../core/state.js";
import { assertWellFormedState, SaveIntegrityError } from "../persist/save_load.js";

export type TraceIdentityFields = {
  trace_id: string;
  pack_id: string;
  content_hash: string;
};

export type TraceStepHashFields = {
  per_step_hashes?: string[];
};

export type TraceActionFields = {
  actions: unknown[];
};

export type TraceStateFields = {
  seed: number;
  initial_state: GameState;
};

export type TraceExpectedFinalHashFields = {
  expected_final_hash?: string;
};

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
