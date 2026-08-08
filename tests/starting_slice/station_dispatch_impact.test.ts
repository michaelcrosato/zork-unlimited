import { describe, expect, it } from "vitest";

import {
  renderTerminalStoryChoiceComparison,
  renderTerminalStoryChoiceDetail,
} from "../../bin/terminal_story_choice.js";
import { compactJourneyStoryChoiceComparison } from "../../src/mcp/journey_projection.js";
import { createToolApi } from "../../src/mcp/tools.js";
import { compactOpeningDepartureRecapTerms } from "../../src/world/opening_departure_recap.js";
import { stripOpeningStationDispatchImpact } from "../../src/world/opening_station_dispatch_impact.js";
import {
  classifyQuestDispatchMinutes,
  deriveQuestDispatchPresentationWindow,
} from "../../src/world/quest_dispatch_window.js";
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { revealCurrentJourneyStoryOptions } from "../regression/support/journey_story.js";

const WORLD = loadOverworldManifest(process.cwd());
const REGISTRATION = WORLD.opening_registration!;
const RELIEF_OATH = WORLD.opening_relief_oath!;
const PREPARATION = WORLD.opening_preparation!;
const ALLOCATION = WORLD.opening_relief_allocation!;
const ALLY = WORLD.opening_ally!;
const WOLF = WORLD.quests.find((quest) => quest.id === PREPARATION.target_quest)!;

function stationHubSession(): OverworldSession {
  const session = new OverworldSession(WORLD);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(REGISTRATION.contact);
  session.chooseJourneyStory("albany:road_warden");
  revealCurrentJourneyStoryOptions(session, RELIEF_OATH.id);
  session.chooseJourneyStory("albany:oath_limited_aid_only");
  session.chooseJourneyStory("albany:source_jamie_market_testimony");
  const route = session
    .view()
    .areaExits.find((candidate) => candidate.destination.id === PREPARATION.area);
  if (!route) throw new Error("Expected the Station route.");
  session.moveArea(route.id);
  return session;
}

function stationSession(): OverworldSession {
  const session = stationHubSession();
  session.chooseJourneyStory("albany:prep_drover_route", PREPARATION.id);
  return session;
}

function canonicalWindow(session: OverworldSession) {
  return deriveQuestDispatchPresentationWindow({
    questId: WOLF.id,
    journalEntries: session.snapshot().journalEntries,
    openingRegistration: REGISTRATION,
    openingReliefOath: WORLD.opening_relief_oath!,
    openingLeadSource: WORLD.opening_lead_source!,
    openingPreparation: PREPARATION,
    openingReliefAllocation: ALLOCATION,
    openingAlly: ALLY,
  });
}

