import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import type { OverworldManifest } from "../../src/world/overworld.js";
import { OverworldSession } from "../../src/world/session.js";
import {
  OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH,
  OVERWORLD_STARTING_DOCTRINE_REPLACEMENT_PREDECESSOR_WORLD_HASH,
  OVERWORLD_STARTING_DOCTRINE_PREDECESSOR_WORLD_HASH,
} from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import {
  exactStartingDoctrinePredecessor,
  exactStartingDoctrineReplacementPredecessor,
} from "./fixtures/historical_overworlds.js";

const WORLD = loadOverworldManifest(process.cwd());
const PRE_DOCTRINE_PREDECESSOR = exactStartingDoctrinePredecessor(WORLD);
const REPLACEMENT_PREDECESSOR = exactStartingDoctrineReplacementPredecessor(WORLD);

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
  it("pins the exact pre-doctrine, replacement, and current manifests", () => {
    expect(PRE_DOCTRINE_PREDECESSOR.opening_registration?.doctrines).toBeUndefined();
    expect(hashState(PRE_DOCTRINE_PREDECESSOR)).toBe(
      OVERWORLD_STARTING_DOCTRINE_PREDECESSOR_WORLD_HASH,
    );
    expect(OVERWORLD_STARTING_DOCTRINE_PREDECESSOR_WORLD_HASH).toBe(
      "35d7ee917b8cd33c698e3771d7bd884d963763ab665e5b4ae919e971e013a50c",
    );
    expect(
      REPLACEMENT_PREDECESSOR.opening_registration?.doctrines?.find(
        (doctrine) => doctrine.id === "albany:doctrine_bounded_aid",
      ),
    ).toBeDefined();
    expect(hashState(REPLACEMENT_PREDECESSOR)).toBe(
      OVERWORLD_STARTING_DOCTRINE_REPLACEMENT_PREDECESSOR_WORLD_HASH,
    );
    expect(OVERWORLD_STARTING_DOCTRINE_REPLACEMENT_PREDECESSOR_WORLD_HASH).toBe(
      "56577688e463b98883aea1c9063a6e577d6a5d2bb4fa412ee32b0f47576d849c",
    );
    expect(hashState(WORLD)).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH);
    expect(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH).toBe(
      "7b517d0a2ccae01b9548b415465391c51176c6357facc513c506808e7a115590",
    );
  });

  it("restores an exact pre-doctrine registration offer into the role-first choice", () => {
    const predecessor = pendingRegistrationSession(PRE_DOCTRINE_PREDECESSOR).snapshot();
    const native = pendingRegistrationSession(WORLD).snapshot();
    const restored = OverworldSession.restore(WORLD, predecessor);

    expect(restored.snapshot()).toEqual(native);
    expect(restored.journey().storyChoice?.options.map((option) => option.id)).toEqual(
      WORLD.opening_registration!.profiles.map((profile) => profile.id),
    );
    expect(
      restored.journey().storyChoice?.options.every((option) => option.group === undefined),
    ).toBe(true);
  });

  it("transparently restores the exact three-doctrine replacement predecessor at registration", () => {
    const predecessor = pendingRegistrationSession(REPLACEMENT_PREDECESSOR).snapshot();
    const native = pendingRegistrationSession(WORLD).snapshot();

    expect(OverworldSession.restore(WORLD, predecessor).snapshot()).toEqual(native);
  });

  it("restores retired doctrine-selected saves through their canonical evidence", () => {
    const predecessor = pendingRegistrationSession(REPLACEMENT_PREDECESSOR);
    const retiredDoctrine = REPLACEMENT_PREDECESSOR.opening_registration!.doctrines!.find(
      (doctrine) => doctrine.id === "albany:doctrine_bounded_aid",
    )!;
    // The former one-click alias was never persisted. Its exact save evidence
    // is the same canonical role → oath → source sequence reconstructed here.
    predecessor.chooseJourneyStory(retiredDoctrine.profile_id);
    predecessor.chooseJourneyStory(retiredDoctrine.relief_oath_option_id);
    predecessor.chooseJourneyStory(retiredDoctrine.lead_source_option_id);

    const native = pendingRegistrationSession(WORLD);
    native.chooseJourneyStory("albany:ledger_advocate");
    native.chooseJourneyStory("albany:oath_limited_aid_only");
    native.chooseJourneyStory("albany:source_rowan_civic_docket");

    expect(OverworldSession.restore(WORLD, predecessor.snapshot()).snapshot()).toEqual(
      native.snapshot(),
    );
  });

  it("still rejects an unknown manifest hash", () => {
    const unknown = pendingRegistrationSession(REPLACEMENT_PREDECESSOR).snapshot();
    unknown.worldHash = `f${OVERWORLD_STARTING_DOCTRINE_REPLACEMENT_PREDECESSOR_WORLD_HASH.slice(1)}`;

    expect(() => OverworldSession.restore(WORLD, unknown)).toThrow(/different world manifest/i);
  });
});
