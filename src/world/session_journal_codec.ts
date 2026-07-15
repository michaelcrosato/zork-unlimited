import {
  isOverworldRoadEncounterStrategy,
  type OverworldRoadEncounterStrategy,
} from "./travel_mechanics.js";
import type { CampaignServiceAction } from "./campaign_service_rules.js";

export type RoadJournalIdParts = {
  edgeId: string;
  arrivedAt: number;
  strategy: OverworldRoadEncounterStrategy;
};

export type ServiceJournalIdParts = {
  action: CampaignServiceAction;
  recordedAt: number;
};

export function timeLabel(minutes: number): string {
  const day = Math.floor(minutes / 1440) + 1;
  const minuteOfDay = minutes % 1440;
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return `Day ${day}, ${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

export function parseTimeLabel(label: string): number {
  const match = /^Day ([1-9]\d*), ([01]\d|2[0-3]):([0-5]\d)$/.exec(label);
  if (!match) {
    throw new Error(`Overworld session snapshot has malformed journal timestamp "${label}".`);
  }
  const day = Number(match[1]);
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  return (day - 1) * 1440 + hour * 60 + minute;
}

export function parseRoadJournalId(entryId: string): RoadJournalIdParts {
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
  if (!isOverworldRoadEncounterStrategy(strategy)) {
    throw new Error(
      `Overworld session snapshot journal road entry references unknown strategy "${strategy}".`,
    );
  }
  return {
    edgeId,
    arrivedAt,
    strategy,
  };
}

export function parseServiceJournalId(entryId: string): ServiceJournalIdParts {
  const match = /^service:(rest|resupply):(\d+)$/.exec(entryId);
  if (!match) {
    throw new Error(
      `Overworld session snapshot journal service entry id "${entryId}" must match "service:<rest|resupply>:<minutes>".`,
    );
  }
  const recordedAt = Number(match[2]!);
  if (!Number.isSafeInteger(recordedAt)) {
    throw new Error(
      `Overworld session snapshot journal service entry has malformed minutes "${match[2]}".`,
    );
  }
  return {
    action: match[1] as CampaignServiceAction,
    recordedAt,
  };
}

export function roadResolutionKey(parsed: RoadJournalIdParts): string {
  return `${parsed.edgeId}@${parsed.arrivedAt}`;
}
