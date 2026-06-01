/**
 * Debugger agent (spec §12.5, §15).
 *
 * Turns a failed or odd playthrough into a REPLAYABLE bug artifact plus a
 * diagnosis. It is deterministic code over the pure engine: it replays a trace's
 * actions through `step`, inspects the terminal state and the legal-action set at
 * each turn, and classifies what went wrong (soft-lock, conversation trap, an
 * unrecoverable death, or a loop with no exit). The artifact it emits is the §15
 * format — exactly what `bin/replay` and a regression test consume so every bug
 * becomes reproducible forever.
 *
 * No LLM is required to *find* a structural failure; the engine's legal-action
 * set is ground truth. A model can still author the prose diagnosis, but the
 * classification here is code, so it cannot be argued away.
 */
import type { GameState } from "../src/core/state.js";
import type { Rules } from "../src/core/engine.js";
import { makeStep } from "../src/core/engine.js";
import { hashState } from "../src/core/hash.js";
import type { Action } from "../src/api/types.js";

export type FailureType =
  | "soft_lock" // not ended, but no legal action makes progress
  | "loop" // revisits a prior state with no ending reachable
  | "rejected_action" // a step the player expected to work was illegal
  | "death_unrecoverable" // ended on a death with no earlier save point in the trace
  | "no_failure"; // reached a (non-death) ending cleanly

export type Diagnosis = {
  type: FailureType;
  description: string;
  severity: "low" | "medium" | "high";
  where: string[];
  /** Step index (0-based action ordinal) at which the issue manifested. */
  step: number;
};

export type DiagnoseOptions = {
  /** True if `endingId` is a winning (non-death) ending. Defaults to "any ending wins". */
  isWinningEnding?: (endingId: string) => boolean;
  /** Location label for `where` (scene/room id). Defaults to `state.current`. */
  locationLabel?: (state: GameState) => string;
};

/**
 * Replay a trace and classify its outcome. Pure: same (rules, state, actions) ⇒
 * same diagnosis (§8.5). Detects the classic adventure failure modes a playtester
 * persona surfaces (§12.8) without needing to understand the content.
 */
export function diagnose(
  rules: Rules,
  initialState: GameState,
  actions: Action[],
  opts: DiagnoseOptions = {},
): Diagnosis {
  const step = makeStep(rules);
  const where = (s: GameState): string => opts.locationLabel?.(s) ?? s.current;
  // Progress key ignores the monotonic step counter: returning to the same
  // *meaningful* state (location/flags/vars/inventory/objects) is a non-progress
  // loop even though the step number always advances.
  const progressKey = (s: GameState): string => hashState({ ...s, step: 0 });
  let state = initialState;
  const seen = new Set<string>([progressKey(state)]);

  for (let i = 0; i < actions.length; i++) {
    const result = step(state, actions[i]!);
    if (!result.ok) {
      return {
        type: "rejected_action",
        description: `Action #${i} (${actions[i]!.type}) was rejected: ${result.rejectionReason ?? "illegal"}.`,
        severity: "medium",
        where: [`location:${where(state)}`],
        step: i,
      };
    }
    state = result.state;
    const h = progressKey(state);
    // A repeated state with no ending reached is a non-progress loop.
    if (!state.ended && seen.has(h)) {
      return {
        type: "loop",
        description: `The playthrough returned to an already-seen state at "${where(state)}" without ending — a non-progress loop.`,
        severity: "medium",
        where: [`location:${where(state)}`],
        step: i,
      };
    }
    seen.add(h);
  }

  if (state.ended) {
    const id = state.endingId ?? "(unknown)";
    const won = opts.isWinningEnding ? opts.isWinningEnding(id) : true;
    if (won) {
      return {
        type: "no_failure",
        description: `Reached ending "${id}".`,
        severity: "low",
        where: [`ending:${id}`],
        step: actions.length,
      };
    }
    return {
      type: "death_unrecoverable",
      description: `Ended on death/failure ending "${id}". Recoverable only if an earlier save exists (§8.7); this trace carries none.`,
      severity: "high",
      where: [`ending:${id}`],
      step: actions.length,
    };
  }

  // Not ended after the trace: is the player stuck (no legal actions)?
  const legal = rules.legalActions(state);
  if (legal.length === 0) {
    return {
      type: "soft_lock",
      description: `At "${where(state)}" there are no legal actions and the game has not ended — a soft-lock.`,
      severity: "high",
      where: [`location:${where(state)}`],
      step: actions.length,
    };
  }
  return {
    type: "no_failure",
    description: `Playthrough ran out of recorded actions at "${where(state)}" with ${legal.length} legal action(s) remaining.`,
    severity: "low",
    where: [`location:${where(state)}`],
    step: actions.length,
  };
}

export type FixLayer =
  | "content"
  | "engine_rule"
  | "validator"
  | "test"
  | "hint_text"
  | "quest_structure";

/** The §15 bug-artifact shape, ready to serialize to traces/bugs/. */
export type BugArtifact = {
  bug_id: string;
  pack_id: string;
  content_hash: string;
  seed: number;
  initial_state: "start" | GameState;
  trace: Action[];
  failure: { type: FailureType; description: string; severity: Diagnosis["severity"] };
  expected: string[];
  fix?: { layer: FixLayer; summary: string };
  regression_test?: string;
};

export type BuildArtifactOptions = {
  bugId: string;
  packId: string;
  contentHash: string;
  /** Embed the full initial state, or just the marker "start". */
  embedInitialState?: boolean;
  expected?: string[];
  fix?: { layer: FixLayer; summary: string };
  regressionTest?: string;
};

/** Build a §15 bug artifact from a diagnosis + the offending trace. */
export function toBugArtifact(
  initialState: GameState,
  actions: Action[],
  diagnosis: Diagnosis,
  opts: BuildArtifactOptions,
): BugArtifact {
  return {
    bug_id: opts.bugId,
    pack_id: opts.packId,
    content_hash: opts.contentHash,
    seed: initialState.seed,
    initial_state: opts.embedInitialState ? initialState : "start",
    trace: actions,
    failure: {
      type: diagnosis.type,
      description: diagnosis.description,
      severity: diagnosis.severity,
    },
    expected: opts.expected ?? defaultExpectations(diagnosis.type),
    ...(opts.fix ? { fix: opts.fix } : {}),
    ...(opts.regressionTest ? { regression_test: opts.regressionTest } : {}),
  };
}

function defaultExpectations(type: FailureType): string[] {
  switch (type) {
    case "soft_lock":
      return [
        "every reachable non-ending state offers at least one progress-making action (§10, §17.3)",
      ];
    case "loop":
      return ["loops are intentional and declared; every other path terminates (§17.6)"];
    case "death_unrecoverable":
      return ["death endings remain recoverable via an earlier save (§8.7, §13 Stage 3)"];
    case "rejected_action":
      return [
        "the legal-action set never offers an action the engine then rejects (§14 testing strategy)",
      ];
    case "no_failure":
      return ["no change required"];
  }
}
