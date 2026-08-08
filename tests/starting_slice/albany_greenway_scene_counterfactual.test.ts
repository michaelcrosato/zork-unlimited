/**
 * Depth Contract #11: Emery's post-Wolf trail policy constrains a later
 * Greenway survey while preserving a real time-versus-standing decision.
 */
import { describe, expect, it } from "vitest";

import { createToolApi } from "../../src/mcp/tools.js";
import type { OverworldManifest } from "../../src/world/overworld.js";
import { OverworldSession } from "../../src/world/session.js";
import { cloneOverworldSessionSnapshot } from "../../src/world/session_snapshot.js";
import { OVERWORLD_CONTENT_HASH_MISMATCH_WARNING } from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { OverworldSession as UiOverworldSession } from "../../ui/src/overworld.js";
import { revealCurrentJourneyStoryOptions } from "../regression/support/journey_story.js";

const WORLD = loadOverworldManifest(process.cwd());
const REGION = "Capital / Mohawk";
const AREA = "albany_city__greenway";
const POI = "albany_city__greenway__poi";
const CONTACT = "albany_city__greenway__contact";
const EVENT = "albany_city__greenway__event";
const EVENT_SCENE = "albany:greenway-trail-policy";
const PUBLIC = "post_accessible_public_detour";
const QUIET = "place_quiet_corridor_markers";
const CUSTODY = "open_bloodshed_evidence_custody";
const JOB = "albany_city__greenway__job";
const PUBLIC_FAST = "stake_shortest_accessible_detour";
const PUBLIC_DEEP = "map_all_weather_public_loop";
const QUIET_FAST = "reset_steward_markers";
const QUIET_DEEP = "trace_winter_wildlife_corridor_with_witness_points";
const CUSTODY_FAST = "secure_minimum_bloodshed_custody_marks";
const CUSTODY_DEEP = "trace_bloodshed_chain_of_custody_with_witness_points";
const OUTCOME_NEUTRAL_EVENT_PROMPT =
  "Emery offers two lawful permanent records for the damaged crossing. Choose one irreversible record; the later corridor survey must match the access promise and account entered here.";
const CIVIC_RECOVERY = "albany:works_public_shift_civic_rest";
const FULL = { compact_context: false, compact_result: false } as const;

function moveToArea(
  session: OverworldSession,
  target: string,
  world: OverworldManifest = WORLD,
): void {
  for (let attempts = 0; !session.view().areas.some((area) => area.id === target); attempts += 1) {
    if (attempts >= 6) throw new Error(`Could not map ${target} from the current Albany route.`);
    const currentArea = session.view().currentArea;
    if (!currentArea) throw new Error("Expected an Albany area before mapping a route.");
    session.exploreArea(currentArea.id);
  }
  const start = session.view().currentArea?.id;
  if (!start || start === target) return;
  const edges = world.area_edges.filter((edge) => edge.home === session.view().current.id);
  const previous = new Map<string, string>();
  const queue = [start];
  for (let index = 0; index < queue.length; index += 1) {
    const here = queue[index]!;
    for (const edge of edges.filter(
      (candidate) => candidate.from_area === here || candidate.to_area === here,
    )) {
      const next = edge.from_area === here ? edge.to_area : edge.from_area;
      if (next === start || previous.has(next)) continue;
      previous.set(next, here);
      queue.push(next);
    }
  }
  const path: string[] = [];
  for (let cursor = target; cursor !== start; ) {
    const prior = previous.get(cursor);
    if (!prior) throw new Error(`No Albany path reaches ${target}.`);
    path.unshift(cursor);
    cursor = prior;
  }
  for (const area of path) {
    const exit = session.view().areaExits.find((candidate) => candidate.destination.id === area);
    if (!exit) throw new Error(`Missing visible area exit to ${area}.`);
    session.moveArea(exit.id);
  }
}

