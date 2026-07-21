import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import {
  openingPreparationLegacyJournalEntry,
  openingPreparationJournalEntry,
  openingPreparationOfferJournalEntry,
} from "../../src/world/opening_preparation_journal.js";
import { applyOpeningPreparationProfile } from "../../src/world/opening_preparation.js";
import { OverworldSession } from "../../src/world/session.js";
import type {
  OverworldJournalEntry,
  OverworldSessionSnapshot,
} from "../../src/world/session_snapshot.js";
import {
  OVERWORLD_FIELD_TIMED_PREPARATION_PREDECESSOR_WORLD_HASH,
  OVERWORLD_OPENING_PREPARATION_PREDECESSOR_WORLD_HASH,
  OVERWORLD_OPENING_PREPARATION_WORLD_HASH,
} from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import {
  exactCivicPreparationPredecessor,
  exactF06World,
} from "./fixtures/historical_overworlds.js";

const WORLD = loadOverworldManifest(process.cwd());
const PREPARATION = WORLD.opening_preparation;
if (!PREPARATION) throw new Error("expected the Albany opening preparation scene");

const REGISTRATION_PROFILE = "albany:ledger_advocate";
const LEAD_SOURCE = "albany:source_jamie_market_testimony";
const RELIEF_OATH = "albany:oath_limited_aid_only";
const PREPARATION_PROFILE = "albany:prep_relief_protocol";

function expectDepartureInteraction(
  session: OverworldSession,
  scene: { id: string; title: string },
  kind: "preparation" | "relief_allocation",
): void {
  expect(session.journey().storyChoice).toBeNull();
  expect(session.view().departureInteractions).toEqual([
    {
      id: scene.id,
      kind,
      title: scene.title,
      inspect: {
        tool: "inspect_overworld_session_story",
        storyChoiceId: scene.id,
        arguments: { story_choice_id: scene.id },
      },
      choose: {
        tool: "choose_overworld_session_story",
        storyChoiceId: scene.id,
        arguments: { story_choice_id: scene.id },
        argument: "choice",
        valuesFrom: "story.options[*].id",
      },
    },
  ]);
}

function registerAndSelectLeadAtSource(world: typeof WORLD = WORLD): OverworldSession {
  const session = new OverworldSession(world);
  const opening = session.view();
  const poi = opening.pois[0];
  const contact = opening.characters[0];
  if (!poi || !contact) throw new Error("expected Albany opening registration sources");
  session.scoutPoi(poi.id);
  session.talkToCharacter(contact.id);
  session.chooseJourneyStory(REGISTRATION_PROFILE);
  if (session.journey().storyChoice?.kind === "relief_oath") {
    session.chooseJourneyStory(RELIEF_OATH);
  }
  session.chooseJourneyStory(LEAD_SOURCE);
  return session;
}

function registerAndSelectLead(world: typeof WORLD = WORLD): OverworldSession {
  const session = registerAndSelectLeadAtSource(world);
  const preparation = world.opening_preparation;
  if (!preparation) throw new Error("expected Wolf-Winter preparation");
  if (session.view().currentArea?.id !== preparation.area) {
    const route = session
      .view()
      .areaExits.find((candidate) => candidate.destination.id === preparation.area);
    if (!route) throw new Error("expected a route to Wolf-Winter preparation");
    session.moveArea(route.id);
  }
  expectDepartureInteraction(session, preparation, "preparation");
  return session;
}

function selectPreparation(world: typeof WORLD = WORLD): OverworldSession {
  const session = registerAndSelectLead(world);
  session.chooseJourneyStory(PREPARATION_PROFILE);
  if (
    world.opening_relief_allocation &&
    world.opening_relief_allocation.area === world.opening_preparation?.area
  ) {
    expectDepartureInteraction(session, world.opening_relief_allocation, "relief_allocation");
  } else {
    expect(session.view().departureInteractions).toEqual([]);
  }
  return session;
}

function journalEntry(
  snapshot: OverworldSessionSnapshot,
  kind: OverworldJournalEntry["kind"],
): OverworldJournalEntry {
  const entry = snapshot.journalEntries.find((candidate) => candidate.kind === kind);
  if (!entry) throw new Error(`expected ${kind} journal evidence`);
  return entry;
}

