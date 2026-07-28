import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import type { OverworldManifest } from "../../src/world/overworld.js";
import { OverworldSession } from "../../src/world/session.js";
import {
  OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH,
  OVERWORLD_CIVIC_TRIGGER_CATEGORY_PREDECESSOR_WORLD_HASH,
} from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { exactCivicTriggerCategoryPredecessor } from "./fixtures/historical_overworlds.js";

const WORLD = loadOverworldManifest(process.cwd());
const PREDECESSOR = exactCivicTriggerCategoryPredecessor(WORLD);

function pendingRegistrationSession(world: OverworldManifest): OverworldSession {
  const registration = world.opening_registration;
  if (!registration) throw new Error("Albany must retain opening registration.");
  const session = new OverworldSession(world);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(registration.contact);
  return session;
}

function pendingOathSession(world: OverworldManifest): OverworldSession {
  const registration = world.opening_registration;
  if (!registration) throw new Error("Albany must retain opening registration.");
  const session = pendingRegistrationSession(world);
  session.chooseJourneyStory(registration.profiles[0]!.id);
  return session;
}

function pendingSourceSession(world: OverworldManifest): OverworldSession {
  const oath = world.opening_relief_oath;
  if (!oath) throw new Error("Albany must retain opening relief oaths.");
  const session = pendingOathSession(world);
  session.chooseJourneyStory(oath.options[0]!.id);
  return session;
}

describe("Civic trigger-category snapshot integrity", () => {
  it("pins the exact predecessor, current manifest, and concise Civic authoring", () => {
    expect(hashState(PREDECESSOR)).toBe(OVERWORLD_CIVIC_TRIGGER_CATEGORY_PREDECESSOR_WORLD_HASH);
    expect(OVERWORLD_CIVIC_TRIGGER_CATEGORY_PREDECESSOR_WORLD_HASH).toBe(
      "155ab48207c496c158dd5bb07fb9d44502d75fa456e219f25abf148118f40b31",
    );
    expect(hashState(WORLD)).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH);
    expect(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH).toBe(
      "35d7ee917b8cd33c698e3771d7bd884d963763ab665e5b4ae919e971e013a50c",
    );
    for (const options of [
      WORLD.opening_registration?.profiles ?? [],
      WORLD.opening_relief_oath?.options ?? [],
      WORLD.opening_lead_source?.options ?? [],
    ]) {
      expect(options.every((option) => option.trigger_category !== undefined)).toBe(true);
      expect(options.every((option) => option.trigger_category!.length <= 80)).toBe(true);
    }
  });

  it("restores every pending Civic choice from the exact presentation-only predecessor", () => {
    for (const makeSession of [
      pendingRegistrationSession,
      pendingOathSession,
      pendingSourceSession,
    ]) {
      const predecessor = makeSession(PREDECESSOR).snapshot();
      const native = makeSession(WORLD).snapshot();

      expect(OverworldSession.restore(WORLD, predecessor).snapshot()).toEqual(native);
    }
  });

  it("restores a certified predecessor source with identical effects and journal copy", () => {
    const predecessorSession = pendingSourceSession(PREDECESSOR);
    const nativeSession = pendingSourceSession(WORLD);
    const sourceId = WORLD.opening_lead_source!.options[0]!.id;
    predecessorSession.chooseJourneyStory(sourceId);
    nativeSession.chooseJourneyStory(sourceId);

    const predecessor = predecessorSession.snapshot();
    const native = nativeSession.snapshot();
    const restored = OverworldSession.restore(WORLD, predecessor).snapshot();
    expect(restored).toEqual(native);
    expect(restored.journalEntries.find((entry) => entry.kind === "lead_source")?.text).toBe(
      predecessor.journalEntries.find((entry) => entry.kind === "lead_source")?.text,
    );
  });

  it("rejects an adjacent unknown predecessor manifest", () => {
    const unknown = pendingRegistrationSession(PREDECESSOR).snapshot();
    unknown.worldHash = `f${OVERWORLD_CIVIC_TRIGGER_CATEGORY_PREDECESSOR_WORLD_HASH.slice(1)}`;
    expect(() => OverworldSession.restore(WORLD, unknown)).toThrow(/different world manifest/i);
  });
});
