import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import { OverworldSession } from "../../src/world/session.js";
import {
  OVERWORLD_FORTIFY_OUTLAST_PREDECESSOR_WORLD_HASH,
  OVERWORLD_FORTIFY_OUTLAST_WORLD_HASH,
  OVERWORLD_HILL_APPROACH_WORLD_HASH,
  OVERWORLD_RELIEF_ALLOCATION_WORLD_HASH,
} from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { exactF11World, exactF12World } from "./fixtures/historical_overworlds.js";

const WORLD = loadOverworldManifest(process.cwd());
const REGISTRATION = WORLD.opening_registration!;
const LEAD = WORLD.opening_lead_source!;
const PREPARATION = WORLD.opening_preparation!;
const ALLY = WORLD.opening_ally!;
const WOLF = WORLD.quests.find((quest) => quest.id === "wolf_winter")!;
const PRE_ROUTE_WORLD = exactF11World(WORLD);
const STATION = "albany_city__transport_hub";
const GREENWAY = "albany_city__greenway";

const F10_ENDINGS = [
  "ending_pack_diverted_after_blood",
  "ending_pack_diverted_cattle_scattered",
  "ending_pack_diverted",
  "ending_drive_cattle_wounded",
  "ending_drive_person_cattle_lost",
  "ending_drive_reserve_spent",
  "ending_held_gate_barred",
  "ending_held_timber_saved",
  "ending_held",
] as const;

const DRIVE_REST = "albany:wolf_drive_reserve_returned_station_rest";
const DRIVE_RESUPPLY = "albany:wolf_drive_whole_herd_greenway_resupply";
const SAVED_TIMBER_RESUPPLY = "albany:wolf_saved_timber_quick_resupply";
const F11_CADE_SERVICE = "albany:wolf_fortified_cade_terms_station_resupply";
const F11_AUTHORITY_SERVICE = "albany:wolf_fortified_albany_authority_station_rest";
const ACCEPT_JUNE = "albany:ally_june_cattle_first";
const RELAY_JUNE = "albany:ally_june_relay_only";
const SOLO = "albany:ally_travel_solo";
const F10_JUNE_BASE_CONTACT_ID = "talk:albany_city__transport_hub__june_pike";
const F10_ALLY_OFFER_ID = "ally_offer:albany:wolf_ally_commitment";
const F10_JUNE_SELECTION_ID = "ally:albany:wolf_ally_commitment:albany:ally_june_cattle_first";
const F10_JUNE_JOINED_CONTACT_ID =
  "talk:albany_city__transport_hub__june_pike@joined_wolf_cattle_first";
const F10_JUNE_BASE_CONTACT_TEXT =
  "June Pike checks a cattle rope, hooded lantern, and one empty field seat beside Hayden Hale's Wolf-Winter packet. June will ride only with cattle-first authority of her own. She offers one herd-pressure intervention after a bloodless recovery, not another spear, and remains in Albany if that condition is refused.";
const F10_ALLY_OFFER_TEXT =
  "June Pike has one Road-Warden field seat beside Hayden's outgoing packet. She can ride with you, but only under a named division of authority; leaving without that agreement sends the relief rider alone and does not delay the dispatch. Capability: On a bloodless living-pack line, June can leave the wolf line at the final byre threshold and take the cattle line once: she lowers cattle alarm after a recovered lure or opens the lower swing gate during a committed drive. Condition: June keeps cattle-first authority. She will not become an extra hunter, and the first wolf killed ends her place on the field team.";
const F10_JUNE_SELECTION_TEXT =
  "Ask June Pike to ride as an independent Road-Warden ally. The briefing takes 15 minutes. June joins the field team and records your promise that she chooses the cattle line if a recovered lure leaves the herd pressing or a committed drive reaches the final threshold. Her help is one pressure intervention, never a combat bonus; any wolf death ends the agreement. Actual cost: 15 minutes. June signs beside your name, takes the second field seat, and remembers that you granted rather than merely borrowed her authority.";
const F10_JUNE_JOINED_CONTACT_TEXT =
  "June has signed the Wolf-Winter field line beside your name and remembers that cattle-first authority was granted explicitly. She will take the cattle line once after a failed lure is recovered alive or when a committed drive reaches its final threshold, but the first wolf killed ends her place on the team.";
const F10_DAWN_WAGON_SERVICE_SUMMARY =
  "Because you assigned the dawn wagon to rebuild Cade's outer line, Jamie Tanner holds a one-time Market road-store credit for carrying Hedrick's packet alone.";
