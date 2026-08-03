import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import type { OverworldManifest } from "../../src/world/overworld.js";
import { OverworldSession } from "../../src/world/session.js";
import {
  OVERWORLD_AID_ONLY_CLEAN_CAST_PREDECESSOR_WORLD_HASH,
  OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH,
} from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { exactAidOnlyCleanCastCopyPredecessor } from "./fixtures/historical_overworlds.js";

const WORLD = loadOverworldManifest(process.cwd());
const PREDECESSOR = exactAidOnlyCleanCastCopyPredecessor(WORLD);
const AID_ONLY = "albany:oath_limited_aid_only";
const FULL_DUTY = "albany:oath_full_compact_duty";
const ROAD_WARDEN = "albany:road_warden";
const ROAD_WARDEN_AID_ROUTE = "albany:doctrine_road_warden_aid_route";
const ROWAN = "albany_city__civic_core__contact";
const RESIDENT_SHELTER = "albany:relief_resident_shelter";
const JUNE = "albany:ally_june_cattle_first";

function registered(world: OverworldManifest, profileId: string): OverworldSession {
  const registration = world.opening_registration;
  if (!registration) throw new Error("Albany must retain opening registration.");
  const session = new OverworldSession(world);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(registration.contact);
  session.chooseJourneyStory(profileId);
  return session;
}

function selectedAidOnlyWithRowan(world: OverworldManifest): OverworldSession {
  const session = registered(world, ROAD_WARDEN);
  session.chooseJourneyStory(AID_ONLY);
  const lead = world.opening_lead_source;
  if (!lead) throw new Error("Albany must retain a Wolf-Winter lead source.");
  session.chooseJourneyStory(lead.options[0]!.id);
  session.talkToCharacter(ROWAN);
  return session;
}

function selectedRoadWardenAidRoute(world: OverworldManifest): OverworldSession {
  const session = registered(world, ROAD_WARDEN);
  session.chooseJourneyStory(ROAD_WARDEN_AID_ROUTE);
  return session;
}

function moveToArea(
  session: OverworldSession,
  world: OverworldManifest,
  targetAreaId: string,
): void {
  const currentAreaId = session.view().currentArea?.id;
  if (!currentAreaId || currentAreaId === targetAreaId) return;
  const edges = world.area_edges.filter((edge) => edge.home === session.view().current.id);
  const queue = [currentAreaId];
  const previous = new Map<string, string>();
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    if (current === targetAreaId) break;
    for (const edge of edges.filter(
      (candidate) => candidate.from_area === current || candidate.to_area === current,
    )) {
      const next = edge.from_area === current ? edge.to_area : edge.from_area;
      if (next === currentAreaId || previous.has(next)) continue;
      previous.set(next, current);
      queue.push(next);
    }
  }
  const path: string[] = [];
  for (let cursor = targetAreaId; cursor !== currentAreaId; ) {
    const prior = previous.get(cursor);
    if (!prior) throw new Error(`No area route to ${targetAreaId}.`);
    path.unshift(cursor);
    cursor = prior;
  }
  for (const areaId of path) {
    const route = session.view().areaExits.find((candidate) => candidate.destination.id === areaId);
    if (!route) throw new Error(`Area route to ${areaId} is not visible.`);
    session.moveArea(route.id);
  }
}

function selectedJune(world: OverworldManifest): OverworldSession {
  const lead = world.opening_lead_source;
  const preparation = world.opening_preparation;
  const ally = world.opening_ally;
  if (!lead || !preparation || !ally)
    throw new Error("Albany must retain the Wolf-Winter opening.");
  const session = registered(world, world.opening_registration!.profiles[0]!.id);
  session.chooseJourneyStory(FULL_DUTY);
  session.chooseJourneyStory(lead.options[0]!.id);
  moveToArea(session, world, preparation.area);
  session.chooseJourneyStory(preparation.profiles[0]!.id);
  session.chooseJourneyStory(RESIDENT_SHELTER);
  moveToArea(session, world, ally.area);
  session.talkToCharacter(ally.contact);
  session.chooseJourneyStory(JUNE);
  return session;
}

describe("Aid-Only clean-cast snapshot integrity", () => {
  it("pins the exact predecessor and current manifest hashes", () => {
    expect(hashState(PREDECESSOR)).toBe(OVERWORLD_AID_ONLY_CLEAN_CAST_PREDECESSOR_WORLD_HASH);
    expect(OVERWORLD_AID_ONLY_CLEAN_CAST_PREDECESSOR_WORLD_HASH).toBe(
      "271f39351a549c0491c057dc372a80b8ecc899d0b9948d6c90df8ebc0729bd5a",
    );
    expect(hashState(WORLD)).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH);
    expect(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH).toBe(
      "33d93edc13833ad2c385a6cd39485546fdb6e38b81851b55e0ab92e256e523bf",
    );
  });

  it("restores the exact predecessor's durable Aid-Only and Rowan copy", () => {
    const predecessor = selectedAidOnlyWithRowan(PREDECESSOR).snapshot();
    const native = selectedAidOnlyWithRowan(WORLD).snapshot();

    expect(OverworldSession.restore(WORLD, predecessor).snapshot()).toEqual(native);
  });

  it("restores the Road-Warden quick setup through its canonical oath journals", () => {
    const predecessor = selectedRoadWardenAidRoute(PREDECESSOR).snapshot();
    const native = selectedRoadWardenAidRoute(WORLD).snapshot();

    expect(OverworldSession.restore(WORLD, predecessor).snapshot()).toEqual(native);
  });

  it("preserves the already-current June copy instead of replaying a DRIVE-era normalizer", () => {
    const predecessor = selectedJune(PREDECESSOR).snapshot();
    const native = selectedJune(WORLD).snapshot();

    expect(OverworldSession.restore(WORLD, predecessor).snapshot()).toEqual(native);
  });

  it("rejects tampered predecessor Aid-Only and Rowan journals", () => {
    const tamperedOath = selectedAidOnlyWithRowan(PREDECESSOR).snapshot();
    const oath = tamperedOath.journalEntries.find((entry) => entry.kind === "relief_oath");
    if (!oath) throw new Error("Expected an Aid-Only oath journal entry.");
    oath.text = "forged Aid-Only copy";
    expect(() => OverworldSession.restore(WORLD, tamperedOath)).toThrow(/exact authored copy/i);

    const tamperedRowan = selectedAidOnlyWithRowan(PREDECESSOR).snapshot();
    const rowan = tamperedRowan.journalEntries.find(
      (entry) =>
        entry.id === "talk:albany_city__civic_core__contact@wolf_limited_aid_only_selected",
    );
    if (!rowan) throw new Error("Expected Rowan's Aid-Only contact journal entry.");
    rowan.text = "forged Rowan copy";
    expect(() => OverworldSession.restore(WORLD, tamperedRowan)).toThrow(/exact authored copy/i);
  });

  it("rejects an adjacent unknown hash even with a genuine predecessor snapshot", () => {
    const unknown = selectedAidOnlyWithRowan(PREDECESSOR).snapshot();
    unknown.worldHash = `f${OVERWORLD_AID_ONLY_CLEAN_CAST_PREDECESSOR_WORLD_HASH.slice(1)}`;

    expect(() => OverworldSession.restore(WORLD, unknown)).toThrow(/different world manifest/i);
  });
});
