/**
 * Minimization (Task 6) — delta debugging (ddmin) over a recorded action
 * sequence, plus the machinery to re-run a (candidate) sequence and check
 * whether it still reproduces a specific finding fingerprint.
 *
 * **Justification (spec asks):** fast-check shrinking only integrates when the
 * walk itself is a fast-check property over an action-list arbitrary; our
 * walks are policy-directed (coverage/mixed) and stateful, so the generator
 * isn't an arbitrary. ddmin over the *recorded* sequence works uniformly for
 * every policy and for fault-injection replays, at the cost of O(n²)
 * worst-case re-runs — acceptable because repro sequences are ≤ a few hundred
 * actions and re-running is thousands of steps/sec.
 */
import type { RpgAction } from "../api/types.js";
import { makeStep } from "../core/engine.js";
import type { GameState } from "../core/state.js";
import { enumerateRpgActions, initStateForRpgPack } from "../rpg/runner.js";
import { recordTrace, type RecordOptions } from "../trace/record.js";
import { findingFingerprint, type CrawlFinding } from "./findings.js";
import type { PreparedQuest } from "./prepare.js";
import type { EpisodeRecord } from "./quest_crawler.js";
import {
  runStepOracles,
  S4_SOFTLOCK_MESSAGE,
  softlockSolverCheck,
  type CrawlLocation,
} from "./step_oracles.js";

/**
 * Classic ddmin (Zeller's delta debugging). `reproduces(candidate)` re-executes
 * and returns true if the SAME finding fingerprint occurs. Result: a
 * subsequence of `actions` that still reproduces; 1-minimal w.r.t. removing
 * any single remaining element.
 *
 * Standard shape: try removing chunks at increasing granularity (starting at
 * n=2, doubling on failure, resetting to 2 on a successful removal), then a
 * final single-element elimination pass. No exhaustive subset search —
 * O(n log n)-ish re-runs, never O(2^n).
 */
export function minimizeActions<A>(
  actions: readonly A[],
  reproduces: (candidate: readonly A[]) => boolean,
): A[] {
  let current: A[] = [...actions];
  let granularity = 2;

  while (current.length >= 2) {
    const chunkSize = Math.ceil(current.length / granularity);
    let removedSomething = false;

    for (let i = 0; i < current.length; i += chunkSize) {
      const candidate = [...current.slice(0, i), ...current.slice(i + chunkSize)];
      if (candidate.length === current.length) continue;
      if (reproduces(candidate)) {
        current = candidate;
        granularity = Math.max(granularity - 1, 2);
        removedSomething = true;
        break;
      }
    }

    if (!removedSomething) {
      if (granularity >= current.length) break;
      granularity = Math.min(granularity * 2, current.length);
    }
  }

  // Final pass: single-element elimination (1-minimality) — try removing each
  // remaining element individually; keep the removal if it still reproduces.
  let i = 0;
  while (i < current.length) {
    const candidate = [...current.slice(0, i), ...current.slice(i + 1)];
    if (reproduces(candidate)) {
      current = candidate; // don't advance i — the next element shifted here
    } else {
      i++;
    }
  }

  return current;
}

/**
 * Re-run `actions` from a fresh episode state (`initStateForRpgPack(index,
 * episodeSeedValue)`); true iff a finding with `fingerprint` occurs anywhere
 * during the replay (per-step CRASH/INTEGRITY/RENDER/PERSIST via
 * `runStepOracles` — shared with `crawlQuest`'s stepping loop so the two can
 * never drift — plus the end-of-episode SOFTLOCK S4/S3 mirror). A candidate
 * action that gets rejected (`ok:false`) is skipped silently — rejection is
 * legal during shrinking, since a shrunk subsequence may break a
 * precondition the original sequence satisfied. Shared by `minimizeActions`
 * callers and the fault-injection acceptance suite (Task 9).
 */
export function reproducesFingerprint(
  prepared: PreparedQuest,
  episodeSeedValue: number,
  actions: readonly RpgAction[],
  fingerprint: string,
  opts?: { persistEvery?: number; solverBudget?: number },
): boolean {
  const { index, rules } = prepared;
  const step = makeStep(rules);
  const persistEvery = opts?.persistEvery ?? 0;
  const solverBudget = opts?.solverBudget ?? 0;

  const loc = (state: GameState): CrawlLocation => ({
    region: null,
    node: null,
    questId: prepared.questId,
    sceneId: state.current,
  });

  const matches = (f: Pick<CrawlFinding, "code" | "location" | "message">): boolean =>
    findingFingerprint(f) === fingerprint;

  let state: GameState;
  try {
    state = initStateForRpgPack(index, episodeSeedValue);
  } catch {
    return false;
  }

  for (let s = 0; s < actions.length; s++) {
    const action = actions[s]!;
    const outcome = runStepOracles({
      prepared,
      step,
      state,
      action,
      totalStep: s,
      loc,
      eSeed: episodeSeedValue,
      sInEpisode: s,
      persistEvery,
    });

    if (outcome.kind === "crashed") {
      return outcome.findings.some(matches);
    }
    if (outcome.kind === "rejected") continue; // legal during shrinking; skip silently

    state = outcome.state;
    if (outcome.findings.some(matches)) return true;
    if (outcome.fatal) return false; // INTEGRITY/RENDER-crash halts the episode
    if (state.ended) break;
  }

  // End-of-episode SOFTLOCK mirror: S4 (immediate, zero legal actions) first —
  // matching crawlQuest's rule that the solver form never ALSO fires for the
  // same dead end — then S3 (solver form), only when a budget was supplied.
  if (state.ended) return false;

  let options: ReturnType<typeof enumerateRpgActions>;
  try {
    options = enumerateRpgActions(index, state);
  } catch {
    return false;
  }
  if (options.length === 0) {
    return matches({ code: "SOFTLOCK", location: loc(state), message: S4_SOFTLOCK_MESSAGE });
  }

  if (solverBudget > 0) {
    const softlock = softlockSolverCheck(index, state, solverBudget);
    if (softlock) {
      return matches({ code: "SOFTLOCK", location: loc(state), message: softlock.message });
    }
  }

  return false;
}

