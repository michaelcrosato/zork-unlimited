import { describe, expect, it } from "vitest";

import {
  render,
  renderDepartureRecap,
  renderDepartureRecapTerms,
  renderStationDispatchBoard,
} from "../../bin/overworld_play.js";
import {
  OVERWORLD_COMPACT_VIEW_VERSION,
  cloneOverworldCompactView,
  compactOverworldQuestRef,
  compactOverworldView,
} from "../../src/world/compact_view.js";
import {
  compactOpeningDepartureRecapTerms,
  deriveOpeningDepartureRecap,
  OPENING_DEPARTURE_RECAP_FIELD_TERM_CHAR_LIMIT,
} from "../../src/world/opening_departure_recap.js";
import { presentOpeningAlly } from "../../src/world/opening_ally_presentation.js";
import { presentOpeningLeadSource } from "../../src/world/opening_lead_source_presentation.js";
import { presentOpeningPreparation } from "../../src/world/opening_preparation_presentation.js";
import { presentOpeningRegistration } from "../../src/world/opening_registration_presentation.js";
import { presentOpeningReliefAllocation } from "../../src/world/opening_relief_allocation_presentation.js";
import { presentOpeningReliefOath } from "../../src/world/opening_relief_oath_presentation.js";
import { deriveQuestDispatchPresentationWindow } from "../../src/world/quest_dispatch_window.js";
import { wolfHillRouteTradeoffParts } from "../../src/world/wolf_hill_route_presentation.js";
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import type { JourneyStoryChoicePrompt } from "../../src/world/journey_contract.js";
import { revealCurrentJourneyStoryOptions } from "../regression/support/journey_story.js";

const WORLD = loadOverworldManifest(process.cwd());
const REGISTRATION = WORLD.opening_registration!;
const RELIEF_OATH = WORLD.opening_relief_oath!;
const LEAD_SOURCE = WORLD.opening_lead_source!;
const PREPARATION = WORLD.opening_preparation!;
const RELIEF_ALLOCATION = WORLD.opening_relief_allocation!;
const ALLY = WORLD.opening_ally!;
const WOLF = WORLD.quests.find((quest) => quest.id === LEAD_SOURCE.target_quest)!;

