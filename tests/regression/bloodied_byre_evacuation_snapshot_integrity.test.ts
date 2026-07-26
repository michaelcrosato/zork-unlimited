import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import { OverworldSession } from "../../src/world/session.js";
import {
  OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH,
  OVERWORLD_BLOODIED_BYRE_EVACUATION_PREDECESSOR_WORLD_HASH,
  OVERWORLD_WOUND_CARE_PREDECESSOR_WORLD_HASH,
} from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { exactBloodiedByreEvacuationPredecessor } from "./fixtures/historical_overworlds.js";

const WORLD = loadOverworldManifest(process.cwd());

function moveToArea(session: OverworldSession, targetAreaId: string): void {
  const startAreaId = session.view().currentArea?.id;
  if (!startAreaId || startAreaId === targetAreaId) return;
  const edges = WORLD.area_edges.filter((edge) => edge.home === session.view().current.id);
  const queue = [startAreaId];
  const previous = new Map<string, string>();
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    if (current === targetAreaId) break;
    for (const edge of edges.filter(
      (candidate) => candidate.from_area === current || candidate.to_area === current,
    )) {
      const next = edge.from_area === current ? edge.to_area : edge.from_area;
      if (next === startAreaId || previous.has(next)) continue;
      previous.set(next, current);
      queue.push(next);
    }
  }
  const path: string[] = [];
  for (let cursor = targetAreaId; cursor !== startAreaId; ) {
    const prior = previous.get(cursor);
    if (!prior) throw new Error(`No Albany area route reaches ${targetAreaId}.`);
    path.unshift(cursor);
    cursor = prior;
  }
  for (const areaId of path) {
    const exit = session.view().areaExits.find((candidate) => candidate.destination.id === areaId);
    if (!exit) throw new Error(`Albany does not expose the next area ${areaId}.`);
    session.moveArea(exit.id);
  }
}

function wolfBoundary(): { session: OverworldSession; wolfId: string } {
  const session = new OverworldSession(WORLD);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(WORLD.opening_registration!.contact);
  session.chooseJourneyStory("albany:road_warden");
  session.chooseJourneyStory("albany:oath_limited_aid_only");
  session.chooseJourneyStory("albany:source_hayden_frost_report");
  moveToArea(session, WORLD.opening_preparation!.area);
  session.chooseJourneyStory("albany:prep_drover_route");
  session.chooseJourneyStory("albany:relief_resident_shelter");
  const wolf = session.view().quests.find((quest) => quest.id === "wolf_winter");
  if (!wolf) throw new Error("The opening must expose Wolf-Winter.");
  moveToArea(session, wolf.area);
  return { session, wolfId: wolf.id };
}

function completedBloodiedEvacuation(): OverworldSession {
  const { session, wolfId } = wolfBoundary();
  session.startQuest(wolfId, "albany:wolf_approach_sheltered_stockway");
  session.completeQuest(wolfId, {
    endingId: "ending_bloodied_byre_evacuated",
    endingTitle: "The Bloodied Byre Evacuated",
    death: false,
  });
  return session;
}

describe("bloodied-byre manifest snapshot integrity", () => {
  it("pins the exact predecessor and current manifest hashes", () => {
    expect(hashState(exactBloodiedByreEvacuationPredecessor(WORLD))).toBe(
      OVERWORLD_BLOODIED_BYRE_EVACUATION_PREDECESSOR_WORLD_HASH,
    );
    expect(OVERWORLD_BLOODIED_BYRE_EVACUATION_PREDECESSOR_WORLD_HASH).toBe(
      "5757ef201328662d8145b1e4fbad87907996fc1d9dad10170c3c2f8d422d2077",
    );
    expect(hashState(WORLD)).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH);
    expect(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH).toBe(
      "155ab48207c496c158dd5bb07fb9d44502d75fa456e219f25abf148118f40b31",
    );
  });

  it("rebinds an unfinished immediate-predecessor journey without changing gameplay state", () => {
    const current = wolfBoundary().session.snapshot();
    const predecessor = structuredClone(current);
    predecessor.worldHash = OVERWORLD_BLOODIED_BYRE_EVACUATION_PREDECESSOR_WORLD_HASH;

    const restored = OverworldSession.restore(WORLD, predecessor).snapshot();

    expect(restored).toEqual(current);
    expect(restored.worldHash).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH);
    expect(OverworldSession.restore(WORLD, restored).snapshot()).toEqual(restored);
  });

  it("rejects the new ending when forged beneath the predecessor manifest hash", () => {
    const forged = completedBloodiedEvacuation().snapshot();
    forged.worldHash = OVERWORLD_BLOODIED_BYRE_EVACUATION_PREDECESSOR_WORLD_HASH;

    expect(() => OverworldSession.restore(WORLD, forged)).toThrow(
      /Pre-bloodied-byre snapshot has a Wolf-Winter quest outcome introduced by a later manifest/,
    );
  });

  it("rejects the new ending beneath an older trusted predecessor manifest", () => {
    const forged = completedBloodiedEvacuation().snapshot();
    forged.worldHash = OVERWORLD_WOUND_CARE_PREDECESSOR_WORLD_HASH;

    expect(() => OverworldSession.restore(WORLD, forged)).toThrow(
      /Pre-bloodied-byre snapshot has a Wolf-Winter quest outcome introduced by a later manifest/,
    );
  });

  it("still rejects an adjacent unrelated manifest hash", () => {
    const unrelated = wolfBoundary().session.snapshot();
    unrelated.worldHash = `f${OVERWORLD_BLOODIED_BYRE_EVACUATION_PREDECESSOR_WORLD_HASH.slice(1)}`;

    expect(() => OverworldSession.restore(WORLD, unrelated)).toThrow(/different world manifest/i);
  });
});
