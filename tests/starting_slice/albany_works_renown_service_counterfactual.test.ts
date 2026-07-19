import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import { createToolApi } from "../../src/mcp/tools.js";
import type { OverworldManifest } from "../../src/world/overworld.js";
import { OverworldSession } from "../../src/world/session.js";
import { timeLabel } from "../../src/world/session_journal_codec.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { OverworldSession as UiOverworldSession } from "../../ui/src/overworld.js";

const WORLD = loadOverworldManifest(process.cwd());
const REGION = "Capital / Mohawk";
const WORKS_AREA = "albany_city__industrial";
const CIVIC_AREA = "albany_city__civic_core";
const WORKS_JOB = "albany_city__industrial__job";
const PROTECT = "protect_trapped_public_shift";
const INVENTORY = "inventory_outbound_cold_set_stock";
const SERVICE = "albany:works_public_shift_civic_rest";
const FULL = { compact_context: false, compact_result: false } as const;

function moveToArea(session: OverworldSession, targetAreaId: string): void {
  const startAreaId = session.view().currentArea?.id;
  if (!startAreaId || startAreaId === targetAreaId) return;
  const edges = WORLD.area_edges.filter((edge) => edge.home === session.view().current.id);
  const queue = [startAreaId];
  const previous = new Map<string, string>();
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    if (current === targetAreaId) break;
    for (const edge of edges.filter(
      (candidate) => candidate.from_area === current || candidate.to_area === current,
    )) {
      const next = edge.from_area === current ? edge.to_area : edge.from_area;
      if (next === startAreaId || previous.has(next)) continue;
      previous.set(next, current);
      queue.push(next);
    }
  }
  const path: string[] = [];
  for (let cursor = targetAreaId; cursor !== startAreaId; ) {
    const prior = previous.get(cursor);
    if (!prior) throw new Error(`No Albany area route reaches ${targetAreaId}.`);
    path.unshift(cursor);
    cursor = prior;
  }
  for (const areaId of path) {
    const exit = session.view().areaExits.find((candidate) => candidate.destination.id === areaId);
    if (!exit) throw new Error(`Albany does not expose the next area ${areaId}.`);
    session.moveArea(exit.id);
  }
}

function returnedToWorks(): OverworldSession {
  const session = new OverworldSession(WORLD);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(WORLD.opening_registration!.contact);
  session.chooseJourneyStory("albany:ledger_advocate");
  session.chooseJourneyStory("albany:oath_full_compact_duty");
  session.chooseJourneyStory("albany:source_rowan_civic_docket");
  session.chooseJourneyStory("albany:prep_works_fortification");

  const wolf = session.view().quests.find((quest) => quest.id === "wolf_winter");
  if (!wolf) throw new Error("The Albany opening must expose Wolf-Winter.");
  moveToArea(session, wolf.area);
  if (session.journey().storyChoice?.kind === "relief_allocation") {
    session.chooseJourneyStory("albany:relief_cade_fodder");
  }

  session.scoutPoi("albany_city__transport_hub__poi");
  session.talkToCharacter("albany_city__transport_hub__contact");

  // The selected lead already makes Wolf-Winter legal. Skipping the optional
  // exploration site keeps the counterfactual at Wolf's exact +8 renown.
  session.startQuest(wolf.id, "albany:wolf_approach_sheltered_stockway");
  session.completeQuest(wolf.id, {
    endingId: "ending_held",
    endingTitle: "The Byre Held",
    death: false,
  });
  session.chooseJourney("continue");
  session.chooseJourneyStory("send_wardens_north");
  expect(session.view().regionRenown[REGION]).toBe(8);

  moveToArea(session, WORKS_AREA);
  session.scoutPoi("albany_city__industrial__poi");
  session.talkToCharacter("albany_city__industrial__contact");
  expect(session.view().jobChoices).toEqual([
    [WORKS_JOB, PROTECT],
    [WORKS_JOB, INVENTORY],
  ]);
  return session;
}

function completeWorks(
  optionId: string,
  restBeforeWork = false,
): {
  session: OverworldSession;
  minutesBeforeWork: number;
} {
  const session = returnedToWorks();
  if (restBeforeWork) {
    moveToArea(session, CIVIC_AREA);
    expect(session.restAtTown()).toMatchObject({ changed: true, minutes: 180, fatigueAfter: 0 });
    moveToArea(session, WORKS_AREA);
  }
  const minutesBeforeWork = session.snapshot().minutes;
  session.workLocalJob(WORKS_JOB, optionId);
  moveToArea(session, CIVIC_AREA);
  return { session, minutesBeforeWork };
}

