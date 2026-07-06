import type { OverworldRouteResourceState } from "./session_routes.js";
import {
  indexedOverworldRoute,
  type OverworldRoutePlannerIndex,
  type OverworldSessionRoutePlan,
} from "./session_routes.js";
import { withOverworldSessionRouteEstimate } from "./session_route_progress.js";

export type { OverworldRoutePlannerIndex, OverworldSessionRoutePlan };

export type OverworldSessionRoadRoutePlanState = {
  destinationId: string;
  routePlannerIndex: OverworldRoutePlannerIndex;
  currentId: string;
  discoveredIds: ReadonlySet<string>;
  resources: OverworldRouteResourceState;
};

export function planOverworldSessionRoadRoute(
  state: OverworldSessionRoadRoutePlanState,
): OverworldSessionRoutePlan {
  if (state.destinationId === state.currentId) throw new Error("You are already there.");
  if (!state.discoveredIds.has(state.destinationId)) {
    throw new Error("That destination is not discovered yet.");
  }
  const plan = indexedOverworldRoute(
    state.routePlannerIndex,
    state.currentId,
    state.destinationId,
    state.discoveredIds,
  );
  if (!plan) throw new Error("No discovered route reaches that destination yet.");
  return withOverworldSessionRouteEstimate(plan, state.resources);
}
