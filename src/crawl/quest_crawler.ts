/**
 * Quest crawler — the zero-LLM mechanical game-crawler's stepping loop.
 *
 * Drives a `PreparedQuest` through many seeded episodes with a policy-driven
 * action choice, running four oracles at every step:
 *   - CRASH      a THROW out of enumerate/resolve/render is an engine bug, never
 *                a silent propagation — caught, recorded with a lazy repro trace.
 *   - INTEGRITY  `assertRpgStateReferences` must hold after every accepted step.
 *   - LEGALITY   a listed-legal action must never be rejected; a sampled
 *                NOT-legal action must always be rejected cleanly (no throw, no
 *                state change).
 *   - RENDER     the observation + event text the player would actually see must
 *                never leak an unresolved template, "undefined", "[object
 *                Object]", "NaN", or empty text.
 *
 * Repro traces are built LAZILY — only when a finding actually occurs — via
 * `recordTrace`, never per step, since throughput matters over many episodes.
 */
import type { RpgAction, StepResult } from "../api/types.js";
import { makeStep } from "../core/engine.js";
import { hashState } from "../core/hash.js";
import { mulberry32 } from "../core/rng.js";
import type { GameState } from "../core/state.js";
import type { RpgActionOption } from "../rpg/legal_actions.js";
import { enumerateRpgActions, initStateForRpgPack } from "../rpg/runner.js";
import { assertRpgStateReferences } from "../rpg/state_integrity.js";
import { recordTrace, type RecordOptions, type Trace } from "../trace/record.js";
import { z } from "zod";
import { CrawlLocationSchema, FindingCollector, type CrawlFinding } from "./findings.js";
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
 * Build a replayable repro trace for an episode-so-far. Lazy by construction —
 * only ever called from a finding site, never once per step. A shipped quest's
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

  const loc = (state: GameState): CrawlLocation => ({
    region: opts.location?.region ?? null,
    node: opts.location?.node ?? null,
    questId: prepared.questId,
    sceneId: state.current,
  });

  const reproFor = (record: EpisodeRecord): CrawlFinding["repro"] => ({
    kind: "rpg-trace",
    trace: buildRepro(prepared, record),
    minimized: false,
  });

  const crash = (
    message: string,
    state: GameState,
    record: EpisodeRecord,
    action: RpgAction | null = null,
  ): void => {
    collector.add({
      code: "CRASH",
      step: totalSteps,
      location: loc(state),
      action,
      message,
      stateHash: hashState(state),
      repro: reproFor(record),
    });
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
      collector.add({
        code: "CRASH",
        step: 0,
        location: { ...loc0 },
        action: null,
        message: `init threw: ${describeError(err)}`,
        stateHash: null,
        repro: none(),
      });
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
        collector.add({
          code: "SOFTLOCK",
          severity: "S4",
          step: totalSteps,
          location: loc(state),
          action: null,
          message: "live (non-ended) state has zero legal actions",
          stateHash: hashState(state),
          repro: reproFor(record),
        });
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
              collector.add({
                code: "LEGALITY",
                step: totalSteps,
                location: loc(state),
                action: illegal,
                message: `illegal action was accepted: ${JSON.stringify(illegal)}`,
                stateHash: hashState(r.state),
                repro: reproFor(record),
              });
            } else if (hashState(r.state) !== before && hashState(state) !== before) {
              // The engine contract guarantees a rejection leaves state untouched
              // (r.state is the SAME reference, unchanged). Reaching here means the
              // rejection path itself mutated state in place — a purity violation.
              collector.add({
                code: "LEGALITY",
                step: totalSteps,
                location: loc(state),
                action: illegal,
                message: `illegal action rejection mutated state (was ${before})`,
                stateHash: hashState(r.state),
                repro: reproFor(record),
              });
            }
          } catch (err) {
            collector.add({
              code: "LEGALITY",
              step: totalSteps,
              location: loc(state),
              action: illegal,
              message: `illegal action threw instead of clean rejection: ${describeError(err)}`,
              stateHash: hashState(state),
              repro: reproFor(record),
            });
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
        collector.add({
          code: "LEGALITY",
          step: totalSteps,
          location: loc(state),
          action: choice.action,
          message: `listed legal action rejected: ${result.rejectionReason ?? "?"} (${choice.id})`,
          stateHash: hashState(state),
          repro: reproFor(record),
        });
        continue; // state unchanged per engine contract
      }
      state = result.state;
      roomsVisited.add(state.current);
      record.perStepHashes.push(hashState(state));

      // 5. INTEGRITY
      try {
        assertRpgStateReferences(index, state);
      } catch (err) {
        collector.add({
          code: "INTEGRITY",
          step: totalSteps,
          location: loc(state),
          action: choice.action,
          message: describeError(err),
          stateHash: hashState(state),
          repro: reproFor(record),
        });
        break;
      }

      // 6. RENDER (observation + events; CRASH oracle around the render itself)
      try {
        for (const m of renderDefects(index, state, result.events)) {
          collector.add({
            code: "RENDER",
            step: totalSteps,
            location: loc(state),
            action: choice.action,
            message: m,
            stateHash: hashState(state),
            repro: reproFor(record),
          });
        }
      } catch (err) {
        crash(`observation render threw: ${describeError(err)}`, state, record, choice.action);
        break;
      }

      // 7. PERSIST + DESYNC + SOFTLOCK-solver hooks — Task 5 fills these in.
      // opts.persistEvery / opts.desyncReplay / opts.solverBudget are typed and
      // accepted above as no-op stubs so Task 5 can wire them in without
      // restructuring this loop.
      if (state.ended) {
        record.endingId = state.endingId;
        if (state.endingId) endingsReached.add(state.endingId);
        break;
      }
    }
    // end-of-episode DESYNC replay + solver — Task 5 (no-op for now)
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
