import { describe, expect, it } from "vitest";

import { createToolApi } from "../../src/mcp/tools.js";
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
    step: number;
    label: string;
    originalTitle: string;
    originalMessage: string;
  },
): JourneyStoryChoicePrompt {
  const storyChoice = currentStoryChoice(session);
  expect(storyChoice).toMatchObject({ id: args.id, kind: args.kind });
  expect(storyChoice.message).toContain(`${WOLF.title} dispatch · ${args.step}/5 — ${args.label}.`);
  expect(storyChoice.message).toContain(`${args.originalTitle}. ${args.originalMessage}`);
  return storyChoice;
}

function expectCompactRoutePreview(storyChoice: JourneyStoryChoicePrompt): void {
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

describe("Albany Wolf-Winter dispatch briefing", () => {
  it("makes the mission concrete before choice one and tracks the five separate cards", () => {
    const session = new OverworldSession(WORLD);
    const opening = session.view();
    session.scoutPoi(opening.pois[0]!.id);
    session.talkToCharacter(REGISTRATION.contact);

    const registration = expectStage(session, {
      id: REGISTRATION.id,
      kind: "registration",
      step: 1,
      label: "role",
      originalTitle: REGISTRATION.title,
      originalMessage: REGISTRATION.message,
    });
    expect(registration.message).toContain(`Mission preview — ${WOLF.discovery}`);
    expect(registration.message).toContain(
      "role → duty → evidence → preparation → relief allocation",
    );
    expect(registration.message).toContain(
      "Each changes field conditions or consequences; none locks your solution.",
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
      step: 2,
      label: "duty",
      originalTitle: RELIEF_OATH.title,
      originalMessage: RELIEF_OATH.message,
    });
    expect(oath.message).toContain("Chosen: role. Now choose: duty.");
    expect(oath.message).toContain("Still ahead: evidence, preparation, and relief allocation.");

    session.chooseJourneyStory(RELIEF_OATH.options[0]!.id);
    const source = expectStage(session, {
      id: LEAD_SOURCE.id,
      kind: "lead_source",
      step: 3,
      label: "evidence",
      originalTitle: LEAD_SOURCE.title,
      originalMessage: LEAD_SOURCE.message,
    });
    expect(source.message).toContain("Chosen: role and duty. Now choose: evidence.");

    session.chooseJourneyStory(LEAD_SOURCE.options[0]!.id);
    const preparation = expectStage(session, {
      id: PREPARATION.id,
      kind: "preparation",
      step: 4,
      label: "preparation",
      originalTitle: PREPARATION.title,
      originalMessage: PREPARATION.message,
    });
    expect(preparation.message).toContain("Still ahead: relief allocation.");
    expect(preparation.message).toContain(`Mission — ${WOLF.discovery}`);
    expectCompactRoutePreview(preparation);

    session.chooseJourneyStory(PREPARATION.profiles[0]!.id);
    const route = session
      .view()
      .areaExits.find((candidate) => candidate.destination.id === RELIEF_ALLOCATION.area);
    if (!route) throw new Error("Expected a route to Albany's departure board.");
    session.moveArea(route.id);
    const allocation = expectStage(session, {
      id: RELIEF_ALLOCATION.id,
      kind: "relief_allocation",
      step: 5,
      label: "relief allocation",
      originalTitle: RELIEF_ALLOCATION.title,
      originalMessage: RELIEF_ALLOCATION.message,
    });
    expect(allocation.message).toContain("Still ahead: none.");
    expect(allocation.message).toContain(
      `Optional field-team choice follows: ${ALLY.options
        .map((option) => option.title)
        .slice(0, -1)
        .join(", ")}, and ${ALLY.options.at(-1)!.title}.`,
    );
    expect(allocation.message).toContain(`Mission — ${WOLF.discovery}`);
    expectCompactRoutePreview(allocation);
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
    expect(compactJourney.storyChoice?.kind).toBe("preparation");
    expect(compactJourney.storyChoice?.message).toContain(`Mission — ${WOLF.discovery}`);
    expectCompactRoutePreview(compactJourney.storyChoice!);
  });
});
