import type { GameState } from "../core/state.js";
import { rngForStep, type Rng } from "../core/rng.js";

export type RuntimeRngFor = (state: GameState) => Rng;

export const rngForRuntimeState: RuntimeRngFor = (state) => rngForStep(state.seed, state.step);
