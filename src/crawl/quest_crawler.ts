/**
 * Quest crawler — the zero-LLM mechanical game-crawler's stepping loop.
 *
 * Drives a `PreparedQuest` through many seeded episodes with a policy-driven
 * action choice, running these oracles:
 *   - CRASH      a THROW out of enumerate/resolve/render is an engine bug, never
 *                a silent propagation — caught, recorded with a lazy repro trace.
 *   - INTEGRITY  `assertRpgStateReferences` must hold after every accepted step.
 *   - LEGALITY   a listed-legal action must never be rejected; a sampled
 *                NOT-legal action must always be rejected cleanly (no throw, no
 *                state change).
 *   - RENDER     the observation + event text the player would actually see must
 *                never leak an unresolved template, "undefined", "[object
 *                Object]", "NaN", or empty text.
 *   - PERSIST    a save→load roundtrip of a live state must reproduce a
 *                byte-identical hash (§8.7); a throw is itself a finding.
 *   - DESYNC     replaying an episode's recorded actions from a fresh init state
 *                must reproduce the SAME per-step hash stream the live run saw —
 *                catches hidden non-determinism/mutable state a repro trace could
 *                never actually reproduce.
 *   - SOFTLOCK   two forms: an immediate S4 (live, non-ended state with zero legal
 *                actions) and an end-of-episode S3 solver form (an exhaustive
 *                best/worst-roll search from the post-episode state proves no
 *                declared ending is reachable; a capped-out search is unproven and
 *                never a finding).
 *
 * Repro traces are built LAZILY — only when a finding's fingerprint is genuinely
 * new (`addFinding`'s `collector.has` pre-check), never per step and never for a
 * fingerprint `collector.add` would just dedupe away, since throughput matters
 * over many episodes.
 */
import type { RpgAction, StepResult } from "../api/types.js";
import { makeStep, type Rules } from "../core/engine.js";
import { hashState } from "../core/hash.js";
import { mulberry32, type Rng } from "../core/rng.js";
import type { GameState } from "../core/state.js";
import { load, save, SAVE_MODE, type SaveMetadata } from "../persist/save_load.js";
import type { RpgActionOption } from "../rpg/legal_actions.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  initStateForRpgPack,
  type RpgIndex,
} from "../rpg/runner.js";
import { assertRpgStateReferences } from "../rpg/state_integrity.js";
import { exhaustiveEndingsMulti } from "../solve/exhaustive_endings.js";
import { recordTrace, type RecordOptions, type Trace } from "../trace/record.js";
import { z } from "zod";
import {
  CrawlLocationSchema,
  FindingCollector,
  type CrawlFinding,
  type CrawlSeverity,
} from "./findings.js";
import { renderDefects, sampleIllegalAction } from "./oracles.js";
import { makePolicy, type PolicyName } from "./policies.js";
import type { PreparedQuest } from "./prepare.js";

type CrawlLocation = z.infer<typeof CrawlLocationSchema>;

export type QuestCrawlOptions = {
  seed: number;
  maxSteps: number;
  policy: PolicyName;
  /** Steps per episode before a fresh episode starts. Default 300. */
  maxStepsPerEpisode?: number;
  /** Cadence for the (Task 5) PERSIST oracle; 0 disables it. Default 37. */
  persistEvery?: number;
  /** Cadence for negative-legality sampling; 0 disables it. Default 23. */
  illegalEvery?: number;
  /** Whether to run the (Task 5) end-of-episode DESYNC replay check. Default true. */
  desyncReplay?: boolean;
  /** (Task 5) SOFTLOCK-solver budget; 0 (default) keeps the solver off. */
  solverBudget?: number;
  commit: string;
  /** Extra location fields (region/node) when launched from the overworld. */
  location?: Partial<CrawlLocation>;
};

export type EpisodeRecord = {
  episodeSeed: number;
  actions: RpgAction[];
  perStepHashes: string[];
  endingId: string | null;
};

export type QuestCrawlResult = {
  questId: string;
  steps: number;
  episodes: EpisodeRecord[];
  endingsReached: string[];
  findings: CrawlFinding[];
  totalRawFindings: number;
  coverage: { roomsVisited: string[]; actionIdsTried: string[] };
};

