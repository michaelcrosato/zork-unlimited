import { describe, expect, it } from "vitest";

import { createToolApi } from "../../src/mcp/tools.js";
import {
  OVERWORLD_COMPACT_VIEW_VERSION,
  cloneOverworldCompactView,
} from "../../src/world/compact_view.js";
import {
  JOURNEY_OPPORTUNITY_GUIDANCE,
  type JourneyOpportunityLeadPresentation,
} from "../../src/world/journey_contract.js";
import type { OverworldManifest } from "../../src/world/overworld.js";
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { revealCurrentJourneyStoryOptions } from "../regression/support/journey_story.js";

const WORLD = loadOverworldManifest(process.cwd());
const STATION = "albany_city__transport_hub";
const STATION_POI = "albany_city__transport_hub__poi";
const STATION_CONTACT = "albany_city__transport_hub__contact";
const STATION_EVENT = "albany_city__transport_hub__event";
const CADE_JOB = "albany_city__transport_hub__job";
const CADE_OPTION = "dispatch_pasture_search";
const MARKET = "albany_city__market";
const MARKET_POI = "albany_city__market__poi";
const MARKET_CONTACT = "albany_city__market__contact";
const MARKET_EVENT = "albany_city__market__event";
const MARKET_POLICY = "hold_household_kitchen_prices";
const MARKET_JOB = "albany_city__market__job";
const MARKET_SETTLEMENT = "release_price_hold_operational";
const CAMPUS_EVENT = "albany_city__campus__event";
const GREENWAY = "albany_city__greenway";
const GREENWAY_EVENT = "albany_city__greenway__event";
const FULL = { compact_context: false, compact_result: false } as const;
const EXPECTED_DEFERRED_GUIDANCE =
  "Choose the current journey option first. 5 optional follow-up leads remain. Complete any other required choice. The leads return when play resumes.";

const EXPECTED_LEADS: readonly JourneyOpportunityLeadPresentation[] = [
  {
    id: STATION_EVENT,
    kind: "event",
    title: "Hayden Hale's Cade Return Filing Standard",
    area: "Albany Station Quarter",
    access: "here",
  },
  {
    id: CADE_JOB,
    kind: "job",
    title: "Hayden's Cade Return Packet",
    area: "Albany Station Quarter",
    access: "here",
  },
  {
    id: MARKET_EVENT,
    kind: "event",
    title: "Jamie Tanner's Winter Price Policy",
    area: "Albany Market Streets",
    access: "mapped",
  },
  {
    id: CAMPUS_EVENT,
    kind: "event",
    title: "Albany Campus Row: Return Evidence Mandate",
    area: "Albany Campus Row",
    access: "route_unmapped",
  },
  {
    id: GREENWAY_EVENT,
    kind: "event",
    title: "Albany Greenway: trail sign damage",
    area: "Albany Greenway",
    access: "route_unmapped",
  },
];

const EXPECTED_COMPACT = EXPECTED_LEADS.map(
  (lead) => [lead.kind, lead.id, lead.title, lead.area, lead.access] as const,
);

function moveToArea(
  session: OverworldSession,
  targetAreaId: string,
  world: OverworldManifest = WORLD,
): void {
  for (let attempts = 0; !session.view().areas.some((area) => area.id === targetAreaId); ) {
    if (attempts >= 8) throw new Error(`Could not map ${targetAreaId}.`);
    const currentArea = session.view().currentArea;
    if (!currentArea) throw new Error("Expected a current local area.");
    session.exploreArea(currentArea.id);
    attempts += 1;
  }
  const start = session.view().currentArea?.id;
  if (!start || start === targetAreaId) return;
  const edges = world.area_edges.filter((edge) => edge.home === session.view().current.id);
  const queue = [start];
  const previous = new Map<string, string>();
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
    if (!prior) throw new Error(`No local route reaches ${targetAreaId}.`);
    path.unshift(cursor);
    cursor = prior;
  }
  for (const areaId of path) {
    const route = session.view().areaExits.find((edge) => edge.destination.id === areaId);
    if (!route) throw new Error(`Missing visible route to ${areaId}.`);
    session.moveArea(route.id);
  }
}

