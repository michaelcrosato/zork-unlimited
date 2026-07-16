import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import { serializeCampaignCharacterState } from "../../src/world/campaign_character_state.js";
import {
  openingReliefAllocationLegacySourceWorldHash,
  openingReliefAllocationOfferJournalId,
} from "../../src/world/opening_relief_allocation_journal.js";
import type { OverworldManifest } from "../../src/world/overworld.js";
import { OverworldSession } from "../../src/world/session.js";
import {
  OVERWORLD_HILL_APPROACH_WORLD_HASH,
  OVERWORLD_RELIEF_ALLOCATION_PREDECESSOR_WORLD_HASH,
  OVERWORLD_RELIEF_ALLOCATION_WORLD_HASH,
} from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { exactF12World } from "./fixtures/historical_overworlds.js";

const WORLD = loadOverworldManifest(process.cwd());
const QUEST_ID = "wolf_winter";
const RIDGE_APPROACH_ID = "albany:wolf_approach_exposed_ridge";
const RIDGE_KNOWLEDGE_ID = "albany:knowledge_wolf_exposed_ridge";
const RIDGE_MEMORY_ID = "albany:memory_hayden_dispatched_exposed_ridge";
const ALLOCATION_CHARACTER_IDS = new Set([
  "albany:knowledge_relief_cade_fodder",
  "albany:knowledge_relief_resident_shelter",
  "albany:knowledge_relief_mobile_reserve",
  "albany:memory_emery_relief_cade_fodder_allocated",
  "albany:memory_jamie_relief_resident_shelter_allocated",
  "albany:memory_hayden_relief_mobile_reserve_allocated",
]);

function moveToArea(session: OverworldSession, areaId: string): void {
  const route = session.view().areaExits.find((candidate) => candidate.destination.id === areaId);
  if (!route) throw new Error(`expected a visible route to ${areaId}`);
  session.moveArea(route.id);
}

function sessionAtWolf(world: OverworldManifest): OverworldSession {
  const session = new OverworldSession(world);
  session.scoutPoi("albany_city__civic_core__poi");
  session.talkToCharacter("albany_city__civic_core__contact");
  session.chooseJourneyStory("albany:ledger_advocate");
  if (session.journey().storyChoice?.kind === "relief_oath") {
    session.chooseJourneyStory("albany:oath_limited_aid_only");
  }
  session.chooseJourneyStory("albany:source_rowan_civic_docket");
  session.chooseJourneyStory("albany:prep_works_fortification");
  moveToArea(session, "albany_city__transport_hub");
  expect(session.view().quests.map((quest) => quest.id)).toContain(QUEST_ID);
  return session;
}

function questStartEntry(snapshot: ReturnType<OverworldSession["snapshot"]>) {
  const entry = snapshot.journalEntries.find((candidate) => candidate.id === `quest:${QUEST_ID}`);
  if (!entry) throw new Error("expected Wolf-Winter start journal");
  return entry;
}

function allocationCharacterEvidence(snapshot: ReturnType<OverworldSession["snapshot"]>): string[] {
  return [
    ...snapshot.character.knowledge.filter((id) => ALLOCATION_CHARACTER_IDS.has(id)),
    ...snapshot.character.relationships.flatMap((relationship) =>
      relationship.memories.filter((id) => ALLOCATION_CHARACTER_IDS.has(id)),
    ),
  ];
}

function travelAndResolve(session: OverworldSession, roadId: string): void {
  session.travel(roadId);
  if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
}

