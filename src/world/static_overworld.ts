import {
  overworldAreasAt,
  overworldCharactersAt,
  overworldEdgesFrom,
  overworldEventsAt,
  overworldExplorationSitesNear,
  overworldJobsAt,
  overworldPoisAt,
  overworldQuestsAt,
  overworldRoadEventFor,
  type OverworldArea,
  type OverworldAreaEdge,
  type OverworldCharacter,
  type OverworldExplorationSite,
  type OverworldExit,
  type OverworldLocalEvent,
  type OverworldLocalJob,
  type OverworldManifest,
  type OverworldNode,
  type OverworldPoi,
  type OverworldQuest,
  type OverworldRoadEvent,
} from "./overworld.js";

type StaticJournalEntryKind = "area" | "job" | "poi" | "contact" | "event" | "site";

type StaticJournalEntry<Kind extends StaticJournalEntryKind> = {
  kind: Kind;
  title: string;
  text: string;
};

export type OverworldStaticLook = {
  world: Pick<OverworldManifest, "id" | "name">;
  current: OverworldNode;
  exits: OverworldExit[];
  areas: OverworldArea[];
  local_area_routes: OverworldAreaEdge[];
  points_of_interest: OverworldPoi[];
  characters: OverworldCharacter[];
  local_events: OverworldLocalEvent[];
  local_jobs: OverworldLocalJob[];
  nearby_sites: OverworldExplorationSite[];
  local_quests: OverworldQuest[];
};

export type OverworldStaticTravel = {
  ok: true;
  from: OverworldNode;
  to: OverworldNode;
  road: OverworldExit;
  road_event: OverworldRoadEvent | null;
  arrival: OverworldStaticLook;
};

export type OverworldStaticAreaResult = {
  ok: true;
  current: OverworldNode;
  area: OverworldArea;
  minutes: number;
  journal_entry: StaticJournalEntry<"area">;
};

export type OverworldStaticJobResult = {
  ok: true;
  current: OverworldNode;
  job: OverworldLocalJob;
  minutes: number;
  regional_renown: number;
  journal_entry: StaticJournalEntry<"job">;
};

export type OverworldStaticPoiResult = {
  ok: true;
  current: OverworldNode;
  point_of_interest: OverworldPoi;
  minutes: number;
  journal_entry: StaticJournalEntry<"poi">;
};

export type OverworldStaticContactResult = {
  ok: true;
  current: OverworldNode;
  character: OverworldCharacter;
  minutes: number;
  journal_entry: StaticJournalEntry<"contact">;
};

export type OverworldStaticEventResult = {
  ok: true;
  current: OverworldNode;
  event: OverworldLocalEvent;
  minutes: number;
  journal_entry: StaticJournalEntry<"event">;
};

export type OverworldStaticSiteResult = {
  ok: true;
  current: OverworldNode;
  site: OverworldExplorationSite;
  minutes: number;
  regional_renown: number;
  journal_entry: StaticJournalEntry<"site">;
};

function townIdOrStart(world: OverworldManifest, townId?: string): string {
  return townId ?? world.start;
}

function requireTown(world: OverworldManifest, townId: string): OverworldNode {
  const current = world.nodes.find((node) => node.id === townId);
  if (!current) throw new Error(`Unknown overworld town "${townId}".`);
  return current;
}

function localAreaRoutes(world: OverworldManifest, townId: string): OverworldAreaEdge[] {
  return world.area_edges
    .filter((edge) => edge.home === townId)
    .sort((a, b) => a.travel_minutes - b.travel_minutes || a.route.localeCompare(b.route));
}

export function lookOverworld(
  world: OverworldManifest,
  args: { town_id?: string },
): OverworldStaticLook {
  const townId = townIdOrStart(world, args.town_id);
  const current = requireTown(world, townId);
  return {
    world: { id: world.id, name: world.name },
    current,
    exits: overworldEdgesFrom(world, townId),
    areas: overworldAreasAt(world, townId),
    local_area_routes: localAreaRoutes(world, townId),
    points_of_interest: overworldPoisAt(world, townId),
    characters: overworldCharactersAt(world, townId),
    local_events: overworldEventsAt(world, townId),
    local_jobs: overworldJobsAt(world, townId),
    nearby_sites: overworldExplorationSitesNear(world, townId),
    local_quests: overworldQuestsAt(world, townId),
  };
}

