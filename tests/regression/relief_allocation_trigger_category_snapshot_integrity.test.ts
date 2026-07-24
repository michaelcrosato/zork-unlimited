import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import type { OverworldManifest } from "../../src/world/overworld.js";
import { OverworldSession } from "../../src/world/session.js";
import {
  OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH,
  OVERWORLD_RELIEF_ALLOCATION_TRIGGER_CATEGORY_PREDECESSOR_WORLD_HASH,
} from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { exactReliefAllocationTriggerCategoryPredecessor } from "./fixtures/historical_overworlds.js";

const WORLD = loadOverworldManifest(process.cwd());
const PREDECESSOR = exactReliefAllocationTriggerCategoryPredecessor(WORLD);

function moveToArea(session: OverworldSession, areaId: string): void {
  const route = session.view().areaExits.find((candidate) => candidate.destination.id === areaId);
  if (!route) throw new Error(`expected a visible route to ${areaId}`);
  session.moveArea(route.id);
}

function allocationReadySession(world: OverworldManifest): OverworldSession {
  const registration = world.opening_registration;
  const oath = world.opening_relief_oath;
  const source = world.opening_lead_source;
  const preparation = world.opening_preparation;
  const allocation = world.opening_relief_allocation;
  if (!registration || !oath || !source || !preparation || !allocation) {
    throw new Error("Albany must retain the complete Wolf-Winter departure chain.");
  }
  const session = new OverworldSession(world);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(registration.contact);
  session.chooseJourneyStory(registration.profiles[0]!.id);
  session.chooseJourneyStory(oath.options[0]!.id);
  session.chooseJourneyStory(source.options[0]!.id);
  moveToArea(session, preparation.area);
  session.chooseJourneyStory(preparation.profiles[0]!.id);
  expect(session.view().departureInteractions).toMatchObject([
    { id: allocation.id, kind: "relief_allocation" },
  ]);
  return session;
}

describe("Relief Allocation trigger-category snapshot integrity", () => {
  it("pins the exact predecessor and current manifest hashes", () => {
    expect(hashState(PREDECESSOR)).toBe(
      OVERWORLD_RELIEF_ALLOCATION_TRIGGER_CATEGORY_PREDECESSOR_WORLD_HASH,
    );
    expect(OVERWORLD_RELIEF_ALLOCATION_TRIGGER_CATEGORY_PREDECESSOR_WORLD_HASH).toBe(
      "42357dc467518106d3a4753a246ea672de03638a2d8f0aca240f5818a579ed3d",
    );
    expect(hashState(WORLD)).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH);
    expect(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH).toBe(
      "1d8ed584e39c462a7eb5132c23796ea39b8f76a545add86a88080ecf926b9f9c",
    );
    expect(
      WORLD.opening_relief_allocation?.options.map((option) => option.trigger_category),
    ).toEqual([
      "Clean exposed-ridge lure: prevent its ordinary cattle-alarm increase.",
      "Byre-held return: a 15-minute Market fatigue recovery.",
      "Recovered failed fortification; byre-held return: Campus resupply.",
    ]);
  });

  it("restores a pending current-predecessor allocation without inventing effects", () => {
    const predecessor = allocationReadySession(PREDECESSOR).snapshot();
    const native = allocationReadySession(WORLD).snapshot();

    const restoredSession = OverworldSession.restore(WORLD, predecessor);
    const restored = restoredSession.snapshot();
    expect(restored).toEqual(native);
    expect(restored.character.knowledge).not.toContain("albany:knowledge_relief_cade_fodder");
    expect(restored.journey.acceptedDecisions).toBe(predecessor.journey.acceptedDecisions);
    expect(restored.minutes).toBe(predecessor.minutes);
    expect(OverworldSession.restore(WORLD, restored).snapshot()).toEqual(restored);
  });

  it("restores a selected current-predecessor allocation with identical effects and receipt", () => {
    const predecessorSession = allocationReadySession(PREDECESSOR);
    const nativeSession = allocationReadySession(WORLD);
    const selectedId = WORLD.opening_relief_allocation!.options[0]!.id;
    predecessorSession.chooseJourneyStory(selectedId);
    nativeSession.chooseJourneyStory(selectedId);
    const predecessor = predecessorSession.snapshot();
    const native = nativeSession.snapshot();

    const restored = OverworldSession.restore(WORLD, predecessor).snapshot();
    expect(restored).toEqual(native);
    expect(restored.character.knowledge).toContain("albany:knowledge_relief_cade_fodder");
    expect(restored.minutes).toBe(predecessor.minutes);
    expect(restored.journalEntries.find((entry) => entry.kind === "relief_allocation")?.text).toBe(
      predecessor.journalEntries.find((entry) => entry.kind === "relief_allocation")?.text,
    );
  });

  it("rejects an adjacent unknown manifest hash", () => {
    const unknown = allocationReadySession(PREDECESSOR).snapshot();
    unknown.worldHash = `f${OVERWORLD_RELIEF_ALLOCATION_TRIGGER_CATEGORY_PREDECESSOR_WORLD_HASH.slice(
      1,
    )}`;
    expect(() => OverworldSession.restore(WORLD, unknown)).toThrow(/different world manifest/i);
  });
});
