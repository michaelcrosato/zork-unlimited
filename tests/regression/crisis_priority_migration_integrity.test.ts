import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import { OverworldSession } from "../../src/world/session.js";
import {
  OVERWORLD_CRISIS_PRIORITY_PREDECESSOR_WORLD_HASH,
  OVERWORLD_CRISIS_PRIORITY_WORLD_HASH,
  OVERWORLD_FORTIFY_OUTLAST_WORLD_HASH,
  OVERWORLD_HILL_APPROACH_WORLD_HASH,
  OVERWORLD_RELIEF_ALLOCATION_WORLD_HASH,
} from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import {
  exactF11World,
  exactF12World,
  registrationPromiseClosureCurrentCharacter,
} from "./fixtures/historical_overworlds.js";

const WORLD = loadOverworldManifest(process.cwd());
const REGISTRATION = WORLD.opening_registration!;
const LEAD = WORLD.opening_lead_source!;
const PREPARATION = WORLD.opening_preparation!;
const ALLY = WORLD.opening_ally!;
const WOLF = WORLD.quests.find((quest) => quest.id === "wolf_winter")!;
const PRE_ROUTE_WORLD = exactF11World(WORLD);

const ACCEPT_JUNE = "albany:ally_june_cattle_first";
const RELAY_JUNE = "albany:ally_june_relay_only";
const JUNE_RESUPPLY = "albany:june_kept_line_station_resupply";
const JUNE_REST = "albany:june_relay_refusal_station_rest";
const F10_DRIVE_REST = "albany:wolf_drive_reserve_returned_station_rest";
const F10_DRIVE_ENDING = "ending_drive_cattle_wounded";
const F04_ENDING = "ending_pack_diverted";
const F04_ALLY_OFFER_ID = "ally_offer:albany:wolf_ally_commitment";
const F04_JUNE_BASE_CONTACT_ID = "talk:albany_city__transport_hub__june_pike";
const F04_JUNE_SELECTION_ID = "ally:albany:wolf_ally_commitment:albany:ally_june_cattle_first";
const F04_ALLY_OFFER_TEXT =
  "June Pike has one Road-Warden field seat beside Hayden's outgoing packet. She can ride with you, but only under a named division of authority; leaving without that agreement sends the relief rider alone and does not delay the dispatch. Capability: After a failed living-pack lure is recovered without blood, June can leave the wolf line at the final byre threshold and take the cattle line, lowering cattle alarm by 1. Condition: June keeps cattle-first authority. She will not become an extra hunter, and the first wolf killed ends her place on the field team.";
const F04_JUNE_SELECTION_TEXT =
  "Ask June Pike to ride as an independent Road-Warden ally. The briefing takes 15 minutes. June joins the field team and records your promise that she chooses the cattle line if the recovered lure still leaves the herd pressing. Her help is one pressure intervention, never a combat bonus; any wolf death ends the agreement. Actual cost: 15 minutes. June signs beside your name, takes the second field seat, and remembers that you granted rather than merely borrowed her authority.";
const F04_JUNE_BASE_CONTACT_TEXT =
  "June Pike checks a cattle rope, hooded lantern, and one empty field seat beside Hayden Hale's Wolf-Winter packet. June will ride only with cattle-first authority of her own. She offers one herd-pressure intervention after a bloodless recovery, not another spear, and remains in Albany if that condition is refused.";
const F04_JUNE_JOINED_CONTACT_ID =
  "talk:albany_city__transport_hub__june_pike@joined_wolf_cattle_first";
const F04_JUNE_JOINED_CONTACT_TEXT =
  "June has signed the Wolf-Winter field line beside your name and remembers that cattle-first authority was granted explicitly. She will take the cattle line after a failed lure is recovered alive, but the first wolf killed ends her place on the team.";
const F04_JUNE_LEFT_CONTACT_ID = "talk:albany_city__transport_hub__june_pike@left_after_blood";
const F04_JUNE_LEFT_CONTACT_TEXT =
  "June's field seat is empty. Her separate return says first blood broke the cattle-first line before she could take the lower rail. The promise is recorded broken, June has left the party, and no ally return claim is available; the completed Wolf-Winter result still stands.";

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
    if (!prior) throw new Error(`No area route to ${targetAreaId}.`);
    path.unshift(cursor);
    cursor = prior;
  }
  for (const areaId of path) {
    const route = session.view().areaExits.find((candidate) => candidate.destination.id === areaId);
    if (!route) throw new Error(`Area route to ${areaId} is not visible.`);
    session.moveArea(route.id);
  }
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

