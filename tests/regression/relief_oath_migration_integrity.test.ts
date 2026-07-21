import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import { serializeCampaignCharacterState } from "../../src/world/campaign_character_state.js";
import {
  openingReliefOathLegacySourceWorldHash,
  openingReliefOathOfferJournalId,
} from "../../src/world/opening_relief_oath_journal.js";
import type { OverworldManifest } from "../../src/world/overworld.js";
import { OverworldSession } from "../../src/world/session.js";
import {
  OVERWORLD_RELIEF_ALLOCATION_PREDECESSOR_WORLD_HASH,
  OVERWORLD_RELIEF_OATH_PREDECESSOR_WORLD_HASH,
  OVERWORLD_RELIEF_OATH_WORLD_HASH,
} from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { exactF06World, exactF12World } from "./fixtures/historical_overworlds.js";

const WORLD = loadOverworldManifest(process.cwd());
const QUEST_ID = "wolf_winter";
const RIDGE_APPROACH_ID = "albany:wolf_approach_exposed_ridge";
const RELIEF_OATH_SERVICE_IDS: ReadonlySet<string> = new Set([
  "albany:full_oath_authority_return_resupply",
  "albany:limited_oath_living_pack_return_rest",
  "albany:unaffiliated_bond_returned_rig_resupply",
]);

function moveToArea(session: OverworldSession, areaId: string): void {
  const route = session.view().areaExits.find((candidate) => candidate.destination.id === areaId);
  if (!route) throw new Error(`expected a visible route to ${areaId}`);
  session.moveArea(route.id);
}

function moveToOpeningPreparation(session: OverworldSession, world: OverworldManifest): void {
  const preparationArea = world.opening_preparation?.area;
  if (preparationArea && session.view().currentArea?.id !== preparationArea) {
    moveToArea(session, preparationArea);
  }
}

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

function sessionAtPendingLead(
  world: OverworldManifest,
  registrationId = "albany:ledger_advocate",
): OverworldSession {
  const session = new OverworldSession(world);
  session.scoutPoi("albany_city__civic_core__poi");
  session.talkToCharacter("albany_city__civic_core__contact");
  session.chooseJourneyStory(registrationId);
  expect(session.journey().storyChoice?.kind).toBe("lead_source");
  return session;
}

function sessionAtPendingPreparation(world: OverworldManifest): OverworldSession {
  const session = sessionAtPendingLead(world);
  session.chooseJourneyStory("albany:source_rowan_civic_docket");
  moveToOpeningPreparation(session, world);
  expectDepartureInteraction(session, world.opening_preparation!, "preparation");
  return session;
}

function completedWolfSession(world: OverworldManifest): OverworldSession {
  const session = sessionAtPendingPreparation(world);
  session.chooseJourneyStory("albany:prep_works_fortification");
  moveToArea(session, "albany_city__transport_hub");
  expectDepartureInteraction(session, world.opening_relief_allocation!, "relief_allocation");
  session.chooseJourneyStory("albany:relief_cade_fodder");
  session.startQuest(QUEST_ID, RIDGE_APPROACH_ID);
  session.completeQuest(QUEST_ID, {
    endingId: "ending_held",
    endingTitle: "The Byre Held",
    death: false,
  });
  return session;
}

function serviceOfferIds(session: OverworldSession): string[] {
  return session.view().serviceOffers.map((offer) => offer.id);
}

