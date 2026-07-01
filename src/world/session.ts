import { z } from "zod";
import { hashState } from "../core/hash.js";
import {
  overworldAreasAt,
  overworldAreaEdgesFrom,
  overworldCharactersAt,
  overworldCharactersInArea,
  overworldEdgesFrom,
  overworldEventsAt,
  overworldEventsInArea,
  overworldExplorationSitesNear,
  overworldExplorationSitesInArea,
  overworldJobsAt,
  overworldNodesById,
  overworldPoisAt,
  overworldPoisInArea,
  overworldQuestsAt,
  overworldRoadEventFor,
  planOverworldRoute,
  type OverworldArea,
  type OverworldAreaExit,
  type OverworldCharacter,
  type OverworldEdge,
  type OverworldExit,
  type OverworldExplorationSite,
  type OverworldLocalJob,
  type OverworldLocalEvent,
  type OverworldManifest,
  type OverworldNode,
  type OverworldPoi,
  type OverworldQuest,
  type OverworldRegionalArc,
  type OverworldRoutePlan,
  type OverworldRoadEvent,
} from "./overworld.js";
import {
  describeOverworldAreaAction,
  describeOverworldContactAction,
  describeOverworldEventAction,
  describeOverworldJobAction,
  describeOverworldPoiAction,
  describeOverworldSiteAction,
  type OverworldLocalActionDescriptor,
  type OverworldLocalActionKind,
} from "./local_actions.js";

export const OVERWORLD_SESSION_SAVE_VERSION = 3 as const;
const MAX_SUPPLIES = 8;
const STARTING_SUPPLIES = 6;
const MAX_FATIGUE = 100;

export type TravelLogEntry = {
  edgeId: string;
  fromId: string;
  toId: string;
  from: string;
  to: string;
  route: string;
  distanceMi: number;
  baseMinutes: number;
  delayMinutes: number;
  minutes: number;
  arrivedAt: number;
  suppliesUsed: number;
  suppliesAfter: number;
  fatigueGained: number;
  fatigueAfter: number;
  roadEvent: OverworldRoadEvent | null;
};

export type TravelLogEntrySnapshot = {
  edgeId: string;
  fromId: string;
  toId: string;
  delayMinutes: number;
  minutes: number;
  arrivedAt: number;
  suppliesUsed: number;
  suppliesAfter: number;
  fatigueGained: number;
  fatigueAfter: number;
};

const TravelLogEntrySnapshotSchema = z
  .object({
    edgeId: z.string().min(1),
    fromId: z.string().min(1),
    toId: z.string().min(1),
    delayMinutes: z.number().int().nonnegative(),
    minutes: z.number().int().nonnegative(),
    arrivedAt: z.number().int().nonnegative(),
    suppliesUsed: z.number().int().min(0).max(MAX_SUPPLIES),
    suppliesAfter: z.number().int().min(0).max(MAX_SUPPLIES),
    fatigueGained: z.number().int().nonnegative(),
    fatigueAfter: z.number().int().min(0).max(MAX_FATIGUE),
  })
  .strict();

export type OverworldAreaTravelResult = {
  from: OverworldArea;
  to: OverworldArea;
  route: string;
  minutes: number;
  arrivedAt: string;
};

export type OverworldRoadEncounterStrategy = "assist_travelers" | "cautious_scout" | "press_on";

const ROAD_ENCOUNTER_STRATEGIES = new Set<string>([
  "assist_travelers",
  "cautious_scout",
  "press_on",
]);

type RoadJournalIdParts = {
  edgeId: string;
  arrivedAt: number;
  strategy: OverworldRoadEncounterStrategy;
};

export type OverworldRoadEncounterOption = {
  strategy: OverworldRoadEncounterStrategy;
  label: string;
  minutes: number;
  suppliesCost: number;
  fatigueGained: number;
  renownGained: number;
  outcome: string;
};

export type OverworldPendingRoadEncounter = {
  id: string;
  edgeId: string;
  from: string;
  to: string;
  route: string;
  arrivedAt: string;
  event: OverworldRoadEvent;
  options: OverworldRoadEncounterOption[];
};

export type OverworldPendingRoadEncounterSnapshot = {
  edgeId: string;
};

const OverworldPendingRoadEncounterSnapshotSchema = z
  .object({
    edgeId: z.string().min(1),
  })
  .strict();

export type OverworldJournalEntry = {
  id: string;
  kind:
    | "area"
    | "contact"
    | "event"
    | "job"
    | "poi"
    | "regional_arc"
    | "resolution"
    | "road"
    | "service"
    | "site";
  town: string;
  title: string;
  text: string;
  recordedAt: string;
};

const OverworldJournalEntrySchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum([
      "area",
      "contact",
      "event",
      "job",
      "poi",
      "regional_arc",
      "resolution",
      "road",
      "service",
      "site",
    ]),
    town: z.string().min(1),
    title: z.string().min(1),
    text: z.string().min(1),
    recordedAt: z.string().min(1),
  })
  .strict();

export const OverworldSessionSnapshotSchema = z
  .object({
    version: z.literal(OVERWORLD_SESSION_SAVE_VERSION),
    worldId: z.string().min(1),
    worldHash: z.string().regex(/^[0-9a-f]{64}$/),
    currentId: z.string().min(1),
    currentAreaId: z.string().min(1).nullable(),
    minutes: z.number().int().nonnegative(),
    supplies: z.number().int().min(0).max(MAX_SUPPLIES),
    fatigue: z.number().int().min(0).max(MAX_FATIGUE),
    discoveredIds: z.array(z.string().min(1)),
    visitedIds: z.array(z.string().min(1)),
    currentAreaByTown: z.array(z.tuple([z.string().min(1), z.string().min(1)])),
    travelLog: z.array(TravelLogEntrySnapshotSchema),
    journalEntries: z.array(OverworldJournalEntrySchema),
    resolvedEventIds: z.array(z.string().min(1)),
    discoveredAreaIds: z.array(z.string().min(1)),
    visitedAreaIds: z.array(z.string().min(1)),
    discoveredJobIds: z.array(z.string().min(1)),
    completedJobIds: z.array(z.string().min(1)),
    discoveredSiteIds: z.array(z.string().min(1)),
    discoveredQuestIds: z.array(z.string().min(1)),
    exploredSiteIds: z.array(z.string().min(1)),
    regionRenown: z.array(z.tuple([z.string().min(1), z.number().int().nonnegative()])),
    completedRegionalArcIds: z.array(z.string().min(1)),
    pendingRoadEncounter: OverworldPendingRoadEncounterSnapshotSchema.nullable(),
  })
  .strict();

export type OverworldSessionSnapshot = z.infer<typeof OverworldSessionSnapshotSchema>;

export type OverworldActionResult = {
  minutes: number;
  alreadyKnown: boolean;
  entry: OverworldJournalEntry;
  discoveredAreas?: OverworldArea[];
  discoveredJobs?: OverworldLocalJob[];
  discoveredSites?: OverworldExplorationSite[];
  discoveredQuests?: OverworldQuestView[];
};

export type OverworldServiceResult = {
  action: "resupply" | "rest";
  minutes: number;
  changed: boolean;
  suppliesBefore: number;
  suppliesAfter: number;
  fatigueBefore: number;
  fatigueAfter: number;
  message: string;
  entry: OverworldJournalEntry | null;
};

export type OverworldRoadEncounterResult = {
  strategy: OverworldRoadEncounterStrategy;
  minutes: number;
  suppliesUsed: number;
  fatigueGained: number;
  renownGained: number;
  encounter: OverworldPendingRoadEncounter;
  entry: OverworldJournalEntry;
};

export type OverworldRouteEstimate = {
  baseMinutes: number;
  delayMinutes: number;
  elapsedMinutes: number;
  suppliesNeeded: number;
  suppliesUsed: number;
  supplyDeficit: number;
  suppliesAfter: number;
  fatigueGained: number;
  fatigueAfter: number;
  travelConditionAfter: string;
};

export type OverworldSessionRoutePlan = OverworldRoutePlan & {
  estimate: OverworldRouteEstimate;
};

export type OverworldRegionalArcProgress = {
  id: string;
  region: string;
  title: string;
  summary: string;
  requiredResolutions: number;
  resolvedInRegion: number;
  anchorTowns: OverworldNode[];
  resolvedAnchorTowns: OverworldNode[];
  completed: boolean;
  reward: string;
};

export type OverworldQuestView = {
  id: string;
  title: string;
  home: string;
  area: string;
  discovery: string;
  visibility: OverworldQuest["visibility"];
};

export type OverworldView = {
  world: string;
  timeLabel: string;
  current: OverworldNode;
  currentArea: OverworldArea | null;
  areaExits: OverworldAreaExit[];
  exits: OverworldExit[];
  areas: OverworldArea[];
  hiddenAreaCount: number;
  pois: OverworldPoi[];
  characters: OverworldCharacter[];
  events: OverworldLocalEvent[];
  jobs: OverworldLocalJob[];
  hiddenJobCount: number;
  sites: OverworldExplorationSite[];
  hiddenSiteCount: number;
  quests: OverworldQuestView[];
  hiddenQuestCount: number;
  routeOptions: OverworldSessionRoutePlan[];
  discovered: OverworldNode[];
  visitedCount: number;
  totalTowns: number;
  supplies: number;
  maxSupplies: number;
  fatigue: number;
  travelCondition: string;
  journal: OverworldJournalEntry[];
  discoveredSiteIds: string[];
  discoveredAreaIds: string[];
  discoveredJobIds: string[];
  visitedAreaIds: string[];
  completedJobIds: string[];
  discoveredQuestIds: string[];
  exploredSiteIds: string[];
  resolvedEventIds: string[];
  regionRenown: Record<string, number>;
  regionalArcs: OverworldRegionalArcProgress[];
  completedRegionalArcIds: string[];
  pendingRoadEncounter: OverworldPendingRoadEncounter | null;
  log: TravelLogEntry[];
};

function questView(quest: OverworldQuest): OverworldQuestView {
  return {
    id: quest.id,
    title: quest.title,
    home: quest.home,
    area: quest.area,
    discovery: quest.discovery,
    visibility: quest.visibility,
  };
}

