import type { OverworldPendingRoadEncounter, TravelLogEntry } from "./session_snapshot.js";
import type { OverworldSessionRoutePlan } from "./session_routes.js";
import type { OverworldView } from "./session_view.js";
import type { OverworldRoadEncounterOption } from "./travel_mechanics.js";
import { compactText } from "../core/compact_text.js";
import type { CampaignCharacterView } from "./campaign_character_view.js";
import type { CampaignServiceOffer } from "./campaign_service_rules.js";
import type { OverworldQuestLaunchView } from "./quest_launch.js";
import type { OverworldLocalEvent, OverworldLocalJob } from "./overworld.js";
import {
  compactOverworldRoadEncounterNextAction,
  type OverworldCompactRoadEncounterNextAction,
} from "./session_road_next_action.js";
import {
  compactOverworldDepartureInteractions,
  type OverworldCompactDepartureInteraction,
} from "./session_departure_interactions.js";
import type { JourneyOpportunityPresentation } from "./journey_contract.js";

export const OVERWORLD_COMPACT_JOURNAL_LIMIT = 5;
export const OVERWORLD_COMPACT_ROUTE_LIMIT = 8;
export const OVERWORLD_COMPACT_ROUTE_STEP_LIMIT = 12;
export const OVERWORLD_COMPACT_MOVEMENT_LIMIT = 12;
export const OVERWORLD_COMPACT_TRAVEL_LOG_LIMIT = 5;
export const OVERWORLD_COMPACT_ID_LIST_LIMIT = 16;
export const OVERWORLD_COMPACT_LOCAL_REF_LIMIT = 12;
export const OVERWORLD_COMPACT_OPPORTUNITY_LEAD_LIMIT = 8;
export const OVERWORLD_COMPACT_RENOWN_LIMIT = 16;
export const OVERWORLD_COMPACT_COMPLETED_ARC_LIMIT = 16;
export const OVERWORLD_COMPACT_CHARACTER_ENTRY_LIMIT = 8;
export const OVERWORLD_COMPACT_CHARACTER_MEMORY_LIMIT = 4;
export const OVERWORLD_COMPACT_LABEL_CHAR_LIMIT = 96;
export const OVERWORLD_COMPACT_TITLE_CHAR_LIMIT = 140;
export const OVERWORLD_COMPACT_RISK_CHAR_LIMIT = 160;
export const OVERWORLD_COMPACT_ROAD_EVENT_SUMMARY_CHAR_LIMIT = 240;
export const OVERWORLD_COMPACT_SERVICE_SUMMARY_CHAR_LIMIT = 240;
export const OVERWORLD_COMPACT_VIEW_VERSION = 25 as const;

export type OverworldCompactRef = readonly [id: string, name: string];
export type OverworldCompactOpportunityLead = readonly [
  kind: "event" | "job",
  rootId: string,
  title: string,
  district: string,
  access: "here" | "mapped" | "route_unmapped",
];
export type OverworldCompactEventSceneOption = readonly [
  optionId: string,
  title: string,
  minutes: number,
  renown: number,
  preview: string,
  consequence: string,
];
export type OverworldCompactEventScene = readonly [
  eventId: string,
  sceneId: string,
  prompt: string,
  requiredPoiId: string,
  requiredContactId: string,
  requiredQuestIds: readonly string[],
  forbiddenQuestIds: readonly string[],
  options: readonly OverworldCompactEventSceneOption[],
];
export type OverworldCompactEventChoice = readonly [eventId: string, optionId: string];
export type OverworldCompactJobLeadRef = readonly [id: string, title: string, areaId: string];
export type OverworldCompactJobSceneOption = readonly [
  optionId: string,
  title: string,
  minutes: number,
  renown: number,
  preview: string,
  consequence: string,
];
export type OverworldCompactJobScene = readonly [
  jobId: string,
  sceneId: string,
  prompt: string,
  requiredPoiId: string,
  requiredContactId: string,
  requiredQuestIds: readonly string[],
  options: readonly OverworldCompactJobSceneOption[],
];
export type OverworldCompactJobChoice = readonly [jobId: string, optionId: string];
export type OverworldCompactQuestLaunchOption = readonly [
  id: string,
  title: string,
  minutes: number,
  suppliesCost: number,
  fatigueGained: number,
  available: boolean | null,
  minutesAfter: number | null,
  suppliesAfter: number | null,
  fatigueAfter: number | null,
  conditionAfter: string | null,
  blockedReason: string | null,
  preview: string,
  consequence: string,
];
export type OverworldCompactQuestLaunch = readonly [
  id: string,
  prompt: string,
  options: readonly OverworldCompactQuestLaunchOption[],
  selectedOptionId: string | null,
];
export type OverworldCompactQuestRef =
  | readonly [id: string, title: string, areaId: string]
  | readonly [id: string, title: string, areaId: string, launch: OverworldCompactQuestLaunch];
export type OverworldCompactQuestStart = readonly [questId: string, approachId: string | null];
export type OverworldCompactServiceOffer = readonly [
  id: string,
  action: CampaignServiceOffer["action"],
  title: string,
  summary: string,
  minutes: number,
];
export type OverworldCompactHere = readonly [
  id: string,
  name: string,
  region: string,
  areaId: string | null,
  areaName: string | null,
];
export type OverworldCompactVitals = readonly [
  supplies: number,
  maxSupplies: number,
  fatigue: number,
  condition: string,
];
export type OverworldCompactHiddenCounts = readonly [
  areas: number,
  jobs: number,
  sites: number,
  quests: number,
];
export type OverworldCompactProgress = readonly [visited: number, total: number];
export type OverworldCompactRoad = readonly [
  toId: string,
  minutes: number,
  suppliesNeeded: number,
  fatigueAfter: number,
];
export type OverworldCompactAreaRoute = readonly [
  routeId: string,
  toAreaId: string,
  minutes: number,
];
export type OverworldCompactRouteOption = readonly [
  toId: string,
  elapsedMinutes: number,
  suppliesNeeded: number,
  fatigueAfter: number,
  roadIds: readonly string[],
];
export type OverworldCompactRoadEncounterOption = readonly [
  strategy: OverworldRoadEncounterOption["strategy"],
  label: string,
  minutes: number,
  suppliesCost: number,
  fatigueGained: number,
  renownGained: number,
];
export type OverworldCompactRoadEncounter = {
  id: string;
  edge: string;
  route: string;
  where: readonly [from: string, to: string, at: string];
  event: readonly [id: string, risk: string, title: string, summary: string];
  options: readonly OverworldCompactRoadEncounterOption[];
  next_action: OverworldCompactRoadEncounterNextAction;
};
export type OverworldCompactJournalEntry = readonly [
  kind: string,
  title: string,
  recordedAt: string,
];
export type OverworldCompactRenownEntry = readonly [region: string, value: number];
export type OverworldCompactTravelLogEntry = readonly [
  edgeId: string,
  fromId: string,
  toId: string,
  minutes: number,
  suppliesUsed: number,
  fatigueGained: number,
  roadEventId: string | null,
];
export type OverworldCompactIdKey =
  | "discovered_towns"
  | "discovered_areas"
  | "visited_areas"
  | "discovered_jobs"
  | "completed_jobs"
  | "discovered_sites"
  | "explored_sites"
  | "discovered_quests"
  | "started_quests"
  | "completed_quests"
  | "resolved_events";

