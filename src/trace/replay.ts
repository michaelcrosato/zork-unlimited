/**
 * Trace replay (spec §8.8).
 *
 * `replay(trace, rules)` reconstructs the initial state and applies the actions
 * through `step`, asserting the final hash if present. Determinism (§8.5) means
 * a correct engine ALWAYS reproduces the recorded hash; a mismatch points at the
 * exact first divergent step, which is how bugs become reproducible (§15).
 */
import { hashState } from "../core/hash.js";
import type { Rules } from "../core/engine.js";
import { runActions, type Trace } from "./record.js";

export type ReplayResult = {
  ok: boolean;
  finalHash: string;
  expectedFinalHash?: string;
  /** Index of the first action whose post-state diverged, if a baseline exists. */
  divergedAtStep?: number;
  message?: string;
};

/**
 * Replay a trace against a rule set. If the trace carries `expected_final_hash`,
 * the result `ok` reflects whether the replayed final hash matches it.
 */
export function replayTrace(trace: Trace, rules: Rules): ReplayResult {
  const run = runActions(rules, trace.initial_state, trace.actions);
  const finalHash = hashState(run.finalState);

  if (trace.expected_final_hash === undefined) {
    return { ok: true, finalHash, message: "Replayed with no expected hash to assert." };
  }

  if (finalHash === trace.expected_final_hash) {
    return { ok: true, finalHash, expectedFinalHash: trace.expected_final_hash };
  }

  return {
    ok: false,
    finalHash,
    expectedFinalHash: trace.expected_final_hash,
    message: `Final hash ${finalHash} != expected ${trace.expected_final_hash}.`,
  };
}