export function travelOverworld(
  world: OverworldManifest,
  args: { from_town: string; road_id: string },
): OverworldStaticTravel {
  const current = requireTown(world, args.from_town);
  const road = overworldEdgesFrom(world, args.from_town).find((edge) => edge.id === args.road_id);
  if (!road) throw new Error(`Road "${args.road_id}" is not reachable from "${args.from_town}".`);
  return {
    ok: true,
    from: current,
    to: road.destination,
    road,
    road_event: overworldRoadEventFor(world, road.id),
    arrival: lookOverworld(world, { town_id: road.destination.id }),
  };
}

export function exploreOverworldArea(
  world: OverworldManifest,
  args: { town_id?: string; area_id: string },
): OverworldStaticAreaResult {
  const townId = townIdOrStart(world, args.town_id);
  const current = requireTown(world, townId);
  const area = overworldAreasAt(world, townId).find((candidate) => candidate.id === args.area_id);
  if (!area) throw new Error(`Area "${args.area_id}" is not in "${townId}".`);
  return {
    ok: true,
    current,
    area,
    minutes: area.travel_minutes,
    journal_entry: {
      kind: "area",
      title: `Explored ${area.name}`,
      text: `${area.summary} ${area.discovery}`,
    },
  };
}

export function workOverworldJob(
  world: OverworldManifest,
  args: { town_id?: string; job_id: string },
): OverworldStaticJobResult {
  const townId = townIdOrStart(world, args.town_id);
  const current = requireTown(world, townId);
  const job = overworldJobsAt(world, townId).find((candidate) => candidate.id === args.job_id);
  if (!job) throw new Error(`Local job "${args.job_id}" is not in "${townId}".`);
  return {
    ok: true,
    current,
    job,
    minutes: job.minutes,
    regional_renown: job.difficulty,
    journal_entry: {
      kind: "job",
      title: `Completed ${job.title}`,
      text: `${job.objective} ${job.reward}`,
    },
  };
}

export function scoutOverworldPoi(
  world: OverworldManifest,
  args: { town_id?: string; poi_id: string },
): OverworldStaticPoiResult {
  const townId = townIdOrStart(world, args.town_id);
  const current = requireTown(world, townId);
  const poi = overworldPoisAt(world, townId).find((candidate) => candidate.id === args.poi_id);
  if (!poi) throw new Error(`Point of interest "${args.poi_id}" is not in "${townId}".`);
  return {
    ok: true,
    current,
    point_of_interest: poi,
    minutes: 20,
    journal_entry: {
      kind: "poi",
      title: `Scouted ${poi.title}`,
      text: `${poi.summary} You mark the site as a local lead for ${current.name}.`,
    },
  };
}

export function talkOverworldContact(
  world: OverworldManifest,
  args: { town_id?: string; character_id: string },
): OverworldStaticContactResult {
  const townId = townIdOrStart(world, args.town_id);
  const current = requireTown(world, townId);
  const character = overworldCharactersAt(world, townId).find(
    (candidate) => candidate.id === args.character_id,
  );
  if (!character) throw new Error(`Contact "${args.character_id}" is not in "${townId}".`);
  return {
    ok: true,
    current,
    character,
    minutes: 15,
    journal_entry: {
      kind: "contact",
      title: `Talked to ${character.name}`,
      text: `${character.summary} ${character.agenda}`,
    },
  };
}

export function investigateOverworldEvent(
  world: OverworldManifest,
  args: { town_id?: string; event_id: string },
): OverworldStaticEventResult {
  const townId = townIdOrStart(world, args.town_id);
  const current = requireTown(world, townId);
  const event = overworldEventsAt(world, townId).find(
    (candidate) => candidate.id === args.event_id,
  );
  if (!event) throw new Error(`Event "${args.event_id}" is not active in "${townId}".`);
  return {
    ok: true,
    current,
    event,
    minutes: 20 + event.intensity * 5,
    journal_entry: {
      kind: "event",
      title: `Investigated ${event.title}`,
      text: `${event.summary} The pressure is ${event.pressure}, intensity ${event.intensity}.`,
    },
  };
}

export function exploreOverworldSite(
  world: OverworldManifest,
  args: { town_id?: string; site_id: string },
): OverworldStaticSiteResult {
  const townId = townIdOrStart(world, args.town_id);
  const current = requireTown(world, townId);
  const site = overworldExplorationSitesNear(world, townId).find(
    (candidate) => candidate.id === args.site_id,
  );
  if (!site) throw new Error(`Exploration site "${args.site_id}" is not near "${townId}".`);
  return {
    ok: true,
    current,
    site,
    minutes: 45 + site.danger * 15,
    regional_renown: site.danger,
    journal_entry: {
      kind: "site",
      title: `Explored ${site.title}`,
      text: `${site.summary} ${site.reward}`,
    },
  };
}