describe("Works renown delayed campaign-service consumer", () => {
  it("lets public-shift standing unlock the Civic rest while inventory standing does not", () => {
    const protectedShift = completeWorks(PROTECT).session;
    const inventory = completeWorks(INVENTORY).session;

    expect(protectedShift.view().regionRenown[REGION]).toBe(13);
    expect(inventory.view().regionRenown[REGION]).toBe(10);
    expect(protectedShift.view().serviceOffers).toContainEqual(
      expect.objectContaining({ id: SERVICE, action: "rest", minutes: 15 }),
    );
    expect(inventory.view().serviceOffers.map((offer) => offer.id)).not.toContain(SERVICE);

    const snapshot = protectedShift.snapshot();
    const expectedOffers = protectedShift.view().serviceOffers;
    expect(OverworldSession.restore(WORLD, snapshot).view().serviceOffers).toEqual(expectedOffers);
    expect(UiOverworldSession.restore(WORLD, snapshot).view().serviceOffers).toEqual(
      expectedOffers,
    );
    expect(protectedShift.compactView().service_offers).toContainEqual([
      SERVICE,
      "rest",
      "Take the Civic Standing Recovery Cot",
      expect.stringContaining("Rowan"),
      15,
    ]);

    const api = createToolApi({ root: process.cwd() });
    expect(api.restore_overworld_session({ ...FULL, snapshot }).observation.serviceOffers).toEqual(
      expectedOffers,
    );
    expect(
      api.restore_overworld_session({ compact_context: true, snapshot }).context.service_offers,
    ).toEqual(protectedShift.compactView().service_offers);
  });

  it("makes inventory's 45-minute saving win when both characters are already rested", () => {
    const protectedShift = completeWorks(PROTECT, true);
    const inventory = completeWorks(INVENTORY, true);
    const protectElapsed =
      protectedShift.session.snapshot().minutes - protectedShift.minutesBeforeWork;
    const inventoryElapsed = inventory.session.snapshot().minutes - inventory.minutesBeforeWork;

    expect(protectedShift.session.view().fatigue).toBe(0);
    expect(inventory.session.view().fatigue).toBe(0);
    expect(protectElapsed - inventoryElapsed).toBe(45);
    expect(protectedShift.session.restAtTown()).toMatchObject({ changed: false, minutes: 0 });
  });

  it("makes the 15-minute standing rest beat ordinary 180-minute recovery at equal fatigue", () => {
    const protectedShift = completeWorks(PROTECT).session;
    const inventory = completeWorks(INVENTORY).session;
    expect(protectedShift.view().fatigue).toBe(10);
    expect(inventory.view().fatigue).toBe(10);

    expect(protectedShift.restAtTown()).toMatchObject({
      changed: true,
      minutes: 15,
      fatigueBefore: 10,
      fatigueAfter: 0,
    });
    expect(inventory.restAtTown()).toMatchObject({
      changed: true,
      minutes: 180,
      fatigueBefore: 10,
      fatigueAfter: 0,
      entry: expect.not.objectContaining({ serviceRuleId: SERVICE }),
    });
    expect(protectedShift.view().serviceOffers.map((offer) => offer.id)).not.toContain(SERVICE);

    const consumed = protectedShift.snapshot();
    expect(consumed.journalEntries).toContainEqual(
      expect.objectContaining({
        serviceRuleId: SERVICE,
        serviceAreaId: CIVIC_AREA,
        serviceBoundary: expect.objectContaining({ areaId: CIVIC_AREA }),
      }),
    );
    expect(
      OverworldSession.restore(WORLD, consumed)
        .view()
        .serviceOffers.map((offer) => offer.id),
    ).not.toContain(SERVICE);
    expect(
      UiOverworldSession.restore(WORLD, consumed)
        .view()
        .serviceOffers.map((offer) => offer.id),
    ).not.toContain(SERVICE);
  });

  it("rejects inflated, backdated, and insufficient boundary evidence", () => {
    const protectedShift = completeWorks(PROTECT).session;
    protectedShift.restAtTown();
    const consumed = protectedShift.snapshot();

    const inflated = structuredClone(consumed);
    const renown = inflated.regionRenown.find(([region]) => region === REGION);
    if (!renown) throw new Error("Expected Capital / Mohawk renown.");
    renown[1] += 1;
    expect(() => OverworldSession.restore(WORLD, inflated)).toThrow(/region renown/i);

    const backdated = structuredClone(consumed);
    const service = backdated.journalEntries.find((entry) => entry.serviceRuleId === SERVICE);
    const works = backdated.journalEntries.find((entry) => entry.id === `job:${WORKS_JOB}`);
    if (!service?.serviceBoundary || !works?.localSceneProof?.boundary) {
      throw new Error("Expected exact service and Works boundaries.");
    }
    const beforeWorks = works.localSceneProof.boundary.minutes - 1;
    service.recordedAt = timeLabel(beforeWorks);
    service.serviceBoundary.minutes = beforeWorks;
    expect(() => OverworldSession.restore(WORLD, backdated)).toThrow(
      /newest-first|boundary|time does not match/i,
    );

    const stricterWorld: OverworldManifest = structuredClone(WORLD);
    const stricterRule = stricterWorld.campaign_service_rules?.find((rule) => rule.id === SERVICE);
    if (!stricterRule?.requires_region_renown) throw new Error("Expected the Works service rule.");
    stricterRule.requires_region_renown.at_least = 14;
    const insufficient = structuredClone(consumed);
    insufficient.worldHash = hashState(stricterWorld);
    expect(() => OverworldSession.restore(stricterWorld, insufficient)).toThrow(
      /lacks 14 Capital \/ Mohawk renown at its service boundary/i,
    );
  });
});
