/**
 * SS-F05 paired proof. Every registered Albany background and every certified
 * lead can legally buy any one of the three finite plans. The plans then bind
 * different character knowledge, quest imports, provider memories, and
 * location-specific return services. Paired reachable resource states include
 * preparation cost, Albany relocation, and each alternative profile's own
 * best matching service, proving that no profile dominates the other two.
 */
import { describe, expect, it } from "vitest";

import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const WORLD = loadOverworldManifest(process.cwd());
const REGISTRATION =
  WORLD.opening_registration ??
  (() => {
    throw new Error("the Albany starting slice requires registration");
  })();
const LEAD_SOURCE =
  WORLD.opening_lead_source ??
  (() => {
    throw new Error("the Albany starting slice requires a lead source");
  })();
const PREPARATION =
  WORLD.opening_preparation ??
  (() => {
    throw new Error("the Albany starting slice requires preparation");
  })();
const WOLF =
  WORLD.quests.find((quest) => quest.id === "wolf_winter") ??
  (() => {
    throw new Error("the Albany starting slice requires Wolf-Winter");
  })();

const ROWAN_SOURCE = "albany:source_rowan_civic_docket";
const WORKS = "albany:prep_works_fortification";
const DROVER = "albany:prep_drover_route";
const RELIEF = "albany:prep_relief_protocol";
const PROFILE_IDS = [WORKS, DROVER, RELIEF] as const;
// This option affects only the exposed-ridge lure. These comparisons launch the
// sheltered route and complete it directly, so it adds no competing return service.
const NEUTRAL_RELIEF_ALLOCATION = "albany:relief_cade_fodder";

const PROFILE_KNOWLEDGE = {
  [WORKS]: "albany:knowledge_wolf_works_fortification",
  [DROVER]: "albany:knowledge_wolf_drover_route",
  [RELIEF]: "albany:knowledge_wolf_relief_protocol",
} as const;

const PROFILE_MEMORY = {
  [WORKS]: ["albany:reese_pryce", "albany:memory_reese_wolf_works_fortification_allocated"],
  [DROVER]: ["albany:emery_sloane", "albany:memory_emery_wolf_drover_route_allocated"],
  [RELIEF]: ["albany:jamie_tanner", "albany:memory_jamie_wolf_relief_protocol_allocated"],
} as const;

const RETURN_CASES = [
  {
    profileId: WORKS,
    backgroundId: "albany:ironhands_repairer",
    dawnChoiceId: "send_wardens_north",
    areaId: "albany_city__industrial",
    action: "resupply" as const,
    serviceId: "albany:wolf_works_fortification_return_resupply",
  },
  {
    profileId: DROVER,
    backgroundId: "albany:unaffiliated_courier",
    dawnChoiceId: "send_wagon_to_cade",
    areaId: "albany_city__campus",
    action: "rest" as const,
    serviceId: "albany:wolf_drover_route_return_rest",
  },
  {
    profileId: RELIEF,
    backgroundId: "albany:ledger_advocate",
    dawnChoiceId: "send_wardens_north",
    areaId: "albany_city__civic_core",
    action: "resupply" as const,
    serviceId: "albany:wolf_relief_protocol_return_resupply",
  },
] as const;

const ALBANY_AREA_IDS = Object.freeze(
  [
    ...new Set(
      WORLD.area_edges
        .filter((edge) => edge.home === "albany_city")
        .flatMap((edge) => [edge.from_area, edge.to_area]),
    ),
  ].sort(),
);

