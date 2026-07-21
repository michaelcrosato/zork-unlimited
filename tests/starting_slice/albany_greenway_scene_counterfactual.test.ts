/**
 * Depth Contract #11: Emery's post-Wolf trail policy constrains a later
 * Greenway survey while preserving a real time-versus-standing decision.
 */
import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import { createToolApi } from "../../src/mcp/tools.js";
import {
  AUTHORED_ALBANY_GREENWAY_PREDECESSOR_WORLD_HASH,
  AUTHORED_ALBANY_MARKET_PREDECESSOR_WORLD_HASH,
  authoredLocalEventLegacyOptionId,
} from "../../src/world/local_event_scene_legacy.js";
import { authoredLocalJobLegacyOptionId } from "../../src/world/local_job_scene_legacy.js";
import type { OverworldManifest } from "../../src/world/overworld.js";
import { OverworldSession } from "../../src/world/session.js";
import { cloneOverworldSessionSnapshot } from "../../src/world/session_snapshot.js";
import { OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH } from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { OverworldSession as UiOverworldSession } from "../../ui/src/overworld.js";
import {
  exactAlbanyGreenwayDepthPredecessor,
  exactAlbanyMarketDepthPredecessor,
} from "../regression/fixtures/historical_overworlds.js";

const WORLD = loadOverworldManifest(process.cwd());
const PREDECESSOR = exactAlbanyGreenwayDepthPredecessor(WORLD);
const FOUNDATION_PREDECESSOR = exactAlbanyMarketDepthPredecessor(WORLD);
const REGION = "Capital / Mohawk";
const AREA = "albany_city__greenway";
const POI = "albany_city__greenway__poi";
const CONTACT = "albany_city__greenway__contact";
const EVENT = "albany_city__greenway__event";
const EVENT_SCENE = "albany:greenway-trail-policy";
const PUBLIC = "post_accessible_public_detour";
const QUIET = "place_quiet_corridor_markers";
const JOB = "albany_city__greenway__job";
const JOB_SCENE = "albany:greenway-corridor-survey";
const PUBLIC_FAST = "stake_shortest_accessible_detour";
const PUBLIC_DEEP = "map_all_weather_public_loop";
const QUIET_FAST = "reset_steward_markers";
const QUIET_DEEP = "trace_winter_wildlife_corridor_with_witness_points";
const MARKET_AREA = "albany_city__market";
const MARKET_POI = "albany_city__market__poi";
const MARKET_CONTACT = "albany_city__market__contact";
const MARKET_EVENT = "albany_city__market__event";
const MARKET_EVENT_SCENE = "albany:winter-price-policy";
const MARKET_POLICY = "hold_household_kitchen_prices";
const MARKET_JOB = "albany_city__market__job";
const MARKET_JOB_SCENE = "albany:disputed-winter-crates";
const MARKET_SETTLEMENT = "release_price_hold_operational";
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

function returnedToGreenway(world: OverworldManifest = WORLD): OverworldSession {
  const session = new OverworldSession(world);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(world.opening_registration!.contact);
  session.chooseJourneyStory("albany:ledger_advocate");
  session.chooseJourneyStory("albany:oath_full_compact_duty");
  session.chooseJourneyStory("albany:source_rowan_civic_docket");
  moveToArea(session, world.opening_preparation!.area, world);
  session.chooseJourneyStory("albany:prep_works_fortification");
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
    endingId: "ending_held",
    endingTitle: "The Byre Held",
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
  optionId: typeof PUBLIC | typeof QUIET,
  world: OverworldManifest = WORLD,
): OverworldSession {
  const session = returnedToGreenway(world);
  session.investigateEvent(EVENT);
  session.resolveEvent(EVENT, optionId);
  return session;
}

