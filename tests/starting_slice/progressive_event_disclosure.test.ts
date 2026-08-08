import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createToolApi } from "../../src/mcp/tools.js";
import {
  compactOverworldEventScenes,
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
      [EVENT_ID, event.summary, "Required first: scout Albany Civic Center Notice Hall."],
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
    expect(appSource).toContain("{!hasLegalSceneChoice ? (");
    expect(appSource).toContain("<p>{scene.prompt}</p>");
  });
});
