/**
 * Hayden's post-Wolf filing standard adds one exact administrative closure to
 * the Cade Return Packet. It never gates Wolf-Winter, displaces a certified
 * physical dispatch, or creates another recovery counter.
 */
import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import { createToolApi } from "../../src/mcp/tools.js";
import {
  AUTHORED_ALBANY_STATION_EVENT_PREDECESSOR_WORLD_HASH,
  authoredLocalEventLegacyOptionId,
} from "../../src/world/local_event_scene_legacy.js";
import type { OverworldManifest } from "../../src/world/overworld.js";
import { OverworldSession } from "../../src/world/session.js";
import { planOverworldEventResolution } from "../../src/world/session_event_resolution.js";
import { OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH } from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { OverworldSession as UiOverworldSession } from "../../ui/src/overworld.js";
import { exactAlbanyStationEventPredecessor } from "../regression/fixtures/historical_overworlds.js";

const WORLD = loadOverworldManifest(process.cwd());
const REGION = "Capital / Mohawk";
const STATION = "albany_city__transport_hub";
const STATION_POI = "albany_city__transport_hub__poi";
const STATION_CONTACT = "albany_city__transport_hub__contact";
const EVENT = "albany_city__transport_hub__event";
const EVENT_SCENE = "albany:cade-return-filing-standard";
const ROUTE_STANDARD = "bind_operational_route_abstract";
const WITNESS_STANDARD = "bind_witnessed_return_record";
const JOB = "albany_city__transport_hub__job";
const JOB_SCENE = "albany:cade-return-packet";
const PALING = "dispatch_paling_rebuild";
const ROUTE_CLOSE = "close_packet_under_route_abstract";
const WITNESS_CLOSE = "close_packet_under_witnessed_record";
const CIVIC = "albany_city__civic_core";
const WORKS = "albany_city__industrial";
const GREENWAY = "albany_city__greenway";
const CIVIC_REST = "albany:works_public_shift_civic_rest";
const PALING_REST = "albany:cade_paling_rebuild_works_rest";
const PHYSICAL_CADE_SERVICES = [
  PALING_REST,
  "albany:cade_evacuation_line_works_rest",
  "albany:cade_pasture_search_greenway_resupply",
  "albany:cade_pasture_search_unaffiliated_greenway_resupply",
] as const;
const FULL = { compact_context: false, compact_result: false } as const;

type StandardId = typeof ROUTE_STANDARD | typeof WITNESS_STANDARD;

function moveToArea(
  session: OverworldSession,
  target: string,
  world: OverworldManifest = WORLD,
): void {
  for (let attempts = 0; !session.view().areas.some((area) => area.id === target); attempts += 1) {
    if (attempts >= 8) throw new Error(`Could not map Albany route to ${target}.`);
    const current = session.view().currentArea;
    if (!current) throw new Error("Expected an Albany current area.");
    session.exploreArea(current.id);
  }
  const start = session.view().currentArea?.id;
  if (!start || start === target) return;
  const edges = world.area_edges.filter((edge) => edge.home === session.view().current.id);
  const previous = new Map<string, string>();
  const queue = [start];
  for (let index = 0; index < queue.length; index += 1) {
    const here = queue[index]!;
    for (const edge of edges.filter(
      (candidate) => candidate.from_area === here || candidate.to_area === here,
    )) {
      const next = edge.from_area === here ? edge.to_area : edge.from_area;
      if (next === start || previous.has(next)) continue;
      previous.set(next, here);
      queue.push(next);
    }
  }
  const path: string[] = [];
  for (let cursor = target; cursor !== start; ) {
    const prior = previous.get(cursor);
    if (!prior) throw new Error(`No Albany route reaches ${target}.`);
    path.unshift(cursor);
    cursor = prior;
  }
  for (const area of path) {
    const route = session.view().areaExits.find((edge) => edge.destination.id === area);
    if (!route) throw new Error(`The mapped route to ${area} is not visible.`);
    session.moveArea(route.id);
  }
}