function returnedToGreenway(
  world: OverworldManifest = WORLD,
  endingId = "ending_pack_diverted",
  endingTitle = "The Pack Diverted Alive",
  preparationId = "albany:prep_works_fortification",
): OverworldSession {
  const session = new OverworldSession(world);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(world.opening_registration!.contact);
  session.chooseJourneyStory("albany:ledger_advocate");
  revealCurrentJourneyStoryOptions(session, world.opening_relief_oath!.id);
  session.chooseJourneyStory("albany:oath_full_compact_duty");
  session.chooseJourneyStory("albany:source_rowan_civic_docket");
  moveToArea(session, world.opening_preparation!.area, world);
  session.chooseJourneyStory(preparationId);
  if (session.view().departureInteractions[0]?.kind === "relief_allocation") {
    session.chooseJourneyStory("albany:relief_cade_fodder");
  }
  const wolf = session.view().quests.find((quest) => quest.id === "wolf_winter");
  if (!wolf) throw new Error("Wolf-Winter must be exposed.");
  moveToArea(session, wolf.area, world);
  session.scoutPoi("albany_city__transport_hub__poi");
  session.talkToCharacter("albany_city__transport_hub__contact");
  session.startQuest(wolf.id, "albany:wolf_approach_sheltered_stockway");
  session.completeQuest(wolf.id, {
    endingId,
    endingTitle,
    death: false,
  });
  session.chooseJourney("continue");
  session.chooseJourneyStory("send_wardens_north");
  moveToArea(session, AREA, world);
  session.scoutPoi(POI);
  session.talkToCharacter(CONTACT);
  return session;
}

function authorPolicy(
  optionId: typeof PUBLIC | typeof QUIET | typeof CUSTODY,
  world: OverworldManifest = WORLD,
  endingId = "ending_pack_diverted",
  endingTitle = "The Pack Diverted Alive",
): OverworldSession {
  const session = returnedToGreenway(world, endingId, endingTitle);
  session.investigateEvent(EVENT);
  session.resolveEvent(EVENT, optionId);
  return session;
}

function assertOnlyProjectedGreenwayOptions(
  surface: unknown,
  legal: readonly string[],
  forbidden: readonly string[],
): void {
  const serialized = JSON.stringify(surface);
  const sourceScene = WORLD.local_jobs.find((job) => job.id === JOB)?.authored_scene;
  if (!sourceScene) throw new Error("Expected canonical Greenway job scene.");
  for (const optionId of legal) {
    const sourceOption = sourceScene.options.find((option) => option.id === optionId);
    if (!sourceOption) throw new Error(`Missing canonical Greenway job option ${optionId}.`);
    expect(serialized).toContain(sourceOption.id);
    expect(serialized).toContain(sourceOption.title);
  }
  for (const optionId of forbidden) {
    const sourceOption = sourceScene.options.find((option) => option.id === optionId);
    if (!sourceOption) throw new Error(`Missing canonical Greenway job option ${optionId}.`);
    expect(serialized).not.toContain(sourceOption.id);
    expect(serialized).not.toContain(sourceOption.title);
    expect(serialized).not.toContain(sourceOption.preview);
    expect(serialized).not.toContain(sourceOption.consequence);
  }
  for (const predicateKey of [
    "requires_event_options",
    "requires_all_world_facts",
    "forbids_any_world_facts",
    "requires_all_story_choices",
    "forbids_any_story_choices",
    "character_conditions",
  ]) {
    expect(serialized).not.toContain(predicateKey);
  }
  expect(serialized).not.toContain("fact:wolf_winter_bloodshed");
  for (const policyOptionId of [PUBLIC, QUIET, CUSTODY]) {
    expect(serialized).not.toContain(policyOptionId);
  }
}

function expectedProjectedGreenwayJobOptions(legal: readonly string[]) {
  const sourceScene = WORLD.local_jobs.find((job) => job.id === JOB)?.authored_scene;
  if (!sourceScene) throw new Error("Expected canonical Greenway job scene.");
  return legal.map((optionId) => {
    const option = sourceScene.options.find((candidate) => candidate.id === optionId);
    if (!option) throw new Error(`Missing canonical Greenway job option ${optionId}.`);
    return {
      id: option.id,
      title: option.title,
      preview: option.preview,
      consequence: option.consequence,
      terms: { ...option.terms },
    };
  });
}