export type OverworldCompactLocalRefKey =
  | "areas"
  | "poi"
  | "contacts"
  | "events"
  | "jobs"
  | "remembered_jobs"
  | "sites"
  | "quests";

const OVERWORLD_COMPACT_LOCAL_REF_KEYS: readonly OverworldCompactLocalRefKey[] = [
  "areas",
  "poi",
  "contacts",
  "events",
  "jobs",
  "remembered_jobs",
  "sites",
  "quests",
];

const OVERWORLD_COMPACT_ID_KEYS: readonly OverworldCompactIdKey[] = [
  "discovered_towns",
  "discovered_areas",
  "visited_areas",
  "discovered_jobs",
  "completed_jobs",
  "discovered_sites",
  "explored_sites",
  "discovered_quests",
  "started_quests",
  "completed_quests",
  "resolved_events",
];

export type OverworldCompactFullIdMap = Record<OverworldCompactIdKey, string[]>;
export type OverworldCompactIdMap = Partial<OverworldCompactFullIdMap>;
export type OverworldCompactIdBucket = {
  ids: readonly string[];
  count: number;
};
export type OverworldCompactIdBuckets = Record<OverworldCompactIdKey, OverworldCompactIdBucket>;
export type OverworldCompactIdCounts = readonly [
  discovered_towns: number,
  discovered_areas: number,
  visited_areas: number,
  discovered_jobs: number,
  completed_jobs: number,
  discovered_sites: number,
  explored_sites: number,
  discovered_quests: number,
  started_quests: number,
  completed_quests: number,
  resolved_events: number,
];
export type OverworldCompactIdTruncation = OverworldCompactIdKey[];
export type OverworldCompactLocalRefTruncation = OverworldCompactLocalRefKey[];
export type OverworldCompactLocalRefCounts = Record<OverworldCompactLocalRefKey, number>;
export type OverworldCompactIdPayload = {
  ids: OverworldCompactIdMap;
  id_counts: OverworldCompactIdCounts;
  ids_truncated?: OverworldCompactIdTruncation;
};

export type OverworldCompactCampaignCharacterCount = readonly [
  skills: number,
  values: number,
  wounds: number,
  equipment: number,
  abilities: number,
  knowledge: number,
  promises: number,
  companions: number,
  crimes: number,
  relationships: number,
  factionStanding: number,
];

export type OverworldCompactCampaignCharacterTruncation =
  | "skills"
  | "values"
  | "wounds"
  | "equipment"
  | "abilities"
  | "knowledge"
  | "promises"
  | "companions"
  | "crimes"
  | "relationships"
  | "relationship_memories"
  | "faction_standing";

export type OverworldCompactCampaignCharacter = readonly [
  background: string | null,
  health: readonly [current: number, max: number],
  money: number,
  skills: readonly (readonly [skillId: string, rank: number])[],
  values: readonly (readonly [valueId: string, strength: number])[],
  wounds: readonly (readonly [woundId: string, severity: number, treatment: string])[],
  equipment: readonly (readonly [
    equipmentId: string,
    itemId: string,
    quantity: number,
    condition: number,
    equipped: boolean,
  ])[],
  abilities: readonly string[],
  knowledge: readonly string[],
  promises: readonly (readonly [promiseId: string, recipientId: string, status: string])[],
  companions: readonly string[],
  crimes: readonly (readonly [
    crimeId: string,
    jurisdictionId: string,
    severity: number,
    status: string,
  ])[],
  relationships: readonly (readonly [
    npcId: string,
    trust: string,
    regard: string,
    owesPlayer: number,
    playerOwes: number,
    memoryCount: number,
    memories: readonly string[],
  ])[],
  factionStanding: readonly (readonly [factionId: string, standing: string])[],
  counts: OverworldCompactCampaignCharacterCount,
  truncated?: readonly OverworldCompactCampaignCharacterTruncation[],
];

export type OverworldCompactView = {
  v: typeof OVERWORLD_COMPACT_VIEW_VERSION;
  character: OverworldCompactCampaignCharacter;
  world: string;
  time: string;
  here: OverworldCompactHere;
  vitals: OverworldCompactVitals;
  service_offers?: OverworldCompactServiceOffer[];
  departure_interactions?: OverworldCompactDepartureInteraction[];
  opportunity_guidance?: string;
  opportunity_leads?: OverworldCompactOpportunityLead[];
  opportunity_leads_truncated?: true;
  hidden: OverworldCompactHiddenCounts;
  roads: OverworldCompactRoad[];
  roads_truncated?: true;
  area_routes?: OverworldCompactAreaRoute[];
  area_routes_truncated?: true;
  route_options: OverworldCompactRouteOption[];
  route_options_truncated?: true;
  route_paths_truncated?: true;
  areas: OverworldCompactRef[];
  poi: OverworldCompactRef[];
  contacts: OverworldCompactRef[];
  events: OverworldCompactRef[];
  event_scenes?: OverworldCompactEventScene[];
  event_choices?: OverworldCompactEventChoice[];
  local_refs_truncated?: OverworldCompactLocalRefTruncation;
  jobs?: OverworldCompactRef[];
  job_scenes?: OverworldCompactJobScene[];
  job_choices?: OverworldCompactJobChoice[];
  remembered_jobs?: OverworldCompactJobLeadRef[];
  sites?: OverworldCompactRef[];
  quests?: OverworldCompactQuestRef[];
  quest_starts?: OverworldCompactQuestStart[];
  pending_road?: OverworldCompactRoadEncounter;
  journal?: OverworldCompactJournalEntry[];
  travel_log?: OverworldCompactTravelLogEntry[];
  travel_log_truncated?: true;
  progress: OverworldCompactProgress;
  renown?: OverworldCompactRenownEntry[];
  renown_truncated?: true;
  completed_arcs?: string[];
  completed_arcs_truncated?: true;
  id_counts: OverworldCompactIdCounts;
  ids_truncated?: OverworldCompactIdTruncation;
  ids: OverworldCompactIdMap;
};

/**
 * Agent-facing legend for the positional encodings above. Co-located with the
 * encoders in this file so the two cannot drift: the `satisfies` clause forces an
 * entry for every OverworldCompactView field, and tests/unit/compact_legend.test.ts
 * asserts emitted contexts stay covered. Sent ONCE per session (start_overworld /
 * restore_overworld_session), never repeated in per-action payloads.
 */
