import { describe, expect, it } from "vitest";

import { createToolApi } from "../../src/mcp/tools.js";
import {
  compactJourneyStoryChoiceComparison,
  type CompactJourneyPresentation,
  type JourneyStoryChoiceSummaryComparison,
} from "../../src/mcp/journey_projection.js";
import {
  journeyStoryChoiceOptionsForPresentation,
  type JourneyPresentation,
  type JourneyStoryChoicePrompt,
} from "../../src/world/journey_contract.js";
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
const ALLY_CONTACT = WORLD.characters.find((character) => character.id === ALLY.contact)!;
const FIELD_CHECK_TIMING = "Field checks surface with their action before resolution.";
const REGISTRATION_HEADER = `Choose who you were and the promise you carry. Compare exact cost and what each role gives up. ${FIELD_CHECK_TIMING}`;
const OATH_HEADER = `Choose whose authority you accept and the promise you make. Compare exact cost and what each duty gives up. ${FIELD_CHECK_TIMING}`;
const STANDARD_PACKET_OATH_HEADER = `Compare route promises, exact cost, and tradeoffs. ${FIELD_CHECK_TIMING}`;
const SOURCE_HEADER = `Certify one account; the other two close. Compare its priority, exact cost, and what it gives up. ${FIELD_CHECK_TIMING}`;
const PREPARATION_HEADER = `Choose one optional field priority, or leave without one. Compare exact cost and what it gives up. ${FIELD_CHECK_TIMING}`;
const RELIEF_ALLOCATION_HEADER = `Choose whom Albany protects, or leave capacity unassigned. Compare each priority's exact cost and what remains exposed. ${FIELD_CHECK_TIMING}`;

function expectedPreparationCheckFit(profile: (typeof PREPARATION.profiles)[number]): string {
  const check = profile.check_disclosure;
  if (!check) throw new Error(`Preparation "${profile.id}" requires a check disclosure.`);
  const character = REGISTRATION.profiles[0]!.character;
  const modifier = character.skills.find((skill) => skill.skillId === check.skill_id)?.rank ?? 0;
  const signedModifier = modifier >= 0 ? `+${String(modifier)}` : String(modifier);
  return `${check.skill_label} ${signedModifier} vs DC ${String(check.difficulty)}`;
}

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
    presentedMessage: string;
  },
): JourneyStoryChoicePrompt {
  const storyChoice = currentStoryChoice(session);
  expect(storyChoice).toMatchObject({ id: args.id, kind: args.kind });
  expect(storyChoice.message).toContain(
    `${WOLF.title} ${args.phase} · ${args.step}/${args.total} — ${args.label}.`,
  );
  expect(storyChoice.message).toContain(`${args.originalTitle}. ${args.presentedMessage}`);
  expect(storyChoice.message).not.toContain(args.originalMessage);
  return storyChoice;
}

function expectLaunchDetailsDeferred(storyChoice: { message: string }): void {
  expect(storyChoice.message).toContain(
    `Mission: ${WOLF.title}. Last-mile route costs and field tradeoffs remain on its launch card.`,
  );
  expect(storyChoice.message).not.toContain(WOLF.discovery);
  for (const option of WOLF.launch?.options ?? []) {
    expect(storyChoice.message).not.toContain(option.title);
    expect(storyChoice.message).not.toContain(option.summary);
    expect(storyChoice.message).not.toContain(option.preview);
  }
}

function expectSummaryFirstOptions(storyChoice: JourneyStoryChoicePrompt): void {
  for (const option of storyChoice.options) {
    expect(option.summary).toMatchObject({
      commitment: expect.any(String),
      immediateCost: expect.any(String),
      tradeoff: expect.any(String),
    });
    expect(option.summary?.commitment.length).toBeGreaterThan(0);
    expect(option.summary?.immediateCost.length).toBeGreaterThan(0);
    expect(option.summary?.tradeoff.length).toBeGreaterThan(0);
    expect(option.summary).not.toHaveProperty("fieldTrigger");
    expect(option.consequence).toContain("Benefit:");
    expect(option.consequence).toContain(`Cost: ${option.summary!.immediateCost}.`);
    expect(option.consequence).toContain(`Boundary: ${option.summary!.tradeoff}`);
  }
}

function wordCount(value: string): number {
  return value.match(/\S+/g)?.length ?? 0;
}

