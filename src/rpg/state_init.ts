import { applyEffects, type Effect } from "../core/effects.js";
import { initState, type GameState } from "../core/state.js";

export type InitRuntimeStateOptions = {
  seed: number;
  start: string;
  varsInit?: Record<string, number> | undefined;
  flagsInit?: string[] | undefined;
  heldItems?: string[] | undefined;
  onEnter?: Effect[] | undefined;
};

export function initRuntimeState(opts: InitRuntimeStateOptions): GameState {
  const seeded = initState({
    seed: opts.seed,
    start: opts.start,
    ...(opts.varsInit !== undefined ? { varsInit: opts.varsInit } : {}),
    ...(opts.flagsInit !== undefined ? { flagsInit: opts.flagsInit } : {}),
  });
  const base =
    opts.heldItems && opts.heldItems.length > 0
      ? { ...seeded, inventory: [...seeded.inventory, ...opts.heldItems] }
      : seeded;
  return opts.onEnter && opts.onEnter.length > 0 ? applyEffects(opts.onEnter, base).state : base;
}
