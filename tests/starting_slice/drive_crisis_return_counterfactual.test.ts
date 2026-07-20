/**
 * SS-F10 campaign proof. Hold Albany's complete opening and Wolf-Winter start
 * constant, vary only the authored drive crisis result, and prove that wound,
 * cattle, reserve, ally memory, named-NPC response, and bounded services remain
 * distinct through full/compact/UI views and strict save replay.
 */
import { describe, expect, it } from "vitest";

import { createToolApi } from "../../src/mcp/tools.js";
import { OverworldSession } from "../../src/world/session.js";
import type { OverworldSessionSnapshot } from "../../src/world/session_snapshot.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { OverworldSession as UiOverworldSession } from "../../ui/src/overworld.js";

const WORLD = loadOverworldManifest(process.cwd());
const REGISTRATION = WORLD.opening_registration!;
const LEAD = WORLD.opening_lead_source!;
const PREPARATION = WORLD.opening_preparation!;
const ALLY = WORLD.opening_ally!;
const WOLF = WORLD.quests.find((quest) => quest.id === "wolf_winter")!;

const ACCEPT = "albany:ally_june_cattle_first";
const SOLO = "albany:ally_travel_solo";
const RESIDENT_SHELTER = "albany:relief_resident_shelter";
const JUNE = "albany:june_pike";
const PROMISE = "albany:promise_june_cattle_first";
const STATION = "albany_city__transport_hub";
const GREENWAY = "albany_city__greenway";
const STATION_REST = "albany:wolf_drive_reserve_returned_station_rest";
const GREENWAY_RESUPPLY = "albany:wolf_drive_whole_herd_greenway_resupply";
const WOUND = "wound:wolf_winter_byre_mouth_gate";

const OUTCOMES = {
  ending_drive_cattle_wounded: {
    title: "The Herd Out, Rider Hurt",
    health: 24,
    wounds: [{ woundId: WOUND, severity: 2, treatment: "untreated" }],
    facts: [
      "fact:wolf_winter_cattle_whole",
      "fact:wolf_winter_courier_wounded",
      "fact:wolf_winter_drive_reserve_returned",
      "fact:wolf_winter_outer_line_abandoned",
      "fact:wolf_winter_pack_driven_alive",
      "fact:wolf_winter_people_safe",
      "fact:wolf_winter_steading_evacuated",
    ],
    stationService: STATION_REST,
    greenwayService: GREENWAY_RESUPPLY,
    juneMemory: "albany:memory_june_drive_herd_out_rider_wounded",
    juneCopy: /whole herd[^]*bound shoulder[^]*untreated wound/i,
    emeryCopy: /all three wolves[^]*whole herd[^]*untreated gate wound/i,
  },
  ending_drive_person_cattle_lost: {
    title: "The People Out, Cattle Lost",
    health: 30,
    wounds: [],
    facts: [
      "fact:wolf_winter_cattle_scattered",
      "fact:wolf_winter_drive_reserve_returned",
      "fact:wolf_winter_outer_line_abandoned",
      "fact:wolf_winter_pack_driven_alive",
      "fact:wolf_winter_people_prioritized",
      "fact:wolf_winter_people_safe",
      "fact:wolf_winter_steading_evacuated",
    ],
    stationService: STATION_REST,
    greenwayService: null,
    juneMemory: "albany:memory_june_drive_cattle_line_overrun",
    juneCopy: /every person safe[^]*two cattle still missing/i,
    emeryCopy: /every person safe[^]*two cattle still missing/i,
  },
  ending_drive_reserve_spent: {
    title: "The Steading Evacuated, Reserve Spent",
    health: 30,
    wounds: [],
    facts: [
      "fact:wolf_winter_cattle_whole",
      "fact:wolf_winter_drive_reserve_spent",
      "fact:wolf_winter_outer_line_abandoned",
      "fact:wolf_winter_pack_driven_alive",
      "fact:wolf_winter_people_safe",
      "fact:wolf_winter_steading_evacuated",
    ],
    stationService: null,
    greenwayService: GREENWAY_RESUPPLY,
    juneMemory: "albany:memory_june_drive_signal_spent_herd_out",
    juneCopy: /whole herd[^]*signal-and-rope rig cut apart/i,
    emeryCopy: /whole herd[^]*signal-and-rope rig left cut apart/i,
  },
} as const;

type DriveEndingId = keyof typeof OUTCOMES;