function timeLabel(minutes: number): string {
  const day = Math.floor(minutes / 1440) + 1;
  const minuteOfDay = minutes % 1440;
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return `Day ${day}, ${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

function parseTimeLabel(label: string): number {
  const match = /^Day ([1-9]\d*), ([01]\d|2[0-3]):([0-5]\d)$/.exec(label);
  if (!match) {
    throw new Error(`Overworld session snapshot has malformed journal timestamp "${label}".`);
  }
  const day = Number(match[1]);
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  return (day - 1) * 1440 + hour * 60 + minute;
}

function travelSupplyCost(minutes: number): number {
  return Math.max(1, Math.ceil(minutes / 180));
}

function travelFatigueGain(minutes: number, roadEvent: OverworldRoadEvent | null): number {
  const riskExtra = roadEvent?.risk === "high" ? 3 : roadEvent?.risk === "medium" ? 1 : 0;
  return Math.max(1, Math.ceil(minutes / 45)) + riskExtra;
}

function travelDelayMinutes(minutes: number, fatigue: number, supplyDeficit: number): number {
  const fatigueRate = fatigue >= 80 ? 0.35 : fatigue >= 50 ? 0.2 : fatigue >= 25 ? 0.1 : 0;
  const fatigueDelay = Math.ceil(minutes * fatigueRate);
  const supplyDelay = supplyDeficit * 30;
  return fatigueDelay + supplyDelay;
}

function travelCondition(fatigue: number, supplies: number): string {
  if (fatigue >= 80) return supplies === 0 ? "exhausted and out of supplies" : "exhausted";
  if (fatigue >= 50) return supplies === 0 ? "worn down and out of supplies" : "worn down";
  if (supplies === 0) return "out of supplies";
  if (fatigue >= 25) return "tired";
  return "ready";
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function snapshotTravelLogEntry(entry: TravelLogEntry): TravelLogEntrySnapshot {
  return {
    edgeId: entry.edgeId,
    fromId: entry.fromId,
    toId: entry.toId,
    delayMinutes: entry.delayMinutes,
    minutes: entry.minutes,
    arrivedAt: entry.arrivedAt,
    suppliesUsed: entry.suppliesUsed,
    suppliesAfter: entry.suppliesAfter,
    fatigueGained: entry.fatigueGained,
    fatigueAfter: entry.fatigueAfter,
  };
}

function sortedStringSet(values: Set<string>): string[] {
  return [...values].sort();
}

function sortedStringMap(values: Map<string, string>): [string, string][] {
  return [...values.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function sortedNumberMap(values: Map<string, number>): [string, number][] {
  return [...values.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function assertUnique(label: string, values: readonly string[]): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value))
      throw new Error(`Overworld session snapshot has duplicate ${label} "${value}".`);
    seen.add(value);
  }
}

function assertKnownIds(label: string, values: readonly string[], known: Set<string>): void {
  assertUnique(label, values);
  for (const value of values) {
    if (!known.has(value))
      throw new Error(`Overworld session snapshot has unknown ${label} "${value}".`);
  }
}

function assertUniqueTupleKeys(
  label: string,
  values: readonly (readonly [string, unknown])[],
): void {
  assertUnique(
    label,
    values.map(([key]) => key),
  );
}

type OverworldJournalSourceIndex = {
  arcIds: ReadonlySet<string>;
  areaIds: ReadonlySet<string>;
  characterIds: ReadonlySet<string>;
  edgeIds: ReadonlySet<string>;
  eventIds: ReadonlySet<string>;
  jobIds: ReadonlySet<string>;
  poiIds: ReadonlySet<string>;
  regionNames: ReadonlySet<string>;
  siteIds: ReadonlySet<string>;
  townNames: ReadonlySet<string>;
  travelLogArrivals: ReadonlySet<string>;
};

type OverworldRenownSourceIndex = {
  eventsById: ReadonlyMap<string, OverworldLocalEvent>;
  jobsById: ReadonlyMap<string, OverworldLocalJob>;
  nodesById: ReadonlyMap<string, OverworldNode>;
  roadEventsByEdgeId: ReadonlyMap<string, OverworldRoadEvent>;
  sitesById: ReadonlyMap<string, OverworldExplorationSite>;
  travelLogByArrival: ReadonlyMap<string, TravelLogEntrySnapshot>;
};

type OverworldDiscoveryLocalityIndex = {
  areaHomes: ReadonlyMap<string, string>;
  discoveredAreaIds: ReadonlySet<string>;
  eventsById: ReadonlyMap<string, OverworldLocalEvent>;
  jobsById: ReadonlyMap<string, OverworldLocalJob>;
  questsById: ReadonlyMap<string, OverworldQuest>;
  sitesById: ReadonlyMap<string, OverworldExplorationSite>;
  visitedTownIds: ReadonlySet<string>;
};

type OverworldResolutionProofIndex = {
  charactersById: ReadonlyMap<string, OverworldCharacter>;
  eventsById: ReadonlyMap<string, OverworldLocalEvent>;
  poisById: ReadonlyMap<string, OverworldPoi>;
};

function assertKnownJournalSource(
  entry: OverworldJournalEntry,
  prefix: string,
  known: ReadonlySet<string>,
  sourceLabel: string,
): void {
  if (!entry.id.startsWith(prefix)) {
    throw new Error(
      `Overworld session snapshot journal ${entry.kind} entry id "${entry.id}" must start with "${prefix}".`,
    );
  }
  const sourceId = entry.id.slice(prefix.length);
  if (!sourceId) {
    throw new Error(
      `Overworld session snapshot journal ${entry.kind} entry has an empty ${sourceLabel} id.`,
    );
  }
  if (!known.has(sourceId)) {
    throw new Error(
      `Overworld session snapshot journal ${entry.kind} entry references unknown ${sourceLabel} "${sourceId}".`,
    );
  }
}

function parseRoadJournalId(entryId: string): RoadJournalIdParts {
  const match = /^road:(.+):(\d+):([a-z_]+)$/.exec(entryId);
  if (!match) {
    throw new Error(
      `Overworld session snapshot journal road entry id "${entryId}" must match "road:<road_id>:<arrival_minutes>:<strategy>".`,
    );
  }
  const edgeId = match[1]!;
  const arrivedAt = Number(match[2]!);
  const strategy = match[3]!;
  if (!Number.isSafeInteger(arrivedAt)) {
    throw new Error(
      `Overworld session snapshot journal road entry has malformed arrival minutes "${match[2]}".`,
    );
  }
  if (!ROAD_ENCOUNTER_STRATEGIES.has(strategy)) {
    throw new Error(
      `Overworld session snapshot journal road entry references unknown strategy "${strategy}".`,
    );
  }
  return {
    edgeId,
    arrivedAt,
    strategy: strategy as OverworldRoadEncounterStrategy,
  };
}

function assertRoadJournalSource(
  entry: OverworldJournalEntry,
  recordedAt: number,
  sources: OverworldJournalSourceIndex,
): void {
  const parsed = parseRoadJournalId(entry.id);
  if (!sources.edgeIds.has(parsed.edgeId)) {
    throw new Error(
      `Overworld session snapshot journal road entry references unknown road "${parsed.edgeId}".`,
    );
  }
  if (parsed.arrivedAt > recordedAt) {
    throw new Error("Overworld session snapshot journal road entry predates its road arrival.");
  }
  if (!sources.travelLogArrivals.has(`${parsed.edgeId}@${parsed.arrivedAt}`)) {
    throw new Error(
      `Overworld session snapshot journal road entry has no matching travel log for "${parsed.edgeId}" at ${parsed.arrivedAt}.`,
    );
  }
}

function assertServiceJournalSource(entry: OverworldJournalEntry, recordedAt: number): void {
  const match = /^service:(rest|resupply):(\d+)$/.exec(entry.id);
  if (!match) {
    throw new Error(
      `Overworld session snapshot journal service entry id "${entry.id}" must match "service:<rest|resupply>:<minutes>".`,
    );
  }
  const serviceAt = Number(match[2]!);
  if (!Number.isSafeInteger(serviceAt) || serviceAt !== recordedAt) {
    throw new Error(
      "Overworld session snapshot journal service entry time does not match its timestamp.",
    );
  }
}

function assertSnapshotJournalSource(
  entry: OverworldJournalEntry,
  recordedAt: number,
  sources: OverworldJournalSourceIndex,
): void {
  const placeNames = entry.kind === "regional_arc" ? sources.regionNames : sources.townNames;
  const placeLabel = entry.kind === "regional_arc" ? "region" : "town";
  if (!placeNames.has(entry.town)) {
    throw new Error(
      `Overworld session snapshot journal ${entry.kind} references unknown ${placeLabel} "${entry.town}".`,
    );
  }

  switch (entry.kind) {
    case "area":
      assertKnownJournalSource(entry, "area:", sources.areaIds, "area");
      return;
    case "contact":
      assertKnownJournalSource(entry, "talk:", sources.characterIds, "contact");
      return;
    case "event":
      assertKnownJournalSource(entry, "investigate:", sources.eventIds, "event");
      return;
    case "job":
      assertKnownJournalSource(entry, "job:", sources.jobIds, "job");
      return;
    case "poi":
      assertKnownJournalSource(entry, "scout:", sources.poiIds, "point of interest");
      return;
    case "regional_arc":
      assertKnownJournalSource(entry, "arc:", sources.arcIds, "regional arc");
      return;
    case "resolution":
      assertKnownJournalSource(entry, "resolve:", sources.eventIds, "event resolution");
      return;
    case "road":
      assertRoadJournalSource(entry, recordedAt, sources);
      return;
    case "service":
      assertServiceJournalSource(entry, recordedAt);
      return;
    case "site":
      assertKnownJournalSource(entry, "site:", sources.siteIds, "site");
      return;
  }
}

function assertSnapshotTimeline(
  snapshot: OverworldSessionSnapshot,
  sources: OverworldJournalSourceIndex,
): void {
  assertUnique(
    "journal entry id",
    snapshot.journalEntries.map((entry) => entry.id),
  );
  assertUnique(
    "travel log entry",
    snapshot.travelLog.map((entry) => `${entry.edgeId}@${entry.arrivedAt}`),
  );

  let previousArrivedAt = Number.POSITIVE_INFINITY;
  for (const entry of snapshot.travelLog) {
    if (entry.arrivedAt > snapshot.minutes) {
      throw new Error("Overworld session snapshot travel log contains a future arrival.");
    }
    if (entry.arrivedAt > previousArrivedAt) {
      throw new Error("Overworld session snapshot travel log must be newest-first.");
    }
    previousArrivedAt = entry.arrivedAt;
  }

  let previousRecordedAt = Number.POSITIVE_INFINITY;
  for (const entry of snapshot.journalEntries) {
    const recordedAt = parseTimeLabel(entry.recordedAt);
    assertSnapshotJournalSource(entry, recordedAt, sources);
    if (recordedAt > snapshot.minutes) {
      throw new Error("Overworld session snapshot journal contains a future entry.");
    }
    if (recordedAt > previousRecordedAt) {
      throw new Error("Overworld session snapshot journal must be newest-first.");
    }
    previousRecordedAt = recordedAt;
  }
}

function assertStringSetSubset(
  label: string,
  values: readonly string[],
  parentLabel: string,
  parent: Set<string>,
): void {
  for (const value of values) {
    if (!parent.has(value)) {
      throw new Error(`Overworld session snapshot ${label} "${value}" is not in ${parentLabel}.`);
    }
  }
}

function journalSourceIdsForKind(
  snapshot: OverworldSessionSnapshot,
  kind: OverworldJournalEntry["kind"],
  prefix: string,
): Set<string> {
  const ids = new Set<string>();
  for (const entry of snapshot.journalEntries) {
    if (entry.kind === kind) ids.add(entry.id.slice(prefix.length));
  }
  return ids;
}

function assertJournalStateBinding(
  stateLabel: string,
  stateIds: readonly string[],
  journalLabel: string,
  journalIds: ReadonlySet<string>,
): void {
  const state = new Set(stateIds);
  for (const id of state) {
    if (!journalIds.has(id)) {
      throw new Error(
        `Overworld session snapshot ${stateLabel} "${id}" has no matching journal entry.`,
      );
    }
  }
  for (const id of journalIds) {
    if (!state.has(id)) {
      throw new Error(
        `Overworld session snapshot journal ${journalLabel} "${id}" is missing from saved state.`,
      );
    }
  }
}

function assertSnapshotProgressJournalBindings(snapshot: OverworldSessionSnapshot): void {
  assertJournalStateBinding(
    "visited area id",
    snapshot.visitedAreaIds,
    "visited area id",
    journalSourceIdsForKind(snapshot, "area", "area:"),
  );
  assertJournalStateBinding(
    "completed job id",
    snapshot.completedJobIds,
    "completed job id",
    journalSourceIdsForKind(snapshot, "job", "job:"),
  );
  assertJournalStateBinding(
    "explored site id",
    snapshot.exploredSiteIds,
    "explored site id",
    journalSourceIdsForKind(snapshot, "site", "site:"),
  );
  assertJournalStateBinding(
    "resolved event id",
    snapshot.resolvedEventIds,
    "resolved event id",
    journalSourceIdsForKind(snapshot, "resolution", "resolve:"),
  );
  assertJournalStateBinding(
    "completed regional arc id",
    snapshot.completedRegionalArcIds,
    "completed regional arc id",
    journalSourceIdsForKind(snapshot, "regional_arc", "arc:"),
  );
}

function addRegionRenown(target: Map<string, number>, region: string, amount: number): void {
  if (amount <= 0) return;
  target.set(region, (target.get(region) ?? 0) + amount);
}

function nodeRegionFor(
  nodesById: ReadonlyMap<string, OverworldNode>,
  nodeId: string,
  sourceLabel: string,
): string {
  const node = nodesById.get(nodeId);
  if (!node) {
    throw new Error(`Overworld session snapshot ${sourceLabel} references unknown town.`);
  }
  return node.region;
}

function roadRenownFor(
  roadEvent: OverworldRoadEvent,
  strategy: OverworldRoadEncounterStrategy,
): number {
  const risk = roadEvent.risk === "high" ? 3 : roadEvent.risk === "medium" ? 2 : 1;
  switch (strategy) {
    case "assist_travelers":
      return risk + 1;
    case "cautious_scout":
      return 1;
    case "press_on":
      return 0;
  }
}

function expectedSnapshotRegionRenown(
  snapshot: OverworldSessionSnapshot,
  sources: OverworldRenownSourceIndex,
): Map<string, number> {
  const expected = new Map<string, number>();

  for (const jobId of snapshot.completedJobIds) {
    const job = sources.jobsById.get(jobId);
    if (!job) continue;
    addRegionRenown(
      expected,
      nodeRegionFor(sources.nodesById, job.home, `completed job "${jobId}"`),
      job.difficulty,
    );
  }
  for (const siteId of snapshot.exploredSiteIds) {
    const site = sources.sitesById.get(siteId);
    if (site) addRegionRenown(expected, site.region, site.danger);
  }
  for (const eventId of snapshot.resolvedEventIds) {
    const event = sources.eventsById.get(eventId);
    if (!event) continue;
    addRegionRenown(
      expected,
      nodeRegionFor(sources.nodesById, event.home, `resolved event "${eventId}"`),
      event.intensity,
    );
  }
  for (const entry of snapshot.journalEntries) {
    if (entry.kind !== "road") continue;
    const parsed = parseRoadJournalId(entry.id);
    const roadEvent = sources.roadEventsByEdgeId.get(parsed.edgeId);
    const travelLog = sources.travelLogByArrival.get(`${parsed.edgeId}@${parsed.arrivedAt}`);
    if (!roadEvent || !travelLog) continue;
    addRegionRenown(
      expected,
      nodeRegionFor(sources.nodesById, travelLog.toId, `road journal "${entry.id}"`),
      roadRenownFor(roadEvent, parsed.strategy),
    );
  }

  return expected;
}

function assertSnapshotRegionRenown(
  snapshot: OverworldSessionSnapshot,
  sources: OverworldRenownSourceIndex,
): void {
  const expected = expectedSnapshotRegionRenown(snapshot, sources);
  const actual = new Map(snapshot.regionRenown);
  for (const [region, expectedRenown] of expected) {
    const actualRenown = actual.get(region) ?? 0;
    if (actualRenown !== expectedRenown) {
      throw new Error(
        `Overworld session snapshot region renown for "${region}" is ${actualRenown}, expected ${expectedRenown}.`,
      );
    }
  }
  for (const [region, actualRenown] of actual) {
    if (!expected.has(region)) {
      throw new Error(
        `Overworld session snapshot has unexpected region renown for "${region}" (${actualRenown}).`,
      );
    }
  }
}

function assertVisitedTownForDiscovery(
  sourceLabel: string,
  sourceId: string,
  townId: string,
  visitedTownIds: ReadonlySet<string>,
): void {
  if (!visitedTownIds.has(townId)) {
    throw new Error(
      `Overworld session snapshot ${sourceLabel} "${sourceId}" belongs to unvisited town "${townId}".`,
    );
  }
}

function assertDiscoveredAreaForDiscovery(
  sourceLabel: string,
  sourceId: string,
  areaId: string,
  discoveredAreaIds: ReadonlySet<string>,
): void {
  if (!discoveredAreaIds.has(areaId)) {
    throw new Error(
      `Overworld session snapshot ${sourceLabel} "${sourceId}" is in undiscovered area "${areaId}".`,
    );
  }
}

function assertSnapshotDiscoveryLocality(
  snapshot: OverworldSessionSnapshot,
  sources: OverworldDiscoveryLocalityIndex,
): void {
  for (const areaId of snapshot.discoveredAreaIds) {
    const home = sources.areaHomes.get(areaId);
    if (home) {
      assertVisitedTownForDiscovery("discovered area", areaId, home, sources.visitedTownIds);
    }
  }
  for (const areaId of snapshot.visitedAreaIds) {
    const home = sources.areaHomes.get(areaId);
    if (home) {
      assertVisitedTownForDiscovery("visited area", areaId, home, sources.visitedTownIds);
    }
  }
  for (const jobId of snapshot.discoveredJobIds) {
    const job = sources.jobsById.get(jobId);
    if (!job) continue;
    assertVisitedTownForDiscovery("discovered job", jobId, job.home, sources.visitedTownIds);
    assertDiscoveredAreaForDiscovery("discovered job", jobId, job.area, sources.discoveredAreaIds);
  }
  for (const siteId of snapshot.discoveredSiteIds) {
    const site = sources.sitesById.get(siteId);
    if (!site) continue;
    assertVisitedTownForDiscovery(
      "discovered site",
      siteId,
      site.nearest_town,
      sources.visitedTownIds,
    );
    assertDiscoveredAreaForDiscovery(
      "discovered site",
      siteId,
      site.area,
      sources.discoveredAreaIds,
    );
  }
  for (const questId of snapshot.discoveredQuestIds) {
    const quest = sources.questsById.get(questId);
    if (!quest) continue;
    assertVisitedTownForDiscovery("discovered quest", questId, quest.home, sources.visitedTownIds);
    assertDiscoveredAreaForDiscovery(
      "discovered quest",
      questId,
      quest.area,
      sources.discoveredAreaIds,
    );
  }
  for (const eventId of snapshot.resolvedEventIds) {
    const event = sources.eventsById.get(eventId);
    if (!event) continue;
    assertVisitedTownForDiscovery("resolved event", eventId, event.home, sources.visitedTownIds);
    assertDiscoveredAreaForDiscovery(
      "resolved event",
      eventId,
      event.area,
      sources.discoveredAreaIds,
    );
  }
}

function journalEntryRecordedAt(entry: OverworldJournalEntry): number {
  return parseTimeLabel(entry.recordedAt);
}

function assertSnapshotEventResolutionProofs(
  snapshot: OverworldSessionSnapshot,
  sources: OverworldResolutionProofIndex,
): void {
  const journalById = new Map(snapshot.journalEntries.map((entry) => [entry.id, entry]));
  for (const eventId of snapshot.resolvedEventIds) {
    const event = sources.eventsById.get(eventId);
    if (!event) continue;
    const resolution = journalById.get(`resolve:${eventId}`);
    if (!resolution) continue;
    const resolvedAt = journalEntryRecordedAt(resolution);

    const hasLocalScout = snapshot.journalEntries.some((entry) => {
      if (entry.kind !== "poi" || !entry.id.startsWith("scout:")) return false;
      const poi = sources.poisById.get(entry.id.slice("scout:".length));
      return poi?.area === event.area && journalEntryRecordedAt(entry) <= resolvedAt;
    });
    if (!hasLocalScout) {
      throw new Error(
        `Overworld session snapshot resolved event "${eventId}" is missing a local scout prerequisite.`,
      );
    }

    const hasLocalContact = snapshot.journalEntries.some((entry) => {
      if (entry.kind !== "contact" || !entry.id.startsWith("talk:")) return false;
      const character = sources.charactersById.get(entry.id.slice("talk:".length));
      return character?.area === event.area && journalEntryRecordedAt(entry) <= resolvedAt;
    });
    if (!hasLocalContact) {
      throw new Error(
        `Overworld session snapshot resolved event "${eventId}" is missing a local contact prerequisite.`,
      );
    }

    const investigation = journalById.get(`investigate:${eventId}`);
    if (!investigation || journalEntryRecordedAt(investigation) > resolvedAt) {
      throw new Error(
        `Overworld session snapshot resolved event "${eventId}" is missing an investigated event prerequisite.`,
      );
    }
  }
}

function replaceStringSet(target: Set<string>, values: readonly string[]): void {
  target.clear();
  for (const value of values) target.add(value);
}

export class OverworldSession {
  private readonly nodes: Map<string, OverworldNode>;
  private readonly worldHash: string;
  private currentId: string;
  private currentAreaId: string | null = null;
  private minutes = 8 * 60;
  private supplies = STARTING_SUPPLIES;
  private fatigue = 0;
  private readonly discoveredIds = new Set<string>();
  private readonly visitedIds = new Set<string>();
  private readonly currentAreaByTown = new Map<string, string>();
  private readonly travelLog: TravelLogEntry[] = [];
  private readonly journalEntries: OverworldJournalEntry[] = [];
  private readonly resolvedEventIds = new Set<string>();
  private readonly discoveredAreaIds = new Set<string>();
  private readonly visitedAreaIds = new Set<string>();
  private readonly discoveredJobIds = new Set<string>();
  private readonly completedJobIds = new Set<string>();
  private readonly discoveredSiteIds = new Set<string>();
  private readonly discoveredQuestIds = new Set<string>();
  private readonly exploredSiteIds = new Set<string>();
  private readonly regionRenown = new Map<string, number>();
  private readonly completedRegionalArcIds = new Set<string>();
  private pendingRoadEncounter: OverworldPendingRoadEncounter | null = null;

  constructor(private readonly world: OverworldManifest) {
    this.nodes = overworldNodesById(world);
    this.worldHash = hashState(world);
    this.currentId = world.start;
    this.markSeen(world.start);
  }

  static restore(world: OverworldManifest, rawSnapshot: unknown): OverworldSession {
    const snapshot = OverworldSessionSnapshotSchema.parse(rawSnapshot);
    const session = new OverworldSession(world);
    session.applySnapshot(snapshot);
    return session;
  }

  snapshot(): OverworldSessionSnapshot {
    return {
      version: OVERWORLD_SESSION_SAVE_VERSION,
      worldId: this.world.id,
      worldHash: this.worldHash,
      currentId: this.currentId,
      currentAreaId: this.currentAreaId,
      minutes: this.minutes,
      supplies: this.supplies,
      fatigue: this.fatigue,
      discoveredIds: sortedStringSet(this.discoveredIds),
      visitedIds: sortedStringSet(this.visitedIds),
      currentAreaByTown: sortedStringMap(this.currentAreaByTown),
      travelLog: this.travelLog.map(snapshotTravelLogEntry),
      journalEntries: cloneJson(this.journalEntries),
      resolvedEventIds: sortedStringSet(this.resolvedEventIds),
      discoveredAreaIds: sortedStringSet(this.discoveredAreaIds),
      visitedAreaIds: sortedStringSet(this.visitedAreaIds),
      discoveredJobIds: sortedStringSet(this.discoveredJobIds),
      completedJobIds: sortedStringSet(this.completedJobIds),
      discoveredSiteIds: sortedStringSet(this.discoveredSiteIds),
      discoveredQuestIds: sortedStringSet(this.discoveredQuestIds),
      exploredSiteIds: sortedStringSet(this.exploredSiteIds),
      regionRenown: sortedNumberMap(this.regionRenown),
      completedRegionalArcIds: sortedStringSet(this.completedRegionalArcIds),
      pendingRoadEncounter: this.pendingRoadEncounter
        ? { edgeId: this.pendingRoadEncounter.edgeId }
        : null,
    };
  }

  private applySnapshot(snapshot: OverworldSessionSnapshot): void {
    if (snapshot.worldId !== this.world.id) {
      throw new Error(
        `Overworld session snapshot is for world "${snapshot.worldId}", not "${this.world.id}".`,
      );
    }
    if (snapshot.worldHash !== this.worldHash) {
      throw new Error("Overworld session snapshot was made against a different world manifest.");
    }

    const nodeIds = new Set(this.world.nodes.map((node) => node.id));
    const areaIds = new Set(this.world.areas.map((area) => area.id));
    const jobIds = new Set(this.world.local_jobs.map((job) => job.id));
    const siteIds = new Set(this.world.exploration_sites.map((site) => site.id));
    const questIds = new Set(this.world.quests.map((quest) => quest.id));
    const eventIds = new Set(this.world.local_events.map((event) => event.id));
    const arcIds = new Set(this.world.regional_arcs.map((arc) => arc.id));
    const poiIds = new Set(this.world.points_of_interest.map((poi) => poi.id));
    const characterIds = new Set(this.world.characters.map((character) => character.id));
    const charactersById = new Map(
      this.world.characters.map((character) => [character.id, character]),
    );
    const jobsById = new Map(this.world.local_jobs.map((job) => [job.id, job]));
    const poisById = new Map(this.world.points_of_interest.map((poi) => [poi.id, poi]));
    const sitesById = new Map(this.world.exploration_sites.map((site) => [site.id, site]));
    const questsById = new Map(this.world.quests.map((quest) => [quest.id, quest]));
    const eventsById = new Map(this.world.local_events.map((event) => [event.id, event]));
    const edgesById = new Map(this.world.edges.map((edge) => [edge.id, edge]));
    const roadEventsByEdgeId = new Map(this.world.road_events.map((event) => [event.edge, event]));
    const regions = new Set(this.world.regions.map((region) => region.name));
    const townNames = new Set(this.world.nodes.map((node) => node.name));
    const areaHomes = new Map(this.world.areas.map((area) => [area.id, area.home]));
    const travelLogArrivals = new Set(
      snapshot.travelLog.map((entry) => `${entry.edgeId}@${entry.arrivedAt}`),
    );
    const travelLogByArrival = new Map(
      snapshot.travelLog.map((entry) => [`${entry.edgeId}@${entry.arrivedAt}`, entry]),
    );
    let restoredPendingRoadEncounter: OverworldPendingRoadEncounter | null = null;

    if (!nodeIds.has(snapshot.currentId)) {
      throw new Error(
        `Overworld session snapshot has unknown current town "${snapshot.currentId}".`,
      );
    }
    if (snapshot.currentAreaId !== null) {
      if (!areaIds.has(snapshot.currentAreaId)) {
        throw new Error(
          `Overworld session snapshot has unknown current area "${snapshot.currentAreaId}".`,
        );
      }
      if (areaHomes.get(snapshot.currentAreaId) !== snapshot.currentId) {
        throw new Error("Overworld session snapshot current area is outside the current town.");
      }
    }

    assertKnownIds("discovered town id", snapshot.discoveredIds, nodeIds);
    assertKnownIds("visited town id", snapshot.visitedIds, nodeIds);
    assertKnownIds("discovered area id", snapshot.discoveredAreaIds, areaIds);
    assertKnownIds("visited area id", snapshot.visitedAreaIds, areaIds);
    assertKnownIds("discovered job id", snapshot.discoveredJobIds, jobIds);
    assertKnownIds("completed job id", snapshot.completedJobIds, jobIds);
    assertKnownIds("discovered site id", snapshot.discoveredSiteIds, siteIds);
    assertKnownIds("explored site id", snapshot.exploredSiteIds, siteIds);
    assertKnownIds("discovered quest id", snapshot.discoveredQuestIds, questIds);
    assertKnownIds("resolved event id", snapshot.resolvedEventIds, eventIds);
    assertKnownIds("completed regional arc id", snapshot.completedRegionalArcIds, arcIds);
    assertUniqueTupleKeys("area-map town", snapshot.currentAreaByTown);
    assertUniqueTupleKeys("renown region", snapshot.regionRenown);
    assertSnapshotTimeline(snapshot, {
      arcIds,
      areaIds,
      characterIds,
      edgeIds: new Set(edgesById.keys()),
      eventIds,
      jobIds,
      poiIds,
      regionNames: regions,
      siteIds,
      townNames,
      travelLogArrivals,
    });

    if (!snapshot.discoveredIds.includes(snapshot.currentId)) {
      throw new Error("Overworld session snapshot current town is not discovered.");
    }
    if (!snapshot.visitedIds.includes(snapshot.currentId)) {
      throw new Error("Overworld session snapshot current town is not visited.");
    }
    const discoveredTownIds = new Set(snapshot.discoveredIds);
    const visitedTownIds = new Set(snapshot.visitedIds);
    const discoveredAreaIds = new Set(snapshot.discoveredAreaIds);
    const discoveredJobIds = new Set(snapshot.discoveredJobIds);
    const discoveredSiteIds = new Set(snapshot.discoveredSiteIds);
    assertStringSetSubset(
      "visited town id",
      snapshot.visitedIds,
      "discovered town ids",
      discoveredTownIds,
    );
    assertStringSetSubset(
      "visited area id",
      snapshot.visitedAreaIds,
      "discovered area ids",
      discoveredAreaIds,
    );
    assertStringSetSubset(
      "completed job id",
      snapshot.completedJobIds,
      "discovered job ids",
      discoveredJobIds,
    );
    assertStringSetSubset(
      "explored site id",
      snapshot.exploredSiteIds,
      "discovered site ids",
      discoveredSiteIds,
    );
    assertSnapshotProgressJournalBindings(snapshot);
    assertSnapshotRegionRenown(snapshot, {
      eventsById,
      jobsById,
      nodesById: this.nodes,
      roadEventsByEdgeId,
      sitesById,
      travelLogByArrival,
    });
    if (snapshot.currentAreaId !== null && !discoveredAreaIds.has(snapshot.currentAreaId)) {
      throw new Error("Overworld session snapshot current area is not discovered.");
    }
    for (const [townId, areaId] of snapshot.currentAreaByTown) {
      if (!nodeIds.has(townId)) {
        throw new Error(`Overworld session snapshot has unknown area-map town "${townId}".`);
      }
      if (!areaIds.has(areaId)) {
        throw new Error(`Overworld session snapshot has unknown saved area "${areaId}".`);
      }
      if (areaHomes.get(areaId) !== townId) {
        throw new Error(
          `Overworld session snapshot saved area "${areaId}" is outside "${townId}".`,
        );
      }
      if (!visitedTownIds.has(townId)) {
        throw new Error(`Overworld session snapshot saved area town "${townId}" is not visited.`);
      }
      if (!discoveredAreaIds.has(areaId)) {
        throw new Error(`Overworld session snapshot saved area "${areaId}" is not discovered.`);
      }
    }
    assertSnapshotDiscoveryLocality(snapshot, {
      areaHomes,
      discoveredAreaIds,
      eventsById,
      jobsById,
      questsById,
      sitesById,
      visitedTownIds,
    });
    assertSnapshotEventResolutionProofs(snapshot, {
      charactersById,
      eventsById,
      poisById,
    });
    for (const [region] of snapshot.regionRenown) {
      if (!regions.has(region)) {
        throw new Error(`Overworld session snapshot has unknown renown region "${region}".`);
      }
    }
    if (snapshot.pendingRoadEncounter) {
      const pendingEdge = edgesById.get(snapshot.pendingRoadEncounter.edgeId);
      if (!pendingEdge) {
        throw new Error(
          `Overworld session snapshot has unknown pending road "${snapshot.pendingRoadEncounter.edgeId}".`,
        );
      }
      if (pendingEdge.from !== snapshot.currentId && pendingEdge.to !== snapshot.currentId) {
        throw new Error("Overworld session snapshot pending road is not at the current town.");
      }
      const manifestEvent = overworldRoadEventFor(this.world, snapshot.pendingRoadEncounter.edgeId);
      if (!manifestEvent) {
        throw new Error(
          `Overworld session snapshot has no road event for "${snapshot.pendingRoadEncounter.edgeId}".`,
        );
      }
      const fromId = pendingEdge.from === snapshot.currentId ? pendingEdge.to : pendingEdge.from;
      const from = this.nodes.get(fromId);
      const to = this.nodes.get(snapshot.currentId);
      if (!from || !to) {
        throw new Error("Overworld session snapshot pending road references an unknown town.");
      }
      restoredPendingRoadEncounter = this.buildPendingRoadEncounter(
        from,
        to,
        pendingEdge,
        manifestEvent,
        snapshot.minutes,
      );
    }

    this.currentId = snapshot.currentId;
    this.currentAreaId = snapshot.currentAreaId;
    this.minutes = snapshot.minutes;
    this.supplies = snapshot.supplies;
    this.fatigue = snapshot.fatigue;
    replaceStringSet(this.discoveredIds, snapshot.discoveredIds);
    replaceStringSet(this.visitedIds, snapshot.visitedIds);
    this.currentAreaByTown.clear();
    for (const [townId, areaId] of snapshot.currentAreaByTown) {
      this.currentAreaByTown.set(townId, areaId);
    }
    this.travelLog.splice(
      0,
      this.travelLog.length,
      ...snapshot.travelLog.map((entry) => this.restoreTravelLogEntry(entry, edgesById)),
    );
    this.journalEntries.splice(
      0,
      this.journalEntries.length,
      ...cloneJson(snapshot.journalEntries),
    );
    replaceStringSet(this.resolvedEventIds, snapshot.resolvedEventIds);
    replaceStringSet(this.discoveredAreaIds, snapshot.discoveredAreaIds);
    replaceStringSet(this.visitedAreaIds, snapshot.visitedAreaIds);
    replaceStringSet(this.discoveredJobIds, snapshot.discoveredJobIds);
    replaceStringSet(this.completedJobIds, snapshot.completedJobIds);
    replaceStringSet(this.discoveredSiteIds, snapshot.discoveredSiteIds);
    replaceStringSet(this.discoveredQuestIds, snapshot.discoveredQuestIds);
    replaceStringSet(this.exploredSiteIds, snapshot.exploredSiteIds);
    this.regionRenown.clear();
    for (const [region, renown] of snapshot.regionRenown) this.regionRenown.set(region, renown);
    replaceStringSet(this.completedRegionalArcIds, snapshot.completedRegionalArcIds);
    this.pendingRoadEncounter = restoredPendingRoadEncounter;
  }

  private restoreTravelLogEntry(
    entry: TravelLogEntrySnapshot,
    edgesById: ReadonlyMap<string, OverworldEdge>,
  ): TravelLogEntry {
    const edge = edgesById.get(entry.edgeId);
    if (!edge) {
      throw new Error(`Overworld session snapshot has unknown travel road "${entry.edgeId}".`);
    }
    const endpointsMatch =
      (edge.from === entry.fromId && edge.to === entry.toId) ||
      (edge.from === entry.toId && edge.to === entry.fromId);
    if (!endpointsMatch) {
      throw new Error("Overworld session snapshot travel road endpoints do not match the world.");
    }
    if (entry.minutes !== edge.travel_minutes + entry.delayMinutes) {
      throw new Error("Overworld session snapshot travel minutes do not match the road.");
    }
    const from = this.nodes.get(entry.fromId);
    const to = this.nodes.get(entry.toId);
    if (!from || !to) {
      throw new Error("Overworld session snapshot travel log references an unknown town.");
    }
    return {
      edgeId: entry.edgeId,
      fromId: entry.fromId,
      toId: entry.toId,
      from: from.name,
      to: to.name,
      route: edge.route,
      distanceMi: edge.distance_mi,
      baseMinutes: edge.travel_minutes,
      delayMinutes: entry.delayMinutes,
      minutes: entry.minutes,
      arrivedAt: entry.arrivedAt,
      suppliesUsed: entry.suppliesUsed,
      suppliesAfter: entry.suppliesAfter,
      fatigueGained: entry.fatigueGained,
      fatigueAfter: entry.fatigueAfter,
      roadEvent: overworldRoadEventFor(this.world, entry.edgeId),
    };
  }

  private markSeen(nodeId: string): void {
    this.discoveredIds.add(nodeId);
    this.visitedIds.add(nodeId);
    this.discoverInitialAreaForTown(nodeId);
    this.setCurrentAreaForTown(nodeId);
    for (const edge of overworldEdgesFrom(this.world, nodeId)) {
      this.discoveredIds.add(edge.destination.id);
    }
  }

  private currentNode(): OverworldNode {
    const current = this.nodes.get(this.currentId);
    if (!current) throw new Error(`Current overworld node "${this.currentId}" is missing.`);
    return current;
  }

  private recordAction(
    entry: Omit<OverworldJournalEntry, "recordedAt">,
    minutes: number,
  ): OverworldActionResult {
    const existing = this.journalEntries.find((candidate) => candidate.id === entry.id);
    if (existing) return { minutes: 0, alreadyKnown: true, entry: existing };
    this.minutes += minutes;
    const recorded: OverworldJournalEntry = {
      ...entry,
      recordedAt: timeLabel(this.minutes),
    };
    this.journalEntries.unshift(recorded);
    return { minutes, alreadyKnown: false, entry: recorded };
  }

  private recordLocalAction<Kind extends OverworldLocalActionKind>(
    action: OverworldLocalActionDescriptor<Kind>,
    town: string,
  ): OverworldActionResult {
    return this.recordAction(
      {
        id: action.id,
        kind: action.kind,
        town,
        title: action.title,
        text: action.text,
      },
      action.minutes,
    );
  }

  private recordRepeatableEntry(
    entry: Omit<OverworldJournalEntry, "recordedAt">,
    minutes: number,
  ): OverworldJournalEntry {
    this.minutes += minutes;
    const recorded: OverworldJournalEntry = {
      ...entry,
      id: `${entry.id}:${this.minutes}`,
      recordedAt: timeLabel(this.minutes),
    };
    this.journalEntries.unshift(recorded);
    return recorded;
  }

  private hasJournalEntry(id: string): boolean {
    return this.journalEntries.some((entry) => entry.id === id);
  }

  private localAreas(nodeId: string): OverworldArea[] {
    return overworldAreasAt(this.world, nodeId);
  }

  private areaById(areaId: string): OverworldArea | null {
    return this.world.areas.find((area) => area.id === areaId) ?? null;
  }

  private setCurrentAreaForTown(nodeId: string): void {
    const local = this.localAreas(nodeId);
    const saved = this.currentAreaByTown.get(nodeId);
    const next = saved && local.some((area) => area.id === saved) ? saved : (local[0]?.id ?? null);
    this.currentAreaId = next;
    if (next) {
      this.currentAreaByTown.set(nodeId, next);
      this.discoveredAreaIds.add(next);
    }
  }

  private currentArea(): OverworldArea | null {
    if (this.currentAreaId) {
      const area = this.areaById(this.currentAreaId);
      if (area?.home === this.currentId) return area;
    }
    this.setCurrentAreaForTown(this.currentId);
    return this.currentAreaId ? this.areaById(this.currentAreaId) : null;
  }

  private visibleAreaExits(): OverworldAreaExit[] {
    const area = this.currentArea();
    if (!area) return [];
    return overworldAreaEdgesFrom(this.world, area.id).filter((exit) =>
      this.discoveredAreaIds.has(exit.destination.id),
    );
  }

  private discoveredAreasAt(nodeId: string): OverworldArea[] {
    return this.localAreas(nodeId).filter((area) => this.discoveredAreaIds.has(area.id));
  }

  private hiddenAreaCountAt(nodeId: string): number {
    return this.localAreas(nodeId).filter((area) => !this.discoveredAreaIds.has(area.id)).length;
  }

  private currentAreaIdOrThrow(): string {
    const area = this.currentArea();
    if (!area) throw new Error("There is no current local area in this town.");
    return area.id;
  }

  private currentAreaPois(): OverworldPoi[] {
    return overworldPoisInArea(this.world, this.currentAreaIdOrThrow());
  }

  private currentAreaCharacters(): OverworldCharacter[] {
    return overworldCharactersInArea(this.world, this.currentAreaIdOrThrow());
  }

  private currentAreaEvents(): OverworldLocalEvent[] {
    return overworldEventsInArea(this.world, this.currentAreaIdOrThrow());
  }

  private discoverInitialAreaForTown(nodeId: string): void {
    const firstArea = this.localAreas(nodeId)[0];
    if (firstArea) this.discoveredAreaIds.add(firstArea.id);
  }

  private discoverNextAreaForTown(nodeId: string): OverworldArea[] {
    const area = this.localAreas(nodeId).find(
      (candidate) => !this.discoveredAreaIds.has(candidate.id),
    );
    if (!area) return [];
    this.discoveredAreaIds.add(area.id);
    return [area];
  }

  private localJobs(nodeId: string): OverworldLocalJob[] {
    return overworldJobsAt(this.world, nodeId);
  }

  private discoveredJobsAt(nodeId: string): OverworldLocalJob[] {
    return this.localJobs(nodeId).filter((job) => this.discoveredJobIds.has(job.id));
  }

  private discoveredJobsInCurrentArea(): OverworldLocalJob[] {
    const areaId = this.currentAreaIdOrThrow();
    return this.discoveredJobsAt(this.currentId).filter((job) => job.area === areaId);
  }

  private hiddenJobCountAt(nodeId: string): number {
    return this.localJobs(nodeId).filter((job) => !this.discoveredJobIds.has(job.id)).length;
  }

  private discoverNextJobForTown(nodeId: string): OverworldLocalJob[] {
    const job = this.localJobs(nodeId).find(
      (candidate) =>
        this.discoveredAreaIds.has(candidate.area) && !this.discoveredJobIds.has(candidate.id),
    );
    if (!job) return [];
    this.discoveredJobIds.add(job.id);
    return [job];
  }

  private localSites(nodeId: string): OverworldExplorationSite[] {
    return overworldExplorationSitesNear(this.world, nodeId);
  }

  private discoveredSitesAt(nodeId: string): OverworldExplorationSite[] {
    return this.localSites(nodeId).filter((site) => this.discoveredSiteIds.has(site.id));
  }

  private currentAreaSites(): OverworldExplorationSite[] {
    return overworldExplorationSitesInArea(this.world, this.currentAreaIdOrThrow());
  }

  private discoveredSitesInCurrentArea(): OverworldExplorationSite[] {
    return this.currentAreaSites().filter((site) => this.discoveredSiteIds.has(site.id));
  }

  private hiddenSiteCountInCurrentArea(): number {
    return this.currentAreaSites().filter((site) => !this.discoveredSiteIds.has(site.id)).length;
  }

  private localQuests(nodeId: string): OverworldQuest[] {
    return overworldQuestsAt(this.world, nodeId);
  }

  private discoveredQuestsAt(nodeId: string): OverworldQuestView[] {
    return this.localQuests(nodeId)
      .filter((quest) => this.discoveredQuestIds.has(quest.id))
      .map(questView);
  }

  private hiddenQuestCountAt(nodeId: string): number {
    return this.localQuests(nodeId).filter((quest) => !this.discoveredQuestIds.has(quest.id))
      .length;
  }

  private discoverNextSiteForTown(nodeId: string): OverworldExplorationSite[] {
    if (nodeId !== this.currentId) return [];
    const site = this.currentAreaSites().find(
      (candidate) => !this.discoveredSiteIds.has(candidate.id),
    );
    if (!site) return [];
    this.discoveredSiteIds.add(site.id);
    return [site];
  }

  private discoverNextQuestForTown(nodeId: string): OverworldQuestView[] {
    const quest = this.localQuests(nodeId).find(
      (candidate) =>
        this.discoveredAreaIds.has(candidate.area) && !this.discoveredQuestIds.has(candidate.id),
    );
    if (!quest) return [];
    this.discoveredQuestIds.add(quest.id);
    return [questView(quest)];
  }

  private questAreaName(quest: OverworldQuest): string {
    return this.areaById(quest.area)?.name ?? quest.area;
  }

  private estimateRoute(plan: OverworldRoutePlan): OverworldRouteEstimate {
    let supplies = this.supplies;
    let fatigue = this.fatigue;
    let baseMinutes = 0;
    let delayMinutes = 0;
    let suppliesNeeded = 0;
    let suppliesUsed = 0;
    let supplyDeficit = 0;
    let fatigueGained = 0;

    for (const step of plan.steps) {
      const stepMinutes = step.edge.travel_minutes;
      const stepSupplyCost = travelSupplyCost(stepMinutes);
      const stepSuppliesUsed = Math.min(supplies, stepSupplyCost);
      const stepSupplyDeficit = stepSupplyCost - stepSuppliesUsed;
      const stepDelay = travelDelayMinutes(stepMinutes, fatigue, stepSupplyDeficit);
      const stepFatigueGained =
        travelFatigueGain(stepMinutes, step.roadEvent) + stepSupplyDeficit * 4;

      baseMinutes += stepMinutes;
      delayMinutes += stepDelay;
      suppliesNeeded += stepSupplyCost;
      suppliesUsed += stepSuppliesUsed;
      supplyDeficit += stepSupplyDeficit;
      fatigueGained += stepFatigueGained;
      supplies -= stepSuppliesUsed;
      fatigue = Math.min(MAX_FATIGUE, fatigue + stepFatigueGained);
    }

    return {
      baseMinutes,
      delayMinutes,
      elapsedMinutes: baseMinutes + delayMinutes,
      suppliesNeeded,
      suppliesUsed,
      supplyDeficit,
      suppliesAfter: supplies,
      fatigueGained,
      fatigueAfter: fatigue,
      travelConditionAfter: travelCondition(fatigue, supplies),
    };
  }

  private routeWithEstimate(plan: OverworldRoutePlan): OverworldSessionRoutePlan {
    return {
      ...plan,
      estimate: this.estimateRoute(plan),
    };
  }

  private discoveredRouteOptions(): OverworldSessionRoutePlan[] {
    const current = this.currentNode();
    return [...this.discoveredIds]
      .filter((id) => id !== this.currentId)
      .map((id) => planOverworldRoute(this.world, this.currentId, id, this.discoveredIds))
      .filter((plan): plan is OverworldRoutePlan => plan !== null && plan.steps.length > 0)
      .map((plan) => this.routeWithEstimate(plan))
      .sort(
        (a, b) =>
          Number(b.destination.region === current.region) -
            Number(a.destination.region === current.region) ||
          a.estimate.elapsedMinutes - b.estimate.elapsedMinutes ||
          a.totalMinutes - b.totalMinutes ||
          b.destination.population_2025 - a.destination.population_2025 ||
          a.destination.name.localeCompare(b.destination.name),
      );
  }

  private resolvedAnchorTownIdsForArc(arc: OverworldRegionalArc): Set<string> {
    const anchorIds = new Set(arc.anchor_towns);
    const resolved = new Set<string>();
    for (const eventId of this.resolvedEventIds) {
      const event = this.world.local_events.find((candidate) => candidate.id === eventId);
      if (event && anchorIds.has(event.home)) resolved.add(event.home);
    }
    return resolved;
  }

  private progressForArc(arc: OverworldRegionalArc): OverworldRegionalArcProgress {
    const resolvedAnchorIds = this.resolvedAnchorTownIdsForArc(arc);
    const anchorTowns = arc.anchor_towns
      .map((id) => this.nodes.get(id))
      .filter((node): node is OverworldNode => node !== undefined);
    return {
      id: arc.id,
      region: arc.region,
      title: arc.title,
      summary: arc.summary,
      requiredResolutions: arc.required_resolutions,
      resolvedInRegion: resolvedAnchorIds.size,
      anchorTowns,
      resolvedAnchorTowns: anchorTowns.filter((town) => resolvedAnchorIds.has(town.id)),
      completed: this.completedRegionalArcIds.has(arc.id),
      reward: arc.reward,
    };
  }

  private regionalArcProgress(): OverworldRegionalArcProgress[] {
    const currentRegion = this.currentNode().region;
    return this.world.regional_arcs
      .map((arc) => this.progressForArc(arc))
      .sort(
        (a, b) =>
          Number(b.region === currentRegion) - Number(a.region === currentRegion) ||
          Number(a.completed) - Number(b.completed) ||
          a.region.localeCompare(b.region),
      );
  }

  private checkRegionalArcCompletion(region: string): void {
    const completedAt = timeLabel(this.minutes);
    for (const arc of this.world.regional_arcs.filter((candidate) => candidate.region === region)) {
      if (this.completedRegionalArcIds.has(arc.id)) continue;
      if (this.resolvedAnchorTownIdsForArc(arc).size < arc.required_resolutions) continue;
      this.completedRegionalArcIds.add(arc.id);
      this.journalEntries.unshift({
        id: `arc:${arc.id}`,
        kind: "regional_arc",
        town: region,
        title: `Completed ${arc.title}`,
        text: arc.reward,
        recordedAt: completedAt,
      });
    }
  }

  private roadEncounterOptions(roadEvent: OverworldRoadEvent): OverworldRoadEncounterOption[] {
    const risk = roadEvent.risk === "high" ? 3 : roadEvent.risk === "medium" ? 2 : 1;
    return [
      {
        strategy: "cautious_scout",
        label: "Scout the road problem",
        minutes: 15 + risk * 10,
        suppliesCost: 0,
        fatigueGained: 0,
        renownGained: 1,
        outcome:
          "You slow down, read the situation, and leave a useful warning for the next traveler.",
      },
      {
        strategy: "assist_travelers",
        label: "Help resolve it",
        minutes: 25 + risk * 15,
        suppliesCost: risk >= 3 ? 2 : 1,
        fatigueGained: risk,
        renownGained: risk + 1,
        outcome:
          "You spend supplies and effort stabilizing the road trouble instead of merely passing it.",
      },
      {
        strategy: "press_on",
        label: "Press on",
        minutes: 0,
        suppliesCost: 0,
        fatigueGained: risk,
        renownGained: 0,
        outcome:
          "You keep moving and accept the extra strain rather than spending daylight on the encounter.",
      },
    ];
  }

  private setPendingRoadEncounter(
    from: OverworldNode,
    to: OverworldNode,
    edge: OverworldExit,
    roadEvent: OverworldRoadEvent | null,
  ): void {
    if (!roadEvent) {
      this.pendingRoadEncounter = null;
      return;
    }
    this.pendingRoadEncounter = this.buildPendingRoadEncounter(
      from,
      to,
      edge,
      roadEvent,
      this.minutes,
    );
  }

  private buildPendingRoadEncounter(
    from: OverworldNode,
    to: OverworldNode,
    edge: OverworldEdge,
    roadEvent: OverworldRoadEvent,
    arrivedAtMinutes: number,
  ): OverworldPendingRoadEncounter {
    return {
      id: `road:${edge.id}:${arrivedAtMinutes}`,
      edgeId: edge.id,
      from: from.name,
      to: to.name,
      route: edge.route,
      arrivedAt: timeLabel(arrivedAtMinutes),
      event: roadEvent,
      options: this.roadEncounterOptions(roadEvent),
    };
  }

  view(): OverworldView {
    const current = this.currentNode();
    return {
      world: this.world.name,
      timeLabel: timeLabel(this.minutes),
      current,
      currentArea: this.currentArea(),
      areaExits: this.visibleAreaExits(),
      exits: overworldEdgesFrom(this.world, this.currentId),
      areas: this.discoveredAreasAt(this.currentId),
      hiddenAreaCount: this.hiddenAreaCountAt(this.currentId),
      pois: this.currentAreaPois(),
      characters: this.currentAreaCharacters(),
      events: this.currentAreaEvents(),
      jobs: this.discoveredJobsInCurrentArea(),
      hiddenJobCount: this.hiddenJobCountAt(this.currentId),
      sites: this.discoveredSitesInCurrentArea(),
      hiddenSiteCount: this.hiddenSiteCountInCurrentArea(),
      quests: this.discoveredQuestsAt(this.currentId),
      hiddenQuestCount: this.hiddenQuestCountAt(this.currentId),
      routeOptions: this.discoveredRouteOptions(),
      discovered: [...this.discoveredIds]
        .map((id) => this.nodes.get(id))
        .filter((node): node is OverworldNode => node !== undefined)
        .sort((a, b) => b.population_2025 - a.population_2025 || a.name.localeCompare(b.name)),
      visitedCount: this.visitedIds.size,
      totalTowns: this.world.nodes.length,
      supplies: this.supplies,
      maxSupplies: MAX_SUPPLIES,
      fatigue: this.fatigue,
      travelCondition: travelCondition(this.fatigue, this.supplies),
      journal: [...this.journalEntries],
      discoveredAreaIds: [...this.discoveredAreaIds].sort(),
      discoveredJobIds: [...this.discoveredJobIds].sort(),
      visitedAreaIds: [...this.visitedAreaIds].sort(),
      completedJobIds: [...this.completedJobIds].sort(),
      discoveredSiteIds: [...this.discoveredSiteIds].sort(),
      discoveredQuestIds: [...this.discoveredQuestIds].sort(),
      exploredSiteIds: [...this.exploredSiteIds].sort(),
      resolvedEventIds: [...this.resolvedEventIds].sort(),
      regionRenown: Object.fromEntries([...this.regionRenown.entries()].sort()),
      regionalArcs: this.regionalArcProgress(),
      completedRegionalArcIds: [...this.completedRegionalArcIds].sort(),
      pendingRoadEncounter: this.pendingRoadEncounter,
      log: [...this.travelLog],
    };
  }

  startQuest(questId: string): OverworldQuestView {
    const quest = this.localQuests(this.currentId).find((candidate) => candidate.id === questId);
    if (!quest) throw new Error("That quest lead is not in this town.");
    if (!this.discoveredQuestIds.has(quest.id)) {
      throw new Error("Discover that local quest lead before starting it.");
    }
    const area = this.currentArea();
    if (area?.id !== quest.area) {
      throw new Error(`Move to ${this.questAreaName(quest)} before starting ${quest.title}.`);
    }
    return questView(quest);
  }

  scoutPoi(poiId: string): OverworldActionResult {
    const current = this.currentNode();
    const poi = overworldPoisAt(this.world, this.currentId).find(
      (candidate) => candidate.id === poiId,
    );
    if (!poi) throw new Error("That point of interest is not in this town.");
    if (poi.area !== this.currentAreaIdOrThrow()) {
      throw new Error("Move to that local area before scouting this point of interest.");
    }
    const result = this.recordLocalAction(describeOverworldPoiAction(poi, current), current.name);
    return {
      ...result,
      discoveredAreas: result.alreadyKnown ? [] : this.discoverNextAreaForTown(current.id),
      discoveredJobs: result.alreadyKnown ? [] : this.discoverNextJobForTown(current.id),
      discoveredSites: result.alreadyKnown ? [] : this.discoverNextSiteForTown(current.id),
      discoveredQuests: result.alreadyKnown ? [] : this.discoverNextQuestForTown(current.id),
    };
  }

  exploreArea(areaId: string): OverworldActionResult {
    const current = this.currentNode();
    const area = this.localAreas(this.currentId).find((candidate) => candidate.id === areaId);
    if (!area) throw new Error("That area is not in this town.");
    if (!this.discoveredAreaIds.has(area.id)) {
      throw new Error("Scout, talk, investigate, or explore known areas to map that district.");
    }
    if (this.currentArea()?.id !== area.id) {
      throw new Error("Move to that local area before exploring it.");
    }
    if (this.visitedAreaIds.has(area.id)) {
      const existing = this.journalEntries.find((entry) => entry.id === `area:${area.id}`);
      if (existing) {
        return {
          minutes: 0,
          alreadyKnown: true,
          entry: existing,
          discoveredAreas: [],
          discoveredJobs: [],
          discoveredSites: [],
          discoveredQuests: [],
        };
      }
    }

    const result = this.recordLocalAction(describeOverworldAreaAction(area), current.name);
    if (!result.alreadyKnown) this.visitedAreaIds.add(area.id);
    return {
      ...result,
      discoveredAreas: result.alreadyKnown ? [] : this.discoverNextAreaForTown(current.id),
      discoveredJobs: result.alreadyKnown ? [] : this.discoverNextJobForTown(current.id),
      discoveredSites: result.alreadyKnown ? [] : this.discoverNextSiteForTown(current.id),
      discoveredQuests: result.alreadyKnown ? [] : this.discoverNextQuestForTown(current.id),
    };
  }

  moveArea(areaRouteId: string): OverworldAreaTravelResult {
    const currentArea = this.currentArea();
    if (!currentArea) throw new Error("There is no current local area in this town.");
    const edge = overworldAreaEdgesFrom(this.world, currentArea.id).find(
      (candidate) => candidate.id === areaRouteId,
    );
    if (!edge) throw new Error("That local route is not reachable from here.");
    if (!this.discoveredAreaIds.has(edge.destination.id)) {
      throw new Error("Map that local area before moving there.");
    }
    this.minutes += edge.travel_minutes;
    this.currentAreaId = edge.destination.id;
    this.currentAreaByTown.set(this.currentId, edge.destination.id);
    return {
      from: currentArea,
      to: edge.destination,
      route: edge.route,
      minutes: edge.travel_minutes,
      arrivedAt: timeLabel(this.minutes),
    };
  }

  workLocalJob(jobId: string): OverworldActionResult {
    const current = this.currentNode();
    const job = this.localJobs(this.currentId).find((candidate) => candidate.id === jobId);
    if (!job) throw new Error("That local job is not in this town.");
    if (!this.discoveredJobIds.has(job.id)) {
      throw new Error("Explore local areas or talk to locals before working that job.");
    }
    if (job.area !== this.currentAreaIdOrThrow()) {
      throw new Error("Move to that local area before working that job.");
    }
    if (this.completedJobIds.has(job.id)) {
      const existing = this.journalEntries.find((entry) => entry.id === `job:${job.id}`);
      if (existing) {
        return {
          minutes: 0,
          alreadyKnown: true,
          entry: existing,
          discoveredAreas: [],
          discoveredJobs: [],
          discoveredSites: [],
          discoveredQuests: [],
        };
      }
    }

    const area = this.localAreas(this.currentId).find((candidate) => candidate.id === job.area);
    const action = describeOverworldJobAction(job, area ?? null);
    const result = this.recordLocalAction(action, current.name);
    if (!result.alreadyKnown) {
      this.completedJobIds.add(job.id);
      this.regionRenown.set(
        current.region,
        (this.regionRenown.get(current.region) ?? 0) + (action.regionalRenown ?? 0),
      );
    }
    return {
      ...result,
      discoveredAreas: result.alreadyKnown ? [] : this.discoverNextAreaForTown(current.id),
      discoveredJobs: result.alreadyKnown ? [] : this.discoverNextJobForTown(current.id),
      discoveredSites: result.alreadyKnown ? [] : this.discoverNextSiteForTown(current.id),
      discoveredQuests: result.alreadyKnown ? [] : this.discoverNextQuestForTown(current.id),
    };
  }

  talkToCharacter(characterId: string): OverworldActionResult {
    const current = this.currentNode();
    const character = overworldCharactersAt(this.world, this.currentId).find(
      (candidate) => candidate.id === characterId,
    );
    if (!character) throw new Error("That contact is not in this town.");
    if (character.area !== this.currentAreaIdOrThrow()) {
      throw new Error("Move to that local area before talking to that contact.");
    }
    const result = this.recordLocalAction(describeOverworldContactAction(character), current.name);
    return {
      ...result,
      discoveredAreas: result.alreadyKnown ? [] : this.discoverNextAreaForTown(current.id),
      discoveredJobs: result.alreadyKnown ? [] : this.discoverNextJobForTown(current.id),
      discoveredSites: result.alreadyKnown ? [] : this.discoverNextSiteForTown(current.id),
      discoveredQuests: result.alreadyKnown ? [] : this.discoverNextQuestForTown(current.id),
    };
  }

  investigateEvent(eventId: string): OverworldActionResult {
    const current = this.currentNode();
    const event = overworldEventsAt(this.world, this.currentId).find(
      (candidate) => candidate.id === eventId,
    );
    if (!event) throw new Error("That event is not active in this town.");
    if (event.area !== this.currentAreaIdOrThrow()) {
      throw new Error("Move to that local area before investigating that event.");
    }
    const result = this.recordLocalAction(describeOverworldEventAction(event), current.name);
    return {
      ...result,
      discoveredAreas: result.alreadyKnown ? [] : this.discoverNextAreaForTown(current.id),
      discoveredJobs: result.alreadyKnown ? [] : this.discoverNextJobForTown(current.id),
      discoveredSites: result.alreadyKnown ? [] : this.discoverNextSiteForTown(current.id),
      discoveredQuests: result.alreadyKnown ? [] : this.discoverNextQuestForTown(current.id),
    };
  }

  resolveEvent(eventId: string): OverworldActionResult {
    const current = this.currentNode();
    const event = overworldEventsAt(this.world, this.currentId).find(
      (candidate) => candidate.id === eventId,
    );
    if (!event) throw new Error("That event is not active in this town.");
    if (event.area !== this.currentAreaIdOrThrow()) {
      throw new Error("Move to that local area before resolving that event.");
    }
    if (this.resolvedEventIds.has(event.id)) {
      const existing = this.journalEntries.find((entry) => entry.id === `resolve:${event.id}`);
      if (existing) return { minutes: 0, alreadyKnown: true, entry: existing };
    }

    const scoutedPoi = overworldPoisInArea(this.world, event.area).some((poi) =>
      this.hasJournalEntry(`scout:${poi.id}`),
    );
    const talkedContact = overworldCharactersInArea(this.world, event.area).some((character) =>
      this.hasJournalEntry(`talk:${character.id}`),
    );
    const investigatedEvent = this.hasJournalEntry(`investigate:${event.id}`);
    const missing = [
      !scoutedPoi ? "scout a local point of interest" : null,
      !talkedContact ? "talk to a local contact" : null,
      !investigatedEvent ? "investigate the event" : null,
    ].filter((step): step is string => step !== null);
    if (missing.length > 0) {
      throw new Error(`Before resolving this event, ${missing.join(", ")}.`);
    }

    const result = this.recordAction(
      {
        id: `resolve:${event.id}`,
        kind: "resolution",
        town: current.name,
        title: `Resolved ${event.title}`,
        text: `${current.name} stabilizes around ${event.title}. Your work reduces ${event.pressure} pressure and earns ${event.intensity} ${current.region} renown.`,
      },
      30 + event.intensity * 10,
    );
    if (!result.alreadyKnown) {
      this.resolvedEventIds.add(event.id);
      this.regionRenown.set(
        current.region,
        (this.regionRenown.get(current.region) ?? 0) + event.intensity,
      );
      this.checkRegionalArcCompletion(current.region);
    }
    return {
      ...result,
      discoveredAreas: result.alreadyKnown ? [] : this.discoverNextAreaForTown(current.id),
      discoveredJobs: result.alreadyKnown ? [] : this.discoverNextJobForTown(current.id),
      discoveredSites: result.alreadyKnown ? [] : this.discoverNextSiteForTown(current.id),
      discoveredQuests: result.alreadyKnown ? [] : this.discoverNextQuestForTown(current.id),
    };
  }

  exploreSite(siteId: string): OverworldActionResult {
    const current = this.currentNode();
    const site = this.localSites(this.currentId).find((candidate) => candidate.id === siteId);
    if (!site) throw new Error("That exploration site is not reachable from this town.");
    if (site.area !== this.currentAreaIdOrThrow()) {
      throw new Error("Move to that local area before exploring this site.");
    }
    if (!this.discoveredSiteIds.has(site.id)) {
      throw new Error("Scout a local point of interest before exploring this site.");
    }
    if (this.exploredSiteIds.has(site.id)) {
      const existing = this.journalEntries.find((entry) => entry.id === `site:${site.id}`);
      if (existing) return { minutes: 0, alreadyKnown: true, entry: existing };
    }

    const action = describeOverworldSiteAction(site);
    const result = this.recordLocalAction(action, current.name);
    if (!result.alreadyKnown) {
      this.exploredSiteIds.add(site.id);
      this.regionRenown.set(
        site.region,
        (this.regionRenown.get(site.region) ?? 0) + (action.regionalRenown ?? 0),
      );
    }
    return {
      ...result,
      discoveredAreas: result.alreadyKnown ? [] : this.discoverNextAreaForTown(current.id),
      discoveredJobs: result.alreadyKnown ? [] : this.discoverNextJobForTown(current.id),
      discoveredSites: result.alreadyKnown ? [] : this.discoverNextSiteForTown(current.id),
      discoveredQuests: result.alreadyKnown ? [] : this.discoverNextQuestForTown(current.id),
    };
  }

  restAtTown(): OverworldServiceResult {
    const current = this.currentNode();
    if (!current.services.includes("inn") && !current.services.includes("healer")) {
      throw new Error("There is no inn or healer here to rest safely.");
    }
    const fatigueBefore = this.fatigue;
    const suppliesBefore = this.supplies;
    if (fatigueBefore === 0) {
      return {
        action: "rest",
        minutes: 0,
        changed: false,
        suppliesBefore,
        suppliesAfter: this.supplies,
        fatigueBefore,
        fatigueAfter: this.fatigue,
        message: "You are already rested.",
        entry: null,
      };
    }
    const minutes = Math.max(180, Math.ceil(fatigueBefore / 20) * 60);
    this.fatigue = 0;
    const entry = this.recordRepeatableEntry(
      {
        id: "service:rest",
        kind: "service",
        town: current.name,
        title: `Rested in ${current.name}`,
        text: `You spend ${minutes} minutes recovering at a safe local service. Fatigue falls from ${fatigueBefore} to 0.`,
      },
      minutes,
    );
    return {
      action: "rest",
      minutes,
      changed: true,
      suppliesBefore,
      suppliesAfter: this.supplies,
      fatigueBefore,
      fatigueAfter: this.fatigue,
      message: entry.text,
      entry,
    };
  }

  resupplyAtTown(): OverworldServiceResult {
    const current = this.currentNode();
    if (
      !current.services.includes("market") &&
      !current.services.includes("inn") &&
      !current.services.includes("stable")
    ) {
      throw new Error("There is no market, inn, or stable here to resupply.");
    }
    const fatigueBefore = this.fatigue;
    const suppliesBefore = this.supplies;
    if (suppliesBefore >= MAX_SUPPLIES) {
      return {
        action: "resupply",
        minutes: 0,
        changed: false,
        suppliesBefore,
        suppliesAfter: this.supplies,
        fatigueBefore,
        fatigueAfter: this.fatigue,
        message: "Your supplies are already full.",
        entry: null,
      };
    }
    this.supplies = MAX_SUPPLIES;
    const minutes = 45;
    const entry = this.recordRepeatableEntry(
      {
        id: "service:resupply",
        kind: "service",
        town: current.name,
        title: `Resupplied in ${current.name}`,
        text: `You spend ${minutes} minutes buying food, lamp oil, and road gear. Supplies rise from ${suppliesBefore} to ${MAX_SUPPLIES}.`,
      },
      minutes,
    );
    return {
      action: "resupply",
      minutes,
      changed: true,
      suppliesBefore,
      suppliesAfter: this.supplies,
      fatigueBefore,
      fatigueAfter: this.fatigue,
      message: entry.text,
      entry,
    };
  }

  planRoute(destinationId: string): OverworldSessionRoutePlan {
    if (destinationId === this.currentId) throw new Error("You are already there.");
    if (!this.discoveredIds.has(destinationId)) {
      throw new Error("That destination is not discovered yet.");
    }
    const plan = planOverworldRoute(this.world, this.currentId, destinationId, this.discoveredIds);
    if (!plan) throw new Error("No discovered route reaches that destination yet.");
    return this.routeWithEstimate(plan);
  }

  resolveRoadEncounter(strategy: OverworldRoadEncounterStrategy): OverworldRoadEncounterResult {
    const encounter = this.pendingRoadEncounter;
    if (!encounter) throw new Error("There is no pending road encounter.");
    const option = encounter.options.find((candidate) => candidate.strategy === strategy);
    if (!option) throw new Error(`Unknown road encounter strategy "${strategy}".`);

    const suppliesUsed = Math.min(this.supplies, option.suppliesCost);
    const supplyDeficit = option.suppliesCost - suppliesUsed;
    const fatigueGained = option.fatigueGained + supplyDeficit * 3;
    this.supplies -= suppliesUsed;
    this.fatigue = Math.min(MAX_FATIGUE, this.fatigue + fatigueGained);
    this.minutes += option.minutes;
    const current = this.currentNode();
    if (option.renownGained > 0) {
      this.regionRenown.set(
        current.region,
        (this.regionRenown.get(current.region) ?? 0) + option.renownGained,
      );
    }
    this.pendingRoadEncounter = null;
    const entry: OverworldJournalEntry = {
      id: `${encounter.id}:${strategy}`,
      kind: "road",
      town: current.name,
      title: `${option.label}: ${encounter.event.title}`,
      text: `${encounter.event.summary} ${option.outcome}${supplyDeficit > 0 ? " Lacking supplies made the work more exhausting." : ""}`,
      recordedAt: timeLabel(this.minutes),
    };
    this.journalEntries.unshift(entry);
    return {
      strategy,
      minutes: option.minutes,
      suppliesUsed,
      fatigueGained,
      renownGained: option.renownGained,
      encounter,
      entry,
    };
  }

  travel(edgeId: string): TravelLogEntry {
    if (this.pendingRoadEncounter) {
      throw new Error("Address the pending road encounter before choosing another road.");
    }
    const edge = overworldEdgesFrom(this.world, this.currentId).find(
      (candidate) => candidate.id === edgeId,
    );
    if (!edge) throw new Error("That road is not reachable from here.");
    const from = this.currentNode();
    const roadEvent = overworldRoadEventFor(this.world, edge.id);
    const supplyCost = travelSupplyCost(edge.travel_minutes);
    const suppliesUsed = Math.min(this.supplies, supplyCost);
    const supplyDeficit = supplyCost - suppliesUsed;
    const fatigueBefore = this.fatigue;
    const delayMinutes = travelDelayMinutes(edge.travel_minutes, fatigueBefore, supplyDeficit);
    const elapsedMinutes = edge.travel_minutes + delayMinutes;
    const fatigueGained = travelFatigueGain(edge.travel_minutes, roadEvent) + supplyDeficit * 4;
    this.supplies -= suppliesUsed;
    this.fatigue = Math.min(MAX_FATIGUE, this.fatigue + fatigueGained);
    this.minutes += elapsedMinutes;
    this.currentId = edge.destination.id;
    this.markSeen(this.currentId);
    this.setPendingRoadEncounter(from, edge.destination, edge, roadEvent);
    const entry: TravelLogEntry = {
      edgeId: edge.id,
      fromId: from.id,
      toId: edge.destination.id,
      from: from.name,
      to: edge.destination.name,
      route: edge.route,
      distanceMi: edge.distance_mi,
      baseMinutes: edge.travel_minutes,
      delayMinutes,
      minutes: elapsedMinutes,
      arrivedAt: this.minutes,
      suppliesUsed,
      suppliesAfter: this.supplies,
      fatigueGained,
      fatigueAfter: this.fatigue,
      roadEvent,
    };
    this.travelLog.unshift(entry);
    return entry;
  }
}