export const OVERWORLD_COMPACT_LEGEND = {
  v: "compact context schema version",
  character:
    "[background, [health_current, health_max], money, [[skill_id, rank]], [[value_id, strength]], [[wound_id, severity, treatment]], [[equipment_id, item_id, quantity, condition_0to100, equipped]], [ability_id], [knowledge_id], [[promise_id, recipient_id, status]], [companion_npc_id], [[crime_id, jurisdiction_id, severity, status]], [[npc_id, trust_tier, regard_tier, owes_player, player_owes, known_memory_count, [known_memory]]], [[faction_id, standing_tier]], [skills_count, values_count, wounds_count, equipment_count, abilities_count, knowledge_count, promises_count, companions_count, crimes_count, relationships_count, faction_standing_count], [truncated_category]?] persistent player character; lists cap at 8 and visible relationship memories at 4, counts are uncapped totals, optional truncation categories identify omitted entries, and tiers hide numeric disposition",
  world: "world name (include_world_name only)",
  time: "in-game clock 'Day N, HH:MM'",
  here: "[town_id, town_name, region_name, area_id|null, area_name|null] current location; when pending_road exists this is the on-route id/name instead of a town",
  vitals: "[supplies, max_supplies, fatigue_0to100, condition_label] travel readiness",
  service_offers:
    "[[offer_id, action, title, terms_summary, minutes], ...] current one-time service terms; use the normal rest or resupply action named by action to accept that offer",
  departure_interactions:
    "[[story_choice_id, kind, title], ...] optional Station departure interactions; inspect with inspect_overworld_session_story(story_choice_id), then choose one id from story.options[*].id with choose_overworld_session_story(story_choice_id, choice), or depart without choosing",
  opportunity_guidance:
    "player-facing pursuit guidance for opportunity_leads; shown beside those leads on every compact response where they exist",
  opportunity_leads:
    "[[kind, root_id, title, district, access], ...] optional authored aftermath; access is here|mapped|route_unmapped, leads do not create, replace, or activate a journey objective, and no choices, rewards, or outcomes are disclosed",
  opportunity_leads_truncated: "true when more optional aftermath leads exist than listed",
  hidden:
    "[areas, jobs, sites, quests] counts not currently listed at this town; jobs include undiscovered jobs plus discovered, incomplete authored job scenes with no legal options currently available. Scout, talk, or explore can reveal more.",
  roads:
    "[[dest_town_id, est_minutes_incl_delays, supplies_needed, fatigue_0to100_on_arrival], ...] direct roads from here",
  roads_truncated: "true when more roads exist than listed",
  area_routes:
    "[[area_route_id, dest_area_id, minutes], ...] walking routes for move_overworld_session_area",
  area_routes_truncated: "true when more area routes exist than listed",
  route_options:
    "[[dest_town_id, est_minutes, supplies_needed, fatigue_0to100_on_arrival, [road_id, ...]], ...] multi-leg plans (include_route_options only)",
  route_options_truncated: "true when more route options exist than listed",
  route_paths_truncated: "true when a route's road_id list was capped",
  areas: "[[area_id, name], ...] known local areas (explore_overworld_session_area)",
  poi: "[[poi_id, title], ...] points of interest (scout_overworld_session_poi)",
  contacts: "[[character_id, name], ...] people here (talk_overworld_session_contact)",
  events: "[[event_id, title], ...] local events (investigate/resolve_overworld_session_event)",
  event_scenes:
    "[[event_id, scene_id, prompt, required_poi_id, required_contact_id, [required_quest_ids], [forbidden_quest_ids], [[option_id, title, minutes, renown, preview, consequence]]], ...] authored event scenes; complete the named setup and requirements, then investigate before choosing",
  event_choices:
    "[[event_id, option_id], ...] currently legal authored event choices; call resolve_overworld_session_event with these exact ids",
  local_refs_truncated:
    "keys among areas/poi/contacts/events/jobs/sites/quests whose lists were capped",
  jobs: "[[job_id, title], ...] discovered jobs (work_overworld_session_job)",
  job_scenes:
    "[[job_id, scene_id, prompt, required_poi_id, required_contact_id, [required_quest_id], [[option_id, title, minutes, renown, preview, consequence]]], ...] authored job scenes; complete the named setup before choosing",
  job_choices:
    "[[job_id, option_id], ...] currently legal authored job choices; call work_overworld_session_job with these exact ids",
  remembered_jobs:
    "[[job_id, title, area_id], ...] discovered unfinished jobs in other known areas; walk to area_id via area_routes before work_overworld_session_job",
  sites: "[[site_id, title], ...] discovered sites (explore_overworld_session_site)",
  quests:
    "[[quest_id, title, anchor_area_id, [launch_id, prompt, [[approach_id, title, minutes, supplies_cost, fatigue_gained, available|null, minutes_after|null, supplies_after|null, fatigue_after|null, condition_after|null, blocked_reason|null, preview, consequence]], selected_approach_id|null]?], ...] discovered quest leads; choose one available approach for launch-enabled quests, then be IN anchor_area_id (compare to here[3]; walk there via area_routes) before start_overworld_session_quest",
  quest_starts:
    "[[quest_id, approach_id|null], ...] currently legal quest launches; call start_overworld_session_quest with these exact quest_id and approach_id values (omit approach_id when null)",
  pending_road:
    "{id, edge: road_id, route: route_name, where: [from_town, to_town, at_time], event: [road_event_id, risk_text, title, summary], options: [[strategy, label, minutes, supplies_cost, fatigue_gained, renown_gained], ...], next_action: {tool, argument, values_from}} unresolved on-route scene; call next_action.tool with next_action.argument set from next_action.values_from, then resolve it before town actions or more travel",
  journal: "[[kind, title, 'Day N, HH:MM'], ...] recent journal entries",
  travel_log:
    "[[road_id, from_town_id, to_town_id, minutes, supplies_used, fatigue_gained, road_event_id|null], ...] recent trips; the immediate travel result extends that tuple with [road_event_risk|null, road_event_title|null, road_event_summary|null]",
  travel_log_truncated: "true when older trips were omitted",
  progress: "[towns_visited, towns_total]",
  renown: "[[region_name, renown_points], ...] reputation per region",
  renown_truncated: "true when more regions have renown than listed",
  completed_arcs: "completed regional arc ids",
  completed_arcs_truncated: "true when more completed arcs exist than listed",
  id_counts:
    "[discovered_towns, discovered_areas, visited_areas, discovered_jobs, completed_jobs, discovered_sites, explored_sites, discovered_quests, started_quests, completed_quests, resolved_events] running totals",
  ids: "map from the id_counts categories to their ids, capped per list (include_ids only)",
  ids_truncated: "id categories whose ids lists were capped",
} as const satisfies Record<keyof OverworldCompactView, string>;

export type OverworldCompactLegend = typeof OVERWORLD_COMPACT_LEGEND;

export function compactOverworldLabel(value: string): string {
  return compactText(value, OVERWORLD_COMPACT_LABEL_CHAR_LIMIT);
}

export function compactOverworldTitle(value: string): string {
  return compactText(value, OVERWORLD_COMPACT_TITLE_CHAR_LIMIT);
}