/** `err.name: err.message` for an Error, else `String(err)`. */
function describeError(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

function none(): CrawlFinding["repro"] {
  return { kind: "none", trace: null, minimized: false };
}

/**
 * Build a replayable repro trace for an episode-so-far. Lazy by construction — only
 * ever called from a finding site (through `addFinding`'s dedupe pre-check below),
 * never once per step and never for a fingerprint already kept. A shipped quest's
 * trace carries its real `worldQuestId`; an in-memory pack (no on-disk source)
 * carries its episode seed as a `generatedRpgSeed` placeholder identity — the
 * trace is a diagnostic artifact here, not a claim that a generator minted this
 * exact pack from that seed.
 */
function buildRepro(prepared: PreparedQuest, record: EpisodeRecord): Trace<RpgAction> {
  const initial = initStateForRpgPack(prepared.index, record.episodeSeed);
  const traceId = `crawl:${prepared.questId}:${record.episodeSeed}`;
  const identity: RecordOptions =
    prepared.sourceRef && prepared.sourceRef[0] === "wq"
      ? {
          trace_id: traceId,
          content_hash: prepared.contentHash,
          worldQuestId: prepared.sourceRef[1],
        }
      : {
          trace_id: traceId,
          content_hash: prepared.contentHash,
          generatedRpgSeed: record.episodeSeed,
        };
  return recordTrace(prepared.rules, initial, record.actions, identity);
}

/** Result of replaying an episode's recorded actions (see `replayEpisodeHashes`). */
type ReplayResult = {
  hashes: string[];
  /** Set iff the replay itself threw; carries the action index and error text so
   *  the caller can surface a DESYNC finding instead of propagating the throw. */
  threw: { index: number; error: string } | null;
};

/**
 * Hand-rolled replay of a recorded episode's actions, from a fresh
 * `initStateForRpgPack` and a fresh `makeStep(rules)` closure, hashing after each
 * APPLIED action — mirroring exactly how the live loop built `record.perStepHashes`
 * (a hash pushed only for an accepted step; a rejected action leaves state, and the
 * hash stream, untouched). `runActions` (src/trace/record.ts) instead pushes a hash
 * after EVERY action regardless of `ok`, which misaligns index-for-index against
 * `perStepHashes` the moment either run ever rejects an action the other accepted —
 * so DESYNC steps its own loop rather than reusing it.
 *
 * The live loop already catches a throw from `rules.resolve`/`legalActions` as a
 * CRASH finding (never propagated); a replay-only rules wrapper (hidden state keyed
 * off a call count, say) can throw here even when the live run never did, since the
 * two runs don't share position in that hidden state. Wrapped so a throw here becomes
 * a reported DESYNC finding too, rather than crashing the whole crawl (Task 5 review
 * fix).
 */
function replayEpisodeHashes(
  rules: Rules<RpgAction>,
  index: RpgIndex,
  record: EpisodeRecord,
): ReplayResult {
  const step = makeStep(rules);
  let state = initStateForRpgPack(index, record.episodeSeed);
  const hashes: string[] = [];
  for (let i = 0; i < record.actions.length; i++) {
    const action = record.actions[i]!;
    try {
      const result = step(state, action);
      if (!result.ok) continue;
      state = result.state;
      hashes.push(hashState(state));
    } catch (err) {
      return { hashes, threw: { index: i, error: describeError(err) } };
    }
  }
  return { hashes, threw: null };
}

/**
 * Forced-roll RNG bracket for the SOFTLOCK(solver) oracle — same construction as
 * `tests/regression/rpg_all_endings_reachable.test.ts` (see there for the full
 * soundness argument): BEST forces the player's max strike / min damage taken / max
 * skill roll, WORST the reverse. Every successor `exhaustiveEndingsMulti` visits is a
 * real `makeStep` on a real, legal die value, so nothing spurious is ever reached; the
 * two extremes bracket every outcome a middle roll could produce, so an ending
 * reachable under SOME rolls is reached under one of the two regimes.
 */
const ROLL_HIGH = 0.999999;
const ROLL_LOW = 0;
function fixedSeqRng(fracs: number[]): Rng {
  let i = 0;
  const next = (): number => {
    const f = fracs[Math.min(i, fracs.length - 1)] ?? 0;
    i += 1;
    return f;
  };
  return {
    next,
    int(min: number, max: number): number {
      const lo = Math.ceil(min);
      const hi = Math.floor(max);
      return lo + Math.floor(next() * (hi - lo + 1));
    },
  };
}
// resolveAttack draws the player's strike first, the enemy's reply second;
// resolveSkillCheck draws once.
const bestRng = (): Rng => fixedSeqRng([ROLL_HIGH, ROLL_LOW]);
const worstRng = (): Rng => fixedSeqRng([ROLL_LOW, ROLL_HIGH]);

/** Deterministic per-episode seed derived from the crawl seed and episode index. */
export function episodeSeed(seed: number, episode: number): number {
  return (seed * 9973 + episode) >>> 0 || 1;
}

export function crawlQuest(prepared: PreparedQuest, opts: QuestCrawlOptions): QuestCrawlResult {
  const { index, rules } = prepared;
  const step = makeStep(rules);
  const collector = new FindingCollector({
    seed: opts.seed,
    policy: opts.policy,
    commit: opts.commit,
  });
  const roomsVisited = new Set<string>();
  const actionIdsTried = new Set<string>();
  const episodes: EpisodeRecord[] = [];
  const endingsReached = new Set<string>();
  let totalSteps = 0;
  let episodeN = 0;
  const illegalEvery = opts.illegalEvery ?? 23;
  const persistEvery = opts.persistEvery ?? 37;
  const desyncReplay = opts.desyncReplay ?? true;
  const solverBudget = opts.solverBudget ?? 0;

  const loc = (state: GameState): CrawlLocation => ({
    region: opts.location?.region ?? null,
    node: opts.location?.node ?? null,
    questId: prepared.questId,
    sceneId: state.current,
  });

  /**
   * Add a finding, building its repro trace only when the finding's fingerprint is
   * genuinely new — `collector.has` is the cheap pre-check that lets us skip
   * `buildRepro`'s O(actions-so-far) `recordTrace` replay whenever `collector.add`
   * would discard the finding as a duplicate anyway (a defect firing every step must
   * not pay that cost on every occurrence — Task 5 review fix). `record` is null only
   * for the one CRASH site that predates any recorded actions (episode init itself
   * threw).
   */
  const addFinding = (
    f: Omit<CrawlFinding, "seed" | "policy" | "commit" | "severity" | "repro"> & {
      severity?: CrawlSeverity;
    },
    record: EpisodeRecord | null,
  ): boolean => {
    const repro: CrawlFinding["repro"] =
      record && !collector.has(f)
        ? { kind: "rpg-trace", trace: buildRepro(prepared, record), minimized: false }
        : none();
    return collector.add({ ...f, repro });
  };

  const crash = (
    message: string,
    state: GameState,
    record: EpisodeRecord,
    action: RpgAction | null = null,
  ): void => {
    addFinding(
      {
        code: "CRASH",
        step: totalSteps,
        location: loc(state),
        action,
        message,
        stateHash: hashState(state),
      },
      record,
    );
  };

  while (totalSteps < opts.maxSteps) {
    const eSeed = episodeSeed(opts.seed, episodeN++);
    const rng = mulberry32(eSeed);
    const policy = makePolicy(opts.policy, rng);
    const loc0: CrawlLocation = {
      region: opts.location?.region ?? null,
      node: opts.location?.node ?? null,
      questId: prepared.questId,
      sceneId: null,
    };

    let state: GameState;
    try {
      state = initStateForRpgPack(index, eSeed);
    } catch (err) {
      addFinding(
        {
          code: "CRASH",
          step: 0,
          location: { ...loc0 },
          action: null,
          message: `init threw: ${describeError(err)}`,
          stateHash: null,
        },
        null,
      );
      break;
    }
    const record: EpisodeRecord = {
      episodeSeed: eSeed,
      actions: [],
      perStepHashes: [],
      endingId: null,
    };
    episodes.push(record);
    roomsVisited.add(state.current);
    // Set the moment the immediate S4 SOFTLOCK (zero legal actions) fires below, so
    // the end-of-episode solver-form check can skip itself for THIS episode — both
    // would otherwise be true but redundant findings for the same dead end (Task 5
    // review fix); the S4 one is kept since it fired first and needs no solver budget.
    let episodeSoftlockFired = false;

    for (
      let s = 0;
      s < (opts.maxStepsPerEpisode ?? 300) && totalSteps < opts.maxSteps;
      s++, totalSteps++
    ) {
      // 1. enumerate (CRASH oracle around it)
      let options: RpgActionOption[];
      try {
        options = enumerateRpgActions(index, state);
      } catch (err) {
        crash(`enumerate threw: ${describeError(err)}`, state, record);
        break;
      }
      if (state.ended) break;

      // 2. SOFTLOCK (immediate form): live state with zero legal actions
      if (options.length === 0) {
        addFinding(
          {
            code: "SOFTLOCK",
            severity: "S4",
            step: totalSteps,
            location: loc(state),
            action: null,
            message: "live (non-ended) state has zero legal actions",
            stateHash: hashState(state),
          },
          record,
        );
        episodeSoftlockFired = true;
        break;
      }

      // 3. LEGALITY (negative sampling): a sampled illegal action must be rejected cleanly
      if (illegalEvery && s > 0 && s % illegalEvery === 0) {
        const illegal = sampleIllegalAction(index, state, options, rng);
        if (illegal) {
          const before = hashState(state);
          try {
            const r = step(state, illegal);
            if (r.ok) {
              addFinding(
                {
                  code: "LEGALITY",
                  step: totalSteps,
                  location: loc(state),
                  action: illegal,
                  message: `illegal action was accepted: ${JSON.stringify(illegal)}`,
                  stateHash: hashState(r.state),
                },
                record,
              );
            } else if (hashState(r.state) !== before && hashState(state) !== before) {
              // The engine contract guarantees a rejection leaves state untouched
              // (r.state is the SAME reference, unchanged). Reaching here means the
              // rejection path itself mutated state in place — a purity violation.
              addFinding(
                {
                  code: "LEGALITY",
                  step: totalSteps,
                  location: loc(state),
                  action: illegal,
                  message: `illegal action rejection mutated state (was ${before})`,
                  stateHash: hashState(r.state),
                },
                record,
              );
            }
          } catch (err) {
            addFinding(
              {
                code: "LEGALITY",
                step: totalSteps,
                location: loc(state),
                action: illegal,
                message: `illegal action threw instead of clean rejection: ${describeError(err)}`,
                stateHash: hashState(state),
              },
              record,
            );
          }
        }
      }

      // 4. pick + execute a legal action (CRASH / LEGALITY-positive oracles)
      const choice = policy.pick(options, {
        visitedRooms: roomsVisited,
        triedActionIds: actionIdsTried,
      });
      let result: StepResult;
      try {
        result = step(state, choice.action);
      } catch (err) {
        crash(
          `step threw on legal action ${choice.id}: ${describeError(err)}`,
          state,
          record,
          choice.action,
        );
        break;
      }
      record.actions.push(choice.action);
      actionIdsTried.add(choice.id);
      if (!result.ok) {
        addFinding(
          {
            code: "LEGALITY",
            step: totalSteps,
            location: loc(state),
            action: choice.action,
            message: `listed legal action rejected: ${result.rejectionReason ?? "?"} (${choice.id})`,
            stateHash: hashState(state),
          },
          record,
        );
        continue; // state unchanged per engine contract
      }
      state = result.state;
      roomsVisited.add(state.current);
      record.perStepHashes.push(hashState(state));

      // 5. INTEGRITY
      try {
        assertRpgStateReferences(index, state);
      } catch (err) {
        addFinding(
          {
            code: "INTEGRITY",
            step: totalSteps,
            location: loc(state),
            action: choice.action,
            message: describeError(err),
            stateHash: hashState(state),
          },
          record,
        );
        break;
      }

      // 6. RENDER (observation + events; CRASH oracle around the render itself)
      try {
        for (const m of renderDefects(index, state, result.events)) {
          addFinding(
            {
              code: "RENDER",
              step: totalSteps,
              location: loc(state),
              action: choice.action,
              message: m,
              stateHash: hashState(state),
            },
            record,
          );
        }
      } catch (err) {
        crash(`observation render threw: ${describeError(err)}`, state, record, choice.action);
        break;
      }

      // 7. PERSIST: save→load must roundtrip to a byte-identical state on every state
      // the engine itself produced. A throw from save/load on such a state is itself
      // a finding (never propagated) — the point is that a well-formed engine state
      // must always be persistable.
      if (persistEvery > 0 && s % persistEvery === 0) {
        try {
          const metadata: SaveMetadata =
            prepared.sourceRef && prepared.sourceRef[0] === "wq"
              ? { worldQuestId: prepared.sourceRef[1] }
              : { generatedRpgSeed: eSeed };
          const bytes = save(state, prepared.contentHash, SAVE_MODE, metadata);
          const bundle = load(bytes, prepared.contentHash);
          if (hashState(bundle.state) !== hashState(state)) {
            addFinding(
              {
                code: "PERSIST",
                step: totalSteps,
                location: loc(state),
                action: choice.action,
                message: `save→load hash mismatch at step ${s}`,
                stateHash: hashState(state),
              },
              record,
            );
          }
        } catch (err) {
          addFinding(
            {
              code: "PERSIST",
              step: totalSteps,
              location: loc(state),
              action: choice.action,
              message: `save/load threw at step ${s}: ${describeError(err)}`,
              stateHash: hashState(state),
            },
            record,
          );
        }
      }

      if (state.ended) {
        record.endingId = state.endingId;
        if (state.endingId) endingsReached.add(state.endingId);
        break;
      }
    }

    // end-of-episode DESYNC replay: re-run the recorded actions from a fresh initial
    // state and a fresh step closure over the SAME rules, and compare per-step
    // hashes — any divergence means the engine's live behavior is not reproducible
    // from the recorded action list alone (e.g. hidden mutable state in a rules
    // wrapper), which is itself a defect a replay-based repro/regression tool can
    // never reproduce.
    if (desyncReplay) {
      const replay = replayEpisodeHashes(rules, index, record);
      if (replay.threw) {
        addFinding(
          {
            code: "DESYNC",
            step: totalSteps,
            location: loc(state),
            action: null,
            message: `replay threw: ${replay.threw.error} at action index ${replay.threw.index}`,
            stateHash: hashState(state),
          },
          record,
        );
      } else {
        const firstDivergence = record.perStepHashes.findIndex((h, i) => replay.hashes[i] !== h);
        if (firstDivergence !== -1) {
          addFinding(
            {
              code: "DESYNC",
              step: firstDivergence,
              location: loc(state),
              action: null,
              message: `replay diverged at action index ${firstDivergence}`,
              stateHash: hashState(state),
            },
            record,
          );
        }
      }
    }

    // end-of-episode SOFTLOCK (solver form): the episode ended without state.ended —
    // exhaustively search from the post-episode state under a best/worst-roll
    // bracket; an empty reached set with a completed (non-capped) search is a proven
    // no-ending-reachable dead end. A capped-out search is UNPROVEN and never a
    // finding. Skipped when the immediate S4 SOFTLOCK already fired this episode
    // (`episodeSoftlockFired`) — both are true for the same dead end, and firing both
    // is a redundant double-report, not a second bug (Task 5 review fix); the S4 one
    // already recorded it for free (no solver budget spent) so it's the one kept.
    if (solverBudget > 0 && !state.ended && !episodeSoftlockFired) {
      const bestRules = buildRpgRules(index, bestRng);
      const worstRules = buildRpgRules(index, worstRng);
      // Explicit `explore: () => true` — allow EVERY enumerated action, not the
      // module's default progress-only policy (which skips DROP/CLOSE/LOOK/
      // INVENTORY/READ/INSPECT). That default is sound for a reachability PROOF —
      // restricting the action set can only HIDE an ending, surfacing as a loud
      // "declared ending unreached" test failure — but it is INVERTED for this
      // oracle: here a hidden ending means reached.size === 0, i.e. a FALSE
      // softlock finding. READ in particular can carry route-gating interaction
      // effects (see exhaustive_endings.ts's SearchOpts doc), so it must not be
      // silently skipped here. Widening the policy can only ever grow `reached`
      // (or cap the search out, which yields no finding either way) — the extra
      // states explored are an acceptable cost for a sound oracle.
      const res = exhaustiveEndingsMulti([bestRules, worstRules], state, solverBudget, undefined, {
        explore: () => true,
      });
      if (res.reached.size === 0 && !res.cappedOut) {
        addFinding(
          {
            code: "SOFTLOCK",
            step: totalSteps,
            location: loc(state),
            action: null,
            message: `no declared ending reachable from post-episode state (searched ${res.states} states)`,
            stateHash: hashState(state),
          },
          record,
        );
      }
    }
  }

  return {
    questId: prepared.questId,
    steps: totalSteps,
    episodes,
    endingsReached: [...endingsReached].sort(),
    findings: collector.findings,
    totalRawFindings: collector.totalRaw,
    coverage: {
      roomsVisited: [...roomsVisited].sort(),
      actionIdsTried: [...actionIdsTried].sort(),
    },
  };
}