describe("Albany Greenway trail policy and corridor survey", () => {
  it("keeps the post-Wolf policy optional and leaves first-goal completion untouched", () => {
    const event = WORLD.local_events.find((candidate) => candidate.id === EVENT);
    const job = WORLD.local_jobs.find((candidate) => candidate.id === JOB);
    expect(event?.authored_scene?.requires_completed_quests).toEqual(["wolf_winter"]);
    expect(job?.authored_scene?.requires_completed_quests).toEqual(["wolf_winter"]);
    expect(job?.authored_scene?.requires_resolved_events).toEqual([EVENT]);

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
    }) => {
      const fastSession = authorPolicy(policy);
      const deepSession = authorPolicy(policy);
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
    const optionIds = new Set([PUBLIC_FAST, PUBLIC_DEEP, QUIET_FAST, QUIET_DEEP]);
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

    const alteredCopy = structuredClone(snapshot);
    const jobEntry = alteredCopy.journalEntries.find((entry) => entry.id === `job:${JOB}`);
    if (!jobEntry) throw new Error("Expected Greenway job journal entry.");
    jobEntry.text = `${jobEntry.text} altered`;
    expect(() => OverworldSession.restore(WORLD, alteredCopy)).toThrow(/canonical option copy/i);
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

  it("migrates only the exact generic predecessor and invents neither policy nor survey option", () => {
    expect(hashState(PREDECESSOR)).toBe(AUTHORED_ALBANY_GREENWAY_PREDECESSOR_WORLD_HASH);
    expect(hashState(WORLD)).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH);

    const legacy = returnedToGreenway(PREDECESSOR);
    legacy.investigateEvent(EVENT);
    legacy.resolveEvent(EVENT);

    const eventOnly = OverworldSession.restore(WORLD, legacy.snapshot());
    expect(eventOnly.view().jobChoices).toEqual([]);
    expect(eventOnly.view().jobs.map((candidate) => candidate.id)).not.toContain(JOB);

    legacy.workLocalJob(JOB);
    const legacySnapshot = legacy.snapshot();
    const restored = OverworldSession.restore(WORLD, legacySnapshot);
    const migrated = restored.snapshot();
    expect(migrated.worldHash).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH);
    expect(migrated.regionRenown).toEqual(legacySnapshot.regionRenown);
    expect(
      migrated.journalEntries.find((entry) => entry.id === `resolve:${EVENT}`)?.localSceneProof,
    ).toMatchObject({
      sceneId: EVENT_SCENE,
      optionId: authoredLocalEventLegacyOptionId(AUTHORED_ALBANY_GREENWAY_PREDECESSOR_WORLD_HASH),
      sourceWorldHash: AUTHORED_ALBANY_GREENWAY_PREDECESSOR_WORLD_HASH,
    });
    expect(
      migrated.journalEntries.find((entry) => entry.id === `job:${JOB}`)?.localSceneProof,
    ).toMatchObject({
      sceneId: JOB_SCENE,
      optionId: authoredLocalJobLegacyOptionId(AUTHORED_ALBANY_GREENWAY_PREDECESSOR_WORLD_HASH),
      sourceWorldHash: AUTHORED_ALBANY_GREENWAY_PREDECESSOR_WORLD_HASH,
    });
    expect(restored.view().eventChoices).toEqual([]);
    expect(restored.view().jobChoices).toEqual([]);
    expect(OverworldSession.restore(WORLD, migrated).snapshot()).toEqual(migrated);

    const altered = structuredClone(legacySnapshot);
    const legacyEvent = altered.journalEntries.find((entry) => entry.id === `resolve:${EVENT}`);
    if (!legacyEvent) throw new Error("Expected generic Greenway event entry.");
    legacyEvent.text = `${legacyEvent.text} forged`;
    expect(() => OverworldSession.restore(WORLD, altered)).toThrow(/exact trusted copy/i);

    const unknown = structuredClone(legacySnapshot);
    unknown.worldHash = "f".repeat(64);
    expect(() => OverworldSession.restore(WORLD, unknown)).toThrow(/different world manifest/i);
  });

  it("migrates foundation-era generic Market and Greenway completions as neutral markers", () => {
    expect(hashState(FOUNDATION_PREDECESSOR)).toBe(AUTHORED_ALBANY_MARKET_PREDECESSOR_WORLD_HASH);
    const legacy = returnedToGreenway(FOUNDATION_PREDECESSOR);
    legacy.investigateEvent(EVENT);
    legacy.resolveEvent(EVENT);
    legacy.workLocalJob(JOB);

    moveToArea(legacy, MARKET_AREA, FOUNDATION_PREDECESSOR);
    legacy.scoutPoi(MARKET_POI);
    legacy.talkToCharacter(MARKET_CONTACT);
    legacy.investigateEvent(MARKET_EVENT);
    legacy.resolveEvent(MARKET_EVENT);
    legacy.workLocalJob(MARKET_JOB);

    const restored = OverworldSession.restore(WORLD, legacy.snapshot());
    for (const [entryId, sceneId] of [
      [`resolve:${MARKET_EVENT}`, MARKET_EVENT_SCENE],
      [`job:${MARKET_JOB}`, MARKET_JOB_SCENE],
      [`resolve:${EVENT}`, EVENT_SCENE],
      [`job:${JOB}`, JOB_SCENE],
    ] as const) {
      expect(
        restored.snapshot().journalEntries.find((entry) => entry.id === entryId)?.localSceneProof,
      ).toMatchObject({
        sceneId,
        optionId: entryId.startsWith("resolve:")
          ? authoredLocalEventLegacyOptionId(AUTHORED_ALBANY_MARKET_PREDECESSOR_WORLD_HASH)
          : authoredLocalJobLegacyOptionId(AUTHORED_ALBANY_MARKET_PREDECESSOR_WORLD_HASH),
        sourceWorldHash: AUTHORED_ALBANY_MARKET_PREDECESSOR_WORLD_HASH,
      });
    }
    expect(restored.view().eventChoices).toEqual([]);
    expect(restored.view().jobChoices).toEqual([]);
    expect(() => restored.resolveEvent(MARKET_EVENT, MARKET_POLICY)).toThrow(
      /different authored option/i,
    );
    expect(() => restored.workLocalJob(MARKET_JOB, MARKET_SETTLEMENT)).toThrow(
      /different authored option|not available/i,
    );
  });

  it("retains native Market proof while neutralizing only generic Greenway at 8e0b", () => {
    const legacy = returnedToGreenway(PREDECESSOR);
    moveToArea(legacy, MARKET_AREA, PREDECESSOR);
    legacy.scoutPoi(MARKET_POI);
    legacy.talkToCharacter(MARKET_CONTACT);
    legacy.investigateEvent(MARKET_EVENT);
    legacy.resolveEvent(MARKET_EVENT, MARKET_POLICY);
    legacy.workLocalJob(MARKET_JOB, MARKET_SETTLEMENT);
    const nativeMarketEntries = legacy
      .snapshot()
      .journalEntries.filter(
        (entry) => entry.id === `resolve:${MARKET_EVENT}` || entry.id === `job:${MARKET_JOB}`,
      );

    moveToArea(legacy, AREA, PREDECESSOR);
    legacy.investigateEvent(EVENT);
    legacy.resolveEvent(EVENT);
    legacy.workLocalJob(JOB);
    const restored = OverworldSession.restore(WORLD, legacy.snapshot());
    expect(
      restored
        .snapshot()
        .journalEntries.filter(
          (entry) => entry.id === `resolve:${MARKET_EVENT}` || entry.id === `job:${MARKET_JOB}`,
        ),
    ).toEqual(nativeMarketEntries);
    expect(
      restored.snapshot().journalEntries.find((entry) => entry.id === `resolve:${MARKET_EVENT}`)
        ?.localSceneProof,
    ).toMatchObject({ sceneId: MARKET_EVENT_SCENE, optionId: MARKET_POLICY });
    expect(
      restored.snapshot().journalEntries.find((entry) => entry.id === `job:${MARKET_JOB}`)
        ?.localSceneProof,
    ).toMatchObject({ sceneId: MARKET_JOB_SCENE, optionId: MARKET_SETTLEMENT });
    expect(
      restored.snapshot().journalEntries.find((entry) => entry.id === `resolve:${EVENT}`)
        ?.localSceneProof,
    ).toMatchObject({
      sceneId: EVENT_SCENE,
      optionId: authoredLocalEventLegacyOptionId(AUTHORED_ALBANY_GREENWAY_PREDECESSOR_WORLD_HASH),
      sourceWorldHash: AUTHORED_ALBANY_GREENWAY_PREDECESSOR_WORLD_HASH,
    });
    expect(
      restored.snapshot().journalEntries.find((entry) => entry.id === `job:${JOB}`)
        ?.localSceneProof,
    ).toMatchObject({
      sceneId: JOB_SCENE,
      optionId: authoredLocalJobLegacyOptionId(AUTHORED_ALBANY_GREENWAY_PREDECESSOR_WORLD_HASH),
      sourceWorldHash: AUTHORED_ALBANY_GREENWAY_PREDECESSOR_WORLD_HASH,
    });
  });

  it("migrates an unresolved predecessor natively and preserves existing Albany authored scenes", () => {
    const unresolved = returnedToGreenway(PREDECESSOR);
    expect(unresolved.snapshot().resolvedEventIds).not.toContain(EVENT);
    const restored = OverworldSession.restore(WORLD, unresolved.snapshot());
    expect(restored.snapshot().resolvedEventIds).not.toContain(EVENT);
    expect(restored.snapshot().completedJobIds).not.toContain(JOB);
    expect(restored.view().events.map((candidate) => candidate.id)).toContain(EVENT);
    expect(restored.view().eventChoices).toEqual([]);
    restored.investigateEvent(EVENT);
    expect(restored.view().eventChoices).toEqual([
      [EVENT, PUBLIC],
      [EVENT, QUIET],
    ]);

    expect(
      WORLD.local_events.find((candidate) => candidate.id === "albany_city__civic_core__event")
        ?.authored_scene?.id,
    ).toBe("albany:winter-return-charter-record");
    expect(
      WORLD.local_jobs.find((candidate) => candidate.id === "albany_city__industrial__job")
        ?.authored_scene?.id,
    ).toBe("albany:works-yard-winter-shift");
    expect(
      WORLD.local_jobs.find((candidate) => candidate.id === "albany_city__campus__job")
        ?.authored_scene?.id,
    ).toBe("albany:campus-wolf-archive-query");
    expect(
      WORLD.local_jobs.find((candidate) => candidate.id === "albany_city__transport_hub__job")
        ?.authored_scene?.id,
    ).toBe("albany:cade-return-packet");
  });
});