function expectRoleplayFirstFraming(storyChoice: JourneyStoryChoicePrompt): void {
  expect(storyChoice.message).toMatch(/\b(?:promises?|priorit(?:y|ies))\b/i);
  expect(storyChoice.message).toContain("exact cost");
  expect(storyChoice.message).toMatch(/\b(?:gives up|remains exposed|tradeoffs?)\b/i);
  expect(storyChoice.message).toContain(FIELD_CHECK_TIMING);
  expect(storyChoice.message).not.toMatch(
    /broad field fit|trigger category|inspect a card|exact check|recovery chain/i,
  );
}

function expectCompactSummaryOptions(storyChoice: JourneyStoryChoiceSummaryComparison): void {
  for (const option of storyChoice.options) {
    expect(option.summary).toMatchObject({
      commitment: expect.any(String),
      immediateCost: expect.any(String),
      tradeoff: expect.any(String),
    });
    expect(option.summary).not.toHaveProperty("fieldTrigger");
    expect(option).not.toHaveProperty("consequence");
  }
  expect(storyChoice.inspectedOption).toBeNull();
}

function expectProgressivePreparationOptions(storyChoice: JourneyStoryChoicePrompt): void {
  for (const profile of PREPARATION.profiles) {
    const option = storyChoice.options.find((candidate) => candidate.id === profile.id);
    expect(option?.summary).toEqual({
      commitment: profile.summary,
      checkFit: expectedPreparationCheckFit(profile),
      immediateCost: expect.any(String),
      tradeoff: profile.tradeoff,
    });
    expect(option?.summary?.commitment.split(/\s+/).length).toBeLessThanOrEqual(16);
    expect(option?.consequence).toContain(`Benefit: ${profile.trigger_category}`);
    expect(option?.consequence).toContain(`Boundary: ${profile.tradeoff}`);
    expect(option?.consequence).not.toContain(profile.preview);
    expect(option?.consequence).not.toContain(profile.consequence);
  }
}

function expectProgressivePreparationComparison(
  storyChoice: JourneyStoryChoiceSummaryComparison,
): void {
  for (const profile of PREPARATION.profiles) {
    const option = storyChoice.options.find((candidate) => candidate.id === profile.id);
    expect(option?.summary).toEqual({
      commitment: profile.summary,
      checkFit: expectedPreparationCheckFit(profile),
      immediateCost: expect.any(String),
      tradeoff: profile.tradeoff,
    });
    expect(option).not.toHaveProperty("consequence");
  }
}

function expectProgressiveReliefAllocationOptions(storyChoice: JourneyStoryChoicePrompt): void {
  for (const allocationOption of RELIEF_ALLOCATION.options) {
    const option = storyChoice.options.find((candidate) => candidate.id === allocationOption.id);
    expect(option?.summary).toEqual({
      commitment: allocationOption.summary,
      immediateCost: expect.any(String),
      tradeoff: `Leaves exposed: ${allocationOption.leaves_exposed}`,
    });
    expect(option?.consequence).toContain(`Benefit: ${allocationOption.trigger_category}`);
    expect(option?.consequence).toContain(`Boundary: Leaves exposed:`);
    expect(option?.consequence).not.toContain(allocationOption.preview);
    expect(option?.consequence).not.toContain(allocationOption.consequence);
  }
}

