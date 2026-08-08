import { describe, expect, it } from "vitest";

import { OverworldSession } from "../../src/world/session.js";
import {
  assertQuestDispatchLaunchSeal,
  createQuestDispatchLaunchSeal,
  deriveQuestDispatchPresentationWindow,
  deriveQuestDispatchWindow,
} from "../../src/world/quest_dispatch_window.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { revealCurrentJourneyStoryOptions } from "../regression/support/journey_story.js";

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
    oathId?: string;
    sourceId?: string;
    preparationId?: string;
    reliefAllocationId?: string;
    allyId?: string | null;
  } = {},
): OverworldSession {
  const session = new OverworldSession(WORLD);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(REGISTRATION.contact);
  session.chooseJourneyStory(args.registrationId ?? REGISTRATION.profiles[0]!.id);
  revealCurrentJourneyStoryOptions(session, RELIEF_OATH.id);
  session.chooseJourneyStory(args.oathId ?? RELIEF_OATH.options[0]!.id);
  session.chooseJourneyStory(args.sourceId ?? LEAD_SOURCE.options[0]!.id);
  moveToArea(session, PREPARATION.area);
  session.chooseJourneyStory(args.preparationId ?? PREPARATION.profiles[0]!.id);
  session.chooseJourneyStory(args.reliefAllocationId ?? RELIEF_ALLOCATION.options[0]!.id);
  if (args.allyId !== null) {
    session.talkToCharacter(ALLY.contact);
    session.chooseJourneyStory(args.allyId ?? ALLY.options[0]!.id);
  }
  return session;
}

