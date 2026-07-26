/**
 * Campus's return-evidence mandate is an authored post-Wolf event. Its exact
 * proof adds one Archive Query method without displacing either base method.
 */
import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import { createToolApi } from "../../src/mcp/tools.js";
import {
  AUTHORED_ALBANY_CAMPUS_EVENT_PREDECESSOR_WORLD_HASH,
  authoredLocalEventLegacyOptionId,
} from "../../src/world/local_event_scene_legacy.js";
import type { OverworldManifest } from "../../src/world/overworld.js";
import { OverworldSession } from "../../src/world/session.js";
import { planOverworldEventResolution } from "../../src/world/session_event_resolution.js";
import { OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH } from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { OverworldSession as UiOverworldSession } from "../../ui/src/overworld.js";
import { exactAlbanyCampusEventPredecessor } from "../regression/fixtures/historical_overworlds.js";

const WORLD = loadOverworldManifest(process.cwd());
const REGION = "Capital / Mohawk";
const CAMPUS = "albany_city__campus";
const CAMPUS_POI = "albany_city__campus__poi";
const CAMPUS_CONTACT = "albany_city__campus__contact";
const EVENT = "albany_city__campus__event";
const EVENT_SCENE = "albany:campus-return-evidence-mandate";
const CLINIC = "prioritize_clinic_exposure_thresholds";
const PROVENANCE = "preserve_traceable_route_provenance";
const JOB = "albany_city__campus__job";
const WARNING = "issue_calibrated_road_warning";
const ARCHIVE = "prepare_traceable_field_archive";
const THRESHOLD_CARD = "issue_clinic_threshold_card";
const ROUTE_DIGEST = "index_traceable_route_digest";
const CLINIC_REST = "albany:campus_clinic_threshold_card_rest";
const CLINIC_DROVER_REST = "albany:campus_clinic_threshold_card_drover_rest";
const DIGEST_RESUPPLY = "albany:campus_traceable_route_digest_resupply";
const DIGEST_MOBILE_RESUPPLY = "albany:campus_traceable_route_digest_mobile_resupply";
const FULL = { compact_context: false, compact_result: false } as const;

