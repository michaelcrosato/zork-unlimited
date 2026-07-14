import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import {
  openingLeadSourceJournalId,
  openingLeadSourceLegacyJournalEntry,
} from "../../src/world/opening_lead_source_journal.js";
import { planOverworldRoute } from "../../src/world/overworld.js";
import { OverworldSession } from "../../src/world/session.js";
import type {
  OverworldJournalEntry,
  OverworldSessionSnapshot,
} from "../../src/world/session_snapshot.js";
import {
  OVERWORLD_CAMPAIGN_IMPORTS_WORLD_HASH,
  OVERWORLD_OPENING_LEAD_SOURCE_MIGRATION_TARGET_WORLD_HASH,
  OVERWORLD_OPENING_REGISTRATION_WORLD_HASH,
} from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const WORLD = loadOverworldManifest(process.cwd());
const SCENE = WORLD.opening_lead_source;
if (!SCENE) throw new Error("expected the Albany opening lead-source scene");

const LEDGER_PROFILE = "albany:ledger_advocate";
const COURIER_PROFILE = "albany:unaffiliated_courier";
const ROWAN_SOURCE = "albany:source_rowan_civic_docket";
const JAMIE_SOURCE = "albany:source_jamie_market_testimony";
const HAYDEN_SOURCE = "albany:source_hayden_frost_report";
const TARGET_QUEST = SCENE.target_quest;