function canonicalWindow(session: OverworldSession) {
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

function stationSession(roleIndex = 0, readyMade = false): OverworldSession {
  const session = new OverworldSession(WORLD);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(REGISTRATION.contact);
  const profile = REGISTRATION.profiles[roleIndex]!;
  session.chooseJourneyStory(profile.id);
  if (readyMade) {
    const doctrine = REGISTRATION.doctrines?.find(
      (candidate) => candidate.profile_id === profile.id,
    );
    if (!doctrine) throw new Error(`Expected a ready-made dispatch for "${profile.id}".`);
    session.chooseJourneyStory(doctrine.id);
  } else {
    revealCurrentJourneyStoryOptions(session, RELIEF_OATH.id);
    session.chooseJourneyStory(RELIEF_OATH.options[0]!.id);
    session.chooseJourneyStory(LEAD_SOURCE.options[0]!.id);
  }
  const stationRoute = session
    .view()
    .areaExits.find((candidate) => candidate.destination.id === PREPARATION.area);
  if (!stationRoute) throw new Error("Expected the authored route to Hayden's Station.");
  session.moveArea(stationRoute.id);
  return session;
}

function selectedTitle(session: OverworldSession, slot: string): string | null | undefined {
  return session.view().departureRecap?.entries.find((entry) => entry.slot === slot)?.title;
}

function projectedFieldTerm(prompt: JourneyStoryChoicePrompt, optionId: string): string {
  const summary = prompt.options.find((option) => option.id === optionId)?.summary;
  if (!summary) throw new Error(`Expected a canonical summary for "${optionId}".`);
  return summary.fieldTriggerScope === "category" && summary.fieldTrigger
    ? summary.fieldTrigger
    : summary.tradeoff;
}

function projectedTitle(prompt: JourneyStoryChoicePrompt, optionId: string): string {
  const option = prompt.options.find((candidate) => candidate.id === optionId);
  if (!option) throw new Error(`Expected a canonical presentation for "${optionId}".`);
  return option.label;
}

describe("Albany opening departure recap", () => {
  it("keeps every canonical selected term concise enough for cumulative recall", () => {
    const character = stationSession().snapshot().character;
    const candidateTerms = [
      presentOpeningRegistration(REGISTRATION),
      presentOpeningReliefOath(RELIEF_OATH, character),
      presentOpeningLeadSource(LEAD_SOURCE, character),
      presentOpeningPreparation(PREPARATION, character),
      presentOpeningReliefAllocation(RELIEF_ALLOCATION, character),
      presentOpeningAlly(ALLY, character),
    ].flatMap((prompt) => prompt.options.map((option) => projectedFieldTerm(prompt, option.id)));

    for (const term of candidateTerms) {
      expect(term.length).toBeGreaterThan(0);
      expect(term.length).toBeLessThanOrEqual(OPENING_DEPARTURE_RECAP_FIELD_TERM_CHAR_LIMIT);
    }
  });

  it("uses player-facing promise and solo titles in both full and compact authenticated recaps", () => {
    const custom = stationSession();
    const readyMade = stationSession(0, true);
    const readyMadeDoctrine = REGISTRATION.doctrines?.find(
      (candidate) => candidate.profile_id === REGISTRATION.profiles[0]!.id,
    );
    const readyMadePromise = RELIEF_OATH.options.find(
      (option) => option.id === readyMadeDoctrine?.relief_oath_option_id,
    );
    if (!readyMadeDoctrine || !readyMadePromise) {
      throw new Error("Expected the registered background's ready-made promise.");
    }
    const cases = [
      { path: "custom", session: custom, rawPromise: RELIEF_OATH.options[0]! },
      { path: "ready-made", session: readyMade, rawPromise: readyMadePromise },
    ] as const;

    for (const { path, session, rawPromise } of cases) {
      const promisePresentation = presentOpeningReliefOath(
        RELIEF_OATH,
        session.snapshot().character,
      );
      const promiseTitle = projectedTitle(promisePresentation, rawPromise.id);
      const promiseFieldTerm = projectedFieldTerm(promisePresentation, rawPromise.id);
      const beforeSnapshot = session.snapshot();
      const beforeHash = session.snapshotHash();
      const fullDuty = session
        .view()
        .departureRecap?.entries.find((entry) => entry.slot === "duty");
      const compactDuty = session
        .compactView()
        .station_dispatch_board?.[4].find(([slot]) => slot === "duty");
      expect(fullDuty).toMatchObject({
        status: "selected",
        title: promiseTitle,
        activeFieldTerm: promiseFieldTerm,
      });
      expect(compactDuty).toEqual(["duty", "selected", promiseTitle, null, null]);
      expect(rawPromise.title, `${path} source title`).toContain("Duty");
      expect(promiseTitle, `${path} projected title`).toBe(
        rawPromise.title.replace(/\bDuty\b/gu, "Promise"),
      );
      expect(fullDuty?.title).not.toBe(rawPromise.title);
      const terminalRecap = renderDepartureRecap(session.view().departureRecap!).join("\n");
      expect(terminalRecap).toContain(`Wolf-Winter promise: ${promiseTitle}`);
      expect(terminalRecap).not.toContain(rawPromise.title);
      expect(session.snapshot()).toEqual(beforeSnapshot);
      expect(session.snapshotHash()).toBe(beforeHash);
    }

    const solo = stationSession();
    solo.chooseJourneyStory(PREPARATION.profiles[0]!.id, PREPARATION.id);
    solo.chooseJourneyStory(RELIEF_ALLOCATION.options[0]!.id, RELIEF_ALLOCATION.id);
    solo.talkToCharacter(ALLY.contact);
    const rawSolo = ALLY.options.find((option) => option.id === ALLY.solo_option_id);
    if (!rawSolo) throw new Error("Expected the authored solo field-team option.");
    const allyPresentation = presentOpeningAlly(ALLY, solo.snapshot().character);
    const soloTitle = projectedTitle(allyPresentation, rawSolo.id);
    const soloFieldTerm = projectedFieldTerm(allyPresentation, rawSolo.id);
    solo.chooseJourneyStory(rawSolo.id);
    const beforeSoloSnapshot = solo.snapshot();
    const beforeSoloHash = solo.snapshotHash();
    const fullSolo = solo
      .view()
      .departureRecap?.entries.find((entry) => entry.slot === "field_team");
    const compactSolo = solo
      .compactView()
      .station_dispatch_board?.[4].find(([slot]) => slot === "field_team");

    expect(rawSolo.title).toBe("Leave with a Solo Field Team");
    expect(soloTitle).toBe("Ride alone");
    expect(fullSolo).toMatchObject({
      status: "selected",
      title: soloTitle,
      activeFieldTerm: soloFieldTerm,
    });
    expect(compactSolo).toEqual(["field_team", "selected", soloTitle, null, null]);
    expect(renderDepartureRecap(solo.view().departureRecap!).join("\n")).toContain(
      "Second rider: Ride alone",
    );
    expect(renderDepartureRecap(solo.view().departureRecap!).join("\n")).not.toContain(
      rawSolo.title,
    );
    expect(solo.snapshot()).toEqual(beforeSoloSnapshot);
    expect(solo.snapshotHash()).toBe(beforeSoloHash);
  });

  it("summarizes the accumulated current plan without exposing alternatives or changing play", () => {
    const session = stationSession();
    const beforeSnapshot = session.snapshot();
    const beforeHash = session.snapshotHash();
    const beforeDecisions = session.journey().acceptedDecisions;
    const full = session.view();
    const compact = session.compactView();
    const dutyFieldTerm = projectedFieldTerm(
      presentOpeningReliefOath(RELIEF_OATH, beforeSnapshot.character),
      RELIEF_OATH.options[0]!.id,
    );
    const evidenceFieldTerm = projectedFieldTerm(
      presentOpeningLeadSource(LEAD_SOURCE, beforeSnapshot.character),
      LEAD_SOURCE.options[0]!.id,
    );
    const registrationCard = presentOpeningRegistration(REGISTRATION).options[0]!;
    expect(registrationCard.summary?.tradeoff).not.toBe(REGISTRATION.profiles[0]!.tradeoff);

    expect(full.departureRecap).toEqual({
      version: 7,
      questId: WOLF.id,
      questTitle: WOLF.title,
      entries: [
        {
          slot: "role",
          label: "Background",
          status: "selected",
          title: REGISTRATION.profiles[0]!.title,
          activeFieldTerm: REGISTRATION.profiles[0]!.tradeoff,
        },
        {
          slot: "duty",
          label: "Wolf-Winter promise",
          status: "selected",
          title: projectedTitle(
            presentOpeningReliefOath(RELIEF_OATH, beforeSnapshot.character),
            RELIEF_OATH.options[0]!.id,
          ),
          activeFieldTerm: dutyFieldTerm,
        },
        {
          slot: "evidence",
          label: "Report",
          status: "selected",
          title: LEAD_SOURCE.options[0]!.title,
          activeFieldTerm: evidenceFieldTerm,
        },
        {
          slot: "preparation",
          label: "Field kit",
          status: "open_optional",
          title: null,
          activeFieldTerm: null,
        },
        {
          slot: "relief_allocation",
          label: "Relief wagon",
          status: "open_optional",
          title: null,
          activeFieldTerm: null,
        },
        {
          slot: "field_team",
          label: "Second rider",
          status: "open_optional",
          title: null,
          activeFieldTerm: null,
        },
      ],
      dispatch: {
        state: "committed",
        minutes: 10,
        timing: null,
        remainingOptional: ["preparation", "relief_allocation", "field_team"],
      },
    });
    expect(compact.v).toBe(OVERWORLD_COMPACT_VIEW_VERSION);
    expect(compact.departure_recap).toBeUndefined();
    expect(compact.station_dispatch_board?.slice(0, 4)).toEqual([
      5,
      WOLF.id,
      expect.any(String),
      ["committed", 10, null, 3],
    ]);
    expect(compact.station_dispatch_board?.[4].map((row) => row.slice(0, 3))).toEqual(
      full
        .departureRecap!.entries.filter((entry) => entry.status !== "open_optional")
        .map((entry) => [entry.slot, entry.status, entry.title]),
    );
    expect(compact).not.toHaveProperty("departure_interactions");
    expect(compact).not.toHaveProperty("departure_contact_leads");
    expect(compact).not.toHaveProperty("departure_recap_terms");
    expect(compactOpeningDepartureRecapTerms(full.departureRecap!)).toEqual([
      7,
      WOLF.id,
      [
        ["role", REGISTRATION.profiles[0]!.tradeoff],
        ["duty", dutyFieldTerm],
        ["evidence", evidenceFieldTerm],
      ],
    ]);
    const launchFirstKeys = (value: object) =>
      Object.keys(value).filter((key) =>
        [
          "quests",
          "quest_starts",
          "departure_recap",
          "departure_interactions",
          "departure_contact_leads",
          "station_dispatch_board",
        ].includes(key),
      );
    const expectedLaunchFirstKeys = ["quests", "quest_starts", "station_dispatch_board"];
    expect(launchFirstKeys(compact)).toEqual(expectedLaunchFirstKeys);
    const projectedFull = compactOverworldView(full);
    expect(launchFirstKeys(projectedFull)).toEqual(expectedLaunchFirstKeys);
    expect(projectedFull.quests).toEqual(compact.quests);
    const wolfQuest = full.quests.find((quest) => quest.id === WOLF.id);
    if (!wolfQuest?.launch) throw new Error("Expected the legal Wolf-Winter launch card.");
    const defaultWolfRef = compactOverworldQuestRef(wolfQuest);
    const focusedWolfRef = compact.quests?.find(([questId]) => questId === WOLF.id);
    if (!focusedWolfRef?.[3]) throw new Error("Expected the focused Wolf-Winter launch card.");
    expect(focusedWolfRef[3][2].every((option) => option[11] === null)).toBe(true);
    expect(focusedWolfRef[3][2].every((option) => option[12] === null)).toBe(true);
    expect(focusedWolfRef[3][2].map((option) => option[13])).toEqual(
      wolfQuest.launch.options.map((option) =>
        option.tradeoffSummary
          ? (wolfHillRouteTradeoffParts(option.tradeoffSummary)?.routeSummary ??
            option.tradeoffSummary)
          : option.summary,
      ),
    );
    expect(
      JSON.stringify(defaultWolfRef).length - JSON.stringify(focusedWolfRef).length,
    ).toBeGreaterThan(700);
    const gatedView = { ...full, questStarts: [], stationDispatchBoard: null };
    const gatedCompact = compactOverworldView(gatedView);
    const expectedPlanningFirstKeys = [
      "departure_interactions",
      "departure_contact_leads",
      "departure_recap",
      "quests",
    ];
    expect(launchFirstKeys(gatedCompact)).toEqual(expectedPlanningFirstKeys);
    expect(launchFirstKeys(cloneOverworldCompactView(gatedCompact))).toEqual(
      expectedPlanningFirstKeys,
    );
    const gatedWolfRef = gatedCompact.quests?.find(([questId]) => questId === WOLF.id);
    expect(gatedWolfRef?.[3]?.[2].every((option) => typeof option[11] === "string")).toBe(true);
    expect(gatedWolfRef?.[3]?.[2].every((option) => typeof option[12] === "string")).toBe(true);
    const gatedTerminal = render(gatedView);
    expect(gatedTerminal).not.toContain("Depart now:");
    expect(gatedTerminal.indexOf(`${WOLF.title} field briefing:`)).toBeLessThan(
      gatedTerminal.indexOf("Notice board:"),
    );

    const visible = JSON.stringify(full.departureRecap);
    for (const alternative of [
      ...REGISTRATION.profiles.slice(1),
      ...RELIEF_OATH.options.slice(1),
      ...LEAD_SOURCE.options.slice(1),
      ...PREPARATION.profiles,
      ...RELIEF_ALLOCATION.options,
      ...ALLY.options,
    ]) {
      expect(visible).not.toContain(alternative.title);
      if ("preview" in alternative) expect(visible).not.toContain(alternative.preview);
      if ("consequence" in alternative) expect(visible).not.toContain(alternative.consequence);
      if ("tradeoff" in alternative) expect(visible).not.toContain(alternative.tradeoff);
    }

    expect(session.snapshot()).toEqual(beforeSnapshot);
    expect(session.snapshotHash()).toBe(beforeHash);
    expect(session.journey().acceptedDecisions).toBe(beforeDecisions);
    expect(OverworldSession.restore(WORLD, beforeSnapshot).view().departureRecap).toEqual(
      full.departureRecap,
    );
    expect(
      deriveOpeningDepartureRecap({
        world: { ...WORLD, opening_ally: undefined },
        journalEntries: beforeSnapshot.journalEntries,
      }),
    ).toBeNull();

    (
      full.departureRecap as unknown as {
        entries: Array<{ title: string | null }>;
      }
    ).entries[0]!.title = "forged full title";
    (
      full.departureRecap as unknown as {
        entries: Array<{ activeFieldTerm: string | null }>;
      }
    ).entries[0]!.activeFieldTerm = "forged full field term";
    const compactRole = compact.station_dispatch_board?.[4].find(([slot]) => slot === "role");
    if (!compactRole) throw new Error("Expected compact Station role row.");
    (compactRole as unknown as [string, string, string | null])[2] = "forged compact title";
    expect(selectedTitle(session, "role")).toBe(REGISTRATION.profiles[0]!.title);
    expect(
      session.compactView().station_dispatch_board?.[4].find(([slot]) => slot === "role")?.[2],
    ).toBe(REGISTRATION.profiles[0]!.title);
    expect(JSON.stringify(session.compactView().station_dispatch_board)).not.toContain(
      REGISTRATION.profiles[0]!.tradeoff,
    );

    const authenticatedRecap = session.view().departureRecap!;
    const terminal = render(session.view());
    expect(terminal).toContain(
      "Start the mission now; choosing an available road is the next step, and planning is optional.",
    );
    expect(terminal).toContain(
      `Start with \`start ${WOLF.title}\`; route selection follows before commitment.`,
    );
    const board = session.view().stationDispatchBoard;
    if (!board) throw new Error("Expected the Station dispatch board.");
    expect(board.support).toHaveLength(3);
    expect(board.launch.approaches).toHaveLength(2);
    expect(board.launch.approaches.map((approach) => approach.id)).toEqual(
      WOLF.launch!.options.map((option) => option.id),
    );
    const renderedBoard = renderStationDispatchBoard(session.view()).join("\n");
    expect(renderedBoard).toContain(
      "Optional dispatch support — field kit, relief wagon, or second rider:",
    );
    for (const support of board.support) {
      expect(renderedBoard).toContain(`${support.label} —`);
      expect(renderedBoard).toContain(support.purpose);
      expect(renderedBoard).toContain(support.detailHint);
    }
    expect(renderedBoard).toContain(`inspect ${PREPARATION.id}`);
    expect(renderedBoard).toContain(`inspect ${RELIEF_ALLOCATION.id}`);
    expect(renderedBoard).toContain("Talk to June Pike: `talk June Pike`");
    expect(terminal).toContain(`${WOLF.title} field briefing:`);
    expect(terminal).toContain(board.guidance);
    expect(terminal).not.toContain(`${WOLF.title} dispatch recap:`);
    expect(terminal).not.toContain(`Background: ${REGISTRATION.profiles[0]!.title}`);
    expect(terminal).toContain("Already set: `review dispatch`.");
    const boundedRecap = renderDepartureRecap(authenticatedRecap).join("\n");
    expect(boundedRecap).toContain(`${WOLF.title} dispatch recap:`);
    expect(boundedRecap).toContain(`Background: ${REGISTRATION.profiles[0]!.title}`);
    expect(boundedRecap).toContain("Plan slots and exact selected terms: `review dispatch`.");
    expect(boundedRecap).not.toContain(REGISTRATION.profiles[0]!.tradeoff);
    const reviewedTerms = renderDepartureRecapTerms(authenticatedRecap).join("\n");
    expect(reviewedTerms).toContain(`Active term: ${REGISTRATION.profiles[0]!.tradeoff}`);
    expect(reviewedTerms).toContain(`Active term: ${dutyFieldTerm}`);
    expect(reviewedTerms).toContain(`Active term: ${evidenceFieldTerm}`);
    expect(reviewedTerms).toContain("Field kit: Open (optional)");
    expect(reviewedTerms).not.toContain(PREPARATION.profiles[0]!.tradeoff);
    expect(terminal.indexOf(`${WOLF.title} field briefing:`)).toBeLessThan(
      terminal.indexOf("Depart now:"),
    );
    expect(terminal.indexOf("Depart now:")).toBeLessThan(
      terminal.indexOf("Optional support (independent"),
    );
    expect(terminal.indexOf("Optional support (independent")).toBeLessThan(
      terminal.indexOf("Already set: `review dispatch`."),
    );
    expect(terminal.indexOf("Take the Exposed Ridge Road")).toBeGreaterThan(
      terminal.indexOf(`${WOLF.title} field briefing:`),
    );
    const promotedLaunch = terminal.slice(terminal.indexOf("Depart now:"));
    expect(promotedLaunch).not.toContain("choose <number|name>");
    expect(promotedLaunch).not.toMatch(/\bchoose [12] —/);
  });

  it("updates resolved optional rows, stays paired by choice, and respects the mission boundary", () => {
    const first = stationSession(0);
    const second = stationSession(1);
    const presentationCharacter = first.snapshot().character;
    const firstEntries = first.view().departureRecap!.entries;
    const secondEntries = second.view().departureRecap!.entries;
    expect(
      firstEntries
        .map((entry, index) => (entry.title === secondEntries[index]!.title ? null : entry.slot))
        .filter(Boolean),
    ).toEqual(["role"]);
    expect(secondEntries[0]!.title).toBe(REGISTRATION.profiles[1]!.title);

    expect(first.view().departureRecap).not.toBeNull();
    first.inspectJourneyStory(PREPARATION.id);
    expect(first.view().departureRecap).not.toBeNull();
    first.chooseJourneyStory(PREPARATION.profiles[0]!.id);
    const preparedWindow = canonicalWindow(first);
    expect(preparedWindow).toMatchObject({ status: "support_choices_open" });
    if (preparedWindow.status !== "support_choices_open") {
      throw new Error("Expected open support after preparation.");
    }
    expect(first.view().departureRecap?.dispatch).toEqual({
      state: "committed",
      minutes: preparedWindow.committedMinutes,
      timing: null,
      remainingOptional: ["relief_allocation", "field_team"],
    });
    expect(first.view().departureRecap?.entries[3]).toMatchObject({
      status: "selected",
      title: PREPARATION.profiles[0]!.title,
      activeFieldTerm: projectedFieldTerm(
        presentOpeningPreparation(PREPARATION, presentationCharacter),
        PREPARATION.profiles[0]!.id,
      ),
    });
    expect(first.view().departureRecap?.entries[4]).toMatchObject({
      status: "open_optional",
      title: null,
      activeFieldTerm: null,
    });
    expect(first.view().departureRecap?.entries[5]).toMatchObject({
      status: "open_optional",
      title: null,
      activeFieldTerm: null,
    });

    first.chooseJourneyStory(RELIEF_ALLOCATION.options[0]!.id, RELIEF_ALLOCATION.id);
    const openWindow = canonicalWindow(first);
    expect(openWindow.status).toBe("support_choices_open");
    if (openWindow.status !== "support_choices_open") {
      throw new Error("Expected the field-team support to remain open.");
    }
    expect(first.view().departureRecap?.dispatch).toEqual({
      state: "committed",
      minutes: openWindow.committedMinutes,
      timing: null,
      remainingOptional: ["field_team"],
    });
    expect(first.view().departureRecap?.entries[4]).toMatchObject({
      status: "selected",
      title: RELIEF_ALLOCATION.options[0]!.title,
      activeFieldTerm: projectedFieldTerm(
        presentOpeningReliefAllocation(RELIEF_ALLOCATION, presentationCharacter),
        RELIEF_ALLOCATION.options[0]!.id,
      ),
    });
    expect(first.view().departureRecap?.entries[5]).toEqual({
      slot: "field_team",
      label: "Second rider",
      status: "open_optional",
      title: null,
      activeFieldTerm: null,
    });
    expect(first.view().departureContactLeads).toMatchObject([
      {
        kind: "ally",
        status: "ready",
        action: { arguments: { character_id: ALLY.contact } },
      },
    ]);
    const openTerminal = render(first.view());
    expect(openTerminal).not.toContain("Second rider: Open (optional)");
    expect(openTerminal).toContain(
      `Dispatch ${String(openWindow.committedMinutes)}m committed; optional Station support remains`,
    );
    expect(openTerminal).toContain("Already set: `review dispatch`.");
    first.talkToCharacter(ALLY.contact);
    expect(first.journey().storyChoice?.kind).toBe("ally");
    expect(first.view().departureRecap?.dispatch).toEqual({
      state: "committed",
      minutes: openWindow.committedMinutes,
      timing: null,
      remainingOptional: ["field_team"],
    });
    first.chooseJourneyStory(ALLY.options[0]!.id);
    const teamWindow = canonicalWindow(first);
    expect(teamWindow.status).toBe("on_time");
    if (teamWindow.status !== "on_time" && teamWindow.status !== "delayed") {
      throw new Error("Expected the canonical field-team dispatch window.");
    }
    expect(first.view().departureRecap?.dispatch).toEqual({
      state: "sealed",
      minutes: teamWindow.ledgerMinutes,
      timing: teamWindow.status,
      remainingOptional: [],
    });
    expect(first.view().departureRecap?.entries[5]).toMatchObject({
      status: "selected",
      title: ALLY.options[0]!.title,
      activeFieldTerm: projectedFieldTerm(
        presentOpeningAlly(ALLY, presentationCharacter),
        ALLY.options[0]!.id,
      ),
    });
    for (const entry of first.view().departureRecap!.entries) {
      expect(entry.activeFieldTerm).not.toBeNull();
      expect(entry.activeFieldTerm!.length).toBeLessThanOrEqual(
        OPENING_DEPARTURE_RECAP_FIELD_TERM_CHAR_LIMIT,
      );
    }

    const solo = stationSession();
    solo.chooseJourneyStory(PREPARATION.profiles[0]!.id, PREPARATION.id);
    solo.chooseJourneyStory(RELIEF_ALLOCATION.options[0]!.id, RELIEF_ALLOCATION.id);
    solo.talkToCharacter(ALLY.contact);
    const soloOption = ALLY.options.find((option) => option.id === ALLY.solo_option_id);
    if (!soloOption) throw new Error("Expected the authored solo field-team option.");
    solo.chooseJourneyStory(soloOption.id);
    const explicitSoloWindow = canonicalWindow(solo);
    expect(explicitSoloWindow.status).toBe("on_time");
    if (explicitSoloWindow.status !== "on_time" && explicitSoloWindow.status !== "delayed") {
      throw new Error("Expected the canonical explicit-solo dispatch window.");
    }
    expect(solo.view().departureRecap?.dispatch).toEqual({
      state: "sealed",
      minutes: explicitSoloWindow.ledgerMinutes,
      timing: explicitSoloWindow.status,
      remainingOptional: [],
    });
    expect(solo.view().departureRecap?.entries[5]).toMatchObject({
      status: "selected",
      title: projectedTitle(presentOpeningAlly(ALLY, solo.snapshot().character), soloOption.id),
    });
    expect(render(solo.view())).not.toContain("Dispatch sealed:");
    expect(render(solo.view())).toContain("Already set: `review dispatch`.");
    expect(renderDepartureRecap(solo.view().departureRecap!).join("\n")).toContain(
      "Dispatch sealed:",
    );

    const questStart = first.view().questStarts.find(([questId]) => questId === WOLF.id);
    if (!questStart) throw new Error("Expected a legal Wolf-Winter launch.");
    first.startQuest(questStart[0], questStart[1] ?? undefined);
    expect(first.view().departureRecap).toBeNull();

    const moved = stationSession();
    const away = moved
      .view()
      .areaExits.find((candidate) => candidate.destination.id !== PREPARATION.area);
    if (!away) throw new Error("Expected a local route away from Hayden's Station.");
    moved.moveArea(away.id);
    expect(moved.view().departureRecap).toBeNull();
  });

  it("tracks committed minutes while every unresolved Station support remains visibly open", () => {
    const session = stationSession();
    session.chooseJourneyStory(PREPARATION.profiles[0]!.id, PREPARATION.id);
    const preparedWindow = canonicalWindow(session);
    expect(preparedWindow).toMatchObject({ status: "support_choices_open" });
    if (preparedWindow.status !== "support_choices_open") {
      throw new Error("Expected open Station support after preparation.");
    }
    expect(session.view().departureRecap?.dispatch).toEqual({
      state: "committed",
      minutes: preparedWindow.committedMinutes,
      timing: null,
      remainingOptional: ["relief_allocation", "field_team"],
    });
    session.chooseJourneyStory(RELIEF_ALLOCATION.options[0]!.id, RELIEF_ALLOCATION.id);
    const openWindow = canonicalWindow(session);
    expect(openWindow.status).toBe("support_choices_open");
    if (openWindow.status !== "support_choices_open") {
      throw new Error("Expected the field-team support to remain open.");
    }
    expect(session.view().departureRecap?.dispatch).toEqual({
      state: "committed",
      minutes: openWindow.committedMinutes,
      timing: null,
      remainingOptional: ["field_team"],
    });
    session.talkToCharacter(ALLY.contact);
    const pendingRecap = deriveOpeningDepartureRecap({
      world: WORLD,
      journalEntries: session.snapshot().journalEntries,
    });
    expect(pendingRecap?.dispatch).toEqual({
      state: "committed",
      minutes: openWindow.committedMinutes,
      timing: null,
      remainingOptional: ["field_team"],
    });
    expect(session.view().departureRecap).toEqual(pendingRecap);
    expect(JSON.stringify(pendingRecap)).not.toContain("forecast");
    const compact = session.compactView();
    expect(compact.departure_recap?.[4]).toEqual([
      "committed",
      openWindow.committedMinutes,
      null,
      ["field_team"],
    ]);
    session.chooseJourneyStory(ALLY.options[0]!.id);
    const explicitWindow = canonicalWindow(session);
    expect(explicitWindow.status).toBe("on_time");
    if (explicitWindow.status !== "on_time" && explicitWindow.status !== "delayed") {
      throw new Error("Expected the canonical explicit field-team dispatch receipt.");
    }
    expect(session.view().departureRecap?.dispatch).toEqual({
      state: "sealed",
      minutes: explicitWindow.ledgerMinutes,
      timing: explicitWindow.status,
      remainingOptional: [],
    });

    const open = stationSession();
    open.chooseJourneyStory(PREPARATION.profiles[0]!.id, PREPARATION.id);
    open.chooseJourneyStory(RELIEF_ALLOCATION.options[0]!.id, RELIEF_ALLOCATION.id);
    const recap = open.view().departureRecap;
    if (!recap?.dispatch) throw new Error("Expected a canonical open dispatch line.");
    expect(open.compactView().station_dispatch_board?.[3]).toEqual([
      "committed",
      recap.dispatch.minutes,
      null,
      1,
    ]);
    const sealedCompact = open.compactView();
    const sealedCompactDispatch = sealedCompact.station_dispatch_board?.[3];
    if (!sealedCompactDispatch) throw new Error("Expected a compact sealed dispatch line.");
    (sealedCompactDispatch as unknown as [string, number, string | null, number])[1] = 999;
    expect(open.compactView().station_dispatch_board?.[3]?.[1]).toBe(recap.dispatch.minutes);

    const forged = open.snapshot();
    const preparation = forged.journalEntries.find((entry) => entry.kind === "preparation");
    if (!preparation) throw new Error("Expected preparation evidence.");
    preparation.text = "earlier preparation receipt";
    expect(
      deriveOpeningDepartureRecap({ world: WORLD, journalEntries: forged.journalEntries }),
    ).not.toBeNull();
  });

  it("classifies authenticated on-time and delayed plan totals without changing either plan", () => {
    const onTime = stationSession();
    onTime.chooseJourneyStory(PREPARATION.profiles[0]!.id, PREPARATION.id);
    onTime.chooseJourneyStory(RELIEF_ALLOCATION.options[0]!.id, RELIEF_ALLOCATION.id);
    onTime.talkToCharacter(ALLY.contact);
    onTime.chooseJourneyStory(ALLY.solo_option_id);
    expect(onTime.view().departureRecap?.dispatch).toMatchObject({
      state: "sealed",
      timing: "on_time",
    });

    const delayed = new OverworldSession(WORLD);
    delayed.scoutPoi(delayed.view().pois[0]!.id);
    delayed.talkToCharacter(REGISTRATION.contact);
    delayed.chooseJourneyStory(REGISTRATION.profiles[0]!.id);
    revealCurrentJourneyStoryOptions(delayed, RELIEF_OATH.id);
    delayed.chooseJourneyStory(RELIEF_OATH.options[0]!.id);
    delayed.chooseJourneyStory(LEAD_SOURCE.options[1]!.id);
    const stationRoute = delayed
      .view()
      .areaExits.find((candidate) => candidate.destination.id === PREPARATION.area);
    if (!stationRoute) throw new Error("Expected the authored route to Hayden's Station.");
    delayed.moveArea(stationRoute.id);
    delayed.chooseJourneyStory(PREPARATION.profiles[2]!.id, PREPARATION.id);
    delayed.chooseJourneyStory(RELIEF_ALLOCATION.options[0]!.id, RELIEF_ALLOCATION.id);
    delayed.talkToCharacter(ALLY.contact);
    delayed.chooseJourneyStory(ALLY.solo_option_id);
    const beforeSnapshot = delayed.snapshot();
    const beforeHash = delayed.snapshotHash();
    expect(delayed.view().departureRecap?.dispatch).toMatchObject({
      state: "sealed",
      timing: "delayed",
      remainingOptional: [],
    });
    const delayedRecap = delayed.view().departureRecap;
    if (!delayedRecap?.dispatch) throw new Error("Expected delayed Station dispatch recap.");
    const delayedTerminal = render(delayed.view());
    expect(delayedTerminal).not.toContain("Dispatch sealed:");
    expect(delayedTerminal).toContain(`Dispatch ${String(delayedRecap.dispatch.minutes)}m—delayed`);
    expect(renderDepartureRecap(delayedRecap).join("\n")).toContain("Dispatch sealed:");
    expect(delayed.snapshot()).toEqual(beforeSnapshot);
    expect(delayed.snapshotHash()).toBe(beforeHash);
  });

  it("keeps only the authenticated plan visible beside every Station choice screen", () => {
    const session = stationSession();
    const beforeInspection = session.snapshot();
    const beforeHash = session.snapshotHash();
    const preparationStory = session.inspectJourneyStory(PREPARATION.id);
    expect(session.snapshot()).toEqual(beforeInspection);
    expect(session.snapshotHash()).toBe(beforeHash);
    const stages: Array<{
      kind: "preparation" | "relief_allocation" | "ally";
      story: NonNullable<ReturnType<OverworldSession["journey"]>["storyChoice"]>;
      selected: string[];
      open: string[];
      recap: NonNullable<ReturnType<OverworldSession["view"]>["departureRecap"]>;
      compact: ReturnType<OverworldSession["compactView"]>;
      terminal: string;
    }> = [];
    const captureStage = (
      kind: "preparation" | "relief_allocation" | "ally",
      story: NonNullable<ReturnType<OverworldSession["journey"]>["storyChoice"]>,
      selected: string[],
      open: string[],
    ): void => {
      const view = session.view();
      if (!view.departureRecap) throw new Error(`Expected a recap beside ${kind}.`);
      stages.push({
        kind,
        story,
        selected,
        open,
        recap: view.departureRecap,
        compact: session.compactView(),
        terminal: render(view),
      });
    };
    captureStage(
      "preparation",
      preparationStory,
      ["role", "duty", "evidence"],
      ["preparation", "relief_allocation", "field_team"],
    );

    session.chooseJourneyStory(PREPARATION.profiles[0]!.id, PREPARATION.id);
    captureStage(
      "relief_allocation",
      session.inspectJourneyStory(RELIEF_ALLOCATION.id),
      ["role", "duty", "evidence", "preparation"],
      ["relief_allocation", "field_team"],
    );

    session.chooseJourneyStory(RELIEF_ALLOCATION.options[0]!.id, RELIEF_ALLOCATION.id);
    session.talkToCharacter(ALLY.contact);
    const allyStory = session.journey().storyChoice;
    if (!allyStory) throw new Error("Expected an active June field-team choice.");
    captureStage(
      "ally",
      allyStory,
      ["role", "duty", "evidence", "preparation", "relief_allocation"],
      ["field_team"],
    );

    for (const stage of stages) {
      expect(stage.story.kind).toBe(stage.kind);
      const recap = stage.recap;
      expect(
        recap.entries.filter((entry) => entry.status === "selected").map((entry) => entry.slot),
      ).toEqual(stage.selected);
      expect(
        recap.entries
          .filter((entry) => entry.status === "open_optional")
          .map((entry) => entry.slot),
      ).toEqual(stage.open);
      if (stage.kind === "ally") {
        expect(stage.compact.departure_recap).toEqual([
          recap.version,
          recap.questId,
          recap.questTitle,
          recap.entries
            .filter((entry) => entry.status !== "open_optional")
            .map((entry) => [entry.slot, entry.status, entry.title]),
          recap.dispatch
            ? [
                recap.dispatch.state,
                recap.dispatch.minutes,
                recap.dispatch.timing,
                recap.dispatch.remainingOptional,
              ]
            : null,
        ]);
        expect(stage.compact.station_dispatch_board).toBeUndefined();
        expect(stage.terminal).toContain(`${WOLF.title} dispatch recap:`);
      } else {
        expect(stage.compact.departure_recap).toBeUndefined();
        expect(stage.compact.station_dispatch_board?.[4].map((row) => row.slice(0, 3))).toEqual(
          recap.entries
            .filter((entry) => entry.status !== "open_optional")
            .map((entry) => [entry.slot, entry.status, entry.title]),
        );
        expect(stage.terminal).not.toContain(`${WOLF.title} dispatch recap:`);
        expect(stage.terminal).toContain("Already set: `review dispatch`.");
      }
      const visible = JSON.stringify(recap);
      for (const alternative of [
        ...PREPARATION.profiles.filter((profile) => profile.id !== PREPARATION.profiles[0]!.id),
        ...RELIEF_ALLOCATION.options.filter(
          (option) => option.id !== RELIEF_ALLOCATION.options[0]!.id,
        ),
        ...ALLY.options,
      ]) {
        expect(visible).not.toContain(alternative.title);
      }
    }
  });
});
