import type { Effect } from "../core/effects.js";

export function gotoEffect(target: string): Effect {
  return { goto: target };
}

export function endGameEffects(ending: string, opts: { gotoEnding?: boolean } = {}): Effect[] {
  return opts.gotoEnding ? [gotoEffect(ending), { end_game: ending }] : [{ end_game: ending }];
}

export function transitionEffects(target: string, terminal: boolean): Effect[] {
  return terminal ? endGameEffects(target, { gotoEnding: true }) : [gotoEffect(target)];
}