const F11_DAWN_WAGON_SERVICE_SUMMARY =
  "Because you sent the dawn wagon back to Cade and carried Hedrick's packet north alone, Jamie Tanner holds a one-time Market road-store credit.";

function moveToArea(session: OverworldSession, targetAreaId: string): void {
  const currentAreaId = session.view().currentArea?.id;
  if (!currentAreaId || currentAreaId === targetAreaId) return;
  const edges = WORLD.area_edges.filter((edge) => edge.home === session.view().current.id);
  const queue = [currentAreaId];
  const previous = new Map<string, string>();
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    if (current === targetAreaId) break;
    for (const edge of edges.filter(
      (candidate) => candidate.from_area === current || candidate.to_area === current,
    )) {
      const next = edge.from_area === current ? edge.to_area : edge.from_area;
      if (next === currentAreaId || previous.has(next)) continue;
      previous.set(next, current);
      queue.push(next);
    }
  }
  const path: string[] = [];
  for (let cursor = targetAreaId; cursor !== currentAreaId; ) {
    const prior = previous.get(cursor);
    if (!prior) throw new Error(`No Albany area route to ${targetAreaId}.`);
    path.unshift(cursor);
    cursor = prior;
  }
  for (const areaId of path) {
    const route = session.view().areaExits.find((candidate) => candidate.destination.id === areaId);
    if (!route) throw new Error(`Area route to ${areaId} is not visible.`);
    session.moveArea(route.id);
  }
}

function discoverAlbanyDistricts(session: OverworldSession): void {
  moveToArea(session, "albany_city__market");
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter("albany_city__market__contact");
  const marketSite = session.view().sites.find((site) => site.area === "albany_city__market");
  if (!marketSite) throw new Error("Expected Jamie's Market discovery site.");
  session.exploreSite(marketSite.id);
}

function freshAtWolfFor(
  args: {
    allyOptionId?: string;
    preparationId?: string;
  } = {},
): OverworldSession {
  const session = new OverworldSession(PRE_ROUTE_WORLD);
  const opening = session.view();
  session.scoutPoi(opening.pois[0]!.id);
  session.talkToCharacter(REGISTRATION.contact);
  session.chooseJourneyStory(REGISTRATION.profiles[0]!.id);
  session.chooseJourneyStory(LEAD.options[0]!.id);
  session.chooseJourneyStory(args.preparationId ?? PREPARATION.profiles[0]!.id);
  discoverAlbanyDistricts(session);
  moveToArea(session, ALLY.area);
  session.talkToCharacter(ALLY.contact);
  session.chooseJourneyStory(args.allyOptionId ?? SOLO);
  if ((args.allyOptionId ?? SOLO) === ACCEPT_JUNE) session.talkToCharacter(ALLY.contact);
  session.startQuest(WOLF.id);
  return session;
}

function freshAtWolf(): OverworldSession {
  return freshAtWolfFor();
}

function freshAtWolfWithJune(): OverworldSession {
  return freshAtWolfFor({ allyOptionId: ACCEPT_JUNE });
}

function completeWolf(session: OverworldSession, endingId: string): void {
  const campaignExport = WOLF.campaign_exports?.find(
    (candidate) => candidate.ending_id === endingId,
  );
  if (!campaignExport) throw new Error(`Missing Wolf-Winter campaign export ${endingId}.`);
  session.completeQuest(WOLF.id, {
    endingId,
    endingTitle: campaignExport.ending_title,
    death: false,
  });
}

function finishReturn(
  session: OverworldSession,
  choice: "send_wagon_to_cade" | "send_wardens_north" = "send_wagon_to_cade",
): void {
  session.chooseJourney("continue");
  session.chooseJourneyStory(choice);
}

function addRoadStrain(session: OverworldSession): void {
  const outbound = session.view().exits.find((road) => road.destination.id === "colonie_town");
  if (!outbound) throw new Error("Expected Albany's Colonie road.");
  session.travel(outbound.id);
  if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
  const inbound = session.view().exits.find((road) => road.destination.id === "albany_city");
  if (!inbound) throw new Error("Expected Colonie's Albany road.");
  session.travel(inbound.id);
  if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
}