function consumedF04AllyService(args: {
  allyOptionId: string;
  serviceRuleId: string;
  use: "rest" | "resupply";
}): ReturnType<OverworldSession["snapshot"]> {
  const session = new OverworldSession(PRE_ROUTE_WORLD);
  const opening = session.view();
  session.scoutPoi(opening.pois[0]!.id);
  session.talkToCharacter(REGISTRATION.contact);
  session.chooseJourneyStory(REGISTRATION.profiles[0]!.id);
  session.chooseJourneyStory(LEAD.options[0]!.id);
  session.chooseJourneyStory(PREPARATION.profiles[0]!.id);
  moveToArea(session, ALLY.area);
  session.talkToCharacter(ALLY.contact);
  session.chooseJourneyStory(args.allyOptionId);
  session.talkToCharacter(ALLY.contact);
  if (args.allyOptionId === ACCEPT_JUNE) session.talkToCharacter(ALLY.contact);

  moveToArea(session, WOLF.area);
  session.startQuest(WOLF.id);
  const campaignExport = WOLF.campaign_exports!.find(
    (candidate) => candidate.ending_id === F04_ENDING,
  );
  if (!campaignExport) throw new Error(`Missing Wolf ending ${F04_ENDING}.`);
  session.completeQuest(WOLF.id, {
    endingId: F04_ENDING,
    endingTitle: campaignExport.ending_title,
    death: false,
  });
  session.chooseJourney("continue");
  session.chooseJourneyStory("send_wardens_north");
  addRoadStrain(session);
  moveToArea(session, ALLY.area);
  expect(session.view().serviceOffers.map((offer) => offer.id)).toContain(args.serviceRuleId);
  if (args.use === "rest") session.restAtTown();
  else session.resupplyAtTown();

  const snapshot = session.snapshot();
  expect(snapshot.journalEntries).toContainEqual(
    expect.objectContaining({ kind: "service", serviceRuleId: args.serviceRuleId }),
  );
  return snapshot;
}

function f04LeftAfterBloodSnapshot(): ReturnType<OverworldSession["snapshot"]> {
  const session = new OverworldSession(PRE_ROUTE_WORLD);
  const opening = session.view();
  session.scoutPoi(opening.pois[0]!.id);
  session.talkToCharacter(REGISTRATION.contact);
  session.chooseJourneyStory(REGISTRATION.profiles[0]!.id);
  session.chooseJourneyStory(LEAD.options[0]!.id);
  session.chooseJourneyStory(PREPARATION.profiles[0]!.id);
  moveToArea(session, ALLY.area);
  session.talkToCharacter(ALLY.contact);
  session.chooseJourneyStory(ACCEPT_JUNE);

  moveToArea(session, WOLF.area);
  session.startQuest(WOLF.id);
  const campaignExport = WOLF.campaign_exports!.find(
    (candidate) => candidate.ending_id === "ending_held",
  );
  if (!campaignExport) throw new Error("Missing Wolf held ending.");
  session.completeQuest(WOLF.id, {
    endingId: "ending_held",
    endingTitle: campaignExport.ending_title,
    death: false,
  });
  session.chooseJourney("continue");
  session.chooseJourneyStory("send_wardens_north");
  moveToArea(session, ALLY.area);
  session.talkToCharacter(ALLY.contact);
  session.talkToCharacter(ALLY.contact);
  return session.snapshot();
}

function relabelAsF04(
  snapshot: ReturnType<OverworldSession["snapshot"]>,
): ReturnType<OverworldSession["snapshot"]> {
  const predecessor = structuredClone(snapshot);
  predecessor.worldHash = OVERWORLD_CRISIS_PRIORITY_PREDECESSOR_WORLD_HASH;
  const offer = predecessor.journalEntries.find((entry) => entry.id === F04_ALLY_OFFER_ID);
  if (!offer) throw new Error("Expected the durable F04 ally offer.");
  offer.text = F04_ALLY_OFFER_TEXT;
  for (const entry of predecessor.journalEntries) {
    if (
      entry.id === F04_JUNE_BASE_CONTACT_ID ||
      entry.id.startsWith(`${F04_JUNE_BASE_CONTACT_ID}:`)
    ) {
      entry.text = F04_JUNE_BASE_CONTACT_TEXT;
    }
  }
  const juneSelection = predecessor.journalEntries.find(
    (entry) => entry.id === F04_JUNE_SELECTION_ID,
  );
  if (juneSelection) juneSelection.text = F04_JUNE_SELECTION_TEXT;
  for (const entry of predecessor.journalEntries) {
    if (
      entry.id === F04_JUNE_JOINED_CONTACT_ID ||
      entry.id.startsWith(`${F04_JUNE_JOINED_CONTACT_ID}:`)
    ) {
      entry.text = F04_JUNE_JOINED_CONTACT_TEXT;
    }
    if (
      entry.id === F04_JUNE_LEFT_CONTACT_ID ||
      entry.id.startsWith(`${F04_JUNE_LEFT_CONTACT_ID}:`)
    ) {
      entry.text = F04_JUNE_LEFT_CONTACT_TEXT;
    }
  }
  return predecessor;
}