function openedAlbany(world: OverworldManifest = WORLD): OverworldSession {
  const session = new OverworldSession(world);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(world.opening_registration!.contact);
  session.chooseJourneyStory("albany:ledger_advocate");
  session.chooseJourneyStory("albany:oath_full_compact_duty");
  session.chooseJourneyStory("albany:source_rowan_civic_docket");
  moveToArea(session, world.opening_preparation!.area, world);
  session.chooseJourneyStory("albany:prep_works_fortification");
  if (session.view().departureInteractions[0]?.kind === "relief_allocation") {
    session.chooseJourneyStory("albany:relief_cade_fodder");
  }
  return session;
}

function returnedHeld(
  options: { inspect?: boolean } = {},
  world: OverworldManifest = WORLD,
): OverworldSession {
  const session = openedAlbany(world);
  const wolf = session.view().quests.find((quest) => quest.id === "wolf_winter");
  if (!wolf) throw new Error("The Albany opening must expose Wolf-Winter.");
  moveToArea(session, wolf.area, world);
  session.scoutPoi(STATION_POI);
  session.talkToCharacter(STATION_CONTACT);
  session.startQuest(wolf.id, "albany:wolf_approach_sheltered_stockway");
  session.completeQuest(wolf.id, {
    endingId: "ending_held",
    endingTitle: "The Byre Held",
    death: false,
  });
  session.chooseJourney("continue");
  session.chooseJourneyStory("send_wardens_north");
  if (options.inspect ?? true) session.investigateEvent(EVENT);
  return session;
}

function selectStandard(standard: StandardId, world: OverworldManifest = WORLD): OverworldSession {
  const session = returnedHeld({}, world);
  session.resolveEvent(EVENT, standard);
  return session;
}

