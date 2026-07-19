import { z } from "zod";

import { CampaignCharacterImportsSchema } from "../rpg/campaign_character_import.js";
import {
  CampaignCharacterConditionsSchema,
  CampaignConsequenceEffectsSchema,
  campaignCharacterMatchesConditions,
  campaignConsequenceEffectKey,
  applyCampaignConsequences,
  type CampaignCharacterConditions,
  type CampaignConsequenceEffect,
} from "./campaign_consequences.js";
import {
  CampaignCharacterIdSchema,
  type CampaignCharacterState,
} from "./campaign_character_state.js";
import {
  CampaignServiceRulesSchema,
  resolveParsedActiveCampaignServiceRules,
  type CampaignServiceRule,
} from "./campaign_service_rules.js";
import {
  ALBANY_DAWN_DISPATCH_CHOICE_IDS,
  ALBANY_DAWN_DISPATCH_ID,
  journeyCampaignStoryChoiceSelection,
} from "./journey_campaign.js";
import { LocalJobSceneSchema } from "./local_job_scene.js";
import { OpeningAllySchema, applyOpeningAllyOption } from "./opening_ally.js";
import { OpeningLeadSourceSchema, applyOpeningLeadSourceOption } from "./opening_lead_source.js";
import { OpeningPreparationSchema, applyOpeningPreparationProfile } from "./opening_preparation.js";
import {
  OpeningReliefAllocationSchema,
  applyOpeningReliefAllocationOption,
} from "./opening_relief_allocation.js";
import { OpeningReliefOathSchema, applyOpeningReliefOathOption } from "./opening_relief_oath.js";
import { OpeningRegistrationSchema } from "./opening_registration.js";
import { OverworldQuestLaunchSchema } from "./quest_launch.js";

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
    after_quests: z.array(z.string().min(1)).min(1).optional(),
    after_relationship_memories: z.array(CampaignCharacterIdSchema).min(1).optional(),
    summary: z.string().min(1).optional(),
    agenda: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((variant, ctx) => {
    if (variant.after_quests === undefined && variant.after_relationship_memories === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "An overworld character variant must require a quest or relationship memory.",
      });
    }
    if (variant.summary === undefined && variant.agenda === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "An overworld character variant must override summary or agenda.",
      });
    }
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
    campaign_npc_id: CampaignCharacterIdSchema.optional(),
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
    authored_scene: LocalJobSceneSchema.optional(),
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

function campaignCharacterMutationTargetKey(effect: CampaignConsequenceEffect): string {
  switch (effect.type) {
    case "add_companion":
    case "remove_companion":
      return `companion:${effect.npc_id}`;
    case "resolve_promise":
      return `promise_resolution:${effect.promise_id}`;
    default:
      return campaignConsequenceEffectKey(effect);
  }
}

function campaignConditionsAreMutuallyExclusive(
  left: CampaignCharacterConditions,
  right: CampaignCharacterConditions,
): boolean {
  const leftRequiredCompanions = new Set(left.requires_all_companions ?? []);
  const rightRequiredCompanions = new Set(right.requires_all_companions ?? []);
  if (
    (left.forbids_any_companions ?? []).some((id) => rightRequiredCompanions.has(id)) ||
    (right.forbids_any_companions ?? []).some((id) => leftRequiredCompanions.has(id))
  ) {
    return true;
  }
  const leftPromises = new Map(
    (left.requires_all_promises ?? []).map((promise) => [promise.promise_id, promise.status]),
  );
  return (right.requires_all_promises ?? []).some(
    (promise) =>
      leftPromises.has(promise.promise_id) &&
      leftPromises.get(promise.promise_id) !== promise.status,
  );
}

export const OverworldQuestCampaignConditionalEffectsSchema = z
  .object({
    id: CampaignCharacterIdSchema,
    when: CampaignCharacterConditionsSchema,
    effects: CampaignConsequenceEffectsSchema.refine((effects) => effects.length > 0, {
      message: "Conditional quest effects must change campaign character state.",
    }),
  })
  .strict()
  .superRefine((group, ctx) => {
    const requiredCompanions = new Set(group.when.requires_all_companions ?? []);
    const requiredPromises = new Map(
      (group.when.requires_all_promises ?? []).map((promise) => [
        promise.promise_id,
        promise.status,
      ]),
    );
    const mutationTargets = new Set<string>();
    group.effects.forEach((effect, index) => {
      if (effect.type === "set_world_fact") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["effects", index],
          message:
            "Conditional quest effects may evolve character state; ending-owned world facts remain unconditional and replayable.",
        });
      }
      if (effect.type === "record_promise") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["effects", index],
          message:
            "Quest exports cannot create promises; authored story choices own promise identity and recipient binding.",
        });
      }
      if (effect.type === "remove_companion" && !requiredCompanions.has(effect.npc_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["effects", index],
          message: `Conditional removal of companion "${effect.npc_id}" must require that companion.`,
        });
      }
      if (
        effect.type === "resolve_promise" &&
        requiredPromises.get(effect.promise_id) !== "active"
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["effects", index],
          message: `Conditional resolution of promise "${effect.promise_id}" must require that promise as active.`,
        });
      }
      const target = campaignCharacterMutationTargetKey(effect);
      if (mutationTargets.has(target)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["effects", index],
          message: `Conditional quest effect group "${group.id}" repeats campaign mutation target "${target}".`,
        });
      }
      mutationTargets.add(target);
    });
  });

