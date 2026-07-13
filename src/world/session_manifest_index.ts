import type {
  OverworldArea,
  OverworldCharacter,
  OverworldEdge,
  OverworldExit,
  OverworldExplorationSite,
  OverworldLocalEvent,
  OverworldLocalJob,
  OverworldManifest,
  OverworldNode,
  OverworldPoi,
  OverworldQuest,
  OverworldRegionalArc,
  OverworldRoadEvent,
} from "./overworld.js";
import {
  allOverworldContactPresentations,
  type OverworldContactPresentation,
} from "./session_contact_presentation.js";

export type OverworldSnapshotManifestIndex = {
  arcIds: ReadonlySet<string>;
  arcRegionNames: ReadonlyMap<string, string>;
  areaHomes: ReadonlyMap<string, string>;
  areaIds: ReadonlySet<string>;
  areasById: ReadonlyMap<string, OverworldArea>;
  areasByTown: ReadonlyMap<string, readonly OverworldArea[]>;
  areaTownNames: ReadonlyMap<string, string>;
  characterIds: ReadonlySet<string>;
  charactersById: ReadonlyMap<string, OverworldCharacter>;
  characterTownNames: ReadonlyMap<string, string>;
  contactPresentationsByJournalId: ReadonlyMap<string, OverworldContactPresentation>;
  edgeIds: ReadonlySet<string>;
  edgesById: ReadonlyMap<string, OverworldEdge>;
  eventIds: ReadonlySet<string>;
  eventsById: ReadonlyMap<string, OverworldLocalEvent>;
  eventTownNames: ReadonlyMap<string, string>;
  jobIds: ReadonlySet<string>;
  jobsById: ReadonlyMap<string, OverworldLocalJob>;
  jobsByTown: ReadonlyMap<string, readonly OverworldLocalJob[]>;
  jobTownNames: ReadonlyMap<string, string>;
  nodeIds: ReadonlySet<string>;
  nodesById: ReadonlyMap<string, OverworldNode>;
  poiIds: ReadonlySet<string>;
  poisById: ReadonlyMap<string, OverworldPoi>;
  poiTownNames: ReadonlyMap<string, string>;
  questIds: ReadonlySet<string>;
  questsById: ReadonlyMap<string, OverworldQuest>;
  questsByTown: ReadonlyMap<string, readonly OverworldQuest[]>;
  questTownNames: ReadonlyMap<string, string>;
  regionalArcs: readonly OverworldRegionalArc[];
  regionNames: ReadonlySet<string>;
  roadEventsByEdgeId: ReadonlyMap<string, OverworldRoadEvent>;
  roadExitsByTown: ReadonlyMap<string, readonly OverworldExit[]>;
  siteIds: ReadonlySet<string>;
  sitesByArea: ReadonlyMap<string, readonly OverworldExplorationSite[]>;
  sitesById: ReadonlyMap<string, OverworldExplorationSite>;
  siteTownNames: ReadonlyMap<string, string>;
  townNameForSource: (nodeId: string) => string;
  townNames: ReadonlySet<string>;
};

export type OverworldSnapshotManifestIndexSources = {
  areasById: ReadonlyMap<string, OverworldArea>;
  areasByTown: ReadonlyMap<string, readonly OverworldArea[]>;
  charactersById: ReadonlyMap<string, OverworldCharacter>;
  eventsById: ReadonlyMap<string, OverworldLocalEvent>;
  jobsById: ReadonlyMap<string, OverworldLocalJob>;
  jobsByTown: ReadonlyMap<string, readonly OverworldLocalJob[]>;
  nodesById: ReadonlyMap<string, OverworldNode>;
  poisById: ReadonlyMap<string, OverworldPoi>;
  questsById: ReadonlyMap<string, OverworldQuest>;
  questsByTown: ReadonlyMap<string, readonly OverworldQuest[]>;
  roadEventsByEdgeId: ReadonlyMap<string, OverworldRoadEvent>;
  roadExitsByTown: ReadonlyMap<string, readonly OverworldExit[]>;
  sitesByArea: ReadonlyMap<string, readonly OverworldExplorationSite[]>;
  sitesById: ReadonlyMap<string, OverworldExplorationSite>;
  world: OverworldManifest;
};

