/**
 * Persistent wound-care counterfactual. Hold the wounded Wolf-Winter return
 * constant, vary only whether the player accepts exact Station care, and prove
 * the character, Greenway, journal, restore, MCP, UI, and journey boundaries.
 */
import { describe, expect, it } from "vitest";

import { createToolApi } from "../../src/mcp/tools.js";
import type { OverworldManifest } from "../../src/world/overworld.js";
import { OverworldSession } from "../../src/world/session.js";
import type { OverworldSessionSnapshot } from "../../src/world/session_snapshot.js";
import { OVERWORLD_CONTENT_HASH_MISMATCH_WARNING } from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { OverworldSession as UiOverworldSession } from "../../ui/src/overworld.js";
import { revealCurrentJourneyStoryOptions } from "../regression/support/journey_story.js";

const WORLD = loadOverworldManifest(process.cwd());
const CARE = "albany:cade_witnessed_gate_wound_station_care";
const WOUND = "wound:wolf_winter_byre_mouth_gate";
const STATION = "albany_city__transport_hub";
const GREENWAY = "albany_city__greenway";
const GREENWAY_POI = "albany_city__greenway__poi";
const GREENWAY_CONTACT = "albany_city__greenway__contact";
const GREENWAY_EVENT = "albany_city__greenway__event";
const PUBLIC_POLICY = "post_accessible_public_detour";
const PUBLIC_FAST = "stake_shortest_accessible_detour";
const PUBLIC_DEEP = "map_all_weather_public_loop";
const QUIET_POLICY = "place_quiet_corridor_markers";
const QUIET_FAST = "reset_steward_markers";
const QUIET_DEEP = "trace_winter_wildlife_corridor_with_witness_points";

function moveToArea(
  session: OverworldSession,
  targetAreaId: string,
  world: OverworldManifest = WORLD,
): void {
  for (
    let attempts = 0;
    !session.view().areas.some((area) => area.id === targetAreaId);
    attempts += 1
  ) {
    if (attempts >= 7) throw new Error(`Could not map Albany route to ${targetAreaId}.`);
    const currentArea = session.view().currentArea;
    if (!currentArea) throw new Error("Expected an Albany area.");
    session.exploreArea(currentArea.id);
  }
  const start = session.view().currentArea?.id;
  if (!start || start === targetAreaId) return;
  const edges = world.area_edges.filter((edge) => edge.home === session.view().current.id);
  const previous = new Map<string, string>();
  const queue = [start];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    for (const edge of edges.filter(
      (candidate) => candidate.from_area === current || candidate.to_area === current,
    )) {
      const next = edge.from_area === current ? edge.to_area : edge.from_area;
      if (next === start || previous.has(next)) continue;
      previous.set(next, current);
      queue.push(next);
    }
  }
  const path: string[] = [];
  for (let cursor = targetAreaId; cursor !== start; ) {
    const prior = previous.get(cursor);
    if (!prior) throw new Error(`No Albany area route reaches ${targetAreaId}.`);
    path.unshift(cursor);
    cursor = prior;
  }
  for (const areaId of path) {
    const route = session.view().areaExits.find((candidate) => candidate.destination.id === areaId);
    if (!route) throw new Error(`Missing visible route to ${areaId}.`);
    session.moveArea(route.id);
  }
}

function woundedReturnBoundary(world: OverworldManifest = WORLD): OverworldSessionSnapshot {
  const session = new OverworldSession(world);
  const wolf = world.quests.find((quest) => quest.id === "wolf_winter")!;
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(world.opening_registration!.contact);
  session.chooseJourneyStory("albany:ledger_advocate");
  revealCurrentJourneyStoryOptions(session, world.opening_relief_oath!.id);
  session.chooseJourneyStory("albany:oath_limited_aid_only");
  session.chooseJourneyStory("albany:source_rowan_civic_docket");
  moveToArea(session, world.opening_preparation!.area, world);
  session.chooseJourneyStory("albany:prep_works_fortification");
  session.chooseJourneyStory("albany:relief_cade_fodder");
  moveToArea(session, STATION, world);
  session.scoutPoi("albany_city__transport_hub__poi");
  session.talkToCharacter("albany_city__transport_hub__contact");
  session.talkToCharacter(world.opening_ally!.contact);
  session.chooseJourneyStory("albany:ally_travel_solo");
  session.startQuest(wolf.id, "albany:wolf_approach_sheltered_stockway");
  session.completeQuest(wolf.id, {
    endingId: "ending_drive_cattle_wounded",
    endingTitle: "The Herd Out, Rider Hurt",
    death: false,
  });
  const completedAtDecision = session.journey().goal.completedAtDecision;
  expect(completedAtDecision).not.toBeNull();
  expect(completedAtDecision).toBeLessThanOrEqual(45);
  if (world === WORLD) {
    expect(session.view().serviceOffers.map((offer) => offer.id)).toContain(CARE);
  }
  expect(session.view().serviceActions).toEqual([]);
  session.chooseJourney("continue");
  session.chooseJourneyStory("send_wagon_to_cade");
  expect(session.snapshot().journey.goalHistory[0]?.completedAtDecision).toBe(completedAtDecision);
  return session.snapshot();
}

