import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import { ALBANY_DAWN_DISPATCH_GOALS } from "../../src/world/journey_campaign.js";
import { OverworldSession } from "../../src/world/session.js";
import {
  OVERWORLD_CAMPAIGN_SERVICE_WORLD_HASH,
  OVERWORLD_OPENING_LEAD_SOURCE_WORLD_HASH,
  OVERWORLD_OPENING_PREPARATION_PREDECESSOR_WORLD_HASH,
} from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const WORLD = loadOverworldManifest(process.cwd());
const TIMBER_SERVICE_RULE_ID = "albany:wolf_saved_timber_quick_resupply";
const WAGON_SERVICE_RULE_ID = "albany:dawn_wagon_solo_packet_resupply";
const LIVE_PACK_SERVICE_RULE_ID = "albany:wolf_live_pack_greenway_resupply";
const TARGET_QUEST = "wolf_winter";
const CURRENT_DAWN_WAGON_JOURNAL_TITLE = "Send the wagon back to Cade";
const PRE_F11_DAWN_WAGON_JOURNAL_TITLE = "Send the wagon to rebuild Cade's outer line";
const CURRENT_DAWN_WAGON_SERVICE_SUMMARY =
  "Because you sent the dawn wagon back to Cade and carried Hedrick's packet north alone, Jamie Tanner holds a one-time Market road-store credit.";
const PRE_F11_DAWN_WAGON_SERVICE_SUMMARY =
  "Because you assigned the dawn wagon to rebuild Cade's outer line, Jamie Tanner holds a one-time Market road-store credit for carrying Hedrick's packet alone.";
const STARTED_742_FIXTURE = JSON.parse(
  readFileSync(
    join(process.cwd(), "tests", "regression", "fixtures", "campaign_service_742_started.json"),
    "utf8",
  ),
) as {
  provenance: { commit: string; worldHash: string; state: string };
  snapshot: unknown;
};

function moveToArea(session: OverworldSession, areaId: string): void {
  const route = session.view().areaExits.find((candidate) => candidate.destination.id === areaId);
  if (!route) throw new Error(`expected a visible route to ${areaId}`);
  session.moveArea(route.id);
}

/** Restore a real quest-started save frozen from the exact 742 manifest revision. */
function startedNoPreparationPredecessor(): OverworldSession {
  expect(STARTED_742_FIXTURE.provenance).toEqual({
    commit: "8460eb091ca3752a863f2a9ccc98cd6ddace51fa",
    worldHash: OVERWORLD_OPENING_PREPARATION_PREDECESSOR_WORLD_HASH,
    state: "wolf_winter_started_without_opening_preparation",
  });
  const migrated = OverworldSession.restore(WORLD, structuredClone(STARTED_742_FIXTURE.snapshot));
  expect(migrated.journey().storyChoice).toBeNull();
  expect(migrated.snapshot().startedQuestIds).toContain(TARGET_QUEST);
  expect(migrated.snapshot().completedQuestIds).not.toContain(TARGET_QUEST);
  expect(migrated.snapshot().journalEntries).toContainEqual(
    expect.objectContaining({ kind: "preparation_legacy" }),
  );
  return migrated;
}

function snapshotAsPredecessor(
  session: OverworldSession,
  worldHash: string,
): ReturnType<OverworldSession["snapshot"]> {
  const predecessor = session.snapshot();
  predecessor.worldHash = worldHash;
  predecessor.journalEntries = predecessor.journalEntries
    .filter((entry) => entry.kind !== "preparation_legacy")
    .map((entry) => {
      if (
        entry.kind === "campaign" &&
        /^campaign_goal:\d+:carry_hedricks_packet_north$/.test(entry.id)
      ) {
        if (entry.title !== CURRENT_DAWN_WAGON_JOURNAL_TITLE) {
          throw new Error(
            `expected the current dawn-wagon journal title, received "${entry.title}"`,
          );
        }
        return { ...entry, title: PRE_F11_DAWN_WAGON_JOURNAL_TITLE };
      }

      if (entry.kind === "service" && entry.serviceRuleId === WAGON_SERVICE_RULE_ID) {
        const currentPrefix = `${CURRENT_DAWN_WAGON_SERVICE_SUMMARY} `;
        if (!entry.text.startsWith(currentPrefix)) {
          throw new Error(`expected the current dawn-wagon service summary in "${entry.id}"`);
        }
        return {
          ...entry,
          text: `${PRE_F11_DAWN_WAGON_SERVICE_SUMMARY} ${entry.text.slice(currentPrefix.length)}`,
        };
      }

      return entry;
    });
  return predecessor;
}

