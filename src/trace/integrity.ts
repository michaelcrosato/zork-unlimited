import { SaveIntegrityError } from "../persist/save_load.js";

export type TraceIdentityFields = {
  trace_id: string;
  pack_id: string;
  content_hash: string;
};

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new SaveIntegrityError(
      `${label} must be a non-empty string, got ${JSON.stringify(value)}.`,
    );
  }
}

export function assertTraceIdentityFields(trace: {
  trace_id?: unknown;
  pack_id?: unknown;
  content_hash?: unknown;
}): asserts trace is TraceIdentityFields {
  assertNonEmptyString(trace.trace_id, "Trace trace_id");
  assertNonEmptyString(trace.pack_id, "Trace pack_id");
  assertNonEmptyString(trace.content_hash, "Trace content_hash");
}