function assertOnlyProjectedGreenwayEventOptions(
  surface: unknown,
  legal: readonly string[],
  forbidden: readonly string[],
): void {
  const serialized = JSON.stringify(surface);
  const sourceScene = WORLD.local_events.find((event) => event.id === EVENT)?.authored_scene;
  if (!sourceScene) throw new Error("Expected canonical Greenway event scene.");
  for (const optionId of legal) expect(serialized).toContain(optionId);
  for (const optionId of forbidden) {
    const sourceOption = sourceScene.options.find((option) => option.id === optionId);
    if (!sourceOption) throw new Error(`Missing canonical Greenway option ${optionId}.`);
    expect(serialized).not.toContain(sourceOption.id);
    expect(serialized).not.toContain(sourceOption.title);
    expect(serialized).not.toContain(sourceOption.preview);
    expect(serialized).not.toContain(sourceOption.consequence);
  }
  expect(serialized).not.toContain("requires_all_world_facts");
  expect(serialized).not.toContain("forbids_any_world_facts");
  expect(serialized).not.toContain("fact:wolf_winter_bloodshed");
}

describe("Albany Greenway trail policy and corridor survey", () => {
  it("keeps the post-Wolf policy optional and leaves first-goal completion untouched", () => {
    const event = WORLD.local_events.find((candidate) => candidate.id === EVENT);
    const job = WORLD.local_jobs.find((candidate) => candidate.id === JOB);
    expect(event?.authored_scene?.requires_completed_quests).toEqual(["wolf_winter"]);
    expect(event?.authored_scene?.prompt).toBe(OUTCOME_NEUTRAL_EVENT_PROMPT);
    expect(event?.authored_scene?.prompt).not.toMatch(
      /bloodless return|wolf blood|quiet steward|evidence-custody/i,
    );
    expect(job?.authored_scene?.requires_completed_quests).toEqual(["wolf_winter"]);
    expect(job?.authored_scene?.requires_resolved_events).toEqual([EVENT]);
    expect(
      [job?.summary, job?.objective, job?.reward, job?.authored_scene?.prompt].join(" "),
    ).not.toMatch(
      /public-detour|quiet-corridor|bloodshed-custody|public work|quiet work|custody work|trail-policy|policy or evidence|evidence account/i,
    );

    const before = new OverworldSession(WORLD);
    expect(before.view().events.map((candidate) => candidate.id)).not.toContain(EVENT);
    expect(before.view().jobs.map((candidate) => candidate.id)).not.toContain(JOB);

    const returned = returnedToGreenway();
    expect(returned.snapshot().completedQuestIds).toContain("wolf_winter");
    expect(returned.snapshot().resolvedEventIds).not.toContain(EVENT);
    expect(returned.snapshot().completedJobIds).not.toContain(JOB);
    expect(returned.journey().acceptedDecisions).toBeLessThanOrEqual(45);
    expect(returned.view().events.map((candidate) => candidate.id)).toContain(EVENT);
    expect(returned.view().jobs.map((candidate) => candidate.id)).not.toContain(JOB);
    expect(OverworldSession.restore(WORLD, returned.snapshot()).snapshot()).toEqual(
      returned.snapshot(),
    );
  });

  it("lets Emery's full-combat custody agenda outrank earlier preparation memories", () => {
    const session = returnedToGreenway(WORLD, "ending_held", "The Byre Held");
    const contact = session
      .snapshot()
      .journalEntries.find((entry) => entry.id.startsWith("talk:albany_city__greenway__contact@"));

    expect(contact?.id).toBe("talk:albany_city__greenway__contact@wolf_full_combat_bloodshed");
    expect(contact?.text).toMatch(/full combat count/i);
    expect(contact?.text).toMatch(/chain-of-custody survey/i);
    expect(contact?.text).not.toMatch(/pre-feed can absorb/i);
  });

  it.each([
    ["Cade-fodder allocation", "albany:prep_works_fortification", /pre-feed can absorb/i],
    ["drover-route preparation", "albany:prep_drover_route", /route is one recovery attempt/i],
  ] as const)(
    "lets Emery's hybrid custody agenda outrank the earlier %s memory",
    (_memory, preparationId, shadowedCopy) => {
      const session = returnedToGreenway(
        WORLD,
        "ending_pack_diverted_after_blood",
        "The Pack Broken After Blood",
        preparationId,
      );
      const contact = session
        .snapshot()
        .journalEntries.find((entry) =>
          entry.id.startsWith("talk:albany_city__greenway__contact@"),
        );

      expect(contact?.id).toBe(
        "talk:albany_city__greenway__contact@wolf_pack_diverted_after_blood",
      );
      expect(contact?.text).toMatch(/exact mixed-line tally/i);
      expect(contact?.text).toMatch(/accountable custody survey/i);
      expect(contact?.text).not.toMatch(shadowedCopy);
    },
  );

  it("makes Emery's policy irreversible and exposes the exact choice through full, compact, UI, and MCP", () => {
    const session = returnedToGreenway();
    session.investigateEvent(EVENT);
    expect(session.view().eventChoices).toEqual([
      [EVENT, PUBLIC],
      [EVENT, QUIET],
    ]);
    expect(session.compactView().event_choices).toEqual(session.view().eventChoices);
    expect(session.compactView().event_scenes?.[0]?.slice(0, 2)).toEqual([EVENT, EVENT_SCENE]);
    expect(() => session.resolveEvent(EVENT)).toThrow(/Choose one authored option/i);

    const api = createToolApi({ root: process.cwd() });
    const full = api.restore_overworld_session({ ...FULL, snapshot: session.snapshot() });
    const compact = api.restore_overworld_session({
      compact_context: true,
      snapshot: session.snapshot(),
    });
    expect(full.observation.eventChoices).toEqual(session.view().eventChoices);
    expect(compact.context.event_choices).toEqual(session.view().eventChoices);
    expect(UiOverworldSession.restore(WORLD, session.snapshot()).view().eventChoices).toEqual(
      session.view().eventChoices,
    );

    const resolved = api.resolve_overworld_session_event({
      ...FULL,
      session_id: full.session_id,
      event_id: EVENT,
      option_id: PUBLIC,
    });
    expect(resolved.result.minutes).toBe(35);
    expect(resolved.observation.jobChoices).toEqual([
      [JOB, PUBLIC_FAST],
      [JOB, PUBLIC_DEEP],
    ]);

    session.resolveEvent(EVENT, PUBLIC);
    expect(() => session.resolveEvent(EVENT, QUIET)).toThrow(/different authored option/i);
    expect(session.view().jobChoices).toEqual([
      [JOB, PUBLIC_FAST],
      [JOB, PUBLIC_DEEP],
    ]);
    expect(session.compactView().job_choices).toEqual(session.view().jobChoices);
    const ui = UiOverworldSession.restore(WORLD, session.snapshot());
    expect(ui.view().jobChoices).toEqual(session.view().jobChoices);
    expect(ui.workLocalJob(JOB, PUBLIC_FAST).minutes).toBe(30);

    const jobFull = api.restore_overworld_session({ ...FULL, snapshot: session.snapshot() });
    const jobCompact = api.restore_overworld_session({
      compact_context: true,
      snapshot: session.snapshot(),
    });
    expect(jobFull.observation.jobChoices).toEqual(session.view().jobChoices);
    expect(jobCompact.context.job_choices).toEqual(session.view().jobChoices);
    expect(
      api.work_overworld_session_job({
        ...FULL,
        session_id: jobFull.session_id,
        job_id: JOB,
        option_id: PUBLIC_DEEP,
      }).result.minutes,
    ).toBe(75);
  });

  it.each([
    {
      route: "bloodless living-pack return",
      endingId: "ending_pack_diverted",
      endingTitle: "The Pack Diverted Alive",
      legal: [PUBLIC, QUIET],
      forbidden: [CUSTODY],
    },
    {
      route: "hybrid after-blood return",
      endingId: "ending_pack_diverted_after_blood",
      endingTitle: "The Pack Broken After Blood",
      legal: [PUBLIC, CUSTODY],
      forbidden: [QUIET],
    },
    {
      route: "full-combat held return",
      endingId: "ending_held",
      endingTitle: "The Byre Held",
      legal: [PUBLIC, CUSTODY],
      forbidden: [QUIET],
    },
  ] as const)(
    "keeps public detour lawful while accurately gating quiet and custody policy after $route",
    ({ endingId, endingTitle, legal, forbidden }) => {
      const session = returnedToGreenway(WORLD, endingId, endingTitle);
      session.investigateEvent(EVENT);
      expect(session.view().eventChoices).toEqual(legal.map((optionId) => [EVENT, optionId]));
      expect(session.compactView().event_choices).toEqual(session.view().eventChoices);
      expect(UiOverworldSession.restore(WORLD, session.snapshot()).view().eventChoices).toEqual(
        session.view().eventChoices,
      );

      const api = createToolApi({ root: process.cwd() });
      const full = api.restore_overworld_session({ ...FULL, snapshot: session.snapshot() });
      const compact = api.restore_overworld_session({
        compact_context: true,
        snapshot: session.snapshot(),
      });
      expect(full.observation.eventChoices).toEqual(session.view().eventChoices);
      expect(compact.context.event_choices).toEqual(session.view().eventChoices);
      const directEvent = session.view().events.find((event) => event.id === EVENT);
      const directCompactScene = session
        .compactView()
        .event_scenes?.find(([eventId]) => eventId === EVENT);
      const uiEvent = UiOverworldSession.restore(WORLD, session.snapshot())
        .view()
        .events.find((event) => event.id === EVENT);
      const mcpFullEvent = full.observation.events.find((event) => event.id === EVENT);
      const mcpCompactScene = compact.context.event_scenes?.find(([eventId]) => eventId === EVENT);
      expect(directEvent?.authored_scene?.options).toHaveLength(legal.length);
      expect(directCompactScene?.[7]).toHaveLength(legal.length);
      expect(uiEvent?.authored_scene?.options).toHaveLength(legal.length);
      expect(mcpFullEvent?.authored_scene?.options).toHaveLength(legal.length);
      expect(mcpCompactScene?.[7]).toHaveLength(legal.length);
      const projectedSurfaces = [
        directEvent,
        directCompactScene,
        uiEvent,
        mcpFullEvent,
        mcpCompactScene,
      ];
      for (const surface of projectedSurfaces) {
        expect(surface).toBeDefined();
        assertOnlyProjectedGreenwayEventOptions(surface, legal, forbidden);
      }
    },
  );

  it("gives custody a distinct time-and-standing frontier instead of reskinning quiet policy", () => {
    const scene = WORLD.local_events.find((event) => event.id === EVENT)?.authored_scene;
    const quiet = scene?.options.find((option) => option.id === QUIET);
    const custody = scene?.options.find((option) => option.id === CUSTODY);
    expect(quiet?.terms).toEqual({ minutes: 35, renown: 2 });
    expect(custody?.terms).toEqual({ minutes: 30, renown: 1 });

    const session = returnedToGreenway(WORLD, "ending_held", "The Byre Held");
    session.investigateEvent(EVENT);
    const beforeMinutes = session.snapshot().minutes;
    const beforeRenown = session.view().regionRenown[REGION] ?? 0;
    session.resolveEvent(EVENT, CUSTODY);
    expect(session.snapshot().minutes - beforeMinutes).toBe(30);
    expect((session.view().regionRenown[REGION] ?? 0) - beforeRenown).toBe(1);
  });

  it.each([
    {
      policy: PUBLIC,
      legal: [PUBLIC_FAST, PUBLIC_DEEP],
      forbidden: [QUIET_FAST, QUIET_DEEP],
    },
    {
      policy: QUIET,
      legal: [QUIET_FAST, QUIET_DEEP],
      forbidden: [PUBLIC_FAST, PUBLIC_DEEP],
    },
    {
      policy: CUSTODY,
      legal: [CUSTODY_FAST, CUSTODY_DEEP],
      forbidden: [PUBLIC_FAST, PUBLIC_DEEP, QUIET_FAST, QUIET_DEEP],
      endingId: "ending_pack_diverted_after_blood",
      endingTitle: "The Pack Broken After Blood",
    },
  ] as const)(
    "redacts the opposite survey policy from every $policy projection surface",
    ({ policy, legal, forbidden, ...route }) => {
      const expectedChoices = legal.map((optionId) => [JOB, optionId]);
      const expectedCards = expectedProjectedGreenwayJobOptions(legal);
      const expectedCompactCards = expectedCards.map((option) => [
        option.id,
        option.title,
        option.terms.minutes,
        option.terms.renown,
      ]);
      const session = authorPolicy(policy, WORLD, route.endingId, route.endingTitle);
      const directJob = session.view().jobs.find((job) => job.id === JOB);
      expect(directJob?.authored_scene?.options).toEqual(expectedCards);
      assertOnlyProjectedGreenwayOptions(directJob, legal, forbidden);

      const compactScene = session.compactView().job_scenes?.find(([jobId]) => jobId === JOB);
      expect(compactScene?.[6].map(([optionId]) => optionId)).toEqual(legal);
      expect(compactScene?.[6].map((option) => option.slice(0, 4))).toEqual(expectedCompactCards);
      assertOnlyProjectedGreenwayOptions(compactScene, legal, forbidden);

      const uiJob = UiOverworldSession.restore(WORLD, session.snapshot())
        .view()
        .jobs.find((job) => job.id === JOB);
      expect(uiJob?.authored_scene?.options).toEqual(expectedCards);
      assertOnlyProjectedGreenwayOptions(uiJob, legal, forbidden);

      const api = createToolApi({ root: process.cwd() });
      const fullSource = returnedToGreenway(WORLD, route.endingId, route.endingTitle);
      fullSource.investigateEvent(EVENT);
      const full = api.restore_overworld_session({ ...FULL, snapshot: fullSource.snapshot() });
      const fullResolved = api.resolve_overworld_session_event({
        ...FULL,
        session_id: full.session_id,
        event_id: EVENT,
        option_id: policy,
      });
      expect(fullResolved.observation.jobChoices).toEqual(expectedChoices);
      expect(
        fullResolved.observation.jobs.find((job) => job.id === JOB)?.authored_scene?.options,
      ).toEqual(expectedCards);
      assertOnlyProjectedGreenwayOptions(
        fullResolved.observation.jobs.find((job) => job.id === JOB),
        legal,
        forbidden,
      );

      const compactSource = returnedToGreenway(WORLD, route.endingId, route.endingTitle);
      compactSource.investigateEvent(EVENT);
      const compact = api.restore_overworld_session({
        compact_context: true,
        compact_result: true,
        snapshot: compactSource.snapshot(),
      });
      const compactResolved = api.resolve_overworld_session_event({
        compact_context: true,
        compact_result: true,
        session_id: compact.session_id,
        event_id: EVENT,
        option_id: policy,
      });
      expect(compactResolved.context.job_choices).toEqual(expectedChoices);
      expect(
        compactResolved.context.job_scenes
          ?.find(([jobId]) => jobId === JOB)?.[6]
          .map(([optionId]) => optionId),
      ).toEqual(legal);
      expect(
        compactResolved.context.job_scenes
          ?.find(([jobId]) => jobId === JOB)?.[6]
          .map((option) => option.slice(0, 4)),
      ).toEqual(expectedCompactCards);
      assertOnlyProjectedGreenwayOptions(
        compactResolved.context.job_scenes?.find(([jobId]) => jobId === JOB),
        legal,
        forbidden,
      );
    },
  );

  it.each([
    {
      policy: PUBLIC,
      legal: [PUBLIC_FAST, PUBLIC_DEEP],
      forbidden: [QUIET_FAST, QUIET_DEEP],
      fast: PUBLIC_FAST,
      deep: PUBLIC_DEEP,
      fastMinutes: 30,
      deepMinutes: 75,
      fastRenown: 3,
      deepRenown: 5,
    },
    {
      policy: QUIET,
      legal: [QUIET_FAST, QUIET_DEEP],
      forbidden: [PUBLIC_FAST, PUBLIC_DEEP],
      fast: QUIET_FAST,
      deep: QUIET_DEEP,
      fastMinutes: 20,
      deepMinutes: 60,
      fastRenown: 1,
      deepRenown: 4,
    },
    {
      policy: CUSTODY,
      legal: [CUSTODY_FAST, CUSTODY_DEEP],
      forbidden: [PUBLIC_FAST, PUBLIC_DEEP, QUIET_FAST, QUIET_DEEP],
      fast: CUSTODY_FAST,
      deep: CUSTODY_DEEP,
      fastMinutes: 15,
      deepMinutes: 70,
      fastRenown: 1,
      deepRenown: 5,
      endingId: "ending_held",
      endingTitle: "The Byre Held",
    },
  ] as const)(
    "preserves two non-dominant, policy-conditioned survey actions after $policy",
    ({
      policy,
      legal,
      forbidden,
      fast,
      deep,
      fastMinutes,
      deepMinutes,
      fastRenown: fastRenownGain,
      deepRenown: deepRenownGain,
      ...route
    }) => {
      const fastSession = authorPolicy(policy, WORLD, route.endingId, route.endingTitle);
      const deepSession = authorPolicy(policy, WORLD, route.endingId, route.endingTitle);
      expect(fastSession.view().jobChoices).toEqual(legal.map((option) => [JOB, option]));
      for (const option of forbidden) {
        expect(() => fastSession.workLocalJob(JOB, option)).toThrow(/not available/i);
      }

      const fastRenown = fastSession.view().regionRenown[REGION] ?? 0;
      const deepRenown = deepSession.view().regionRenown[REGION] ?? 0;
      const fastStart = fastSession.snapshot().minutes;
      const deepStart = deepSession.snapshot().minutes;
      const fastResult = fastSession.workLocalJob(JOB, fast);
      const deepResult = deepSession.workLocalJob(JOB, deep);
      expect(fastSession.snapshot().minutes - fastStart).toBe(fastMinutes);
      expect(deepSession.snapshot().minutes - deepStart).toBe(deepMinutes);
      expect(fastSession.view().regionRenown[REGION]).toBe(fastRenown + fastRenownGain);
      expect(deepSession.view().regionRenown[REGION]).toBe(deepRenown + deepRenownGain);
      expect(fastMinutes).toBeLessThan(deepMinutes);
      expect(fastResult.entry.title).not.toBe(deepResult.entry.title);
      expect(fastResult.entry.text).not.toBe(deepResult.entry.text);
      expect(fastSession.snapshot().completedJobIds).toContain(JOB);
      expect(() => fastSession.workLocalJob(JOB, deep)).toThrow(
        /already complete|different authored option/i,
      );
    },
  );

  it("makes quiet marking win on time while public marking alone reaches Civic recovery", () => {
    const publicRoute = authorPolicy(PUBLIC);
    const quietRoute = authorPolicy(QUIET);
    expect(publicRoute.view().regionRenown[REGION]).toBe(10);
    expect(quietRoute.view().regionRenown[REGION]).toBe(10);

    const publicStart = publicRoute.snapshot().minutes;
    const quietStart = quietRoute.snapshot().minutes;
    publicRoute.workLocalJob(JOB, PUBLIC_FAST);
    quietRoute.workLocalJob(JOB, QUIET_FAST);
    expect(publicRoute.snapshot().minutes - publicStart).toBe(30);
    expect(quietRoute.snapshot().minutes - quietStart).toBe(20);
    expect(publicRoute.view().regionRenown[REGION]).toBe(13);
    expect(quietRoute.view().regionRenown[REGION]).toBe(11);

    moveToArea(publicRoute, "albany_city__civic_core");
    moveToArea(quietRoute, "albany_city__civic_core");
    expect(publicRoute.view().serviceOffers.map((offer) => offer.id)).toContain(CIVIC_RECOVERY);
    expect(quietRoute.view().serviceOffers.map((offer) => offer.id)).not.toContain(CIVIC_RECOVERY);
  });

  it("adds no Greenway rest or resupply coupon and binds journal, clock, and renown replay", () => {
    const optionIds = new Set([
      PUBLIC_FAST,
      PUBLIC_DEEP,
      QUIET_FAST,
      QUIET_DEEP,
      CUSTODY_FAST,
      CUSTODY_DEEP,
    ]);
    expect(
      (WORLD.campaign_service_rules ?? []).filter((rule) =>
        rule.requires_all_local_job_options?.some(
          (requirement) => requirement.job_id === JOB && optionIds.has(requirement.option_id),
        ),
      ),
    ).toEqual([]);

    const session = authorPolicy(QUIET);
    session.workLocalJob(JOB, QUIET_DEEP);
    const snapshot = session.snapshot();
    const clone = cloneOverworldSessionSnapshot(snapshot);
    expect(clone).toEqual(snapshot);
    expect(OverworldSession.restore(WORLD, clone).snapshot()).toEqual(snapshot);

    const inflated = structuredClone(snapshot);
    const renown = inflated.regionRenown.find(([region]) => region === REGION);
    if (!renown) throw new Error("Expected Capital / Mohawk renown.");
    renown[1] += 1;
    expect(() => OverworldSession.restore(WORLD, inflated)).toThrow(/region renown/i);

    const shiftedClock = structuredClone(snapshot);
    const shiftedJob = shiftedClock.journalEntries.find((entry) => entry.id === `job:${JOB}`);
    if (!shiftedJob?.localSceneProof?.boundary) throw new Error("Expected job clock proof.");
    shiftedJob.localSceneProof.boundary.minutes += 1;
    expect(() => OverworldSession.restore(WORLD, shiftedClock)).toThrow(/boundary time/i);

    const revisedWorld = structuredClone(WORLD);
    const revisedJob = revisedWorld.local_jobs.find((job) => job.id === JOB);
    const revisedOption = revisedJob?.authored_scene?.options.find(
      (option) => option.id === QUIET_DEEP,
    );
    if (!revisedJob?.authored_scene || !revisedOption) {
      throw new Error("Expected Greenway authored job copy.");
    }
    revisedJob.authored_scene.prompt = `${revisedJob.authored_scene.prompt} Revised.`;
    revisedOption.title = `${revisedOption.title} Revised`;
    revisedOption.consequence = `${revisedOption.consequence} Revised.`;
    const restoredRevision = OverworldSession.restore(revisedWorld, snapshot);
    expect(restoredRevision.restoreWarnings()).toEqual([OVERWORLD_CONTENT_HASH_MISMATCH_WARNING]);
    expect(
      restoredRevision.snapshot().journalEntries.find((entry) => entry.id === `job:${JOB}`)?.text,
    ).toBe(snapshot.journalEntries.find((entry) => entry.id === `job:${JOB}`)?.text);
  });

  it("rejects missing, relabeled, cloned, and causally backdated authored proof", () => {
    const completed = authorPolicy(PUBLIC);
    completed.workLocalJob(JOB, PUBLIC_DEEP);
    const source = completed.snapshot();

    const missing = structuredClone(source);
    const missingJob = missing.journalEntries.find((entry) => entry.id === `job:${JOB}`);
    if (!missingJob) throw new Error("Expected Greenway job proof.");
    delete missingJob.localSceneProof;
    expect(() => OverworldSession.restore(WORLD, missing)).toThrow(
      /missing its exact local-scene proof/i,
    );

    const relabeled = structuredClone(source);
    const relabeledJob = relabeled.journalEntries.find((entry) => entry.id === `job:${JOB}`);
    if (!relabeledJob?.localSceneProof) throw new Error("Expected Greenway job proof.");
    relabeledJob.localSceneProof.optionId = QUIET_DEEP;
    expect(() => OverworldSession.restore(WORLD, relabeled)).toThrow(
      /accepted decision proof|earlier event/i,
    );

    const clonedProof = structuredClone(source);
    const eventProof = clonedProof.journalEntries.find(
      (entry) => entry.id === `resolve:${EVENT}`,
    )?.localSceneProof;
    const clonedJob = clonedProof.journalEntries.find((entry) => entry.id === `job:${JOB}`);
    if (!eventProof || !clonedJob) throw new Error("Expected Greenway causal proofs.");
    clonedJob.localSceneProof = structuredClone(eventProof);
    expect(() => OverworldSession.restore(WORLD, clonedProof)).toThrow(
      /exact local-scene proof|boundary time/i,
    );

    const beforeEvent = structuredClone(source);
    const eventIndex = beforeEvent.journalEntries.findIndex(
      (entry) => entry.id === `resolve:${EVENT}`,
    );
    const questIndex = beforeEvent.journalEntries.findIndex(
      (entry) => entry.id === "quest_done:wolf_winter",
    );
    if (eventIndex < 0 || questIndex < 0) throw new Error("Expected event and quest entries.");
    const [eventEntry] = beforeEvent.journalEntries.splice(eventIndex, 1);
    const shiftedQuestIndex = beforeEvent.journalEntries.findIndex(
      (entry) => entry.id === "quest_done:wolf_winter",
    );
    beforeEvent.journalEntries.splice(shiftedQuestIndex + 1, 0, eventEntry!);
    expect(() => OverworldSession.restore(WORLD, beforeEvent)).toThrow(
      /chronology|required quest|newest-first/i,
    );

    const beforePolicy = structuredClone(source);
    const jobIndex = beforePolicy.journalEntries.findIndex((entry) => entry.id === `job:${JOB}`);
    const policyIndex = beforePolicy.journalEntries.findIndex(
      (entry) => entry.id === `resolve:${EVENT}`,
    );
    if (jobIndex < 0 || policyIndex < 0) throw new Error("Expected job and policy entries.");
    const [jobEntry] = beforePolicy.journalEntries.splice(jobIndex, 1);
    const shiftedPolicyIndex = beforePolicy.journalEntries.findIndex(
      (entry) => entry.id === `resolve:${EVENT}`,
    );
    beforePolicy.journalEntries.splice(shiftedPolicyIndex + 1, 0, jobEntry!);
    expect(() => OverworldSession.restore(WORLD, beforePolicy)).toThrow(
      /earlier event|requirements|newest-first/i,
    );
  });
});