/** Finding codes `reproducesFingerprint` can actually re-trigger (it replays a
 *  fixed action sequence through the per-step + end-of-episode oracles only —
 *  DESYNC compares two runs, WORLD/ORPHAN are overworld/report-only, and a
 *  negative-legality LEGALITY sample isn't part of the recorded action
 *  sequence at all, so none of those are reproducible this way). */
const REPRODUCIBLE_CODES = new Set<CrawlFinding["code"]>([
  "CRASH",
  "INTEGRITY",
  "RENDER",
  "PERSIST",
  "SOFTLOCK",
]);

/** Generous but bounded — the SOFTLOCK(solver) oracle's reproduction budget
 *  when minimizing a SOFTLOCK finding; matches the scale the crawler's own
 *  SOFTLOCK(solver) tests use (Task 5). */
const MINIMIZE_SOLVER_BUDGET = 20000;

function traceIdentity(prepared: PreparedQuest, episodeSeedValue: number): RecordOptions {
  const traceId = `crawl:${prepared.questId}:${episodeSeedValue}:min`;
  return prepared.sourceRef && prepared.sourceRef[0] === "wq"
    ? { trace_id: traceId, content_hash: prepared.contentHash, worldQuestId: prepared.sourceRef[1] }
    : { trace_id: traceId, content_hash: prepared.contentHash, generatedRpgSeed: episodeSeedValue };
}

/**
 * Minimize a finding's episode actions and return an updated finding with
 * `repro.trace` rebuilt via `recordTrace` from the minimized sequence and
 * `repro.minimized=true`. A best-effort operation: when `finding.code` isn't
 * one `reproducesFingerprint` can re-trigger, or the (candidate-tolerant)
 * replay model can't reproduce the finding at all (e.g. a DESYNC or a
 * negative-legality sample), the finding is returned UNCHANGED — never
 * throws.
 */
export function minimizeFinding(
  prepared: PreparedQuest,
  finding: CrawlFinding,
  episode: EpisodeRecord,
): CrawlFinding {
  if (!REPRODUCIBLE_CODES.has(finding.code)) return finding;

  try {
    const fingerprint = findingFingerprint(finding);
    // The immediate S4 SOFTLOCK form (a live, zero-legal-actions dead end)
    // reproduces from the end-of-replay S4 check alone — enabling the solver
    // budget for it too would waste a full exhaustive search on every ddmin
    // candidate that DOESN'T happen to land back in that exact dead end (most
    // of them, while shrinking). Only the S3 solver-form SOFTLOCK needs it.
    const isSolverFormSoftlock = finding.code === "SOFTLOCK" && finding.severity !== "S4";
    const opts = {
      persistEvery: finding.code === "PERSIST" ? 1 : 0,
      solverBudget: isSolverFormSoftlock ? MINIMIZE_SOLVER_BUDGET : 0,
    };

    const reproducesDirect = (candidate: readonly RpgAction[]): boolean =>
      reproducesFingerprint(prepared, episode.episodeSeed, candidate, fingerprint, opts);

    // A CRASH from `step` itself throwing is caught BEFORE its action is
    // appended to `episode.actions` (so the live, lazily-built repro trace
    // stays safely replayable via `recordTrace` — see quest_crawler.ts) —
    // append it back on here so the reproducer (which tolerates that same
    // throw) can see it. Every other finding code's triggering action is
    // already the tail of `episode.actions`.
    let trigger: RpgAction | null = null;
    let reproduces: (candidate: readonly RpgAction[]) => boolean;
    if (reproducesDirect(episode.actions)) {
      reproduces = reproducesDirect;
    } else if (
      finding.action != null &&
      reproducesDirect([...episode.actions, finding.action as RpgAction])
    ) {
      trigger = finding.action as RpgAction;
      reproduces = (candidate) => reproducesDirect([...candidate, trigger as RpgAction]);
    } else {
      return finding; // not reproducible under this replay model — leave as-is
    }

    const minimizedPrefix = minimizeActions(episode.actions, reproduces);

    const initial = initStateForRpgPack(prepared.index, episode.episodeSeed);
    const identity = traceIdentity(prepared, episode.episodeSeed);
    const trace = recordTrace(prepared.rules, initial, minimizedPrefix, identity);

    return { ...finding, repro: { kind: "rpg-trace", trace, minimized: true } };
  } catch {
    return finding;
  }
}
