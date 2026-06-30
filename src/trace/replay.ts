/**
 * Trace replay (spec §8.8).
 *
 * `replay(trace, rules)` reconstructs the initial state and applies the actions
 * through `step`, asserting the recorded FINAL hash if present. Determinism
 * (§8.5) means a correct engine always reproduces that hash; a mismatch is how
 * bugs become reproducible (§15). When the trace carries Trace-v2
 * `per_step_hashes`, replay also pinpoints the FIRST divergent action
 * (`divergedAtStep`); a v1 trace (final hash only) replays exactly as before.
 */
import { hashState } from "../core/hash.js";
import type { Rules } from "../core/engine.js";
import { runActions, type Trace } from "./record.js";
import type { Action } from "../api/types.js";

export type ReplayResult = {
  ok: boolean;
  finalHash: string;
  expectedFinalHash?: string;
  /**
   * Index of the first action whose post-state hash diverged from the trace's
   * recorded `per_step_hashes` baseline. Populated only when the trace carries
   * that Trace-v2 field AND a divergence exists; otherwise undefined (a v1 trace
   * has no per-step baseline, so divergence can only be known at the final hash).
   */
  divergedAtStep?: number;
  message?: string;
};

/** First index where two hash arrays differ, comparing only the overlap; -1 if none. */
function firstDivergentStep(actual: string[], baseline: string[]): number {
  const n = Math.min(actual.length, baseline.length);
  for (let i = 0; i < n; i++) {
    if (actual[i] !== baseline[i]) return i;
  }
  return -1;
}

/**
 * Replay a trace against a rule set. If the trace carries `expected_final_hash`,
 * the result `ok` reflects whether the replayed final hash matches it. If it also
 * carries `per_step_hashes` (Trace v2), `divergedAtStep` localizes the first
 * action whose post-state diverged — the actual debugging value (§15).
 */
export function replayTrace<A extends Action>(trace: Trace, rules: Rules<A>): ReplayResult {
  const run = runActions(rules, trace.initial_state, trace.actions);
  const finalHash = hashState(run.finalState);

  // Localize the first divergent step when a per-step baseline exists.
  let divergedAtStep: number | undefined;
  if (trace.per_step_hashes !== undefined) {
    const idx = firstDivergentStep(run.hashes, trace.per_step_hashes);
    if (idx !== -1) divergedAtStep = idx;
  }
  const stepField = divergedAtStep !== undefined ? { divergedAtStep } : {};

  if (trace.expected_final_hash === undefined) {
    return {
      ok: true,
      finalHash,
      ...stepField,
      message: "Replayed with no expected final hash to assert.",
    };
  }

  const finalMatches = finalHash === trace.expected_final_hash;
  if (finalMatches && divergedAtStep === undefined) {
    return { ok: true, finalHash, expectedFinalHash: trace.expected_final_hash };
  }

  const where =
    divergedAtStep !== undefined
      ? ` First divergence at step ${divergedAtStep} (action ${describeAction(trace, divergedAtStep)}).`
      : "";
  return {
    ok: finalMatches && divergedAtStep === undefined,
    finalHash,
    expectedFinalHash: trace.expected_final_hash,
    ...stepField,
    message: `Final hash ${finalHash} ${finalMatches ? "==" : "!="} expected ${
      trace.expected_final_hash
    }.${where}`,
  };
}

/** Best-effort, side-effect-free label for the action at a divergent step. */
function describeAction(trace: Trace, step: number): string {
  const action = trace.actions[step];
  if (action === undefined) return "out of range";
  const id = (action as { id?: unknown }).id;
  const type = (action as { type?: unknown }).type;
  return [type, id].filter((v) => typeof v === "string").join(":") || JSON.stringify(action);
}
