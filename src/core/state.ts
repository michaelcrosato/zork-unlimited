/**
 * UNIFIED STATE MODEL (spec §6).
 *
 * One state shape carries the game from CYOA all the way to RPG. Later stages
 * ADD fields; they never replace this model. The engine treats GameState as
 * immutable — every transition returns a fresh value (see core/engine.ts).
 */

export type ObjectRuntime = {
  open?: boolean;
  locked?: boolean;
  contents?: string[]; // object ids inside a container
  takenBy?: "player" | "world"; // location bookkeeping
  room?: string; // current room id if the object has been moved/dropped (Stage 2, §7.3)
};

export type GameState = {
  // identity / determinism
  seed: number;
  step: number; // monotonically increasing action counter

  // location
  current: string; // scene_id (CYOA) or room_id (parser)
  visited: Record<string, boolean>;

  // world state
  flags: Record<string, boolean>; // boolean switches
  vars: Record<string, number>; // numeric variables / stats (HP, gold, skills…)
  inventory: string[]; // object ids carried by the player
  objectState: Record<string, ObjectRuntime>; // open/locked/contents per object (parser+)

  // narrative
  journal: string[]; // append-only player-visible log
  questStage: Record<string, string>; // questId -> current stage id (Stage 3+)

  // termination
  ended: boolean;
  endingId: string | null;
};

export type InitOptions = {
  seed: number;
  start: string;
  varsInit?: Record<string, number>;
  flagsInit?: string[];
};

/** Build a fresh GameState. Pure: no clock, no global RNG. */
export function initState(opts: InitOptions): GameState {
  const flags: Record<string, boolean> = {};
  for (const f of opts.flagsInit ?? []) flags[f] = true;
  return {
    seed: opts.seed,
    step: 0,
    current: opts.start,
    visited: { [opts.start]: true },
    flags,
    vars: { ...(opts.varsInit ?? {}) },
    inventory: [],
    objectState: {},
    journal: [],
    questStage: {},
    ended: false,
    endingId: null,
  };
}