function presentationWindow(session: OverworldSession) {
  return deriveQuestDispatchPresentationWindow({
    questId: WOLF.id,
    journalEntries: session.snapshot().journalEntries,
    openingRegistration: REGISTRATION,
    openingReliefOath: RELIEF_OATH,
    openingLeadSource: LEAD_SOURCE,
    openingPreparation: PREPARATION,
    openingReliefAllocation: RELIEF_ALLOCATION,
    openingAlly: ALLY,
  });
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

    expect(window).toMatchObject({ schemaVersion: 2, status: "legacy_neutral" });
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
      schemaVersion: 2,
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
    expect(window.receipt!.preparation.kind).toBe("selected");
    if (window.receipt!.preparation.kind !== "selected") {
      throw new Error("Expected a selected preparation receipt.");
    }
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

  it("keeps every unresolved support open in presentation and seals a direct launch decline", () => {
    const session = preparedDispatch({
      registrationId: "albany:road_warden",
      oathId: "albany:oath_limited_aid_only",
      sourceId: "albany:source_jamie_market_testimony",
      preparationId: "albany:prep_drover_route",
      reliefAllocationId: "albany:relief_resident_shelter",
      allyId: null,
    });
    expect(
      session.prepareQuestStart(WOLF.id, WOLF.launch!.options[0]!.id).dispatchWindow,
    ).toMatchObject({
      status: "delayed",
      ledgerMinutes: 65,
    });

    const open = presentationWindow(session);
    expect(open).toMatchObject({
      schemaVersion: 2,
      questId: WOLF.id,
      status: "support_choices_open",
      committedMinutes: 65,
      finalMinutes: { minimum: 65, maximum: 80 },
      receipt: {
        juneCommitment: { kind: "open_optional", minutes: 0 },
      },
    });
    expect(open.proofHash).toMatch(/^[0-9a-f]{64}$/);
    if (open.status !== "support_choices_open") {
      throw new Error("Expected the open support presentation proof.");
    }
    expect(Object.isFrozen(open)).toBe(true);
    expect(Object.isFrozen(open.receipt)).toBe(true);

    session.talkToCharacter(ALLY.contact);
    expect(presentationWindow(session)).toEqual(open);

    const launchWindow = session.prepareQuestStart(
      WOLF.id,
      WOLF.launch!.options[0]!.id,
    ).dispatchWindow;
    expect(launchWindow).toMatchObject({
      status: "delayed",
      ledgerMinutes: 65,
      receipt: { juneCommitment: { kind: "declined_at_launch", minutes: 0 } },
    });

    const restored = OverworldSession.restore(WORLD, structuredClone(session.snapshot()));
    expect(presentationWindow(restored)).toEqual(open);
  });

  it.each([
    ["albany:ally_travel_solo", 65],
    ["albany:ally_june_relay_only", 70],
    ["albany:ally_june_cattle_first", 80],
  ] as const)("replaces the pending proof with a final %s receipt", (allyId, ledgerMinutes) => {
    const session = preparedDispatch({
      registrationId: "albany:road_warden",
      oathId: "albany:oath_limited_aid_only",
      sourceId: "albany:source_jamie_market_testimony",
      preparationId: "albany:prep_drover_route",
      reliefAllocationId: "albany:relief_resident_shelter",
      allyId,
    });
    const window = presentationWindow(session);
    expect(window).toMatchObject({
      status: "delayed",
      ledgerMinutes,
      receipt: { juneCommitment: { kind: "selected", optionId: allyId } },
    });
    expect(window.status).not.toBe("support_choices_open");
  });

  it("rejects a tampered pending June boundary instead of inventing provisional timing", () => {
    const session = preparedDispatch({
      oathId: "albany:oath_limited_aid_only",
      sourceId: "albany:source_jamie_market_testimony",
      preparationId: "albany:prep_drover_route",
      reliefAllocationId: "albany:relief_resident_shelter",
      allyId: null,
    });
    session.talkToCharacter(ALLY.contact);
    const snapshot = structuredClone(session.snapshot());
    const offer = snapshot.journalEntries.find((entry) => entry.kind === "ally_offer");
    if (!offer?.storyChoiceBoundary) throw new Error("Expected an authenticated June offer.");
    offer.storyChoiceBoundary.minutes += 1;

    const presentation = deriveQuestDispatchPresentationWindow({
      questId: WOLF.id,
      journalEntries: snapshot.journalEntries,
      openingRegistration: REGISTRATION,
      openingReliefOath: RELIEF_OATH,
      openingLeadSource: LEAD_SOURCE,
      openingPreparation: PREPARATION,
      openingReliefAllocation: RELIEF_ALLOCATION,
      openingAlly: ALLY,
    });
    expect(presentation).toMatchObject({ status: "legacy_neutral" });
    expect(presentation).not.toHaveProperty("committedMinutes");
    expect(() => OverworldSession.restore(WORLD, snapshot)).toThrow();
  });

  it("records a direct post-source departure as three explicit launch declines", () => {
    const session = new OverworldSession(WORLD);
    session.scoutPoi(session.view().pois[0]!.id);
    session.talkToCharacter(REGISTRATION.contact);
    session.chooseJourneyStory(REGISTRATION.profiles[0]!.id);
    revealCurrentJourneyStoryOptions(session, RELIEF_OATH.id);
    session.chooseJourneyStory(RELIEF_OATH.options[0]!.id);
    session.chooseJourneyStory(LEAD_SOURCE.options[0]!.id);
    moveToArea(session, PREPARATION.area);
    const window = session.prepareQuestStart(WOLF.id, WOLF.launch!.options[0]!.id).dispatchWindow;

    expect(window).toMatchObject({
      status: "on_time",
      receipt: {
        preparation: { kind: "declined_at_launch", minutes: 0 },
        reliefAllocation: { kind: "declined_at_launch", minutes: 0 },
        juneCommitment: { kind: "declined_at_launch", minutes: 0 },
      },
    });
    const launchBoundary = {
      acceptedDecisions: session.journey().acceptedDecisions + 1,
      decisionProofHash: "a".repeat(64),
      townId: "albany_city",
      areaId: PREPARATION.area,
      minutes: session.snapshot().minutes + WOLF.launch!.options[0]!.terms.minutes,
    };
    const seal = createQuestDispatchLaunchSeal({
      window,
      approachId: WOLF.launch!.options[0]!.id,
      launchBoundary,
    });
    expect(seal).toMatchObject({
      schemaVersion: 1,
      questId: WOLF.id,
      approachId: WOLF.launch!.options[0]!.id,
      slots: {
        preparation: { kind: "declined_at_launch" },
        reliefAllocation: { kind: "declined_at_launch" },
        fieldTeam: { kind: "declined_at_launch" },
      },
      launchBoundary,
    });
    if (!seal) throw new Error("Expected an authenticated launch seal.");
    expect(() =>
      assertQuestDispatchLaunchSeal({
        seal,
        expectedWindow: window,
        expectedApproachId: WOLF.launch!.options[0]!.id,
        expectedLaunchBoundary: launchBoundary,
      }),
    ).not.toThrow();
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
