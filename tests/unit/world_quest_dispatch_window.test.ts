import { describe, expect, it } from "vitest";

import { OverworldSession } from "../../src/world/session.js";
import { deriveQuestDispatchWindow } from "../../src/world/quest_dispatch_window.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const WORLD = loadOverworldManifest(process.cwd());
const REGISTRATION = WORLD.opening_registration!;
const RELIEF_OATH = WORLD.opening_relief_oath!;
const LEAD_SOURCE = WORLD.opening_lead_source!;
const PREPARATION = WORLD.opening_preparation!;
const RELIEF_ALLOCATION = WORLD.opening_relief_allocation!;
const ALLY = WORLD.opening_ally!;
const WOLF = WORLD.quests.find((quest) => quest.id === "wolf_winter")!;

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

function preparedDispatch(
  args: {
    registrationId?: string;
    sourceId?: string;
    preparationId?: string;
    allyId?: string | null;
  } = {},
): OverworldSession {
  const session = new OverworldSession(WORLD);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(REGISTRATION.contact);
  session.chooseJourneyStory(args.registrationId ?? REGISTRATION.profiles[0]!.id);
  session.chooseJourneyStory(RELIEF_OATH.options[0]!.id);
  session.chooseJourneyStory(args.sourceId ?? LEAD_SOURCE.options[0]!.id);
  moveToArea(session, PREPARATION.area);
  session.chooseJourneyStory(args.preparationId ?? PREPARATION.profiles[0]!.id);
  session.chooseJourneyStory(RELIEF_ALLOCATION.options[0]!.id);
  if (args.allyId !== null) {
    session.talkToCharacter(ALLY.contact);
    session.chooseJourneyStory(args.allyId ?? ALLY.options[0]!.id);
  }
  return session;
}

describe("Wolf-Winter quest dispatch window", () => {
  it("keeps direct or incomplete departure history legacy-neutral without a ledger total", () => {
    const window = deriveQuestDispatchWindow({
      questId: WOLF.id,
      journalEntries: [],
      openingRegistration: REGISTRATION,
      openingReliefOath: RELIEF_OATH,
      openingLeadSource: LEAD_SOURCE,
      openingPreparation: PREPARATION,
      openingReliefAllocation: RELIEF_ALLOCATION,
      openingAlly: ALLY,
    });

    expect(window).toMatchObject({ schemaVersion: 1, status: "legacy_neutral" });
    expect(window).not.toHaveProperty("ledgerMinutes");
    expect(window).not.toHaveProperty("receipt");
  });

  it("freezes the exact authenticated departure receipt at the 60-minute boundary", () => {
    const session = preparedDispatch({
      preparationId: "albany:prep_relief_protocol",
      allyId: ALLY.options[0]!.id,
    });
    const window = session.prepareQuestStart(WOLF.id, WOLF.launch!.options[0]!.id).dispatchWindow;

    expect(window).toMatchObject({
      schemaVersion: 1,
      questId: WOLF.id,
      status: "on_time",
      ledgerMinutes: 60,
      receipt: {
        reliefAllocation: { kind: "selected", minutes: 5 },
        juneCommitment: { kind: "selected", minutes: 15 },
      },
    });
    expect(window.proofHash).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.isFrozen(window)).toBe(true);
    expect(Object.isFrozen(window.receipt)).toBe(true);
    expect(Object.isFrozen(window.receipt!.preparation.boundary)).toBe(true);
  });

  it("marks sponsored dispatch terms on time and a slower certified docket delayed", () => {
    const sponsored = preparedDispatch({
      registrationId: "albany:ledger_advocate",
      sourceId: "albany:source_jamie_market_testimony",
      preparationId: "albany:prep_relief_protocol",
      allyId: "albany:ally_travel_solo",
    }).prepareQuestStart(WOLF.id, WOLF.launch!.options[0]!.id).dispatchWindow;
    const delayed = preparedDispatch({
      sourceId: "albany:source_jamie_market_testimony",
      allyId: "albany:ally_june_cattle_first",
    }).prepareQuestStart(WOLF.id, WOLF.launch!.options[0]!.id).dispatchWindow;

    expect(sponsored).toMatchObject({
      status: "on_time",
      ledgerMinutes: 40,
      receipt: {
        leadSource: { minutes: 15 },
        preparation: { minutes: 10 },
        juneCommitment: { kind: "selected", minutes: 0 },
      },
    });
    expect(delayed).toMatchObject({ status: "delayed", ledgerMinutes: 90 });
  });

  it("marks 65 minutes delayed and keeps the proof invariant across both hill approaches", () => {
    const session = preparedDispatch({
      registrationId: "albany:ironhands_repairer",
      sourceId: "albany:source_hayden_frost_report",
      preparationId: "albany:prep_relief_protocol",
      allyId: "albany:ally_travel_solo",
    });
    const ridge = session.prepareQuestStart(WOLF.id, WOLF.launch!.options[0]!.id).dispatchWindow;
    const stockway = session.prepareQuestStart(WOLF.id, WOLF.launch!.options[1]!.id).dispatchWindow;

    expect(ridge).toMatchObject({ status: "delayed", ledgerMinutes: 65 });
    expect(stockway).toEqual(ridge);
  });

  it("records a direct post-preparation departure as the proven solo/unasked zero", () => {
    const window = preparedDispatch({ allyId: null }).prepareQuestStart(
      WOLF.id,
      WOLF.launch!.options[0]!.id,
    ).dispatchWindow;

    expect(window).toMatchObject({
      status: "on_time",
      receipt: { juneCommitment: { kind: "solo_unasked", minutes: 0 } },
    });
  });

  it("rejects a tampered current boundary on restore and never infers a zero-minute window", () => {
    const session = preparedDispatch();
    const snapshot = structuredClone(session.snapshot());
    const preparation = snapshot.journalEntries.find((entry) => entry.kind === "preparation");
    if (!preparation?.storyChoiceBoundary) {
      throw new Error("Expected a current preparation boundary.");
    }
    preparation.storyChoiceBoundary.minutes += 1;

    expect(() => OverworldSession.restore(WORLD, snapshot)).toThrow();
    const window = deriveQuestDispatchWindow({
      questId: WOLF.id,
      journalEntries: snapshot.journalEntries,
      openingRegistration: REGISTRATION,
      openingReliefOath: RELIEF_OATH,
      openingLeadSource: LEAD_SOURCE,
      openingPreparation: PREPARATION,
      openingReliefAllocation: RELIEF_ALLOCATION,
      openingAlly: ALLY,
    });
    expect(window).toMatchObject({ status: "legacy_neutral" });
    expect(window).not.toHaveProperty("ledgerMinutes");
  });
});