export function compactJourneyOpportunityLeads(
  opportunities: JourneyOpportunityPresentation | null | undefined,
  limit = OVERWORLD_COMPACT_OPPORTUNITY_LEAD_LIMIT,
): OverworldCompactOpportunityLead[] {
  if (!opportunities || limit <= 0) return [];
  return opportunities.leads
    .slice(0, limit)
    .map((lead) => [
      lead.kind,
      lead.id,
      compactOverworldTitle(lead.title),
      compactOverworldLabel(lead.area),
      lead.access,
    ]);
}

export function compactOverworldRisk(value: string): string {
  return compactText(value, OVERWORLD_COMPACT_RISK_CHAR_LIMIT);
}

export function compactOverworldRef(value: { id: string; name: string }): OverworldCompactRef {
  return [value.id, compactOverworldLabel(value.name)];
}

export function compactOverworldTitleRef(value: {
  id: string;
  title: string;
}): OverworldCompactRef {
  return [value.id, compactOverworldTitle(value.title)];
}

export function compactOverworldJobLeadRef(value: {
  id: string;
  title: string;
  area: string;
}): OverworldCompactJobLeadRef {
  return [value.id, compactOverworldTitle(value.title), value.area];
}

export function compactOverworldQuestRef(value: {
  id: string;
  title: string;
  area: string;
  launch?: OverworldQuestLaunchView;
}): OverworldCompactQuestRef {
  const base = [value.id, compactOverworldTitle(value.title), value.area] as const;
  if (!value.launch) return base;
  const launch: OverworldCompactQuestLaunch = [
    value.launch.id,
    compactText(value.launch.prompt, OVERWORLD_COMPACT_SERVICE_SUMMARY_CHAR_LIMIT),
    value.launch.options.map((option) => {
      const projection = option.projection;
      return [
        option.id,
        compactOverworldTitle(option.title),
        option.terms.minutes,
        option.terms.supplies,
        option.terms.fatigue,
        projection?.available ?? null,
        projection?.minutesAfter ?? null,
        projection?.suppliesAfter ?? null,
        projection?.fatigueAfter ?? null,
        projection?.travelConditionAfter ?? null,
        projection?.blockedReason ?? null,
        compactText(option.preview, OVERWORLD_COMPACT_SERVICE_SUMMARY_CHAR_LIMIT),
        compactText(option.consequence, OVERWORLD_COMPACT_SERVICE_SUMMARY_CHAR_LIMIT),
      ] as const;
    }),
    value.launch.selected?.optionId ?? null,
  ];
  return [...base, launch];
}

export function compactOverworldRefs(
  values: readonly { id: string; name: string }[],
  limit = OVERWORLD_COMPACT_LOCAL_REF_LIMIT,
): OverworldCompactRef[] {
  const refs: OverworldCompactRef[] = [];
  const capped = Math.min(values.length, limit);
  for (let index = 0; index < capped; index += 1) refs.push(compactOverworldRef(values[index]!));
  return refs;
}

export function compactOverworldTitleRefs(
  values: readonly { id: string; title: string }[],
  limit = OVERWORLD_COMPACT_LOCAL_REF_LIMIT,
): OverworldCompactRef[] {
  const refs: OverworldCompactRef[] = [];
  const capped = Math.min(values.length, limit);
  for (let index = 0; index < capped; index += 1) {
    refs.push(compactOverworldTitleRef(values[index]!));
  }
  return refs;
}

export function compactOverworldJobLeadRefs(
  values: readonly { id: string; title: string; area: string }[],
  limit = OVERWORLD_COMPACT_LOCAL_REF_LIMIT,
): OverworldCompactJobLeadRef[] {
  const refs: OverworldCompactJobLeadRef[] = [];
  const capped = Math.min(values.length, limit);
  for (let index = 0; index < capped; index += 1) {
    refs.push(compactOverworldJobLeadRef(values[index]!));
  }
  return refs;
}

export function compactOverworldEventScenes(
  values: readonly OverworldLocalEvent[],
  limit = OVERWORLD_COMPACT_LOCAL_REF_LIMIT,
): OverworldCompactEventScene[] {
  const scenes: OverworldCompactEventScene[] = [];
  for (const event of values.slice(0, limit)) {
    const scene = event.authored_scene;
    if (!scene) continue;
    scenes.push([
      event.id,
      scene.id,
      compactText(scene.prompt, OVERWORLD_COMPACT_SERVICE_SUMMARY_CHAR_LIMIT),
      scene.required_poi_id,
      scene.required_contact_id,
      [...(scene.requires_completed_quests ?? [])],
      [...(scene.forbids_completed_quests ?? [])],
      scene.options.map((option) => [
        option.id,
        compactOverworldTitle(option.title),
        option.terms.minutes,
        option.terms.renown,
        compactText(option.preview, OVERWORLD_COMPACT_SERVICE_SUMMARY_CHAR_LIMIT),
        compactText(option.consequence, OVERWORLD_COMPACT_SERVICE_SUMMARY_CHAR_LIMIT),
      ]),
    ]);
  }
  return scenes;
}

export function compactOverworldEventChoices(
  values: readonly OverworldCompactEventChoice[],
): OverworldCompactEventChoice[] {
  return values.map(([eventId, optionId]) => [eventId, optionId]);
}

export function compactOverworldJobScenes(
  values: readonly OverworldLocalJob[],
  limit = OVERWORLD_COMPACT_LOCAL_REF_LIMIT,
): OverworldCompactJobScene[] {
  const scenes: OverworldCompactJobScene[] = [];
  for (const job of values.slice(0, limit)) {
    const scene = job.authored_scene;
    if (!scene) continue;
    scenes.push([
      job.id,
      scene.id,
      compactText(scene.prompt, OVERWORLD_COMPACT_SERVICE_SUMMARY_CHAR_LIMIT),
      scene.required_poi_id,
      scene.required_contact_id,
      [...(scene.requires_completed_quests ?? [])],
      scene.options.map((option) => [
        option.id,
        compactOverworldTitle(option.title),
        option.terms.minutes,
        option.terms.renown,
        compactText(option.preview, OVERWORLD_COMPACT_SERVICE_SUMMARY_CHAR_LIMIT),
        compactText(option.consequence, OVERWORLD_COMPACT_SERVICE_SUMMARY_CHAR_LIMIT),
      ]),
    ]);
  }
  return scenes;
}

export function compactOverworldJobChoices(
  values: readonly OverworldCompactJobChoice[],
): OverworldCompactJobChoice[] {
  return values.map(([jobId, optionId]) => [jobId, optionId]);
}

export function compactOverworldQuestRefs(
  values: readonly {
    id: string;
    title: string;
    area: string;
    launch?: OverworldQuestLaunchView;
  }[],
  limit = OVERWORLD_COMPACT_LOCAL_REF_LIMIT,
): OverworldCompactQuestRef[] {
  const refs: OverworldCompactQuestRef[] = [];
  const capped = Math.min(values.length, limit);
  for (let index = 0; index < capped; index += 1) {
    refs.push(compactOverworldQuestRef(values[index]!));
  }
  return refs;
}

