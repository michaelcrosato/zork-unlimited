/**
 * Trace recording (spec §8.8).
 *
 * A Trace is a fully replayable artifact: source ref, content hash, seed, the
 * initial state, and the ordered actions. It is the backbone of regression
 * testing and bug reproduction (§15). The recorder runs the actions through the
 * engine and stamps the resulting final state hash so replay can assert it.
 */
import type { GameState } from "../core/state.js";
import { hashState } from "../core/hash.js";
import type { RpgAction, StepResult } from "../api/types.js";
import type { EngineAction, Rules } from "../core/engine.js";
import { makeStep } from "../core/engine.js";
import { SAVE_MODE, type SaveMode } from "../persist/save_load.js";
import { assertTraceIdentityFields } from "./integrity.js";
import {
  compactSourceLegacyMetadata,
  compactSourceRefFromMetadata,
  compactSourceRefLabel,
  type CompactSourceRef,
} from "../world/source_ref.js";

export type TraceSourceRef = CompactSourceRef;

export type Trace<A extends EngineAction = RpgAction> = {
  mode: SaveMode;
  /** Compact canonical source: world quest, generated RPG seed, or legacy pack fallback. */
  source_ref?: TraceSourceRef;
  /** Shipped world quest id, when the trace belongs to the open-world graph. */
  worldQuestId?: string;
  /** Procedural RPG generation seed, when the trace belongs to an in-memory generated pack. */
  generatedRpgSeed?: number;
  trace_id: string;
  /** Compatibility id retained for older tooling and historical traces. */
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
  worldQuestId?: string | null;
  generatedRpgSeed?: number | null;
};

const TRACE_SOURCE_LABELS = {
  source: "Trace source",
  worldQuestId: "Trace worldQuestId",
  generatedRpgSeed: "Trace generatedRpgSeed",
} as const;

function traceSourceRef(opts: RecordOptions): TraceSourceRef {
  const sourceRef = compactSourceRefFromMetadata(opts.pack_id, opts, TRACE_SOURCE_LABELS);
  if (!sourceRef.ok) throw new Error(sourceRef.error);
  return sourceRef.sourceRef;
}

export function traceSourceLabel(trace: {
  source_ref?: TraceSourceRef;
  worldQuestId?: string;
  generatedRpgSeed?: number;
  pack_id: string;
}): string {
  const ref = trace.source_ref;
  if (ref !== undefined) return compactSourceRefLabel(ref);
  if (trace.generatedRpgSeed !== undefined) return `generate_rpg_seed:${trace.generatedRpgSeed}`;
  return trace.worldQuestId ? `world_quest_id:${trace.worldQuestId}` : `pack_id:${trace.pack_id}`;
}

/** Run the actions and produce a Trace stamped with the final-state hash. */
export function recordTrace<A extends EngineAction>(
  rules: Rules<A>,
  initialState: GameState,
  actions: A[],
  opts: RecordOptions,
): Trace<A> {
  assertTraceIdentityFields(opts);
  const run = runActions(rules, initialState, actions);
  const sourceRef = traceSourceRef(opts);
  const sourceMetadata = compactSourceLegacyMetadata(sourceRef);
  return {
    mode: SAVE_MODE,
    source_ref: sourceRef,
    ...(sourceMetadata.worldQuestId !== undefined
      ? { worldQuestId: sourceMetadata.worldQuestId }
      : {}),
    ...(sourceMetadata.generatedRpgSeed !== undefined
      ? { generatedRpgSeed: sourceMetadata.generatedRpgSeed }
      : {}),
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
