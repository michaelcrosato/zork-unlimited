import type { RpgAction } from "../api/types.js";
import type { GameEvent } from "../core/events.js";
import { DIALOGUE_VAR_PREFIX, dlgVar } from "../core/dialogue_state.js";
import { hashState } from "../core/hash.js";
import type { GameState } from "../core/state.js";
import type {
  JourneyCountedDecisionReason,
  JourneyDecisionClassification,
  JourneyExcludedDecisionReason,
} from "./journey_contract.js";

export type JourneyDecisionAnnotated<Value> = Value & {
  journeyDecision: JourneyDecisionClassification;
};

export type OverworldJourneyActionKind =
  | "movement"
  | "clue"
  | "dialogue"
  | "preparation"
  | "progress"
  | "technical_quest_foldback";

export function countedJourneyDecision(
  reason: JourneyCountedDecisionReason,
): JourneyDecisionClassification {
  return Object.freeze({ countsTowardJourney: true, reason });
}

export function excludedJourneyDecision(
  reason: JourneyExcludedDecisionReason,
): JourneyDecisionClassification {
  return Object.freeze({ countsTowardJourney: false, reason });
}

export function withJourneyDecision<Value extends object>(
  value: Value,
  journeyDecision: JourneyDecisionClassification,
): JourneyDecisionAnnotated<Value> {
  return { ...value, journeyDecision };
}

/**
 * Classify a successfully returned overworld outcome from the state-change
 * result produced by the deterministic session reducer. Movement is inherently
 * consequential; every other category must actually change the player's
 * situation. Idempotent reviews and unchanged services remain valid gameplay
 * responses but do not advance the retention clock.
 */
export function classifyOverworldJourneyDecision(
  kind: OverworldJourneyActionKind,
  stateChanged: boolean,
): JourneyDecisionClassification {
  switch (kind) {
    case "movement":
      return countedJourneyDecision("movement");
    case "technical_quest_foldback":
      return excludedJourneyDecision("technical_quest_foldback");
    case "preparation":
      return stateChanged
        ? countedJourneyDecision("preparation")
        : excludedJourneyDecision("unchanged_service");
    case "clue":
      return stateChanged
        ? countedJourneyDecision("stateful_clue")
        : excludedJourneyDecision("repeated_context");
    case "dialogue":
      return stateChanged
        ? countedJourneyDecision("substantive_dialogue")
        : excludedJourneyDecision("repeated_context");
    case "progress":
      return stateChanged
        ? countedJourneyDecision("situation_changed")
        : excludedJourneyDecision("repeated_context");
  }
}

/** State fields that can alter future play; step and narration are deliberately absent. */
function consequenceHash(state: GameState): string {
  const persistentVars = Object.fromEntries(
    Object.entries(state.vars).filter(([key]) => !key.startsWith(DIALOGUE_VAR_PREFIX)),
  );
  return hashState({
    current: state.current,
    visited: state.visited,
    flags: state.flags,
    vars: persistentVars,
    inventory: state.inventory,
    objectState: state.objectState,
    journal: state.journal,
    questStage: state.questStage,
    ended: state.ended,
    endingId: state.endingId,
  });
}

/**
 * Shared UI/MCP RPG classifier. It consumes the structured action and reducer
 * states rather than transport ids, so both player surfaces apply one semantic
 * contract. Context-only observations and dialogue closure remain accepted but
 * do not count; one-shot clue effects count exactly when they alter future play.
 */
export function classifyRpgJourneyDecision(args: {
  action: RpgAction;
  before: GameState;
  after: GameState;
  events: readonly GameEvent[];
  accepted: boolean;
  isSkillCheck?: boolean;
}): JourneyDecisionClassification {
  if (!args.accepted) return excludedJourneyDecision("rejected");
  if (args.isSkillCheck) return countedJourneyDecision("skill_check");

  const changed = consequenceHash(args.before) !== consequenceHash(args.after);
  switch (args.action.type) {
    case "INVENTORY":
      return excludedJourneyDecision("context_only");
    case "LOOK":
      if (args.action.target === undefined) return excludedJourneyDecision("context_only");
      return changed
        ? countedJourneyDecision("stateful_clue")
        : excludedJourneyDecision("repeated_context");
    case "READ":
    case "INSPECT":
      return changed
        ? countedJourneyDecision("stateful_clue")
        : excludedJourneyDecision("repeated_context");
    case "MOVE":
      return countedJourneyDecision("movement");
    case "ATTACK":
    case "MANEUVER":
      return countedJourneyDecision("combat");
    case "TALK":
      // TALK opens the modal dialogue surface and delivers its greeting; the
      // substantive player decisions are the ASK topics that follow. Excluding
      // the opener also prevents TALK → leave → TALK from farming the clock.
      return excludedJourneyDecision("dialogue_opening");
    case "ASK":
      if (
        (args.before.vars[dlgVar(args.action.npc)] ?? 0) > 0 &&
        (args.after.vars[dlgVar(args.action.npc)] ?? 0) === 0
      ) {
        return excludedJourneyDecision("dialogue_closure");
      }
      return changed
        ? countedJourneyDecision("substantive_dialogue")
        : excludedJourneyDecision("dialogue_navigation");
    case "TAKE":
    case "DROP":
    case "OPEN":
    case "CLOSE":
    case "UNLOCK":
      return changed
        ? countedJourneyDecision("preparation")
        : excludedJourneyDecision("context_only");
    case "USE":
    case "GIVE":
      return changed
        ? countedJourneyDecision("situation_changed")
        : excludedJourneyDecision("context_only");
  }
}
