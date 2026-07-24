import { describe, expect, it } from "vitest";

import { createToolApi } from "../../src/mcp/tools.js";
import {
  compactJourneyStoryChoiceComparison,
  type JourneyStoryChoiceComparison,
} from "../../src/mcp/journey_projection.js";
import type { JourneyStoryChoicePrompt } from "../../src/world/journey_contract.js";
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { OverworldSession as UiOverworldSession } from "../../ui/src/overworld.js";

const WORLD = loadOverworldManifest(process.cwd());
const REGISTRATION = WORLD.opening_registration!;
const RELIEF_OATH = WORLD.opening_relief_oath!;
const LEAD_SOURCE = WORLD.opening_lead_source!;
const PREPARATION = WORLD.opening_preparation!;
const RELIEF_ALLOCATION = WORLD.opening_relief_allocation!;
const ALLY = WORLD.opening_ally!;
const WOLF = WORLD.quests.find((quest) => quest.id === LEAD_SOURCE.target_quest)!;

function currentStoryChoice(session: OverworldSession): JourneyStoryChoicePrompt {
  const storyChoice = session.journey().storyChoice;
  if (!storyChoice) throw new Error("Expected an opening dispatch story choice.");
  return storyChoice;
}

function expectStage(
  session: OverworldSession,
  args: {
    id: string;
    kind: NonNullable<JourneyStoryChoicePrompt["kind"]>;
    phase: "Civic docket" | "Departure plan";
    step: number;
    total: number;
    label: string;
    originalTitle: string;
    originalMessage: string;
  },
): JourneyStoryChoicePrompt {
  const storyChoice = currentStoryChoice(session);
  expect(storyChoice).toMatchObject({ id: args.id, kind: args.kind });
  expect(storyChoice.message).toContain(
    `${WOLF.title} ${args.phase} · ${args.step}/${args.total} — ${args.label}.`,
  );
  expect(storyChoice.message).toContain(`${args.originalTitle}. ${args.originalMessage}`);
  return storyChoice;
}

function expectCompactRoutePreview(storyChoice: { message: string }): void {
  for (const option of WOLF.launch?.options ?? []) {
    const supplies = `${option.terms.supplies} ${
      option.terms.supplies === 1 ? "supply" : "supplies"
    }`;
    expect(storyChoice.message).toContain(
      `${option.title} (${option.terms.minutes} min, ${supplies}, fatigue +${option.terms.fatigue}): ${option.summary}`,
    );
    expect(storyChoice.message).not.toContain(option.preview);
  }
}

function expectSummaryFirstOptions(storyChoice: JourneyStoryChoicePrompt): void {
  for (const option of storyChoice.options) {
    expect(option.summary).toMatchObject({
      commitment: expect.any(String),
      fieldTrigger: expect.any(String),
    });
    expect(option.summary?.commitment.length).toBeGreaterThan(0);
    expect(option.summary?.fieldTrigger.length).toBeGreaterThan(0);
    expect(option.consequence).toContain(option.summary!.commitment);
    expect(option.consequence).toContain(option.summary!.fieldTrigger);
  }
}

function expectCompactSummaryOptions(storyChoice: JourneyStoryChoiceComparison): void {
  for (const option of storyChoice.options) {
    expect(option.summary).toMatchObject({
      commitment: expect.any(String),
      fieldTrigger: expect.any(String),
    });
    expect(option).not.toHaveProperty("consequence");
  }
  expect(storyChoice.inspectedOption).toBeNull();
}

function expectProgressivePreparationOptions(storyChoice: JourneyStoryChoicePrompt): void {
  for (const profile of PREPARATION.profiles) {
    const triggerCategory = profile.trigger_category;
    if (!triggerCategory) throw new Error(`Preparation ${profile.id} needs a trigger category.`);
    const option = storyChoice.options.find((candidate) => candidate.id === profile.id);
    expect(option?.summary).toEqual({
      commitment: profile.summary,
      fieldTrigger: triggerCategory,
      fieldTriggerScope: "category",
      immediateCost: expect.any(String),
    });
    expect(option?.summary?.commitment.split(/\s+/).length).toBeLessThanOrEqual(16);
    expect(option?.summary?.fieldTrigger.split(/\s+/).length).toBeLessThanOrEqual(10);
    expect(option?.summary?.fieldTrigger).not.toMatch(/\b(?:DC|success|failure)\b/i);
    expect(option?.consequence).toContain(`Full field terms: ${profile.preview}`);
    expect(option?.consequence).toContain(profile.consequence);
  }
}