describe("crisis-priority predecessor migration integrity", () => {
  it("pins F04 as the exact bounded predecessor and F10 as historical current", () => {
    expect(OVERWORLD_CRISIS_PRIORITY_PREDECESSOR_WORLD_HASH).toBe(
      "2d10f959279a12166d521a774779acc46481fb6ff40d5982f9c955a30677a7b6",
    );
    expect(OVERWORLD_CRISIS_PRIORITY_WORLD_HASH).toBe(
      "1e74d32c28c3d563f6e8103034768506e25f13ff1f8e410b190cbb344589add8",
    );
    expect(hashState(PRE_ROUTE_WORLD)).toBe(OVERWORLD_FORTIFY_OUTLAST_WORLD_HASH);
    expect(hashState(exactF12World(WORLD))).toBe(OVERWORLD_HILL_APPROACH_WORLD_HASH);
    expect(hashState(WORLD)).toBe(OVERWORLD_RELIEF_ALLOCATION_WORLD_HASH);
  });

  it.each([
    {
      label: "June's kept-line resupply",
      allyOptionId: ACCEPT_JUNE,
      serviceRuleId: JUNE_RESUPPLY,
      use: "resupply" as const,
    },
    {
      label: "June's relay-refusal rest",
      allyOptionId: RELAY_JUNE,
      serviceRuleId: JUNE_REST,
      use: "rest" as const,
    },
  ])("restores an exact F04 save with $label and no invented migration", (migrationCase) => {
    const current = consumedF04AllyService(migrationCase);
    const predecessor = relabelAsF04(current);

    const restored = OverworldSession.restore(WORLD, predecessor).snapshot();
    expect(restored).toMatchObject({
      worldHash: OVERWORLD_RELIEF_ALLOCATION_WORLD_HASH,
      minutes: current.minutes,
      supplies: current.supplies,
      fatigue: current.fatigue,
      questOutcomes: current.questOutcomes,
    });
    expect(restored.character).toEqual(
      registrationPromiseClosureCurrentCharacter(current.character),
    );
    expect(
      restored.journalEntries.find((entry) => entry.id === `quest:${WOLF.id}`)?.questStartProof,
    ).toMatchObject({
      kind: "legacy",
      sourceWorldHash: OVERWORLD_CRISIS_PRIORITY_PREDECESSOR_WORLD_HASH,
    });
    expect(restored.journalEntries.some((entry) => entry.kind === "preparation_legacy")).toBe(
      false,
    );
    expect(restored.journalEntries).toContainEqual(
      expect.objectContaining({ serviceRuleId: migrationCase.serviceRuleId }),
    );
    expect(OverworldSession.restore(WORLD, restored).snapshot()).toEqual(restored);
  });

  it("rejects current ally copy merely relabeled with the F04 manifest hash", () => {
    const forged = consumedF04AllyService({
      allyOptionId: ACCEPT_JUNE,
      serviceRuleId: JUNE_RESUPPLY,
      use: "resupply",
    });
    forged.worldHash = OVERWORLD_CRISIS_PRIORITY_PREDECESSOR_WORLD_HASH;

    expect(() => OverworldSession.restore(WORLD, forged)).toThrow(/exact F04 authored copy/i);
  });

  it("normalizes exact F04 post-blood June contact copy and stays stable on replay", () => {
    const current = f04LeftAfterBloodSnapshot();
    const predecessor = relabelAsF04(current);

    const restored = OverworldSession.restore(WORLD, predecessor).snapshot();
    expect(restored).toMatchObject({
      minutes: current.minutes,
      supplies: current.supplies,
      fatigue: current.fatigue,
      questOutcomes: current.questOutcomes,
    });
    expect(restored.character).toEqual(
      registrationPromiseClosureCurrentCharacter(current.character),
    );
    expect(
      restored.journalEntries.find((entry) => entry.id === `quest:${WOLF.id}`)?.questStartProof,
    ).toMatchObject({
      kind: "legacy",
      sourceWorldHash: OVERWORLD_CRISIS_PRIORITY_PREDECESSOR_WORLD_HASH,
    });
    expect(OverworldSession.restore(WORLD, restored).snapshot()).toEqual(restored);
  });

  it("rejects an F10 Wolf ending relabeled as an F04 outcome", () => {
    const forged = relabelAsF04(
      consumedF04AllyService({
        allyOptionId: ACCEPT_JUNE,
        serviceRuleId: JUNE_RESUPPLY,
        use: "resupply",
      }),
    );
    const wolfOutcome = forged.questOutcomes.find(([questId]) => questId === WOLF.id);
    if (!wolfOutcome) throw new Error("Expected a completed Wolf-Winter outcome.");
    wolfOutcome[1] = F10_DRIVE_ENDING;

    expect(() => OverworldSession.restore(WORLD, forged)).toThrow(
      /Wolf-Winter quest outcome introduced by a later manifest/i,
    );
  });

  it("rejects an F10 campaign service relabeled as F04 journal evidence", () => {
    const forged = relabelAsF04(
      consumedF04AllyService({
        allyOptionId: ACCEPT_JUNE,
        serviceRuleId: JUNE_RESUPPLY,
        use: "resupply",
      }),
    );
    const service = forged.journalEntries.find((entry) => entry.serviceRuleId === JUNE_RESUPPLY);
    if (!service) throw new Error("Expected consumed F04 June service evidence.");
    service.serviceRuleId = F10_DRIVE_REST;

    expect(() => OverworldSession.restore(WORLD, forged)).toThrow(
      /service evidence introduced by a later manifest/i,
    );
  });
});