export function compactOverworldQuestStarts(
  values: readonly OverworldCompactQuestStart[],
): OverworldCompactQuestStart[] {
  return values.map(([questId, approachId]) => [questId, approachId]);
}

export function compactCampaignServiceOffer(
  value: CampaignServiceOffer,
): OverworldCompactServiceOffer {
  return [
    value.id,
    value.action,
    compactOverworldTitle(value.title),
    compactText(value.summary, OVERWORLD_COMPACT_SERVICE_SUMMARY_CHAR_LIMIT),
    value.minutes,
  ];
}

export function compactCampaignServiceOffers(
  values: readonly CampaignServiceOffer[],
): OverworldCompactServiceOffer[] {
  return values.map(compactCampaignServiceOffer);
}

export function compactLocalRefTruncation(
  counts: OverworldCompactLocalRefCounts,
): OverworldCompactLocalRefTruncation {
  const truncated: OverworldCompactLocalRefTruncation = [];
  for (const key of OVERWORLD_COMPACT_LOCAL_REF_KEYS) {
    if (counts[key] > OVERWORLD_COMPACT_LOCAL_REF_LIMIT) truncated.push(key);
  }
  return truncated;
}

export function compactOverworldJournalEntries(
  values: readonly { kind: string; title: string; recordedAt: string }[],
): OverworldCompactJournalEntry[] {
  const journal: OverworldCompactJournalEntry[] = [];
  for (
    let index = 0;
    index < values.length && index < OVERWORLD_COMPACT_JOURNAL_LIMIT;
    index += 1
  ) {
    const entry = values[index]!;
    journal.push([entry.kind, compactOverworldTitle(entry.title), entry.recordedAt]);
  }
  return journal;
}

export function compactOverworldRenownEntries(
  values: readonly (readonly [region: string, value: number])[],
  limit = OVERWORLD_COMPACT_RENOWN_LIMIT,
): OverworldCompactRenownEntry[] {
  const compact: OverworldCompactRenownEntry[] = [];
  const capped = Math.min(values.length, limit);
  for (let index = 0; index < capped; index += 1) {
    const [region, value] = values[index]!;
    compact.push([compactOverworldLabel(region), value]);
  }
  return compact;
}

export function compactOverworldCompletedArcs(
  values: readonly string[],
  limit = OVERWORLD_COMPACT_COMPLETED_ARC_LIMIT,
): string[] {
  const compact: string[] = [];
  const capped = Math.min(values.length, limit);
  for (let index = 0; index < capped; index += 1) compact.push(values[index]!);
  return compact;
}

export function compactRouteOption(
  plan: OverworldSessionRoutePlan,
  roadIdLimit = plan.steps.length,
): OverworldCompactRouteOption {
  const roadIds: string[] = [];
  const capped = Math.min(plan.steps.length, roadIdLimit);
  for (let index = 0; index < capped; index += 1) roadIds.push(plan.steps[index]!.edge.id);
  return [
    plan.destination.id,
    plan.estimate.elapsedMinutes,
    plan.estimate.suppliesNeeded,
    plan.estimate.fatigueAfter,
    roadIds,
  ];
}

export function compactOverworldRouteOptions(
  plans: readonly OverworldSessionRoutePlan[],
): OverworldCompactRouteOption[] {
  const compact: OverworldCompactRouteOption[] = [];
  for (let index = 0; index < plans.length && index < OVERWORLD_COMPACT_ROUTE_LIMIT; index += 1) {
    compact.push(compactRouteOption(plans[index]!, OVERWORLD_COMPACT_ROUTE_STEP_LIMIT));
  }
  return compact;
}

export function compactOverworldRoutePathsTruncated(
  plans: readonly OverworldSessionRoutePlan[],
): boolean {
  for (let index = 0; index < plans.length && index < OVERWORLD_COMPACT_ROUTE_LIMIT; index += 1) {
    if (plans[index]!.steps.length > OVERWORLD_COMPACT_ROUTE_STEP_LIMIT) return true;
  }
  return false;
}

type OverworldCompactRouteSource = {
  id: string;
  destination: { id: string };
  travel_minutes: number;
};

export function compactOverworldAreaRoutes(
  exits: readonly OverworldCompactRouteSource[],
  limit = OVERWORLD_COMPACT_MOVEMENT_LIMIT,
): OverworldCompactAreaRoute[] {
  const compact: OverworldCompactAreaRoute[] = [];
  const capped = Math.min(exits.length, limit);
  for (let index = 0; index < capped; index += 1) {
    const exit = exits[index]!;
    compact.push([exit.id, exit.destination.id, exit.travel_minutes]);
  }
  return compact;
}

export function compactOverworldRoads(
  exits: readonly OverworldCompactRouteSource[],
  routeOptions: readonly OverworldSessionRoutePlan[],
  fallbackFatigue: number,
  limit = OVERWORLD_COMPACT_MOVEMENT_LIMIT,
): OverworldCompactRoad[] {
  const routeByDestination = new Map<string, OverworldSessionRoutePlan>();
  for (const plan of routeOptions) routeByDestination.set(plan.destination.id, plan);

  const compact: OverworldCompactRoad[] = [];
  const capped = Math.min(exits.length, limit);
  for (let index = 0; index < capped; index += 1) {
    const exit = exits[index]!;
    const plan = routeByDestination.get(exit.destination.id);
    compact.push([
      exit.destination.id,
      plan?.estimate.elapsedMinutes ?? exit.travel_minutes,
      plan?.estimate.suppliesNeeded ?? 0,
      plan?.estimate.fatigueAfter ?? fallbackFatigue,
    ]);
  }
  return compact;
}

export function compactOverworldMovementTruncated(
  values: readonly unknown[],
  limit = OVERWORLD_COMPACT_MOVEMENT_LIMIT,
): boolean {
  return values.length > limit;
}

export function compactPendingRoad(
  encounter: OverworldPendingRoadEncounter | null,
): OverworldCompactRoadEncounter | undefined {
  if (!encounter) return undefined;
  const options: OverworldCompactRoadEncounterOption[] = [];
  for (const option of encounter.options) {
    options.push([
      option.strategy,
      compactOverworldTitle(option.label),
      option.minutes,
      option.suppliesCost,
      option.fatigueGained,
      option.renownGained,
    ]);
  }
  return {
    id: encounter.id,
    edge: encounter.edgeId,
    route: compactOverworldLabel(encounter.route),
    where: [
      compactOverworldLabel(encounter.from),
      compactOverworldLabel(encounter.to),
      encounter.arrivedAt,
    ],
    event: [
      encounter.event.id,
      compactOverworldRisk(encounter.event.risk),
      compactOverworldTitle(encounter.event.title),
      compactText(encounter.event.summary, OVERWORLD_COMPACT_ROAD_EVENT_SUMMARY_CHAR_LIMIT),
    ],
    options,
    next_action: compactOverworldRoadEncounterNextAction(),
  };
}

