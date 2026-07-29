import { describe, expect, it } from "vitest";

import { render } from "../../bin/overworld_play.js";
import {
  OVERWORLD_COMPACT_VIEW_VERSION,
  cloneOverworldCompactView,
  compactOverworldQuestRef,
  compactOverworldView,
} from "../../src/world/compact_view.js";
import {
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
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import type { JourneyStoryChoicePrompt } from "../../src/world/journey_contract.js";

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

function stationSession(roleIndex = 0): OverworldSession {
  const session = new OverworldSession(WORLD);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(REGISTRATION.contact);
  session.chooseJourneyStory(REGISTRATION.profiles[roleIndex]!.id);
  session.chooseJourneyStory(RELIEF_OATH.options[0]!.id);
  session.chooseJourneyStory(LEAD_SOURCE.options[0]!.id);
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

    expect(full.departureRecap).toEqual({
      version: 4,
      questId: WOLF.id,
      questTitle: WOLF.title,
      entries: [
        {
          slot: "role",
          label: "Role",
          status: "selected",
          title: REGISTRATION.profiles[0]!.title,
          activeFieldTerm: REGISTRATION.profiles[0]!.tradeoff,
        },
        {
          slot: "duty",
          label: "Duty",
          status: "selected",
          title: RELIEF_OATH.options[0]!.title,
          activeFieldTerm: dutyFieldTerm,
        },
        {
          slot: "evidence",
          label: "Evidence",
          status: "selected",
          title: LEAD_SOURCE.options[0]!.title,
          activeFieldTerm: evidenceFieldTerm,
        },
        {
          slot: "preparation",
          label: "Preparation",
          status: "open_optional",
          title: null,
          activeFieldTerm: null,
        },
        {
          slot: "relief_allocation",
          label: "Relief allocation",
          status: "available_after_preparation",
          title: null,
          activeFieldTerm: null,
        },
        {
          slot: "field_team",
          label: "Field team",
          status: "available_after_preparation",
          title: null,
          activeFieldTerm: null,
        },
      ],
      dispatch: null,
    });
    expect(compact.v).toBe(OVERWORLD_COMPACT_VIEW_VERSION);
    expect(compact.departure_recap).toEqual([
      4,
      WOLF.id,
      WOLF.title,
      full.departureRecap!.entries.map((entry) => [
        entry.slot,
        entry.label,
        entry.status,
        entry.title,
        entry.activeFieldTerm,
      ]),
      null,
    ]);
    const launchFirstKeys = (value: object) =>
      Object.keys(value).filter((key) =>
        [
          "quests",
          "quest_starts",
          "departure_recap",
          "departure_interactions",
          "departure_contact_leads",
        ].includes(key),
      );
    const expectedLaunchFirstKeys = [
      "quests",
      "quest_starts",
      "departure_recap",
      "departure_interactions",
      "departure_contact_leads",
    ];
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
      wolfQuest.launch.options.map((option) => option.tradeoffSummary ?? option.summary),
    );
    expect(
      JSON.stringify(defaultWolfRef).length - JSON.stringify(focusedWolfRef).length,
    ).toBeGreaterThan(700);
    const gatedView = { ...full, questStarts: [] };
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
    expect(gatedTerminal.indexOf(`${WOLF.title} dispatch recap:`)).toBeLessThan(
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
    (
      compact.departure_recap as unknown as [
        number,
        string,
        string,
        Array<[string, string, string, string | null, string | null]>,
      ]
    )[3][0]![3] = "forged compact title";
    expect(selectedTitle(session, "role")).toBe(REGISTRATION.profiles[0]!.title);
    expect(session.compactView().departure_recap?.[3][0]?.[3]).toBe(
      REGISTRATION.profiles[0]!.title,
    );
    expect(session.compactView().departure_recap?.[3][0]?.[4]).toBe(
      REGISTRATION.profiles[0]!.tradeoff,
    );

    const terminal = render(session.view());
    expect(terminal).toContain(
      "Start the mission now; choosing an available road is the next step, and planning is optional.",
    );
    expect(terminal).toContain(
      `Start with \`start ${WOLF.title}\`; route selection follows before commitment.`,
    );
    expect(terminal).toContain(`${WOLF.title} dispatch recap:`);
    expect(terminal).toContain(`Role: ${REGISTRATION.profiles[0]!.title}`);
    expect(terminal).toContain(`Active field term: ${REGISTRATION.profiles[0]!.tradeoff}`);
    expect(terminal).toContain("Preparation: Open (optional)");
    expect(terminal).not.toContain("Dispatch committed:");
    expect(terminal.indexOf("Depart now:")).toBeLessThan(
      terminal.indexOf("Plan the dispatch (optional):"),
    );
    expect(terminal.indexOf("Plan the dispatch (optional):")).toBeLessThan(
      terminal.indexOf(`${WOLF.title} dispatch recap:`),
    );
    expect(terminal.indexOf("Take the Exposed Ridge Road")).toBeLessThan(
      terminal.indexOf("Plan the dispatch (optional):"),
    );
    const promotedLaunch = terminal.slice(
      terminal.indexOf("Depart now:"),
      terminal.indexOf("Plan the dispatch (optional):"),
    );
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
    expect(canonicalWindow(first)).toMatchObject({ status: "legacy_neutral" });
    expect(first.view().departureRecap?.dispatch).toBeNull();
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
    const soloWindow = canonicalWindow(first);
    expect(soloWindow.status).toBe("on_time");
    if (soloWindow.status !== "on_time" && soloWindow.status !== "delayed") {
      throw new Error("Expected the canonical solo dispatch window.");
    }
    expect(first.view().departureRecap?.dispatch).toEqual({
      state: "direct_launch",
      minutes: soloWindow.ledgerMinutes,
      timing: soloWindow.status,
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
      label: "Field team",
      status: "solo_default",
      title: "Solo departure",
      activeFieldTerm: null,
    });
    expect(first.view().departureContactLeads).toMatchObject([
      {
        kind: "ally",
        status: "ready",
        action: { arguments: { character_id: ALLY.contact } },
      },
    ]);
    expect(render(first.view())).toContain(
      "Solo departure (direct-launch default; field-team contact remains optional)",
    );
    expect(render(first.view())).toContain(
      `Direct launch now: ${String(soloWindow.ledgerMinutes)}m — on time. Field-team contact remains optional.`,
    );
    first.talkToCharacter(ALLY.contact);
    expect(first.journey().storyChoice?.kind).toBe("ally");
    expect(first.view().departureRecap?.dispatch).toEqual({
      state: "committed",
      minutes: soloWindow.ledgerMinutes,
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
      title: soloOption.title,
    });
    expect(render(solo.view())).toContain("Dispatch sealed:");

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

  it("shows no prep-only total, then changes an authenticated direct launch into pending June terms", () => {
    const session = stationSession();
    session.chooseJourneyStory(PREPARATION.profiles[0]!.id, PREPARATION.id);
    expect(canonicalWindow(session)).toMatchObject({ status: "legacy_neutral" });
    expect(session.view().departureRecap?.dispatch).toBeNull();
    expect(render(session.view())).not.toContain("Dispatch committed:");
    session.chooseJourneyStory(RELIEF_ALLOCATION.options[0]!.id, RELIEF_ALLOCATION.id);
    const directLaunchWindow = canonicalWindow(session);
    expect(directLaunchWindow.status).toBe("on_time");
    if (directLaunchWindow.status !== "on_time" && directLaunchWindow.status !== "delayed") {
      throw new Error("Expected the canonical direct-launch dispatch receipt.");
    }
    expect(session.view().departureRecap?.dispatch).toEqual({
      state: "direct_launch",
      minutes: directLaunchWindow.ledgerMinutes,
      timing: directLaunchWindow.status,
      remainingOptional: ["field_team"],
    });
    session.talkToCharacter(ALLY.contact);
    const pendingWindow = canonicalWindow(session);
    expect(pendingWindow.status).toBe("june_commitment_pending");
    if (pendingWindow.status !== "june_commitment_pending") {
      throw new Error("Expected the canonical pending June dispatch receipt.");
    }
    const pendingRecap = deriveOpeningDepartureRecap({
      world: WORLD,
      journalEntries: session.snapshot().journalEntries,
    });
    expect(pendingRecap?.dispatch).toEqual({
      state: "committed",
      minutes: pendingWindow.committedMinutes,
      timing: null,
      remainingOptional: ["field_team"],
    });
    expect(session.view().departureRecap).toEqual(pendingRecap);
    expect(JSON.stringify(pendingRecap)).not.toContain("forecast");
    const compact = session.compactView();
    expect(compact.departure_recap?.[4]).toEqual([
      "committed",
      pendingWindow.committedMinutes,
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

    const sealed = stationSession();
    sealed.chooseJourneyStory(PREPARATION.profiles[0]!.id, PREPARATION.id);
    sealed.chooseJourneyStory(RELIEF_ALLOCATION.options[0]!.id, RELIEF_ALLOCATION.id);
    const recap = sealed.view().departureRecap;
    if (!recap?.dispatch) throw new Error("Expected a canonical sealed solo dispatch line.");
    expect(sealed.compactView().departure_recap?.[4]).toEqual([
      "direct_launch",
      recap.dispatch.minutes,
      recap.dispatch.timing,
      ["field_team"],
    ]);
    const sealedCompact = sealed.compactView();
    const sealedCompactDispatch = sealedCompact.departure_recap?.[4];
    if (!sealedCompactDispatch) throw new Error("Expected a compact sealed dispatch line.");
    (sealedCompactDispatch as unknown as [string, number, string, string[]])[1] = 999;
    expect(sealed.compactView().departure_recap?.[4]?.[1]).toBe(recap.dispatch.minutes);

    const forged = sealed.snapshot();
    const preparation = forged.journalEntries.find((entry) => entry.kind === "preparation");
    if (!preparation) throw new Error("Expected preparation evidence.");
    preparation.text = "forged preparation receipt";
    expect(
      deriveOpeningDepartureRecap({ world: WORLD, journalEntries: forged.journalEntries }),
    ).toBeNull();
  });

  it("classifies authenticated on-time and delayed plan totals without changing either plan", () => {
    const onTime = stationSession();
    onTime.chooseJourneyStory(PREPARATION.profiles[0]!.id, PREPARATION.id);
    onTime.chooseJourneyStory(RELIEF_ALLOCATION.options[0]!.id, RELIEF_ALLOCATION.id);
    expect(onTime.view().departureRecap?.dispatch).toMatchObject({
      state: "direct_launch",
      timing: "on_time",
    });

    const delayed = new OverworldSession(WORLD);
    delayed.scoutPoi(delayed.view().pois[0]!.id);
    delayed.talkToCharacter(REGISTRATION.contact);
    delayed.chooseJourneyStory(REGISTRATION.profiles[0]!.id);
    delayed.chooseJourneyStory(RELIEF_OATH.options[0]!.id);
    delayed.chooseJourneyStory(LEAD_SOURCE.options[1]!.id);
    const stationRoute = delayed
      .view()
      .areaExits.find((candidate) => candidate.destination.id === PREPARATION.area);
    if (!stationRoute) throw new Error("Expected the authored route to Hayden's Station.");
    delayed.moveArea(stationRoute.id);
    delayed.chooseJourneyStory(PREPARATION.profiles[2]!.id, PREPARATION.id);
    delayed.chooseJourneyStory(RELIEF_ALLOCATION.options[0]!.id, RELIEF_ALLOCATION.id);
    const beforeSnapshot = delayed.snapshot();
    const beforeHash = delayed.snapshotHash();
    expect(delayed.view().departureRecap?.dispatch).toMatchObject({
      state: "direct_launch",
      timing: "delayed",
      remainingOptional: ["field_team"],
    });
    expect(render(delayed.view())).toContain("Direct launch now:");
    expect(render(delayed.view())).toContain("delayed.");
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
    captureStage("preparation", preparationStory, ["role", "duty", "evidence"], ["preparation"]);

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
      expect(stage.compact.departure_recap).toEqual([
        recap.version,
        recap.questId,
        recap.questTitle,
        recap.entries.map((entry) => [
          entry.slot,
          entry.label,
          entry.status,
          entry.title,
          entry.activeFieldTerm,
        ]),
        recap.dispatch
          ? [
              recap.dispatch.state,
              recap.dispatch.minutes,
              recap.dispatch.timing,
              recap.dispatch.remainingOptional,
            ]
          : null,
      ]);
      expect(stage.terminal).toContain(`${WOLF.title} dispatch recap:`);
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
