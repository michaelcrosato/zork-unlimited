/**
 * Action + StepResult types (spec §8.1, §8.2).
 *
 * `RpgAction` is the canonical live reducer surface. `Action` is kept as a
 * stable API alias for callers that have not adopted the explicit RPG name yet.
 */
import type { GameState } from "../core/state.js";
import type { GameEvent } from "../core/events.js";

export type RpgAction =
  | { type: "LOOK"; target?: string }
  | { type: "MOVE"; direction: string }
  | { type: "TAKE"; item: string }
  | { type: "DROP"; item: string }
  | { type: "OPEN"; target: string }
  | { type: "CLOSE"; target: string }
  | { type: "UNLOCK"; target: string; with: string }
  | { type: "USE"; item?: string; target: string }
  | { type: "TALK"; npc: string }
  | { type: "ASK"; npc: string; topic: string }
  | { type: "GIVE"; item: string; npc: string }
  | { type: "READ"; target: string }
  | { type: "INSPECT"; target: string }
  | { type: "INVENTORY" }
  | { type: "ATTACK"; enemy: string };

export type Action = RpgAction;

export type StepResult = {
  state: GameState; // NEW state (engine is pure; input state unmutated)
  events: GameEvent[]; // ordered list of what happened
  ok: boolean; // false if action was illegal/rejected
  rejectionReason?: string; // human-readable, for illegal actions
};
