import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import { OverworldSession } from "../../src/world/session.js";
import {
  OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH,
  OVERWORLD_COMPARISON_CARD_PREDECESSOR_WORLD_HASH,
} from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const WORLD = loadOverworldManifest(process.cwd());

function openingDecisionSnapshot(): ReturnType<OverworldSession["snapshot"]> {
  const registration = WORLD.opening_registration;
  const oath = WORLD.opening_relief_oath;
  if (!registration || !oath) throw new Error("Albany must retain its opening choices.");

  const session = new OverworldSession(WORLD);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(registration.contact);
  session.chooseJourneyStory(registration.profiles[0]!.id);
  session.chooseJourneyStory(oath.options[0]!.id);
  return session.snapshot();
}

describe("comparison-card manifest snapshot integrity", () => {
  it("pins the exact presentation-only predecessor and current manifest hashes", () => {
    expect(OVERWORLD_COMPARISON_CARD_PREDECESSOR_WORLD_HASH).toBe(
      "3b7ccae1235ee3dd0fad5202594faf1d18e9c3f3d162bb214008d911cb2082d5",
    );
    expect(hashState(WORLD)).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH);
    expect(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH).toBe(
      "56577688e463b98883aea1c9063a6e577d6a5d2bb4fa412ee32b0f47576d849c",
    );
  });

  it("rebinds the immediate predecessor without changing gameplay state", () => {
    const current = openingDecisionSnapshot();
    const predecessor = structuredClone(current);
    predecessor.worldHash = OVERWORLD_COMPARISON_CARD_PREDECESSOR_WORLD_HASH;

    const restored = OverworldSession.restore(WORLD, predecessor).snapshot();

    expect(restored).toEqual(current);
    expect(restored.worldHash).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH);
    expect(OverworldSession.restore(WORLD, restored).snapshot()).toEqual(restored);
  });

  it("still rejects an adjacent unrelated manifest hash", () => {
    const unrelated = openingDecisionSnapshot();
    unrelated.worldHash = `f${OVERWORLD_COMPARISON_CARD_PREDECESSOR_WORLD_HASH.slice(1)}`;

    expect(() => OverworldSession.restore(WORLD, unrelated)).toThrow(/different world manifest/i);
  });
});