function expectProgressivePreparationComparison(storyChoice: JourneyStoryChoiceComparison): void {
  for (const profile of PREPARATION.profiles) {
    const triggerCategory = profile.trigger_category;
    if (!triggerCategory) throw new Error(`Preparation ${profile.id} needs a trigger category.`);
    const option = storyChoice.options.find((candidate) => candidate.id === profile.id);
    expect(option?.summary).toEqual({
      commitment: profile.summary,
      fieldTrigger: triggerCategory,
      fieldTriggerScope: "category",
      immediateCost: expect.any(String),
    });
    expect(option).not.toHaveProperty("consequence");
  }
}

function expectProgressiveReliefAllocationOptions(storyChoice: JourneyStoryChoicePrompt): void {
  for (const allocationOption of RELIEF_ALLOCATION.options) {
    const triggerCategory = allocationOption.trigger_category;
    if (!triggerCategory) {
      throw new Error(`Relief allocation ${allocationOption.id} needs a trigger category.`);
    }
    const option = storyChoice.options.find((candidate) => candidate.id === allocationOption.id);
    expect(option?.summary).toEqual({
      commitment: allocationOption.summary,
      fieldTrigger: triggerCategory,
      fieldTriggerScope: "category",
      immediateCost: expect.any(String),
    });
    expect(option?.consequence).toContain(`Full field terms: ${allocationOption.preview}`);
    expect(option?.consequence).toContain(allocationOption.consequence);
  }
}

function expectProgressiveReliefAllocationComparison(
  storyChoice: JourneyStoryChoiceComparison,
): void {
  for (const allocationOption of RELIEF_ALLOCATION.options) {
    const triggerCategory = allocationOption.trigger_category;
    if (!triggerCategory) {
      throw new Error(`Relief allocation ${allocationOption.id} needs a trigger category.`);
    }
    const option = storyChoice.options.find((candidate) => candidate.id === allocationOption.id);
    expect(option?.summary).toEqual({
      commitment: allocationOption.summary,
      fieldTrigger: triggerCategory,
      fieldTriggerScope: "category",
      immediateCost: expect.any(String),
    });
    expect(option).not.toHaveProperty("consequence");
  }
}