function expectProgressiveReliefAllocationComparison(
  storyChoice: JourneyStoryChoiceSummaryComparison,
): void {
  for (const allocationOption of RELIEF_ALLOCATION.options) {
    const option = storyChoice.options.find((candidate) => candidate.id === allocationOption.id);
    expect(option?.summary).toEqual({
      commitment: allocationOption.summary,
      immediateCost: expect.any(String),
      tradeoff: `Leaves exposed: ${allocationOption.leaves_exposed}`,
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

    const registration = currentStoryChoice(session);
    expect(registration).toMatchObject({ id: REGISTRATION.id, kind: "registration" });
    expect(registration.message).toContain(`${WOLF.title} Civic docket · 1/3 — role.`);
    expect(registration.message).toContain(`${REGISTRATION.title}. ${REGISTRATION_HEADER}`);
    expect(registration.message).not.toContain(REGISTRATION.message);
    expect(registration.message).toContain(`Mission preview — ${WOLF.discovery}`);
    expect(registration.message).toContain(
      "At Civic: role → duty → evidence. Choose only your role now; duty and evidence follow. None locks your field solution.",
    );
    expect(registration.options.map((option) => option.id)).toEqual(
      REGISTRATION.profiles.map((profile) => profile.id),
    );
    expect(registration.options.every((option) => option.group === undefined)).toBe(true);
    expectRoleplayFirstFraming(registration);
    expect(wordCount(registration.message)).toBeLessThanOrEqual(120);
    expectSummaryFirstOptions(registration);
    expect(registration.options.every((option) => option.summary?.immediateCost)).toBe(true);
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
      presentedMessage: STANDARD_PACKET_OATH_HEADER,
    });
    const standardPacket = REGISTRATION.doctrines!.find(
      (doctrine) => doctrine.profile_id === REGISTRATION.profiles[0]!.id,
    )!;
    expect(oath.message).toContain(
      "Civic role chosen. Choose its standard duty + evidence packet, or customize.",
    );
    expect(oath.options.map((option) => option.id)).toEqual([
      standardPacket.id,
      ...RELIEF_OATH.options.map((option) => option.id),
    ]);
    expectRoleplayFirstFraming(oath);
    expect(wordCount(oath.message)).toBeLessThanOrEqual(50);
    expectSummaryFirstOptions(oath);
    expect(oath.options.every((option) => option.summary?.immediateCost)).toBe(true);
    expect(oath.progressiveDisclosure).toEqual({
      initialOptionIds: [standardPacket.id],
      reveal: {
        id: "customize_duty_and_evidence",
        label: "Compare individual duties",
        description:
          "Review individual duties without choosing; selecting one leads to its evidence choice.",
        optionIds: RELIEF_OATH.options.map((option) => option.id),
      },
    });
    expect(journeyStoryChoiceOptionsForPresentation(oath).map((option) => option.id)).toEqual([
      standardPacket.id,
    ]);
    expect(
      journeyStoryChoiceOptionsForPresentation(oath, "customize_duty_and_evidence").map(
        (option) => option.id,
      ),
    ).toEqual([standardPacket.id, ...RELIEF_OATH.options.map((option) => option.id)]);
    expect(() => journeyStoryChoiceOptionsForPresentation(oath, "not_a_reveal")).toThrow(
      /no progressive disclosure/i,
    );
    expect(OverworldSession.restore(WORLD, session.snapshot()).journey().storyChoice).toEqual(oath);

    const ledgerSession = new OverworldSession(WORLD);
    ledgerSession.scoutPoi(ledgerSession.view().pois[0]!.id);
    ledgerSession.talkToCharacter(REGISTRATION.contact);
    ledgerSession.chooseJourneyStory("albany:ledger_advocate");
    const ledgerOath = expectStage(ledgerSession, {
      id: RELIEF_OATH.id,
      kind: "relief_oath",
      phase: "Civic docket",
      step: 2,
      total: 3,
      label: "duty",
      originalTitle: RELIEF_OATH.title,
      originalMessage: RELIEF_OATH.message,
      presentedMessage: OATH_HEADER,
    });
    expect(ledgerOath.options.map((option) => option.id)).toEqual(
      RELIEF_OATH.options.map((option) => option.id),
    );
    expect(ledgerOath).not.toHaveProperty("progressiveDisclosure");
    expect(journeyStoryChoiceOptionsForPresentation(ledgerOath).map((option) => option.id)).toEqual(
      RELIEF_OATH.options.map((option) => option.id),
    );
    expect(ledgerOath.message).not.toContain("standard packet for duty + evidence");

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
      presentedMessage: SOURCE_HEADER,
    });
    expect(source.message).toContain("Chosen at Civic: role and duty. Now choose: evidence.");
    expect(source.message).toContain(`Certify the Wolf-Winter Source Packet. ${SOURCE_HEADER}`);
    expect(source.message).not.toContain(LEAD_SOURCE.message);
    expectRoleplayFirstFraming(source);
    expect(wordCount(source.message)).toBeLessThanOrEqual(60);
    expectSummaryFirstOptions(source);
    expect(source.options.every((option) => option.summary?.immediateCost)).toBe(true);
    expect(OverworldSession.restore(WORLD, session.snapshot()).journey().storyChoice).toEqual(
      source,
    );
    expect(
      session.snapshot().journalEntries.find((entry) => entry.kind === "lead_source_offer"),
    ).toMatchObject({
      title: LEAD_SOURCE.title,
      text: LEAD_SOURCE.message,
    });

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
    expect(preparation.message).toContain(`${WOLF.title} · optional preparation.`);
    expect(preparation.message).toContain(`${PREPARATION.title}. ${PREPARATION_HEADER}`);
    expect(preparation.message).not.toContain(PREPARATION.message);
    expect(preparation.message).toContain(
      `Choose one preparation, or close this and launch ${WOLF.title} without one.`,
    );
    expect(preparation.message).not.toContain("relief-capacity choice");
    expect(preparation.message).toContain(
      `${ALLY_CONTACT.name}'s field-team conversation is separate.`,
    );
    expectRoleplayFirstFraming(preparation);
    expect(preparation.message).not.toMatch(/Departure plan|1\/2|Still ahead/i);
    expect(wordCount(preparation.message)).toBeLessThanOrEqual(70);
    expectLaunchDetailsDeferred(preparation);
    expectSummaryFirstOptions(preparation);
    expectProgressivePreparationOptions(preparation);
    expect(preparation.options.every((option) => option.summary?.immediateCost)).toBe(true);
    expect(preparation.options.every((option) => option.dispatchForecast)).toBe(true);
    expect(
      preparation.options.every((option) =>
        option.dispatchForecast?.line.startsWith("Dispatch forecast if chosen:"),
      ),
    ).toBe(true);
    expect(
      OverworldSession.restore(WORLD, session.snapshot()).inspectJourneyStory(PREPARATION.id),
    ).toEqual(preparation);

    session.chooseJourneyStory(PREPARATION.profiles[0]!.id);
    expect(
      session.snapshot().journalEntries.find((entry) => entry.kind === "preparation_offer"),
    ).toMatchObject({
      title: PREPARATION.title,
      text: PREPARATION.message,
    });
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
    expect(allocation.message).toContain(`${WOLF.title} · optional relief priority.`);
    expect(allocation.message).toContain(`${RELIEF_ALLOCATION.title}. ${RELIEF_ALLOCATION_HEADER}`);
    expect(allocation.message).not.toContain(RELIEF_ALLOCATION.message);
    expect(allocation.message).not.toMatch(/Departure plan|2\/2|Still ahead|Chosen for departure/i);
    expect(allocation.message).not.toContain("Optional field-team choice follows");
    expect(allocation.message).toContain(
      "Choose one relief priority, or close this and leave capacity unassigned.",
    );
    expect(allocation.message).not.toMatch(/\b(?:required|mandatory)\b/i);
    expect(allocation.message).toContain(
      `${ALLY_CONTACT.name}'s field-team conversation is separate; launching now keeps the solo route legal.`,
    );
    expectRoleplayFirstFraming(allocation);
    expect(wordCount(allocation.message)).toBeLessThanOrEqual(75);
    expectLaunchDetailsDeferred(allocation);
    expectSummaryFirstOptions(allocation);
    expectProgressiveReliefAllocationOptions(allocation);
    expect(allocation.options.every((option) => option.summary?.immediateCost)).toBe(true);
    expect(allocation.options.every((option) => option.dispatchImpact)).toBe(true);
    expect(
      allocation.options.every((option) => option.dispatchImpact?.line.startsWith("Dispatch:")),
    ).toBe(true);
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

    const standardPacket = REGISTRATION.doctrines!.find(
      (doctrine) => doctrine.profile_id === REGISTRATION.profiles[0]!.id,
    )!;
    const sharedChoices = [REGISTRATION.profiles[0]!.id, standardPacket.id];
    let compactJourney: JourneyPresentation | CompactJourneyPresentation = talked.journey;
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
    const mcpStation = api.move_overworld_session_area({
      session_id: started.session_id,
      area_route_id: stationRoute.id,
      compact_context: true,
      compact_result: true,
    });
    compactJourney = mcpStation.journey;
    expect(compactJourney.storyChoice).toEqual(ui.journey().storyChoice);
    expect(compactJourney.storyChoice).toBeNull();
    expect(mcpStation.context.departure_recap).toEqual(ui.compactView().departure_recap);
    expect(mcpStation.context.departure_recap?.[3]).toHaveLength(6);
    expect(
      Object.keys(mcpStation.context).filter((key) =>
        [
          "quests",
          "quest_starts",
          "departure_recap",
          "departure_interactions",
          "departure_contact_leads",
        ].includes(key),
      ),
    ).toEqual([
      "quests",
      "quest_starts",
      "departure_recap",
      "departure_interactions",
      "departure_contact_leads",
    ]);
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
    expectLaunchDetailsDeferred(mcpPreparation);
    expectCompactSummaryOptions(mcpPreparation);
    expectProgressivePreparationComparison(mcpPreparation);
    expectSummaryFirstOptions(uiPreparation);
    expectProgressivePreparationOptions(uiPreparation);

    ui.chooseJourneyStory(PREPARATION.profiles[0]!.id);
    const mcpPreparationSelected = api.choose_overworld_session_story({
      session_id: started.session_id,
      story_choice_id: PREPARATION.id,
      choice: PREPARATION.profiles[0]!.id,
      compact_context: true,
    });
    expect(mcpPreparationSelected.context.departure_recap).toEqual(
      ui.compactView().departure_recap,
    );
    expect(mcpPreparationSelected.context.departure_recap?.[4]).toBeNull();
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
