import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import { OverworldSession } from "../../src/world/session.js";
import { OVERWORLD_OPENING_LEAD_SOURCE_WORLD_HASH } from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const WORLD = loadOverworldManifest(process.cwd());
const TIMBER_SERVICE_RULE_ID = "albany:wolf_saved_timber_quick_resupply";

function moveToArea(session: OverworldSession, areaId: string): void {
  const route = session.view().areaExits.find((candidate) => candidate.destination.id === areaId);
  if (!route) throw new Error(`expected a visible route to ${areaId}`);
  session.moveArea(route.id);
}

function savedTimberReturnBeforeService(withQuestDecision = false): OverworldSession {
  const session = new OverworldSession(WORLD);
  const opening = session.view();
  const poi = opening.pois[0];
  const contact = opening.characters[0];
  if (!poi || !contact) throw new Error("expected Albany opening sources");

  session.scoutPoi(poi.id);
  session.talkToCharacter(contact.id);
  session.chooseJourneyStory("albany:ledger_advocate");
  session.chooseJourneyStory("albany:source_jamie_market_testimony");
  moveToArea(session, "albany_city__market");
  moveToArea(session, "albany_city__transport_hub");
  session.startQuest("wolf_winter");
  if (withQuestDecision) {
    session.recordQuestDecision("wolf_winter:migration_boundary:1", {
      countsTowardJourney: true,
      reason: "stateful_clue",
    });
  }
  session.completeQuest("wolf_winter", {
    endingId: "ending_held_timber_saved",
    endingTitle: "The Byre Held, Paling Timber Saved",
    death: false,
  });
  session.chooseJourney("continue");
  session.chooseJourneyStory("send_wagon_to_cade");

  const outbound = session
    .view()
    .exits.find((candidate) => candidate.destination.id === "colonie_town");
  if (!outbound) throw new Error("expected the Albany-Colonie road");
  session.travel(outbound.id);
  if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
  const inbound = session
    .view()
    .exits.find((candidate) => candidate.destination.id === "albany_city");
  if (!inbound) throw new Error("expected the Colonie-Albany road");
  session.travel(inbound.id);
  if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");

  expect(session.view().serviceOffers).toContainEqual(
    expect.objectContaining({ id: TIMBER_SERVICE_RULE_ID, minutes: 15 }),
  );
  return session;
}

describe("campaign service predecessor migration integrity", () => {
  it("materializes a replayable quest boundary before a migrated save consumes a new service", () => {
    const predecessor = savedTimberReturnBeforeService(true).snapshot();
    predecessor.worldHash = OVERWORLD_OPENING_LEAD_SOURCE_WORLD_HASH;
    const completion = predecessor.journalEntries.find(
      (entry) => entry.id === "quest_done:wolf_winter",
    );
    if (!completion) throw new Error("expected Wolf-Winter completion journal");
    delete completion.questCompletionBoundary;

    const migrated = OverworldSession.restore(WORLD, predecessor);
    const migratedCompletion = migrated
      .snapshot()
      .journalEntries.find((entry) => entry.id === "quest_done:wolf_winter");
    expect(migratedCompletion?.questCompletionBoundary).toMatchObject({
      townId: "albany_city",
      areaId: "albany_city__transport_hub",
    });

    migrated.resupplyAtTown();
    const resaved = migrated.snapshot();
    expect(
      resaved.journalEntries.find((entry) => entry.serviceRuleId === TIMBER_SERVICE_RULE_ID),
    ).toBeDefined();
    expect(OverworldSession.restore(WORLD, resaved).snapshot()).toEqual(resaved);
  });

  it("rejects a predecessor passage whose old action id cannot prove its traversed roads", () => {
    const session = savedTimberReturnBeforeService();
    const passage = session.followGoalPassage();
    expect(passage.legs.length).toBeGreaterThan(0);
    const predecessor = session.snapshot();
    predecessor.worldHash = OVERWORLD_OPENING_LEAD_SOURCE_WORLD_HASH;
    const completion = predecessor.journalEntries.find(
      (entry) => entry.id === "quest_done:wolf_winter",
    );
    if (!completion) throw new Error("expected Wolf-Winter completion journal");
    delete completion.questCompletionBoundary;

    const trail = predecessor.openingLeadSourceDecisionTrail;
    const currentLast = trail?.decisions.at(-1);
    if (!trail || !currentLast || !currentLast.actionId.includes(":via:")) {
      throw new Error("expected an encoded goal-passage proof");
    }
    const legacyLast = {
      ...currentLast,
      actionId: currentLast.actionId.slice(0, currentLast.actionId.indexOf(":via:")),
    };
    const decisions = [...trail.decisions.slice(0, -1), legacyLast];
    let proofHash = trail.baseDecisionProofHash;
    for (const decision of decisions) {
      proofHash = hashState({ previous: proofHash, ...decision });
    }
    predecessor.openingLeadSourceDecisionTrail = { ...trail, decisions };
    predecessor.journey.decisionProof = { hash: proofHash, last: legacyLast };

    expect(() => OverworldSession.restore(WORLD, predecessor)).toThrow(
      /goal passage whose road suffix cannot anchor later campaign services/i,
    );
  });
});