function moveToArea(session: OverworldSession, targetAreaId: string): void {
  const currentAreaId = session.view().currentArea?.id;
  if (!currentAreaId) throw new Error("expected a current Albany area");
  if (currentAreaId === targetAreaId) return;

  const edges = WORLD.area_edges.filter((edge) => edge.home === "albany_city");
  const unvisited = new Set(edges.flatMap((edge) => [edge.from_area, edge.to_area]));
  const distance = new Map<string, number>([[currentAreaId, 0]]);
  const previous = new Map<string, string>();
  while (unvisited.size > 0) {
    const areaId = [...unvisited].sort((left, right) => {
      const byDistance =
        (distance.get(left) ?? Number.POSITIVE_INFINITY) -
        (distance.get(right) ?? Number.POSITIVE_INFINITY);
      return byDistance || left.localeCompare(right);
    })[0]!;
    unvisited.delete(areaId);
    const currentDistance = distance.get(areaId);
    if (currentDistance === undefined) break;
    if (areaId === targetAreaId) break;
    for (const edge of edges.filter(
      (candidate) => candidate.from_area === areaId || candidate.to_area === areaId,
    )) {
      const next = edge.from_area === areaId ? edge.to_area : edge.from_area;
      if (!unvisited.has(next)) continue;
      const candidateDistance = currentDistance + edge.travel_minutes;
      if (candidateDistance >= (distance.get(next) ?? Number.POSITIVE_INFINITY)) continue;
      distance.set(next, candidateDistance);
      previous.set(next, areaId);
    }
  }
  if (!previous.has(targetAreaId)) throw new Error(`no Albany area route to ${targetAreaId}`);
  const areaPath: string[] = [];
  for (let cursor = targetAreaId; cursor !== currentAreaId; ) {
    const priorAreaId = previous.get(cursor);
    if (!priorAreaId) throw new Error(`broken Albany area route to ${targetAreaId}`);
    areaPath.unshift(cursor);
    cursor = priorAreaId;
  }
  for (const areaId of areaPath) {
    const route = session.view().areaExits.find((candidate) => candidate.destination.id === areaId);
    if (!route) {
      const view = session.view();
      throw new Error(
        `expected a visible Albany area route from ${view.currentArea?.id ?? "none"} to ${areaId}; visible: ${view.areaExits
          .map((candidate) => candidate.destination.id)
          .join(", ")}`,
      );
    }
    session.moveArea(route.id);
  }
}

function choosePreparation(args: {
  backgroundId: string;
  sourceId: string;
  profileId: (typeof PROFILE_IDS)[number];
}): { session: OverworldSession; minutesPaid: number; moneyPaid: number } {
  const session = new OverworldSession(WORLD);
  const opening = session.view();
  session.scoutPoi(opening.pois[0]!.id);
  session.talkToCharacter(REGISTRATION.contact);
  session.chooseJourneyStory(args.backgroundId);
  session.chooseJourneyStory("albany:oath_full_compact_duty");
  session.chooseJourneyStory(args.sourceId);
  moveToArea(session, PREPARATION.area);

  const prompt = session.journey().storyChoice;
  expect(prompt).toMatchObject({ id: PREPARATION.id, kind: "preparation" });
  expect(prompt?.options.map((option) => option.id)).toEqual(PROFILE_IDS);
  const before = session.snapshot();
  session.chooseJourneyStory(args.profileId);
  const after = session.snapshot();

  const otherProfile = PROFILE_IDS.find((profileId) => profileId !== args.profileId)!;
  expect(() => session.chooseJourneyStory(otherProfile)).toThrow(
    /no story consequence|unknown story choice/i,
  );
  const restored = OverworldSession.restore(WORLD, after);
  expect(() => restored.chooseJourneyStory(otherProfile)).toThrow(
    /no story consequence|unknown story choice/i,
  );

  expect(after.discoveredQuestIds).toContain(WOLF.id);
  expect(after.character.knowledge).toContain(PROFILE_KNOWLEDGE[args.profileId]);
  const [npcId, memoryId] = PROFILE_MEMORY[args.profileId];
  expect(
    after.character.relationships.find((relationship) => relationship.npcId === npcId)?.memories,
  ).toContain(memoryId);
  return {
    session,
    minutesPaid: after.minutes - before.minutes,
    moneyPaid: before.character.money - after.character.money,
  };
}

function addRoadStrain(session: OverworldSession): void {
  const outbound = session.view().exits.find((road) => road.destination.id === "colonie_town");
  if (!outbound) throw new Error("expected Albany's Colonie road");
  session.travel(outbound.id);
  if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
  const inbound = session.view().exits.find((road) => road.destination.id === "albany_city");
  if (!inbound) throw new Error("expected Colonie's Albany road");
  session.travel(inbound.id);
  if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
}

