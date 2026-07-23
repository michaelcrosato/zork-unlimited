import { describe, expect, it } from "vitest";

import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const world = loadOverworldManifest(process.cwd());

function deferredSession(): OverworldSession {
  const session = new OverworldSession(world);
  while (session.journey().acceptedDecisions < 42) {
    session.recordQuestDecision(
      `test:unsafe-scene:${String(session.journey().acceptedDecisions + 1)}`,
      { countsTowardJourney: true, reason: "combat" },
      false,
    );
  }
  return session;
}

describe("overworld deferred checkpoint save/restore", () => {
  it("round-trips accepted proof beyond a due threshold without a snapshot-version bump", () => {
    const original = deferredSession();
    const snapshot = original.snapshot();
    const proof = structuredClone(snapshot.journey.decisionProof);
    expect(snapshot.journey).toMatchObject({
      status: "active",
      acceptedDecisions: 42,
      nextCheckpoint: 40,
      pendingChoice: null,
      decisionProof: proof,
    });

    const restored = OverworldSession.restore(world, snapshot);
    expect(restored.snapshot().version).toBe(snapshot.version);
    expect(restored.journey()).toMatchObject({
      status: "active",
      acceptedDecisions: 42,
      nextCheckpoint: 40,
      pendingChoice: null,
      decisionProof: proof,
    });

    restored.recordQuestDecision(
      "test:safe-dialogue-close",
      { countsTowardJourney: false, reason: "dialogue_closure" },
      true,
    );
    expect(restored.journey()).toMatchObject({
      status: "awaiting_choice",
      acceptedDecisions: 42,
      nextCheckpoint: 40,
      decisionProof: proof,
      pendingChoice: { atDecision: 42, checkpoint: 40 },
    });
    expect(OverworldSession.restore(world, restored.snapshot()).journey()).toMatchObject({
      status: "awaiting_choice",
      acceptedDecisions: 42,
      pendingChoice: { atDecision: 42, checkpoint: 40 },
    });
  });

  it("rejects a save that silently skips the overdue fixed checkpoint", () => {
    const forged = deferredSession().snapshot();
    forged.journey.nextCheckpoint = 80;
    expect(() => OverworldSession.restore(world, forged)).toThrow(
      /next fixed journey checkpoint must be 40/i,
    );
  });
});
