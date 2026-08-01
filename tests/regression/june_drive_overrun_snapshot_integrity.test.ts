import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import type { OverworldManifest } from "../../src/world/overworld.js";
import { OverworldSession } from "../../src/world/session.js";
import {
  OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH,
  OVERWORLD_JUNE_DRIVE_OVERRUN_PREDECESSOR_WORLD_HASH,
} from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { exactJuneDriveOverrunPredecessor } from "./fixtures/historical_overworlds.js";

const WORLD = loadOverworldManifest(process.cwd());
const PREDECESSOR = exactJuneDriveOverrunPredecessor(WORLD);
const JUNE = "albany:ally_june_cattle_first";
const DEFAULT_OATH = "albany:oath_full_compact_duty";
const RESIDENT_SHELTER = "albany:relief_resident_shelter";

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
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
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

function pendingAllySession(world: OverworldManifest): OverworldSession {
  const registration = world.opening_registration;
  const oath = world.opening_relief_oath;
  const source = world.opening_lead_source;
  const preparation = world.opening_preparation;
  const allocation = world.opening_relief_allocation;
  const ally = world.opening_ally;
  if (!registration || !oath || !source || !preparation || !allocation || !ally) {
    throw new Error("Albany must retain its complete Wolf-Winter departure sequence.");
  }
  const session = new OverworldSession(world);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(registration.contact);
  session.chooseJourneyStory(registration.profiles[0]!.id);
  session.chooseJourneyStory(DEFAULT_OATH);
  session.chooseJourneyStory(source.options[0]!.id);
  moveToArea(session, world, preparation.area);
  session.chooseJourneyStory(preparation.profiles[0]!.id);
  session.chooseJourneyStory(RESIDENT_SHELTER);
  moveToArea(session, world, ally.area);
  session.talkToCharacter(ally.contact);
  return session;
}

function selectedJuneSession(world: OverworldManifest): OverworldSession {
  const session = pendingAllySession(world);
  session.chooseJourneyStory(JUNE);
  return session;
}

describe("June DRIVE Overrun snapshot integrity", () => {
  it("pins the exact copy-only predecessor and current manifest hashes", () => {
    expect(hashState(PREDECESSOR)).toBe(OVERWORLD_JUNE_DRIVE_OVERRUN_PREDECESSOR_WORLD_HASH);
    expect(OVERWORLD_JUNE_DRIVE_OVERRUN_PREDECESSOR_WORLD_HASH).toBe(
      "7b517d0a2ccae01b9548b415465391c51176c6357facc513c506808e7a115590",
    );
    expect(hashState(WORLD)).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH);
    expect(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH).toBe(
      "271f39351a549c0491c057dc372a80b8ecc899d0b9948d6c90df8ebc0729bd5a",
    );
  });

  it("normalizes a pending field-team offer without changing its journey boundary", () => {
    const predecessor = pendingAllySession(PREDECESSOR).snapshot();
    const current = pendingAllySession(WORLD).snapshot();
    const restored = OverworldSession.restore(WORLD, predecessor).snapshot();

    expect(predecessor.journalEntries.find((entry) => entry.kind === "ally_offer")?.text).not.toBe(
      current.journalEntries.find((entry) => entry.kind === "ally_offer")?.text,
    );
    expect(restored).toEqual(current);
    expect(OverworldSession.restore(WORLD, restored).snapshot()).toEqual(restored);
  });

  it("normalizes accepted June copy while preserving the paid choice and character state", () => {
    const predecessor = selectedJuneSession(PREDECESSOR).snapshot();
    const current = selectedJuneSession(WORLD).snapshot();
    const restored = OverworldSession.restore(WORLD, predecessor).snapshot();

    expect(predecessor.journalEntries.find((entry) => entry.kind === "ally")?.text).not.toBe(
      current.journalEntries.find((entry) => entry.kind === "ally")?.text,
    );
    expect(restored).toEqual(current);
    expect(restored.character).toEqual(predecessor.character);
    expect(restored.journey.decisionProof).toEqual(predecessor.journey.decisionProof);
  });

  it("rejects new or altered ally receipts relabelled with the trusted predecessor hash", () => {
    const predecessor = pendingAllySession(PREDECESSOR).snapshot();
    const current = pendingAllySession(WORLD).snapshot();
    const currentOffer = current.journalEntries.find((entry) => entry.kind === "ally_offer");
    const offerIndex = predecessor.journalEntries.findIndex((entry) => entry.kind === "ally_offer");
    if (!currentOffer || offerIndex < 0) throw new Error("expected both ally offers");
    predecessor.journalEntries[offerIndex] = structuredClone(currentOffer);

    expect(() => OverworldSession.restore(WORLD, predecessor)).toThrow(
      /June DRIVE Overrun predecessor ally journal entry.*exact authored copy/i,
    );
  });

  it("rejects an adjacent unknown manifest even when the old receipts are genuine", () => {
    const unknown = pendingAllySession(PREDECESSOR).snapshot();
    unknown.worldHash = `e${OVERWORLD_JUNE_DRIVE_OVERRUN_PREDECESSOR_WORLD_HASH.slice(1)}`;
    expect(() => OverworldSession.restore(WORLD, unknown)).toThrow(/different world manifest/i);
  });
});
