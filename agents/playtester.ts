/**
 * Playtester agent (spec §12.4, §12.6).
 *
 * Drives a game through the SAME observation/action loop an external agent uses
 * (§9): each turn it receives the observation, asks the provider for a decision,
 * and steps the engine. It records what it experienced — a playtest record — and
 * the coverage runner aggregates routes across a persona roster (§12.8). Pure
 * apart from the provider call; with the MockProvider the whole thing is
 * deterministic and runs in CI.
 */
import { makeStep } from "../src/core/engine.js";
import { hashState } from "../src/core/hash.js";
import type { GameEvent } from "../src/core/events.js";
import type { Action } from "../src/api/types.js";
import { buildObservation } from "../src/cyoa/observation.js";
import { indexPack, buildRules, initStateForPack, type CyoaIndex } from "../src/cyoa/runner.js";
import type { CyoaPack } from "../src/cyoa/schema.js";
import {
  PlaytesterDecisionSchema,
  type Persona,
  type Provider,
  PERSONAS,
  MockProvider,
} from "./llm/provider.js";

export type StepResultKind = "progress" | "loop" | "ended" | "stuck";

export type PlaytestStep = {
  step: number;
  scene_id: string;
  available: string[];
  chosen_action: string;
  reason: string;
  expected: string;
  actual_events: GameEvent[];
  result: StepResultKind;
};

export type PlaytestRecord = {
  persona: Persona;
  seed: number;
  pack_id: string;
  status: "completed" | "looped" | "stuck" | "max_steps";
  ending_id: string | null;
  scenes_visited: string[];
  steps: PlaytestStep[];
  final_hash: string;
};

export type RunOptions = { persona: Persona; seed: number; maxSteps?: number };

const SYSTEM =
  "You are playtesting a choose-your-own-adventure. Given the observation, pick one " +
  "action_id from available_actions and explain briefly. Respond as JSON.";

/** Play one game to a terminal state (or a guard), recording each turn. */
export async function runPlaytest(index: CyoaIndex, provider: Provider, opts: RunOptions): Promise<PlaytestRecord> {
  const rules = buildRules(index);
  const step = makeStep(rules);
  const maxSteps = opts.maxSteps ?? 80;

  let state = initStateForPack(index, opts.seed);
  const seen = new Set<string>([hashState(state)]);
  const visited = new Set<string>([state.current]);
  const steps: PlaytestStep[] = [];
  let status: PlaytestRecord["status"] = "max_steps";

  for (let i = 0; i < maxSteps; i++) {
    if (state.ended) {
      status = "completed";
      break;
    }
    const obs = buildObservation(index, state);
    if (obs.available_actions.length === 0) {
      status = "stuck";
      break;
    }

    const decision = await provider.completeJson({
      system: SYSTEM,
      user: JSON.stringify({ observation: obs, step: i }),
      schemaName: "PlaytesterDecision",
      schema: PlaytesterDecisionSchema,
    });

    // The legal-action set is ground truth: if the model picks a non-listed id,
    // fall back to the first legal action and note it (a real agent's miss).
    const legal = obs.available_actions.some((a) => a.id === decision.action_id);
    const chosenId = legal ? decision.action_id : obs.available_actions[0]!.id;

    const action: Action = { type: "CHOOSE", choiceId: chosenId };
    const result = step(state, action);
    const nextHash = hashState(result.state);
    const kind: StepResultKind = result.state.ended ? "ended" : seen.has(nextHash) ? "loop" : "progress";

    steps.push({
      step: i,
      scene_id: obs.scene_id,
      available: obs.available_actions.map((a) => a.id),
      chosen_action: chosenId,
      reason: legal ? decision.reason : `${decision.reason} (illegal pick "${decision.action_id}"; fell back)`,
      expected: decision.expected_result,
      actual_events: result.events,
      result: kind,
    });

    state = result.state;
    visited.add(state.current);

    if (kind === "ended") {
      status = "completed";
      break;
    }
    if (kind === "loop") {
      status = "looped"; // a deterministic policy revisiting a state == stuck in a cycle
      break;
    }
    seen.add(nextHash);
  }

  return {
    persona: opts.persona,
    seed: opts.seed,
    pack_id: index.pack.meta.id,
    status,
    ending_id: state.endingId,
    scenes_visited: [...visited].sort(),
    steps,
    final_hash: hashState(state),
  };
}

export type CoverageReport = {
  pack_id: string;
  runs: number;
  endings_declared: string[];
  endings_reached: string[];
  endings_missing: string[];
  scenes_total: number;
  scenes_visited: string[];
  scenes_unvisited: string[];
  /** Honest, non-fabricated observations a designer should look at. */
  findings: string[];
};

export type RosterResult = { records: PlaytestRecord[]; coverage: CoverageReport };

/** Run the full persona roster across seeds and aggregate route coverage. */
export async function runRoster(
  pack: CyoaPack,
  opts: { personas?: Persona[]; seeds?: number[]; maxSteps?: number } = {},
): Promise<RosterResult> {
  const index = indexPack(pack);
  const personas = opts.personas ?? PERSONAS;
  const seeds = opts.seeds ?? [1, 2, 3, 4, 5, 6, 7, 8];

  const records: PlaytestRecord[] = [];
  for (const persona of personas) {
    for (const seed of seeds) {
      const runOpts: RunOptions = { persona, seed, ...(opts.maxSteps ? { maxSteps: opts.maxSteps } : {}) };
      records.push(await runPlaytest(index, new MockProvider(persona, seed), runOpts));
    }
  }

  const endingsDeclared = [
    ...pack.endings.map((e) => e.id),
    ...pack.scenes.filter((s) => s.is_ending).map((s) => s.id),
  ].sort();
  const endingsReached = [...new Set(records.map((r) => r.ending_id).filter((x): x is string => x !== null))].sort();
  const endingsMissing = endingsDeclared.filter((e) => !endingsReached.includes(e));

  // Scene coverage counts SCENES only — the visited set also includes terminal
  // ending nodes (the player goes there), which are not scenes.
  const allScenes = pack.scenes.map((s) => s.id);
  const sceneSet = new Set(allScenes);
  const scenesVisited = [...new Set(records.flatMap((r) => r.scenes_visited))].filter((s) => sceneSet.has(s)).sort();
  const scenesUnvisited = allScenes.filter((s) => !scenesVisited.includes(s)).sort();

  const findings: string[] = [];
  for (const e of endingsMissing) {
    findings.push(`Ending "${e}" was not reached by any persona in ${records.length} runs — it may be hard to discover.`);
  }
  for (const s of scenesUnvisited) {
    findings.push(`Scene "${s}" was never visited by any persona — possibly low-discoverability content.`);
  }
  for (const r of records.filter((r) => r.status === "looped")) {
    findings.push(`Persona "${r.persona}" (seed ${r.seed}) fell into a loop near "${r.scenes_visited.at(-1)}".`);
  }

  return {
    records,
    coverage: {
      pack_id: pack.meta.id,
      runs: records.length,
      endings_declared: endingsDeclared,
      endings_reached: endingsReached,
      endings_missing: endingsMissing,
      scenes_total: allScenes.length,
      scenes_visited: scenesVisited,
      scenes_unvisited: scenesUnvisited,
      findings,
    },
  };
}