function timeLabel(minutes: number): string {
  const day = Math.floor(minutes / 1440) + 1;
  const minuteOfDay = minutes % 1440;
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return `Day ${String(day)}, ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function register(profileId = LEDGER_PROFILE): OverworldSession {
  const session = new OverworldSession(WORLD);
  const opening = session.view();
  const poi = opening.pois[0];
  const contact = opening.characters[0];
  if (!poi || !contact) throw new Error("expected Albany's opening registration sources");
  session.scoutPoi(poi.id);
  session.talkToCharacter(contact.id);
  session.chooseJourneyStory(profileId);
  expect(session.journey().storyChoice?.kind).toBe("lead_source");
  return session;
}

function selectSource(profileId = LEDGER_PROFILE, sourceId = JAMIE_SOURCE): OverworldSession {
  const session = register(profileId);
  session.chooseJourneyStory(sourceId);
  expect(session.journey().storyChoice).toBeNull();
  return session;
}

function entry(
  snapshot: OverworldSessionSnapshot,
  kind: OverworldJournalEntry["kind"],
): OverworldJournalEntry {
  const found = snapshot.journalEntries.find((candidate) => candidate.kind === kind);
  if (!found) throw new Error(`expected ${kind} journal evidence`);
  return found;
}

function boundary(entryValue: OverworldJournalEntry) {
  const found = entryValue.storyChoiceBoundary;
  if (!found) throw new Error(`expected story-choice boundary on ${entryValue.id}`);
  return found;
}

function moveToArea(session: OverworldSession, areaId: string): void {
  const route = session.view().areaExits.find((candidate) => candidate.destination.id === areaId);
  if (!route) throw new Error(`expected a visible route to ${areaId}`);
  session.moveArea(route.id);
}

function travelToTown(
  world: typeof WORLD,
  session: OverworldSession,
  destinationTownId: string,
): void {
  const route = planOverworldRoute(world, session.view().current.id, destinationTownId);
  if (!route) throw new Error(`expected a road route to ${destinationTownId}`);
  for (const step of route.steps) {
    session.travel(step.edge.id);
    if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
  }
}

function registrationEraSnapshot(): OverworldSessionSnapshot {
  const snapshot = register().snapshot();
  delete snapshot.openingLeadSourceDecisionTrail;
  snapshot.worldHash = OVERWORLD_OPENING_REGISTRATION_WORLD_HASH;
  snapshot.journalEntries = snapshot.journalEntries.filter(
    (candidate) => !candidate.kind.startsWith("lead_source"),
  );
  snapshot.discoveredQuestIds.push(TARGET_QUEST);
  return snapshot;
}

describe("opening lead-source snapshot integrity", () => {
  it("round-trips a Rowan-first source lead before the Station Quarter is mapped", () => {
    const session = new OverworldSession(WORLD);
    const rowan = session.view().characters[0];
    if (!rowan) throw new Error("expected Rowan in Albany's opening area");

    session.talkToCharacter(rowan.id);
    session.chooseJourneyStory(LEDGER_PROFILE);
    session.chooseJourneyStory(ROWAN_SOURCE);
    const snapshot = session.snapshot();
    const questArea = WORLD.quests.find((quest) => quest.id === TARGET_QUEST)?.area;
    if (!questArea) throw new Error("expected the source-bound quest area");
    expect(snapshot.discoveredQuestIds).toContain(TARGET_QUEST);
    expect(snapshot.discoveredAreaIds).not.toContain(questArea);

    const restored = OverworldSession.restore(WORLD, snapshot);
    expect(restored.snapshot()).toEqual(snapshot);
    expect(restored.view().quests.map((quest) => quest.id)).toContain(TARGET_QUEST);
  });

  it("round-trips a pending offer and a sponsored selection without losing terms or effects", () => {
    expect(hashState(WORLD)).toBe(OVERWORLD_OPENING_LEAD_SOURCE_MIGRATION_TARGET_WORLD_HASH);

    const pending = register();
    const pendingSnapshot = pending.snapshot();
    expect(entry(pendingSnapshot, "lead_source_offer").storyChoiceBoundary).toBeDefined();
    expect(pendingSnapshot.discoveredQuestIds).not.toContain(TARGET_QUEST);

    const restoredPending = OverworldSession.restore(WORLD, pendingSnapshot);
    expect(restoredPending.snapshot()).toEqual(pendingSnapshot);
    expect(restoredPending.snapshotHash()).toBe(pending.snapshotHash());
    expect(restoredPending.journey().storyChoice?.kind).toBe("lead_source");

    const beforeMinutes = restoredPending.snapshot().minutes;
    const beforeMoney = restoredPending.campaignCharacterState().money;
    restoredPending.chooseJourneyStory(JAMIE_SOURCE);
    const selectedSnapshot = restoredPending.snapshot();
    expect(selectedSnapshot.minutes - beforeMinutes).toBe(15);
    expect(selectedSnapshot.character.money).toBe(beforeMoney);
    expect(selectedSnapshot.character.knowledge).toContain(
      "albany:knowledge_wolf_market_testimony",
    );
    expect(
      selectedSnapshot.character.relationships
        .find((relationship) => relationship.npcId === "albany:jamie_tanner")
        ?.memories.includes("albany:memory_jamie_market_testimony_certified"),
    ).toBe(true);
    expect(selectedSnapshot.discoveredQuestIds).toContain(TARGET_QUEST);
    expect(entry(selectedSnapshot, "lead_source").text).toMatch(
      /Actual cost: 15 minutes and \$0.*sponsorship pre-clears/i,
    );

    const restoredSelected = OverworldSession.restore(WORLD, selectedSnapshot);
    expect(restoredSelected.snapshot()).toEqual(selectedSnapshot);
    expect(restoredSelected.snapshotHash()).toBe(restoredPending.snapshotHash());
    expect(restoredSelected.journey().storyChoice).toBeNull();
  });

  it("rejects duplicate offer and selection evidence", () => {
    const selected = selectSource().snapshot();

    const duplicateOffer = structuredClone(selected);
    const secondOffer = structuredClone(entry(duplicateOffer, "lead_source_offer"));
    const offerIndex = duplicateOffer.journalEntries.findIndex(
      (candidate) => candidate.kind === "lead_source_offer",
    );
    duplicateOffer.journalEntries.splice(offerIndex + 1, 0, secondOffer);
    expect(() => OverworldSession.restore(WORLD, duplicateOffer)).toThrow(
      /duplicate journal entry|at most one opening lead-source offer/i,
    );

    const duplicateSelection = structuredClone(selected);
    const secondSelection = structuredClone(entry(duplicateSelection, "lead_source"));
    const selectionIndex = duplicateSelection.journalEntries.findIndex(
      (candidate) => candidate.kind === "lead_source",
    );
    duplicateSelection.journalEntries.splice(selectionIndex + 1, 0, secondSelection);
    expect(() => OverworldSession.restore(WORLD, duplicateSelection)).toThrow(
      /duplicate journal entry|at most one opening lead source/i,
    );
  });

  it("binds both authored copies and the selected source, town, and journal order", () => {
    const selected = selectSource().snapshot();

    const forgedOfferCopy = structuredClone(selected);
    entry(forgedOfferCopy, "lead_source_offer").text += " Forged offer.";
    expect(() => OverworldSession.restore(WORLD, forgedOfferCopy)).toThrow(/offer.*authored copy/i);

    const forgedSelectionCopy = structuredClone(selected);
    entry(forgedSelectionCopy, "lead_source").title = "Certified source: forged";
    expect(() => OverworldSession.restore(WORLD, forgedSelectionCopy)).toThrow(
      /authored terms and copy/i,
    );

    const forgedSource = structuredClone(selected);
    entry(forgedSource, "lead_source").id = openingLeadSourceJournalId(SCENE.id, HAYDEN_SOURCE);
    expect(() => OverworldSession.restore(WORLD, forgedSource)).toThrow(/authored terms and copy/i);

    const forgedTown = structuredClone(selected);
    entry(forgedTown, "lead_source").town = "Queensbury town";
    expect(() => OverworldSession.restore(WORLD, forgedTown)).toThrow(/bound to town/i);

    const forgedOrder = structuredClone(selected);
    const selectionIndex = forgedOrder.journalEntries.findIndex(
      (candidate) => candidate.kind === "lead_source",
    );
    const offerIndex = forgedOrder.journalEntries.findIndex(
      (candidate) => candidate.kind === "lead_source_offer",
    );
    const selection = forgedOrder.journalEntries[selectionIndex]!;
    forgedOrder.journalEntries[selectionIndex] = forgedOrder.journalEntries[offerIndex]!;
    forgedOrder.journalEntries[offerIndex] = selection;
    expect(() => OverworldSession.restore(WORLD, forgedOrder)).toThrow(
      /chronolog|immediately follow|journal/i,
    );
  });

  it("binds offer and selection boundaries, proof hashes, and sponsored elapsed cost", () => {
    const selected = selectSource().snapshot();

    const forgedOfferBoundary = structuredClone(selected);
    boundary(entry(forgedOfferBoundary, "lead_source_offer")).acceptedDecisions += 1;
    expect(() => OverworldSession.restore(WORLD, forgedOfferBoundary)).toThrow(
      /same world and journey boundary/i,
    );

    const forgedSelectionBoundary = structuredClone(selected);
    boundary(entry(forgedSelectionBoundary, "lead_source")).areaId = "albany_city__market";
    expect(() => OverworldSession.restore(WORLD, forgedSelectionBoundary)).toThrow(
      /journey decision, location, or paid-time boundary/i,
    );

    const forgedHash = structuredClone(selected);
    boundary(entry(forgedHash, "lead_source")).decisionProofHash = "0".repeat(64);
    expect(() => OverworldSession.restore(WORLD, forgedHash)).toThrow(
      /journey decision, location, or paid-time boundary/i,
    );

    const forgedElapsedCost = structuredClone(selected);
    const forgedSelection = entry(forgedElapsedCost, "lead_source");
    const forgedBoundary = boundary(forgedSelection);
    forgedBoundary.minutes += 1;
    forgedElapsedCost.minutes += 1;
    forgedSelection.recordedAt = timeLabel(forgedBoundary.minutes);
    expect(() => OverworldSession.restore(WORLD, forgedElapsedCost)).toThrow(/paid-time boundary/i);
  });

  it("rejects a later save whose selected source was swapped out of its journey ancestry", () => {
    const hayden = selectSource(LEDGER_PROFILE, HAYDEN_SOURCE);
    moveToArea(hayden, "albany_city__market");

    const jamie = selectSource(LEDGER_PROFILE, JAMIE_SOURCE);
    moveToArea(jamie, "albany_city__market");

    const haydenSnapshot = hayden.snapshot();
    const hybrid = jamie.snapshot();
    expect(hybrid.journey.decisionProof.last).toEqual(haydenSnapshot.journey.decisionProof.last);
    expect(hybrid.journey.decisionProof.hash).not.toBe(haydenSnapshot.journey.decisionProof.hash);
    hybrid.journey = structuredClone(haydenSnapshot.journey);

    expect(() => OverworldSession.restore(WORLD, hybrid)).toThrow(
      /lead-source decision trail.*current journey proof/i,
    );
  });

  it("replays sponsor terms from the selected registration instead of trusting saved copy", () => {
    const sponsored = selectSource(LEDGER_PROFILE, JAMIE_SOURCE).snapshot();
    const unsponsored = selectSource(COURIER_PROFILE, JAMIE_SOURCE).snapshot();
    const sponsoredText = entry(sponsored, "lead_source").text;
    const unsponsoredText = entry(unsponsored, "lead_source").text;
    expect(sponsoredText).toMatch(/15 minutes and \$0.*sponsorship/i);
    expect(unsponsoredText).toMatch(/35 minutes and \$6/i);

    const forgedSponsorReplay = structuredClone(sponsored);
    entry(forgedSponsorReplay, "lead_source").text = unsponsoredText;
    expect(() => OverworldSession.restore(WORLD, forgedSponsorReplay)).toThrow(
      /authored terms and copy/i,
    );
  });

  it("rejects deletion of selection proof and selections without registration or offer", () => {
    const selected = selectSource().snapshot();

    const deletedSelection = structuredClone(selected);
    deletedSelection.journalEntries = deletedSelection.journalEntries.filter(
      (candidate) => candidate.kind !== "lead_source",
    );
    expect(deletedSelection.character.knowledge).toContain(
      "albany:knowledge_wolf_market_testimony",
    );
    expect(deletedSelection.discoveredQuestIds).toContain(TARGET_QUEST);
    expect(() => OverworldSession.restore(WORLD, deletedSelection)).toThrow(
      /pending lead source|certified lead source|campaign character/i,
    );

    const withoutOffer = structuredClone(selected);
    withoutOffer.journalEntries = withoutOffer.journalEntries.filter(
      (candidate) => candidate.kind !== "lead_source_offer",
    );
    expect(() => OverworldSession.restore(WORLD, withoutOffer)).toThrow(/no replayable offer/i);

    const withoutRegistration = structuredClone(selected);
    withoutRegistration.journalEntries = withoutRegistration.journalEntries.filter(
      (candidate) => candidate.kind !== "registration" && candidate.kind !== "registration_offer",
    );
    expect(() => OverworldSession.restore(WORLD, withoutRegistration)).toThrow(
      /no selected character registration/i,
    );
  });

  it("rejects a pending offer combined with play that occurred after source selection", () => {
    const session = selectSource(LEDGER_PROFILE, ROWAN_SOURCE);
    moveToArea(session, "albany_city__market");
    const forgedPending = session.snapshot();
    forgedPending.journalEntries = forgedPending.journalEntries.filter(
      (candidate) => candidate.kind !== "lead_source",
    );
    forgedPending.discoveredQuestIds = forgedPending.discoveredQuestIds.filter(
      (questId) => questId !== TARGET_QUEST,
    );

    expect(() => OverworldSession.restore(WORLD, forgedPending)).toThrow(
      /pending lead-source offer must remain the latest journal boundary|pending lead source no longer matches/i,
    );
  });

  it("rejects every legacy source marker because mutable saves cannot prove its ancestry", () => {
    const session = selectSource(LEDGER_PROFILE, ROWAN_SOURCE);
    moveToArea(session, "albany_city__market");
    moveToArea(session, "albany_city__transport_hub");
    session.startQuest(TARGET_QUEST);

    const forged = session.snapshot();
    forged.journalEntries = forged.journalEntries.filter(
      (candidate) => !candidate.kind.startsWith("lead_source"),
    );
    if (forged.currentAreaId === null) throw new Error("expected current area");
    forged.journalEntries.unshift(
      openingLeadSourceLegacyJournalEntry({
        sourceWorldHash: OVERWORLD_OPENING_REGISTRATION_WORLD_HASH,
        town: "Albany city",
        recordedAt: timeLabel(forged.minutes),
        storyChoiceBoundary: {
          acceptedDecisions: forged.journey.acceptedDecisions,
          decisionProofHash: forged.journey.decisionProof.hash,
          townId: forged.currentId,
          areaId: forged.currentAreaId,
          minutes: forged.minutes,
        },
      }),
    );
    const marker = entry(forged, "lead_source_legacy");
    forged.openingLeadSourceDecisionTrail = {
      anchorId: marker.id,
      baseAcceptedDecisions: forged.journey.acceptedDecisions,
      baseDecisionProofHash: forged.journey.decisionProof.hash,
      decisions: [],
    };

    expect(forged.openingLeadSourceDecisionTrail?.decisions).toEqual([]);
    expect(() => OverworldSession.restore(WORLD, forged)).toThrow(
      /legacy lead-source provenance cannot be trusted and is unsupported/i,
    );
  });

  it("migrates the immediate unstarted registration predecessor into the real source choice", () => {
    const predecessor = registrationEraSnapshot();
    expect(predecessor.worldHash).toBe(OVERWORLD_OPENING_REGISTRATION_WORLD_HASH);
    expect(predecessor.journalEntries.some((candidate) => candidate.kind === "lead_source")).toBe(
      false,
    );
    expect(
      predecessor.journalEntries.some((candidate) => candidate.kind === "lead_source_offer"),
    ).toBe(false);

    const migratedSession = OverworldSession.restore(WORLD, predecessor);
    const migrated = migratedSession.snapshot();
    expect(migrated.worldHash).toBe(OVERWORLD_OPENING_LEAD_SOURCE_MIGRATION_TARGET_WORLD_HASH);
    expect(entry(migrated, "lead_source_offer").storyChoiceBoundary).toMatchObject({
      acceptedDecisions: predecessor.journey.acceptedDecisions,
      decisionProofHash: predecessor.journey.decisionProof.hash,
      townId: predecessor.currentId,
      areaId: predecessor.currentAreaId,
      minutes: predecessor.minutes,
    });
    expect(migrated.discoveredQuestIds).not.toContain(TARGET_QUEST);
    expect(migratedSession.journey().storyChoice?.kind).toBe("lead_source");
    expect(migratedSession.view().quests.map((quest) => quest.id)).not.toContain(TARGET_QUEST);

    const restoredAgain = OverworldSession.restore(WORLD, migrated);
    expect(restoredAgain.snapshot()).toEqual(migrated);
    expect(restoredAgain.snapshotHash()).toBe(migratedSession.snapshotHash());
    restoredAgain.chooseJourneyStory(ROWAN_SOURCE);
    expect(restoredAgain.view().quests.map((quest) => quest.id)).toContain(TARGET_QUEST);
  });

  it("rejects a truncated Rowan selection even when its remaining move replays", () => {
    const played = selectSource(LEDGER_PROFILE, ROWAN_SOURCE);
    moveToArea(played, "albany_city__market");
    const predecessor = played.snapshot();
    const registrationBoundary = entry(predecessor, "registration").registrationBoundary;
    const savedMove = predecessor.journey.decisionProof.last;
    if (!registrationBoundary || !savedMove) {
      throw new Error("expected registration and movement decision boundaries");
    }
    const renumberedMove = {
      ...savedMove,
      number: registrationBoundary.acceptedDecisions + 1,
    };
    predecessor.worldHash = OVERWORLD_OPENING_REGISTRATION_WORLD_HASH;
    predecessor.journalEntries = predecessor.journalEntries.filter(
      (candidate) => !candidate.kind.startsWith("lead_source"),
    );
    delete predecessor.openingLeadSourceDecisionTrail;
    predecessor.journey = {
      ...predecessor.journey,
      acceptedDecisions: renumberedMove.number,
      decisionProof: {
        hash: hashState({
          previous: registrationBoundary.decisionProofHash,
          ...renumberedMove,
        }),
        last: renumberedMove,
      },
    };

    expect(() => OverworldSession.restore(WORLD, predecessor)).toThrow(
      /opaque post-registration decision suffix.*cannot be certified/i,
    );
  });

  it("rejects opaque pre-registration quest progress instead of loading a source deadlock", () => {
    const predecessorWorld = structuredClone(WORLD);
    delete predecessorWorld.opening_registration;
    delete predecessorWorld.opening_lead_source;
    const predecessorSession = new OverworldSession(predecessorWorld);
    predecessorSession.scoutPoi(predecessorSession.view().pois[0]!.id);
    for (
      let attempt = 0;
      attempt < 8 &&
      !predecessorSession.snapshot().discoveredAreaIds.includes("albany_city__transport_hub");
      attempt += 1
    ) {
      predecessorSession.exploreArea(SCENE.area);
    }
    moveToArea(predecessorSession, "albany_city__market");
    moveToArea(predecessorSession, "albany_city__transport_hub");
    expect(predecessorSession.snapshot().discoveredQuestIds).toContain(TARGET_QUEST);

    travelToTown(predecessorWorld, predecessorSession, "queensbury_town");
    predecessorSession.exploreArea("queensbury_town__civic_core");
    moveToArea(predecessorSession, "queensbury_town__market");
    predecessorSession.startQuest("gallowmere");

    const predecessor = predecessorSession.snapshot();
    predecessor.worldHash = OVERWORLD_CAMPAIGN_IMPORTS_WORLD_HASH;
    expect(predecessor.startedQuestIds).toContain("gallowmere");
    expect(predecessor.startedQuestIds).not.toContain(TARGET_QUEST);

    expect(() => OverworldSession.restore(WORLD, predecessor)).toThrow(
      /opaque pre-registration quest progress without a replayable registration and lead-source path/i,
    );
  });

  it("rejects a hash-valid but semantically opaque one-decision predecessor suffix", () => {
    const forged = selectSource(LEDGER_PROFILE, ROWAN_SOURCE).snapshot();
    const registrationBoundary = entry(forged, "registration").registrationBoundary;
    if (!registrationBoundary) throw new Error("expected registration selection boundary");
    const forgedDecision = {
      number: registrationBoundary.acceptedDecisions + 1,
      surface: "quest" as const,
      actionId: "forged_opaque_decision",
      reason: "situation_changed" as const,
    };
    forged.worldHash = OVERWORLD_OPENING_REGISTRATION_WORLD_HASH;
    forged.journalEntries = forged.journalEntries.filter(
      (candidate) => !candidate.kind.startsWith("lead_source"),
    );
    delete forged.openingLeadSourceDecisionTrail;
    forged.journey = {
      ...forged.journey,
      acceptedDecisions: forgedDecision.number,
      decisionProof: {
        hash: hashState({
          previous: registrationBoundary.decisionProofHash,
          ...forgedDecision,
        }),
        last: forgedDecision,
      },
    };

    expect(() => OverworldSession.restore(WORLD, forged)).toThrow(
      /opaque post-registration decision suffix.*cannot be certified/i,
    );
  });

  it("hides a decision-40 source offer while awaiting, after ending, and across restore", () => {
    const session = new OverworldSession(WORLD);
    const opening = session.view();
    session.scoutPoi(opening.pois[0]!.id);
    session.investigateEvent(opening.events[0]!.id);

    while (session.journey().acceptedDecisions < 38) {
      const destination =
        session.view().currentArea?.id === SCENE.area ? "albany_city__market" : SCENE.area;
      moveToArea(session, destination);
    }
    expect(session.view().currentArea?.id).toBe(SCENE.area);
    expect(session.journey().acceptedDecisions).toBe(38);

    session.talkToCharacter(session.view().characters[0]!.id);
    expect(session.journey()).toMatchObject({
      status: "active",
      acceptedDecisions: 39,
      storyChoice: { kind: "registration" },
    });
    session.chooseJourneyStory(LEDGER_PROFILE);
    expect(session.journey()).toMatchObject({
      status: "awaiting_choice",
      acceptedDecisions: 40,
      storyChoice: null,
    });

    const awaiting = session.snapshot();
    expect(entry(awaiting, "lead_source_offer")).toBeDefined();
    const restoredAwaiting = OverworldSession.restore(WORLD, awaiting);
    expect(restoredAwaiting.snapshot()).toEqual(awaiting);
    expect(restoredAwaiting.journey().storyChoice).toBeNull();

    restoredAwaiting.chooseJourney("end");
    expect(restoredAwaiting.journey()).toMatchObject({ status: "ended", storyChoice: null });
    const ended = restoredAwaiting.snapshot();
    const restoredEnded = OverworldSession.restore(WORLD, ended);
    expect(restoredEnded.snapshot()).toEqual(ended);
    expect(restoredEnded.journey()).toMatchObject({ status: "ended", storyChoice: null });
    expect(() => restoredEnded.chooseJourneyStory(ROWAN_SOURCE)).toThrow(/journey has ended/i);
  });

  it("rejects opaque target-started predecessor progress instead of certifying hidden ancestry", () => {
    const progressed = selectSource(LEDGER_PROFILE, ROWAN_SOURCE);
    moveToArea(progressed, "albany_city__market");
    moveToArea(progressed, "albany_city__transport_hub");
    progressed.startQuest(TARGET_QUEST);
    const predecessor = progressed.snapshot();
    delete predecessor.openingLeadSourceDecisionTrail;
    predecessor.worldHash = OVERWORLD_OPENING_REGISTRATION_WORLD_HASH;
    predecessor.journalEntries = predecessor.journalEntries.filter(
      (candidate) => !candidate.kind.startsWith("lead_source"),
    );

    expect(() => OverworldSession.restore(WORLD, predecessor)).toThrow(
      /opaque post-registration decision suffix.*cannot be certified/i,
    );
  });

  it("strips stale discovery from unresolved predecessor gates and round-trips them", () => {
    const preRegistration = new OverworldSession(WORLD).snapshot();
    preRegistration.worldHash = OVERWORLD_CAMPAIGN_IMPORTS_WORLD_HASH;
    preRegistration.discoveredQuestIds.push(TARGET_QUEST);
    const migratedPreRegistration = OverworldSession.restore(WORLD, preRegistration);
    expect(migratedPreRegistration.snapshot().discoveredQuestIds).not.toContain(TARGET_QUEST);
    expect(OverworldSession.restore(WORLD, migratedPreRegistration.snapshot()).snapshot()).toEqual(
      migratedPreRegistration.snapshot(),
    );

    const pendingRegistrationSession = new OverworldSession(WORLD);
    const rowan = pendingRegistrationSession.view().characters[0];
    if (!rowan) throw new Error("expected Rowan in Albany's opening area");
    pendingRegistrationSession.talkToCharacter(rowan.id);
    const pendingRegistration = pendingRegistrationSession.snapshot();
    expect(pendingRegistrationSession.journey().storyChoice?.kind).toBe("registration");
    pendingRegistration.worldHash = OVERWORLD_OPENING_REGISTRATION_WORLD_HASH;
    pendingRegistration.discoveredQuestIds.push(TARGET_QUEST);
    const migratedPendingRegistration = OverworldSession.restore(WORLD, pendingRegistration);
    expect(migratedPendingRegistration.snapshot().discoveredQuestIds).not.toContain(TARGET_QUEST);
    expect(migratedPendingRegistration.journey().storyChoice?.kind).toBe("registration");
    expect(
      OverworldSession.restore(WORLD, migratedPendingRegistration.snapshot()).snapshot(),
    ).toEqual(migratedPendingRegistration.snapshot());
  });

  it("rejects proofless progressed saves and later source evidence relabeled as predecessor data", () => {
    const progressed = selectSource(LEDGER_PROFILE, ROWAN_SOURCE);
    moveToArea(progressed, "albany_city__market");
    moveToArea(progressed, "albany_city__transport_hub");
    progressed.startQuest(TARGET_QUEST);

    const prooflessProgressed = progressed.snapshot();
    prooflessProgressed.worldHash = OVERWORLD_OPENING_REGISTRATION_WORLD_HASH;
    prooflessProgressed.journalEntries = prooflessProgressed.journalEntries.filter(
      (candidate) =>
        !candidate.kind.startsWith("lead_source") &&
        candidate.kind !== "registration" &&
        candidate.kind !== "registration_offer",
    );
    expect(() => OverworldSession.restore(WORLD, prooflessProgressed)).toThrow(
      /quest progress without selected opening registration or trusted legacy provenance/i,
    );

    const relabeledLaterEvidence = selectSource().snapshot();
    relabeledLaterEvidence.worldHash = OVERWORLD_OPENING_REGISTRATION_WORLD_HASH;
    expect(() => OverworldSession.restore(WORLD, relabeledLaterEvidence)).toThrow(
      /opening lead-source evidence from a later manifest/i,
    );

    const hiddenInJourneyProof = selectSource(LEDGER_PROFILE, ROWAN_SOURCE).snapshot();
    hiddenInJourneyProof.worldHash = OVERWORLD_OPENING_REGISTRATION_WORLD_HASH;
    hiddenInJourneyProof.journalEntries = hiddenInJourneyProof.journalEntries.filter(
      (candidate) => !candidate.kind.startsWith("lead_source"),
    );
    expect(() => OverworldSession.restore(WORLD, hiddenInJourneyProof)).toThrow(
      /opening lead-source evidence from a later manifest/i,
    );
  });
});
