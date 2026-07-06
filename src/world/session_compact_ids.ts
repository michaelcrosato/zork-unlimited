import type { OverworldNode } from "./overworld.js";
import { compactIdPayloadFromBuckets, type OverworldCompactIdPayload } from "./compact_view.js";
import { compactSortedStringSet, compactSortedTownIdsByPopulation } from "./session_collections.js";

export type OverworldCompactSessionIdState = {
  discoveredIds: ReadonlySet<string>;
  nodes: ReadonlyMap<string, OverworldNode>;
  discoveredAreaIds: ReadonlySet<string>;
  visitedAreaIds: ReadonlySet<string>;
  discoveredJobIds: ReadonlySet<string>;
  completedJobIds: ReadonlySet<string>;
  discoveredSiteIds: ReadonlySet<string>;
  exploredSiteIds: ReadonlySet<string>;
  discoveredQuestIds: ReadonlySet<string>;
  startedQuestIds: ReadonlySet<string>;
  completedQuestIds: ReadonlySet<string>;
  resolvedEventIds: ReadonlySet<string>;
};

export function compactOverworldSessionIdPayload(
  state: OverworldCompactSessionIdState,
): OverworldCompactIdPayload {
  return compactIdPayloadFromBuckets({
    discovered_towns: {
      ids: compactSortedTownIdsByPopulation(state.discoveredIds, state.nodes),
      count: state.discoveredIds.size,
    },
    discovered_areas: compactSortedStringSet(state.discoveredAreaIds),
    visited_areas: compactSortedStringSet(state.visitedAreaIds),
    discovered_jobs: compactSortedStringSet(state.discoveredJobIds),
    completed_jobs: compactSortedStringSet(state.completedJobIds),
    discovered_sites: compactSortedStringSet(state.discoveredSiteIds),
    explored_sites: compactSortedStringSet(state.exploredSiteIds),
    discovered_quests: compactSortedStringSet(state.discoveredQuestIds),
    started_quests: compactSortedStringSet(state.startedQuestIds),
    completed_quests: compactSortedStringSet(state.completedQuestIds),
    resolved_events: compactSortedStringSet(state.resolvedEventIds),
  });
}
