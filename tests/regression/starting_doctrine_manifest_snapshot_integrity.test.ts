import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import type { OverworldManifest } from "../../src/world/overworld.js";
import { OverworldSession } from "../../src/world/session.js";
import {
  OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH,
  OVERWORLD_STARTING_DOCTRINE_PREDECESSOR_WORLD_HASH,
} from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { exactStartingDoctrinePredecessor } from "./fixtures/historical_overworlds.js";

const WORLD = loadOverworldManifest(process.cwd());
const PREDECESSOR = exactStartingDoctrinePredecessor(WORLD);

function pendingRegistrationSession(world: OverworldManifest): OverworldSession {
  const registration = world.opening_registration;
  if (!registration) throw new Error("Albany must retain opening registration.");
  const session = new OverworldSession(world);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(registration.contact);
  expect(session.journey().storyChoice).toMatchObject({
    id: registration.id,
    kind: "registration",
  });
  return session;
}

describe("Starting Doctrine manifest snapshot integrity", () => {
  it("pins the exact pre-doctrine and current manifests", () => {
    expect(PREDECESSOR.opening_registration?.doctrines).toBeUndefined();
    expect(hashState(PREDECESSOR)).toBe(OVERWORLD_STARTING_DOCTRINE_PREDECESSOR_WORLD_HASH);
    expect(OVERWORLD_STARTING_DOCTRINE_PREDECESSOR_WORLD_HASH).toBe(
      "35d7ee917b8cd33c698e3771d7bd884d963763ab665e5b4ae919e971e013a50c",
    );
    expect(hashState(WORLD)).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH);
  });

  it("restores an exact predecessor registration offer into the new grouped choice", () => {
    const predecessor = pendingRegistrationSession(PREDECESSOR).snapshot();
    const native = pendingRegistrationSession(WORLD).snapshot();
    const restored = OverworldSession.restore(WORLD, predecessor);

    expect(restored.snapshot()).toEqual(native);
    expect(restored.journey().storyChoice?.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ group: "doctrine" }),
        expect.objectContaining({ group: "custom_role" }),
      ]),
    );
  });

  it("still rejects an unknown manifest hash", () => {
    const unknown = pendingRegistrationSession(PREDECESSOR).snapshot();
    unknown.worldHash = `f${OVERWORLD_STARTING_DOCTRINE_PREDECESSOR_WORLD_HASH.slice(1)}`;

    expect(() => OverworldSession.restore(WORLD, unknown)).toThrow(/different world manifest/i);
  });
});