describe("F12 to F06 relief-allocation migration integrity", () => {
  it("reconstructs the exact F12 predecessor rather than today's F06 manifest", () => {
    const predecessor = exactF12World(WORLD);
    expect(hashState(predecessor)).toBe(OVERWORLD_RELIEF_ALLOCATION_PREDECESSOR_WORLD_HASH);
    expect(OVERWORLD_RELIEF_ALLOCATION_PREDECESSOR_WORLD_HASH).toBe(
      OVERWORLD_HILL_APPROACH_WORLD_HASH,
    );
    expect(OVERWORLD_HILL_APPROACH_WORLD_HASH).toBe(
      "634fd4e93143343fd813edd9c59d3a8c098c0d78b94497cf689988492de154e3",
    );
    expect(hashState(WORLD)).toBe(OVERWORLD_RELIEF_ALLOCATION_WORLD_HASH);
  });

  it("offers the real allocation to an unstarted F12 save without inventing legacy effects", () => {
    const predecessor = sessionAtWolf(exactF12World(WORLD)).snapshot();
    expect(predecessor.worldHash).toBe(OVERWORLD_HILL_APPROACH_WORLD_HASH);
    expect(allocationCharacterEvidence(predecessor)).toEqual([]);

    const restored = OverworldSession.restore(WORLD, predecessor).snapshot();
    const offers = restored.journalEntries.filter(
      (entry) => entry.kind === "relief_allocation_offer",
    );
    expect(restored.worldHash).toBe(OVERWORLD_RELIEF_ALLOCATION_WORLD_HASH);
    expect(offers).toHaveLength(1);
    expect(offers[0]?.id).toBe(
      openingReliefAllocationOfferJournalId("albany:wolf_relief_allocation"),
    );
    expect(restored.journalEntries[0]).toEqual(offers[0]);
    expect(restored.journalEntries.some((entry) => entry.kind === "relief_allocation_legacy")).toBe(
      false,
    );
    expect(serializeCampaignCharacterState(restored.character)).toBe(
      serializeCampaignCharacterState(predecessor.character),
    );
    expect(allocationCharacterEvidence(restored)).toEqual([]);
    expect(restored.minutes).toBe(predecessor.minutes);
    expect(restored.supplies).toBe(predecessor.supplies);
    expect(restored.fatigue).toBe(predecessor.fatigue);
    expect(OverworldSession.restore(WORLD, restored).snapshot()).toEqual(restored);
  });

  it("keeps an F12 ally commitment replayable when the real allocation is selected later", () => {
    const f12 = sessionAtWolf(exactF12World(WORLD));
    f12.talkToCharacter("albany_city__transport_hub__june_pike");
    expect(f12.journey().storyChoice?.kind).toBe("ally");
    f12.chooseJourneyStory("albany:ally_june_cattle_first");
    const predecessor = f12.snapshot();
    expect(predecessor.character.companions).toContain("albany:june_pike");
    expect(predecessor.character.promises).toContainEqual(
      expect.objectContaining({ promiseId: "albany:promise_june_cattle_first" }),
    );

    const migrated = OverworldSession.restore(WORLD, predecessor);
    expect(migrated.journey().storyChoice?.kind).toBe("relief_allocation");
    migrated.chooseJourneyStory("albany:relief_mobile_reserve");
    const selected = migrated.snapshot();
    expect(
      selected.journalEntries
        .filter((entry) => entry.kind === "relief_allocation" || entry.kind === "ally")
        .map((entry) => entry.kind),
    ).toEqual(["relief_allocation", "ally"]);

    const restored = OverworldSession.restore(WORLD, selected).snapshot();
    expect(restored).toEqual(selected);
    expect(restored.character.companions).toContain("albany:june_pike");
    expect(restored.character.knowledge).toContain("albany:knowledge_relief_mobile_reserve");
    expect(restored.character.promises).toContainEqual(
      expect.objectContaining({ promiseId: "albany:promise_june_cattle_first" }),
    );
    expect(
      restored.character.relationships.flatMap((relationship) => relationship.memories),
    ).toEqual(
      expect.arrayContaining([
        "albany:memory_june_joined_cattle_first",
        "albany:memory_hayden_relief_mobile_reserve_allocated",
      ]),
    );
  });

  it("keeps a pending current offer replayable after unrelated quest work", () => {
    const session = new OverworldSession(WORLD);
    session.scoutPoi("albany_city__civic_core__poi");
    session.talkToCharacter("albany_city__civic_core__contact");
    session.chooseJourneyStory("albany:ledger_advocate");
    session.chooseJourneyStory("albany:oath_limited_aid_only");
    session.chooseJourneyStory("albany:source_rowan_civic_docket");
    session.chooseJourneyStory("albany:prep_works_fortification");

    travelAndResolve(session, "road_albany_city__saratoga_springs_city");
    travelAndResolve(session, "road_saratoga_springs_city__queensbury_town");
    session.exploreArea("queensbury_town__civic_core");
    moveToArea(session, "queensbury_town__market");
    session.startQuest("gallowmere");
    session.completeQuest("gallowmere", {
      endingId: "ending_victory",
      endingTitle: "The Gallowmere Broken",
      death: false,
    });

    travelAndResolve(session, "road_saratoga_springs_city__queensbury_town");
    travelAndResolve(session, "road_albany_city__saratoga_springs_city");
    moveToArea(session, "albany_city__transport_hub");
    expect(session.journey().storyChoice?.kind).toBe("relief_allocation");
    expect(session.snapshot().startedQuestIds).toContain("gallowmere");

    const pending = session.snapshot();
    expect(OverworldSession.restore(WORLD, pending).snapshot()).toEqual(pending);
  });

  it("grandfathers a started F12 save neutrally while preserving its exact approach proof", () => {
    const f12 = sessionAtWolf(exactF12World(WORLD));
    const beforeStart = f12.snapshot();
    f12.startQuest(QUEST_ID, RIDGE_APPROACH_ID);
    const predecessor = f12.snapshot();
    const predecessorStart = questStartEntry(predecessor);
    expect(predecessorStart.questStartProof).toMatchObject({
      kind: "approach",
      approachId: RIDGE_APPROACH_ID,
    });
    expect(predecessor.character.knowledge).toContain(RIDGE_KNOWLEDGE_ID);
    expect(
      predecessor.character.relationships.flatMap((relationship) => relationship.memories),
    ).toContain(RIDGE_MEMORY_ID);
    expect(allocationCharacterEvidence(predecessor)).toEqual([]);

    const restored = OverworldSession.restore(WORLD, predecessor).snapshot();
    const restoredStart = questStartEntry(restored);
    const questIndex = restored.journalEntries.findIndex(
      (entry) => entry.id === `quest:${QUEST_ID}`,
    );
    const marker = restored.journalEntries[questIndex + 1];

    expect(restored.worldHash).toBe(OVERWORLD_RELIEF_ALLOCATION_WORLD_HASH);
    expect(restoredStart.questStartProof).toEqual(predecessorStart.questStartProof);
    expect(marker).toMatchObject({ kind: "relief_allocation_legacy" });
    expect(openingReliefAllocationLegacySourceWorldHash(marker!.id)).toBe(
      OVERWORLD_HILL_APPROACH_WORLD_HASH,
    );
    expect(marker?.storyChoiceBoundary).toEqual({
      acceptedDecisions: beforeStart.journey.acceptedDecisions,
      decisionProofHash: beforeStart.journey.decisionProof.hash,
      townId: beforeStart.currentId,
      areaId: beforeStart.currentAreaId,
      minutes: beforeStart.minutes,
    });
    expect(
      restored.journalEntries.filter((entry) => entry.kind === "relief_allocation_legacy"),
    ).toHaveLength(1);
    expect(
      restored.journalEntries.some(
        (entry) => entry.kind === "relief_allocation" || entry.kind === "relief_allocation_offer",
      ),
    ).toBe(false);
    expect(serializeCampaignCharacterState(restored.character)).toBe(
      serializeCampaignCharacterState(predecessor.character),
    );
    expect(allocationCharacterEvidence(restored)).toEqual([]);
    expect(restored.character.knowledge).toContain(RIDGE_KNOWLEDGE_ID);
    expect(
      restored.character.relationships.flatMap((relationship) => relationship.memories),
    ).toContain(RIDGE_MEMORY_ID);
    expect(restored.minutes).toBe(predecessor.minutes);
    expect(restored.supplies).toBe(predecessor.supplies);
    expect(restored.fatigue).toBe(predecessor.fatigue);
    expect(OverworldSession.restore(WORLD, restored).snapshot()).toEqual(restored);
  });
});