function relabelAsF10(
  snapshot: ReturnType<OverworldSession["snapshot"]>,
): ReturnType<OverworldSession["snapshot"]> {
  const predecessor = structuredClone(snapshot);
  predecessor.worldHash = OVERWORLD_FORTIFY_OUTLAST_PREDECESSOR_WORLD_HASH;
  return predecessor;
}

function relabelWithExactF10Copy(
  snapshot: ReturnType<OverworldSession["snapshot"]>,
): ReturnType<OverworldSession["snapshot"]> {
  const predecessor = relabelAsF10(snapshot);
  for (const entry of predecessor.journalEntries) {
    const repeatedContact = /^(.*):\d+$/.exec(entry.id)?.[1] ?? entry.id;
    if (repeatedContact === F10_JUNE_BASE_CONTACT_ID) entry.text = F10_JUNE_BASE_CONTACT_TEXT;
    if (repeatedContact === F10_ALLY_OFFER_ID) entry.text = F10_ALLY_OFFER_TEXT;
    if (repeatedContact === F10_JUNE_SELECTION_ID) entry.text = F10_JUNE_SELECTION_TEXT;
    if (repeatedContact === F10_JUNE_JOINED_CONTACT_ID) {
      entry.text = F10_JUNE_JOINED_CONTACT_TEXT;
    }
    if (
      entry.kind === "campaign" &&
      /^campaign_goal:\d+:carry_hedricks_packet_north$/.test(entry.id)
    ) {
      entry.title = "Send the wagon to rebuild Cade's outer line";
    }
    if (
      entry.kind === "service" &&
      entry.serviceRuleId === "albany:dawn_wagon_solo_packet_resupply"
    ) {
      const currentPrefix = `${F11_DAWN_WAGON_SERVICE_SUMMARY} `;
      if (!entry.text.startsWith(currentPrefix)) {
        throw new Error("Expected the current dawn-wagon service summary.");
      }
      entry.text = `${F10_DAWN_WAGON_SERVICE_SUMMARY} ${entry.text.slice(currentPrefix.length)}`;
    }
  }
  return predecessor;
}

function completedSnapshot(endingId: string): ReturnType<OverworldSession["snapshot"]> {
  const session = freshAtWolf();
  completeWolf(session, endingId);
  return session.snapshot();
}

function expectNeutralF10Migration(
  restored: ReturnType<OverworldSession["snapshot"]>,
  source: ReturnType<OverworldSession["snapshot"]>,
): void {
  expect(restored).toMatchObject({
    worldHash: OVERWORLD_RELIEF_ALLOCATION_WORLD_HASH,
    minutes: source.minutes,
    supplies: source.supplies,
    fatigue: source.fatigue,
    startedQuestIds: source.startedQuestIds,
    completedQuestIds: source.completedQuestIds,
    questOutcomes: source.questOutcomes,
  });
  expect(restored.character).toEqual(source.character);
  expect(
    restored.journalEntries.find((entry) => entry.id === `quest:${WOLF.id}`)?.questStartProof,
  ).toMatchObject({
    kind: "legacy",
    sourceWorldHash: OVERWORLD_FORTIFY_OUTLAST_PREDECESSOR_WORLD_HASH,
  });
}

function consumedService(args: {
  allyOptionId?: string;
  dawnChoice?: "send_wagon_to_cade" | "send_wardens_north";
  endingId: string;
  preparationId?: string;
  serviceId: string;
  areaId: string;
  action: "rest" | "resupply";
}): ReturnType<OverworldSession["snapshot"]> {
  const session = freshAtWolfFor({
    ...(args.allyOptionId ? { allyOptionId: args.allyOptionId } : {}),
    ...(args.preparationId ? { preparationId: args.preparationId } : {}),
  });
  completeWolf(session, args.endingId);
  finishReturn(session, args.dawnChoice);
  addRoadStrain(session);
  moveToArea(session, args.areaId);
  expect(session.view().serviceOffers.map((offer) => offer.id)).toContain(args.serviceId);
  if (args.action === "rest") session.restAtTown();
  else session.resupplyAtTown();
  const snapshot = session.snapshot();
  expect(snapshot.journalEntries).toContainEqual(
    expect.objectContaining({ kind: "service", serviceRuleId: args.serviceId }),
  );
  return snapshot;
}

