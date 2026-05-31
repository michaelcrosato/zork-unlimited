/**
 * Parser playtester + roster (spec §12.4, §12.6, §12.8).
 *
 * Drives a parser game through the SAME structured legal-action loop an external
 * agent uses (§9): each turn it reads the observation, a persona picks one
 * action_id, and the engine steps. It records each turn and the coverage runner
 * aggregates routes across the §12.8 persona roster, surfacing honest,
 * non-fabricated findings (unvisited rooms, stuck personas, whether any win was
 * reached). Fully deterministic with the heuristic personas — runs in CI, no keys.
 *
 * "Stuck" is a coverage-progress heuristic, not a soundness claim: if a run makes
 * no new progress (no new room / flag / item / opened container) within a window
 * of steps, it is flagged stuck — this avoids mislabeling deliberate LOOK/READ
 * actions as loops while still catching genuinely wedged play.
 */
import { makeStep } from "../src/core/engine.js";
import { hashState } from "../src/core/hash.js";
import type { GameEvent } from "../src/core/events.js";
import { buildParserObservation } from "../src/parser/observation.js";
import { indexParserPack, buildParserRules, initStateForParserPack, type ParserIndex } from "../src/parser/runner.js";
import type { ParserPack } from "../src/parser/schema.js";
import { PARSER_PERSONAS, pickParserAction, type ParserPersona } from "./parser_personas.js";

export type ParserPlaytestStep = {
  step: number;
  room: string;
  available: string[];
  chosen_action: string;
  command: string;
  events: GameEvent[];
};

export type ParserPlaytestRecord = {
  persona: ParserPersona;
  seed: number;
  pack_id: string;
  status: "completed" | "stuck" | "max_steps";
  ending_id: string | null;
  rooms_visited: string[];
  last_room: string;
  steps: ParserPlaytestStep[];
  final_hash: string;
};

export type ParserRunOptions = { persona: ParserPersona; seed: number; maxSteps?: number; stuckWindow?: number };

/** A monotone progress score: more rooms / flags / items / opened objects = more. */
function progressScore(roomsVisited: Set<string>, state: import("../src/core/state.js").GameState): number {
  const flags = Object.values(state.flags).filter(Boolean).length;
  const opened = Object.values(state.objectState).filter((o) => o.open || o.locked === false).length;
  return roomsVisited.size * 10 + flags * 3 + state.inventory.length * 3 + opened * 2;
}

/** Play one parser game to a terminal state or a stuck/step guard, recording turns. */
export function runParserPlaytest(index: ParserIndex, opts: ParserRunOptions): ParserPlaytestRecord {
  const rules = buildParserRules(index);
  const step = makeStep(rules);
  const maxSteps = opts.maxSteps ?? 200;
  const stuckWindow = opts.stuckWindow ?? 25;

  let state = initStateForParserPack(index, opts.seed);
  const visited = new Set<string>([state.current]);
  const steps: ParserPlaytestStep[] = [];
  let status: ParserPlaytestRecord["status"] = "max_steps";
  let best = progressScore(visited, state);
  let sinceImprovement = 0;

  for (let i = 0; i < maxSteps; i++) {
    if (state.ended) {
      status = "completed";
      break;
    }
    const obs = buildParserObservation(index, state);
    if (obs.available_actions.length === 0) {
      status = "stuck";
      break;
    }
    const chosenId = pickParserAction(opts.persona, obs, i, opts.seed, visited);
    const opt = obs.available_actions.find((a) => a.id === chosenId) ?? obs.available_actions[0]!;
    const result = step(state, opt.action);

    steps.push({ step: i, room: state.current, available: obs.available_actions.map((a) => a.id), chosen_action: opt.id, command: opt.command, events: result.events });

    state = result.state;
    visited.add(state.current);

    if (state.ended) {
      status = "completed";
      break;
    }
    const score = progressScore(visited, state);
    if (score > best) {
      best = score;
      sinceImprovement = 0;
    } else if (++sinceImprovement >= stuckWindow) {
      status = "stuck";
      break;
    }
  }

  return {
    persona: opts.persona,
    seed: opts.seed,
    pack_id: index.pack.meta.id,
    status,
    ending_id: state.endingId,
    rooms_visited: [...visited].sort(),
    last_room: state.current,
    steps,
    final_hash: hashState(state),
  };
}

export type ParserCoverageReport = {
  pack_id: string;
  runs: number;
  rooms_total: number;
  rooms_visited: string[];
  rooms_unvisited: string[];
  endings_reached: string[];
  any_win: boolean;
  personas_won: ParserPersona[];
  findings: string[];
};

export type ParserRosterResult = { records: ParserPlaytestRecord[]; coverage: ParserCoverageReport };

/** Run the full §12.8 persona roster across seeds and aggregate route coverage. */
export function runParserRoster(
  pack: ParserPack,
  opts: { personas?: ParserPersona[]; seeds?: number[]; maxSteps?: number } = {},
): ParserRosterResult {
  const index = indexParserPack(pack);
  const personas = opts.personas ?? PARSER_PERSONAS;
  const seeds = opts.seeds ?? [1, 2, 3];

  const records: ParserPlaytestRecord[] = [];
  for (const persona of personas) {
    for (const seed of seeds) {
      records.push(runParserPlaytest(index, { persona, seed, ...(opts.maxSteps ? { maxSteps: opts.maxSteps } : {}) }));
    }
  }

  const allRooms = pack.rooms.map((r) => r.id);
  const roomSet = new Set(allRooms);
  const roomsVisited = [...new Set(records.flatMap((r) => r.rooms_visited))].filter((r) => roomSet.has(r)).sort();
  const roomsUnvisited = allRooms.filter((r) => !roomsVisited.includes(r)).sort();
  const endingsReached = [...new Set(records.map((r) => r.ending_id).filter((x): x is string => x !== null))].sort();
  const personasWon = [...new Set(records.filter((r) => r.status === "completed").map((r) => r.persona))];

  const findings: string[] = [];
  if (personasWon.length === 0) {
    findings.push("No persona completed the game — the win route needs multi-step planning beyond the heuristic personas (expected; the walkthrough acceptance test certifies winnability).");
  } else {
    findings.push(`Personas reaching a win: ${personasWon.join(", ")}.`);
  }
  for (const r of roomsUnvisited) findings.push(`Room "${r}" was never visited by any persona — possibly low-discoverability content.`);
  // Surface where stuck personas wedged — the input to the debugger (§12.5).
  const stuckAt = new Map<string, number>();
  for (const rec of records.filter((r) => r.status === "stuck")) {
    stuckAt.set(rec.last_room, (stuckAt.get(rec.last_room) ?? 0) + 1);
  }
  for (const [room, n] of [...stuckAt.entries()].sort((a, b) => b[1] - a[1])) {
    findings.push(`${n} run(s) got stuck in room "${room}" — a candidate ordering/soft-lock issue to debug.`);
  }

  return {
    records,
    coverage: {
      pack_id: pack.meta.id,
      runs: records.length,
      rooms_total: allRooms.length,
      rooms_visited: roomsVisited,
      rooms_unvisited: roomsUnvisited,
      endings_reached: endingsReached,
      any_win: personasWon.length > 0,
      personas_won: personasWon,
      findings,
    },
  };
}