function returnedSession(args: {
  profileId: (typeof PROFILE_IDS)[number];
  backgroundId: string;
  dawnChoiceId: "send_wagon_to_cade" | "send_wardens_north";
}): { session: OverworldSession; baselineMinutes: number; baselineMoney: number } {
  const { session, minutesPaid, moneyPaid } = choosePreparation({
    backgroundId: args.backgroundId,
    sourceId: ROWAN_SOURCE,
    profileId: args.profileId,
  });
  const prepared = session.snapshot();
  const baselineMinutes = prepared.minutes - minutesPaid;
  const baselineMoney = prepared.character.money + moneyPaid;
  moveToArea(session, WOLF.area);
  expect(session.journey().storyChoice).toMatchObject({ kind: "relief_allocation" });
  session.chooseJourneyStory(NEUTRAL_RELIEF_ALLOCATION);
  session.startQuest(WOLF.id, "albany:wolf_approach_sheltered_stockway");
  const ending = WOLF.campaign_exports?.find((candidate) => candidate.ending_id === "ending_held");
  if (!ending) throw new Error("expected Wolf-Winter's held ending export");
  session.completeQuest(WOLF.id, {
    endingId: ending.ending_id,
    endingTitle: ending.ending_title,
    death: false,
  });
  session.chooseJourney("continue");
  session.chooseJourneyStory(args.dawnChoiceId);
  const station = session.view();
  session.scoutPoi(station.pois[0]!.id);
  session.talkToCharacter(station.characters[0]!.id);
  session.investigateEvent(station.events[0]!.id);
  expect(session.snapshot().discoveredAreaIds).toHaveLength(6);
  addRoadStrain(session);
  expect(session.snapshot().journey.acceptedDecisions).toBeLessThanOrEqual(45);
  return { session, baselineMinutes, baselineMoney };
}

function bestMatchingService(args: {
  run: ReturnType<typeof returnedSession>;
  action: "resupply" | "rest";
}): {
  totalMinutes: number;
  totalMoney: number;
  areaId: string;
  serviceRuleId: string | null;
} {
  const candidates = ALBANY_AREA_IDS.map((areaId) => {
    const candidate = OverworldSession.restore(WORLD, args.run.session.snapshot());
    moveToArea(candidate, areaId);
    if (args.action === "rest") candidate.restAtTown();
    else candidate.resupplyAtTown();
    const after = candidate.snapshot();
    const service = after.journalEntries.find((entry) => entry.kind === "service");
    return {
      totalMinutes: after.minutes - args.run.baselineMinutes,
      totalMoney: args.run.baselineMoney - after.character.money,
      areaId,
      serviceRuleId: service?.serviceRuleId ?? null,
    };
  });
  candidates.sort(
    (left, right) =>
      left.totalMinutes - right.totalMinutes ||
      left.totalMoney - right.totalMoney ||
      left.areaId.localeCompare(right.areaId),
  );
  return candidates[0]!;
}

describe("SS-F05 — Albany preparation profiles", () => {
  it("keeps all three finite plans legal across every background and lead-source pairing", () => {
    for (const background of REGISTRATION.profiles) {
      for (const source of LEAD_SOURCE.options) {
        for (const profileId of PROFILE_IDS) {
          const result = choosePreparation({
            backgroundId: background.id,
            sourceId: source.id,
            profileId,
          });
          expect(result.moneyPaid).toBeGreaterThanOrEqual(0);
          expect(result.moneyPaid).toBeLessThanOrEqual(4);
          expect(result.minutesPaid).toBeGreaterThanOrEqual(0);
          expect(result.session.snapshot().character.money).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("gives each profile a paired total-cost state where it beats both alternatives' best service", () => {
    for (const returnCase of RETURN_CASES) {
      const sessions = new Map(
        PROFILE_IDS.map((profileId) => [
          profileId,
          returnedSession({
            profileId,
            backgroundId: returnCase.backgroundId,
            dawnChoiceId: returnCase.dawnChoiceId,
          }),
        ]),
      );
      for (const run of sessions.values()) moveToArea(run.session, returnCase.areaId);

      for (const profileId of PROFILE_IDS) {
        const offers = sessions.get(profileId)!.session.view().serviceOffers;
        if (profileId === returnCase.profileId) {
          expect(offers).toContainEqual(
            expect.objectContaining({
              id: returnCase.serviceId,
              action: returnCase.action,
              minutes: 15,
            }),
          );
        } else {
          expect(offers.map((offer) => offer.id)).not.toContain(returnCase.serviceId);
        }
      }

      const bestByProfile = new Map(
        PROFILE_IDS.map((profileId) => [
          profileId,
          bestMatchingService({ run: sessions.get(profileId)!, action: returnCase.action }),
        ]),
      );
      const target = bestByProfile.get(returnCase.profileId)!;
      expect(target.serviceRuleId).toBe(returnCase.serviceId);
      for (const otherProfile of PROFILE_IDS.filter(
        (profileId) => profileId !== returnCase.profileId,
      )) {
        const alternative = bestByProfile.get(otherProfile)!;
        expect(target.totalMinutes).toBeLessThan(alternative.totalMinutes);
        expect(target.totalMoney).toBeLessThanOrEqual(alternative.totalMoney);
      }
    }
  });
});
