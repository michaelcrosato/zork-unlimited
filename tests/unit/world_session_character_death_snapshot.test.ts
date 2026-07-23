import { beforeAll, describe, expect, it } from "vitest";
import type { OverworldQuestView } from "../../src/world/session_local_discovery.js";
import { OverworldSession } from "../../src/world/session.js";
import {
  cloneOverworldSessionSnapshot,
  type OverworldSessionSnapshot,
} from "../../src/world/session_snapshot.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const world = loadOverworldManifest(process.cwd());
const DEATH_ENDING_ID = "ending_pulled_down";

function moveToOpeningPreparation(session: OverworldSession): void {
  const areaId = world.opening_preparation?.area;
  if (!areaId || session.view().currentArea?.id === areaId) return;
  const route = session.view().areaExits.find((candidate) => candidate.destination.id === areaId);
  if (!route) throw new Error(`Expected a visible route to ${areaId}.`);
  session.moveArea(route.id);
}

function settleOpeningChoices(session: OverworldSession): void {
  if (session.journey().storyChoice?.kind === "registration") {
    session.chooseJourneyStory("albany:ledger_advocate");
  }
  if (session.journey().storyChoice?.kind === "relief_oath") {
    session.chooseJourneyStory("albany:oath_limited_aid_only");
  }
  if (session.journey().storyChoice?.kind === "lead_source") {
    session.chooseJourneyStory("albany:source_rowan_civic_docket");
    moveToOpeningPreparation(session);
  }
  if (session.view().departureInteractions[0]?.kind === "preparation") {
    session.chooseJourneyStory("albany:prep_works_fortification");
  }
  if (session.view().departureInteractions[0]?.kind === "relief_allocation") {
    session.chooseJourneyStory("albany:relief_resident_shelter");
  }
}

function startVisibleQuest(session: OverworldSession, quest: OverworldQuestView): void {
  if (session.view().departureInteractions[0]?.kind === "relief_allocation") {
    session.chooseJourneyStory("albany:relief_resident_shelter");
  }
  const approach = quest.launch?.options.find((option) => option.projection?.available === true);
  if (approach) {
    session.startQuest(quest.id, approach.id);
  } else {
    session.startQuest(quest.id);
  }
}

function buildDeathSnapshots(): {
  checkpointSnapshot: OverworldSessionSnapshot;
  pendingSnapshot: OverworldSessionSnapshot;
} {
  const session = new OverworldSession(world);
  const opening = session.view();
  session.scoutPoi(opening.pois[0]!.id);
  session.talkToCharacter(opening.characters[0]!.id);
  settleOpeningChoices(session);

  const quest = session.view().quests.find((candidate) => candidate.id === "wolf_winter");
  if (!quest) throw new Error("Expected the Albany Wolf-Winter lead.");
  if (session.view().currentArea?.id !== quest.area) {
    const route = session
      .view()
      .areaExits.find((candidate) => candidate.destination.id === quest.area);
    if (!route) throw new Error("Expected a route to the Albany Wolf-Winter lead.");
    session.moveArea(route.id);
  }
  startVisibleQuest(session, quest);

  while (session.journey().acceptedDecisions < 40) {
    const next = session.journey().acceptedDecisions + 1;
    session.recordQuestDecision(
      `test:quest_action:${String(next)}`,
      {
        countsTowardJourney: true,
        reason: "combat",
      },
      true,
    );
  }
  expect(session.journey()).toMatchObject({
    status: "awaiting_choice",
    acceptedDecisions: 40,
    pendingChoice: { reasons: ["checkpoint"] },
  });
  const checkpointSnapshot = session.snapshot();

  session.recordQuestCharacterDeath(quest.id, {
    endingId: DEATH_ENDING_ID,
    death: true,
  });
  return { checkpointSnapshot, pendingSnapshot: session.snapshot() };
}

function clonePendingSnapshot(snapshot: OverworldSessionSnapshot): OverworldSessionSnapshot {
  return structuredClone(snapshot);
}

