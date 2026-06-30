/**
 * Trace recording (spec §8.8).
 *
 * A Trace is a fully replayable artifact: pack id, content hash, seed, the
 * initial state, and the ordered actions. It is the backbone of regression
 * testing and bug reproduction (§15). The recorder runs the actions through the
 * engine and stamps the resulting final state hash so replay can assert it.
 */
import type { GameState } from "../core/state.js";
import { hashState } from "../core/hash.js";
import type { Action, StepResult } from "../api/types.js";
import type { EngineAction, Rules } from "../core/engine.js";
import { makeStep } from "../core/engine.js";

export type Trace<A extends EngineAction = Action> = {
  trace_id: string;
  pack_id: string;
  content_hash: string;
  seed: number;
  initial_state: GameState;
  actions: A[];
  /** Optional; asserted on replay (§8.8). */
  expected_final_hash?: string;
  /**
   * Trace v2 (optional, additive). The post-state hash after each action, in
   * order — `per_step_hashes[i]` is the hash after `actions[i]`. When present,
   * replay pinpoints the FIRST divergent action (`divergedAtStep`) instead of
   * only the final hash. Omitted on v1 traces, which replay unchanged.
   */
  per_step_hashes?: string[];
};

export type RunResult = {
  finalState: GameState;
  steps: StepResult[];
  /** Per-step state hash AFTER each action (used for divergence detection). */
  hashes: string[];
};

/** Apply a sequence of actions through the engine. Pure end to end. */
export function runActions<A extends EngineAction>(
  rules: Rules<A>,
  initialState: GameState,
  actions: A[],
): RunResult {
  const step = makeStep(rules);
  let state = initialState;
  const steps: StepResult[] = [];
  const hashes: string[] = [];
  for (const action of actions) {
    const result = step(state, action);
    state = result.state;
    steps.push(result);
    hashes.push(hashState(state));
  }
  return { finalState: state, steps, hashes };
}

export type RecordOptions = {
  trace_id: string;
  pack_id: string;
  content_hash: string;
};

/** Run the actions and produce a Trace stamped with the final-state hash. */
export function recordTrace<A extends EngineAction>(
  rules: Rules<A>,
  initialState: GameState,
  actions: A[],
  opts: RecordOptions,
): Trace<A> {
  const run = runActions(rules, initialState, actions);
  return {
    trace_id: opts.trace_id,
    pack_id: opts.pack_id,
    content_hash: opts.content_hash,
    seed: initialState.seed,
    initial_state: initialState,
    actions,
    expected_final_hash: hashState(run.finalState),
    per_step_hashes: run.hashes,
  };
}
