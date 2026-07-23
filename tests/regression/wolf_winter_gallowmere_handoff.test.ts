import { describe, expect, it } from "vitest";

import { planOverworldRoute } from "../../src/world/overworld.js";
import {
  authoredLocalJobLegacyCompletion,
  describeAuthoredLocalJobLegacyAction,
  migrateAuthoredLocalJobLegacyEntry,
} from "../../src/world/local_job_scene_legacy.js";
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const world = loadOverworldManifest(process.cwd());

const ALBANY_TO_SARATOGA = "road_albany_city__saratoga_springs_city";
const SARATOGA_TO_QUEENSBURY = "road_saratoga_springs_city__queensbury_town";
const QUEENSBURY_MARKET_ROUTE = "queensbury_town__area_route__civic_core__market__1";
const HAYDEN_ID = "albany_city__transport_hub__contact";

function haydenCard(session: OverworldSession) {
  const hayden = session.view().characters.find((character) => character.id === HAYDEN_ID);
  if (!hayden) throw new Error("Expected Hayden Hale in Albany Station Quarter.");
  return hayden;
}

function contactCopy(contact: { summary: string; agenda: string }): string {
  return `${contact.summary} ${contact.agenda}`;
}

function moveToArea(session: OverworldSession, destinationAreaId: string): void {
  const route = session
    .view()
    .areaExits.find((candidate) => candidate.destination.id === destinationAreaId);
  if (!route) throw new Error(`Expected a discovered area route to ${destinationAreaId}.`);
  session.moveArea(route.id);
}

function startAlbanyWolf(session: OverworldSession): void {
  if (session.view().currentArea?.id !== "albany_city__civic_core") {
    moveToArea(session, "albany_city__civic_core");
  }
  session.scoutPoi("albany_city__civic_core__poi");
  if (session.campaignCharacterState().background === null) {
    session.talkToCharacter("albany_city__civic_core__contact");
    session.chooseJourneyStory("albany:ledger_advocate");
  }
  if (session.journey().storyChoice?.kind === "relief_oath") {
    session.chooseJourneyStory("albany:oath_limited_aid_only");
  }
  if (session.journey().storyChoice?.kind === "lead_source") {
    session.chooseJourneyStory("albany:source_rowan_civic_docket");
  }
  moveToArea(session, world.opening_preparation!.area);
  if (session.view().departureInteractions[0]?.kind === "preparation") {
    session.chooseJourneyStory("albany:prep_works_fortification");
  }
  if (session.view().departureInteractions[0]?.kind === "relief_allocation") {
    session.chooseJourneyStory("albany:relief_resident_shelter");
  }
  moveToArea(session, "albany_city__market");
  session.scoutPoi("albany_city__market__poi");
  moveToArea(session, "albany_city__transport_hub");
  expect(session.view().quests.map((quest) => quest.id)).toContain("wolf_winter");
  session.startQuest("wolf_winter", "albany:wolf_approach_sheltered_stockway");
}

function revealAlbanyWolfAtStation(session: OverworldSession): void {
  if (session.view().currentArea?.id !== "albany_city__civic_core") {
    moveToArea(session, "albany_city__civic_core");
  }
  session.scoutPoi("albany_city__civic_core__poi");
  if (session.campaignCharacterState().background === null) {
    session.talkToCharacter("albany_city__civic_core__contact");
    session.chooseJourneyStory("albany:ledger_advocate");
  }
  if (session.journey().storyChoice?.kind === "relief_oath") {
    session.chooseJourneyStory("albany:oath_limited_aid_only");
  }
  if (session.journey().storyChoice?.kind === "lead_source") {
    session.chooseJourneyStory("albany:source_rowan_civic_docket");
  }
  moveToArea(session, world.opening_preparation!.area);
  if (session.view().departureInteractions[0]?.kind === "preparation") {
    session.chooseJourneyStory("albany:prep_works_fortification");
  }
  if (session.view().departureInteractions[0]?.kind === "relief_allocation") {
    session.chooseJourneyStory("albany:relief_resident_shelter");
  }
  moveToArea(session, "albany_city__market");
  session.scoutPoi("albany_city__market__poi");
  moveToArea(session, "albany_city__transport_hub");
  expect(session.view().quests.map((quest) => quest.id)).toContain("wolf_winter");
}

