import { cloneOverworldRouteOption } from "./session_routes.js";
import { cloneOverworldRegionalArcProgress } from "./session_regional_arcs.js";
import type { OverworldView } from "./session.js";

export function cloneOverworldView(view: OverworldView): OverworldView {
  return {
    ...view,
    areaExits: view.areaExits.map((exit) => ({ ...exit })),
    exits: view.exits.map((exit) => ({ ...exit })),
    areas: [...view.areas],
    pois: [...view.pois],
    characters: [...view.characters],
    events: [...view.events],
    jobs: [...view.jobs],
    sites: [...view.sites],
    quests: view.quests.map((quest) => ({ ...quest })),
    routeOptions: view.routeOptions.map((plan) => cloneOverworldRouteOption(plan)),
    discovered: [...view.discovered],
    journal: view.journal.map((entry) => ({ ...entry })),
    discoveredAreaIds: [...view.discoveredAreaIds],
    discoveredJobIds: [...view.discoveredJobIds],
    visitedAreaIds: [...view.visitedAreaIds],
    completedJobIds: [...view.completedJobIds],
    discoveredSiteIds: [...view.discoveredSiteIds],
    discoveredQuestIds: [...view.discoveredQuestIds],
    startedQuestIds: [...view.startedQuestIds],
    completedQuestIds: [...view.completedQuestIds],
    exploredSiteIds: [...view.exploredSiteIds],
    resolvedEventIds: [...view.resolvedEventIds],
    regionRenown: { ...view.regionRenown },
    regionalArcs: view.regionalArcs.map((arc) => cloneOverworldRegionalArcProgress(arc)),
    completedRegionalArcIds: [...view.completedRegionalArcIds],
    pendingRoadEncounter: view.pendingRoadEncounter
      ? {
          ...view.pendingRoadEncounter,
          options: view.pendingRoadEncounter.options.map((option) => ({ ...option })),
        }
      : null,
    log: view.log.map((entry) => ({ ...entry })),
  };
}
