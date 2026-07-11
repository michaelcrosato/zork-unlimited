import type { JourneyPresentation } from "../world/journey_contract.js";
import type { RpgCompactObservation } from "./compact_rpg_observation.js";
import type { McpObservation } from "./types.js";

export type EmbeddedJourneyField = {
  journey: JourneyPresentation;
  overworld_snapshot_hash: string;
};

export function journeyBlocksGameplay(journey: JourneyPresentation): boolean {
  return journey.pendingChoice !== null || journey.status === "ended";
}

/** Hide RPG decisions while the parent journey choice is the only legal move. */
export function suppressRpgGameplayActions<
  Payload extends {
    context?: RpgCompactObservation;
    observation?: McpObservation;
  },
>(payload: Payload): Payload {
  const context = payload.context
    ? (() => {
        const { actions: _actions, ...withoutActions } = payload.context;
        return withoutActions as RpgCompactObservation;
      })()
    : undefined;
  const observation = payload.observation
    ? { ...payload.observation, available_actions: [] }
    : undefined;
  return {
    ...payload,
    ...(context ? { context } : {}),
    ...(observation ? { observation } : {}),
  };
}
