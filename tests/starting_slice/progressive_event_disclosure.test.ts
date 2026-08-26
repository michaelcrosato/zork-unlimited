import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createToolApi } from "../../src/mcp/tools.js";
import {
  compactOverworldEventScenes,
  compactOverworldView,
  OVERWORLD_COMPACT_VIEW_VERSION,
} from "../../src/world/compact_view.js";
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import {
  hasLiveOverworldEventChoice,
  OverworldSession as UiOverworldSession,
} from "../../ui/src/overworld.js";
import { revealCurrentJourneyStoryOptions } from "../regression/support/journey_story.js";

const WORLD = loadOverworldManifest(process.cwd());
const EVENT_ID = "albany_city__civic_core__event";
const EVENT_PAUSED_MESSAGE = "No authored choice is currently available in this journey state.";
const EVENT_INVESTIGATE_MESSAGE = "Required first: investigate this event.";
const STORY_ACTION_BLOCKED_MESSAGE = "Choose the open story option before taking another action.";

function expectEventLeadParity(session: OverworldSession, message: string): void {
  const compact = session.compactView();
  expect(compact).toEqual(compactOverworldView(session.view()));
  expect(compact.event_leads?.[0]?.[2]).toBe(message);
}

function expectInvestigationRejectedWithoutMutation(
  session: OverworldSession,
  message: string,
): void {
  const beforeBytes = JSON.stringify(session.snapshot());
  const beforeHash = session.snapshotHash();
  let rejection: unknown;
  try {
    session.investigateEvent(EVENT_ID);
  } catch (error) {
    rejection = error;
  }
  expect(rejection).toBeInstanceOf(Error);
  expect((rejection as Error).message).toBe(message);
  expect(JSON.stringify(session.snapshot())).toBe(beforeBytes);
  expect(session.snapshotHash()).toBe(beforeHash);
}

function settleAlbanyOpening(session: OverworldSession): void {
  session.chooseJourneyStory("albany:ledger_advocate");
  revealCurrentJourneyStoryOptions(session, WORLD.opening_relief_oath!.id);
  session.chooseJourneyStory("albany:oath_limited_aid_only");
  session.chooseJourneyStory("albany:source_rowan_civic_docket");
}

function prepareAlbanyEvent(session: OverworldSession): void {
  session.scoutPoi("albany_city__civic_core__poi");
  session.talkToCharacter("albany_city__civic_core__contact");
  settleAlbanyOpening(session);
}

function pauseAtAlbanyCheckpoint(session: OverworldSession): void {
  const civicMarketRoute = "albany_city__area_route__civic_core__market__1";
  while (session.journey().acceptedDecisions < 40) session.moveArea(civicMarketRoute);
  expect(session.journey()).toMatchObject({
    acceptedDecisions: 40,
    status: "awaiting_choice",
  });
  expect(session.view().currentArea?.id).toBe("albany_city__civic_core");
}

