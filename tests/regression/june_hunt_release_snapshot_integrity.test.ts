import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import type { OverworldManifest } from "../../src/world/overworld.js";
import { OverworldSession } from "../../src/world/session.js";
import {
  OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH,
  OVERWORLD_JUNE_FORTIFY_DAWN_PREDECESSOR_WORLD_HASH,
  OVERWORLD_JUNE_HUNT_RELEASE_PREDECESSOR_WORLD_HASH,
} from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { exactJuneHuntReleasePredecessor } from "./fixtures/historical_overworlds.js";

const WORLD = loadOverworldManifest(process.cwd());
const PREDECESSOR = exactJuneHuntReleasePredecessor(WORLD);
const DEFAULT_OATH = "albany:oath_full_compact_duty";
const RESIDENT_SHELTER = "albany:relief_resident_shelter";
const SHELTERED = "albany:wolf_approach_sheltered_stockway";
const JUNE = "albany:ally_june_cattle_first";
const RELEASE_ENDING_IDS = [
  "ending_bloodied_byre_evacuated_june_released",
  "ending_held_gate_barred_june_released",
  "ending_held_timber_saved_june_released",
  "ending_held_june_released",
] as const;

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
  const registration = world.opening_registration!;
  const lead = world.opening_lead_source!;
  const preparation = world.opening_preparation!;
  const ally = world.opening_ally!;
  const session = new OverworldSession(world);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(registration.contact);
  session.chooseJourneyStory(registration.profiles[0]!.id);
  session.chooseJourneyStory(DEFAULT_OATH);
  session.chooseJourneyStory(lead.options[0]!.id);
  moveToArea(session, world, preparation.area);
  session.chooseJourneyStory(preparation.profiles[0]!.id);
  session.chooseJourneyStory(RESIDENT_SHELTER);
  moveToArea(session, world, ally.area);
  session.talkToCharacter(ally.contact);
  session.chooseJourneyStory(JUNE);
  return session;
}

function complete(world: OverworldManifest, endingId: string): OverworldSession {
  const session = selectedJune(world);
  const wolf = world.quests.find((quest) => quest.id === "wolf_winter")!;
  const campaignExport = wolf.campaign_exports?.find(
    (candidate) => candidate.ending_id === endingId,
  );
  if (!campaignExport) throw new Error(`missing ${endingId}`);
  session.startQuest(wolf.id, SHELTERED);
  session.completeQuest(wolf.id, {
    endingId,
    endingTitle: campaignExport.ending_title,
    death: false,
  });
  return session;
}

describe("June HUNT release snapshot integrity", () => {
  it("pins the exact predecessor and current world hashes", () => {
    expect(hashState(PREDECESSOR)).toBe(OVERWORLD_JUNE_HUNT_RELEASE_PREDECESSOR_WORLD_HASH);
    expect(OVERWORLD_JUNE_HUNT_RELEASE_PREDECESSOR_WORLD_HASH).toBe(
      "ef222da19b289d9a32377e9ed2df0c38fa7af37f252fa87a63f3a58cb69ca486",
    );
    expect(hashState(WORLD)).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH);
    expect(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH).toBe(
      "33d93edc13833ad2c385a6cd39485546fdb6e38b81851b55e0ab92e256e523bf",
    );
  });

  it("restores an exact pre-choice predecessor without inventing the future release", () => {
    const predecessor = selectedJune(PREDECESSOR).snapshot();
    const expected = selectedJune(WORLD).snapshot();
    const restored = OverworldSession.restore(WORLD, predecessor).snapshot();

    expect(predecessor.worldHash).toBe(OVERWORLD_JUNE_HUNT_RELEASE_PREDECESSOR_WORLD_HASH);
    expect(restored).toEqual(expected);
    expect(
      restored.character.promises.find((promise) => promise.promiseId.includes("june"))?.status,
    ).toBe("active");
    expect(OverworldSession.restore(WORLD, restored).snapshot()).toEqual(restored);
  });

  it("restores the established retained-HUNT outcome byte-truthfully", () => {
    const predecessor = complete(PREDECESSOR, "ending_held").snapshot();
    const current = complete(WORLD, "ending_held").snapshot();
    expect(OverworldSession.restore(WORLD, predecessor).snapshot()).toEqual(current);
  });

  it("rejects June-release endings forged into either historical manifest", () => {
    for (const sourceWorldHash of [
      OVERWORLD_JUNE_HUNT_RELEASE_PREDECESSOR_WORLD_HASH,
      OVERWORLD_JUNE_FORTIFY_DAWN_PREDECESSOR_WORLD_HASH,
    ]) {
      for (const endingId of RELEASE_ENDING_IDS) {
        const forged = complete(WORLD, endingId).snapshot();
        forged.worldHash = sourceWorldHash;
        expect(() => OverworldSession.restore(WORLD, forged)).toThrow(
          /June-release.*outcome introduced|different world manifest|exact authored copy/i,
        );
      }
    }
  });

  it("rejects an adjacent unknown hash even with genuine predecessor state", () => {
    const unknown = selectedJune(PREDECESSOR).snapshot();
    unknown.worldHash = `f${OVERWORLD_JUNE_HUNT_RELEASE_PREDECESSOR_WORLD_HASH.slice(1)}`;
    expect(() => OverworldSession.restore(WORLD, unknown)).toThrow(/different world manifest/i);
  });
});