function completeWolfWithBaseHaydenAtDecision22(session: OverworldSession): string {
  revealAlbanyWolfAtStation(session);
  const baseCard = haydenCard(session);
  const baseCopy = contactCopy(baseCard);
  expect(baseCard).not.toHaveProperty("variants");
  expect(baseCopy).toContain("controlling source certification");
  expect(baseCopy).toContain("Old Cade's steading");
  expect(baseCopy).not.toMatch(/current journey goal|return board|crossed both/i);

  const beforeTalk = session.journey().acceptedDecisions;
  const talked = session.talkToCharacter(HAYDEN_ID);
  expect(talked).toMatchObject({
    minutes: 15,
    alreadyKnown: false,
    journeyDecision: { countsTowardJourney: true, reason: "substantive_dialogue" },
  });
  expect(talked.entry.text).toBe(baseCopy);
  expect(session.journey().acceptedDecisions).toBe(beforeTalk + 1);

  session.startQuest("wolf_winter", "albany:wolf_approach_sheltered_stockway");
  while (session.journey().acceptedDecisions < 22) {
    const next = session.journey().acceptedDecisions + 1;
    session.recordQuestDecision(
      `wolf_winter:hayden_lifecycle:${String(next)}`,
      {
        countsTowardJourney: true,
        reason: "preparation",
      },
      true,
    );
  }
  session.completeQuest("wolf_winter", {
    endingId: "ending_held_timber_saved",
    endingTitle: "The Byre Held, Paling Timber Saved",
    death: false,
  });
  expect(session.journey()).toMatchObject({
    acceptedDecisions: 22,
    goal: { status: "completed", completedAtDecision: 22 },
    pendingChoice: { reasons: ["goal_completed"] },
  });
  return baseCopy;
}

function travelToQueensburyMarket(session: OverworldSession): void {
  session.travel(ALBANY_TO_SARATOGA);
  if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
  session.travel(SARATOGA_TO_QUEENSBURY);
  if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
  session.exploreArea("queensbury_town__civic_core");
  moveToArea(session, "queensbury_town__market");
}

function returnToAlbanyStation(session: OverworldSession): void {
  session.travel(SARATOGA_TO_QUEENSBURY);
  if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
  session.travel(ALBANY_TO_SARATOGA);
  if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
  expect(session.view()).toMatchObject({
    current: { id: "albany_city" },
    currentArea: { id: "albany_city__transport_hub" },
  });
}

function completeWolfAtDecision22(session: OverworldSession): void {
  startAlbanyWolf(session);
  while (session.journey().acceptedDecisions < 22) {
    const next = session.journey().acceptedDecisions + 1;
    session.recordQuestDecision(
      `wolf_winter:regression_setup:${String(next)}`,
      {
        countsTowardJourney: true,
        reason: "preparation",
      },
      true,
    );
  }
  session.completeQuest("wolf_winter", {
    endingId: "ending_held_timber_saved",
    endingTitle: "The Byre Held, Paling Timber Saved",
    death: false,
  });
  expect(session.journey()).toMatchObject({
    acceptedDecisions: 22,
    goal: { status: "completed", completedAtDecision: 22 },
    pendingChoice: { reasons: ["goal_completed"] },
  });
}

function startGallowmereAfterWolf(
  choice: "send_wagon_to_cade" | "send_wardens_north",
): OverworldSession {
  const session = new OverworldSession(world);
  completeWolfAtDecision22(session);

  session.chooseJourney("continue");
  expect(session.journey().storyChoice?.options.map((option) => option.id)).toEqual([
    "send_wagon_to_cade",
    "send_wardens_north",
  ]);
  session.chooseJourneyStory(choice);
  expect(session.journey().acceptedDecisions).toBe(23);
  expect(session.journey().goalGuidance).toBe(
    "Objective route: take the road toward Saratoga Springs city. Queensbury town is 2 roads and about 60 road minutes away.",
  );

  session.travel(ALBANY_TO_SARATOGA);
  expect(session.journey().goalGuidance).toBe(
    "Objective route: take the road toward Queensbury town. Queensbury town is 1 road and about 26 road minutes away.",
  );
  session.resolveRoadEncounter("press_on");
  session.travel(SARATOGA_TO_QUEENSBURY);
  expect(session.view().pendingRoadEncounter).toBeNull();
  expect(session.journey().acceptedDecisions).toBe(26);

  session.exploreArea("queensbury_town__civic_core");
  expect(session.journey().goalGuidance).toBe(
    "Objective town reached: move toward Queensbury Market Streets to find the authored lead.",
  );
  expect(session.view().quests.map((quest) => quest.id)).toContain("gallowmere");
  session.moveArea(QUEENSBURY_MARKET_ROUTE);
  const started = session.startQuest("gallowmere");

  expect(started.id).toBe("gallowmere");
  expect(session.journey().acceptedDecisions).toBe(29);
  expect(session.journey().acceptedDecisions - 22).toBe(7);
  expect(session.view()).toMatchObject({
    current: { id: "queensbury_town" },
    currentArea: { id: "queensbury_town__market" },
    completedJobIds: [],
    startedQuestIds: ["gallowmere", "wolf_winter"],
  });
  expect(session.journey().goalGuidance).toBe(
    "Objective location reached: Queensbury Market Streets. Follow the visible authored lead here.",
  );
  return session;
}