export function compactTravelLogEntry(entry: TravelLogEntry): OverworldCompactTravelLogEntry {
  return [
    entry.edgeId,
    entry.fromId,
    entry.toId,
    entry.minutes,
    entry.suppliesUsed,
    entry.fatigueGained,
    entry.roadEvent?.id ?? null,
  ];
}

export function compactOverworldTravelLog(
  entries: readonly TravelLogEntry[],
): OverworldCompactTravelLogEntry[] {
  const compact: OverworldCompactTravelLogEntry[] = [];
  for (
    let index = 0;
    index < entries.length && index < OVERWORLD_COMPACT_TRAVEL_LOG_LIMIT;
    index += 1
  ) {
    compact.push(compactTravelLogEntry(entries[index]!));
  }
  return compact;
}

function compactIdList(values: readonly string[]): string[] {
  const compacted: string[] = [];
  const limit = Math.min(values.length, OVERWORLD_COMPACT_ID_LIST_LIMIT);
  for (let index = 0; index < limit; index += 1) compacted.push(values[index]!);
  return compacted;
}

function cloneTupleList<T extends readonly unknown[]>(values: readonly T[]): T[] {
  const clone: T[] = [];
  for (const value of values) clone.push([...value] as unknown as T);
  return clone;
}

function cloneCompactRouteOptions(
  values: readonly OverworldCompactRouteOption[],
): OverworldCompactRouteOption[] {
  const clone: OverworldCompactRouteOption[] = [];
  for (const option of values) {
    clone.push([option[0], option[1], option[2], option[3], [...option[4]]]);
  }
  return clone;
}

function cloneCompactIdMap(ids: OverworldCompactIdMap): OverworldCompactIdMap {
  const clone: OverworldCompactIdMap = {};
  for (const key of OVERWORLD_COMPACT_ID_KEYS) {
    const values = ids[key];
    if (values && values.length > 0) clone[key] = [...values];
  }
  return clone;
}

export function compactIdPayload(values: OverworldCompactFullIdMap): OverworldCompactIdPayload {
  return compactIdPayloadFromBuckets({
    discovered_towns: {
      ids: values.discovered_towns,
      count: values.discovered_towns.length,
    },
    discovered_areas: {
      ids: values.discovered_areas,
      count: values.discovered_areas.length,
    },
    visited_areas: {
      ids: values.visited_areas,
      count: values.visited_areas.length,
    },
    discovered_jobs: {
      ids: values.discovered_jobs,
      count: values.discovered_jobs.length,
    },
    completed_jobs: {
      ids: values.completed_jobs,
      count: values.completed_jobs.length,
    },
    discovered_sites: {
      ids: values.discovered_sites,
      count: values.discovered_sites.length,
    },
    explored_sites: {
      ids: values.explored_sites,
      count: values.explored_sites.length,
    },
    discovered_quests: {
      ids: values.discovered_quests,
      count: values.discovered_quests.length,
    },
    started_quests: {
      ids: values.started_quests,
      count: values.started_quests.length,
    },
    completed_quests: {
      ids: values.completed_quests,
      count: values.completed_quests.length,
    },
    resolved_events: {
      ids: values.resolved_events,
      count: values.resolved_events.length,
    },
  });
}

export function compactIdPayloadFromBuckets(
  values: OverworldCompactIdBuckets,
): OverworldCompactIdPayload {
  const ids: OverworldCompactIdMap = {};
  const ids_truncated: OverworldCompactIdTruncation = [];
  for (const key of OVERWORLD_COMPACT_ID_KEYS) {
    const bucket = values[key];
    const compacted = compactIdList(bucket.ids);
    if (compacted.length > 0) ids[key] = compacted;
    if (bucket.count > compacted.length) ids_truncated.push(key);
  }
  const id_counts: OverworldCompactIdCounts = [
    values.discovered_towns.count,
    values.discovered_areas.count,
    values.visited_areas.count,
    values.discovered_jobs.count,
    values.completed_jobs.count,
    values.discovered_sites.count,
    values.explored_sites.count,
    values.discovered_quests.count,
    values.started_quests.count,
    values.completed_quests.count,
    values.resolved_events.count,
  ];
  return {
    ids,
    id_counts,
    ...(ids_truncated.length > 0 ? { ids_truncated } : {}),
  };
}

export function compactCampaignCharacterView(
  view: CampaignCharacterView,
): OverworldCompactCampaignCharacter {
  const relationships = view.relationships.slice(0, OVERWORLD_COMPACT_CHARACTER_ENTRY_LIMIT);
  const counts: OverworldCompactCampaignCharacterCount = [
    view.skills.length,
    view.values.length,
    view.wounds.length,
    view.equipment.length,
    view.abilities.length,
    view.knowledge.length,
    view.promises.length,
    view.companions.length,
    view.crimes.length,
    view.relationships.length,
    view.factionStanding.length,
  ];
  const truncated: OverworldCompactCampaignCharacterTruncation[] = [];
  if (view.skills.length > OVERWORLD_COMPACT_CHARACTER_ENTRY_LIMIT) truncated.push("skills");
  if (view.values.length > OVERWORLD_COMPACT_CHARACTER_ENTRY_LIMIT) truncated.push("values");
  if (view.wounds.length > OVERWORLD_COMPACT_CHARACTER_ENTRY_LIMIT) truncated.push("wounds");
  if (view.equipment.length > OVERWORLD_COMPACT_CHARACTER_ENTRY_LIMIT) {
    truncated.push("equipment");
  }
  if (view.abilities.length > OVERWORLD_COMPACT_CHARACTER_ENTRY_LIMIT) {
    truncated.push("abilities");
  }
  if (view.knowledge.length > OVERWORLD_COMPACT_CHARACTER_ENTRY_LIMIT) {
    truncated.push("knowledge");
  }
  if (view.promises.length > OVERWORLD_COMPACT_CHARACTER_ENTRY_LIMIT) {
    truncated.push("promises");
  }
  if (view.companions.length > OVERWORLD_COMPACT_CHARACTER_ENTRY_LIMIT) {
    truncated.push("companions");
  }
  if (view.crimes.length > OVERWORLD_COMPACT_CHARACTER_ENTRY_LIMIT) truncated.push("crimes");
  if (view.relationships.length > OVERWORLD_COMPACT_CHARACTER_ENTRY_LIMIT) {
    truncated.push("relationships");
  }
  if (
    relationships.some(
      (relationship) => relationship.memories.length > OVERWORLD_COMPACT_CHARACTER_MEMORY_LIMIT,
    )
  ) {
    truncated.push("relationship_memories");
  }
  if (view.factionStanding.length > OVERWORLD_COMPACT_CHARACTER_ENTRY_LIMIT) {
    truncated.push("faction_standing");
  }

  const compact = [
    view.background,
    [view.health.current, view.health.max],
    view.money,
    view.skills
      .slice(0, OVERWORLD_COMPACT_CHARACTER_ENTRY_LIMIT)
      .map((skill) => [skill.skillId, skill.rank] as const),
    view.values
      .slice(0, OVERWORLD_COMPACT_CHARACTER_ENTRY_LIMIT)
      .map((value) => [value.valueId, value.strength] as const),
    view.wounds
      .slice(0, OVERWORLD_COMPACT_CHARACTER_ENTRY_LIMIT)
      .map((wound) => [wound.woundId, wound.severity, wound.treatment] as const),
    view.equipment
      .slice(0, OVERWORLD_COMPACT_CHARACTER_ENTRY_LIMIT)
      .map(
        (item) =>
          [item.equipmentId, item.itemId, item.quantity, item.condition, item.equipped] as const,
      ),
    view.abilities.slice(0, OVERWORLD_COMPACT_CHARACTER_ENTRY_LIMIT),
    view.knowledge.slice(0, OVERWORLD_COMPACT_CHARACTER_ENTRY_LIMIT),
    view.promises
      .slice(0, OVERWORLD_COMPACT_CHARACTER_ENTRY_LIMIT)
      .map((promise) => [promise.promiseId, promise.recipientId, promise.status] as const),
    view.companions.slice(0, OVERWORLD_COMPACT_CHARACTER_ENTRY_LIMIT),
    view.crimes
      .slice(0, OVERWORLD_COMPACT_CHARACTER_ENTRY_LIMIT)
      .map((crime) => [crime.crimeId, crime.jurisdictionId, crime.severity, crime.status] as const),
    relationships.map(
      (relationship) =>
        [
          relationship.npcId,
          relationship.trust,
          relationship.regard,
          relationship.owesPlayer,
          relationship.playerOwes,
          relationship.memories.length,
          relationship.memories.slice(0, OVERWORLD_COMPACT_CHARACTER_MEMORY_LIMIT),
        ] as const,
    ),
    view.factionStanding
      .slice(0, OVERWORLD_COMPACT_CHARACTER_ENTRY_LIMIT)
      .map((faction) => [faction.factionId, faction.standing] as const),
    counts,
  ] as const;

  return truncated.length > 0 ? ([...compact, truncated] as const) : compact;
}