describe("F06 to F02 relief-oath migration integrity", () => {
  it("reconstructs the exact F06 predecessor while preserving older helper composition", () => {
    expect(hashState(exactF06World(WORLD))).toBe(OVERWORLD_RELIEF_OATH_PREDECESSOR_WORLD_HASH);
    expect(OVERWORLD_RELIEF_OATH_PREDECESSOR_WORLD_HASH).toBe(
      "50350884ebb7d118849fca040256a19c0c63ed4bfe3353d4cd202ee7a6ba8e7f",
    );
    expect(hashState(WORLD)).toBe(OVERWORLD_RELIEF_OATH_WORLD_HASH);
    expect(hashState(exactF12World(WORLD))).toBe(
      OVERWORLD_RELIEF_ALLOCATION_PREDECESSOR_WORLD_HASH,
    );
  });

  it("replaces an untouched pending lead offer with the real oath at the same boundary", () => {
    const predecessorSession = sessionAtPendingLead(exactF06World(WORLD));
    const predecessorServiceOffers = predecessorSession.view().serviceOffers;
    const predecessorServices = serviceOfferIds(predecessorSession);
    const predecessor = predecessorSession.snapshot();
    const leadOffer = predecessor.journalEntries.find(
      (entry) => entry.kind === "lead_source_offer",
    );
    if (!leadOffer?.storyChoiceBoundary) throw new Error("expected pending lead-source boundary");

    const restoredSession = OverworldSession.restore(WORLD, predecessor);
    const restored = restoredSession.snapshot();
    const oathOffer = restored.journalEntries.find((entry) => entry.kind === "relief_oath_offer");

    expect(restoredSession.journey().storyChoice?.kind).toBe("relief_oath");
    expect(oathOffer).toMatchObject({
      id: openingReliefOathOfferJournalId("albany:wolf_relief_oath"),
      kind: "relief_oath_offer",
      storyChoiceBoundary: leadOffer.storyChoiceBoundary,
    });
    expect(restored.journalEntries[0]).toEqual(oathOffer);
    expect(restored.journalEntries.some((entry) => entry.kind === "lead_source_offer")).toBe(false);
    expect(restored.journalEntries.some((entry) => entry.kind === "relief_oath_legacy")).toBe(
      false,
    );
    expect(restored.openingLeadSourceDecisionTrail).toBeUndefined();
    expect(serializeCampaignCharacterState(restored.character)).toBe(
      serializeCampaignCharacterState(predecessor.character),
    );
    expect(restored.minutes).toBe(predecessor.minutes);
    expect(restored.supplies).toBe(predecessor.supplies);
    expect(restored.fatigue).toBe(predecessor.fatigue);
    expect(restoredSession.view().serviceOffers).toEqual(predecessorServiceOffers);
    expect(serviceOfferIds(restoredSession)).toEqual(predecessorServices);

    const restoredTwice = OverworldSession.restore(WORLD, restored);
    expect(restoredTwice.snapshot()).toEqual(restored);
    expect(restoredTwice.journey().storyChoice?.kind).toBe("relief_oath");
  });

  it("preserves the unaffiliated courier's pre-existing carrier standing", () => {
    const predecessor = sessionAtPendingLead(
      exactF06World(WORLD),
      "albany:unaffiliated_courier",
    ).snapshot();
    const restored = OverworldSession.restore(WORLD, predecessor);

    expect(restored.journey().storyChoice?.kind).toBe("relief_oath");
    expect(restored.snapshot().character.factionStanding).toContainEqual({
      factionId: "faction:independent_carriers",
      standing: 2,
    });
  });

  it("grandfathers progressed lead-source history with one neutral marker", () => {
    const predecessorSession = sessionAtPendingPreparation(exactF06World(WORLD));
    const predecessorServiceOffers = predecessorSession.view().serviceOffers;
    const predecessor = predecessorSession.snapshot();
    const leadOfferIndex = predecessor.journalEntries.findIndex(
      (entry) => entry.kind === "lead_source_offer",
    );
    const leadOffer = predecessor.journalEntries[leadOfferIndex];
    if (!leadOffer?.storyChoiceBoundary) throw new Error("expected selected lead-source offer");

    const restoredSession = OverworldSession.restore(WORLD, predecessor);
    const restored = restoredSession.snapshot();
    const markerIndex = restored.journalEntries.findIndex(
      (entry) => entry.kind === "relief_oath_legacy",
    );
    const marker = restored.journalEntries[markerIndex];
    const restoredLeadOfferIndex = restored.journalEntries.findIndex(
      (entry) => entry.kind === "lead_source_offer",
    );
    const registrationIndex = restored.journalEntries.findIndex(
      (entry) => entry.kind === "registration",
    );

    expect(restoredSession.journey().storyChoice).toBeNull();
    moveToOpeningPreparation(restoredSession, WORLD);
    expectDepartureInteraction(restoredSession, WORLD.opening_preparation!, "preparation");
    expect(openingReliefOathLegacySourceWorldHash(marker!.id)).toBe(
      OVERWORLD_RELIEF_OATH_PREDECESSOR_WORLD_HASH,
    );
    expect(marker).toMatchObject({
      kind: "relief_oath_legacy",
      storyChoiceBoundary: leadOffer.storyChoiceBoundary,
    });
    expect(restoredLeadOfferIndex + 1).toBe(markerIndex);
    expect(markerIndex + 1).toBe(registrationIndex);
    expect(
      restored.journalEntries.filter((entry) => entry.kind === "relief_oath_legacy"),
    ).toHaveLength(1);
    expect(
      restored.journalEntries.some(
        (entry) => entry.kind === "relief_oath" || entry.kind === "relief_oath_offer",
      ),
    ).toBe(false);
    expect(serializeCampaignCharacterState(restored.character)).toBe(
      serializeCampaignCharacterState(predecessor.character),
    );
    expect(restored.minutes).toBe(predecessor.minutes);
    expect(restored.supplies).toBe(predecessor.supplies);
    expect(restored.fatigue).toBe(predecessor.fatigue);
    expect(restoredSession.view().serviceOffers).toEqual(predecessorServiceOffers);
    expect(serviceOfferIds(restoredSession).some((id) => RELIEF_OATH_SERVICE_IDS.has(id))).toBe(
      false,
    );

    const restoredTwice = OverworldSession.restore(WORLD, restored);
    expect(restoredTwice.snapshot()).toEqual(restored);
    expect(restoredTwice.journey().storyChoice).toBeNull();
    moveToOpeningPreparation(restoredTwice, WORLD);
    expectDepartureInteraction(restoredTwice, WORLD.opening_preparation!, "preparation");
  });

  it("preserves completed progress without inventing character, time, resources, or services", () => {
    const predecessorSession = completedWolfSession(exactF06World(WORLD));
    const predecessorServiceOffers = predecessorSession.view().serviceOffers;
    const predecessorServices = serviceOfferIds(predecessorSession);
    const predecessor = predecessorSession.snapshot();

    const restoredSession = OverworldSession.restore(WORLD, predecessor);
    const restored = restoredSession.snapshot();
    const restoredServices = serviceOfferIds(restoredSession);

    expect(restored.completedQuestIds).toContain(QUEST_ID);
    expect(
      restored.journalEntries.filter((entry) => entry.kind === "relief_oath_legacy"),
    ).toHaveLength(1);
    expect(serializeCampaignCharacterState(restored.character)).toBe(
      serializeCampaignCharacterState(predecessor.character),
    );
    expect(restored.minutes).toBe(predecessor.minutes);
    expect(restored.supplies).toBe(predecessor.supplies);
    expect(restored.fatigue).toBe(predecessor.fatigue);
    expect(restoredSession.view().serviceOffers).toEqual(predecessorServiceOffers);
    expect(restoredServices).toEqual(predecessorServices);
    expect(restoredServices.some((id) => RELIEF_OATH_SERVICE_IDS.has(id))).toBe(false);
    expect(OverworldSession.restore(WORLD, restored).snapshot()).toEqual(restored);
  });

  it("rejects predecessor provenance forged around later relief-oath evidence", () => {
    const current = new OverworldSession(WORLD);
    current.scoutPoi("albany_city__civic_core__poi");
    current.talkToCharacter("albany_city__civic_core__contact");
    current.chooseJourneyStory("albany:ledger_advocate");
    current.chooseJourneyStory("albany:oath_full_compact_duty");
    const forged = {
      ...current.snapshot(),
      worldHash: OVERWORLD_RELIEF_OATH_PREDECESSOR_WORLD_HASH,
    };

    expect(() => OverworldSession.restore(WORLD, forged)).toThrow(
      /relief-oath evidence introduced by the later manifest/i,
    );
  });
});
