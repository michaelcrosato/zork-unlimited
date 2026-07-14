import { z } from "zod";

import {
  CampaignConsequenceEffectsSchema,
  campaignConsequenceEffectKey,
} from "./campaign_consequences.js";

export const OverworldNodeKindSchema = z.enum([
  "metropolis",
  "great_city",
  "major_city",
  "city",
  "large_town",
  "town",
]);

export const OverworldRoadClassSchema = z.enum([
  "interstate",
  "parkway",
  "state_route",
  "regional_connector",
]);

export const OverworldAreaKindSchema = z.enum([
  "civic_core",
  "market",
  "transport_hub",
  "industrial",
  "waterfront",
  "campus",
  "greenway",
  "historic_district",
  "residential",
  "outskirts",
]);

export const OverworldLocalJobKindSchema = z.enum([
  "civic_errand",
  "supply_run",
  "courier",
  "repair",
  "salvage",
  "research",
  "survey",
  "investigation",
  "mediation",
  "patrol",
]);

export const OverworldNodeSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    kind: OverworldNodeKindSchema,
    source_geography: z.enum(["county_subdivision", "incorporated_place"]),
    geoid: z.string().min(1),
    county_fips: z.string().min(3),
    population_2025: z.number().int().min(10_000),
    lat: z.number(),
    lon: z.number(),
    region: z.string().min(1),
    services: z.array(z.string().min(1)),
    description: z.string().min(1),
  })
  .strict();

export const OverworldEdgeSchema = z
  .object({
    id: z.string().min(1),
    from: z.string().min(1),
    to: z.string().min(1),
    route: z.string().min(1),
    road_class: OverworldRoadClassSchema,
    distance_mi: z.number().positive(),
    travel_minutes: z.number().int().positive(),
  })
  .strict();

export const OverworldPoiSchema = z
  .object({
    id: z.string().min(1),
    home: z.string().min(1),
    area: z.string().min(1),
    kind: z.string().min(1),
    title: z.string().min(1),
    summary: z.string().min(1),
  })
  .strict();

export const OverworldAreaSchema = z
  .object({
    id: z.string().min(1),
    home: z.string().min(1),
    name: z.string().min(1),
    kind: OverworldAreaKindSchema,
    summary: z.string().min(1),
    discovery: z.string().min(1),
    travel_minutes: z.number().int().positive(),
    services: z.array(z.string().min(1)),
  })
  .strict();

export const OverworldAreaEdgeSchema = z
  .object({
    id: z.string().min(1),
    home: z.string().min(1),
    from_area: z.string().min(1),
    to_area: z.string().min(1),
    route: z.string().min(1),
    travel_minutes: z.number().int().positive(),
  })
  .strict();

export const OverworldRegionProfileSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    summary: z.string().min(1),
    gameplay_role: z.string().min(1),
  })
  .strict();

export const OverworldRegionalArcSchema = z
  .object({
    id: z.string().min(1),
    region: z.string().min(1),
    title: z.string().min(1),
    summary: z.string().min(1),
    required_resolutions: z.number().int().min(1),
    anchor_towns: z.array(z.string().min(1)).min(1),
    reward: z.string().min(1),
  })
  .strict();

export const OverworldCharacterVariantSchema = z
  .object({
    id: z.string().min(1),
    after_quests: z.array(z.string().min(1)).min(1),
    summary: z.string().min(1).optional(),
    agenda: z.string().min(1).optional(),
  })
  .strict()
  .refine((variant) => variant.summary !== undefined || variant.agenda !== undefined, {
    message: "An overworld character variant must override summary or agenda.",
  });

export const OverworldCharacterSchema = z
  .object({
    id: z.string().min(1),
    home: z.string().min(1),
    area: z.string().min(1),
    name: z.string().min(1),
    role: z.string().min(1),
    faction: z.string().min(1),
    summary: z.string().min(1),
    agenda: z.string().min(1),
    variants: z.array(OverworldCharacterVariantSchema).min(1).optional(),
  })
  .strict();

export const OverworldLocalEventSchema = z
  .object({
    id: z.string().min(1),
    home: z.string().min(1),
    area: z.string().min(1),
    title: z.string().min(1),
    pressure: z.enum(["rumor", "hazard", "opportunity", "conflict"]),
    intensity: z.number().int().min(1).max(5),
    summary: z.string().min(1),
  })
  .strict();

export const OverworldLocalJobSchema = z
  .object({
    id: z.string().min(1),
    home: z.string().min(1),
    area: z.string().min(1),
    kind: OverworldLocalJobKindSchema,
    title: z.string().min(1),
    summary: z.string().min(1),
    objective: z.string().min(1),
    reward: z.string().min(1),
    minutes: z.number().int().positive(),
    difficulty: z.number().int().min(1).max(5),
    visibility: z.literal("local_job_board"),
  })
  .strict();

const OverworldRoadEventResponseSchema = z
  .object({
    label: z.string().min(1),
    outcome: z.string().min(1),
  })
  .strict();

const OverworldRoadEventResponsesSchema = z
  .object({
    cautious_scout: OverworldRoadEventResponseSchema,
    assist_travelers: OverworldRoadEventResponseSchema,
    press_on: OverworldRoadEventResponseSchema,
  })
  .strict();