export const OverworldQuestCampaignExportSchema = z
  .object({
    ending_id: z.string().min(1),
    ending_title: z.string().min(1),
    effects: CampaignConsequenceEffectsSchema,
    conditional_effects: z.array(OverworldQuestCampaignConditionalEffectsSchema).min(1).optional(),
  })
  .strict()
  .superRefine((campaignExport, ctx) => {
    const ids = new Set<string>();
    campaignExport.effects.forEach((effect, index) => {
      if (effect.type === "record_promise") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["effects", index],
          message:
            "Quest exports cannot create promises; authored story choices own promise identity and recipient binding.",
        });
      }
      if (effect.type === "resolve_promise") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["effects", index],
          message:
            "Quest promise resolution must be conditional on that exact promise being active.",
        });
      }
    });
    const unconditionalTargets = new Set(
      campaignExport.effects.map(campaignCharacterMutationTargetKey),
    );
    const priorGroups: Array<{
      when: CampaignCharacterConditions;
      targets: ReadonlySet<string>;
    }> = [];
    campaignExport.conditional_effects?.forEach((group, index) => {
      if (ids.has(group.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["conditional_effects", index, "id"],
          message: `Duplicate conditional quest effect group id "${group.id}".`,
        });
      }
      ids.add(group.id);
      const targets = new Set(group.effects.map(campaignCharacterMutationTargetKey));
      for (const target of targets) {
        if (unconditionalTargets.has(target)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["conditional_effects", index, "effects"],
            message: `Conditional quest effect group "${group.id}" overlaps unconditional campaign mutation target "${target}".`,
          });
        }
      }
      priorGroups.forEach((prior, priorIndex) => {
        if (campaignConditionsAreMutuallyExclusive(prior.when, group.when)) return;
        for (const target of targets) {
          if (prior.targets.has(target)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["conditional_effects", index, "effects"],
              message: `Jointly matchable conditional quest effect groups ${priorIndex + 1} and ${index + 1} overlap campaign mutation target "${target}".`,
            });
          }
        }
      });
      priorGroups.push({ when: group.when, targets });
    });
  });

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
    launch: OverworldQuestLaunchSchema.optional(),
    campaign_imports: CampaignCharacterImportsSchema.optional(),
    campaign_exports: OverworldQuestCampaignExportsSchema.optional(),
  })
  .strict();

