import { describe, expect, it } from "vitest";

import { renderTerminalStoryChoiceComparison } from "../../bin/terminal_story_choice.js";
import { compactJourneyStoryChoiceComparison } from "../../src/mcp/journey_projection.js";
import { createToolApi } from "../../src/mcp/tools.js";
import {
  deriveOpeningPreparationDispatchForecasts,
  OPENING_PREPARATION_DISPATCH_FORECAST_LINE_CHAR_LIMIT,
  type OpeningPreparationDispatchForecastInputs,
} from "../../src/world/opening_preparation_dispatch_forecast.js";
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { OverworldSession as UiOverworldSession } from "../../ui/src/overworld.js";

const WORLD = loadOverworldManifest(process.cwd());
const REGISTRATION = WORLD.opening_registration!;
const PREPARATION = WORLD.opening_preparation!;

function moveToPreparation(session: OverworldSession): void {
  const route = session
    .view()
    .areaExits.find((candidate) => candidate.destination.id === PREPARATION.area);
  if (!route) throw new Error("Expected a route to Hayden's Station.");
  session.moveArea(route.id);
}

function preparationSession(
  args: {
    registrationId?: string;
    oathId?: string;
    sourceId?: string;
  } = {},
): OverworldSession {
  const session = new OverworldSession(WORLD);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(REGISTRATION.contact);
  session.chooseJourneyStory(args.registrationId ?? "albany:road_warden");
  session.chooseJourneyStory(args.oathId ?? "albany:oath_limited_aid_only");
  session.chooseJourneyStory(args.sourceId ?? "albany:source_jamie_market_testimony");
  moveToPreparation(session);
  return session;
}

function forecastInputs(
  session: OverworldSession,
  journalEntries = session.snapshot().journalEntries,
): OpeningPreparationDispatchForecastInputs {
  const snapshot = session.snapshot();
  const journey = session.journey();
  return {
    world: WORLD,
    journalEntries,
    currentTownId: snapshot.currentId,
    currentAreaId: snapshot.currentAreaId,
    journeyActive: journey.status === "active",
    acceptedDecisions: journey.acceptedDecisions,
    decisionProofHash: journey.decisionProof.hash,
    currentMinutes: snapshot.minutes,
    targetQuestStarted: false,
    targetQuestCompleted: false,
  };
}

function forecastById(session: OverworldSession, id: string) {
  const prompt = session.inspectJourneyStory(PREPARATION.id);
  const forecast = prompt.options.find((option) => option.id === id)?.dispatchForecast;
  if (!forecast) throw new Error(`Expected an authenticated forecast for ${id}.`);
  return forecast;
}