export function buildOverworldSnapshotManifestIndex(
  sources: OverworldSnapshotManifestIndexSources,
): OverworldSnapshotManifestIndex {
  const townNameById = new Map<string, string>();
  const nodeIds = new Set<string>();
  const townNames = new Set<string>();
  for (const [nodeId, node] of sources.nodesById) {
    townNameById.set(nodeId, node.name);
    nodeIds.add(nodeId);
    townNames.add(node.name);
  }
  const townNameForSource = (nodeId: string): string => townNameById.get(nodeId) ?? nodeId;

  const edgesById = new Map<string, OverworldEdge>();
  const edgeIds = new Set<string>();
  for (const edge of sources.world.edges) {
    edgesById.set(edge.id, edge);
    edgeIds.add(edge.id);
  }

  const arcIds = new Set<string>();
  const arcRegionNames = new Map<string, string>();
  for (const arc of sources.world.regional_arcs) {
    arcIds.add(arc.id);
    arcRegionNames.set(arc.id, arc.region);
  }

  const areaHomes = new Map<string, string>();
  const areaIds = new Set<string>();
  const areaTownNames = new Map<string, string>();
  for (const [areaId, area] of sources.areasById) {
    areaHomes.set(areaId, area.home);
    areaIds.add(areaId);
    areaTownNames.set(areaId, townNameForSource(area.home));
  }

  const characterIds = new Set<string>();
  const characterTownNames = new Map<string, string>();
  const contactPresentationsByJournalId = new Map<string, OverworldContactPresentation>();
  for (const [characterId, character] of sources.charactersById) {
    characterIds.add(characterId);
    characterTownNames.set(characterId, townNameForSource(character.home));
    for (const presentation of allOverworldContactPresentations(character)) {
      if (contactPresentationsByJournalId.has(presentation.journalId)) {
        throw new Error(`Duplicate overworld contact journal id "${presentation.journalId}".`);
      }
      contactPresentationsByJournalId.set(presentation.journalId, presentation);
    }
  }

  const eventIds = new Set<string>();
  const eventTownNames = new Map<string, string>();
  for (const [eventId, event] of sources.eventsById) {
    eventIds.add(eventId);
    eventTownNames.set(eventId, townNameForSource(event.home));
  }

  const jobIds = new Set<string>();
  const jobTownNames = new Map<string, string>();
  for (const [jobId, job] of sources.jobsById) {
    jobIds.add(jobId);
    jobTownNames.set(jobId, townNameForSource(job.home));
  }

  const poiIds = new Set<string>();
  const poiTownNames = new Map<string, string>();
  for (const [poiId, poi] of sources.poisById) {
    poiIds.add(poiId);
    poiTownNames.set(poiId, townNameForSource(poi.home));
  }

  const questIds = new Set<string>();
  const questTownNames = new Map<string, string>();
  for (const [questId, quest] of sources.questsById) {
    questIds.add(questId);
    questTownNames.set(questId, townNameForSource(quest.home));
  }

  const regionNames = new Set<string>();
  for (const region of sources.world.regions) regionNames.add(region.name);

  const siteIds = new Set<string>();
  const siteTownNames = new Map<string, string>();
  for (const [siteId, site] of sources.sitesById) {
    siteIds.add(siteId);
    siteTownNames.set(siteId, townNameForSource(site.nearest_town));
  }

  return {
    arcIds,
    arcRegionNames,
    areaHomes,
    areaIds,
    areasById: sources.areasById,
    areasByTown: sources.areasByTown,
    areaTownNames,
    characterIds,
    charactersById: sources.charactersById,
    characterTownNames,
    contactPresentationsByJournalId,
    edgeIds,
    edgesById,
    eventIds,
    eventsById: sources.eventsById,
    eventTownNames,
    jobIds,
    jobsById: sources.jobsById,
    jobsByTown: sources.jobsByTown,
    jobTownNames,
    nodeIds,
    nodesById: sources.nodesById,
    poiIds,
    poisById: sources.poisById,
    poiTownNames,
    questIds,
    questsById: sources.questsById,
    questsByTown: sources.questsByTown,
    questTownNames,
    regionalArcs: sources.world.regional_arcs,
    regionNames,
    roadEventsByEdgeId: sources.roadEventsByEdgeId,
    roadExitsByTown: sources.roadExitsByTown,
    siteIds,
    sitesByArea: sources.sitesByArea,
    sitesById: sources.sitesById,
    siteTownNames,
    townNameForSource,
    townNames,
  };
}