function preparedForWolf(): { session: OverworldSession; wolfId: string } {
  const session = new OverworldSession(WORLD);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(WORLD.opening_registration!.contact);
  session.chooseJourneyStory("albany:ledger_advocate");
  revealCurrentJourneyStoryOptions(session, WORLD.opening_relief_oath!.id);
  session.chooseJourneyStory("albany:oath_full_compact_duty");
  session.chooseJourneyStory("albany:source_rowan_civic_docket");
  moveToArea(session, WORLD.opening_preparation!.area);
  session.chooseJourneyStory("albany:prep_works_fortification");
  if (session.view().departureInteractions[0]?.kind === "relief_allocation") {
    session.chooseJourneyStory("albany:relief_cade_fodder");
  }
  const wolf = session.view().quests.find((quest) => quest.id === "wolf_winter");
  if (!wolf) throw new Error("Expected Wolf-Winter after the Albany opening.");
  moveToArea(session, wolf.area);
  // One Station action reveals exactly the Cade packet and the Works route.
  // The Greenway remains authored-but-unmapped, matching the captured return.
  session.scoutPoi(STATION_POI);
  return { session, wolfId: wolf.id };
}

function atWolfCompletion(): OverworldSession {
  const { session, wolfId } = preparedForWolf();
  session.startQuest(wolfId, "albany:wolf_approach_sheltered_stockway");
  session.completeQuest(wolfId, {
    endingId: "ending_pack_diverted_cattle_scattered",
    endingTitle: "The Pack Diverted, Cattle Scattered",
    death: false,
  });
  return session;
}

function atNorthGoal(): OverworldSession {
  const session = atWolfCompletion();
  session.chooseJourney("continue");
  session.chooseJourneyStory("send_wagon_to_cade");
  return session;
}

function expectExactAlbanyLeads(session: OverworldSession): void {
  const before = session.snapshot();
  const beforeHash = session.snapshotHash();
  const beforeDecisions = session.journey().acceptedDecisions;
  const opportunities = session.journey().opportunities;

  expect("opportunities" in before).toBe(false);
  expect(opportunities).toEqual({
    guidance: JOURNEY_OPPORTUNITY_GUIDANCE,
    leads: EXPECTED_LEADS,
  });
  expect(Object.keys(opportunities!).sort()).toEqual(["guidance", "leads"]);
  expect(Object.keys(opportunities!.leads[0]!).sort()).toEqual([
    "access",
    "area",
    "id",
    "kind",
    "title",
  ]);
  expect(session.compactView().opportunity_guidance).toBe(JOURNEY_OPPORTUNITY_GUIDANCE);
  expect(session.compactView().opportunity_leads).toEqual(EXPECTED_COMPACT);
  expect(session.compactView().opportunity_leads_truncated).toBeUndefined();
  expect(JSON.stringify(opportunities)).not.toMatch(
    /dispatch_|hold_household|post_accessible|terms|minutes|renown|reward|consequence|prompt/i,
  );
  expect(session.snapshot()).toEqual(before);
  expect(session.snapshotHash()).toBe(beforeHash);
  expect(session.journey().acceptedDecisions).toBe(beforeDecisions);
}