describe("overworld quest character-death snapshot boundary", () => {
  let checkpointSnapshot: OverworldSessionSnapshot;
  let pendingSnapshot: OverworldSessionSnapshot;

  beforeAll(() => {
    ({ checkpointSnapshot, pendingSnapshot } = buildDeathSnapshots());
  });

  it("requires a live identified death ending before recording the boundary", () => {
    const session = OverworldSession.restore(world, clonePendingSnapshot(checkpointSnapshot));
    expect(() =>
      session.recordQuestCharacterDeath("wolf_winter", {
        endingId: "ending_held",
        death: false,
      }),
    ).toThrow(/requires an identified death ending/i);
    expect(() =>
      session.recordQuestCharacterDeath("wolf_winter", {
        endingId: "",
        death: true,
      }),
    ).toThrow(/requires an identified death ending/i);
    expect(session.snapshot().questCharacterDeathBoundary).toBeUndefined();
  });

  it("restores an exact-checkpoint death and preserves its proof through the final receipt", () => {
    expect(pendingSnapshot.journey.pendingChoice?.reasons).toEqual([
      "checkpoint",
      "character_died",
    ]);
    expect(pendingSnapshot.questCharacterDeathBoundary).toEqual({
      questId: "wolf_winter",
      endingId: DEATH_ENDING_ID,
      acceptedDecisions: 40,
      journeyDecisionProof: pendingSnapshot.journey.decisionProof,
    });
    const detached = cloneOverworldSessionSnapshot(pendingSnapshot);
    detached.questCharacterDeathBoundary!.journeyDecisionProof.last!.actionId =
      "test:detached_mutation";
    expect(
      pendingSnapshot.questCharacterDeathBoundary?.journeyDecisionProof.last?.actionId,
    ).not.toBe("test:detached_mutation");

    const restored = OverworldSession.restore(world, clonePendingSnapshot(pendingSnapshot));
    const ended = restored.chooseJourney("end");
    expect(ended.exitReceipt).toMatchObject({
      acceptedDecisions: 40,
      exitReasons: ["checkpoint", "character_died"],
      decisionProofHash: pendingSnapshot.journey.decisionProof.hash,
    });

    const endedSnapshot = restored.snapshot();
    expect(endedSnapshot.questCharacterDeathBoundary).toEqual(
      pendingSnapshot.questCharacterDeathBoundary,
    );
    expect(OverworldSession.restore(world, endedSnapshot).journey()).toMatchObject({
      status: "ended",
      retentionHistory: [
        {
          choice: "end",
          reasons: ["checkpoint", "character_died"],
        },
      ],
    });
  });

  it("rejects a forged journey death without the live quest boundary", () => {
    const forged = clonePendingSnapshot(pendingSnapshot);
    delete forged.questCharacterDeathBoundary;

    expect(() => OverworldSession.restore(world, forged)).toThrow(
      /requires its quest death boundary/i,
    );
  });

  it.each([
    {
      label: "quest",
      mutate: (snapshot: OverworldSessionSnapshot) => {
        snapshot.questCharacterDeathBoundary!.questId = "breaking_weir";
      },
      error: /not bound to its exact unfinished quest/i,
    },
    {
      label: "accepted decision",
      mutate: (snapshot: OverworldSessionSnapshot) => {
        snapshot.questCharacterDeathBoundary!.acceptedDecisions -= 1;
      },
      error: /does not match its accepted journey decision/i,
    },
    {
      label: "decision proof hash",
      mutate: (snapshot: OverworldSessionSnapshot) => {
        snapshot.questCharacterDeathBoundary!.journeyDecisionProof.hash = "0".repeat(64);
      },
      error: /does not match its journey decision proof hash/i,
    },
    {
      label: "last decision proof",
      mutate: (snapshot: OverworldSessionSnapshot) => {
        snapshot.questCharacterDeathBoundary!.journeyDecisionProof.last!.actionId =
          "test:forged_action";
      },
      error: /does not match its last journey decision proof/i,
    },
  ])("rejects a mismatched $label boundary", ({ mutate, error }) => {
    const forged = clonePendingSnapshot(pendingSnapshot);
    mutate(forged);

    expect(() => OverworldSession.restore(world, forged)).toThrow(error);
  });
});