export const OverworldManifestSchema = z
  .object({
    id: z.literal("new_york_overworld"),
    name: z.string().min(1),
    start: z.string().min(1),
    premise: z.string().min(1),
    opening_registration: OpeningRegistrationSchema.optional(),
    opening_relief_oath: OpeningReliefOathSchema.optional(),
    opening_lead_source: OpeningLeadSourceSchema.optional(),
    opening_preparation: OpeningPreparationSchema.optional(),
    opening_relief_allocation: OpeningReliefAllocationSchema.optional(),
    opening_ally: OpeningAllySchema.optional(),
    campaign_service_rules: CampaignServiceRulesSchema.optional(),
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
export type OverworldCharacterView = Omit<OverworldCharacter, "campaign_npc_id" | "variants">;
export type OverworldLocalEvent = z.infer<typeof OverworldLocalEventSchema>;
export type OverworldLocalJobKind = z.infer<typeof OverworldLocalJobKindSchema>;
export type OverworldLocalJob = z.infer<typeof OverworldLocalJobSchema>;
export type OverworldRoadEvent = z.infer<typeof OverworldRoadEventSchema>;
export type OverworldExplorationSite = z.infer<typeof OverworldExplorationSiteSchema>;
export type OverworldQuestCampaignExport = z.infer<typeof OverworldQuestCampaignExportSchema>;
export type OverworldQuest = z.infer<typeof OverworldQuestSchema>;
export type OverworldCampaignServiceRule = CampaignServiceRule;
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

/** Select ending effects against the character state that entered the foldback boundary. */
export function overworldQuestCampaignEffectsForCharacter(
  campaignExport: OverworldQuestCampaignExport,
  character: CampaignCharacterState,
): readonly CampaignConsequenceEffect[] {
  return [
    ...campaignExport.effects,
    ...(campaignExport.conditional_effects ?? [])
      .filter((group) => campaignCharacterMatchesConditions(character, group.when))
      .flatMap((group) => group.effects),
  ];
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
  const seenCampaignNpcId = new Set<string>();
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

    if (
      character.campaign_npc_id !== undefined &&
      !CampaignCharacterIdSchema.safeParse(character.campaign_npc_id).success
    ) {
      throw new Error(
        `Overworld character "${character.id}" has invalid campaign npc id "${character.campaign_npc_id}".`,
      );
    }
    if (
      character.campaign_npc_id !== undefined &&
      seenCampaignNpcId.has(character.campaign_npc_id)
    ) {
      throw new Error(`Duplicate overworld campaign npc id "${character.campaign_npc_id}".`);
    }
    if (character.campaign_npc_id !== undefined) {
      seenCampaignNpcId.add(character.campaign_npc_id);
    }

    const seenVariantIds = new Set<string>();
    const variantConditionSets: Set<string>[] = [];
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
      const afterQuestIds = new Set(variant.after_quests ?? []);
      const afterRelationshipMemoryIds = new Set(variant.after_relationship_memories ?? []);
      if (afterQuestIds.size === 0 && afterRelationshipMemoryIds.size === 0) {
        throw new Error(
          `Overworld character "${character.id}" variant "${variant.id}" has no quest or relationship-memory condition.`,
        );
      }
      if (afterQuestIds.size !== (variant.after_quests?.length ?? 0)) {
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
      if (afterRelationshipMemoryIds.size !== (variant.after_relationship_memories?.length ?? 0)) {
        throw new Error(
          `Overworld character "${character.id}" variant "${variant.id}" repeats an after_relationship_memories id.`,
        );
      }
      if (afterRelationshipMemoryIds.size > 0 && character.campaign_npc_id === undefined) {
        throw new Error(
          `Overworld character "${character.id}" variant "${variant.id}" requires relationship memories without a campaign_npc_id.`,
        );
      }
      for (const memoryId of afterRelationshipMemoryIds) {
        if (!CampaignCharacterIdSchema.safeParse(memoryId).success) {
          throw new Error(
            `Overworld character "${character.id}" variant "${variant.id}" has invalid relationship memory id "${memoryId}".`,
          );
        }
      }
      variantConditionSets.push(
        new Set([
          ...[...afterQuestIds].map((questId) => `quest:${questId}`),
          ...[...afterRelationshipMemoryIds].map((memoryId) => `memory:${memoryId}`),
        ]),
      );
    }

    for (let earlierIndex = 0; earlierIndex < variantConditionSets.length; earlierIndex += 1) {
      const earlier = variantConditionSets[earlierIndex]!;
      for (
        let laterIndex = earlierIndex + 1;
        laterIndex < variantConditionSets.length;
        laterIndex += 1
      ) {
        const later = variantConditionSets[laterIndex]!;
        if ([...earlier].every((conditionId) => later.has(conditionId))) {
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
  const seenJobScene = new Set<string>();
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
    const scene = job.authored_scene;
    if (scene) {
      if (seenJobScene.has(scene.id)) {
        throw new Error(`Duplicate authored local-job scene id "${scene.id}".`);
      }
      seenJobScene.add(scene.id);
      const poi = world.points_of_interest.find(
        (candidate) => candidate.id === scene.required_poi_id,
      );
      if (!poi || poi.home !== job.home || poi.area !== job.area) {
        throw new Error(
          `Authored local-job scene "${scene.id}" requires a point of interest in its job area.`,
        );
      }
      const contact = world.characters.find(
        (candidate) => candidate.id === scene.required_contact_id,
      );
      if (!contact || contact.home !== job.home || contact.area !== job.area) {
        throw new Error(
          `Authored local-job scene "${scene.id}" requires a contact in its job area.`,
        );
      }
      for (const questId of scene.requires_completed_quests) {
        if (!questIds.has(questId)) {
          throw new Error(
            `Authored local-job scene "${scene.id}" requires missing quest "${questId}".`,
          );
        }
      }
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

function assertOpeningRegistrationIntegrity(
  world: OverworldManifest,
  nodes: ReadonlyMap<string, OverworldNode>,
  areaIds: ReadonlySet<string>,
  areaHomes: ReadonlyMap<string, string>,
): void {
  const registration = world.opening_registration;
  if (!registration) return;
  if (registration.home !== world.start) {
    throw new Error("Overworld opening registration must be anchored in the starting town.");
  }
  if (!nodes.has(registration.home)) {
    throw new Error("Overworld opening registration references a missing home node.");
  }
  if (!areaIds.has(registration.area) || areaHomes.get(registration.area) !== registration.home) {
    throw new Error("Overworld opening registration is anchored outside its home town.");
  }
  const contact = world.characters.find((character) => character.id === registration.contact);
  if (!contact || contact.home !== registration.home || contact.area !== registration.area) {
    throw new Error(
      "Overworld opening registration contact must exist in its authored home and area.",
    );
  }
  if (contact.campaign_npc_id === undefined) {
    throw new Error("Overworld opening registration contact requires a campaign_npc_id.");
  }

  const charactersByCampaignNpcId = new Map(
    world.characters.flatMap((character) =>
      character.campaign_npc_id === undefined
        ? []
        : ([[character.campaign_npc_id, character]] as const),
    ),
  );
  for (const profile of registration.profiles) {
    if (
      profile.character.skills.length === 0 ||
      profile.character.values.length === 0 ||
      profile.character.equipment.length === 0 ||
      !profile.character.promises.some((promise) => promise.status === "active") ||
      profile.character.relationships.length < 2
    ) {
      throw new Error(
        `Opening registration profile "${profile.id}" must provide a skill, value, equipment package, obligation, registration-contact memory, and sponsor contact.`,
      );
    }
    if (
      !profile.character.relationships.some(
        (relationship) => relationship.npcId === contact.campaign_npc_id,
      )
    ) {
      throw new Error(
        `Opening registration profile "${profile.id}" does not bind the registration contact's relationship memory.`,
      );
    }
    for (const relationship of profile.character.relationships) {
      const boundCharacter = charactersByCampaignNpcId.get(relationship.npcId);
      if (!boundCharacter) {
        throw new Error(
          `Opening registration profile "${profile.id}" references unbound campaign npc "${relationship.npcId}".`,
        );
      }
      if (relationship.memories.length === 0) {
        throw new Error(
          `Opening registration profile "${profile.id}" has no authored memory for campaign npc "${relationship.npcId}".`,
        );
      }
      for (const memoryId of relationship.memories) {
        if (
          !(boundCharacter.variants ?? []).some((variant) =>
            variant.after_relationship_memories?.includes(memoryId),
          )
        ) {
          throw new Error(
            `Opening registration profile "${profile.id}" memory "${memoryId}" has no consuming contact variant.`,
          );
        }
      }
    }
    if (
      !profile.character.relationships.some(
        (relationship) => relationship.npcId !== contact.campaign_npc_id,
      )
    ) {
      throw new Error(
        `Opening registration profile "${profile.id}" requires a sponsor relationship distinct from the registration contact.`,
      );
    }
    for (const promise of profile.character.promises) {
      if (!charactersByCampaignNpcId.has(promise.recipientId)) {
        throw new Error(
          `Opening registration profile "${profile.id}" promises an unbound campaign npc "${promise.recipientId}".`,
        );
      }
    }
  }
}

function assertOpeningReliefOathIntegrity(world: OverworldManifest): void {
  const scene = world.opening_relief_oath;
  if (!scene) return;
  const registration = world.opening_registration;
  if (!registration || scene.after_registration !== registration.id) {
    throw new Error("Overworld opening relief oath must follow this world's registration.");
  }
  if (scene.home !== registration.home || scene.area !== registration.area) {
    throw new Error(
      "Overworld opening relief oath must share the registration's home and Civic area.",
    );
  }
  const contact = world.characters.find((character) => character.id === scene.contact);
  if (
    !contact ||
    contact.home !== scene.home ||
    contact.area !== scene.area ||
    contact.campaign_npc_id !== scene.clerk_npc_id
  ) {
    throw new Error(
      "Overworld opening relief oath contact must bind its named campaign clerk in the Civic area.",
    );
  }
  const quest = world.quests.find((candidate) => candidate.id === scene.target_quest);
  if (!quest || quest.home !== scene.home || !quest.campaign_exports?.length) {
    throw new Error(
      "Overworld opening relief oath must target an authored home-town quest with campaign exports.",
    );
  }

  for (const option of scene.options) {
    const knowledge = option.effects.find((effect) => effect.type === "learn_knowledge");
    const promise = option.effects.find((effect) => effect.type === "record_promise");
    const memory = option.effects.find((effect) => effect.type === "remember_relationship");
    if (!knowledge || !promise || !memory) {
      throw new Error(`Opening relief oath option "${option.id}" has an incomplete state package.`);
    }
    const imported = quest.campaign_imports?.rules.some(
      (rule) => rule.type === "knowledge_to_flag" && rule.knowledge_id === knowledge.knowledge_id,
    );
    if (!imported) {
      throw new Error(
        `Opening relief oath knowledge "${knowledge.knowledge_id}" has no target-quest import consumer.`,
      );
    }
    if (
      !(contact.variants ?? []).some((variant) =>
        variant.after_relationship_memories?.includes(memory.memory_id),
      )
    ) {
      throw new Error(
        `Opening relief oath memory "${memory.memory_id}" has no consuming clerk variant.`,
      );
    }
    const hasChoiceService = (world.campaign_service_rules ?? []).some((rule) =>
      (rule.requires_all_story_choices ?? []).some(
        (ref) => ref.story_choice_id === scene.id && ref.choice_id === option.id,
      ),
    );
    if (!hasChoiceService) {
      throw new Error(
        `Opening relief oath option "${option.id}" has no authored return-service consumer.`,
      );
    }

    for (const profile of registration.profiles) {
      const afterOath = applyOpeningReliefOathOption({
        scene,
        character: profile.character,
        optionId: option.id,
      }).characterAfter;
      for (const campaignExport of quest.campaign_exports) {
        const afterQuest = applyCampaignConsequences({
          character: afterOath,
          effects: overworldQuestCampaignEffectsForCharacter(campaignExport, afterOath),
        }).characterAfter;
        const resolved = afterQuest.promises.find(
          (candidate) => candidate.promiseId === promise.promise_id,
        );
        if (!resolved || resolved.status === "active") {
          throw new Error(
            `Opening relief oath target ending "${campaignExport.ending_id}" leaves promise "${promise.promise_id}" unresolved.`,
          );
        }
      }
    }
  }
}

function assertOpeningLeadSourceIntegrity(world: OverworldManifest): void {
  const scene = world.opening_lead_source;
  if (!scene) return;
  const registration = world.opening_registration;
  const oath = world.opening_relief_oath;
  if (!registration || scene.after_registration !== registration.id) {
    throw new Error("Overworld opening lead source must follow this world's opening registration.");
  }
  if (oath && oath.after_registration !== registration.id) {
    throw new Error("Overworld opening lead source has an invalid relief-oath predecessor.");
  }
  if (scene.home !== registration.home || scene.area !== registration.area) {
    throw new Error(
      "Overworld opening lead source must share the opening registration's home and area.",
    );
  }
  const quest = world.quests.find((candidate) => candidate.id === scene.target_quest);
  if (!quest || quest.home !== scene.home) {
    throw new Error(
      "Overworld opening lead source must target an authored quest in its home town.",
    );
  }
  const charactersByCampaignNpcId = new Map(
    world.characters.flatMap((character) =>
      character.campaign_npc_id === undefined
        ? []
        : ([[character.campaign_npc_id, character]] as const),
    ),
  );
  const learnedKnowledge = new Set<string>();
  let sponsoredOptionCount = 0;
  for (const option of scene.options) {
    const source = charactersByCampaignNpcId.get(option.source_npc_id);
    if (!source || source.home !== scene.home) {
      throw new Error(
        `Opening lead-source option "${option.id}" references an unbound Albany source npc.`,
      );
    }
    for (const effect of option.effects) {
      if (effect.type === "learn_knowledge") {
        if (learnedKnowledge.has(effect.knowledge_id)) {
          throw new Error(
            `Opening lead-source knowledge "${effect.knowledge_id}" is repeated across options.`,
          );
        }
        learnedKnowledge.add(effect.knowledge_id);
        const consumed = quest.campaign_imports?.rules.some(
          (rule) => rule.type === "knowledge_to_flag" && rule.knowledge_id === effect.knowledge_id,
        );
        if (!consumed) {
          throw new Error(
            `Opening lead-source knowledge "${effect.knowledge_id}" has no target-quest import consumer.`,
          );
        }
      }
      if (effect.type === "remember_relationship") {
        if (effect.npc_id !== option.source_npc_id) {
          throw new Error(
            `Opening lead-source option "${option.id}" remembers a different npc than its named source.`,
          );
        }
        if (
          !(source.variants ?? []).some((variant) =>
            variant.after_relationship_memories?.includes(effect.memory_id),
          )
        ) {
          throw new Error(
            `Opening lead-source memory "${effect.memory_id}" has no consuming contact variant.`,
          );
        }
      }
    }
    if (option.sponsor) {
      sponsoredOptionCount += 1;
      const sponsorMemoryExists = registration.profiles.some((profile) =>
        profile.character.relationships.some(
          (relationship) =>
            relationship.npcId === option.source_npc_id &&
            relationship.memories.includes(option.sponsor!.memory_id),
        ),
      );
      if (!sponsorMemoryExists) {
        throw new Error(
          `Opening lead-source option "${option.id}" has sponsor terms without a registration memory.`,
        );
      }
    }
    for (const profile of registration.profiles) {
      applyOpeningLeadSourceOption({
        scene,
        character: profile.character,
        optionId: option.id,
      });
    }
  }
  if (sponsoredOptionCount === 0) {
    throw new Error(
      "Overworld opening lead source must make at least one sponsor term mechanical.",
    );
  }
}

function assertOpeningPreparationIntegrity(world: OverworldManifest): void {
  const scene = world.opening_preparation;
  if (!scene) return;
  const leadSource = world.opening_lead_source;
  const registration = world.opening_registration;
  if (!leadSource || scene.after_lead_source !== leadSource.id) {
    throw new Error("Overworld opening preparation must follow this world's opening lead source.");
  }
  if (!registration) {
    throw new Error("Overworld opening preparation requires an opening registration.");
  }
  if (
    scene.home !== leadSource.home ||
    scene.area !== leadSource.area ||
    scene.target_quest !== leadSource.target_quest
  ) {
    throw new Error(
      "Overworld opening preparation must share its lead source's home, area, and target quest.",
    );
  }
  const quest = world.quests.find((candidate) => candidate.id === scene.target_quest);
  if (!quest || quest.home !== scene.home) {
    throw new Error(
      "Overworld opening preparation must target an authored quest in its home town.",
    );
  }
  const charactersByCampaignNpcId = new Map(
    world.characters.flatMap((character) =>
      character.campaign_npc_id === undefined
        ? []
        : ([[character.campaign_npc_id, character]] as const),
    ),
  );
  let sponsoredProfileCount = 0;
  for (const profile of scene.profiles) {
    const provider = charactersByCampaignNpcId.get(profile.provider_npc_id);
    if (!provider || provider.home !== scene.home) {
      throw new Error(
        `Opening preparation profile "${profile.id}" references an unbound Albany provider npc.`,
      );
    }
    for (const effect of profile.effects) {
      if (effect.type === "learn_knowledge") {
        const consumed = quest.campaign_imports?.rules.some(
          (rule) => rule.type === "knowledge_to_flag" && rule.knowledge_id === effect.knowledge_id,
        );
        if (!consumed) {
          throw new Error(
            `Opening preparation knowledge "${effect.knowledge_id}" has no target-quest import consumer.`,
          );
        }
      }
      if (effect.type === "remember_relationship") {
        if (effect.npc_id !== profile.provider_npc_id) {
          throw new Error(
            `Opening preparation profile "${profile.id}" remembers a different npc than its provider.`,
          );
        }
        if (
          !(provider.variants ?? []).some((variant) =>
            variant.after_relationship_memories?.includes(effect.memory_id),
          )
        ) {
          throw new Error(
            `Opening preparation memory "${effect.memory_id}" has no consuming contact variant.`,
          );
        }
      }
    }
    if (profile.sponsor) {
      sponsoredProfileCount += 1;
      const sponsorMemoryExists = registration.profiles.some((registrationProfile) =>
        registrationProfile.character.relationships.some(
          (relationship) =>
            relationship.npcId === profile.provider_npc_id &&
            relationship.memories.includes(profile.sponsor!.memory_id),
        ),
      );
      if (!sponsorMemoryExists) {
        throw new Error(
          `Opening preparation profile "${profile.id}" has sponsor terms without a registration memory.`,
        );
      }
    }
    for (const registrationProfile of registration.profiles) {
      for (const leadOption of leadSource.options) {
        const afterLeadSource = applyOpeningLeadSourceOption({
          scene: leadSource,
          character: registrationProfile.character,
          optionId: leadOption.id,
        }).characterAfter;
        applyOpeningPreparationProfile({
          scene,
          character: afterLeadSource,
          profileId: profile.id,
        });
      }
    }
  }
  if (sponsoredProfileCount === 0) {
    throw new Error(
      "Overworld opening preparation must make at least one sponsor term mechanical.",
    );
  }
}

function assertOpeningReliefAllocationIntegrity(world: OverworldManifest): void {
  const scene = world.opening_relief_allocation;
  if (!scene) return;
  const preparation = world.opening_preparation;
  const leadSource = world.opening_lead_source;
  const registration = world.opening_registration;
  if (!preparation || scene.after_preparation !== preparation.id) {
    throw new Error(
      "Overworld opening relief allocation must follow this world's opening preparation.",
    );
  }
  if (!leadSource || !registration) {
    throw new Error(
      "Overworld opening relief allocation requires the complete authored opening chain.",
    );
  }
  if (scene.home !== preparation.home || scene.target_quest !== preparation.target_quest) {
    throw new Error(
      "Overworld opening relief allocation must share its preparation's home and target quest.",
    );
  }
  const quest = world.quests.find((candidate) => candidate.id === scene.target_quest);
  if (!quest || quest.home !== scene.home || quest.area !== scene.area) {
    throw new Error(
      "Overworld opening relief allocation must occupy the target quest's authored departure area.",
    );
  }
  const charactersByCampaignNpcId = new Map(
    world.characters.flatMap((character) =>
      character.campaign_npc_id === undefined
        ? []
        : ([[character.campaign_npc_id, character]] as const),
    ),
  );
  for (const option of scene.options) {
    const provider = charactersByCampaignNpcId.get(option.provider_npc_id);
    if (!provider || provider.home !== scene.home) {
      throw new Error(
        `Opening relief allocation option "${option.id}" references an unbound Albany provider npc.`,
      );
    }
    for (const effect of option.effects) {
      if (effect.type === "learn_knowledge") {
        const consumed = quest.campaign_imports?.rules.some(
          (rule) => rule.type === "knowledge_to_flag" && rule.knowledge_id === effect.knowledge_id,
        );
        if (!consumed) {
          throw new Error(
            `Opening relief allocation knowledge "${effect.knowledge_id}" has no target-quest import consumer.`,
          );
        }
      }
      if (effect.type === "remember_relationship") {
        if (effect.npc_id !== option.provider_npc_id) {
          throw new Error(
            `Opening relief allocation option "${option.id}" remembers a different npc than its provider.`,
          );
        }
        if (
          !(provider.variants ?? []).some((variant) =>
            variant.after_relationship_memories?.includes(effect.memory_id),
          )
        ) {
          throw new Error(
            `Opening relief allocation memory "${effect.memory_id}" has no consuming contact variant.`,
          );
        }
      }
    }
    for (const registrationProfile of registration.profiles) {
      for (const leadOption of leadSource.options) {
        const afterLeadSource = applyOpeningLeadSourceOption({
          scene: leadSource,
          character: registrationProfile.character,
          optionId: leadOption.id,
        }).characterAfter;
        for (const preparationProfile of preparation.profiles) {
          const afterPreparation = applyOpeningPreparationProfile({
            scene: preparation,
            character: afterLeadSource,
            profileId: preparationProfile.id,
          }).characterAfter;
          applyOpeningReliefAllocationOption({
            scene,
            character: afterPreparation,
            optionId: option.id,
          });
        }
      }
    }
  }
}

function assertOpeningAllyIntegrity(world: OverworldManifest): void {
  const scene = world.opening_ally;
  if (!scene) return;
  const preparation = world.opening_preparation;
  const leadSource = world.opening_lead_source;
  const registration = world.opening_registration;
  const reliefOath = world.opening_relief_oath;
  if (!preparation || scene.after_preparation !== preparation.id) {
    throw new Error("Overworld opening ally must follow this world's opening preparation.");
  }
  if (!leadSource || !registration) {
    throw new Error("Overworld opening ally requires the complete authored opening chain.");
  }
  if (scene.home !== preparation.home || scene.target_quest !== preparation.target_quest) {
    throw new Error("Overworld opening ally must share its preparation's home and target quest.");
  }
  const quest = world.quests.find((candidate) => candidate.id === scene.target_quest);
  if (!quest || quest.home !== scene.home || quest.area !== scene.area) {
    throw new Error(
      "Overworld opening ally must occupy the target quest's authored departure area.",
    );
  }
  const contact = world.characters.find((character) => character.id === scene.contact);
  if (
    !contact ||
    contact.home !== scene.home ||
    contact.area !== scene.area ||
    contact.campaign_npc_id !== scene.ally_npc_id
  ) {
    throw new Error(
      "Overworld opening ally contact must bind the named campaign ally in its departure area.",
    );
  }
  const importsAlly = quest.campaign_imports?.rules.some(
    (rule) => rule.type === "companion_to_flag" && rule.companion_id === scene.ally_npc_id,
  );
  if (!importsAlly) {
    throw new Error(
      `Overworld opening ally "${scene.id}" has no target-quest companion import consumer.`,
    );
  }
  if (!quest.campaign_exports?.length) {
    throw new Error(
      `Overworld opening ally "${scene.id}" requires target-quest campaign exports for every ending.`,
    );
  }
  const reachableAllyCharacters: Array<{
    optionId: string;
    character: CampaignCharacterState;
  }> = [];
  const fieldCommitmentsByOption = new Map(
    scene.options.map((option) => [
      option.id,
      {
        promiseIds: option.effects.flatMap((effect) =>
          effect.type === "record_promise" ? [effect.promise_id] : [],
        ),
        companionIds: option.effects.flatMap((effect) =>
          effect.type === "add_companion" ? [effect.npc_id] : [],
        ),
      },
    ]),
  );
  for (const option of scene.options) {
    for (const effect of option.effects) {
      if (
        effect.type === "remember_relationship" &&
        !(contact.variants ?? []).some((variant) =>
          variant.after_relationship_memories?.includes(effect.memory_id),
        )
      ) {
        throw new Error(
          `Opening ally memory "${effect.memory_id}" has no consuming contact variant.`,
        );
      }
    }
    for (const registrationProfile of registration.profiles) {
      const oathOptions = reliefOath ? reliefOath.options : [null];
      for (const oathOption of oathOptions) {
        const afterOath =
          reliefOath && oathOption
            ? applyOpeningReliefOathOption({
                scene: reliefOath,
                character: registrationProfile.character,
                optionId: oathOption.id,
              }).characterAfter
            : registrationProfile.character;
        for (const leadOption of leadSource.options) {
          const afterLeadSource = applyOpeningLeadSourceOption({
            scene: leadSource,
            character: afterOath,
            optionId: leadOption.id,
          }).characterAfter;
          for (const preparationProfile of preparation.profiles) {
            const afterPreparation = applyOpeningPreparationProfile({
              scene: preparation,
              character: afterLeadSource,
              profileId: preparationProfile.id,
            }).characterAfter;
            const afterAlly = applyOpeningAllyOption({
              scene,
              character: afterPreparation,
              optionId: option.id,
            }).characterAfter;
            reachableAllyCharacters.push({ optionId: option.id, character: afterAlly });
          }
        }
      }
    }
  }
  for (const campaignExport of quest.campaign_exports ?? []) {
    for (const group of campaignExport.conditional_effects ?? []) {
      if (
        !reachableAllyCharacters.some(({ character }) =>
          campaignCharacterMatchesConditions(character, group.when),
        )
      ) {
        throw new Error(
          `Opening ally target quest conditional effect group "${group.id}" is unreachable from every authored opening state.`,
        );
      }
    }
    for (const reachable of reachableAllyCharacters) {
      const applied = applyCampaignConsequences({
        character: reachable.character,
        effects: overworldQuestCampaignEffectsForCharacter(campaignExport, reachable.character),
      });
      const commitment = fieldCommitmentsByOption.get(reachable.optionId);
      for (const promiseId of commitment?.promiseIds ?? []) {
        const before = reachable.character.promises.find(
          (promise) => promise.promiseId === promiseId,
        );
        if (before?.status !== "active") continue;
        const after = applied.characterAfter.promises.find(
          (promise) => promise.promiseId === promiseId,
        );
        if (!after || after.status === "active") {
          throw new Error(
            `Opening ally target quest campaign export "${campaignExport.ending_id}" leaves field promise "${promiseId}" unresolved.`,
          );
        }
        if (
          after.status === "broken" &&
          (commitment?.companionIds ?? []).some((companionId) =>
            applied.characterAfter.companions.includes(companionId),
          )
        ) {
          throw new Error(
            `Opening ally target quest campaign export "${campaignExport.ending_id}" breaks field promise "${promiseId}" without releasing its companion.`,
          );
        }
        if (
          after.status === "kept" &&
          (commitment?.companionIds ?? []).some(
            (companionId) => !applied.characterAfter.companions.includes(companionId),
          )
        ) {
          throw new Error(
            `Opening ally target quest campaign export "${campaignExport.ending_id}" keeps field promise "${promiseId}" without retaining its companion.`,
          );
        }
      }
    }
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
  const seenLaunchIds = new Set<string>();
  const seenLaunchOptionIds = new Set<string>();
  const campaignNpcIds = new Set(
    world.characters.flatMap((character) =>
      character.campaign_npc_id ? [character.campaign_npc_id] : [],
    ),
  );
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

    if (quest.campaign_imports !== undefined) {
      CampaignCharacterImportsSchema.parse(quest.campaign_imports);
    }

    if (quest.launch !== undefined) {
      if (seenLaunchIds.has(quest.launch.id)) {
        throw new Error(`Duplicate overworld quest launch id "${quest.launch.id}".`);
      }
      seenLaunchIds.add(quest.launch.id);
      const importRules = quest.campaign_imports?.rules ?? [];
      for (const option of quest.launch.options) {
        if (seenLaunchOptionIds.has(option.id)) {
          throw new Error(`Duplicate overworld quest launch option id "${option.id}".`);
        }
        seenLaunchOptionIds.add(option.id);
        const knowledge = option.effects.find((effect) => effect.type === "learn_knowledge");
        const matchingImports = knowledge
          ? importRules.filter(
              (rule) =>
                rule.type === "knowledge_to_flag" && rule.knowledge_id === knowledge.knowledge_id,
            )
          : [];
        if (matchingImports.length !== 1) {
          throw new Error(
            `Overworld quest "${quest.id}" launch option "${option.id}" must map its approach knowledge to exactly one campaign knowledge-to-flag import.`,
          );
        }
        for (const effect of option.effects) {
          if (effect.type === "remember_relationship" && !campaignNpcIds.has(effect.npc_id)) {
            throw new Error(
              `Overworld quest "${quest.id}" launch option "${option.id}" remembers unknown campaign npc "${effect.npc_id}".`,
            );
          }
        }
      }
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

type CanonicalCampaignServiceIntegrityState = Readonly<{
  character: CampaignCharacterState;
  worldFactIds: readonly string[];
  selectedStoryChoices: readonly Readonly<{
    story_choice_id: string;
    choice_id: string;
  }>[];
}>;

function canonicalCampaignServiceIntegrityStateKey(
  state: CanonicalCampaignServiceIntegrityState,
): string {
  return JSON.stringify({
    companions: [...state.character.companions].sort(),
    promises: state.character.promises
      .map((promise) => `${promise.promiseId}\u0000${promise.status}`)
      .sort(),
    worldFactIds: [...state.worldFactIds].sort(),
    selectedStoryChoices: state.selectedStoryChoices
      .map((choice) => `${choice.story_choice_id}\u0000${choice.choice_id}`)
      .sort(),
  });
}

function canonicalOpeningAllyCampaignServiceStates(world: OverworldManifest): Readonly<{
  states: readonly CanonicalCampaignServiceIntegrityState[];
  targetQuestWorldFactIds: ReadonlySet<string>;
  allyNpcId: string;
  allyPromiseIds: ReadonlySet<string>;
}> | null {
  const ally = world.opening_ally;
  const reliefOath = world.opening_relief_oath;
  const reliefAllocation = world.opening_relief_allocation;
  const preparation = world.opening_preparation;
  const leadSource = world.opening_lead_source;
  const registration = world.opening_registration;
  const targetQuest = ally
    ? world.quests.find((quest) => quest.id === ally.target_quest)
    : undefined;
  if (!ally || !preparation || !leadSource || !registration || !targetQuest) return null;

  const targetQuestWorldFactIds = new Set(
    (targetQuest.campaign_exports ?? []).flatMap((campaignExport) =>
      [
        ...campaignExport.effects,
        ...(campaignExport.conditional_effects ?? []).flatMap((group) => group.effects),
      ].flatMap((effect) => (effect.type === "set_world_fact" ? [effect.fact_id] : [])),
    ),
  );
  const allyPromiseIds = new Set(
    [...ally.options, ...(reliefOath?.options ?? [])].flatMap((option) =>
      option.effects.flatMap((effect) =>
        effect.type === "record_promise" ? [effect.promise_id] : [],
      ),
    ),
  );
  const statesByKey = new Map<string, CanonicalCampaignServiceIntegrityState>();
  const rememberState = (state: CanonicalCampaignServiceIntegrityState): void => {
    statesByKey.set(canonicalCampaignServiceIntegrityStateKey(state), state);
  };

  for (const registrationProfile of registration.profiles) {
    const oathOptions = reliefOath ? reliefOath.options : [null];
    for (const oathOption of oathOptions) {
      const afterOath =
        reliefOath && oathOption
          ? applyOpeningReliefOathOption({
              scene: reliefOath,
              character: registrationProfile.character,
              optionId: oathOption.id,
            }).characterAfter
          : registrationProfile.character;
      for (const leadOption of leadSource.options) {
        const afterLeadSource = applyOpeningLeadSourceOption({
          scene: leadSource,
          character: afterOath,
          optionId: leadOption.id,
        }).characterAfter;
        for (const preparationProfile of preparation.profiles) {
          const afterPreparation = applyOpeningPreparationProfile({
            scene: preparation,
            character: afterLeadSource,
            profileId: preparationProfile.id,
          }).characterAfter;
          const allocationOptions = reliefAllocation ? reliefAllocation.options : [null];
          for (const allocationOption of allocationOptions) {
            const afterAllocation =
              reliefAllocation && allocationOption
                ? applyOpeningReliefAllocationOption({
                    scene: reliefAllocation,
                    character: afterPreparation,
                    optionId: allocationOption.id,
                  }).characterAfter
                : afterPreparation;
            for (const allyOption of ally.options) {
              const beforeQuest = applyOpeningAllyOption({
                scene: ally,
                character: afterAllocation,
                optionId: allyOption.id,
              }).characterAfter;
              const openingStoryChoices = [
                ...(reliefOath && oathOption
                  ? [{ story_choice_id: reliefOath.id, choice_id: oathOption.id }]
                  : []),
                { story_choice_id: preparation.id, choice_id: preparationProfile.id },
                ...(reliefAllocation && allocationOption
                  ? [
                      {
                        story_choice_id: reliefAllocation.id,
                        choice_id: allocationOption.id,
                      },
                    ]
                  : []),
                { story_choice_id: ally.id, choice_id: allyOption.id },
              ];
              rememberState({
                character: beforeQuest,
                worldFactIds: [],
                selectedStoryChoices: openingStoryChoices,
              });

              for (const campaignExport of targetQuest.campaign_exports ?? []) {
                const applied = applyCampaignConsequences({
                  character: beforeQuest,
                  effects: overworldQuestCampaignEffectsForCharacter(campaignExport, beforeQuest),
                });
                const afterQuest: CanonicalCampaignServiceIntegrityState = {
                  character: applied.characterAfter,
                  worldFactIds: applied.worldFactIds,
                  selectedStoryChoices: openingStoryChoices,
                };
                rememberState(afterQuest);
                for (const dawnChoiceId of ALBANY_DAWN_DISPATCH_CHOICE_IDS) {
                  rememberState({
                    ...afterQuest,
                    selectedStoryChoices: [
                      ...openingStoryChoices,
                      {
                        story_choice_id: ALBANY_DAWN_DISPATCH_ID,
                        choice_id: dawnChoiceId,
                      },
                    ],
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  return {
    states: [...statesByKey.values()],
    targetQuestWorldFactIds,
    allyNpcId: ally.ally_npc_id,
    allyPromiseIds,
  };
}

function assertCampaignServiceRulesIntegrity(
  world: OverworldManifest,
  nodes: Map<string, OverworldNode>,
  regionNames: ReadonlySet<string>,
  areaIds: Set<string>,
  areaHomes: Map<string, string>,
): void {
  const rules = CampaignServiceRulesSchema.parse(world.campaign_service_rules ?? []);
  const authoredWorldFactIds = new Set(
    world.quests.flatMap((quest) =>
      (quest.campaign_exports ?? []).flatMap((campaignExport) =>
        campaignExport.effects.flatMap((effect) =>
          effect.type === "set_world_fact" ? [effect.fact_id] : [],
        ),
      ),
    ),
  );

  for (const rule of rules) {
    if (!nodes.has(rule.home)) {
      throw new Error(`Campaign service rule "${rule.id}" has missing home node "${rule.home}".`);
    }
    if (!areaIds.has(rule.area)) {
      throw new Error(`Campaign service rule "${rule.id}" has missing area "${rule.area}".`);
    }
    if (areaHomes.get(rule.area) !== rule.home) {
      throw new Error(`Campaign service rule "${rule.id}" is anchored outside its home town.`);
    }
    if (rule.requires_region_renown && !regionNames.has(rule.requires_region_renown.region)) {
      throw new Error(
        `Campaign service rule "${rule.id}" references unknown renown region "${rule.requires_region_renown.region}".`,
      );
    }
    for (const factId of [
      ...(rule.requires_all_world_facts ?? []),
      ...(rule.forbids_any_world_facts ?? []),
    ]) {
      if (!authoredWorldFactIds.has(factId)) {
        throw new Error(
          `Campaign service rule "${rule.id}" references unauthored world fact "${factId}".`,
        );
      }
    }
    for (const ref of [
      ...(rule.requires_all_story_choices ?? []),
      ...(rule.forbids_any_story_choices ?? []),
    ]) {
      const preparationProfile =
        world.opening_preparation?.id === ref.story_choice_id
          ? world.opening_preparation.profiles.find((profile) => profile.id === ref.choice_id)
          : undefined;
      const allyOption =
        world.opening_ally?.id === ref.story_choice_id
          ? world.opening_ally.options.find((option) => option.id === ref.choice_id)
          : undefined;
      const reliefAllocationOption =
        world.opening_relief_allocation?.id === ref.story_choice_id
          ? world.opening_relief_allocation.options.find((option) => option.id === ref.choice_id)
          : undefined;
      const reliefOathOption =
        world.opening_relief_oath?.id === ref.story_choice_id
          ? world.opening_relief_oath.options.find((option) => option.id === ref.choice_id)
          : undefined;
      try {
        if (!preparationProfile && !allyOption && !reliefAllocationOption && !reliefOathOption) {
          journeyCampaignStoryChoiceSelection(ref.story_choice_id, ref.choice_id);
        }
      } catch {
        throw new Error(
          `Campaign service rule "${rule.id}" references unauthored story choice "${ref.story_choice_id}:${ref.choice_id}".`,
        );
      }
    }
    for (const companionId of rule.requires_all_companions ?? []) {
      if (
        world.opening_ally?.ally_npc_id !== companionId ||
        !world.opening_ally.options.some((option) =>
          option.effects.some(
            (effect) => effect.type === "add_companion" && effect.npc_id === companionId,
          ),
        )
      ) {
        throw new Error(
          `Campaign service rule "${rule.id}" references unauthored companion "${companionId}".`,
        );
      }
    }
    for (const promise of rule.requires_all_promises ?? []) {
      if (
        ![
          ...(world.opening_ally?.options ?? []),
          ...(world.opening_relief_oath?.options ?? []),
        ].some((option) =>
          option.effects.some(
            (effect) =>
              effect.type === "record_promise" && effect.promise_id === promise.promise_id,
          ),
        )
      ) {
        throw new Error(
          `Campaign service rule "${rule.id}" references unauthored promise "${promise.promise_id}".`,
        );
      }
    }
    if (rule.provider_character_id) {
      const provider = world.characters.find(
        (character) => character.id === rule.provider_character_id,
      );
      if (!provider) {
        throw new Error(
          `Campaign service rule "${rule.id}" references missing provider "${rule.provider_character_id}".`,
        );
      }
      if (provider.home !== rule.home || provider.area !== rule.area) {
        throw new Error(
          `Campaign service rule "${rule.id}" provider "${provider.id}" is outside its home town or area.`,
        );
      }
    }
  }

  const bounded = canonicalOpeningAllyCampaignServiceStates(world);
  if (!bounded) return;
  const locations = new Map<string, { home: string; area: string; rules: CampaignServiceRule[] }>();
  for (const rule of rules) {
    const key = `${rule.home}\u0000${rule.area}`;
    const location = locations.get(key);
    if (location) {
      location.rules.push(rule);
    } else {
      locations.set(key, { home: rule.home, area: rule.area, rules: [rule] });
    }
  }
  const canonicallyReachableRuleIds = new Set<string>();
  const maximumRequiredRenownByRegion = new Map<string, number>();
  for (const rule of rules) {
    const requirement = rule.requires_region_renown;
    if (!requirement) continue;
    maximumRequiredRenownByRegion.set(
      requirement.region,
      Math.max(maximumRequiredRenownByRegion.get(requirement.region) ?? 0, requirement.at_least),
    );
  }
  for (const state of bounded.states) {
    for (const location of locations.values()) {
      const activeRules = resolveParsedActiveCampaignServiceRules({
        rules: location.rules,
        currentTownId: location.home,
        currentAreaId: location.area,
        worldFactIds: state.worldFactIds,
        selectedStoryChoices: state.selectedStoryChoices,
        consumedRuleIds: [],
        character: state.character,
        regionRenown: maximumRequiredRenownByRegion,
      });
      activeRules.forEach((rule) => canonicallyReachableRuleIds.add(rule.id));
    }
  }

  for (const rule of rules) {
    const hasAllyCondition =
      (rule.requires_all_companions ?? []).includes(bounded.allyNpcId) ||
      (rule.requires_all_promises ?? []).some((promise) =>
        bounded.allyPromiseIds.has(promise.promise_id),
      );
    const requiredFactsAreBounded = (rule.requires_all_world_facts ?? []).every((factId) =>
      bounded.targetQuestWorldFactIds.has(factId),
    );
    if (hasAllyCondition && requiredFactsAreBounded && !canonicallyReachableRuleIds.has(rule.id)) {
      throw new Error(
        `Campaign service rule "${rule.id}" has opening promise or companion conditions unreachable in every canonical pre-Wolf and post-Wolf target state.`,
      );
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

  assertOpeningRegistrationIntegrity(world, nodes, areaIds, areaHomes);

  assertOpeningReliefOathIntegrity(world);

  assertOpeningLeadSourceIntegrity(world);

  assertOpeningPreparationIntegrity(world);
  assertQuestsIntegrity(world, nodes, areaIds, areaHomes);
  assertOpeningReliefAllocationIntegrity(world);
  assertOpeningAllyIntegrity(world);

  assertExplorationSitesIntegrity(world, nodes, regionNames, areaIds, areaHomes);

  assertCampaignServiceRulesIntegrity(world, nodes, regionNames, areaIds, areaHomes);

  assertGraphConnectivity(world);
}