function expectDeferredAlbanyLeads(session: OverworldSession): void {
  const before = session.snapshot();
  const beforeHash = session.snapshotHash();
  const beforeDecisions = session.journey().acceptedDecisions;
  const opportunities = session.journey().opportunities;

  expect(opportunities).toEqual({
    guidance: EXPECTED_DEFERRED_GUIDANCE,
    leads: [],
    deferredLeadCount: EXPECTED_LEADS.length,
  });
  expect(Object.keys(opportunities!).sort()).toEqual(["deferredLeadCount", "guidance", "leads"]);
  const compact = session.compactView();
  expect(compact).toMatchObject({
    opportunity_guidance: EXPECTED_DEFERRED_GUIDANCE,
    opportunity_leads_deferred: EXPECTED_LEADS.length,
  });
  expect(compact.opportunity_leads).toBeUndefined();
  expect(compact.opportunity_leads_truncated).toBeUndefined();
  expect(cloneOverworldCompactView(compact).opportunity_leads_deferred).toBe(EXPECTED_LEADS.length);
  expect(session.snapshot()).toEqual(before);
  expect(session.snapshotHash()).toBe(beforeHash);
  expect(session.journey().acceptedDecisions).toBe(beforeDecisions);
}

describe("optional return opportunity leads", () => {
  it("defers five roots at journey boundaries, then restores their exact active-play detail", () => {
    const untouched = new OverworldSession(WORLD);
    const untouchedSnapshot = untouched.snapshot();
    untouched.journey();
    expect(untouched.snapshot()).toEqual(untouchedSnapshot);

    const prepared = preparedForWolf();
    expect(prepared.session.journey().opportunities).toBeNull();
    expect(prepared.session.compactView().opportunity_guidance).toBeUndefined();
    expect(prepared.session.compactView().opportunity_leads).toBeUndefined();

    prepared.session.startQuest(prepared.wolfId, "albany:wolf_approach_sheltered_stockway");
    prepared.session.completeQuest(prepared.wolfId, {
      endingId: "ending_pack_diverted_cattle_scattered",
      endingTitle: "The Pack Diverted, Cattle Scattered",
      death: false,
    });
    expect(prepared.session.journey()).toMatchObject({
      status: "awaiting_choice",
      acceptedDecisions: 10,
      goal: { id: "albany_local_lead", status: "completed" },
      pendingChoice: { reasons: ["goal_completed"] },
    });
    expectDeferredAlbanyLeads(prepared.session);

    prepared.session.chooseJourney("continue");
    expect(prepared.session.journey()).toMatchObject({
      status: "active",
      acceptedDecisions: 10,
      storyChoice: { id: "albany_dawn_dispatch" },
    });
    expectDeferredAlbanyLeads(prepared.session);

    prepared.session.chooseJourneyStory("send_wagon_to_cade");
    expect(prepared.session.journey()).toMatchObject({
      status: "active",
      acceptedDecisions: 11,
      goal: { id: "carry_hedricks_packet_north", status: "active" },
      goalPassage: { id: "follow_current_goal", destination: "Queensbury town" },
    });
    expectExactAlbanyLeads(prepared.session);

    const ended = atWolfCompletion();
    ended.chooseJourney("end");
    expect(ended.journey().opportunities).toBeNull();
    expect(ended.compactView().opportunity_guidance).toBeUndefined();
    expect(ended.compactView().opportunity_leads).toBeUndefined();
    expect("opportunities" in ended.journeyExitReceipt()!).toBe(false);
  });

  it("keeps one structured journey authority and an exact bounded compact projection in MCP", () => {
    const boundary = atWolfCompletion();
    const boundaryFull = createToolApi({ root: process.cwd() }).restore_overworld_session({
      ...FULL,
      snapshot: boundary.snapshot(),
    });
    const boundaryCompact = createToolApi({ root: process.cwd() }).restore_overworld_session({
      compact_context: true,
      snapshot: boundary.snapshot(),
    });
    expect(boundaryFull.journey.opportunities).toEqual(boundary.journey().opportunities);
    expect(boundaryCompact.journey.opportunities).toEqual(boundaryFull.journey.opportunities);
    expect(boundaryCompact.context).toMatchObject({
      opportunity_guidance: EXPECTED_DEFERRED_GUIDANCE,
      opportunity_leads_deferred: EXPECTED_LEADS.length,
    });
    expect(boundaryCompact.context.opportunity_leads).toBeUndefined();
    expect(boundaryCompact.context.opportunity_leads_truncated).toBeUndefined();

    const session = atNorthGoal();
    const api = createToolApi({ root: process.cwd() });
    const full = api.restore_overworld_session({ ...FULL, snapshot: session.snapshot() });
    const compact = api.restore_overworld_session({
      compact_context: true,
      snapshot: session.snapshot(),
    });

    expect(full.journey.opportunities).toEqual(session.journey().opportunities);
    expect("opportunities" in full.observation).toBe(false);
    expect(compact.journey.opportunities).toEqual(full.journey.opportunities);
    expect(compact.context.v).toBe(OVERWORLD_COMPACT_VIEW_VERSION);
    expect(compact.context.opportunity_guidance).toBe(JOURNEY_OPPORTUNITY_GUIDANCE);
    expect(compact.context.opportunity_leads).toEqual(EXPECTED_COMPACT);
    expect(compact.legend?.opportunity_guidance).toMatch(/pursuit guidance/i);
    expect(compact.legend?.opportunity_leads).toMatch(/here\|mapped\|route_unmapped/);
    expect(compact.legend?.opportunity_leads).toMatch(/no choices, rewards, or outcomes/i);
    expect(
      compact.context.opportunity_leads?.map(([kind, id, title, area, access]) => ({
        id,
        kind,
        title,
        area,
        access,
      })),
    ).toEqual(full.journey.opportunities?.leads);
  });

  it("replaces the Market event with its revealed settlement and removes the finished job", () => {
    const session = atNorthGoal();
    moveToArea(session, MARKET);
    expect(
      session.journey().opportunities?.leads.find((lead) => lead.id === MARKET_EVENT),
    ).toMatchObject({ access: "here", kind: "event" });

    session.scoutPoi(MARKET_POI);
    session.talkToCharacter(MARKET_CONTACT);
    session.investigateEvent(MARKET_EVENT);
    session.resolveEvent(MARKET_EVENT, MARKET_POLICY);
    expect(session.journey().opportunities?.leads.map((lead) => lead.id)).not.toContain(
      MARKET_EVENT,
    );
    expect(session.journey().opportunities?.leads.find((lead) => lead.id === MARKET_JOB)).toEqual({
      id: MARKET_JOB,
      kind: "job",
      title: "Jamie's Disputed Crates",
      area: "Albany Market Streets",
      access: "here",
    });

    session.workLocalJob(MARKET_JOB, MARKET_SETTLEMENT);
    expect(session.journey().opportunities?.leads.map((lead) => lead.id)).not.toContain(MARKET_JOB);
  });

  it("updates Greenway access only after ordinary discovery and removes Cade only on completion", () => {
    const greenway = atNorthGoal();
    const beforeProjection = greenway.snapshot();
    expect(
      greenway.journey().opportunities?.leads.find((lead) => lead.id === GREENWAY_EVENT),
    ).toMatchObject({ access: "route_unmapped" });
    greenway.compactView();
    greenway.journey();
    expect(greenway.snapshot()).toEqual(beforeProjection);

    greenway.exploreArea(STATION);
    expect(greenway.snapshot().discoveredAreaIds).toContain(GREENWAY);
    expect(
      greenway.journey().opportunities?.leads.find((lead) => lead.id === GREENWAY_EVENT),
    ).toMatchObject({ access: "mapped" });
    moveToArea(greenway, GREENWAY);
    expect(
      greenway.journey().opportunities?.leads.find((lead) => lead.id === GREENWAY_EVENT),
    ).toMatchObject({ access: "here" });

    const cade = atNorthGoal();
    cade.talkToCharacter(STATION_CONTACT);
    expect(cade.view().jobChoices).toContainEqual([CADE_JOB, CADE_OPTION]);
    cade.workLocalJob(CADE_JOB, CADE_OPTION);
    expect(cade.journey().opportunities?.leads.map((lead) => lead.id)).not.toContain(CADE_JOB);
    expect(cade.journey().opportunities?.leads.map((lead) => lead.id)).not.toContain(STATION_EVENT);
  });

  it("survives cross-area travel, goal-follow departure, pending road, restore, and arrival", () => {
    const session = atNorthGoal();
    const restored = OverworldSession.restore(WORLD, session.snapshot());
    expect(restored.journey().opportunities).toEqual(session.journey().opportunities);
    expect(restored.compactView().opportunity_leads).toEqual(EXPECTED_COMPACT);

    moveToArea(restored, MARKET);
    expect(
      restored.journey().opportunities?.leads.find((lead) => lead.id === MARKET_EVENT),
    ).toMatchObject({ access: "here" });
    expect(
      restored.journey().opportunities?.leads.find((lead) => lead.id === CADE_JOB),
    ).toMatchObject({ access: "mapped" });
    moveToArea(restored, STATION);

    const beforeFollow = restored.journey().acceptedDecisions;
    const passage = restored.followGoalPassage();
    expect(passage.stopReason).toBe("road_encounter");
    expect(restored.view().pendingRoadEncounter).not.toBeNull();
    expect(restored.journey().acceptedDecisions).toBe(beforeFollow + 1);
    expect(restored.journey().opportunities?.leads).toEqual([
      { ...EXPECTED_LEADS[2], access: "mapped" },
      { ...EXPECTED_LEADS[0], access: "mapped" },
      { ...EXPECTED_LEADS[1], access: "mapped" },
      EXPECTED_LEADS[3],
      EXPECTED_LEADS[4],
    ]);
    expect(restored.compactView().opportunity_leads).toEqual([
      [
        "event",
        MARKET_EVENT,
        "Jamie Tanner's Winter Price Policy",
        "Albany Market Streets",
        "mapped",
      ],
      [
        "event",
        STATION_EVENT,
        "Hayden Hale's Cade Return Filing Standard",
        "Albany Station Quarter",
        "mapped",
      ],
      ["job", CADE_JOB, "Hayden's Cade Return Packet", "Albany Station Quarter", "mapped"],
      [
        "event",
        CAMPUS_EVENT,
        "Albany Campus Row: Return Evidence Mandate",
        "Albany Campus Row",
        "route_unmapped",
      ],
      [
        "event",
        GREENWAY_EVENT,
        "Albany Greenway: trail sign damage",
        "Albany Greenway",
        "route_unmapped",
      ],
    ]);

    const pending = OverworldSession.restore(WORLD, restored.snapshot());
    expect(pending.journey().opportunities).toEqual(restored.journey().opportunities);
    expect(pending.compactView().opportunity_leads).toEqual(
      restored.compactView().opportunity_leads,
    );
    pending.resolveRoadEncounter("press_on");
    expect(pending.followGoalPassage()).toMatchObject({
      stopReason: "objective",
      stoppedAt: "Queensbury town",
    });
    expect(pending.journey().goal.id).toBe("carry_hedricks_packet_north");
    expect(pending.journey().opportunities?.leads.map((lead) => lead.id)).toEqual([
      MARKET_EVENT,
      STATION_EVENT,
      CADE_JOB,
      CAMPUS_EVENT,
      GREENWAY_EVENT,
    ]);
  });

  it("revalidates exact active identities into one lawful action without changing state", () => {
    const session = atNorthGoal();
    const before = session.snapshot();
    const beforeHash = session.snapshotHash();
    const cadeLead = session
      .journey()
      .opportunities?.leads.find((lead) => lead.kind === "job" && lead.id === CADE_JOB);
    if (!cadeLead) throw new Error("Expected the Cade return lead.");

    const here = session.explainOpportunity({ kind: "job", id: CADE_JOB });
    expect(here).toEqual({
      lead: cadeLead,
      nextAction: {
        tool: "talk_overworld_session_contact",
        arguments: { character_id: STATION_CONTACT },
        command: `talk ${STATION_CONTACT}`,
        label: "Talk to the required contact.",
      },
    });

    const mapped = session.explainOpportunity({ kind: "event", id: MARKET_EVENT });
    expect(mapped.nextAction).toMatchObject({
      tool: "move_overworld_session_area",
      arguments: { area_route_id: expect.any(String) },
    });
    const unmapped = session.explainOpportunity({ kind: "event", id: GREENWAY_EVENT });
    expect(unmapped.nextAction).toEqual({
      tool: "explore_overworld_session_area",
      arguments: { area_id: STATION },
      command: `explore ${STATION}`,
      label: "Explore Albany Station Quarter to reveal more local leads.",
    });

    expect(session.snapshot()).toEqual(before);
    expect(session.snapshotHash()).toBe(beforeHash);
    expect(JSON.stringify([here, mapped, unmapped])).not.toMatch(
      /dispatch_pasture|hold_household|terms|preview|consequence|minutes|renown|reward|prompt/i,
    );

    const executable = OverworldSession.restore(WORLD, before);
    executable.talkToCharacter(STATION_CONTACT);
    expect(executable.view().jobChoices).toContainEqual([CADE_JOB, CADE_OPTION]);
  });

  it("fails closed at stale, journey-choice, story-choice, and road-encounter boundaries", () => {
    const active = atNorthGoal();
    expect(() => active.explainOpportunity({ kind: "event", id: CADE_JOB })).toThrow(
      `Opportunity lead "event:${CADE_JOB}" is not currently projected.`,
    );
    active.talkToCharacter(STATION_CONTACT);
    active.workLocalJob(CADE_JOB, CADE_OPTION);
    expect(() => active.explainOpportunity({ kind: "job", id: CADE_JOB })).toThrow(
      /not currently projected/i,
    );

    const continueEnd = atWolfCompletion();
    expect(() => continueEnd.explainOpportunity({ kind: "job", id: CADE_JOB })).toThrow(
      /continue or end/i,
    );
    continueEnd.chooseJourney("continue");
    expect(() => continueEnd.explainOpportunity({ kind: "job", id: CADE_JOB })).toThrow(
      /choose the open story option/i,
    );

    const road = atNorthGoal();
    expect(road.followGoalPassage().stopReason).toBe("road_encounter");
    expect(() => road.explainOpportunity({ kind: "job", id: CADE_JOB })).toThrow(
      /resolve the pending road encounter/i,
    );
  });

  it("keeps full and compact MCP explanations on the same unchanged snapshot", () => {
    const session = atNorthGoal();
    const api = createToolApi({ root: process.cwd() });
    const fullStart = api.restore_overworld_session({ ...FULL, snapshot: session.snapshot() });
    const compactStart = api.restore_overworld_session({
      compact_context: true,
      snapshot: session.snapshot(),
    });
    const full = api.explain_overworld_session_opportunity({
      session_id: fullStart.session_id,
      kind: "job",
      id: CADE_JOB,
      ...FULL,
    });
    const compact = api.explain_overworld_session_opportunity({
      session_id: compactStart.session_id,
      kind: "job",
      id: CADE_JOB,
    });
    expect(full.explanation).toEqual(session.explainOpportunity({ kind: "job", id: CADE_JOB }));
    expect(full.snapshot_hash).toBe(fullStart.snapshot_hash);
    expect(compact.snapshot_hash).toBe(compactStart.snapshot_hash);
    expect(compact.explanation.lead).toEqual([
      full.explanation.lead.kind,
      full.explanation.lead.id,
      full.explanation.lead.title,
      full.explanation.lead.area,
      full.explanation.lead.access,
    ]);
    expect(compact.explanation.next_action).toEqual([
      full.explanation.nextAction.tool,
      full.explanation.nextAction.arguments,
      full.explanation.nextAction.command,
      full.explanation.nextAction.label,
    ]);
  });
});