describe("authenticated Albany preparation dispatch forecast", () => {
  it("shows the exact public-term ranges on full, UI, compact, and terminal comparisons", () => {
    const session = preparationSession();
    const full = session.inspectJourneyStory(PREPARATION.id);
    const expected = {
      "albany:prep_works_fortification": {
        finalMinutes: { minimum: 65, maximum: 85 },
        classification: "delayed_guaranteed",
        line: "Dispatch forecast if chosen: 65–85m. Delayed even if you leave later capacity unassigned and depart solo; later choices only seal the final total.",
      },
      "albany:prep_drover_route": {
        finalMinutes: { minimum: 60, maximum: 80 },
        classification: "threshold_crossing",
        line: "Dispatch forecast if chosen: 60–80m. On time at 60m; later optional choices can make dispatch delayed.",
      },
      "albany:prep_relief_protocol": {
        finalMinutes: { minimum: 70, maximum: 90 },
        classification: "delayed_guaranteed",
        line: "Dispatch forecast if chosen: 70–90m. Delayed even if you leave later capacity unassigned and depart solo; later choices only seal the final total.",
      },
    } as const;
    for (const [id, result] of Object.entries(expected)) {
      expect(forecastById(session, id)).toMatchObject({
        schemaVersion: 1,
        thresholdMinutes: 60,
        ...result,
        proofHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      });
      expect(result.line.length).toBeLessThanOrEqual(
        OPENING_PREPARATION_DISPATCH_FORECAST_LINE_CHAR_LIMIT,
      );
    }

    const ui = preparationSessionForUi();
    expect(ui.inspectJourneyStory(PREPARATION.id)).toEqual(full);
    const compact = compactJourneyStoryChoiceComparison(full);
    expect(compact.options.map((option) => option.dispatchForecast?.line)).toEqual(
      full.options.map((option) => option.dispatchForecast?.line),
    );
    expect(renderTerminalStoryChoiceComparison(full)).toContain(
      "Dispatch forecast if chosen: 60–80m. On time at 60m; later optional choices can make dispatch delayed.",
    );

    const api = createToolApi({ root: process.cwd() });
    const started = api.start_overworld({ compact_context: false });
    api.scout_overworld_session_poi({
      session_id: started.session_id,
      poi_id: started.observation.pois[0]!.id,
      compact_context: false,
      compact_result: false,
    });
    api.talk_overworld_session_contact({
      session_id: started.session_id,
      character_id: REGISTRATION.contact,
      compact_context: false,
      compact_result: false,
    });
    for (const choice of [
      "albany:road_warden",
      "albany:oath_limited_aid_only",
      "albany:source_jamie_market_testimony",
    ]) {
      api.choose_overworld_session_story({
        session_id: started.session_id,
        choice,
        compact_context: false,
        compact_result: false,
      });
    }
    const route = api
      .get_overworld_session({ session_id: started.session_id, include_observation: true })
      .observation.areaExits.find((candidate) => candidate.destination.id === PREPARATION.area);
    if (!route) throw new Error("Expected the MCP Station route.");
    api.move_overworld_session_area({
      session_id: started.session_id,
      area_route_id: route.id,
      compact_context: true,
      compact_result: true,
    });
    expect(
      api.inspect_overworld_session_story({
        session_id: started.session_id,
        story_choice_id: PREPARATION.id,
        compact_context: true,
        compact_result: true,
      }).story,
    ).toEqual(compact);
  });

  it("uses sponsored actual preparation terms and recognizes an on-time guarantee", () => {
    const session = preparationSession({
      registrationId: "albany:ledger_advocate",
      oathId: "albany:oath_full_compact_duty",
      sourceId: "albany:source_jamie_market_testimony",
    });
    expect(forecastById(session, "albany:prep_relief_protocol")).toMatchObject({
      finalMinutes: { minimum: 35, maximum: 55 },
      classification: "on_time_guaranteed",
      line: "Dispatch forecast if chosen: 35–55m. On time for every remaining optional capacity or field-team choice; choose later to seal the total.",
    });
  });

  it("stays read-only and disappears before, after, moved, legacy, selected, and tampered boundaries", () => {
    const session = preparationSession();
    const before = structuredClone(session.snapshot());
    const prompt = session.inspectJourneyStory(PREPARATION.id);
    expect(prompt.options.every((option) => option.dispatchForecast)).toBe(true);
    expect(session.snapshot()).toEqual(before);
    expect(deriveOpeningPreparationDispatchForecasts(forecastInputs(session))).not.toBeNull();

    const moved = { ...forecastInputs(session), currentAreaId: "albany_city__civic_core" };
    expect(deriveOpeningPreparationDispatchForecasts(moved)).toBeNull();
    const forged = structuredClone(before.journalEntries);
    const source = forged.find((entry) => entry.kind === "lead_source");
    if (!source?.storyChoiceBoundary) throw new Error("Expected a source boundary to forge.");
    source.storyChoiceBoundary.minutes += 1;
    expect(deriveOpeningPreparationDispatchForecasts(forecastInputs(session, forged))).toBeNull();
    expect(() => OverworldSession.restore(WORLD, { ...before, journalEntries: forged })).toThrow();
    expect(
      deriveOpeningPreparationDispatchForecasts({
        ...forecastInputs(session),
        journalEntries: [],
      }),
    ).toBeNull();

    session.chooseJourneyStory(PREPARATION.profiles[0]!.id, PREPARATION.id);
    expect(deriveOpeningPreparationDispatchForecasts(forecastInputs(session))).toBeNull();
    expect(() => session.inspectJourneyStory(PREPARATION.id)).toThrow();
    expect(
      OverworldSession.restore(WORLD, structuredClone(before)).inspectJourneyStory(PREPARATION.id),
    ).toEqual(prompt);
  });
});

function preparationSessionForUi(): UiOverworldSession {
  const session = new UiOverworldSession(WORLD);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(REGISTRATION.contact);
  session.chooseJourneyStory("albany:road_warden");
  session.chooseJourneyStory("albany:oath_limited_aid_only");
  session.chooseJourneyStory("albany:source_jamie_market_testimony");
  const route = session
    .view()
    .areaExits.find((candidate) => candidate.destination.id === PREPARATION.area);
  if (!route) throw new Error("Expected a UI route to Hayden's Station.");
  session.moveArea(route.id);
  return session;
}