function expectedChoices(optional?: string): string[][] {
  return [PALING, ...(optional ? [optional] : [])].map((optionId) => [JOB, optionId]);
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

function plannerEntries() {
  return [
    {
      id: `scout:${STATION_POI}`,
      kind: "poi" as const,
      town: "Albany City",
      title: "Scouted Station Quarter",
      text: "Scouted Station Quarter",
      recordedAt: "Day 2, 10:00",
    },
    {
      id: `talk:${STATION_CONTACT}`,
      kind: "contact" as const,
      town: "Albany City",
      title: "Talked with Hayden",
      text: "Talked with Hayden",
      recordedAt: "Day 2, 10:10",
    },
    {
      id: `investigate:${EVENT}`,
      kind: "event" as const,
      town: "Albany City",
      title: "Investigated Cade's return filing",
      text: "Investigated Cade's return filing",
      recordedAt: "Day 2, 10:20",
    },
  ];
}

function planWith(entries: ReturnType<typeof plannerEntries>, completed = true) {
  const event = WORLD.local_events.find((candidate) => candidate.id === EVENT);
  if (!event) throw new Error("Expected the Station return event.");
  return planOverworldEventResolution({
    eventId: EVENT,
    optionId: ROUTE_STANDARD,
    eventsById: new Map([[EVENT, event]]),
    currentTownId: "albany_city",
    currentTownName: "Albany City",
    currentRegion: REGION,
    currentAreaId: STATION,
    completedQuestIds: new Set(completed ? ["wolf_winter"] : []),
    resolvedEventIds: new Set(),
    journalEntries: new Map(entries.map((entry) => [entry.id, entry])),
    poisByArea: new Map([
      [STATION, WORLD.points_of_interest.filter((poi) => poi.area === STATION)],
    ]),
    charactersByArea: new Map([
      [STATION, WORLD.characters.filter((contact) => contact.area === STATION)],
    ]),
  });
}

describe("Albany Station return filing standard", () => {
  it("is inaccessible before Wolf-Winter and retains Scout, Talk, and Investigate access", () => {
    const event = WORLD.local_events.find((candidate) => candidate.id === EVENT);
    if (!event?.authored_scene) throw new Error("Expected the authored Station event.");
    expect(event.authored_scene.requires_completed_quests).toEqual(["wolf_winter"]);
    expect(
      openedAlbany()
        .view()
        .events.map((candidate) => candidate.id),
    ).not.toContain(EVENT);
    expect(() => planWith(plannerEntries(), false)).toThrow(/complet(?:e|ing).*wolf_winter/i);

    const entries = plannerEntries();
    expect(() => planWith([])).toThrow(/scout.*talk.*investigate/i);
    expect(() => planWith(entries.slice(0, 1))).toThrow(/talk.*investigate/i);
    expect(() => planWith(entries.slice(0, 2))).toThrow(/investigate/i);
    expect(planWith(entries)).toMatchObject({ minutes: 20, renown: 1 });

    const returned = returnedHeld({ inspect: false });
    expect(returned.view().events.map((candidate) => candidate.id)).toContain(EVENT);
    expect(returned.view().eventChoices).toEqual([]);
    returned.investigateEvent(EVENT);
    expect(returned.view().eventChoices).toEqual([
      [EVENT, ROUTE_STANDARD],
      [EVENT, WITNESS_STANDARD],
    ]);
  });

  it("gives both standards equal immediate terms", () => {
    const event = WORLD.local_events.find((candidate) => candidate.id === EVENT);
    expect(event?.authored_scene?.options.map((option) => [option.id, option.terms])).toEqual([
      [ROUTE_STANDARD, { minutes: 20, renown: 1 }],
      [WITNESS_STANDARD, { minutes: 20, renown: 1 }],
    ]);
  });

  it.each([
    [ROUTE_STANDARD, ROUTE_CLOSE, WITNESS_CLOSE],
    [WITNESS_STANDARD, WITNESS_CLOSE, ROUTE_CLOSE],
  ] as const)(
    "makes %s expose only its matching closure while retaining Cade's physical dispatch",
    (standard, matching, opposite) => {
      const session = returnedHeld();
      expect(session.view().jobChoices).toEqual(expectedChoices());
      const before = session.snapshot();
      expect(session.resolveEvent(EVENT, standard)).toMatchObject({ minutes: 20 });
      expect(session.snapshot().minutes - before.minutes).toBe(20);
      expect(session.view().regionRenown[REGION]).toBe(
        (before.regionRenown.find(([id]) => id === REGION)?.[1] ?? 0) + 1,
      );
      expect(session.view().jobChoices).toEqual(expectedChoices(matching));
      expect(session.compactView().job_choices).toEqual(expectedChoices(matching));
      expect(session.view().jobChoices).not.toContainEqual([JOB, opposite]);
      expect(() => session.workLocalJob(JOB, opposite)).toThrow(/not available/i);
      expect(
        session.snapshot().journalEntries.find((entry) => entry.id === `resolve:${EVENT}`)
          ?.localSceneProof,
      ).toMatchObject({ sceneId: EVENT_SCENE, optionId: standard });
      expect(OverworldSession.restore(WORLD, session.snapshot()).snapshot()).toEqual(
        session.snapshot(),
      );
    },
  );

  it("proves the 50/+4 route and 65/+5 witnessed frontier from the same 8-standing return", () => {
    const route = returnedHeld();
    const witnessed = returnedHeld();
    const routeBefore = route.snapshot();
    const witnessedBefore = witnessed.snapshot();
    expect(routeBefore.regionRenown.find(([id]) => id === REGION)?.[1]).toBe(8);
    expect(witnessedBefore).toEqual(routeBefore);

    route.resolveEvent(EVENT, ROUTE_STANDARD);
    route.workLocalJob(JOB, ROUTE_CLOSE);
    witnessed.resolveEvent(EVENT, WITNESS_STANDARD);
    witnessed.workLocalJob(JOB, WITNESS_CLOSE);

    expect(route.snapshot().minutes - routeBefore.minutes).toBe(50);
    expect((route.view().regionRenown[REGION] ?? 0) - 8).toBe(4);
    expect(route.view().regionRenown[REGION]).toBe(12);
    expect(witnessed.snapshot().minutes - witnessedBefore.minutes).toBe(65);
    expect((witnessed.view().regionRenown[REGION] ?? 0) - 8).toBe(5);
    expect(witnessed.view().regionRenown[REGION]).toBe(13);

    addRoadStrain(route);
    addRoadStrain(witnessed);
    moveToArea(route, CIVIC);
    moveToArea(witnessed, CIVIC);
    expect(route.view().serviceOffers.map((offer) => offer.id)).not.toContain(CIVIC_REST);
    expect(witnessed.view().serviceOffers).toContainEqual(
      expect.objectContaining({ id: CIVIC_REST, action: "rest", minutes: 15 }),
    );
  });

  it("projects exact event and job choices through save, full, compact, UI, and MCP views", () => {
    const unresolved = returnedHeld();
    const eventChoices = [
      [EVENT, ROUTE_STANDARD],
      [EVENT, WITNESS_STANDARD],
    ];
    expect(unresolved.view().eventChoices).toEqual(eventChoices);
    expect(unresolved.compactView().event_choices).toEqual(eventChoices);
    expect(unresolved.compactView().event_scenes?.[0]?.slice(0, 2)).toEqual([EVENT, EVENT_SCENE]);
    expect(UiOverworldSession.restore(WORLD, unresolved.snapshot()).view().eventChoices).toEqual(
      eventChoices,
    );

    const api = createToolApi({ root: process.cwd() });
    const unresolvedFull = api.restore_overworld_session({
      ...FULL,
      snapshot: unresolved.snapshot(),
    });
    const unresolvedCompact = api.restore_overworld_session({
      compact_context: true,
      snapshot: unresolved.snapshot(),
    });
    expect(unresolvedFull.observation.eventChoices).toEqual(eventChoices);
    expect(unresolvedCompact.context.event_choices).toEqual(eventChoices);

    unresolved.resolveEvent(EVENT, ROUTE_STANDARD);
    const jobChoices = expectedChoices(ROUTE_CLOSE);
    expect(UiOverworldSession.restore(WORLD, unresolved.snapshot()).view().jobChoices).toEqual(
      jobChoices,
    );
    const full = api.restore_overworld_session({ ...FULL, snapshot: unresolved.snapshot() });
    const compact = api.restore_overworld_session({
      compact_context: true,
      snapshot: unresolved.snapshot(),
    });
    expect(full.observation.jobChoices).toEqual(jobChoices);
    expect(compact.context.job_choices).toEqual(jobChoices);
    expect(full.observation.eventChoices).toEqual([]);
    expect(compact.context.event_choices).toBeUndefined();
    expect(OverworldSession.restore(WORLD, unresolved.snapshot()).snapshot()).toEqual(
      unresolved.snapshot(),
    );
  });

  it.each([
    [ROUTE_STANDARD, ROUTE_CLOSE],
    [WITNESS_STANDARD, WITNESS_CLOSE],
  ] as const)(
    "creates no Station, Works, or Greenway recovery rule for %s",
    (standard, closure) => {
      expect(
        (WORLD.campaign_service_rules ?? []).filter((rule) =>
          JSON.stringify(rule.requires_all_local_job_options ?? []).includes(closure),
        ),
      ).toEqual([]);
      const session = selectStandard(standard);
      session.workLocalJob(JOB, closure);
      expect(
        session.snapshot().journalEntries.find((entry) => entry.id === `job:${JOB}`)
          ?.localSceneProof,
      ).toMatchObject({ sceneId: JOB_SCENE, optionId: closure });
      addRoadStrain(session);
      for (const area of [STATION, WORKS, GREENWAY]) {
        moveToArea(session, area);
        expect(
          session
            .view()
            .serviceOffers.map((offer) => offer.id)
            .filter((id) =>
              PHYSICAL_CADE_SERVICES.includes(id as (typeof PHYSICAL_CADE_SERVICES)[number]),
            ),
        ).toEqual([]);
      }
    },
  );

  it("keeps a neutral predecessor event neutral and unlocks neither closure", () => {
    const predecessor = exactAlbanyStationEventPredecessor(WORLD);
    expect(hashState(predecessor)).toBe(AUTHORED_ALBANY_STATION_EVENT_PREDECESSOR_WORLD_HASH);
    expect(hashState(WORLD)).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH);
    const legacy = returnedHeld({ inspect: false }, predecessor);
    legacy.investigateEvent(EVENT);
    legacy.resolveEvent(EVENT);

    const restored = OverworldSession.restore(WORLD, legacy.snapshot());
    expect(restored.view().jobChoices).toEqual(expectedChoices());
    expect(JSON.stringify(restored.snapshot())).not.toContain(ROUTE_CLOSE);
    expect(JSON.stringify(restored.snapshot())).not.toContain(WITNESS_CLOSE);
    expect(
      restored.snapshot().journalEntries.find((entry) => entry.id === `resolve:${EVENT}`)
        ?.localSceneProof,
    ).toMatchObject({
      sceneId: EVENT_SCENE,
      optionId: authoredLocalEventLegacyOptionId(
        AUTHORED_ALBANY_STATION_EVENT_PREDECESSOR_WORLD_HASH,
      ),
      sourceWorldHash: AUTHORED_ALBANY_STATION_EVENT_PREDECESSOR_WORLD_HASH,
    });
  });

  it("migrates an unresolved predecessor investigation durably without inventing a filing choice", () => {
    const predecessor = exactAlbanyStationEventPredecessor(WORLD);
    const legacy = openedAlbany(predecessor);
    legacy.scoutPoi(STATION_POI);
    legacy.talkToCharacter(STATION_CONTACT);
    legacy.investigateEvent(EVENT);
    expect(legacy.snapshot().resolvedEventIds).not.toContain(EVENT);

    const restored = OverworldSession.restore(WORLD, legacy.snapshot());
    const investigation = restored
      .snapshot()
      .journalEntries.find((entry) => entry.id === `investigate:${EVENT}`);
    expect(investigation).toMatchObject({
      kind: "event",
      sourceWorldHash: AUTHORED_ALBANY_STATION_EVENT_PREDECESSOR_WORLD_HASH,
    });
    expect(restored.view().events.map((event) => event.id)).not.toContain(EVENT);
    expect(OverworldSession.restore(WORLD, restored.snapshot()).snapshot()).toEqual(
      restored.snapshot(),
    );

    const wolf = restored.view().quests.find((quest) => quest.id === "wolf_winter");
    if (!wolf) throw new Error("Expected Wolf-Winter after the migrated Station investigation.");
    restored.startQuest(wolf.id, "albany:wolf_approach_sheltered_stockway");
    restored.completeQuest(wolf.id, {
      endingId: "ending_held",
      endingTitle: "The Byre Held",
      death: false,
    });
    restored.chooseJourney("continue");
    restored.chooseJourneyStory("send_wardens_north");
    expect(restored.view().eventChoices).toEqual([
      [EVENT, ROUTE_STANDARD],
      [EVENT, WITNESS_STANDARD],
    ]);

    for (const mutate of [
      (entry: NonNullable<typeof investigation>) => {
        entry.sourceWorldHash = "f".repeat(64);
      },
      (entry: NonNullable<typeof investigation>) => {
        entry.text += " forged";
      },
    ]) {
      const forged = structuredClone(OverworldSession.restore(WORLD, legacy.snapshot()).snapshot());
      const forgedInvestigation = forged.journalEntries.find(
        (entry) => entry.id === `investigate:${EVENT}`,
      );
      if (!forgedInvestigation) throw new Error("Expected migrated Station investigation.");
      mutate(forgedInvestigation);
      expect(() => OverworldSession.restore(WORLD, forged)).toThrow(
        /untrusted legacy investigation evidence/i,
      );
    }
  });

  it("expires the filing standard after a physical Cade dispatch instead of offering dead choices", () => {
    const investigated = returnedHeld();
    investigated.workLocalJob(JOB, PALING);
    expect(investigated.view().events.map((event) => event.id)).not.toContain(EVENT);
    expect(investigated.view().eventChoices).toEqual([]);
    expect(investigated.journey().opportunities?.leads.map((lead) => lead.id)).not.toContain(EVENT);
    expect(() => investigated.resolveEvent(EVENT, ROUTE_STANDARD)).toThrow(
      /before completing local job.*transport_hub__job/i,
    );

    const uninvestigated = returnedHeld({ inspect: false });
    uninvestigated.workLocalJob(JOB, PALING);
    expect(uninvestigated.view().events.map((event) => event.id)).not.toContain(EVENT);
    expect(() => uninvestigated.investigateEvent(EVENT)).toThrow(
      /before completing local job.*transport_hub__job/i,
    );
  });

  it("preserves a predecessor-native physical Cade proof and its existing service", () => {
    const predecessor = exactAlbanyStationEventPredecessor(WORLD);
    const legacy = returnedHeld({ inspect: false }, predecessor);
    legacy.investigateEvent(EVENT);
    legacy.resolveEvent(EVENT);
    legacy.workLocalJob(JOB, PALING);

    const restored = OverworldSession.restore(WORLD, legacy.snapshot());
    expect(
      restored.snapshot().journalEntries.find((entry) => entry.id === `job:${JOB}`)
        ?.localSceneProof,
    ).toMatchObject({ sceneId: JOB_SCENE, optionId: PALING });
    expect(JSON.stringify(restored.snapshot())).not.toContain(ROUTE_CLOSE);
    expect(JSON.stringify(restored.snapshot())).not.toContain(WITNESS_CLOSE);
    addRoadStrain(restored);
    moveToArea(restored, WORKS);
    expect(restored.view().serviceOffers.map((offer) => offer.id)).toContain(PALING_REST);
  });

  it("rejects altered event/job proofs, reversed chronology, and an untrusted hash", () => {
    const session = selectStandard(ROUTE_STANDARD);
    session.workLocalJob(JOB, ROUTE_CLOSE);
    const snapshot = session.snapshot();

    const alteredEvent = structuredClone(snapshot);
    const eventProof = alteredEvent.journalEntries.find(
      (entry) => entry.id === `resolve:${EVENT}`,
    )?.localSceneProof;
    if (!eventProof) throw new Error("Expected Station event proof.");
    eventProof.optionId = WITNESS_STANDARD;
    expect(() => OverworldSession.restore(WORLD, alteredEvent)).toThrow(
      /canonical option copy|accepted decision proof|earlier event|requirements/i,
    );

    const alteredJob = structuredClone(snapshot);
    const jobProof = alteredJob.journalEntries.find(
      (entry) => entry.id === `job:${JOB}`,
    )?.localSceneProof;
    if (!jobProof) throw new Error("Expected Cade job proof.");
    jobProof.optionId = WITNESS_CLOSE;
    expect(() => OverworldSession.restore(WORLD, alteredJob)).toThrow(
      /accepted decision proof|requirements/i,
    );

    const reversed = structuredClone(snapshot);
    const eventIndex = reversed.journalEntries.findIndex(
      (entry) => entry.id === `resolve:${EVENT}`,
    );
    const jobIndex = reversed.journalEntries.findIndex((entry) => entry.id === `job:${JOB}`);
    const [event] = reversed.journalEntries.splice(eventIndex, 1);
    reversed.journalEntries.splice(jobIndex, 0, event!);
    expect(() => OverworldSession.restore(WORLD, reversed)).toThrow(
      /earlier event|newest-first|requirements/i,
    );

    const untrusted = structuredClone(snapshot);
    untrusted.worldHash = "f".repeat(64);
    expect(() => OverworldSession.restore(WORLD, untrusted)).toThrow(/different world manifest/i);
  });
});
