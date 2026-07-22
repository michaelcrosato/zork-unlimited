import {
  cloneOverworldArea,
  cloneOverworldAreaExit,
  cloneOverworldCharacterView,
  cloneOverworldExit,
  cloneOverworldExplorationSite,
  cloneOverworldLocalEvent,
  cloneOverworldLocalJob,
  cloneOverworldNode,
  cloneOverworldPoi,
  redactOverworldRoadEncounterOptionForPresentation,
  redactOverworldRoadEventForPresentation,
} from "./overworld_clone.js";
import { cloneOverworldRouteOption } from "./session_routes.js";
import { cloneOverworldRegionalArcProgress } from "./session_regional_arcs.js";
import type { OverworldView } from "./session_view.js";
import { cloneCampaignCharacterView } from "./campaign_character_view.js";
import { redactOverworldJournalEntryForPresentation } from "./session_snapshot.js";
import { cloneOverworldQuestView } from "./session_result_clone.js";
import { cloneOverworldDepartureInteraction } from "./session_departure_interactions.js";
import { cloneOverworldServiceActionPresentation } from "./session_service_presentation.js";

export function cloneOverworldView(view: OverworldView): OverworldView {
  return {
    ...view,
    character: cloneCampaignCharacterView(view.character),
    current: cloneOverworldNode(view.current),
    currentArea: view.currentArea ? cloneOverworldArea(view.currentArea) : null,
    areaExits: view.areaExits.map(cloneOverworldAreaExit),
    exits: view.exits.map(cloneOverworldExit),
    areas: view.areas.map(cloneOverworldArea),
    pois: view.pois.map(cloneOverworldPoi),
    characters: view.characters.map(cloneOverworldCharacterView),
    events: view.events.map(cloneOverworldLocalEvent),
    eventChoices: view.eventChoices.map(([eventId, optionId]) => [eventId, optionId]),
    jobs: view.jobs.map(cloneOverworldLocalJob),
    jobChoices: view.jobChoices.map(([jobId, optionId]) => [jobId, optionId]),
    rememberedJobs: view.rememberedJobs.map(cloneOverworldLocalJob),
    sites: view.sites.map(cloneOverworldExplorationSite),
    quests: view.quests.map(cloneOverworldQuestView),
    serviceOffers: view.serviceOffers.map((offer) => ({
      id: offer.id,
      action: offer.action,
      title: offer.title,
      summary: offer.summary,
      minutes: offer.minutes,
      ...(offer.providerId && offer.providerName
        ? { providerId: offer.providerId, providerName: offer.providerName }
        : {}),
    })),
    serviceActions: view.serviceActions.map(cloneOverworldServiceActionPresentation),
    departureInteractions: view.departureInteractions.map(cloneOverworldDepartureInteraction),
    routeOptions: view.routeOptions.map((plan) => cloneOverworldRouteOption(plan)),
    discovered: view.discovered.map(cloneOverworldNode),
    journal: view.journal.map(redactOverworldJournalEntryForPresentation),
    discoveredAreaIds: [...view.discoveredAreaIds],
    discoveredJobIds: [...view.discoveredJobIds],
    visitedAreaIds: [...view.visitedAreaIds],
    completedJobIds: [...view.completedJobIds],
    discoveredSiteIds: [...view.discoveredSiteIds],
    discoveredQuestIds: [...view.discoveredQuestIds],
    startedQuestIds: [...view.startedQuestIds],
    completedQuestIds: [...view.completedQuestIds],
    questStarts: view.questStarts.map(([questId, approachId]) => [questId, approachId]),
    exploredSiteIds: [...view.exploredSiteIds],
    resolvedEventIds: [...view.resolvedEventIds],
    regionRenown: { ...view.regionRenown },
    regionalArcs: view.regionalArcs.map((arc) => cloneOverworldRegionalArcProgress(arc)),
    completedRegionalArcIds: [...view.completedRegionalArcIds],
    pendingRoadEncounter: view.pendingRoadEncounter
      ? {
          ...view.pendingRoadEncounter,
          event: redactOverworldRoadEventForPresentation(view.pendingRoadEncounter.event),
          options: view.pendingRoadEncounter.options.map((option) =>
            redactOverworldRoadEncounterOptionForPresentation(option),
          ),
          nextAction: { ...view.pendingRoadEncounter.nextAction },
        }
      : null,
    log: view.log.map((entry) => ({
      ...entry,
      roadEvent: entry.roadEvent ? redactOverworldRoadEventForPresentation(entry.roadEvent) : null,
    })),
  };
}