function moveToArea(session: OverworldSession, target: string, world = WORLD): void {
  for (let attempts = 0; !session.view().areas.some((area) => area.id === target); attempts += 1) {
    if (attempts >= 6) throw new Error(`Could not map Albany route to ${target}.`);
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

function openedAlbany(
  options: {
    sourceId?: string;
    preparationId?: string;
    reliefAllocationId?: string;
  } = {},
  world: OverworldManifest = WORLD,
): OverworldSession {
  const session = new OverworldSession(world);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(world.opening_registration!.contact);
  session.chooseJourneyStory("albany:ledger_advocate");
  session.chooseJourneyStory("albany:oath_full_compact_duty");
  session.chooseJourneyStory(options.sourceId ?? "albany:source_rowan_civic_docket");
  moveToArea(session, world.opening_preparation!.area, world);
  session.chooseJourneyStory(options.preparationId ?? "albany:prep_works_fortification");
  if (session.view().departureInteractions[0]?.kind === "relief_allocation") {
    session.chooseJourneyStory(options.reliefAllocationId ?? "albany:relief_cade_fodder");
  }
  return session;
}

function returnedToCampus(
  options: {
    sourceId?: string;
    preparationId?: string;
    reliefAllocationId?: string;
    inspect?: boolean;
  } = {},
  world: OverworldManifest = WORLD,
): OverworldSession {
  const session = openedAlbany(options, world);
  const wolf = session.view().quests.find((quest) => quest.id === "wolf_winter");
  if (!wolf) throw new Error("The Albany opening must expose Wolf-Winter.");
  moveToArea(session, wolf.area, world);
  session.scoutPoi("albany_city__transport_hub__poi");
  session.talkToCharacter("albany_city__transport_hub__contact");
  session.startQuest(wolf.id, "albany:wolf_approach_sheltered_stockway");
  session.completeQuest(wolf.id, {
    endingId: "ending_held",
    endingTitle: "The Byre Held",
    death: false,
  });
  session.chooseJourney("continue");
  session.chooseJourneyStory("send_wardens_north");
  moveToArea(session, CAMPUS, world);
  if (options.inspect ?? true) {
    session.scoutPoi(CAMPUS_POI);
    session.talkToCharacter(CAMPUS_CONTACT);
    session.investigateEvent(EVENT);
  }
  return session;
}

function expectedJobChoices(optional?: string): string[][] {
  return [WARNING, ARCHIVE, ...(optional ? [optional] : [])].map((optionId) => [JOB, optionId]);
}

function selectMandate(
  optionId: typeof CLINIC | typeof PROVENANCE,
  options: Parameters<typeof returnedToCampus>[0] = {},
): OverworldSession {
  const session = returnedToCampus(options);
  session.resolveEvent(EVENT, optionId);
  return session;
}

describe("Albany Campus return-evidence mandate", () => {
  it("is inaccessible before Wolf-Winter and requires the normal Scout, Talk, and Investigate sequence", () => {
    const campusEvent = WORLD.local_events.find((event) => event.id === EVENT);
    if (!campusEvent) throw new Error("Expected the Campus return event.");
    expect(campusEvent.authored_scene?.requires_completed_quests).toEqual(["wolf_winter"]);
    const prerequisiteEntries = [
      {
        id: `scout:${CAMPUS_POI}`,
        kind: "poi" as const,
        town: "Albany City",
        title: "Scouted Campus",
        text: "Scouted Campus",
        recordedAt: "Day 1, 10:00",
      },
      {
        id: `talk:${CAMPUS_CONTACT}`,
        kind: "contact" as const,
        town: "Albany City",
        title: "Talked with Blair",
        text: "Talked with Blair",
        recordedAt: "Day 1, 10:10",
      },
      {
        id: `investigate:${EVENT}`,
        kind: "event" as const,
        town: "Albany City",
        title: "Investigated Campus",
        text: "Investigated Campus",
        recordedAt: "Day 1, 10:20",
      },
    ];
    expect(() =>
      planOverworldEventResolution({
        eventId: EVENT,
        optionId: CLINIC,
        eventsById: new Map([[EVENT, campusEvent]]),
        currentTownId: "albany_city",
        currentTownName: "Albany City",
        currentRegion: REGION,
        currentAreaId: CAMPUS,
        completedQuestIds: new Set(),
        resolvedEventIds: new Set(),
        journalEntries: new Map(prerequisiteEntries.map((entry) => [entry.id, entry])),
        poisByArea: new Map([
          [CAMPUS, WORLD.points_of_interest.filter((poi) => poi.area === CAMPUS)],
        ]),
        charactersByArea: new Map([
          [CAMPUS, WORLD.characters.filter((contact) => contact.area === CAMPUS)],
        ]),
      }),
    ).toThrow(/complet(?:e|ing).*wolf_winter/i);

    const returned = returnedToCampus({ inspect: false });
    expect(returned.view().events.map((event) => event.id)).toContain(EVENT);
    returned.investigateEvent(EVENT);
    expect(() => returned.resolveEvent(EVENT, CLINIC)).toThrow(/scout|poi/i);
    returned.scoutPoi(CAMPUS_POI);
    expect(() => returned.resolveEvent(EVENT, CLINIC)).toThrow(/talk|contact/i);
    returned.talkToCharacter(CAMPUS_CONTACT);
    expect(returned.view().events.find((event) => event.id === EVENT)?.title).toContain(
      "Return Evidence Mandate",
    );
    expect(returned.view().eventChoices).toEqual([
      [EVENT, CLINIC],
      [EVENT, PROVENANCE],
    ]);
  });

  it.each([
    [CLINIC, THRESHOLD_CARD, ROUTE_DIGEST],
    [PROVENANCE, ROUTE_DIGEST, THRESHOLD_CARD],
  ] as const)(
    "persists %s exactly and exposes its matching optional method without replacing both base methods",
    (mandate, matching, forbidden) => {
      const session = returnedToCampus();
      expect(session.view().jobChoices).toEqual(expectedJobChoices());
      const before = session.snapshot();
      const resolved = session.resolveEvent(EVENT, mandate);
      expect(resolved.minutes).toBe(20);
      expect(session.snapshot().minutes - before.minutes).toBe(20);
      expect(session.view().regionRenown[REGION]).toBe(
        (before.regionRenown.find(([id]) => id === REGION)?.[1] ?? 0) + 1,
      );
      expect(
        session.snapshot().journalEntries.find((entry) => entry.id === `resolve:${EVENT}`)
          ?.localSceneProof,
      ).toMatchObject({ sceneId: EVENT_SCENE, optionId: mandate });
      expect(session.view().jobChoices).toEqual(expectedJobChoices(matching));
      expect(session.compactView().job_choices).toEqual(expectedJobChoices(matching));
      expect(JSON.stringify(session.view().jobs)).not.toContain(forbidden);
      expect(OverworldSession.restore(WORLD, session.snapshot()).snapshot()).toEqual(
        session.snapshot(),
      );
    },
  );

  it("projects the selected mandate and legal methods truthfully through full, compact, UI, and MCP views", () => {
    const session = returnedToCampus();
    const eventChoices = [
      [EVENT, CLINIC],
      [EVENT, PROVENANCE],
    ];
    const jobChoices = expectedJobChoices(THRESHOLD_CARD);
    expect(session.view().eventChoices).toEqual(eventChoices);
    expect(session.compactView().event_choices).toEqual(eventChoices);
    expect(session.compactView().event_scenes?.[0]?.slice(0, 2)).toEqual([EVENT, EVENT_SCENE]);
    expect(
      session
        .view()
        .events.find((candidate) => candidate.id === EVENT)
        ?.authored_scene?.options.map((option) => option.preview),
    ).toEqual([
      expect.stringMatching(/20-minute clinic threshold card.*2 renown.*recovery cot/i),
      expect.stringMatching(/45-minute route digest.*3 renown.*resupply cache/i),
    ]);

    expect(UiOverworldSession.restore(WORLD, session.snapshot()).view().eventChoices).toEqual(
      eventChoices,
    );
    const api = createToolApi({ root: process.cwd() });
    const unresolvedFull = api.restore_overworld_session({ ...FULL, snapshot: session.snapshot() });
    const unresolvedCompact = api.restore_overworld_session({
      compact_context: true,
      snapshot: session.snapshot(),
    });
    expect(unresolvedFull.observation.eventChoices).toEqual(eventChoices);
    expect(unresolvedCompact.context.event_choices).toEqual(eventChoices);

    session.resolveEvent(EVENT, CLINIC);
    expect(UiOverworldSession.restore(WORLD, session.snapshot()).view().jobChoices).toEqual(
      jobChoices,
    );
    const full = api.restore_overworld_session({ ...FULL, snapshot: session.snapshot() });
    const compact = api.restore_overworld_session({
      compact_context: true,
      snapshot: session.snapshot(),
    });
    expect(full.observation.jobChoices).toEqual(jobChoices);
    expect(compact.context.job_choices).toEqual(jobChoices);
    expect(full.observation.eventChoices).toEqual([]);
    expect(compact.context.event_choices).toBeUndefined();
  });

  it("keeps both mandate paths as real time-versus-standing trades against their base service family", () => {
    const event = WORLD.local_events.find((candidate) => candidate.id === EVENT);
    const job = WORLD.local_jobs.find((candidate) => candidate.id === JOB);
    const eventTerms = new Map(
      event?.authored_scene?.options.map((option) => [option.id, option.terms]) ?? [],
    );
    const jobTerms = new Map(
      job?.authored_scene?.options.map((option) => [option.id, option.terms]) ?? [],
    );
    const pathTerms = (mandate: string, method: string) => ({
      minutes: eventTerms.get(mandate)!.minutes + jobTerms.get(method)!.minutes,
      renown: eventTerms.get(mandate)!.renown + jobTerms.get(method)!.renown,
    });

    const clinicPath = pathTerms(CLINIC, THRESHOLD_CARD);
    const warning = jobTerms.get(WARNING)!;
    expect(clinicPath).toEqual({ minutes: 40, renown: 3 });
    expect(clinicPath.minutes).toBeGreaterThan(warning.minutes);
    expect(clinicPath.renown).toBeGreaterThan(warning.renown);

    const provenancePath = pathTerms(PROVENANCE, ROUTE_DIGEST);
    const archive = jobTerms.get(ARCHIVE)!;
    expect(provenancePath).toEqual({ minutes: 65, renown: 4 });
    expect(provenancePath.minutes).toBeLessThan(archive.minutes);
    expect(provenancePath.renown).toBeLessThan(archive.renown);
  });

  it.each([
    ["clinic", CLINIC, THRESHOLD_CARD, {}, CLINIC_REST, "rest"],
    [
      "clinic Drover consolidation",
      CLINIC,
      THRESHOLD_CARD,
      { preparationId: "albany:prep_drover_route" },
      CLINIC_DROVER_REST,
      "rest",
    ],
    ["route", PROVENANCE, ROUTE_DIGEST, {}, DIGEST_RESUPPLY, "resupply"],
    [
      "route mobile consolidation",
      PROVENANCE,
      ROUTE_DIGEST,
      { reliefAllocationId: "albany:relief_mobile_reserve" },
      DIGEST_MOBILE_RESUPPLY,
      "resupply",
    ],
  ] as const)(
    "creates only the correct exclusive Campus service for %s",
    (_label, mandate, method, setup, serviceId, action) => {
      const session = selectMandate(mandate, setup);
      session.workLocalJob(JOB, method);
      expect(
        session.snapshot().journalEntries.find((entry) => entry.id === `job:${JOB}`)
          ?.localSceneProof,
      ).toMatchObject({ optionId: method });
      const offers = session.view().serviceOffers.filter((offer) => offer.action === action);
      expect(offers).toHaveLength(1);
      expect(offers[0]).toMatchObject({ id: serviceId, action, minutes: 15 });
      if (action === "rest") {
        expect(session.restAtTown()).toMatchObject({ changed: true, minutes: 15, fatigueAfter: 0 });
      } else {
        expect(session.resupplyAtTown()).toMatchObject({
          changed: true,
          minutes: 15,
          suppliesAfter: 8,
        });
      }
      expect(
        OverworldSession.restore(WORLD, session.snapshot())
          .view()
          .serviceOffers.map((offer) => offer.id),
      ).not.toContain(serviceId);
    },
  );

  it("keeps a neutral legacy event marker neutral while allowing neither optional method", () => {
    const predecessor = exactAlbanyCampusEventPredecessor(WORLD);
    expect(hashState(predecessor)).toBe(AUTHORED_ALBANY_CAMPUS_EVENT_PREDECESSOR_WORLD_HASH);
    expect(hashState(WORLD)).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH);
    const legacyWorld = returnedToCampus({ inspect: false }, predecessor);
    legacyWorld.scoutPoi(CAMPUS_POI);
    legacyWorld.talkToCharacter(CAMPUS_CONTACT);
    legacyWorld.investigateEvent(EVENT);
    legacyWorld.resolveEvent(EVENT);
    const restored = OverworldSession.restore(WORLD, legacyWorld.snapshot());
    expect(restored.view().jobChoices).toEqual(expectedJobChoices());
    expect(JSON.stringify(restored.snapshot())).not.toContain(THRESHOLD_CARD);
    expect(JSON.stringify(restored.snapshot())).not.toContain(ROUTE_DIGEST);
    expect(
      restored.snapshot().journalEntries.find((entry) => entry.id === `resolve:${EVENT}`)
        ?.localSceneProof,
    ).toMatchObject({
      sceneId: EVENT_SCENE,
      optionId: authoredLocalEventLegacyOptionId(
        AUTHORED_ALBANY_CAMPUS_EVENT_PREDECESSOR_WORLD_HASH,
      ),
      sourceWorldHash: AUTHORED_ALBANY_CAMPUS_EVENT_PREDECESSOR_WORLD_HASH,
    });
  });

  it("preserves a native base Archive Query completion through the Campus predecessor migration", () => {
    const predecessor = exactAlbanyCampusEventPredecessor(WORLD);
    const legacyWorld = returnedToCampus({ inspect: false }, predecessor);
    legacyWorld.scoutPoi(CAMPUS_POI);
    legacyWorld.talkToCharacter(CAMPUS_CONTACT);
    legacyWorld.investigateEvent(EVENT);
    legacyWorld.resolveEvent(EVENT);
    legacyWorld.workLocalJob(JOB, WARNING);

    const restored = OverworldSession.restore(WORLD, legacyWorld.snapshot());
    expect(
      restored.snapshot().journalEntries.find((entry) => entry.id === `job:${JOB}`)
        ?.localSceneProof,
    ).toMatchObject({ optionId: WARNING });
    expect(restored.view().serviceOffers.map((offer) => offer.id)).toContain(
      "albany:campus_calibrated_warning_rest",
    );
    expect(JSON.stringify(restored.snapshot())).not.toContain(THRESHOLD_CARD);
    expect(JSON.stringify(restored.snapshot())).not.toContain(ROUTE_DIGEST);
  });

  it.each([
    [
      "current Relief Protocol preparation copy",
      {
        preparationId: "albany:prep_relief_protocol",
      },
    ],
    [
      "current Frost-jamb source and Works preparation copy",
      {
        sourceId: "albany:source_hayden_frost_report",
        preparationId: "albany:prep_works_fortification",
      },
    ],
  ] as const)(
    "does not replay an older exact-copy normalizer over the Campus predecessor's %s",
    (_label, setup) => {
      const predecessor = exactAlbanyCampusEventPredecessor(WORLD);
      const legacyWorld = returnedToCampus({ ...setup, inspect: false }, predecessor);
      legacyWorld.scoutPoi(CAMPUS_POI);
      legacyWorld.talkToCharacter(CAMPUS_CONTACT);
      legacyWorld.investigateEvent(EVENT);
      legacyWorld.resolveEvent(EVENT);

      const restored = OverworldSession.restore(WORLD, legacyWorld.snapshot());
      expect(restored.snapshot().worldHash).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH);
      expect(
        restored.snapshot().journalEntries.find((entry) => entry.id === `resolve:${EVENT}`)
          ?.localSceneProof,
      ).toMatchObject({
        optionId: authoredLocalEventLegacyOptionId(
          AUTHORED_ALBANY_CAMPUS_EVENT_PREDECESSOR_WORLD_HASH,
        ),
      });
    },
  );

  it("rejects altered event/job proof, reversed event chronology, and an untrusted manifest hash", () => {
    const session = selectMandate(CLINIC);
    session.workLocalJob(JOB, THRESHOLD_CARD);
    const snapshot = session.snapshot();

    const alteredEvent = structuredClone(snapshot);
    const eventProof = alteredEvent.journalEntries.find(
      (entry) => entry.id === `resolve:${EVENT}`,
    )?.localSceneProof;
    if (!eventProof) throw new Error("Expected Campus event proof.");
    eventProof.optionId = PROVENANCE;
    expect(() => OverworldSession.restore(WORLD, alteredEvent)).toThrow(
      /accepted decision proof|earlier event|requirements/i,
    );

    const alteredJob = structuredClone(snapshot);
    const jobProof = alteredJob.journalEntries.find(
      (entry) => entry.id === `job:${JOB}`,
    )?.localSceneProof;
    if (!jobProof) throw new Error("Expected Campus job proof.");
    jobProof.optionId = ROUTE_DIGEST;
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
