import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import type { OverworldManifest } from "../../src/world/overworld.js";
import { RELIEF_OATH_STRATEGY_PARITY_PREDECESSOR_COPY } from "../../src/world/relief_oath_strategy_parity_legacy.js";
import { OverworldSession } from "../../src/world/session.js";
import {
  OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH,
  OVERWORLD_RELIEF_OATH_STRATEGY_PARITY_PREDECESSOR_WORLD_HASH,
} from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { exactReliefOathStrategyParityPredecessor } from "./fixtures/historical_overworlds.js";

const WORLD = loadOverworldManifest(process.cwd());
const PREDECESSOR = exactReliefOathStrategyParityPredecessor(WORLD);
const AID_ONLY = "albany:oath_limited_aid_only";

function pendingOathSession(world: OverworldManifest): OverworldSession {
  const registration = world.opening_registration;
  if (!registration) throw new Error("Albany must retain opening registration.");
  const session = new OverworldSession(world);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(registration.contact);
  session.chooseJourneyStory(registration.profiles[0]!.id);
  return session;
}

function selectedAidOnlySession(world: OverworldManifest): OverworldSession {
  const session = pendingOathSession(world);
  session.chooseJourneyStory(AID_ONLY);
  return session;
}

describe("relief-oath strategy-parity snapshot integrity", () => {
  it("pins the exact predecessor and current manifest hashes", () => {
    expect(hashState(PREDECESSOR)).toBe(
      OVERWORLD_RELIEF_OATH_STRATEGY_PARITY_PREDECESSOR_WORLD_HASH,
    );
    expect(OVERWORLD_RELIEF_OATH_STRATEGY_PARITY_PREDECESSOR_WORLD_HASH).toBe(
      "294bfefa9d3b17b21e5e2a48ded532e7b4c9b995ad7149b1519b1b4e490a9435",
    );
    expect(hashState(WORLD)).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH);
    expect(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH).toBe(
      "271f39351a549c0491c057dc372a80b8ecc899d0b9948d6c90df8ebc0729bd5a",
    );
  });

  it("restores a pending oath from the exact predecessor", () => {
    const predecessor = pendingOathSession(PREDECESSOR).snapshot();
    const native = pendingOathSession(WORLD).snapshot();

    expect(OverworldSession.restore(WORLD, predecessor).snapshot()).toEqual(native);
  });

  it("restores selected Aid-Only with the current strategy-parity journal copy", () => {
    const predecessor = selectedAidOnlySession(PREDECESSOR).snapshot();
    const native = selectedAidOnlySession(WORLD).snapshot();
    const predecessorOath = predecessor.journalEntries.find(
      (entry) => entry.kind === "relief_oath",
    );
    const nativeOath = native.journalEntries.find((entry) => entry.kind === "relief_oath");

    expect(predecessorOath?.text).toContain(
      RELIEF_OATH_STRATEGY_PARITY_PREDECESSOR_COPY.aidPreview,
    );
    expect(OverworldSession.restore(WORLD, predecessor).snapshot()).toEqual(native);
    expect(nativeOath?.text).toContain(
      WORLD.opening_relief_oath?.options.find((option) => option.id === AID_ONLY)?.preview,
    );
    expect(nativeOath?.text).not.toContain(RELIEF_OATH_STRATEGY_PARITY_PREDECESSOR_COPY.aidPreview);
  });

  it("rejects an adjacent unknown predecessor manifest", () => {
    const unknown = pendingOathSession(PREDECESSOR).snapshot();
    unknown.worldHash = `f${OVERWORLD_RELIEF_OATH_STRATEGY_PARITY_PREDECESSOR_WORLD_HASH.slice(1)}`;

    expect(() => OverworldSession.restore(WORLD, unknown)).toThrow(/different world manifest/i);
  });
});
