/**
 * Action + StepResult types (spec §8.1, §8.2).
 *
 * The Action union is the closed set of things a player (human or AI) can do.
 * CYOA uses only CHOOSE; the parser stage uses the rest. New action types arrive
 * only through the §14 engine-extension gate.
 */
import type { GameState } from "../core/state.js";
import type { GameEvent } from "../core/events.js";

export type Action =
  // CYOA
  | { type: "CHOOSE"; choiceId: string }
  // Parser (Stage 2+)
  | { type: "LOOK"; target?: string }
  | { type: "MOVE"; direction: string }
  | { type: "TAKE"; item: string }
  | { type: "DROP"; item: string }
  | { type: "OPEN"; target: string }
  | { type: "CLOSE"; target: string }
  | { type: "UNLOCK"; target: string; with: string }
  | { type: "USE"; item: string; target: string }
  | { type: "TALK"; npc: string }
  | { type: "ASK"; npc: string; topic: string }
  | { type: "GIVE"; item: string; npc: string }
  | { type: "READ"; target: string }
  | { type: "INSPECT"; target: string }
  | { type: "INVENTORY" }
  // RPG (Stage 4, §13) — arrives through the §14 engine-extension gate. One ATTACK
  // is one deterministic, seeded combat round resolved entirely in code.
  | { type: "ATTACK"; enemy: string };

export type StepResult = {
  state: GameState; // NEW state (engine is pure; input state unmutated)
  events: GameEvent[]; // ordered list of what happened
  ok: boolean; // false if action was illegal/rejected
  rejectionReason?: string; // human-readable, for illegal actions
};