function cloneCompactCampaignCharacter(
  character: OverworldCompactCampaignCharacter,
): OverworldCompactCampaignCharacter {
  const clone = [
    character[0],
    [...character[1]],
    character[2],
    cloneTupleList(character[3]),
    cloneTupleList(character[4]),
    cloneTupleList(character[5]),
    cloneTupleList(character[6]),
    [...character[7]],
    [...character[8]],
    cloneTupleList(character[9]),
    [...character[10]],
    cloneTupleList(character[11]),
    character[12].map(
      (relationship) =>
        [
          relationship[0],
          relationship[1],
          relationship[2],
          relationship[3],
          relationship[4],
          relationship[5],
          [...relationship[6]],
        ] as const,
    ),
    cloneTupleList(character[13]),
    [...character[14]],
  ] as const;

  return character[15] ? ([...clone, [...character[15]]] as const) : clone;
}

export function cloneOverworldCompactView(view: OverworldCompactView): OverworldCompactView {
  const clone: OverworldCompactView = {
    v: view.v,
    character: cloneCompactCampaignCharacter(view.character),
    world: view.world,
    time: view.time,
    here: [...view.here] as OverworldCompactHere,
    vitals: [...view.vitals] as OverworldCompactVitals,
    hidden: [...view.hidden] as OverworldCompactHiddenCounts,
    roads: cloneTupleList(view.roads),
    route_options: cloneCompactRouteOptions(view.route_options),
    areas: cloneTupleList(view.areas),
    poi: cloneTupleList(view.poi),
    contacts: cloneTupleList(view.contacts),
    events: cloneTupleList(view.events),
    progress: [...view.progress] as OverworldCompactProgress,
    id_counts: [...view.id_counts] as OverworldCompactIdCounts,
    ids: cloneCompactIdMap(view.ids),
  };

  if (view.area_routes) clone.area_routes = cloneTupleList(view.area_routes);
  if (view.event_scenes) {
    clone.event_scenes = view.event_scenes.map((scene) => [
      scene[0],
      scene[1],
      scene[2],
      scene[3],
      scene[4],
      [...scene[5]],
      [...scene[6]],
      cloneTupleList(scene[7]),
    ]);
  }
  if (view.event_choices) clone.event_choices = cloneTupleList(view.event_choices);
  if (view.service_offers) clone.service_offers = cloneTupleList(view.service_offers);
  if (view.departure_interactions) {
    clone.departure_interactions = cloneTupleList(view.departure_interactions);
  }
  if (view.opportunity_guidance) clone.opportunity_guidance = view.opportunity_guidance;
  if (view.opportunity_leads) {
    clone.opportunity_leads = cloneTupleList(view.opportunity_leads);
  }
  if (view.opportunity_leads_truncated) clone.opportunity_leads_truncated = true;
  if (view.roads_truncated) clone.roads_truncated = true;
  if (view.area_routes_truncated) clone.area_routes_truncated = true;
  if (view.route_options_truncated) clone.route_options_truncated = true;
  if (view.route_paths_truncated) clone.route_paths_truncated = true;
  if (view.jobs) clone.jobs = cloneTupleList(view.jobs);
  if (view.job_scenes) {
    clone.job_scenes = view.job_scenes.map((scene) => [
      scene[0],
      scene[1],
      scene[2],
      scene[3],
      scene[4],
      [...scene[5]],
      cloneTupleList(scene[6]),
    ]);
  }
  if (view.job_choices) clone.job_choices = cloneTupleList(view.job_choices);
  if (view.remembered_jobs) clone.remembered_jobs = cloneTupleList(view.remembered_jobs);
  if (view.sites) clone.sites = cloneTupleList(view.sites);
  if (view.quests) {
    clone.quests = view.quests.map((quest) => {
      if (quest.length === 3) return [...quest] as OverworldCompactQuestRef;
      return [
        quest[0],
        quest[1],
        quest[2],
        [quest[3][0], quest[3][1], cloneTupleList(quest[3][2]), quest[3][3]],
      ];
    });
  }
  if (view.quest_starts) clone.quest_starts = cloneTupleList(view.quest_starts);
  if (view.local_refs_truncated) clone.local_refs_truncated = [...view.local_refs_truncated];
  if (view.pending_road) {
    clone.pending_road = {
      ...view.pending_road,
      where: [...view.pending_road.where] as readonly [from: string, to: string, at: string],
      event: [...view.pending_road.event] as readonly [
        id: string,
        risk: string,
        title: string,
        summary: string,
      ],
      options: cloneTupleList(view.pending_road.options),
      next_action: { ...view.pending_road.next_action },
    };
  }
  if (view.journal) clone.journal = cloneTupleList(view.journal);
  if (view.travel_log) clone.travel_log = cloneTupleList(view.travel_log);
  if (view.travel_log_truncated) clone.travel_log_truncated = true;
  if (view.renown) clone.renown = cloneTupleList(view.renown);
  if (view.renown_truncated) clone.renown_truncated = true;
  if (view.completed_arcs) clone.completed_arcs = [...view.completed_arcs];
  if (view.completed_arcs_truncated) clone.completed_arcs_truncated = true;
  if (view.ids_truncated) clone.ids_truncated = [...view.ids_truncated];

  return clone;
}