export const OverworldRoadEventSchema = z
  .object({
    id: z.string().min(1),
    edge: z.string().min(1),
    title: z.string().min(1),
    risk: z.enum(["low", "medium", "high"]),
    summary: z.string().min(1),
    requires_choice: z.literal(true).optional(),
    active_goal_ids: z.array(z.string().min(1)).min(1).optional(),
    retire_after_quest: z.string().min(1).optional(),
    responses: OverworldRoadEventResponsesSchema.optional(),
  })
  .strict();

export const OverworldExplorationSiteSchema = z
  .object({
    id: z.string().min(1),
    region: z.string().min(1),
    nearest_town: z.string().min(1),
    area: z.string().min(1),
    kind: z.enum(["civic", "industrial", "ruin", "waterway", "wildland"]),
    title: z.string().min(1),
    summary: z.string().min(1),
    discovery: z.string().min(1),
    danger: z.number().int().min(1).max(5),
    reward: z.string().min(1),
  })
  .strict();

export const OverworldQuestCampaignExportSchema = z
  .object({
    ending_id: z.string().min(1),
    ending_title: z.string().min(1),
    effects: CampaignConsequenceEffectsSchema,
  })
  .strict();

export const OverworldQuestCampaignExportsSchema = z
  .array(OverworldQuestCampaignExportSchema)
  .min(1)
  .superRefine((exports, ctx) => {
    const endingIds = new Set<string>();
    const endingTitles = new Set<string>();
    exports.forEach((campaignExport, index) => {
      if (endingIds.has(campaignExport.ending_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "ending_id"],
          message: `Duplicate campaign export ending id "${campaignExport.ending_id}".`,
        });
      }
      if (endingTitles.has(campaignExport.ending_title)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "ending_title"],
          message: `Duplicate campaign export ending title "${campaignExport.ending_title}".`,
        });
      }
      endingIds.add(campaignExport.ending_id);
      endingTitles.add(campaignExport.ending_title);
    });
  });

export const OverworldQuestSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    source: z.string().min(1),
    home: z.string().min(1),
    area: z.string().min(1),
    discovery: z.string().min(1),
    visibility: z.literal("local_notice_board"),
    campaign_exports: OverworldQuestCampaignExportsSchema.optional(),
  })
  .strict();

export const OverworldManifestSchema = z
  .object({
    id: z.literal("new_york_overworld"),
    name: z.string().min(1),
    start: z.string().min(1),
    premise: z.string().min(1),
    sources: z.array(
      z
        .object({
          label: z.string().min(1),
          url: z.string().url(),
        })
        .strict(),
    ),
    scale: z
      .object({
        population_floor: z.literal(10_000),
        distance_model: z.string().min(1),
        travel_time_model: z.string().min(1),
        road_class_speed_mph: z.record(OverworldRoadClassSchema, z.number().positive()),
      })
      .strict(),
    design_rules: z.array(z.string().min(1)),
    regions: z.array(OverworldRegionProfileSchema).min(1),
    regional_arcs: z.array(OverworldRegionalArcSchema).min(1),
    nodes: z.array(OverworldNodeSchema).min(1),
    edges: z.array(OverworldEdgeSchema).min(1),
    areas: z.array(OverworldAreaSchema),
    area_edges: z.array(OverworldAreaEdgeSchema),
    points_of_interest: z.array(OverworldPoiSchema),
    characters: z.array(OverworldCharacterSchema),
    local_events: z.array(OverworldLocalEventSchema),
    local_jobs: z.array(OverworldLocalJobSchema),
    road_events: z.array(OverworldRoadEventSchema),
    exploration_sites: z.array(OverworldExplorationSiteSchema),
    quests: z.array(OverworldQuestSchema),
  })
  .strict();

export type OverworldNode = z.infer<typeof OverworldNodeSchema>;
export type OverworldEdge = z.infer<typeof OverworldEdgeSchema>;
export type OverworldAreaKind = z.infer<typeof OverworldAreaKindSchema>;
export type OverworldArea = z.infer<typeof OverworldAreaSchema>;
export type OverworldAreaEdge = z.infer<typeof OverworldAreaEdgeSchema>;
export type OverworldPoi = z.infer<typeof OverworldPoiSchema>;
export type OverworldRegionProfile = z.infer<typeof OverworldRegionProfileSchema>;
export type OverworldRegionalArc = z.infer<typeof OverworldRegionalArcSchema>;
export type OverworldCharacterVariant = z.infer<typeof OverworldCharacterVariantSchema>;
export type OverworldCharacter = z.infer<typeof OverworldCharacterSchema>;
export type OverworldCharacterView = Omit<OverworldCharacter, "variants">;
export type OverworldLocalEvent = z.infer<typeof OverworldLocalEventSchema>;
export type OverworldLocalJobKind = z.infer<typeof OverworldLocalJobKindSchema>;
export type OverworldLocalJob = z.infer<typeof OverworldLocalJobSchema>;
export type OverworldRoadEvent = z.infer<typeof OverworldRoadEventSchema>;
export type OverworldExplorationSite = z.infer<typeof OverworldExplorationSiteSchema>;
export type OverworldQuestCampaignExport = z.infer<typeof OverworldQuestCampaignExportSchema>;
export type OverworldQuest = z.infer<typeof OverworldQuestSchema>;
export type OverworldManifest = z.infer<typeof OverworldManifestSchema>;

export type OverworldExit = OverworldEdge & {
  destination: OverworldNode;
};