describe("Albany Wolf-Winter dispatch briefing", () => {
  it("makes the mission concrete before choice one and separates Civic from departure decisions", () => {
    const session = new OverworldSession(WORLD);
    const opening = session.view();
    session.scoutPoi(opening.pois[0]!.id);
    session.talkToCharacter(REGISTRATION.contact);

    const registration = expectStage(session, {
      id: REGISTRATION.id,
      kind: "registration",
      phase: "Civic docket",
      step: 1,
      total: 3,
      label: "role",
      originalTitle: REGISTRATION.title,
      originalMessage: REGISTRATION.message,
    });
    expect(registration.message).toContain(`Mission preview — ${WOLF.discovery}`);
    expect(registration.message).toContain("At Civic: role → duty → evidence");
    expect(registration.message).toContain(
      "two docket decisions stay open. Each changes field conditions or consequences; none locks your solution.",
    );
    expectSummaryFirstOptions(registration);
    expect(
      registration.options.every((option) => option.summary?.immediateCost === undefined),
    ).toBe(true);
    expect(OverworldSession.restore(WORLD, session.snapshot()).journey().storyChoice).toEqual(
      registration,
    );
    const offer = session
      .snapshot()
      .journalEntries.find((entry) => entry.kind === "registration_offer");
    expect(offer).toMatchObject({
      title: REGISTRATION.title,
      text: REGISTRATION.message,
    });

    session.chooseJourneyStory(REGISTRATION.profiles[0]!.id);
    const oath = expectStage(session, {
      id: RELIEF_OATH.id,
      kind: "relief_oath",
      phase: "Civic docket",
      step: 2,
      total: 3,
      label: "duty",
      originalTitle: RELIEF_OATH.title,
      originalMessage: RELIEF_OATH.message,
    });
    expect(oath.message).toContain("Chosen at Civic: role. Now choose: duty.");
    expect(oath.message).toContain("Still ahead here: evidence.");
    expectSummaryFirstOptions(oath);
    expect(oath.options.every((option) => option.summary?.immediateCost)).toBe(true);
    expect(OverworldSession.restore(WORLD, session.snapshot()).journey().storyChoice).toEqual(oath);

    session.chooseJourneyStory(RELIEF_OATH.options[0]!.id);
    const source = expectStage(session, {
      id: LEAD_SOURCE.id,
      kind: "lead_source",
      phase: "Civic docket",
      step: 3,
      total: 3,
      label: "evidence",
      originalTitle: LEAD_SOURCE.title,
      originalMessage: LEAD_SOURCE.message,
    });
    expect(source.message).toContain("Chosen at Civic: role and duty. Now choose: evidence.");
    expectSummaryFirstOptions(source);
    expect(source.options.every((option) => option.summary?.immediateCost)).toBe(true);
    expect(OverworldSession.restore(WORLD, session.snapshot()).journey().storyChoice).toEqual(
      source,
    );

    session.chooseJourneyStory(LEAD_SOURCE.options[0]!.id);
    expect(session.journey().storyChoice).toBeNull();
    const route = session
      .view()
      .areaExits.find((candidate) => candidate.destination.id === RELIEF_ALLOCATION.area);
    if (!route) throw new Error("Expected a route to Albany's departure board.");
    session.moveArea(route.id);
    expect(session.journey().storyChoice).toBeNull();
    expect(session.view().departureInteractions[0]).toMatchObject({
      id: PREPARATION.id,
      kind: "preparation",
    });
    const preparation = session.inspectJourneyStory(PREPARATION.id);
    expect(preparation).toMatchObject({ id: PREPARATION.id, kind: "preparation" });
    expect(preparation.message).toContain(`${WOLF.title} Departure plan · 1/2 — preparation.`);
    expect(preparation.message).toContain(`${PREPARATION.title}. ${PREPARATION.message}`);
    expect(preparation.message).toContain("Still ahead: relief allocation.");
    expect(preparation.message).toContain(`Mission — ${WOLF.discovery}`);
    expectCompactRoutePreview(preparation);
    expectSummaryFirstOptions(preparation);
    expectProgressivePreparationOptions(preparation);
    expect(preparation.options.every((option) => option.summary?.immediateCost)).toBe(true);
    expect(
      OverworldSession.restore(WORLD, session.snapshot()).inspectJourneyStory(PREPARATION.id),
    ).toEqual(preparation);

    session.chooseJourneyStory(PREPARATION.profiles[0]!.id);
    expect(session.journey().storyChoice).toBeNull();
    expect(session.view().departureInteractions[0]).toMatchObject({
      id: RELIEF_ALLOCATION.id,
      kind: "relief_allocation",
    });
    const allocation = session.inspectJourneyStory(RELIEF_ALLOCATION.id);
    expect(allocation).toMatchObject({
      id: RELIEF_ALLOCATION.id,
      kind: "relief_allocation",
    });
    expect(allocation.message).toContain(`${WOLF.title} Departure plan · 2/2 — relief allocation.`);
    expect(allocation.message).toContain(
      `${RELIEF_ALLOCATION.title}. ${RELIEF_ALLOCATION.message}`,
    );
    expect(allocation.message).toContain("Still ahead: none.");
    expect(allocation.message).toContain(
      `Optional field-team choice follows: ${ALLY.options
        .map((option) => option.title)
        .slice(0, -1)
        .join(", ")}, and ${ALLY.options.at(-1)!.title}.`,
    );
    expect(allocation.message).toContain(`Mission — ${WOLF.discovery}`);
    expectCompactRoutePreview(allocation);
    expectSummaryFirstOptions(allocation);
    expectProgressiveReliefAllocationOptions(allocation);
    expect(allocation.options.every((option) => option.summary?.immediateCost)).toBe(true);
    expect(
      OverworldSession.restore(WORLD, session.snapshot()).inspectJourneyStory(RELIEF_ALLOCATION.id),
    ).toEqual(allocation);
  });

  it("presents the exact same first briefing through UI and MCP", () => {
    const ui = new UiOverworldSession(WORLD);
    const uiOpening = ui.view();
    ui.scoutPoi(uiOpening.pois[0]!.id);
    ui.talkToCharacter(REGISTRATION.contact);

    const api = createToolApi({ root: process.cwd() });
    const started = api.start_overworld({ compact_context: false });
    api.scout_overworld_session_poi({
      session_id: started.session_id,
      poi_id: started.observation.pois[0]!.id,
      compact_context: false,
      compact_result: false,
    });
    const talked = api.talk_overworld_session_contact({
      session_id: started.session_id,
      character_id: REGISTRATION.contact,
      compact_context: false,
      compact_result: false,
    });

    expect(talked.journey.storyChoice).toEqual(ui.journey().storyChoice);
    expect(talked.journey.storyChoice?.message).toContain(`Mission preview — ${WOLF.discovery}`);
    expectSummaryFirstOptions(talked.journey.storyChoice!);

    const sharedChoices = [
      REGISTRATION.profiles[0]!.id,
      RELIEF_OATH.options[0]!.id,
      LEAD_SOURCE.options[0]!.id,
    ];
    let compactJourney = talked.journey;
    for (const choice of sharedChoices) {
      ui.chooseJourneyStory(choice);
      compactJourney = api.choose_overworld_session_story({
        session_id: started.session_id,
        choice,
        compact_context: true,
        compact_result: true,
      }).journey;
    }
    expect(compactJourney.storyChoice).toEqual(ui.journey().storyChoice);
    expect(compactJourney.storyChoice).toBeNull();
    const stationRoute = ui
      .view()
      .areaExits.find((candidate) => candidate.destination.id === RELIEF_ALLOCATION.area);
    if (!stationRoute) throw new Error("Expected a UI route to the departure board.");
    ui.moveArea(stationRoute.id);
    compactJourney = api.move_overworld_session_area({
      session_id: started.session_id,
      area_route_id: stationRoute.id,
      compact_context: true,
      compact_result: true,
    }).journey;
    expect(compactJourney.storyChoice).toEqual(ui.journey().storyChoice);
    expect(compactJourney.storyChoice).toBeNull();
    expect(ui.view().departureInteractions[0]?.id).toBe(PREPARATION.id);
    const uiPreparation = ui.inspectJourneyStory(PREPARATION.id);
    const mcpPreparation = api.inspect_overworld_session_story({
      session_id: started.session_id,
      story_choice_id: PREPARATION.id,
      compact_context: true,
      compact_result: true,
    }).story;
    expect(mcpPreparation).toEqual(compactJourneyStoryChoiceComparison(uiPreparation));
    expect(mcpPreparation).not.toEqual(uiPreparation);
    expect(mcpPreparation.message).toContain(`Mission — ${WOLF.discovery}`);
    expectCompactRoutePreview(mcpPreparation);
    expectCompactSummaryOptions(mcpPreparation);
    expectProgressivePreparationComparison(mcpPreparation);
    expectSummaryFirstOptions(uiPreparation);
    expectProgressivePreparationOptions(uiPreparation);

    ui.chooseJourneyStory(PREPARATION.profiles[0]!.id);
    api.choose_overworld_session_story({
      session_id: started.session_id,
      story_choice_id: PREPARATION.id,
      choice: PREPARATION.profiles[0]!.id,
      compact_context: true,
    });
    const uiAllocation = ui.inspectJourneyStory(RELIEF_ALLOCATION.id);
    const mcpAllocation = api.inspect_overworld_session_story({
      session_id: started.session_id,
      story_choice_id: RELIEF_ALLOCATION.id,
      compact_context: true,
    }).story;
    expect(mcpAllocation).toEqual(compactJourneyStoryChoiceComparison(uiAllocation));
    expectProgressiveReliefAllocationComparison(mcpAllocation);
    expectProgressiveReliefAllocationOptions(uiAllocation);
  });
});