export function compactOverworldView(view: OverworldView): OverworldCompactView {
  const routeOptions = compactOverworldRouteOptions(view.routeOptions);
  const routePathsTruncated = compactOverworldRoutePathsTruncated(view.routeOptions);
  const travelLog = compactOverworldTravelLog(view.log);
  const areaRoutes = compactOverworldAreaRoutes(view.areaExits);
  const roadsTruncated = compactOverworldMovementTruncated(view.exits);
  const areaRoutesTruncated = compactOverworldMovementTruncated(view.areaExits);
  const visibleEvents = view.events.slice(0, OVERWORLD_COMPACT_LOCAL_REF_LIMIT);
  const visibleEventIds = new Set(visibleEvents.map((event) => event.id));
  const eventScenes = compactOverworldEventScenes(visibleEvents);
  const eventChoices = compactOverworldEventChoices(
    view.eventChoices.filter(([eventId]) => visibleEventIds.has(eventId)),
  );
  const visibleJobs = view.jobs.slice(0, OVERWORLD_COMPACT_LOCAL_REF_LIMIT);
  const visibleJobIds = new Set(visibleJobs.map((job) => job.id));
  const jobs = compactOverworldTitleRefs(visibleJobs);
  const jobScenes = compactOverworldJobScenes(visibleJobs);
  const jobChoices = compactOverworldJobChoices(
    view.jobChoices.filter(([jobId]) => visibleJobIds.has(jobId)),
  );
  const rememberedJobs = compactOverworldJobLeadRefs(view.rememberedJobs);
  const sites = compactOverworldTitleRefs(view.sites);
  const quests = compactOverworldQuestRefs(view.quests);
  const questStarts = compactOverworldQuestStarts(view.questStarts);
  const serviceOffers = compactCampaignServiceOffers(view.serviceOffers);
  const departureInteractions = compactOverworldDepartureInteractions(view.departureInteractions);
  const localRefsTruncated = compactLocalRefTruncation({
    areas: view.areas.length,
    poi: view.pois.length,
    contacts: view.characters.length,
    events: view.events.length,
    jobs: view.jobs.length,
    remembered_jobs: view.rememberedJobs.length,
    sites: view.sites.length,
    quests: view.quests.length,
  });
  const journal = compactOverworldJournalEntries(view.journal);
  const renownEntries = Object.entries(view.regionRenown).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const renown = compactOverworldRenownEntries(renownEntries);
  const completedArcIds = view.completedRegionalArcIds;
  const completedArcs = compactOverworldCompletedArcs(completedArcIds);
  const idPayload = compactIdPayload({
    discovered_towns: view.discovered.map((town) => town.id),
    discovered_areas: view.discoveredAreaIds,
    visited_areas: view.visitedAreaIds,
    discovered_jobs: view.discoveredJobIds,
    completed_jobs: view.completedJobIds,
    discovered_sites: view.discoveredSiteIds,
    explored_sites: view.exploredSiteIds,
    discovered_quests: view.discoveredQuestIds,
    started_quests: view.startedQuestIds,
    completed_quests: view.completedQuestIds,
    resolved_events: view.resolvedEventIds,
  });
  const pendingRoad = compactPendingRoad(view.pendingRoadEncounter);
  return {
    v: OVERWORLD_COMPACT_VIEW_VERSION,
    character: compactCampaignCharacterView(view.character),
    world: compactOverworldLabel(view.world),
    time: view.timeLabel,
    here: [
      view.current.id,
      compactOverworldLabel(view.current.name),
      compactOverworldLabel(view.current.region),
      view.currentArea?.id ?? null,
      view.currentArea ? compactOverworldLabel(view.currentArea.name) : null,
    ],
    vitals: [view.supplies, view.maxSupplies, view.fatigue, view.travelCondition],
    ...(serviceOffers.length > 0 ? { service_offers: serviceOffers } : {}),
    ...(departureInteractions.length > 0 ? { departure_interactions: departureInteractions } : {}),
    hidden: [
      view.hiddenAreaCount,
      view.hiddenJobCount,
      view.hiddenSiteCount,
      view.hiddenQuestCount,
    ],
    roads: compactOverworldRoads(view.exits, view.routeOptions, view.fatigue),
    ...(roadsTruncated ? { roads_truncated: true as const } : {}),
    ...(areaRoutes.length > 0 ? { area_routes: areaRoutes } : {}),
    ...(areaRoutesTruncated ? { area_routes_truncated: true as const } : {}),
    route_options: routeOptions,
    ...(view.routeOptions.length > routeOptions.length
      ? { route_options_truncated: true as const }
      : {}),
    ...(routePathsTruncated ? { route_paths_truncated: true as const } : {}),
    areas: compactOverworldRefs(view.areas),
    poi: compactOverworldTitleRefs(view.pois),
    contacts: compactOverworldRefs(view.characters),
    events: compactOverworldTitleRefs(visibleEvents),
    ...(eventScenes.length > 0 ? { event_scenes: eventScenes } : {}),
    ...(eventChoices.length > 0 ? { event_choices: eventChoices } : {}),
    ...(localRefsTruncated.length > 0 ? { local_refs_truncated: localRefsTruncated } : {}),
    ...(jobs.length > 0 ? { jobs } : {}),
    ...(jobScenes.length > 0 ? { job_scenes: jobScenes } : {}),
    ...(jobChoices.length > 0 ? { job_choices: jobChoices } : {}),
    ...(rememberedJobs.length > 0 ? { remembered_jobs: rememberedJobs } : {}),
    ...(sites.length > 0 ? { sites } : {}),
    ...(quests.length > 0 ? { quests } : {}),
    ...(questStarts.length > 0 ? { quest_starts: questStarts } : {}),
    ...(pendingRoad ? { pending_road: pendingRoad } : {}),
    ...(journal.length > 0 ? { journal } : {}),
    ...(travelLog.length > 0 ? { travel_log: travelLog } : {}),
    ...(view.log.length > travelLog.length ? { travel_log_truncated: true as const } : {}),
    progress: [view.visitedCount, view.totalTowns],
    ...(renown.length > 0 ? { renown } : {}),
    ...(renownEntries.length > renown.length ? { renown_truncated: true as const } : {}),
    ...(completedArcs.length > 0 ? { completed_arcs: completedArcs } : {}),
    ...(completedArcIds.length > completedArcs.length
      ? { completed_arcs_truncated: true as const }
      : {}),
    id_counts: idPayload.id_counts,
    ...(idPayload.ids_truncated ? { ids_truncated: idPayload.ids_truncated } : {}),
    ids: idPayload.ids,
  };
}