describe("Wolf-Winter to Gallowmere authored handoff", () => {
  it("pins the two-road Albany-to-Queensbury corridor and its authored story copy", () => {
    const route = planOverworldRoute(world, "albany_city", "queensbury_town");
    expect(route).not.toBeNull();
    expect(route?.steps.map((step) => step.edge.id)).toEqual([
      ALBANY_TO_SARATOGA,
      SARATOGA_TO_QUEENSBURY,
    ]);
    expect(route?.steps.map((step) => step.roadEvent?.id)).toEqual([
      `road_event_${ALBANY_TO_SARATOGA.slice("road_".length)}`,
      `road_event_${SARATOGA_TO_QUEENSBURY.slice("road_".length)}`,
    ]);
    expect(route?.totalMinutes).toBe(60);
    expect(route?.totalDistanceMi).toBeCloseTo(57.6, 8);

    expect(route?.steps[0]?.roadEvent).toMatchObject({
      title: "The northbound relief line",
      summary:
        "Snow ruts and Albany relief-wagon tracks braid the road between the capital and Saratoga Springs. Wardens at each turnout repeat the same fresh warning: a shepherd was killed above Queensbury, and his son is waiting with the spoor record.",
    });
    expect(route?.steps[1]?.roadEvent).toMatchObject({
      title: "Moor sign on the Queensbury road",
      summary:
        "Beyond Saratoga the freight road climbs into colder country. Shepherds point out churned verges and a broad, deep track turning toward the Gallowmere hills before Queensbury.",
    });
    expect(route?.steps.map((step) => step.roadEvent?.title)).not.toContain(
      "I-87 / New York State Thruway road report",
    );

    const civic = world.areas.find((area) => area.id === "queensbury_town__civic_core");
    const market = world.areas.find((area) => area.id === "queensbury_town__market");
    expect(civic).toMatchObject({
      summary:
        "Road wardens pin fresh snow reports beside the municipal notices. One black-bordered shepherd's petition points from these steps toward Hedrick Cradoc in the market streets.",
    });
    expect(market).toMatchObject({
      summary:
        "Wool carts and winter stalls crowd the market, but Hedrick Cradoc's mud-dark tracking log has opened a hard circle of silence: his father died on the high moor that morning.",
      discovery:
        "Exploring it can reveal Hedrick's Gallowmere lead, resupply opportunities, and what the old grey sow left in the peat above town.",
    });

    expect(
      world.characters.find((character) => character.id === "queensbury_town__market__contact"),
    ).toMatchObject({
      name: "Hedrick Cradoc",
      role: "shepherd's son",
      faction: "Queensbury Shepherds",
      summary:
        "Hedrick Cradoc waits beside his father's tracking log, red-eyed and peat-stained after carrying word down from the high moor.",
      agenda:
        "Needs a hunter to read the sign his father left, judge the Gallowmere wind, and take the old grey sow before another shepherd dies.",
    });
    expect(world.quests.find((quest) => quest.id === "gallowmere")).toMatchObject({
      home: "queensbury_town",
      area: "queensbury_town__market",
      discovery:
        "Hedrick Cradoc waits in Queensbury Market Streets with his dead father's tracking log and a same-morning trail to the old grey Gallowmere sow.",
    });
    expect(world.area_edges.find((edge) => edge.id === QUEENSBURY_MARKET_ROUTE)).toMatchObject({
      route: "Follow the shepherds' petition from the civic steps to Hedrick's market stall",
    });
  });

  it.each(["send_wagon_to_cade", "send_wardens_north"] as const)(
    "starts Gallowmere at decision 29 through %s without a generic job dependency",
    (choice) => {
      const session = startGallowmereAfterWolf(choice);
      expect(session.view().log.map((entry) => entry.edgeId)).toEqual([
        SARATOGA_TO_QUEENSBURY,
        ALBANY_TO_SARATOGA,
      ]);
      expect(session.journey().goal).toMatchObject({
        version: 2,
        status: "active",
      });
      session.completeQuest("gallowmere", {
        endingId: "ending_victory",
        endingTitle: "The Gallowmere Broken",
        death: false,
      });
      session.chooseJourney("continue");
      expect(session.journey()).toMatchObject({
        goal: { version: 3, id: "oneonta_tanners_fever", status: "active" },
        goalGuidance:
          "Objective route: take the road toward Saratoga Springs city. Oneonta city is 6 roads and about 153 road minutes away.",
      });
    },
  );

  it("evolves Hayden's contact card and one-time talk across both dispatch branches and restore", () => {
    const baseCopies: string[] = [];
    const wolfClosedCopies: string[] = [];
    const bothClosedCopies: string[] = [];

    for (const choice of ["send_wagon_to_cade", "send_wardens_north"] as const) {
      const session = new OverworldSession(world);
      baseCopies.push(completeWolfWithBaseHaydenAtDecision22(session));

      session.chooseJourney("continue");
      session.chooseJourneyStory(choice);
      const wolfClosedCard = haydenCard(session);
      const wolfClosedCopy = contactCopy(wolfClosedCard);
      wolfClosedCopies.push(wolfClosedCopy);
      expect(wolfClosedCard).not.toHaveProperty("variants");
      expect(wolfClosedCopy).toMatch(/Cade/i);
      expect(wolfClosedCopy).toMatch(/surviving|closed|return board/i);
      expect(wolfClosedCopy).toMatch(/current journey goal|journey ledger/i);
      expect(wolfClosedCopy).not.toMatch(/controlling source certification|settled packets/i);

      const beforeWolfClosedTalk = session.journey().acceptedDecisions;
      const wolfClosedTalk = session.talkToCharacter(HAYDEN_ID);
      expect(wolfClosedTalk).toMatchObject({
        minutes: 15,
        alreadyKnown: false,
        entry: { id: `talk:${HAYDEN_ID}@wolf_winter_closed`, text: wolfClosedCopy },
        journeyDecision: { countsTowardJourney: true, reason: "substantive_dialogue" },
      });
      expect(session.journey().acceptedDecisions).toBe(beforeWolfClosedTalk + 1);

      travelToQueensburyMarket(session);
      session.startQuest("gallowmere");
      session.completeQuest("gallowmere", {
        endingId: "ending_victory",
        endingTitle: "The Gallowmere Broken",
        death: false,
      });
      session.chooseJourney("continue");
      returnToAlbanyStation(session);
      expect(
        session
          .view()
          .log.slice(0, 2)
          .map((entry) => entry.edgeId),
      ).toEqual([ALBANY_TO_SARATOGA, SARATOGA_TO_QUEENSBURY]);

      const snapshotBeforeTalk = session.snapshot();
      const hashBeforeTalk = session.snapshotHash();
      const restoredBeforeTalk = OverworldSession.restore(world, snapshotBeforeTalk);
      expect(restoredBeforeTalk.snapshotHash()).toBe(hashBeforeTalk);
      const bothClosedCard = haydenCard(restoredBeforeTalk);
      const bothClosedCopy = contactCopy(bothClosedCard);
      bothClosedCopies.push(bothClosedCopy);
      expect(bothClosedCard).not.toHaveProperty("variants");
      expect(bothClosedCopy).toMatch(/Cade/i);
      expect(bothClosedCopy).toMatch(/Hedrick|Gallowmere/i);
      expect(bothClosedCopy).toMatch(/crossed|closed|settled|filed/i);
      expect(bothClosedCopy).toMatch(/current journey goal|journey ledger/i);
      expect(bothClosedCopy).not.toBe(wolfClosedCopy);
      expect(bothClosedCopy).not.toMatch(/controlling source certification|settled packets/i);

      const decisionsBeforeTalk = restoredBeforeTalk.journey().acceptedDecisions;
      const firstTalk = restoredBeforeTalk.talkToCharacter(HAYDEN_ID);
      expect(firstTalk).toMatchObject({
        minutes: 15,
        alreadyKnown: false,
        entry: {
          id: `talk:${HAYDEN_ID}@wolf_winter_and_gallowmere_closed`,
          text: bothClosedCopy,
        },
        journeyDecision: { countsTowardJourney: true, reason: "substantive_dialogue" },
      });
      expect(restoredBeforeTalk.journey().acceptedDecisions).toBe(decisionsBeforeTalk + 1);
      expect(restoredBeforeTalk.snapshotHash()).not.toBe(hashBeforeTalk);

      const snapshotAfterTalk = restoredBeforeTalk.snapshot();
      const hashAfterTalk = restoredBeforeTalk.snapshotHash();
      const restoredAfterTalk = OverworldSession.restore(world, snapshotAfterTalk);
      expect(restoredAfterTalk.snapshotHash()).toBe(hashAfterTalk);
      const projectionBeforeRepeat = restoredAfterTalk.view();
      const repeat = restoredAfterTalk.talkToCharacter(HAYDEN_ID);
      expect(repeat).toMatchObject({
        minutes: 0,
        alreadyKnown: true,
        entry: { text: bothClosedCopy },
        journeyDecision: { countsTowardJourney: false, reason: "repeated_context" },
      });
      expect(restoredAfterTalk.journey().acceptedDecisions).toBe(decisionsBeforeTalk + 1);
      expect(restoredAfterTalk.snapshotHash()).toBe(hashAfterTalk);
      expect(restoredAfterTalk.view()).toEqual(projectionBeforeRepeat);
    }

    expect([...new Set(baseCopies)]).toHaveLength(1);
    expect([...new Set(wolfClosedCopies)]).toHaveLength(1);
    expect([...new Set(bothClosedCopies)]).toHaveLength(1);
  });

  it("restores an authored job after a newer reactive talk without losing its older setup talk", () => {
    const syntheticWorld = structuredClone(world);
    const stationJob = syntheticWorld.local_jobs.find(
      (job) => job.id === "albany_city__transport_hub__job",
    );
    const worksScene = syntheticWorld.local_jobs.find(
      (job) => job.id === "albany_city__industrial__job",
    )?.authored_scene;
    if (!stationJob || !worksScene) throw new Error("Expected station job and authored fixture.");
    stationJob.authored_scene = {
      ...structuredClone(worksScene),
      id: "test:station-dispatch-authored-job",
      required_poi_id: "albany_city__transport_hub__poi",
      required_contact_id: HAYDEN_ID,
    };

    // Prove the same reusable migration machinery on this second job using a
    // real generic predecessor execution, rather than only parsing a fixture.
    const predecessorWorld = structuredClone(syntheticWorld);
    const predecessorJob = predecessorWorld.local_jobs.find((job) => job.id === stationJob.id);
    if (!predecessorJob) throw new Error("Expected synthetic predecessor station job.");
    delete predecessorJob.authored_scene;
    const predecessor = new OverworldSession(predecessorWorld);
    completeWolfWithBaseHaydenAtDecision22(predecessor);
    predecessor.chooseJourney("continue");
    predecessor.chooseJourneyStory("send_wardens_north");
    predecessor.scoutPoi("albany_city__transport_hub__poi");
    predecessor.talkToCharacter(HAYDEN_ID);
    predecessor.workLocalJob(predecessorJob.id);
    const predecessorSnapshot = predecessor.snapshot();
    const predecessorEntry = predecessorSnapshot.journalEntries.find(
      (entry) => entry.id === `job:${predecessorJob.id}`,
    );
    if (!predecessorEntry) throw new Error("Expected executed generic predecessor job entry.");
    const legacyDefinition = {
      sourceWorldHash: predecessorSnapshot.worldHash,
      jobId: stationJob.id,
      sceneId: stationJob.authored_scene.id,
      legacyJob: predecessorJob,
    };
    const migratedEntry = migrateAuthoredLocalJobLegacyEntry({
      area: syntheticWorld.areas.find((area) => area.id === stationJob.area) ?? null,
      currentJob: stationJob,
      definition: legacyDefinition,
      entry: predecessorEntry,
      townName: predecessorEntry.town,
    });
    const migratedCompletion = authoredLocalJobLegacyCompletion(
      stationJob.id,
      migratedEntry.localSceneProof,
      [legacyDefinition],
    );
    expect(migratedCompletion).not.toBeNull();
    expect(describeAuthoredLocalJobLegacyAction(migratedCompletion!, null).minutes).toBe(
      predecessorJob.minutes,
    );

    const session = new OverworldSession(syntheticWorld);
    completeWolfWithBaseHaydenAtDecision22(session);
    session.chooseJourney("continue");
    session.chooseJourneyStory("send_wardens_north");
    session.scoutPoi("albany_city__transport_hub__poi");
    expect(session.talkToCharacter(HAYDEN_ID).entry.id).toBe(
      `talk:${HAYDEN_ID}@wolf_winter_closed`,
    );
    session.workLocalJob(stationJob.id, stationJob.authored_scene.options[0]!.id);

    travelToQueensburyMarket(session);
    session.startQuest("gallowmere");
    session.completeQuest("gallowmere", {
      endingId: "ending_victory",
      endingTitle: "The Gallowmere Broken",
      death: false,
    });
    session.chooseJourney("continue");
    returnToAlbanyStation(session);
    expect(session.talkToCharacter(HAYDEN_ID).entry.id).toBe(
      `talk:${HAYDEN_ID}@wolf_winter_and_gallowmere_closed`,
    );

    const snapshot = session.snapshot();
    const jobIndex = snapshot.journalEntries.findIndex(
      (entry) => entry.id === `job:${stationJob.id}`,
    );
    const newerTalkIndex = snapshot.journalEntries.findIndex(
      (entry) => entry.id === `talk:${HAYDEN_ID}@wolf_winter_and_gallowmere_closed`,
    );
    const olderTalkIndex = snapshot.journalEntries.findIndex(
      (entry) => entry.id === `talk:${HAYDEN_ID}@wolf_winter_closed`,
    );
    expect(newerTalkIndex).toBeLessThan(jobIndex);
    expect(olderTalkIndex).toBeGreaterThan(jobIndex);
    expect(OverworldSession.restore(syntheticWorld, snapshot).snapshot()).toEqual(snapshot);
  });

  it("folds an already-completed Gallowmere goal honestly and advances to the next live lead", () => {
    const session = new OverworldSession(world);
    session.scoutPoi("albany_city__civic_core__poi");
    session.talkToCharacter("albany_city__civic_core__contact");
    session.chooseJourneyStory("albany:ledger_advocate");
    session.chooseJourneyStory("albany:oath_limited_aid_only");
    session.chooseJourneyStory("albany:source_rowan_civic_docket");
    moveToArea(session, world.opening_preparation!.area);
    expect(session.view().departureInteractions[0]?.kind).toBe("preparation");
    session.chooseJourneyStory("albany:prep_works_fortification");
    expect(session.view().departureInteractions[0]?.kind).toBe("relief_allocation");
    session.chooseJourneyStory("albany:relief_resident_shelter");
    session.travel(ALBANY_TO_SARATOGA);
    if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
    session.travel(SARATOGA_TO_QUEENSBURY);
    if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
    session.exploreArea("queensbury_town__civic_core");
    session.moveArea(QUEENSBURY_MARKET_ROUTE);
    session.startQuest("gallowmere");
    session.completeQuest("gallowmere", {
      endingId: "ending_victory",
      endingTitle: "The Gallowmere Broken",
      death: false,
    });

    session.travel(SARATOGA_TO_QUEENSBURY);
    if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
    session.travel(ALBANY_TO_SARATOGA);
    if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
    completeWolfAtDecision22(session);
    session.chooseJourney("continue");
    session.chooseJourneyStory("send_wagon_to_cade");

    expect(session.journey()).toMatchObject({
      acceptedDecisions: 23,
      goal: {
        version: 2,
        id: "carry_hedricks_packet_north",
        status: "completed",
        completedAtDecision: 23,
      },
      pendingChoice: {
        reasons: ["goal_completed"],
        goalVersion: 2,
        goalId: "carry_hedricks_packet_north",
      },
    });

    session.chooseJourney("continue");
    expect(session.journey().goal).toMatchObject({
      version: 3,
      id: "oneonta_tanners_fever",
      status: "active",
    });
  });
});