describe("fortify-and-outlast predecessor migration integrity", () => {
  it("pins F10 as the exact direct predecessor of the reconstructed F11 manifest", () => {
    expect(OVERWORLD_FORTIFY_OUTLAST_PREDECESSOR_WORLD_HASH).toBe(
      "1e74d32c28c3d563f6e8103034768506e25f13ff1f8e410b190cbb344589add8",
    );
    expect(hashState(PRE_ROUTE_WORLD)).toBe(OVERWORLD_FORTIFY_OUTLAST_WORLD_HASH);
    expect(hashState(exactF12World(WORLD))).toBe(OVERWORLD_HILL_APPROACH_WORLD_HASH);
    expect(hashState(WORLD)).toBe(OVERWORLD_RELIEF_ALLOCATION_WORLD_HASH);
  });

  it.each(F10_ENDINGS)("restores the exact F10 Wolf-Winter outcome %s", (endingId) => {
    const current = completedSnapshot(endingId);
    const restored = OverworldSession.restore(WORLD, relabelWithExactF10Copy(current)).snapshot();
    expectNeutralF10Migration(restored, current);
    expect(OverworldSession.restore(WORLD, restored).snapshot()).toEqual(restored);
  });

  it("normalizes all four exact F10 June surfaces and the pre-F11 wagon title", () => {
    const session = freshAtWolfWithJune();
    completeWolf(session, "ending_drive_cattle_wounded");
    finishReturn(session);
    const current = session.snapshot();
    const predecessor = relabelWithExactF10Copy(current);

    const restored = OverworldSession.restore(WORLD, predecessor).snapshot();
    expectNeutralF10Migration(restored, current);
    expect(restored.journalEntries).toContainEqual(
      expect.objectContaining({
        kind: "campaign",
        title: "Send the wagon back to Cade",
      }),
    );
    for (const id of [
      F10_JUNE_BASE_CONTACT_ID,
      F10_ALLY_OFFER_ID,
      F10_JUNE_SELECTION_ID,
      F10_JUNE_JOINED_CONTACT_ID,
    ]) {
      expect(
        restored.journalEntries.some((entry) => entry.id === id || entry.id.startsWith(`${id}:`)),
      ).toBe(true);
    }
  });

  it("rejects current F11 wagon and June copy merely relabeled with the F10 hash", () => {
    const completed = freshAtWolfWithJune();
    completeWolf(completed, "ending_drive_cattle_wounded");
    finishReturn(completed);
    expect(() => OverworldSession.restore(WORLD, relabelAsF10(completed.snapshot()))).toThrow(
      /exact pre-F11 authored title/i,
    );

    const juneOnly = freshAtWolfWithJune().snapshot();
    expect(() => OverworldSession.restore(WORLD, relabelAsF10(juneOnly))).toThrow(
      /exact F10 authored copy/i,
    );
  });

  it("rejects current F11 dawn-wagon service copy merely relabeled with the F10 hash", () => {
    const forged = relabelWithExactF10Copy(
      consumedService({
        endingId: "ending_held",
        dawnChoice: "send_wagon_to_cade",
        serviceId: "albany:dawn_wagon_solo_packet_resupply",
        areaId: "albany_city__market",
        action: "resupply",
      }),
    );
    const service = forged.journalEntries.find(
      (entry) => entry.serviceRuleId === "albany:dawn_wagon_solo_packet_resupply",
    );
    if (!service) throw new Error("Expected dawn-wagon campaign service evidence.");
    const predecessorPrefix = `${F10_DAWN_WAGON_SERVICE_SUMMARY} `;
    expect(service.text.startsWith(predecessorPrefix)).toBe(true);
    service.text = `${F11_DAWN_WAGON_SERVICE_SUMMARY} ${service.text.slice(predecessorPrefix.length)}`;
    expect(() => OverworldSession.restore(WORLD, forged)).toThrow(
      /exact pre-F11 authored summary/i,
    );
  });

  it.each([
    {
      label: "Works fortification resupply",
      endingId: "ending_held",
      preparationId: "albany:prep_works_fortification",
      serviceId: "albany:wolf_works_fortification_return_resupply",
      areaId: "albany_city__industrial",
      action: "resupply" as const,
    },
    {
      label: "drover-route rest",
      endingId: "ending_held",
      preparationId: "albany:prep_drover_route",
      serviceId: "albany:wolf_drover_route_return_rest",
      areaId: "albany_city__campus",
      action: "rest" as const,
    },
    {
      label: "relief-protocol resupply",
      endingId: "ending_held",
      preparationId: "albany:prep_relief_protocol",
      serviceId: "albany:wolf_relief_protocol_return_resupply",
      areaId: "albany_city__civic_core",
      action: "resupply" as const,
    },
    {
      label: "living-pack Greenway resupply",
      endingId: "ending_pack_diverted",
      serviceId: "albany:wolf_live_pack_greenway_resupply",
      areaId: GREENWAY,
      action: "resupply" as const,
    },
    {
      label: "returned-drive Station rest",
      endingId: "ending_drive_cattle_wounded",
      serviceId: DRIVE_REST,
      areaId: STATION,
      action: "rest" as const,
    },
    {
      label: "whole-herd Greenway resupply",
      endingId: "ending_drive_cattle_wounded",
      serviceId: DRIVE_RESUPPLY,
      areaId: GREENWAY,
      action: "resupply" as const,
    },
    {
      label: "June kept-line Station resupply",
      allyOptionId: ACCEPT_JUNE,
      endingId: "ending_pack_diverted",
      serviceId: "albany:june_kept_line_station_resupply",
      areaId: STATION,
      action: "resupply" as const,
    },
    {
      label: "June relay-refusal Station rest",
      allyOptionId: RELAY_JUNE,
      endingId: "ending_pack_diverted",
      serviceId: "albany:june_relay_refusal_station_rest",
      areaId: STATION,
      action: "rest" as const,
    },
    {
      label: "saved-timber Station resupply",
      endingId: "ending_held_timber_saved",
      serviceId: SAVED_TIMBER_RESUPPLY,
      areaId: STATION,
      action: "resupply" as const,
    },
    {
      label: "barred-gate Station rest",
      endingId: "ending_held_gate_barred",
      serviceId: "albany:wolf_barred_gate_quick_rest",
      areaId: STATION,
      action: "rest" as const,
    },
    {
      label: "dawn-wagon Market resupply",
      endingId: "ending_held",
      dawnChoice: "send_wagon_to_cade" as const,
      serviceId: "albany:dawn_wagon_solo_packet_resupply",
      areaId: "albany_city__market",
      action: "resupply" as const,
    },
    {
      label: "dawn-wardens Greenway rest",
      endingId: "ending_held",
      dawnChoice: "send_wardens_north" as const,
      serviceId: "albany:dawn_wardens_greenway_rest",
      areaId: GREENWAY,
      action: "rest" as const,
    },
  ])("restores consumed F10 $label without inventing or repeating it", (migrationCase) => {
    const current = consumedService(migrationCase);
    const restored = OverworldSession.restore(WORLD, relabelWithExactF10Copy(current));
    const restoredSnapshot = restored.snapshot();
    expectNeutralF10Migration(restoredSnapshot, current);
    expect(restored.view().serviceOffers.map((offer) => offer.id)).not.toContain(
      migrationCase.serviceId,
    );
    expect(OverworldSession.restore(WORLD, restoredSnapshot).snapshot()).toEqual(restoredSnapshot);
  });

  it.each(["ending_fortified_cade_terms", "ending_fortified_albany_authority"])(
    "rejects F11 fortify outcome %s merely relabeled as F10",
    (endingId) => {
      const forged = relabelWithExactF10Copy(completedSnapshot(endingId));
      expect(() => OverworldSession.restore(WORLD, forged)).toThrow(
        /Wolf-Winter quest outcome introduced by a later manifest/i,
      );
    },
  );

  it.each([F11_CADE_SERVICE, F11_AUTHORITY_SERVICE])(
    "rejects F11 fortify service evidence %s merely relabeled as F10",
    (serviceRuleId) => {
      const forged = relabelWithExactF10Copy(
        consumedService({
          endingId: "ending_held_timber_saved",
          serviceId: SAVED_TIMBER_RESUPPLY,
          areaId: STATION,
          action: "resupply",
        }),
      );
      const service = forged.journalEntries.find(
        (entry) => entry.serviceRuleId === SAVED_TIMBER_RESUPPLY,
      );
      if (!service) throw new Error("Expected consumed F10 service evidence.");
      service.serviceRuleId = serviceRuleId;
      expect(() => OverworldSession.restore(WORLD, forged)).toThrow(
        /service evidence introduced by a later manifest/i,
      );
    },
  );

  it("still rejects an arbitrary or forged predecessor hash", () => {
    const forged = completedSnapshot("ending_held");
    forged.worldHash = "0".repeat(64);
    expect(() => OverworldSession.restore(WORLD, forged)).toThrow(/different world manifest/i);
  });
});
