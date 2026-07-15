import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import { serializeCampaignCharacterState } from "../../src/world/campaign_character_state.js";
import { openingReliefAllocationLegacySourceWorldHash } from "../../src/world/opening_relief_allocation_journal.js";
import type { OverworldManifest } from "../../src/world/overworld.js";
import { OverworldSession } from "../../src/world/session.js";
import {
  OVERWORLD_FORTIFY_OUTLAST_PREDECESSOR_WORLD_HASH,
  OVERWORLD_HILL_APPROACH_PREDECESSOR_WORLD_HASH,
  OVERWORLD_HILL_APPROACH_WORLD_HASH,
  OVERWORLD_RELIEF_ALLOCATION_WORLD_HASH,
} from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { exactF11World, exactF12World } from "./fixtures/historical_overworlds.js";

const WORLD = loadOverworldManifest(process.cwd());
const QUEST_ID = "wolf_winter";
const RIDGE_APPROACH_ID = "albany:wolf_approach_exposed_ridge";
const RIDGE_KNOWLEDGE_ID = "albany:knowledge_wolf_exposed_ridge";
const RIDGE_MEMORY_ID = "albany:memory_hayden_dispatched_exposed_ridge";
const F11_OUTCOMES = new Set([
  "ending_drive_cattle_wounded",
  "ending_drive_person_cattle_lost",
  "ending_drive_reserve_spent",
  "ending_fortified_albany_authority",
  "ending_fortified_cade_terms",
  "ending_held",
  "ending_held_gate_barred",
  "ending_held_timber_saved",
  "ending_pack_diverted",
  "ending_pack_diverted_after_blood",
  "ending_pack_diverted_cattle_scattered",
]);
const F11_SERVICES = new Set([
  "albany:dawn_wagon_solo_packet_resupply",
  "albany:dawn_wardens_greenway_rest",
  "albany:june_kept_line_station_resupply",
  "albany:june_relay_refusal_station_rest",
  "albany:wolf_barred_gate_quick_rest",
  "albany:wolf_drive_reserve_returned_station_rest",
  "albany:wolf_drive_whole_herd_greenway_resupply",
  "albany:wolf_drover_route_return_rest",
  "albany:wolf_fortified_albany_authority_station_rest",
  "albany:wolf_fortified_cade_terms_station_resupply",
  "albany:wolf_live_pack_greenway_resupply",
  "albany:wolf_relief_protocol_return_resupply",
  "albany:wolf_saved_timber_quick_resupply",
  "albany:wolf_works_fortification_return_resupply",
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

describe("hill-approach predecessor migration integrity", () => {
  it("pins exact F11 and F12 history plus the current F06 target", () => {
    const predecessor = exactF11World(WORLD);
    expect(hashState(predecessor)).toBe(OVERWORLD_HILL_APPROACH_PREDECESSOR_WORLD_HASH);
    expect(hashState(exactF12World(WORLD))).toBe(OVERWORLD_HILL_APPROACH_WORLD_HASH);
    expect(hashState(WORLD)).toBe(OVERWORLD_RELIEF_ALLOCATION_WORLD_HASH);
    expect(OVERWORLD_HILL_APPROACH_PREDECESSOR_WORLD_HASH).toBe(
      "abd3b623a502b688a501bceae68994a4eb0e591d450420b5093532b5dae22179",
    );
    expect(OVERWORLD_HILL_APPROACH_WORLD_HASH).toBe(
      "634fd4e93143343fd813edd9c59d3a8c098c0d78b94497cf689988492de154e3",
    );
    expect(
      new Set(
        predecessor.quests
          .find((quest) => quest.id === QUEST_ID)
          ?.campaign_exports?.map((campaignExport) => campaignExport.ending_id),
      ),
    ).toEqual(F11_OUTCOMES);
    expect(new Set((predecessor.campaign_service_rules ?? []).map((rule) => rule.id))).toEqual(
      F11_SERVICES,
    );
  });

  it("keeps an unstarted F11 lead route-neutral and offers the current F06 allocation", () => {
    const predecessor = sessionAtWolf(exactF11World(WORLD)).snapshot();
    const restored = OverworldSession.restore(WORLD, predecessor).snapshot();

    expect(restored.worldHash).toBe(OVERWORLD_RELIEF_ALLOCATION_WORLD_HASH);
    expect(restored.minutes).toBe(predecessor.minutes);
    expect(restored.supplies).toBe(predecessor.supplies);
    expect(restored.fatigue).toBe(predecessor.fatigue);
    expect(serializeCampaignCharacterState(restored.character)).toBe(
      serializeCampaignCharacterState(predecessor.character),
    );
    expect(restored.journalEntries.some((entry) => entry.questStartProof !== undefined)).toBe(
      false,
    );
    expect(
      restored.journalEntries.filter((entry) => entry.kind === "relief_allocation_offer"),
    ).toHaveLength(1);
  });

  it("migrates a started F11 quest to one neutral legacy proof and stays idempotent", () => {
    const f11 = sessionAtWolf(exactF11World(WORLD));
    const before = f11.snapshot();
    f11.startQuest(QUEST_ID);
    const predecessor = f11.snapshot();
    expect(predecessor.worldHash).toBe(OVERWORLD_HILL_APPROACH_PREDECESSOR_WORLD_HASH);
    expect(predecessor.minutes).toBe(before.minutes);
    expect(predecessor.supplies).toBe(before.supplies);
    expect(predecessor.fatigue).toBe(before.fatigue);
    expect(questStartEntry(predecessor).questStartProof).toBeUndefined();

    const restored = OverworldSession.restore(WORLD, predecessor).snapshot();
    const start = questStartEntry(restored);
    const startIndex = restored.journalEntries.findIndex(
      (entry) => entry.id === `quest:${QUEST_ID}`,
    );
    const allocationMarker = restored.journalEntries[startIndex + 1];
    expect(start.questStartProof).toEqual({
      kind: "legacy",
      sourceWorldHash: OVERWORLD_HILL_APPROACH_PREDECESSOR_WORLD_HASH,
      boundary: {
        acceptedDecisions: predecessor.journey.acceptedDecisions,
        decisionProofHash: predecessor.journey.decisionProof.hash,
        townId: "albany_city",
        areaId: "albany_city__transport_hub",
        minutes: predecessor.minutes,
      },
    });
    expect(restored.minutes).toBe(predecessor.minutes);
    expect(restored.supplies).toBe(predecessor.supplies);
    expect(restored.fatigue).toBe(predecessor.fatigue);
    expect(serializeCampaignCharacterState(restored.character)).toBe(
      serializeCampaignCharacterState(predecessor.character),
    );
    expect(allocationMarker).toMatchObject({ kind: "relief_allocation_legacy" });
    expect(openingReliefAllocationLegacySourceWorldHash(allocationMarker!.id)).toBe(
      OVERWORLD_HILL_APPROACH_PREDECESSOR_WORLD_HASH,
    );
    expect(allocationMarker?.storyChoiceBoundary).toEqual({
      acceptedDecisions: before.journey.acceptedDecisions,
      decisionProofHash: before.journey.decisionProof.hash,
      townId: before.currentId,
      areaId: before.currentAreaId,
      minutes: before.minutes,
    });
    expect(
      restored.journalEntries.filter((entry) => entry.kind === "relief_allocation_legacy"),
    ).toHaveLength(1);
    expect(OverworldSession.restore(WORLD, restored).snapshot()).toEqual(restored);
  });

  it.each([...F11_OUTCOMES])("migrates the exact F11 Wolf-Winter outcome %s", (endingId) => {
    const f11 = sessionAtWolf(exactF11World(WORLD));
    const wolf = exactF11World(WORLD).quests.find((quest) => quest.id === QUEST_ID)!;
    const campaignExport = wolf.campaign_exports?.find(
      (candidate) => candidate.ending_id === endingId,
    );
    if (!campaignExport) throw new Error(`missing campaign export ${endingId}`);
    f11.startQuest(QUEST_ID);
    f11.completeQuest(QUEST_ID, {
      endingId,
      endingTitle: campaignExport.ending_title,
      death: false,
    });

    const predecessor = f11.snapshot();
    const restored = OverworldSession.restore(WORLD, predecessor).snapshot();
    expect(restored.questOutcomes).toContainEqual([QUEST_ID, endingId]);
    expect(questStartEntry(restored).questStartProof).toMatchObject({
      kind: "legacy",
      sourceWorldHash: OVERWORLD_HILL_APPROACH_PREDECESSOR_WORLD_HASH,
    });
    expect(
      restored.journalEntries.find((entry) => entry.id === `quest_done:${QUEST_ID}`)?.text,
    ).not.toContain("You reached Cade by");
    expect(OverworldSession.restore(WORLD, restored).snapshot()).toEqual(restored);
  });

  it("preserves a consumed F11-only fortification service without repeating it", () => {
    const f11 = sessionAtWolf(exactF11World(WORLD));
    f11.startQuest(QUEST_ID);
    f11.completeQuest(QUEST_ID, {
      endingId: "ending_fortified_cade_terms",
      endingTitle: "Dawn Behind Cade's Shutters",
      death: false,
    });
    f11.chooseJourney("continue");
    f11.chooseJourneyStory("send_wagon_to_cade");
    const serviceId = "albany:wolf_fortified_cade_terms_station_resupply";
    expect(f11.view().serviceOffers.map((offer) => offer.id)).toContain(serviceId);
    f11.resupplyAtTown();
    const predecessor = f11.snapshot();
    expect(
      predecessor.journalEntries.filter((entry) => entry.serviceRuleId === serviceId),
    ).toHaveLength(1);

    const restoredSession = OverworldSession.restore(WORLD, predecessor);
    const restored = restoredSession.snapshot();
    expect(
      restored.journalEntries.filter((entry) => entry.serviceRuleId === serviceId),
    ).toHaveLength(1);
    expect(restoredSession.view().serviceOffers.map((offer) => offer.id)).not.toContain(serviceId);
    expect(questStartEntry(restored).questStartProof).toMatchObject({
      kind: "legacy",
      sourceWorldHash: OVERWORLD_HILL_APPROACH_PREDECESSOR_WORLD_HASH,
    });
    expect(OverworldSession.restore(WORLD, restored).snapshot()).toEqual(restored);
  });

  it("rejects F12 proof, route label, route character evidence, and altered F11 copy", () => {
    const current = sessionAtWolf(exactF12World(WORLD));
    const beforeApproach = current.snapshot();
    current.startQuest(QUEST_ID, RIDGE_APPROACH_ID);
    const relabeled = current.snapshot();
    relabeled.worldHash = OVERWORLD_HILL_APPROACH_PREDECESSOR_WORLD_HASH;
    expect(() => OverworldSession.restore(WORLD, relabeled)).toThrow(
      /quest-start proof evidence introduced by the hill-approach manifest/i,
    );

    const routeLabel = structuredClone(relabeled);
    delete questStartEntry(routeLabel).questStartProof;
    routeLabel.character = structuredClone(beforeApproach.character);
    expect(() => OverworldSession.restore(WORLD, routeLabel)).toThrow(
      /route-labelled Wolf-Winter start decision/i,
    );

    const f11 = sessionAtWolf(exactF11World(WORLD));
    f11.startQuest(QUEST_ID);
    const routeEvidence = f11.snapshot();
    routeEvidence.character.knowledge.push(RIDGE_KNOWLEDGE_ID);
    routeEvidence.character.knowledge.sort();
    expect(() => OverworldSession.restore(WORLD, routeEvidence)).toThrow(
      /route character evidence introduced by the hill-approach manifest/i,
    );

    const changedCopy = f11.snapshot();
    questStartEntry(changedCopy).text += " Approach: Take the Exposed Ridge Road.";
    expect(() => OverworldSession.restore(WORLD, changedCopy)).toThrow(/exact F11 authored copy/i);

    const migrated = OverworldSession.restore(WORLD, f11.snapshot()).snapshot();
    const forgedOlderCopy = structuredClone(migrated);
    const forgedProof = questStartEntry(forgedOlderCopy).questStartProof;
    if (forgedProof?.kind !== "legacy") throw new Error("expected a migrated legacy proof");
    forgedProof.sourceWorldHash = OVERWORLD_FORTIFY_OUTLAST_PREDECESSOR_WORLD_HASH;
    questStartEntry(forgedOlderCopy).text = "FORGED LEGACY QUEST COPY";
    expect(() => OverworldSession.restore(WORLD, forgedOlderCopy)).toThrow(
      /exact F10 authored copy/i,
    );

    expect(
      current.snapshot().character.relationships.flatMap((relationship) => relationship.memories),
    ).toContain(RIDGE_MEMORY_ID);
  });
});