function prepareGreenwayPolicy(
  session: OverworldSession,
  policy: typeof PUBLIC_POLICY | typeof QUIET_POLICY,
): void {
  moveToArea(session, GREENWAY);
  session.scoutPoi(GREENWAY_POI);
  session.talkToCharacter(GREENWAY_CONTACT);
  session.investigateEvent(GREENWAY_EVENT);
  session.resolveEvent(GREENWAY_EVENT, policy);
}

function greenwayOptionIds(session: OverworldSession): string[] {
  return (
    session
      .view()
      .jobs.find((job) => job.id === "albany_city__greenway__job")
      ?.authored_scene?.options.map((option) => option.id) ?? []
  );
}

describe("SS-F19 — Wolf-Winter wound care is persistent campaign gameplay", () => {
  it("spends exactly 45 minutes, restores six health, mutates no road resources, and is one-shot", () => {
    const session = OverworldSession.restore(WORLD, woundedReturnBoundary());
    const before = session.snapshot();
    const firstGoalDecision = before.journey.goalHistory[0]!.completedAtDecision;
    const careAction = session.view().serviceActions.find((action) => action.action === "care");
    expect(careAction).toMatchObject({
      offerId: CARE,
      available: true,
      changed: true,
      minutes: 45,
    });
    expect(careAction?.message).toMatch(/byre-mouth gate wound|witnessed wound/i);

    const result = session.careAtTown();
    const after = session.snapshot();
    expect(result).toMatchObject({
      action: "care",
      changed: true,
      minutes: 45,
      suppliesBefore: before.supplies,
      suppliesAfter: before.supplies,
      fatigueBefore: before.fatigue,
      fatigueAfter: before.fatigue,
    });
    expect(after.minutes).toBe(before.minutes + 45);
    expect(after.supplies).toBe(before.supplies);
    expect(after.fatigue).toBe(before.fatigue);
    expect(after.character.health).toEqual({ current: 30, max: 30 });
    expect(after.character.wounds).toContainEqual({
      woundId: WOUND,
      severity: 2,
      treatment: "treated",
    });
    expect(after.journey.goalHistory[0]!.completedAtDecision).toBe(firstGoalDecision);
    expect(after.journey.acceptedDecisions).toBe(before.journey.acceptedDecisions + 1);
    expect(after.journalEntries[0]).toMatchObject({
      kind: "service",
      serviceRuleId: CARE,
      serviceAreaId: STATION,
    });
    expect(after.journalEntries[0]?.text).toMatch(
      /Time: 45 minutes[^]*wound treatment: untreated → treated[^]*Health: 24 → 30/i,
    );
    expect(session.view().serviceOffers.map((offer) => offer.id)).not.toContain(CARE);
    expect(session.view().serviceActions.map((action) => action.action)).not.toContain("care");
    expect(() => session.careAtTown()).toThrow(
      /Wound care is unavailable here[^]*No active care offer matches your condition/i,
    );
    expect(OverworldSession.restore(WORLD, after).snapshot()).toEqual(after);
  });

  it.each([
    [PUBLIC_POLICY, PUBLIC_FAST, PUBLIC_DEEP],
    [QUIET_POLICY, QUIET_FAST, QUIET_DEEP],
  ] as const)(
    "keeps %s fast work legal but gates its deep option until Station treatment",
    (policy, fast, deep) => {
      const boundary = woundedReturnBoundary();
      const untreated = OverworldSession.restore(WORLD, boundary);
      prepareGreenwayPolicy(untreated, policy);
      expect(greenwayOptionIds(untreated)).toEqual([fast]);
      expect(JSON.stringify(untreated.view())).not.toContain("character_conditions");
      expect(() => untreated.workLocalJob("albany_city__greenway__job", deep)).toThrow(
        /unavailable in this journey/i,
      );

      const treated = OverworldSession.restore(WORLD, boundary);
      treated.careAtTown();
      prepareGreenwayPolicy(treated, policy);
      expect(greenwayOptionIds(treated)).toEqual([fast, deep]);
      expect(OverworldSession.restore(WORLD, treated.snapshot()).snapshot()).toEqual(
        treated.snapshot(),
      );
    },
  );

  it("preserves care through compact, UI, and MCP surfaces", () => {
    const boundary = woundedReturnBoundary();
    const core = OverworldSession.restore(WORLD, boundary);
    expect(core.compactView().service_actions?.some((action) => action[0] === "care")).toBe(true);

    const ui = UiOverworldSession.restore(WORLD, boundary);
    const uiResult = ui.careAtTown();
    expect(uiResult.action).toBe("care");
    expect(ui.view().character.health.current).toBe(30);
    expect(ui.view().character.wounds[0]?.treatment).toBe("treated");

    const api = createToolApi({ root: process.cwd() });
    const restored = api.restore_overworld_session({
      compact_context: false,
      compact_result: false,
      snapshot: boundary,
    });
    const mcp = api.care_overworld_session({
      compact_context: false,
      compact_result: false,
      session_id: restored.session_id,
    });
    expect(mcp.result).toMatchObject({ action: "care", minutes: 45, changed: true });
    expect(mcp.observation.character.health).toEqual({ current: 30, max: 30 });
    expect(mcp.observation.character.wounds[0]?.treatment).toBe("treated");
  });

  it("fails closed on treated state without care, duplicate care, and forged care provenance", () => {
    const boundary = woundedReturnBoundary();
    const treatedSession = OverworldSession.restore(WORLD, boundary);
    treatedSession.careAtTown();
    const treated = treatedSession.snapshot();

    const treatedWithoutJournal = structuredClone(boundary);
    treatedWithoutJournal.character.health.current = 30;
    treatedWithoutJournal.character.wounds[0]!.treatment = "treated";
    expect(() => OverworldSession.restore(WORLD, treatedWithoutJournal)).toThrow(
      /campaign character does not match replayed quest consequences or care services/i,
    );

    const duplicate = structuredClone(treated);
    const careEntry = structuredClone(
      duplicate.journalEntries.find((entry) => entry.serviceRuleId === CARE)!,
    );
    duplicate.journalEntries.unshift(careEntry);
    expect(() => OverworldSession.restore(WORLD, duplicate)).toThrow(
      /duplicate journal entry|used more than once/i,
    );

    const forgedRule = structuredClone(treated);
    const forgedEntry = forgedRule.journalEntries.find((entry) => entry.serviceRuleId === CARE)!;
    forgedEntry.serviceRuleId = "albany:invented_wound_care";
    expect(() => OverworldSession.restore(WORLD, forgedRule)).toThrow(
      /unknown campaign service rule|campaign character does not match/i,
    );

    const historicalCopy = structuredClone(treated);
    historicalCopy.journalEntries.find((entry) => entry.serviceRuleId === CARE)!.text +=
      " earlier wording";
    expect(() => OverworldSession.restore(WORLD, historicalCopy)).not.toThrow();

    const revisedWorld = structuredClone(WORLD);
    const revisedCare = revisedWorld.campaign_service_rules?.find((rule) => rule.id === CARE);
    if (!revisedCare) throw new Error("Expected the Station wound-care rule.");
    revisedCare.title = "Treat the witnessed wound, revised";
    revisedCare.summary = "Revised wound-care copy without structural changes.";
    const restoredAcrossServiceCopy = OverworldSession.restore(revisedWorld, treated);
    expect(restoredAcrossServiceCopy.restoreWarnings()).toEqual([
      OVERWORLD_CONTENT_HASH_MISMATCH_WARNING,
    ]);
    expect(
      restoredAcrossServiceCopy
        .snapshot()
        .journalEntries.find((entry) => entry.serviceRuleId === CARE)?.text,
    ).toBe(treated.journalEntries.find((entry) => entry.serviceRuleId === CARE)?.text);

    const forgedBoundary = structuredClone(treated);
    const boundaryEntry = forgedBoundary.journalEntries.find(
      (entry) => entry.serviceRuleId === CARE,
    )!;
    boundaryEntry.serviceBoundary!.decisionProofHash = "0".repeat(64);
    expect(() => OverworldSession.restore(WORLD, forgedBoundary)).toThrow(
      /does not match its accepted campaign service decision proof|journey/i,
    );
  });
});