export type OverworldRouteStep = {
  from: OverworldNode;
  to: OverworldNode;
  edge: OverworldEdge;
  roadEvent: OverworldRoadEvent | null;
};

export type OverworldRoutePlan = {
  from: OverworldNode;
  destination: OverworldNode;
  steps: OverworldRouteStep[];
  totalDistanceMi: number;
  totalMinutes: number;
};

export type OverworldAreaExit = OverworldAreaEdge & {
  destination: OverworldArea;
};

/** Stable journal identity for a contact's base or quest-reactive presentation. */
export function overworldContactTalkJournalId(
  characterId: string,
  presentationId: string | null,
): string {
  return presentationId === null ? `talk:${characterId}` : `talk:${characterId}@${presentationId}`;
}

export function parseOverworldManifest(input: unknown): OverworldManifest {
  return OverworldManifestSchema.parse(input);
}

/** Normalize a manifest source path to forward slashes with any leading `../` stripped. */
export function normalizeSourcePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^(\.\.\/)+/, "");
}

const overworldQuestsByIdCache = new WeakMap<OverworldManifest, Map<string, OverworldQuest>>();

function overworldQuestsById(world: OverworldManifest): Map<string, OverworldQuest> {
  let map = overworldQuestsByIdCache.get(world);
  if (!map) {
    map = new Map(world.quests.map((quest) => [quest.id, quest]));
    overworldQuestsByIdCache.set(world, map);
  }
  return map;
}

/** Resolve a shipped quest by id from the overworld's quest registry (null if absent). */
export function overworldQuestById(
  world: OverworldManifest,
  questId: string,
): OverworldQuest | null {
  return overworldQuestsById(world).get(questId) ?? null;
}

/** Resolve one trusted campaign export without inventing legacy/default effects. */
export function overworldQuestCampaignExportForEnding(
  quest: OverworldQuest,
  endingId: string,
): OverworldQuestCampaignExport | null {
  return quest.campaign_exports?.find((entry) => entry.ending_id === endingId) ?? null;
}

export function overworldNodesById(world: OverworldManifest): Map<string, OverworldNode> {
  return new Map(world.nodes.map((node) => [node.id, node]));
}

export function overworldEdgesFrom(world: OverworldManifest, nodeId: string): OverworldExit[] {
  const nodes = overworldNodesById(world);
  return world.edges
    .filter((edge) => edge.from === nodeId || edge.to === nodeId)
    .map((edge) => {
      const destinationId = edge.from === nodeId ? edge.to : edge.from;
      const destination = nodes.get(destinationId);
      if (!destination)
        throw new Error(`Overworld edge references missing node "${destinationId}".`);
      return { ...edge, destination };
    })
    .sort(
      (a, b) =>
        a.travel_minutes - b.travel_minutes || a.destination.name.localeCompare(b.destination.name),
    );
}