describe("progressive authored-event disclosure", () => {
  it("keeps a fresh Albany event usable while suppressing its future scene payload", () => {
    const session = new OverworldSession(WORLD);
    const full = session.view();
    const event = full.events.find((candidate) => candidate.id === EVENT_ID);
    if (!event?.authored_scene) throw new Error("Expected Albany's authored Civic event.");
    const compact = session.compactView();
    const previousCompactShape = { ...compact, event_scenes: compactOverworldEventScenes([event]) };
    delete (previousCompactShape as { event_leads?: unknown }).event_leads;

    expect(compact.v).toBe(OVERWORLD_COMPACT_VIEW_VERSION);
    expect(compact.events).toContainEqual([EVENT_ID, event.title]);
    expect(compact.event_leads).toEqual([
      [EVENT_ID, event.summary, "Required first: scout Albany Civic Center Notice Board."],
    ]);
    expect(compact.event_scenes).toBeUndefined();
    expect(JSON.stringify(compact)).not.toContain(event.authored_scene.prompt);
    for (const option of event.authored_scene.options) {
      expect(JSON.stringify(compact)).not.toContain(option.id);
      expect(JSON.stringify(compact)).not.toContain(option.consequence);
    }
    expect(
      JSON.stringify(previousCompactShape).length - JSON.stringify(compact).length,
    ).toBeGreaterThan(1000);
  });

  it("reveals the exact authored scene only after scout, talk, and investigate make choices live", () => {
    const session = new OverworldSession(WORLD);
    const event = session.view().events.find((candidate) => candidate.id === EVENT_ID);
    if (!event?.authored_scene) throw new Error("Expected Albany's authored Civic event.");

    session.scoutPoi("albany_city__civic_core__poi");
    expect(session.compactView().event_leads?.[0]?.[2]).toBe(
      "Required first: talk to Rowan Quill.",
    );
    session.talkToCharacter("albany_city__civic_core__contact");
    settleAlbanyOpening(session);
    expect(session.compactView().event_leads?.[0]?.[2]).toBe(
      "Required first: investigate this event.",
    );
    expect(session.compactView().event_scenes).toBeUndefined();

    session.investigateEvent(EVENT_ID);
    const compact = session.compactView();
    const expectedChoices = event.authored_scene.options.map((option) => [EVENT_ID, option.id]);
    expect(compact.event_leads).toBeUndefined();
    expect(compact.event_scenes).toEqual(compactOverworldEventScenes([event]));
    expect(compact.event_choices).toEqual(expectedChoices);
    expect(compact.event_scenes?.[0]?.[2]).toBe(event.authored_scene.prompt);
  });

  it("advertises only executable event prerequisites through every Albany opening choice", () => {
    const session = new OverworldSession(WORLD);
    expectEventLeadParity(session, "Required first: scout Albany Civic Center Notice Board.");

    const beforeScout = session.snapshotHash();
    session.scoutPoi("albany_city__civic_core__poi");
    expect(session.snapshotHash()).not.toBe(beforeScout);
    expect(session.journey().storyChoice).toBeNull();
    expectEventLeadParity(session, "Required first: talk to Rowan Quill.");

    const beforeTalk = session.snapshotHash();
    session.talkToCharacter("albany_city__civic_core__contact");
    expect(session.snapshotHash()).not.toBe(beforeTalk);
    expect(session.journey().storyChoice?.id).toBe(WORLD.opening_registration!.id);
    expectEventLeadParity(session, EVENT_PAUSED_MESSAGE);
    expect(session.compactView().service_actions).toBeUndefined();
    expectInvestigationRejectedWithoutMutation(session, STORY_ACTION_BLOCKED_MESSAGE);

    session.chooseJourneyStory("albany:ledger_advocate");
    revealCurrentJourneyStoryOptions(session, WORLD.opening_relief_oath!.id);
    expect(session.journey().storyChoice?.id).toBe(WORLD.opening_relief_oath!.id);
    expectEventLeadParity(session, EVENT_PAUSED_MESSAGE);
    expect(session.compactView().service_actions).toBeUndefined();
    expectInvestigationRejectedWithoutMutation(session, STORY_ACTION_BLOCKED_MESSAGE);

    session.chooseJourneyStory("albany:oath_limited_aid_only");
    expect(session.journey().storyChoice?.id).toBe(WORLD.opening_lead_source!.id);
    expectEventLeadParity(session, EVENT_PAUSED_MESSAGE);
    expect(session.compactView().service_actions).toBeUndefined();
    expectInvestigationRejectedWithoutMutation(session, STORY_ACTION_BLOCKED_MESSAGE);

    session.chooseJourneyStory("albany:source_rowan_civic_docket");
    expect(session.journey().storyChoice).toBeNull();
    expectEventLeadParity(session, EVENT_INVESTIGATE_MESSAGE);
    expect(session.compactView().service_actions).toBeDefined();

    session.investigateEvent(EVENT_ID);
    expect(session.compactView().event_choices).toEqual([
      [EVENT_ID, "open_public_relief_record"],
      [EVENT_ID, "protect_household_relief_details"],
    ]);
  });

  it("keeps an uninvestigated event truthful across Continue and terminal End", () => {
    const checkpoint = new OverworldSession(WORLD);
    prepareAlbanyEvent(checkpoint);
    checkpoint.exploreArea("albany_city__civic_core");
    pauseAtAlbanyCheckpoint(checkpoint);

    expectEventLeadParity(checkpoint, EVENT_PAUSED_MESSAGE);
    expect(checkpoint.compactView().service_actions).toBeUndefined();
    expectInvestigationRejectedWithoutMutation(
      checkpoint,
      "Choose whether to continue or end this journey before taking another gameplay action.",
    );

    const boundary = checkpoint.snapshot();
    const continued = OverworldSession.restore(WORLD, boundary);
    continued.chooseJourney("continue");
    expectEventLeadParity(continued, EVENT_INVESTIGATE_MESSAGE);
    expect(continued.compactView().service_actions).toBeDefined();
    continued.investigateEvent(EVENT_ID);
    expect(continued.compactView().event_choices).toEqual([
      [EVENT_ID, "open_public_relief_record"],
      [EVENT_ID, "protect_household_relief_details"],
    ]);

    const ended = OverworldSession.restore(WORLD, boundary);
    ended.chooseJourney("end");
    expectEventLeadParity(ended, EVENT_PAUSED_MESSAGE);
    expect(ended.compactView().service_actions).toBeUndefined();
    expectInvestigationRejectedWithoutMutation(ended, "This journey has ended.");
  });

  it("suppresses an investigated scene at a journey checkpoint, then restores it on Continue", () => {
    const session = new OverworldSession(WORLD);
    prepareAlbanyEvent(session);
    session.investigateEvent(EVENT_ID);
    const liveChoices = session.compactView().event_choices;
    const liveScene = session.compactView().event_scenes;
    expect(liveChoices).toHaveLength(2);
    expect(liveScene).toHaveLength(1);

    pauseAtAlbanyCheckpoint(session);
    expect(session.compactView().event_scenes).toBeUndefined();
    expect(session.compactView().event_choices).toBeUndefined();
    expect(session.compactView().event_leads?.[0]?.[2]).toBe(
      "No authored choice is currently available in this journey state.",
    );

    session.chooseJourney("continue");
    expect(session.compactView().event_leads).toBeUndefined();
    expect(session.compactView().event_scenes).toEqual(liveScene);
    expect(session.compactView().event_choices).toEqual(liveChoices);
  });

  it("uses the same live-choice boundary for the UI and compact MCP projections", () => {
    const session = new OverworldSession(WORLD);
    prepareAlbanyEvent(session);
    const blockedUi = UiOverworldSession.restore(WORLD, session.snapshot()).view();
    expect(blockedUi.eventChoices).toEqual([]);
    expect(hasLiveOverworldEventChoice(EVENT_ID, blockedUi.eventChoices)).toBe(false);

    session.investigateEvent(EVENT_ID);
    const ui = UiOverworldSession.restore(WORLD, session.snapshot()).view();
    expect(ui.eventChoices).toEqual(session.compactView().event_choices);
    expect(hasLiveOverworldEventChoice(EVENT_ID, ui.eventChoices)).toBe(true);

    const api = createToolApi({ root: process.cwd() });
    const restored = api.restore_overworld_session({
      compact_context: true,
      snapshot: session.snapshot(),
    });
    expect(restored.context.event_choices).toEqual(ui.eventChoices);
    expect(restored.context.event_scenes).toEqual(session.compactView().event_scenes);

    const appSource = readFileSync("ui/src/App.tsx", "utf8");
    expect(appSource).toContain("hasLiveOverworldEventChoice(");
    expect(appSource).toContain(
      "const liveOptions = hasLiveOverworldEventChoice(event.id, worldView.eventChoices)",
    );
    expect(appSource).toContain("if (liveOptions && liveOptions.length > 0)");
    expect(appSource).toContain("summary: event.authored_scene!.prompt");
    expect(appSource).toContain(
      "onChoose: () => runWorldAction(() => worldSession.resolveEvent(event.id, option.id))",
    );
  });
});