function moveToArea(session: OverworldSession, targetAreaId: string): void {
  const start = session.view().currentArea?.id;
  if (!start || start === targetAreaId) return;
  const edges = WORLD.area_edges.filter((edge) => edge.home === session.view().current.id);
  const queue = [start];
  const previous = new Map<string, string>();
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    if (current === targetAreaId) break;
    for (const edge of edges.filter(
      (candidate) => candidate.from_area === current || candidate.to_area === current,
    )) {
      const next = edge.from_area === current ? edge.to_area : edge.from_area;
      if (next === start || previous.has(next)) continue;
      previous.set(next, current);
      queue.push(next);
    }
  }
  const path: string[] = [];
  for (let cursor = targetAreaId; cursor !== start; ) {
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

function wolfBoundary(allyOptionId: typeof ACCEPT | typeof SOLO): OverworldSessionSnapshot {
  const session = new OverworldSession(WORLD);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(REGISTRATION.contact);
  session.chooseJourneyStory(REGISTRATION.profiles[0]!.id);
  session.chooseJourneyStory("albany:oath_limited_aid_only");
  session.chooseJourneyStory(LEAD.options[0]!.id);
  moveToArea(session, PREPARATION.area);
  session.chooseJourneyStory(PREPARATION.profiles[0]!.id);
  session.chooseJourneyStory(RESIDENT_SHELTER);
  moveToArea(session, "albany_city__market");
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter("albany_city__market__contact");
  const marketSite = session.view().sites.find((site) => site.area === "albany_city__market");
  if (!marketSite) throw new Error("Expected Jamie's Market discovery site.");
  session.exploreSite(marketSite.id);
  moveToArea(session, ALLY.area);
  session.talkToCharacter(ALLY.contact);
  session.chooseJourneyStory(allyOptionId);
  session.startQuest(WOLF.id, "albany:wolf_approach_sheltered_stockway");
  return session.snapshot();
}

function completeFrom(
  boundary: OverworldSessionSnapshot,
  endingId: DriveEndingId,
): OverworldSession {
  const session = OverworldSession.restore(WORLD, boundary);
  session.completeQuest(WOLF.id, {
    endingId,
    endingTitle: OUTCOMES[endingId].title,
    death: false,
  });
  return session;
}

function promiseStatus(session: OverworldSession): string | undefined {
  return session.snapshot().character.promises.find((promise) => promise.promiseId === PROMISE)
    ?.status;
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

describe("SS-F10 — drive crisis survives the truthful Albany return", () => {
  it("keeps three outcomes distinct when every prior campaign decision is byte-identical", () => {
    const boundary = wolfBoundary(SOLO);
    const boundaryBefore = structuredClone(boundary);

    for (const [endingId, expected] of Object.entries(OUTCOMES) as [
      DriveEndingId,
      (typeof OUTCOMES)[DriveEndingId],
    ][]) {
      const session = completeFrom(boundary, endingId);
      expect(session.snapshot().questOutcomes).toContainEqual([WOLF.id, endingId]);
      expect(session.campaignWorldFactIds()).toEqual(expected.facts);
      expect(session.snapshot().character.health).toEqual({ current: expected.health, max: 30 });
      expect(session.snapshot().character.wounds).toEqual(expected.wounds);
      expect(session.view().character.health).toEqual({ current: expected.health, max: 30 });
      expect(session.view().character.wounds).toEqual(expected.wounds);
      expect(session.compactView().character[1]).toEqual([expected.health, 30]);
      expect(session.compactView().character[5]).toEqual(
        expected.wounds.map((wound) => [wound.woundId, wound.severity, wound.treatment]),
      );
      expect(session.campaignWorldFactIds()).not.toContain("fact:wolf_winter_byre_held");
      expect(session.campaignWorldFactIds()).not.toContain("fact:wolf_winter_pack_diverted_alive");

      expect(session.view().serviceOffers.map((offer) => offer.id)).toEqual(
        expected.stationService ? [expected.stationService] : [],
      );
      session.chooseJourney("continue");
      session.chooseJourneyStory("send_wagon_to_cade");
      moveToArea(session, GREENWAY);
      expect(session.view().serviceOffers.map((offer) => offer.id)).toEqual(
        expected.greenwayService ? [expected.greenwayService] : [],
      );
      expect(
        session
          .view()
          .characters.find((character) => character.id === "albany_city__greenway__contact")
          ?.summary,
      ).toMatch(expected.emeryCopy);
    }

    expect(boundary).toEqual(boundaryBefore);
  });

  it("lets June act independently and remembers each bloodless crisis without breaking her bond", () => {
    const boundary = wolfBoundary(ACCEPT);
    expect(boundary.character.companions).toContain(JUNE);

    for (const [endingId, expected] of Object.entries(OUTCOMES) as [
      DriveEndingId,
      (typeof OUTCOMES)[DriveEndingId],
    ][]) {
      const session = completeFrom(boundary, endingId);
      expect(session.snapshot().character.companions).toContain(JUNE);
      expect(promiseStatus(session)).toBe("kept");
      expect(
        session.snapshot().character.relationships.find((entry) => entry.npcId === JUNE)?.memories,
      ).toContain(expected.juneMemory);
      expect(
        session.view().characters.find((character) => character.id === ALLY.contact)?.summary,
      ).toMatch(expected.juneCopy);
    }
  });

  it("attributes June's held-byre break to the first wolf death, not combat entry", () => {
    const session = OverworldSession.restore(WORLD, wolfBoundary(ACCEPT));
    session.completeQuest(WOLF.id, {
      endingId: "ending_held",
      endingTitle: "The Byre Held",
      death: false,
    });

    expect(session.snapshot().character.companions).not.toContain(JUNE);
    expect(promiseStatus(session)).toBe("broken");
    expect(
      session.view().characters.find((character) => character.id === ALLY.contact)?.summary,
    ).toMatch(/first wolf death[^]*before she could take the lower rail/i);
    expect(
      session.view().characters.find((character) => character.id === ALLY.contact)?.summary,
    ).not.toMatch(/crossed into combat[^]*ending the cattle-first field agreement/i);
  });

  it("round-trips the wound through core, compact, UI, and MCP projections without charging twice", () => {
    const wounded = completeFrom(wolfBoundary(ACCEPT), "ending_drive_cattle_wounded");
    const snapshot = wounded.snapshot();

    const restored = OverworldSession.restore(WORLD, snapshot);
    expect(restored.snapshot()).toEqual(snapshot);
    expect(restored.snapshot().character.health).toEqual({ current: 24, max: 30 });
    expect(restored.snapshot().character.wounds).toEqual([
      { woundId: WOUND, severity: 2, treatment: "untreated" },
    ]);
    expect(OverworldSession.restore(WORLD, restored.snapshot()).snapshot()).toEqual(snapshot);
    expect(UiOverworldSession.restore(WORLD, snapshot).view().character).toEqual(
      restored.view().character,
    );

    const api = createToolApi({ root: process.cwd() });
    const mcp = api.restore_overworld_session({
      compact_context: false,
      compact_result: false,
      snapshot,
    });
    expect(mcp.observation.character.health).toEqual({ current: 24, max: 30 });
    expect(mcp.observation.character.wounds).toEqual([
      { woundId: WOUND, severity: 2, treatment: "untreated" },
    ]);
    const compactMcp = api.restore_overworld_session({
      compact_context: true,
      compact_result: true,
      snapshot,
    });
    expect(compactMcp.snapshot_hash).toBe(mcp.snapshot_hash);
    expect(compactMcp.context.character[1]).toEqual([24, 30]);
    expect(compactMcp.context.character[5]).toEqual([[WOUND, 2, "untreated"]]);
  });

  it("rejects forged health, wound, and outcome evidence at the replay boundary", () => {
    const snapshot = completeFrom(wolfBoundary(SOLO), "ending_drive_cattle_wounded").snapshot();

    const wrongHealth = structuredClone(snapshot);
    wrongHealth.character.health.current = 25;
    expect(() => OverworldSession.restore(WORLD, wrongHealth)).toThrow(
      /campaign character does not match replayed quest consequences/i,
    );

    const missingWound = structuredClone(snapshot);
    missingWound.character.wounds = [];
    expect(() => OverworldSession.restore(WORLD, missingWound)).toThrow(
      /campaign character does not match replayed quest consequences/i,
    );

    const changedWound = structuredClone(snapshot);
    changedWound.character.wounds[0]!.treatment = "stabilized";
    expect(() => OverworldSession.restore(WORLD, changedWound)).toThrow(
      /campaign character does not match replayed quest consequences/i,
    );

    const changedOutcome = structuredClone(snapshot);
    changedOutcome.questOutcomes = [[WOLF.id, "ending_drive_person_cattle_lost"]];
    expect(() => OverworldSession.restore(WORLD, changedOutcome)).toThrow(
      /quest completion|campaign character|outcome/i,
    );
  });

  it("consumes both bounded wound-branch services while the untreated wound remains", () => {
    const session = completeFrom(wolfBoundary(SOLO), "ending_drive_cattle_wounded");
    session.chooseJourney("continue");
    session.chooseJourneyStory("send_wagon_to_cade");
    addRoadStrain(session);
    moveToArea(session, STATION);

    expect(session.view().serviceOffers.map((offer) => offer.id)).toEqual([STATION_REST]);
    const rested = session.restAtTown();
    expect(rested).toMatchObject({ action: "rest", changed: true, minutes: 15 });
    expect(rested.message).toMatch(
      /restores fatigue only[^]*neither creates nor treats a lasting wound/i,
    );
    expect(session.snapshot().character.health).toEqual({ current: 24, max: 30 });
    expect(session.snapshot().character.wounds).toContainEqual({
      woundId: WOUND,
      severity: 2,
      treatment: "untreated",
    });

    moveToArea(session, GREENWAY);
    expect(session.view().serviceOffers.map((offer) => offer.id)).toEqual([GREENWAY_RESUPPLY]);
    const supplied = session.resupplyAtTown();
    expect(supplied).toMatchObject({ action: "resupply", changed: true, minutes: 15 });
    expect(supplied.message).toMatch(/bloodless drive[^]*whole herd/i);
    const consumed = session.snapshot();
    expect(consumed.journalEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "service", serviceRuleId: STATION_REST }),
        expect.objectContaining({ kind: "service", serviceRuleId: GREENWAY_RESUPPLY }),
      ]),
    );
    expect(OverworldSession.restore(WORLD, consumed).snapshot()).toEqual(consumed);
  });
});