function moveToArea(session: OverworldSession, areaId: string): void {
  const route = session.view().areaExits.find((candidate) => candidate.destination.id === areaId);
  if (!route) throw new Error(`expected a route to ${areaId}`);
  session.moveArea(route.id);
}

function timeLabel(minutes: number): string {
  const day = Math.floor(minutes / 1440) + 1;
  const minuteOfDay = minutes % 1440;
  return `Day ${day}, ${String(Math.floor(minuteOfDay / 60)).padStart(2, "0")}:${String(
    minuteOfDay % 60,
  ).padStart(2, "0")}`;
}

describe("opening preparation snapshot integrity", () => {
  it("round-trips derived and selected preparation with replayed character effects", () => {
    expect(hashState(WORLD)).toBe(OVERWORLD_OPENING_PREPARATION_WORLD_HASH);

    const availableSession = registerAndSelectLead();
    const available = availableSession.snapshot();
    expect(available.journalEntries.some((entry) => entry.kind === "preparation_offer")).toBe(
      false,
    );
    expect(available.discoveredQuestIds).toContain(PREPARATION.target_quest);
    const restoredAvailable = OverworldSession.restore(WORLD, available);
    expect(restoredAvailable.snapshot()).toEqual(available);
    expectDepartureInteraction(restoredAvailable, PREPARATION, "preparation");

    const preMissionPreview = structuredClone(available);
    preMissionPreview.discoveredQuestIds = preMissionPreview.discoveredQuestIds.filter(
      (questId) => questId !== PREPARATION.target_quest,
    );
    expect(() => OverworldSession.restore(WORLD, preMissionPreview)).toThrow(
      /selected lead source did not reveal its target quest/i,
    );

    const selected = selectPreparation().snapshot();
    expect(selected.discoveredQuestIds).toContain(PREPARATION.target_quest);
    expect(selected.character.knowledge).toContain("albany:knowledge_wolf_relief_protocol");
    expect(
      selected.character.relationships
        .find((relationship) => relationship.npcId === "albany:jamie_tanner")
        ?.memories.includes("albany:memory_jamie_wolf_relief_protocol_allocated"),
    ).toBe(true);
    expect(OverworldSession.restore(WORLD, selected).snapshot()).toEqual(selected);

    const forgedCharacter = structuredClone(selected);
    forgedCharacter.character.knowledge = forgedCharacter.character.knowledge.filter(
      (knowledgeId) => knowledgeId !== "albany:knowledge_wolf_relief_protocol",
    );
    expect(() => OverworldSession.restore(WORLD, forgedCharacter)).toThrow(
      /campaign character does not match replayed quest consequences/i,
    );
  });

  it("migrates exact Civic pending and selected evidence into the Station-timed flow", () => {
    const predecessorWorld = exactCivicPreparationPredecessor(WORLD);
    expect(hashState(predecessorWorld)).toBe(
      OVERWORLD_FIELD_TIMED_PREPARATION_PREDECESSOR_WORLD_HASH,
    );

    const pendingPredecessor = registerAndSelectLead(predecessorWorld).snapshot();
    expect(
      pendingPredecessor.journalEntries.some((entry) => entry.kind === "preparation_offer"),
    ).toBe(false);
    const pendingSession = OverworldSession.restore(WORLD, pendingPredecessor);
    const pendingMigrated = pendingSession.snapshot();
    expect(pendingMigrated.journalEntries.some((entry) => entry.kind === "preparation_offer")).toBe(
      false,
    );
    expect(pendingSession.journey().storyChoice).toBeNull();
    expect(OverworldSession.restore(WORLD, pendingMigrated).snapshot()).toEqual(pendingMigrated);
    moveToArea(pendingSession, PREPARATION.area);
    expectDepartureInteraction(pendingSession, PREPARATION, "preparation");

    const selectedPredecessor = selectPreparation(predecessorWorld).snapshot();
    const selectedSession = OverworldSession.restore(WORLD, selectedPredecessor);
    const selectedMigrated = selectedSession.snapshot();
    expect(
      selectedMigrated.journalEntries
        .filter((entry) => entry.kind === "preparation" || entry.kind === "preparation_offer")
        .map((entry) => entry.sourceWorldHash),
    ).toEqual([
      OVERWORLD_FIELD_TIMED_PREPARATION_PREDECESSOR_WORLD_HASH,
      OVERWORLD_FIELD_TIMED_PREPARATION_PREDECESSOR_WORLD_HASH,
    ]);
    expect(selectedMigrated.character.knowledge).toContain("albany:knowledge_wolf_relief_protocol");
    expect(OverworldSession.restore(WORLD, selectedMigrated).snapshot()).toEqual(selectedMigrated);
    moveToArea(selectedSession, PREPARATION.area);
    expectDepartureInteraction(
      selectedSession,
      WORLD.opening_relief_allocation!,
      "relief_allocation",
    );
  });

  it("rejects current Station evidence relabeled as trusted Civic provenance", () => {
    const forged = selectPreparation().snapshot();
    for (const entry of forged.journalEntries) {
      if (entry.kind === "preparation" || entry.kind === "preparation_offer") {
        entry.sourceWorldHash = OVERWORLD_FIELD_TIMED_PREPARATION_PREDECESSOR_WORLD_HASH;
      }
    }
    expect(() => OverworldSession.restore(WORLD, forged)).toThrow(
      /preparation offer must follow source certification/i,
    );
  });

  it("rejects a current Civic save that mints a trusted predecessor offer", () => {
    const forged = registerAndSelectLeadAtSource().snapshot();
    const lead = journalEntry(forged, "lead_source");
    if (!lead.storyChoiceBoundary) throw new Error("expected a lead-source boundary");
    forged.journalEntries.unshift({
      ...openingPreparationOfferJournalEntry({
        scene: PREPARATION,
        town: lead.town,
        recordedAt: lead.recordedAt,
        storyChoiceBoundary: lead.storyChoiceBoundary,
      }),
      sourceWorldHash: OVERWORLD_FIELD_TIMED_PREPARATION_PREDECESSOR_WORLD_HASH,
    });

    expect(() => OverworldSession.restore(WORLD, forged)).toThrow(
      /preparation provenance is not trusted/i,
    );
  });

  it("rejects Station-labelled preparation whose campaign replay remains at Civic", () => {
    const session = registerAndSelectLeadAtSource();
    moveToArea(session, "albany_city__market");
    moveToArea(session, "albany_city__civic_core");
    const forged = structuredClone(session.snapshot());
    const lead = journalEntry(forged, "lead_source");
    const offerBoundary = {
      acceptedDecisions: forged.journey.acceptedDecisions,
      decisionProofHash: forged.journey.decisionProof.hash,
      townId: forged.currentId,
      areaId: PREPARATION.area,
      minutes: forged.minutes,
    };
    const forgedDecision = {
      number: offerBoundary.acceptedDecisions + 1,
      surface: "overworld" as const,
      actionId: `campaign_story:${PREPARATION.id}:${PREPARATION_PROFILE}`,
      reason: "situation_changed" as const,
    };
    const selectionProofHash = hashState({
      previous: offerBoundary.decisionProofHash,
      ...forgedDecision,
    });
    const application = applyOpeningPreparationProfile({
      scene: PREPARATION,
      character: forged.character,
      profileId: PREPARATION_PROFILE,
    });
    const selectionBoundary = {
      acceptedDecisions: forgedDecision.number,
      decisionProofHash: selectionProofHash,
      townId: forged.currentId,
      areaId: PREPARATION.area,
      minutes: forged.minutes + application.terms.minutes,
    };
    forged.journalEntries.unshift(
      openingPreparationJournalEntry({
        scene: PREPARATION,
        character: forged.character,
        profileId: PREPARATION_PROFILE,
        town: lead.town,
        recordedAt: timeLabel(selectionBoundary.minutes),
        storyChoiceBoundary: selectionBoundary,
      }),
      openingPreparationOfferJournalEntry({
        scene: PREPARATION,
        town: lead.town,
        recordedAt: timeLabel(forged.minutes),
        storyChoiceBoundary: offerBoundary,
      }),
    );
    if (!forged.openingLeadSourceDecisionTrail) {
      throw new Error("expected the lead-source decision trail");
    }
    forged.openingLeadSourceDecisionTrail = {
      ...forged.openingLeadSourceDecisionTrail,
      decisions: [...forged.openingLeadSourceDecisionTrail.decisions, forgedDecision],
    };
    forged.journey = {
      ...forged.journey,
      acceptedDecisions: forgedDecision.number,
      decisionProof: { hash: selectionProofHash, last: forgedDecision },
    };
    forged.minutes = selectionBoundary.minutes;
    forged.character = structuredClone(application.characterAfter);

    expect(() => OverworldSession.restore(WORLD, forged)).toThrow(
      /preparation offer boundary does not match its replayed campaign decision proof and location/i,
    );
  });

  it("keeps an existing persisted preparation offer blocking and finishable", () => {
    const session = registerAndSelectLead();
    const pending = session.snapshot();
    pending.journalEntries.unshift(
      openingPreparationOfferJournalEntry({
        scene: PREPARATION,
        town: session.view().current.name,
        recordedAt: timeLabel(pending.minutes),
        storyChoiceBoundary: {
          acceptedDecisions: pending.journey.acceptedDecisions,
          decisionProofHash: pending.journey.decisionProof.hash,
          townId: pending.currentId,
          areaId: pending.currentAreaId!,
          minutes: pending.minutes,
        },
      }),
    );

    const restored = OverworldSession.restore(WORLD, pending);
    expect(restored.journey().storyChoice).toMatchObject({
      id: PREPARATION.id,
      kind: "preparation",
    });
    expect(restored.view().departureInteractions).toEqual([]);
    restored.chooseJourneyStory(PREPARATION_PROFILE);
    expect(
      restored
        .snapshot()
        .journalEntries.slice(0, 2)
        .map((entry) => entry.kind),
    ).toEqual(["preparation", "preparation_offer"]);
    const selected = restored.snapshot();
    expect(OverworldSession.restore(WORLD, selected).snapshot()).toEqual(selected);
  });

  it("preserves exact-predecessor quest, return, and bound service evidence", () => {
    const predecessorWorld = exactCivicPreparationPredecessor(WORLD);
    const predecessorSession = selectPreparation(predecessorWorld);
    moveToArea(predecessorSession, PREPARATION.area);
    expectDepartureInteraction(
      predecessorSession,
      WORLD.opening_relief_allocation!,
      "relief_allocation",
    );
    predecessorSession.chooseJourneyStory("albany:relief_cade_fodder");
    predecessorSession.startQuest("wolf_winter", "albany:wolf_approach_sheltered_stockway");
    predecessorSession.completeQuest("wolf_winter", {
      endingId: "ending_held_timber_saved",
      endingTitle: "The Byre Held, Paling Timber Saved",
      death: false,
    });
    predecessorSession.chooseJourney("continue");
    predecessorSession.chooseJourneyStory("send_wardens_north");

    const outbound = predecessorSession
      .view()
      .exits.find((candidate) => candidate.destination.id === "colonie_town");
    if (!outbound) throw new Error("expected the Albany-Colonie road");
    predecessorSession.travel(outbound.id);
    if (predecessorSession.view().pendingRoadEncounter) {
      predecessorSession.resolveRoadEncounter("press_on");
    }
    const inbound = predecessorSession
      .view()
      .exits.find((candidate) => candidate.destination.id === "albany_city");
    if (!inbound) throw new Error("expected the Colonie-Albany road");
    predecessorSession.travel(inbound.id);
    if (predecessorSession.view().pendingRoadEncounter) {
      predecessorSession.resolveRoadEncounter("press_on");
    }
    expect(predecessorSession.view().serviceOffers).toContainEqual(
      expect.objectContaining({
        id: "albany:wolf_saved_timber_quick_resupply",
        action: "resupply",
      }),
    );
    predecessorSession.resupplyAtTown();
    const predecessor = predecessorSession.snapshot();
    expect(
      predecessor.journalEntries.find(
        (entry) => entry.serviceRuleId === "albany:wolf_saved_timber_quick_resupply",
      )?.serviceBoundary,
    ).toBeDefined();

    const migrated = OverworldSession.restore(WORLD, predecessor).snapshot();
    expect(migrated.questOutcomes).toContainEqual(["wolf_winter", "ending_held_timber_saved"]);
    expect(
      migrated.journalEntries.find(
        (entry) => entry.serviceRuleId === "albany:wolf_saved_timber_quick_resupply",
      )?.serviceBoundary,
    ).toBeDefined();
    expect(OverworldSession.restore(WORLD, migrated).snapshot()).toEqual(migrated);
  });

  it("rejects preparation journal or action evidence relabeled as the 742 predecessor", () => {
    const selected = selectPreparation(exactF06World(WORLD)).snapshot();

    const journalRelabel = structuredClone(selected);
    journalRelabel.worldHash = OVERWORLD_OPENING_PREPARATION_PREDECESSOR_WORLD_HASH;
    expect(() => OverworldSession.restore(WORLD, journalRelabel)).toThrow(
      /(?:opening preparation evidence introduced|preparation_offer entry .* does not match)/i,
    );

    const actionRelabel = structuredClone(selected);
    actionRelabel.worldHash = OVERWORLD_OPENING_PREPARATION_PREDECESSOR_WORLD_HASH;
    actionRelabel.journalEntries = actionRelabel.journalEntries.filter(
      (entry) => !entry.kind.startsWith("preparation"),
    );
    expect(() => OverworldSession.restore(WORLD, actionRelabel)).toThrow(
      /opening preparation evidence introduced by a later manifest/i,
    );
  });

  it("migrates a lead-selected no-progress 742 snapshot into the real preparation prompt", () => {
    const predecessor = registerAndSelectLead(exactF06World(WORLD)).snapshot();
    predecessor.worldHash = OVERWORLD_OPENING_PREPARATION_PREDECESSOR_WORLD_HASH;
    predecessor.journalEntries = predecessor.journalEntries.filter(
      (entry) => entry.kind !== "preparation_offer",
    );

    const migratedSession = OverworldSession.restore(WORLD, predecessor);
    const migrated = migratedSession.snapshot();
    expect(migrated.journalEntries[0]?.kind).toBe("lead_source");
    expect(migrated.character).toEqual(predecessor.character);
    expect(migratedSession.journey().storyChoice).toBeNull();
    expect(migratedSession.view().quests.map((quest) => quest.id)).toContain(
      PREPARATION.target_quest,
    );

    const restoredAgain = OverworldSession.restore(WORLD, migrated);
    expect(restoredAgain.snapshot()).toEqual(migrated);
    const stationRoute = restoredAgain
      .view()
      .areaExits.find((candidate) => candidate.destination.id === PREPARATION.area);
    if (!stationRoute) throw new Error("expected a route to the preparation board");
    restoredAgain.moveArea(stationRoute.id);
    expectDepartureInteraction(restoredAgain, PREPARATION, "preparation");
    restoredAgain.chooseJourneyStory(PREPARATION_PROFILE);
    expect(restoredAgain.view().quests.map((quest) => quest.id)).toContain(
      PREPARATION.target_quest,
    );
  });

  it("rejects a current save with a self-minted legacy marker", () => {
    const forged = registerAndSelectLead().snapshot();
    const lead = journalEntry(forged, "lead_source");
    if (!lead.storyChoiceBoundary) {
      throw new Error("expected the lead boundary");
    }
    forged.journalEntries.unshift(
      openingPreparationLegacyJournalEntry({
        sourceWorldHash: OVERWORLD_OPENING_PREPARATION_PREDECESSOR_WORLD_HASH,
        town: lead.town,
        recordedAt: lead.recordedAt,
        storyChoiceBoundary: lead.storyChoiceBoundary,
      }),
    );
    expect(() => OverworldSession.restore(WORLD, forged)).toThrow(
      /no later replayable Wolf-Winter progress to grandfather/i,
    );
  });
});