export function overworldPoisAt(world: OverworldManifest, nodeId: string): OverworldPoi[] {
  return world.points_of_interest
    .filter((poi) => poi.home === nodeId)
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function overworldPoisInArea(world: OverworldManifest, areaId: string): OverworldPoi[] {
  return world.points_of_interest
    .filter((poi) => poi.area === areaId)
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function overworldAreasAt(world: OverworldManifest, nodeId: string): OverworldArea[] {
  return world.areas
    .filter((area) => area.home === nodeId)
    .sort((a, b) => a.travel_minutes - b.travel_minutes || a.name.localeCompare(b.name));
}

export function overworldAreaEdgesFrom(
  world: OverworldManifest,
  areaId: string,
): OverworldAreaExit[] {
  const areas = new Map(world.areas.map((area) => [area.id, area]));
  return world.area_edges
    .filter((edge) => edge.from_area === areaId || edge.to_area === areaId)
    .map((edge) => {
      const destinationId = edge.from_area === areaId ? edge.to_area : edge.from_area;
      const destination = areas.get(destinationId);
      if (!destination)
        throw new Error(`Overworld area edge references missing area "${destinationId}".`);
      return { ...edge, destination };
    })
    .sort(
      (a, b) =>
        a.travel_minutes - b.travel_minutes || a.destination.name.localeCompare(b.destination.name),
    );
}

export function overworldCharactersAt(
  world: OverworldManifest,
  nodeId: string,
): OverworldCharacter[] {
  return world.characters
    .filter((character) => character.home === nodeId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function overworldCharactersInArea(
  world: OverworldManifest,
  areaId: string,
): OverworldCharacter[] {
  return world.characters
    .filter((character) => character.area === areaId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function overworldEventsAt(world: OverworldManifest, nodeId: string): OverworldLocalEvent[] {
  return world.local_events
    .filter((event) => event.home === nodeId)
    .sort((a, b) => b.intensity - a.intensity || a.title.localeCompare(b.title));
}

export function overworldEventsInArea(
  world: OverworldManifest,
  areaId: string,
): OverworldLocalEvent[] {
  return world.local_events
    .filter((event) => event.area === areaId)
    .sort((a, b) => b.intensity - a.intensity || a.title.localeCompare(b.title));
}

export function overworldJobsAt(world: OverworldManifest, nodeId: string): OverworldLocalJob[] {
  return world.local_jobs
    .filter((job) => job.home === nodeId)
    .sort(
      (a, b) =>
        a.difficulty - b.difficulty || a.minutes - b.minutes || a.title.localeCompare(b.title),
    );
}

const roadEventCache = new WeakMap<OverworldManifest, Map<string, OverworldRoadEvent>>();

export function overworldRoadEventFor(
  world: OverworldManifest,
  edgeId: string,
): OverworldRoadEvent | null {
  let cache = roadEventCache.get(world);
  if (!cache) {
    cache = new Map();
    for (const event of world.road_events) cache.set(event.edge, event);
    roadEventCache.set(world, cache);
  }
  return cache.get(edgeId) ?? null;
}

export function overworldExplorationSitesNear(
  world: OverworldManifest,
  nodeId: string,
): OverworldExplorationSite[] {
  return world.exploration_sites
    .filter((site) => site.nearest_town === nodeId)
    .sort((a, b) => b.danger - a.danger || a.title.localeCompare(b.title));
}

export function overworldExplorationSitesInArea(
  world: OverworldManifest,
  areaId: string,
): OverworldExplorationSite[] {
  return world.exploration_sites
    .filter((site) => site.area === areaId)
    .sort((a, b) => b.danger - a.danger || a.title.localeCompare(b.title));
}

export function overworldQuestsAt(world: OverworldManifest, nodeId: string): OverworldQuest[] {
  return world.quests
    .filter((quest) => quest.home === nodeId)
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function planOverworldRoute(
  world: OverworldManifest,
  fromId: string,
  destinationId: string,
  allowedNodeIds?: ReadonlySet<string>,
): OverworldRoutePlan | null {
  const nodes = overworldNodesById(world);
  const from = nodes.get(fromId);
  if (!from) throw new Error(`Unknown overworld route start "${fromId}".`);
  const destination = nodes.get(destinationId);
  if (!destination) throw new Error(`Unknown overworld route destination "${destinationId}".`);
  if (allowedNodeIds && (!allowedNodeIds.has(fromId) || !allowedNodeIds.has(destinationId))) {
    return null;
  }
  if (fromId === destinationId) {
    return { from, destination, steps: [], totalDistanceMi: 0, totalMinutes: 0 };
  }

  const distance = new Map<string, number>([[fromId, 0]]);
  const previous = new Map<string, { from: string; edge: OverworldEdge }>();
  const unsettled = new Set<string>(allowedNodeIds ? [...allowedNodeIds] : [...nodes.keys()]);

  while (unsettled.size > 0) {
    let current: string | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const candidate of unsettled) {
      const candidateDistance = distance.get(candidate) ?? Number.POSITIVE_INFINITY;
      if (candidateDistance < best) {
        current = candidate;
        best = candidateDistance;
      }
    }
    if (current === null || best === Number.POSITIVE_INFINITY) break;
    unsettled.delete(current);
    if (current === destinationId) break;

    for (const edge of overworldEdgesFrom(world, current)) {
      const next = edge.destination.id;
      if (!unsettled.has(next)) continue;
      const nextDistance = best + edge.travel_minutes;
      if (nextDistance >= (distance.get(next) ?? Number.POSITIVE_INFINITY)) continue;
      distance.set(next, nextDistance);
      previous.set(next, { from: current, edge });
    }
  }

  if (!previous.has(destinationId)) return null;
  const steps: OverworldRouteStep[] = [];
  for (let cursor = destinationId; cursor !== fromId; ) {
    const prev = previous.get(cursor);
    if (!prev) return null;
    const stepFrom = nodes.get(prev.from);
    const stepTo = nodes.get(cursor);
    if (!stepFrom || !stepTo) return null;
    steps.unshift({
      from: stepFrom,
      to: stepTo,
      edge: prev.edge,
      roadEvent: overworldRoadEventFor(world, prev.edge.id),
    });
    cursor = prev.from;
  }

  return {
    from,
    destination,
    steps,
    totalDistanceMi: steps.reduce((sum, step) => sum + step.edge.distance_mi, 0),
    totalMinutes: steps.reduce((sum, step) => sum + step.edge.travel_minutes, 0),
  };
}

function assertNodesIntegrity(world: OverworldManifest, nodes: Map<string, OverworldNode>): void {
  if (!nodes.has(world.start)) throw new Error(`Overworld start node "${world.start}" is missing.`);
  if (nodes.size !== world.nodes.length) throw new Error("Overworld node ids must be unique.");
}

function assertRegionsIntegrity(
  world: OverworldManifest,
  regionNames: Set<string>,
  regionIds: Set<string>,
): void {
  for (const region of world.regions) {
    if (regionIds.has(region.id)) throw new Error(`Duplicate overworld region id "${region.id}".`);
    regionIds.add(region.id);
    regionNames.add(region.name);
  }
  for (const node of world.nodes) {
    if (!regionNames.has(node.region)) {
      throw new Error(`Overworld node "${node.id}" references missing region "${node.region}".`);
    }
  }
}

function assertRegionalArcsIntegrity(
  world: OverworldManifest,
  nodes: Map<string, OverworldNode>,
  regionNames: Set<string>,
): void {
  const arcIds = new Set<string>();
  for (const arc of world.regional_arcs) {
    if (arcIds.has(arc.id)) throw new Error(`Duplicate overworld regional arc id "${arc.id}".`);
    arcIds.add(arc.id);
    if (!regionNames.has(arc.region)) {
      throw new Error(`Overworld regional arc "${arc.id}" references missing region.`);
    }
    if (arc.required_resolutions > arc.anchor_towns.length) {
      throw new Error(`Overworld regional arc "${arc.id}" requires more resolutions than anchors.`);
    }
    for (const townId of arc.anchor_towns) {
      const node = nodes.get(townId);
      if (!node) throw new Error(`Overworld regional arc "${arc.id}" references missing town.`);
      if (node.region !== arc.region) {
        throw new Error(`Overworld regional arc "${arc.id}" has an anchor outside its region.`);
      }
    }
  }
}

function assertEdgesIntegrity(
  world: OverworldManifest,
  nodes: Map<string, OverworldNode>,
  edgeIds: Set<string>,
): void {
  for (const edge of world.edges) {
    if (edgeIds.has(edge.id)) throw new Error(`Duplicate overworld edge id "${edge.id}".`);
    edgeIds.add(edge.id);
    if (!nodes.has(edge.from))
      throw new Error(`Overworld edge "${edge.id}" has missing from node.`);
    if (!nodes.has(edge.to)) throw new Error(`Overworld edge "${edge.id}" has missing to node.`);
    const mph = world.scale.road_class_speed_mph[edge.road_class];
    if (mph === undefined) {
      throw new Error(
        `Overworld edge "${edge.id}" has no speed for road class "${edge.road_class}".`,
      );
    }
    const expected = Math.max(3, Math.round((edge.distance_mi / mph) * 60));
    if (Math.abs(edge.travel_minutes - expected) > 1) {
      throw new Error(`Overworld edge "${edge.id}" travel time is not proportional to distance.`);
    }
  }
}

const requireHomeCoverage = (world: OverworldManifest, label: string, homes: string[]): void => {
  const covered = new Set(homes);
  for (const node of world.nodes) {
    if (!covered.has(node.id)) throw new Error(`Overworld ${label} missing for "${node.id}".`);
  }
};

const minimumAreaCount = (node: OverworldNode): number => {
  if (node.kind === "metropolis") return 10;
  if (node.kind === "great_city") return 8;
  if (node.kind === "major_city") return 6;
  if (node.kind === "city") return 5;
  if (node.kind === "large_town") return 3;
  return 2;
};

const minimumAreaRouteCount = (areaCount: number): number => {
  if (areaCount <= 1) return 0;
  return (
    areaCount -
    1 +
    (areaCount >= 3 ? 1 : 0) +
    (areaCount >= 4 ? 2 : 0) +
    (areaCount >= 5 ? 1 : 0) +
    (areaCount >= 6 ? 1 : 0) +
    (areaCount >= 7 ? 1 : 0) +
    (areaCount >= 8 ? 1 : 0) +
    (areaCount >= 9 ? 1 : 0) +
    (areaCount >= 10 ? 1 : 0)
  );
};

function assertAreasIntegrity(
  world: OverworldManifest,
  nodes: Map<string, OverworldNode>,
  areaIds: Set<string>,
  areaHomes: Map<string, string>,
): void {
  const seenArea = new Set<string>();
  const areaCounts = new Map<string, number>();
  for (const area of world.areas) {
    if (seenArea.has(area.id)) throw new Error(`Duplicate overworld area id "${area.id}".`);
    seenArea.add(area.id);
    areaIds.add(area.id);
    areaHomes.set(area.id, area.home);
    const node = nodes.get(area.home);
    if (!node) throw new Error(`Overworld area "${area.id}" has missing home node.`);
    for (const service of area.services) {
      if (!node.services.includes(service)) {
        throw new Error(
          `Overworld area "${area.id}" exposes service "${service}" not present in "${node.id}".`,
        );
      }
    }
    areaCounts.set(area.home, (areaCounts.get(area.home) ?? 0) + 1);
  }
  requireHomeCoverage(
    world,
    "area",
    world.areas.map((area) => area.home),
  );
  for (const node of world.nodes) {
    const count = areaCounts.get(node.id) ?? 0;
    const minimum = minimumAreaCount(node);
    if (count < minimum) {
      throw new Error(
        `Overworld node "${node.id}" has ${count} areas; ${minimum} required for ${node.kind}.`,
      );
    }
  }

  const seenAreaEdge = new Set<string>();
  const seenAreaPairs = new Set<string>();
  const areaAdjacency = new Map<string, Set<string>>();
  const areaRouteCounts = new Map<string, number>();
  for (const area of world.areas) areaAdjacency.set(area.id, new Set());
  for (const edge of world.area_edges) {
    if (seenAreaEdge.has(edge.id))
      throw new Error(`Duplicate overworld area edge id "${edge.id}".`);
    seenAreaEdge.add(edge.id);
    if (!nodes.has(edge.home))
      throw new Error(`Overworld area edge "${edge.id}" has missing home.`);
    if (!areaIds.has(edge.from_area) || !areaIds.has(edge.to_area)) {
      throw new Error(`Overworld area edge "${edge.id}" references missing area.`);
    }
    if (edge.from_area === edge.to_area) {
      throw new Error(`Overworld area edge "${edge.id}" loops to itself.`);
    }
    if (areaHomes.get(edge.from_area) !== edge.home || areaHomes.get(edge.to_area) !== edge.home) {
      throw new Error(`Overworld area edge "${edge.id}" crosses town boundaries.`);
    }
    const pair = [edge.from_area, edge.to_area].sort().join("::");
    if (seenAreaPairs.has(pair)) {
      throw new Error(`Duplicate overworld area route pair "${pair}".`);
    }
    seenAreaPairs.add(pair);
    areaAdjacency.get(edge.from_area)?.add(edge.to_area);
    areaAdjacency.get(edge.to_area)?.add(edge.from_area);
    areaRouteCounts.set(edge.home, (areaRouteCounts.get(edge.home) ?? 0) + 1);
  }
  for (const node of world.nodes) {
    const localAreas = world.areas.filter((area) => area.home === node.id);
    const routeCount = areaRouteCounts.get(node.id) ?? 0;
    const routeMinimum = minimumAreaRouteCount(localAreas.length);
    if (routeCount < routeMinimum) {
      throw new Error(
        `Overworld area graph for "${node.id}" has ${routeCount} routes; ${routeMinimum} required for ${localAreas.length} areas.`,
      );
    }
    if (localAreas.length <= 1) continue;
    const reachedAreas = new Set<string>([localAreas[0]!.id]);
    const areaQueue = [localAreas[0]!.id];
    for (let i = 0; i < areaQueue.length; i += 1) {
      for (const next of areaAdjacency.get(areaQueue[i]!) ?? []) {
        if (areaHomes.get(next) !== node.id || reachedAreas.has(next)) continue;
        reachedAreas.add(next);
        areaQueue.push(next);
      }
    }
    if (reachedAreas.size !== localAreas.length) {
      throw new Error(
        `Overworld area graph for "${node.id}" is disconnected: reached ${reachedAreas.size}/${localAreas.length}.`,
      );
    }
  }
}

function assertEntitiesIntegrity(
  world: OverworldManifest,
  nodes: Map<string, OverworldNode>,
  areaIds: Set<string>,
  areaHomes: Map<string, string>,
  edgeIds: Set<string>,
): void {
  const questIds = new Set(world.quests.map((quest) => quest.id));
  const seenPoi = new Set<string>();
  const poiAreas = new Set<string>();
  for (const poi of world.points_of_interest) {
    if (seenPoi.has(poi.id)) throw new Error(`Duplicate overworld POI id "${poi.id}".`);
    seenPoi.add(poi.id);
    if (!nodes.has(poi.home)) throw new Error(`Overworld POI "${poi.id}" has missing home node.`);
    if (!areaIds.has(poi.area)) throw new Error(`Overworld POI "${poi.id}" has missing area.`);
    if (areaHomes.get(poi.area) !== poi.home) {
      throw new Error(`Overworld POI "${poi.id}" is anchored outside its home town.`);
    }
    poiAreas.add(poi.area);
  }
  requireHomeCoverage(
    world,
    "point of interest",
    world.points_of_interest.map((poi) => poi.home),
  );
  for (const areaId of areaIds) {
    if (!poiAreas.has(areaId)) throw new Error(`Overworld area "${areaId}" has no POI.`);
  }

  const seenCharacter = new Set<string>();
  const characterAreas = new Set<string>();
  const contactTalkJournalIds = new Set<string>();
  for (const character of world.characters) {
    if (seenCharacter.has(character.id))
      throw new Error(`Duplicate overworld character id "${character.id}".`);
    seenCharacter.add(character.id);
    if (!nodes.has(character.home))
      throw new Error(`Overworld character "${character.id}" has missing home node.`);
    if (!areaIds.has(character.area))
      throw new Error(`Overworld character "${character.id}" has missing area.`);
    if (areaHomes.get(character.area) !== character.home) {
      throw new Error(`Overworld character "${character.id}" is anchored outside its home town.`);
    }
    if (character.variants !== undefined && character.variants.length === 0) {
      throw new Error(`Overworld character "${character.id}" has an empty variants list.`);
    }

    const presentationJournalIds = [
      overworldContactTalkJournalId(character.id, null),
      ...(character.variants ?? []).map((variant) =>
        overworldContactTalkJournalId(character.id, variant.id),
      ),
    ];
    for (const journalId of presentationJournalIds) {
      if (contactTalkJournalIds.has(journalId)) {
        throw new Error(`Duplicate overworld contact talk journal id "${journalId}".`);
      }
      contactTalkJournalIds.add(journalId);
    }

    const seenVariantIds = new Set<string>();
    const variantQuestSets: Set<string>[] = [];
    for (const variant of character.variants ?? []) {
      if (seenVariantIds.has(variant.id)) {
        throw new Error(
          `Overworld character "${character.id}" repeats variant id "${variant.id}".`,
        );
      }
      seenVariantIds.add(variant.id);
      if (variant.summary === undefined && variant.agenda === undefined) {
        throw new Error(
          `Overworld character "${character.id}" variant "${variant.id}" must override summary or agenda.`,
        );
      }
      if (variant.after_quests.length === 0) {
        throw new Error(
          `Overworld character "${character.id}" variant "${variant.id}" has no after_quests condition.`,
        );
      }

      const afterQuestIds = new Set(variant.after_quests);
      if (afterQuestIds.size !== variant.after_quests.length) {
        throw new Error(
          `Overworld character "${character.id}" variant "${variant.id}" repeats an after_quests id.`,
        );
      }
      for (const questId of afterQuestIds) {
        if (!questIds.has(questId)) {
          throw new Error(
            `Overworld character "${character.id}" variant "${variant.id}" references missing quest "${questId}".`,
          );
        }
      }
      variantQuestSets.push(afterQuestIds);
    }

    for (let earlierIndex = 0; earlierIndex < variantQuestSets.length; earlierIndex += 1) {
      const earlier = variantQuestSets[earlierIndex]!;
      for (
        let laterIndex = earlierIndex + 1;
        laterIndex < variantQuestSets.length;
        laterIndex += 1
      ) {
        const later = variantQuestSets[laterIndex]!;
        if ([...earlier].every((questId) => later.has(questId))) {
          const earlierVariant = character.variants![earlierIndex]!;
          const laterVariant = character.variants![laterIndex]!;
          throw new Error(
            `Overworld character "${character.id}" orders broader variant "${earlierVariant.id}" before more-specific variant "${laterVariant.id}".`,
          );
        }
      }
    }
    characterAreas.add(character.area);
  }
  requireHomeCoverage(
    world,
    "character",
    world.characters.map((character) => character.home),
  );
  for (const areaId of areaIds) {
    if (!characterAreas.has(areaId))
      throw new Error(`Overworld area "${areaId}" has no character.`);
  }

  const seenLocalEvent = new Set<string>();
  const eventAreas = new Set<string>();
  for (const event of world.local_events) {
    if (seenLocalEvent.has(event.id))
      throw new Error(`Duplicate overworld local event id "${event.id}".`);
    seenLocalEvent.add(event.id);
    if (!nodes.has(event.home))
      throw new Error(`Overworld local event "${event.id}" has missing home node.`);
    if (!areaIds.has(event.area))
      throw new Error(`Overworld local event "${event.id}" has missing area.`);
    if (areaHomes.get(event.area) !== event.home) {
      throw new Error(`Overworld local event "${event.id}" is anchored outside its home town.`);
    }
    eventAreas.add(event.area);
  }
  requireHomeCoverage(
    world,
    "local event",
    world.local_events.map((event) => event.home),
  );
  for (const areaId of areaIds) {
    if (!eventAreas.has(areaId)) throw new Error(`Overworld area "${areaId}" has no local event.`);
  }

  const seenJob = new Set<string>();
  const jobCounts = new Map<string, number>();
  const jobAreas = new Set<string>();
  for (const job of world.local_jobs) {
    if (seenJob.has(job.id)) throw new Error(`Duplicate overworld local job id "${job.id}".`);
    seenJob.add(job.id);
    const node = nodes.get(job.home);
    if (!node) throw new Error(`Overworld local job "${job.id}" has missing home node.`);
    if (!areaIds.has(job.area)) {
      throw new Error(`Overworld local job "${job.id}" references missing area.`);
    }
    if (areaHomes.get(job.area) !== job.home) {
      throw new Error(`Overworld local job "${job.id}" is anchored outside its home town.`);
    }
    jobCounts.set(job.home, (jobCounts.get(job.home) ?? 0) + 1);
    jobAreas.add(job.area);
  }
  requireHomeCoverage(
    world,
    "local job",
    world.local_jobs.map((job) => job.home),
  );
  for (const areaId of areaIds) {
    if (!jobAreas.has(areaId)) {
      throw new Error(`Overworld area "${areaId}" has no local job.`);
    }
  }
  for (const node of world.nodes) {
    const count = jobCounts.get(node.id) ?? 0;
    const minimum = minimumAreaCount(node);
    if (count < minimum) {
      throw new Error(
        `Overworld node "${node.id}" has ${count} local jobs; ${minimum} required for ${node.kind}.`,
      );
    }
  }

  const seenRoadEvent = new Set<string>();
  const roadEventEdges = new Set<string>();
  for (const event of world.road_events) {
    if (seenRoadEvent.has(event.id)) throw new Error(`Duplicate road event id "${event.id}".`);
    seenRoadEvent.add(event.id);
    if (!edgeIds.has(event.edge))
      throw new Error(`Overworld road event "${event.id}" references missing edge.`);
    if (roadEventEdges.has(event.edge))
      throw new Error(`Multiple overworld road events reference edge "${event.edge}".`);
    roadEventEdges.add(event.edge);

    const requiresChoice = event.requires_choice === true;
    if (requiresChoice !== (event.responses !== undefined)) {
      throw new Error(
        `Overworld road event "${event.id}" must define requires_choice and responses together.`,
      );
    }
    if (event.active_goal_ids) {
      const distinctGoalIds = new Set(event.active_goal_ids);
      if (distinctGoalIds.size !== event.active_goal_ids.length) {
        throw new Error(`Overworld road event "${event.id}" repeats an active goal id.`);
      }
    }
    if (event.responses) {
      const responses = Object.values(event.responses);
      const normalize = (text: string): string => text.trim().replace(/\s+/g, " ").toLowerCase();
      const labels = responses.map((response) => normalize(response.label));
      const outcomes = responses.map((response) => normalize(response.outcome));
      if (labels.some((label) => label.split(" ").length < 2)) {
        throw new Error(
          `Overworld road event "${event.id}" response labels must be meaningful phrases.`,
        );
      }
      if (outcomes.some((outcome) => outcome.split(" ").length < 6)) {
        throw new Error(
          `Overworld road event "${event.id}" response outcomes must be meaningful prose.`,
        );
      }
      if (new Set(labels).size !== labels.length) {
        throw new Error(`Overworld road event "${event.id}" response labels must be unique.`);
      }
      if (new Set(outcomes).size !== outcomes.length) {
        throw new Error(`Overworld road event "${event.id}" response outcomes must be unique.`);
      }
    }
  }
  for (const edge of world.edges) {
    if (!roadEventEdges.has(edge.id))
      throw new Error(`Overworld road event missing for "${edge.id}".`);
  }
}

function assertExplorationSitesIntegrity(
  world: OverworldManifest,
  nodes: Map<string, OverworldNode>,
  regionNames: Set<string>,
  areaIds: Set<string>,
  areaHomes: Map<string, string>,
): void {
  const seenSite = new Set<string>();
  const siteCountsByRegion = new Map<string, number>();
  const siteAreas = new Set<string>();
  for (const site of world.exploration_sites) {
    if (seenSite.has(site.id)) throw new Error(`Duplicate exploration site id "${site.id}".`);
    seenSite.add(site.id);
    if (!regionNames.has(site.region)) {
      throw new Error(`Overworld exploration site "${site.id}" references missing region.`);
    }
    const town = nodes.get(site.nearest_town);
    if (!town) throw new Error(`Overworld exploration site "${site.id}" has missing town.`);
    if (town.region !== site.region) {
      throw new Error(`Overworld exploration site "${site.id}" is anchored outside its region.`);
    }
    if (!areaIds.has(site.area)) {
      throw new Error(`Overworld exploration site "${site.id}" references missing area.`);
    }
    if (areaHomes.get(site.area) !== site.nearest_town) {
      throw new Error(`Overworld exploration site "${site.id}" is anchored outside its town.`);
    }
    siteAreas.add(site.area);
    siteCountsByRegion.set(site.region, (siteCountsByRegion.get(site.region) ?? 0) + 1);
  }
  for (const areaId of areaIds) {
    if (!siteAreas.has(areaId))
      throw new Error(`Overworld area "${areaId}" has no exploration site.`);
  }
  for (const region of regionNames) {
    if ((siteCountsByRegion.get(region) ?? 0) < 3) {
      throw new Error(`Overworld region "${region}" needs at least three exploration sites.`);
    }
  }
}

function assertQuestsIntegrity(
  world: OverworldManifest,
  nodes: Map<string, OverworldNode>,
  areaIds: Set<string>,
  areaHomes: Map<string, string>,
): void {
  const seenQuest = new Set<string>();
  for (const quest of world.quests) {
    if (seenQuest.has(quest.id)) throw new Error(`Duplicate overworld quest id "${quest.id}".`);
    seenQuest.add(quest.id);
    if (!nodes.has(quest.home))
      throw new Error(`Overworld quest "${quest.id}" has missing home node.`);
    if (!areaIds.has(quest.area))
      throw new Error(`Overworld quest "${quest.id}" has missing area.`);
    if (areaHomes.get(quest.area) !== quest.home) {
      throw new Error(`Overworld quest "${quest.id}" is anchored outside its home town.`);
    }

    const campaignEndingIds = new Set<string>();
    const campaignEndingTitles = new Set<string>();
    for (const campaignExport of quest.campaign_exports ?? []) {
      if (campaignEndingIds.has(campaignExport.ending_id)) {
        throw new Error(
          `Overworld quest "${quest.id}" repeats campaign export ending id "${campaignExport.ending_id}".`,
        );
      }
      if (campaignEndingTitles.has(campaignExport.ending_title)) {
        throw new Error(
          `Overworld quest "${quest.id}" repeats campaign export ending title "${campaignExport.ending_title}".`,
        );
      }
      campaignEndingIds.add(campaignExport.ending_id);
      campaignEndingTitles.add(campaignExport.ending_title);

      const effectKeys = new Set<string>();
      for (const effect of campaignExport.effects) {
        const key = campaignConsequenceEffectKey(effect);
        if (effectKeys.has(key)) {
          throw new Error(
            `Overworld quest "${quest.id}" campaign export "${campaignExport.ending_id}" repeats effect ${key}.`,
          );
        }
        effectKeys.add(key);
      }
    }
  }
}

function assertGraphConnectivity(world: OverworldManifest): void {
  const reached = new Set<string>([world.start]);
  const queue = [world.start];
  for (let i = 0; i < queue.length; i += 1) {
    for (const edge of overworldEdgesFrom(world, queue[i]!)) {
      if (reached.has(edge.destination.id)) continue;
      reached.add(edge.destination.id);
      queue.push(edge.destination.id);
    }
  }
  if (reached.size !== world.nodes.length) {
    throw new Error(
      `Overworld graph is disconnected: reached ${reached.size}/${world.nodes.length}.`,
    );
  }
}

export function assertOverworldIntegrity(world: OverworldManifest): void {
  const nodes = overworldNodesById(world);
  assertNodesIntegrity(world, nodes);

  const regionNames = new Set<string>();
  const regionIds = new Set<string>();
  assertRegionsIntegrity(world, regionNames, regionIds);

  assertRegionalArcsIntegrity(world, nodes, regionNames);

  const edgeIds = new Set<string>();
  assertEdgesIntegrity(world, nodes, edgeIds);

  const areaIds = new Set<string>();
  const areaHomes = new Map<string, string>();
  assertAreasIntegrity(world, nodes, areaIds, areaHomes);

  assertEntitiesIntegrity(world, nodes, areaIds, areaHomes, edgeIds);

  assertExplorationSitesIntegrity(world, nodes, regionNames, areaIds, areaHomes);

  assertQuestsIntegrity(world, nodes, areaIds, areaHomes);

  assertGraphConnectivity(world);
}