describe("Station dispatch impact cards", () => {
  it("uses the same committed baseline when relief or June is chosen before preparation", () => {
    const reliefFirst = stationHubSession();
    expect(
      reliefFirst
        .inspectJourneyStory(ALLOCATION.id)
        .options.map((option) => option.dispatchImpact?.line),
    ).toEqual([
      "Dispatch: +5m delay → 45m committed (on time).",
      "Dispatch: +5m delay → 45m committed (on time).",
      "Dispatch: +5m delay → 45m committed (on time).",
    ]);
    reliefFirst.chooseJourneyStory(ALLOCATION.options[0]!.id, ALLOCATION.id);
    reliefFirst.talkToCharacter(ALLY.contact);
    expect(
      reliefFirst.journey().storyChoice?.options.map((option) => option.dispatchImpact?.line),
    ).toEqual([
      "Dispatch: +15m delay → 60m committed (on time).",
      "Dispatch: +5m delay → 50m committed (on time).",
      "Dispatch: no added delay → 45m committed (on time).",
    ]);

    const juneFirst = stationHubSession();
    juneFirst.talkToCharacter(ALLY.contact);
    expect(
      juneFirst.journey().storyChoice?.options.map((option) => option.dispatchImpact?.line),
    ).toEqual([
      "Dispatch: +15m delay → 55m committed (on time).",
      "Dispatch: +5m delay → 45m committed (on time).",
      "Dispatch: no added delay → 40m committed (on time).",
    ]);
    juneFirst.chooseJourneyStory("albany:ally_june_cattle_first", ALLY.id);
    expect(
      juneFirst
        .inspectJourneyStory(ALLOCATION.id)
        .options.map((option) => option.dispatchImpact?.line),
    ).toEqual([
      "Dispatch: +5m delay → 60m committed (on time).",
      "Dispatch: +5m delay → 60m committed (on time).",
      "Dispatch: +5m delay → 60m committed (on time).",
    ]);
  });

  it("leads every live relief and field-team card with its exact canonical timing result", () => {
    const session = stationSession();
    const allocationBefore = structuredClone(session.snapshot());
    const allocation = session.inspectJourneyStory(ALLOCATION.id);
    expect(allocation.options.map((option) => option.dispatchImpact?.line)).toEqual([
      "Dispatch: +5m delay → 65m committed (delayed).",
      "Dispatch: +5m delay → 65m committed (delayed).",
      "Dispatch: +5m delay → 65m committed (delayed).",
    ]);
    expect(session.snapshot()).toEqual(allocationBefore);

    for (const option of allocation.options) {
      const impact = option.dispatchImpact!;
      const counterfactual = OverworldSession.restore(WORLD, structuredClone(allocationBefore));
      counterfactual.chooseJourneyStory(option.id, ALLOCATION.id);
      const actual = canonicalWindow(counterfactual);
      const actualMinutes =
        actual.status === "support_choices_open" ? actual.committedMinutes : actual.ledgerMinutes;
      expect(actualMinutes).toBe(impact.resultingMinutes);
      expect(classifyQuestDispatchMinutes(actualMinutes!)).toBe(impact.timing);
    }

    session.chooseJourneyStory(ALLOCATION.options[0]!.id, ALLOCATION.id);
    session.talkToCharacter(ALLY.contact);
    const juneBefore = structuredClone(session.snapshot());
    const june = session.journey().storyChoice;
    if (!june || june.id !== ALLY.id)
      throw new Error("Expected June's live field-team comparison.");
    expect(june.options.map((option) => option.dispatchImpact?.line)).toEqual([
      "Dispatch: +15m delay → 80m committed (delayed).",
      "Dispatch: +5m delay → 70m committed (delayed).",
      "Dispatch: no added delay → 65m committed (delayed).",
    ]);
    for (const option of june.options) {
      const impact = option.dispatchImpact!;
      const counterfactual = OverworldSession.restore(WORLD, structuredClone(juneBefore));
      counterfactual.chooseJourneyStory(option.id);
      const actual = canonicalWindow(counterfactual);
      const actualMinutes =
        actual.status === "support_choices_open" ? actual.committedMinutes : actual.ledgerMinutes;
      expect(actualMinutes).toBe(impact.resultingMinutes);
      expect(classifyQuestDispatchMinutes(actualMinutes!)).toBe(impact.timing);
    }
  });

  it("keeps full, compact, terminal, MCP, and restored comparisons aligned and strips stale or forged impacts", () => {
    const session = stationSession();
    const full = session.inspectJourneyStory(ALLOCATION.id);
    const compact = compactJourneyStoryChoiceComparison(full);
    expect(compact.options.every((option) => !("dispatchImpact" in option))).toBe(true);
    expect(JSON.stringify(compact)).not.toContain("proofHash");
    expect(JSON.stringify(compact).length).toBeLessThanOrEqual(1_850);
    const rendered = renderTerminalStoryChoiceComparison(full);
    expect(rendered).not.toContain("Dispatch: +5m delay → 65m committed (delayed).");
    expect(rendered).toContain(
      "Purpose: optionally choose one relief priority; preparation and field team stay separate.",
    );
    expect(rendered.indexOf("Purpose:")).toBeLessThan(rendered.indexOf("Promise / priority:"));
    const firstOption = full.options[0]!;
    const stagedDetail = compactJourneyStoryChoiceComparison(full, firstOption.id).inspectedOption;
    expect(stagedDetail).toMatchObject({ dispatchImpact: firstOption.dispatchImpact });
    expect(JSON.stringify(stagedDetail).length).toBeLessThanOrEqual(650);
    expect(renderTerminalStoryChoiceDetail(full, firstOption)).toContain(
      "Dispatch: +5m delay → 65m committed (delayed).",
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
    api.choose_overworld_session_story({
      session_id: started.session_id,
      choice: "albany:road_warden",
      compact_context: false,
      compact_result: false,
    });
    api.inspect_overworld_session_story({
      session_id: started.session_id,
      story_choice_id: "albany:wolf_relief_oath",
      reveal_id: "customize_duty_and_evidence",
      compact_context: false,
      compact_result: false,
    });
    for (const choice of ["albany:oath_limited_aid_only", "albany:source_jamie_market_testimony"]) {
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
      compact_context: false,
      compact_result: false,
    });
    api.choose_overworld_session_story({
      session_id: started.session_id,
      story_choice_id: PREPARATION.id,
      choice: "albany:prep_drover_route",
      compact_context: false,
      compact_result: false,
    });
    const compactMcpInspection = api.inspect_overworld_session_story({
      session_id: started.session_id,
      story_choice_id: ALLOCATION.id,
      compact_context: true,
      compact_result: true,
    });
    const compactMcp = compactMcpInspection.story;
    expect(compactMcp.options.every((option) => !("dispatchImpact" in option))).toBe(true);
    expect(compactMcpInspection).not.toHaveProperty("departure_recap_terms");
    expect(compactMcp.reviewOption).toMatchObject({
      arguments: {
        story_choice_id: ALLOCATION.id,
      },
      argument: "option_id",
      readOnly: true,
    });
    const beforeTermReview = api.export_overworld_session({ session_id: started.session_id });
    if (!beforeTermReview.ok) throw new Error("Expected an exportable MCP Station session.");
    const pulledMcp = api.inspect_overworld_session_story({
      session_id: started.session_id,
      ...compactMcp.reviewOption.arguments,
      option_id: compactMcp.options[0]!.id,
      compact_context: true,
      compact_result: true,
    });
    const expectedRecap = OverworldSession.restore(WORLD, beforeTermReview.snapshot).view()
      .departureRecap;
    if (!expectedRecap) throw new Error("Expected authenticated Station recap terms.");
    expect(pulledMcp.departure_recap_terms).toEqual(
      compactOpeningDepartureRecapTerms(expectedRecap),
    );
    expect(pulledMcp.legend_delta).toHaveProperty("departure_recap_terms");
    expect(JSON.stringify(pulledMcp).length).toBeLessThanOrEqual(2_048);
    expect(api.export_overworld_session({ session_id: started.session_id })).toEqual(
      beforeTermReview,
    );
    expect(
      api.inspect_overworld_session_story({
        session_id: started.session_id,
        story_choice_id: ALLOCATION.id,
        option_id: full.options[0]!.id,
        compact_context: true,
        compact_result: true,
      }).story.inspectedOption.dispatchImpact?.line,
    ).toBe(full.options[0]!.dispatchImpact?.line);

    const restored = OverworldSession.restore(WORLD, structuredClone(session.snapshot()));
    expect(restored.inspectJourneyStory(ALLOCATION.id)).toEqual(full);
    const outbound = restored
      .view()
      .areaExits.find((candidate) => candidate.destination.id === "albany_city__civic_core");
    if (!outbound) throw new Error("Expected the Station-to-Civic route.");
    restored.moveArea(outbound.id);
    const returnRoute = restored
      .view()
      .areaExits.find((candidate) => candidate.destination.id === PREPARATION.area);
    if (!returnRoute) throw new Error("Expected the Civic-to-Station route.");
    restored.moveArea(returnRoute.id);
    expect(
      restored
        .inspectJourneyStory(ALLOCATION.id)
        .options.map((option) => option.dispatchImpact?.line),
    ).toEqual(full.options.map((option) => option.dispatchImpact?.line));
    session.chooseJourneyStory(ALLOCATION.options[0]!.id, ALLOCATION.id);
    expect(() => session.inspectJourneyStory(ALLOCATION.id)).toThrow();
    const forgedPublicPrompt = Object.assign({}, full, {
      // This was the old exported liveness authority. A public caller may
      // still supply it as junk, but it cannot produce a timing projection.
      isCurrentBoundary: () => true,
    });
    const stale = stripOpeningStationDispatchImpact(forgedPublicPrompt);
    expect(stale).not.toBe(full);
    expect(stale?.options.every((option) => option.dispatchImpact === undefined)).toBe(true);
    expect(stale?.options.map((option) => option.consequence)).toEqual(
      full.options.map((option) => option.consequence),
    );

    const tamperedSnapshot = structuredClone(restored.snapshot());
    const tamperedJournalEntries = tamperedSnapshot.journalEntries;
    const source = tamperedJournalEntries.find((entry) => entry.kind === "lead_source");
    if (!source?.storyChoiceBoundary) throw new Error("Expected a signed source boundary.");
    source.storyChoiceBoundary.minutes += 1;
    expect(() => OverworldSession.restore(WORLD, tamperedSnapshot)).toThrow();
  });
});