function savedTimberReturnBeforeService(withQuestDecision = false): OverworldSession {
  const session = startedNoPreparationPredecessor();
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

function livePackCompletion(): OverworldSession {
  const session = new OverworldSession(WORLD);
  const opening = session.view();
  session.scoutPoi(opening.pois[0]!.id);
  session.talkToCharacter(opening.characters[0]!.id);
  session.chooseJourneyStory("albany:road_warden");
  session.chooseJourneyStory("albany:source_rowan_civic_docket");
  expect(session.journey().storyChoice?.kind).toBe("preparation");
  session.chooseJourneyStory("albany:prep_works_fortification");

  moveToArea(session, "albany_city__market");
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter("albany_city__market__contact");
  session.exploreSite(session.view().sites[0]!.id);
  moveToArea(session, "albany_city__transport_hub");
  session.startQuest("wolf_winter");
  session.completeQuest("wolf_winter", {
    endingId: "ending_pack_diverted",
    endingTitle: "The Pack Diverted Alive",
    death: false,
  });
  return session;
}

function livePackReturnBeforeService(): OverworldSession {
  const session = livePackCompletion();
  session.chooseJourney("continue");
  session.chooseJourneyStory("send_wagon_to_cade");
  moveToArea(session, "albany_city__greenway");
  expect(session.view().serviceOffers).toContainEqual(
    expect.objectContaining({ id: LIVE_PACK_SERVICE_RULE_ID, minutes: 15 }),
  );
  return session;
}

describe("campaign service predecessor migration integrity", () => {
  it("migrates the immediate predecessor with replay-bound service evidence and branch proof", () => {
    const previous = savedTimberReturnBeforeService();
    previous.resupplyAtTown();
    const predecessor = snapshotAsPredecessor(previous, OVERWORLD_CAMPAIGN_SERVICE_WORLD_HASH);
    expect(
      predecessor.journalEntries.find((entry) => entry.kind === "campaign")?.text,
    ).not.toContain("one-time 15-minute resupply");

    const migrated = OverworldSession.restore(WORLD, predecessor);
    expect(
      migrated
        .snapshot()
        .journalEntries.find((entry) => entry.serviceRuleId === TIMBER_SERVICE_RULE_ID),
    ).toBeDefined();
    moveToArea(migrated, "albany_city__market");
    expect(migrated.view().serviceOffers).toContainEqual(
      expect.objectContaining({
        id: WAGON_SERVICE_RULE_ID,
        providerId: "albany_city__market__contact",
        providerName: "Jamie Tanner",
        minutes: 15,
      }),
    );
  });

  it("rejects new live-pack service consumption relabeled as predecessor evidence", () => {
    const forged = savedTimberReturnBeforeService();
    forged.resupplyAtTown();
    const predecessor = snapshotAsPredecessor(forged, OVERWORLD_CAMPAIGN_SERVICE_WORLD_HASH);
    const service = predecessor.journalEntries.find(
      (entry) => entry.serviceRuleId === TIMBER_SERVICE_RULE_ID,
    );
    if (!service) throw new Error("expected saved-timber service evidence");
    service.serviceRuleId = LIVE_PACK_SERVICE_RULE_ID;
    expect(() => OverworldSession.restore(WORLD, predecessor)).toThrow(
      /service evidence introduced by a later manifest/i,
    );
  });

  it("rejects a current-only Wolf outcome relabeled as predecessor evidence", () => {
    const predecessor = snapshotAsPredecessor(
      livePackReturnBeforeService(),
      OVERWORLD_CAMPAIGN_SERVICE_WORLD_HASH,
    );

    expect(() => OverworldSession.restore(WORLD, predecessor)).toThrow(
      /Wolf-Winter quest outcome introduced by a later manifest/i,
    );
  });

  it("rejects a current-only Wolf outcome relabeled through an older trusted era", () => {
    const predecessor = livePackCompletion().snapshot();
    predecessor.worldHash = OVERWORLD_OPENING_LEAD_SOURCE_WORLD_HASH;
    const completion = predecessor.journalEntries.find(
      (entry) => entry.id === "quest_done:wolf_winter",
    );
    if (!completion) throw new Error("expected Wolf-Winter completion journal");
    delete completion.questCompletionBoundary;

    expect(() => OverworldSession.restore(WORLD, predecessor)).toThrow(
      /Wolf-Winter quest outcome introduced by a later manifest/i,
    );
  });

  it("rejects relabeling an immediate-predecessor dawn branch without its exact decision proof", () => {
    const predecessor = snapshotAsPredecessor(
      savedTimberReturnBeforeService(),
      OVERWORLD_CAMPAIGN_SERVICE_WORLD_HASH,
    );
    predecessor.journey.goal = {
      ...predecessor.journey.goal,
      id: ALBANY_DAWN_DISPATCH_GOALS.send_wardens_north.id,
      text: ALBANY_DAWN_DISPATCH_GOALS.send_wardens_north.text,
    };

    expect(() => OverworldSession.restore(WORLD, predecessor)).toThrow(
      /story choice.*does not have exactly one canonical journey decision proof/i,
    );
  });

  it("materializes a replayable quest boundary before a migrated save consumes a new service", () => {
    const predecessor = snapshotAsPredecessor(
      savedTimberReturnBeforeService(true),
      OVERWORLD_OPENING_LEAD_SOURCE_WORLD_HASH,
    );
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
    const predecessor = snapshotAsPredecessor(session, OVERWORLD_OPENING_LEAD_SOURCE_WORLD_HASH);
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
