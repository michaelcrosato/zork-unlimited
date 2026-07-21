/**
 * Depth Contract #11: Albany's Charter Backlog and Civic Ledger form one
 * replay-bound decision across Wolf-Winter, with a later resource reversal.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import { createToolApi } from "../../src/mcp/tools.js";
import { deriveCampaignWorldFactIds } from "../../src/world/campaign_consequences.js";
import { availableLocalJobSceneOptions } from "../../src/world/local_job_scene.js";
import {
  AUTHORED_ALBANY_CHARTER_LEGACY_OPTION_ID,
  WINTER_RETURN_DOCKET_PREDECESSOR_WORLD_HASH,
  authoredLocalEventLegacyOptionId,
} from "../../src/world/local_event_scene_legacy.js";
import { authoredLocalJobLegacyOptionId } from "../../src/world/local_job_scene_legacy.js";
import type { OverworldManifest } from "../../src/world/overworld.js";
import { OverworldSession } from "../../src/world/session.js";
import {
  OVERWORLD_AUTHORED_LOCAL_JOB_FIRST_SCENE_WORLD_HASH,
  OVERWORLD_AUTHORED_LOCAL_JOB_PREDECESSOR_WORLD_HASH,
  OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH,
} from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { OverworldSession as UiOverworldSession } from "../../ui/src/overworld.js";
import {
  exactAuthoredAlbanyWorksFirstSceneWorld,
  exactAuthoredAlbanyWorksPredecessor,
  exactWinterReturnDocketPredecessor,
} from "../regression/fixtures/historical_overworlds.js";

const WORLD = loadOverworldManifest(process.cwd());
const PREDECESSOR = exactWinterReturnDocketPredecessor(WORLD);
const FIRST_WORKS_SCENE_WORLD = exactAuthoredAlbanyWorksFirstSceneWorld(WORLD);
const PRE_WORKS_WORLD = exactAuthoredAlbanyWorksPredecessor(WORLD);
const REGION = "Capital / Mohawk";
const EVENT_ID = "albany_city__civic_core__event";
const EVENT_SCENE_ID = "albany:winter-return-charter-record";
const JOB_ID = "albany_city__civic_core__job";
const JOB_SCENE_ID = "albany:winter-return-docket";
const CIVIC_AREA = "albany_city__civic_core";
const PUBLIC = "open_public_relief_record";
const PROTECTED = "protect_household_relief_details";
const PUBLIC_HELD = "file_public_held_return";
const PROTECTED_HELD = "seal_protected_held_return";
const PUBLIC_EVACUATED = "file_public_evacuated_return";
const PROTECTED_EVACUATED = "seal_protected_evacuated_return";
const COT = "albany:works_public_shift_civic_rest";
const FULL = { compact_context: false, compact_result: false } as const;

function moveToArea(
  session: OverworldSession,
  targetAreaId: string,
  world: OverworldManifest = WORLD,
): void {
  const startAreaId = session.view().currentArea?.id;
  if (!startAreaId || startAreaId === targetAreaId) return;
  const edges = world.area_edges.filter((edge) => edge.home === session.view().current.id);
  const queue = [startAreaId];
  const previous = new Map<string, string>();
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    if (current === targetAreaId) break;
    for (const edge of edges.filter(
      (candidate) => candidate.from_area === current || candidate.to_area === current,
    )) {
      const next = edge.from_area === current ? edge.to_area : edge.from_area;
      if (next === startAreaId || previous.has(next)) continue;
      previous.set(next, current);
      queue.push(next);
    }
  }
  const path: string[] = [];
  for (let cursor = targetAreaId; cursor !== startAreaId; ) {
    const prior = previous.get(cursor);
    if (!prior) throw new Error(`No Albany area route reaches ${targetAreaId}.`);
    path.unshift(cursor);
    cursor = prior;
  }
  for (const areaId of path) {
    const exit = session.view().areaExits.find((candidate) => candidate.destination.id === areaId);
    if (!exit) throw new Error(`Albany does not expose the next area ${areaId}.`);
    session.moveArea(exit.id);
  }
}

function preparedForWolf(
  eventOption: string | null,
  world: OverworldManifest = WORLD,
): { session: OverworldSession; wolf: { id: string; area: string } } {
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

  if (eventOption !== null) {
    moveToArea(session, CIVIC_AREA, world);
    session.investigateEvent(EVENT_ID);
    session.resolveEvent(EVENT_ID, eventOption);
  }

  const wolf = session.view().quests.find((quest) => quest.id === "wolf_winter");
  if (!wolf) throw new Error("The Albany opening must expose Wolf-Winter.");
  moveToArea(session, wolf.area, world);
  return { session, wolf };
}

function returnedToCivic(
  eventOption: string | null,
  endingId = "ending_held",
  endingTitle = "The Byre Held",
  world: OverworldManifest = WORLD,
): OverworldSession {
  const { session, wolf } = preparedForWolf(eventOption, world);
  // The selected source already makes Wolf-Winter legal. Skipping the optional
  // site keeps the causal arithmetic at event +2 and Wolf +8.
  session.startQuest(wolf.id, "albany:wolf_approach_sheltered_stockway");
  session.completeQuest(wolf.id, { endingId, endingTitle, death: false });
  session.chooseJourney("continue");
  session.chooseJourneyStory("send_wardens_north");
  moveToArea(session, CIVIC_AREA, world);
  return session;
}

describe("Winter Return Docket", () => {
  it("makes the pre-Wolf Charter Backlog one exact irreversible authored decision", () => {
    const session = preparedForWolf(null).session;
    moveToArea(session, CIVIC_AREA);
    const event = session.view().events.find((candidate) => candidate.id === EVENT_ID);
    expect(event?.authored_scene?.id).toBe(EVENT_SCENE_ID);
    expect(event?.authored_scene?.options.map((option) => option.id)).toEqual([PUBLIC, PROTECTED]);
    expect(event?.authored_scene?.options.map((option) => option.terms)).toEqual([
      { minutes: 50, renown: 2 },
      { minutes: 50, renown: 2 },
    ]);
    expect(session.view().eventChoices).toEqual([]);
    expect(() => session.resolveEvent(EVENT_ID)).toThrow(/Before resolving/i);

    session.investigateEvent(EVENT_ID);
    expect(() => session.resolveEvent(EVENT_ID)).toThrow(/Choose one authored option/i);
    expect(session.view().eventChoices).toEqual([
      [EVENT_ID, PUBLIC],
      [EVENT_ID, PROTECTED],
    ]);
    expect(session.compactView().event_choices).toEqual(session.view().eventChoices);
    expect(session.compactView().event_scenes?.[0]?.slice(0, 2)).toEqual([
      EVENT_ID,
      EVENT_SCENE_ID,
    ]);
    expect(() => session.resolveEvent(EVENT_ID, "invented_policy")).toThrow(
      /Unknown local-event scene option/i,
    );

    const before = session.snapshot();
    const resolved = session.resolveEvent(EVENT_ID, PUBLIC);
    expect(resolved).toMatchObject({ minutes: 50, alreadyKnown: false });
    expect(session.snapshot().minutes - before.minutes).toBe(50);
    expect(session.view().regionRenown[REGION]).toBe(2);
    expect(resolved.entry.title).toContain("Open a public winter-relief record");
    expect(() => session.resolveEvent(EVENT_ID, PROTECTED)).toThrow(/different authored option/i);
    expect(
      session.snapshot().journalEntries.find((entry) => entry.id === `resolve:${EVENT_ID}`),
    ).toMatchObject({
      localSceneProof: {
        sceneId: EVENT_SCENE_ID,
        optionId: PUBLIC,
        boundary: { townId: "albany_city", areaId: CIVIC_AREA },
      },
    });
    expect(OverworldSession.restore(WORLD, session.snapshot()).snapshot()).toEqual(
      session.snapshot(),
    );
  });

  it("reveals one truthful post-Wolf closure and preserves it through full, compact, UI, and MCP", () => {
    const session = returnedToCivic(PUBLIC);
    expect(session.view().regionRenown[REGION]).toBe(10);
    expect(session.view().jobs.find((job) => job.id === JOB_ID)?.authored_scene?.id).toBe(
      JOB_SCENE_ID,
    );
    expect(session.view().jobChoices).toEqual([[JOB_ID, PUBLIC_HELD]]);
    expect(session.compactView().job_choices).toEqual([[JOB_ID, PUBLIC_HELD]]);
    expect(() => session.workLocalJob(JOB_ID, PROTECTED_HELD)).toThrow(/not available/i);

    const liveSnapshot = session.snapshot();
    expect(UiOverworldSession.restore(WORLD, liveSnapshot).view().jobChoices).toEqual([
      [JOB_ID, PUBLIC_HELD],
    ]);
    const liveApi = createToolApi({ root: process.cwd() });
    const liveFull = liveApi.restore_overworld_session({ ...FULL, snapshot: liveSnapshot });
    expect(liveFull.observation.jobChoices).toEqual([[JOB_ID, PUBLIC_HELD]]);
    const liveCompact = liveApi.restore_overworld_session({
      compact_context: true,
      snapshot: liveSnapshot,
    });
    expect(liveCompact.context.job_choices).toEqual([[JOB_ID, PUBLIC_HELD]]);
    expect(liveCompact.context.job_scenes?.[0]?.[0]).toBe(JOB_ID);
    const liveWorked = liveApi.work_overworld_session_job({
      ...FULL,
      session_id: liveFull.session_id,
      job_id: JOB_ID,
      option_id: PUBLIC_HELD,
    });
    expect(liveWorked.result.minutes).toBe(70);
    expect(liveWorked.observation.completedJobIds).toContain(JOB_ID);

    const before = session.snapshot();
    const completed = session.workLocalJob(JOB_ID, PUBLIC_HELD);
    expect(completed.minutes).toBe(70);
    expect(session.snapshot().minutes - before.minutes).toBe(70);
    expect(session.view().regionRenown[REGION]).toBe(13);
    expect(session.view().serviceOffers).toContainEqual(
      expect.objectContaining({ id: COT, action: "rest", minutes: 15 }),
    );
    const snapshot = session.snapshot();
    expect(OverworldSession.restore(WORLD, snapshot).snapshot()).toEqual(snapshot);
    expect(UiOverworldSession.restore(WORLD, snapshot).view().serviceOffers).toEqual(
      session.view().serviceOffers,
    );

    const api = createToolApi({ root: process.cwd() });
    expect(api.restore_overworld_session({ ...FULL, snapshot }).observation.serviceOffers).toEqual(
      session.view().serviceOffers,
    );
    expect(
      api.restore_overworld_session({ compact_context: true, snapshot }).context.service_offers,
    ).toEqual(session.compactView().service_offers);
  });

  it("exposes the authored event choice itself through MCP and the human UI action", () => {
    const session = preparedForWolf(null).session;
    moveToArea(session, CIVIC_AREA);
    session.investigateEvent(EVENT_ID);
    const api = createToolApi({ root: process.cwd() });
    const restored = api.restore_overworld_session({
      compact_context: true,
      snapshot: session.snapshot(),
    });
    expect(restored.context.event_choices).toEqual([
      [EVENT_ID, PUBLIC],
      [EVENT_ID, PROTECTED],
    ]);
    expect(restored.context.event_scenes?.[0]?.[0]).toBe(EVENT_ID);
    expect(() =>
      api.resolve_overworld_session_event({
        ...FULL,
        session_id: restored.session_id,
        event_id: EVENT_ID,
      }),
    ).toThrow(/Choose one authored option/i);
    const resolved = api.resolve_overworld_session_event({
      ...FULL,
      session_id: restored.session_id,
      event_id: EVENT_ID,
      option_id: PROTECTED,
    });
    expect(resolved.result.minutes).toBe(50);
    expect(resolved.observation.resolvedEventIds).toContain(EVENT_ID);

    const app = readFileSync("ui/src/App.tsx", "utf8");
    expect(app).toContain("scene.options.map((option)");
    expect(app).toContain("worldSession.resolveEvent(event.id, option.id)");
    expect(app).toContain("option.terms.minutes");
    expect(app).toContain("option.terms.renown");
  });

  it("maps every non-death Wolf export and each early policy to exactly one closure", () => {
    const wolf = WORLD.quests.find((quest) => quest.id === "wolf_winter");
    const scene = WORLD.local_jobs.find((job) => job.id === JOB_ID)?.authored_scene;
    if (!wolf?.campaign_exports || !scene) throw new Error("expected Wolf exports and Civic scene");
    expect(wolf.campaign_exports).toHaveLength(11);
    for (const campaignExport of wolf.campaign_exports) {
      const facts = new Set(deriveCampaignWorldFactIds([campaignExport.effects]));
      const held = facts.has("fact:wolf_winter_byre_held");
      const evacuated = facts.has("fact:wolf_winter_steading_evacuated");
      expect(held).not.toBe(evacuated);
      for (const eventOption of [PUBLIC, PROTECTED]) {
        const available = availableLocalJobSceneOptions(scene, {
          completedQuestIds: new Set(["wolf_winter"]),
          resolvedEventIds: new Set([EVENT_ID]),
          worldFactIds: facts,
          eventOptionIdFor: () => eventOption,
        });
        expect(available, `${campaignExport.ending_id}:${eventOption}`).toHaveLength(1);
        expect(available[0]!.id).toBe(
          held
            ? eventOption === PUBLIC
              ? PUBLIC_HELD
              : PROTECTED_HELD
            : eventOption === PUBLIC
              ? PUBLIC_EVACUATED
              : PROTECTED_EVACUATED,
        );
      }
    }
  });

  it("proves the held-byre legal route reverses between rested speed and fatigued public standing", () => {
    // This is an existence proof for a legal route, not a journey-wide invariant:
    // it deliberately skips optional regional renown and uses the held-byre export
    // required by the Civic cot.
    const restedPublic = returnedToCivic(PUBLIC);
    const restedProtected = returnedToCivic(PROTECTED);
    expect(restedPublic.view().fatigue).toBe(10);
    expect(restedProtected.view().fatigue).toBe(10);
    expect(restedPublic.restAtTown()).toMatchObject({ changed: true, minutes: 180 });
    expect(restedProtected.restAtTown()).toMatchObject({ changed: true, minutes: 180 });
    const restedPublicStart = restedPublic.snapshot().minutes;
    const restedProtectedStart = restedProtected.snapshot().minutes;
    restedPublic.workLocalJob(JOB_ID, PUBLIC_HELD);
    restedProtected.workLocalJob(JOB_ID, PROTECTED_HELD);
    expect(restedPublic.snapshot().minutes - restedPublicStart).toBe(70);
    expect(restedProtected.snapshot().minutes - restedProtectedStart).toBe(25);
    expect(restedProtected.snapshot().minutes - restedProtectedStart).toBeLessThan(
      restedPublic.snapshot().minutes - restedPublicStart,
    );

    const fatiguedPublic = returnedToCivic(PUBLIC);
    const fatiguedProtected = returnedToCivic(PROTECTED);
    const fatiguedPublicStart = fatiguedPublic.snapshot().minutes;
    const fatiguedProtectedStart = fatiguedProtected.snapshot().minutes;
    fatiguedPublic.workLocalJob(JOB_ID, PUBLIC_HELD);
    fatiguedProtected.workLocalJob(JOB_ID, PROTECTED_HELD);
    expect(fatiguedPublic.restAtTown()).toMatchObject({
      changed: true,
      minutes: 15,
      fatigueAfter: 0,
    });
    expect(fatiguedProtected.restAtTown()).toMatchObject({
      changed: true,
      minutes: 180,
      fatigueAfter: 0,
    });
    expect(fatiguedPublic.snapshot().journalEntries).toContainEqual(
      expect.objectContaining({ kind: "service", serviceRuleId: COT }),
    );
    expect(fatiguedProtected.snapshot().journalEntries).not.toContainEqual(
      expect.objectContaining({ kind: "service", serviceRuleId: COT }),
    );
    expect(fatiguedPublic.snapshot().minutes - fatiguedPublicStart).toBe(85);
    expect(fatiguedProtected.snapshot().minutes - fatiguedProtectedStart).toBe(205);
    expect(fatiguedPublic.snapshot().minutes - fatiguedPublicStart).toBeLessThan(
      fatiguedProtected.snapshot().minutes - fatiguedProtectedStart,
    );
  });

  it("rejects altered event/job proofs and enforces their causal order", () => {
    const eventSession = preparedForWolf(PUBLIC).session;
    const eventTamper = eventSession.snapshot();
    const eventEntry = eventTamper.journalEntries.find(
      (entry) => entry.id === `resolve:${EVENT_ID}`,
    );
    if (!eventEntry?.localSceneProof) throw new Error("expected event proof");
    eventEntry.localSceneProof.optionId = PROTECTED;
    expect(() => OverworldSession.restore(WORLD, eventTamper)).toThrow(
      /canonical option copy|accepted decision proof/i,
    );

    const completed = returnedToCivic(PUBLIC);
    completed.workLocalJob(JOB_ID, PUBLIC_HELD);
    const jobTamper = completed.snapshot();
    const jobEntry = jobTamper.journalEntries.find((entry) => entry.id === `job:${JOB_ID}`);
    if (!jobEntry?.localSceneProof) throw new Error("expected job proof");
    jobEntry.localSceneProof.optionId = PUBLIC_EVACUATED;
    expect(() => OverworldSession.restore(WORLD, jobTamper)).toThrow(
      /accepted decision proof|world-fact requirements/i,
    );

    const reordered = completed.snapshot();
    const eventIndex = reordered.journalEntries.findIndex(
      (entry) => entry.id === `resolve:${EVENT_ID}`,
    );
    const jobIndex = reordered.journalEntries.findIndex((entry) => entry.id === `job:${JOB_ID}`);
    if (eventIndex < 0 || jobIndex < 0) throw new Error("expected causal entries");
    const [event] = reordered.journalEntries.splice(eventIndex, 1);
    reordered.journalEntries.splice(jobIndex, 0, event!);
    expect(() => OverworldSession.restore(WORLD, reordered)).toThrow(
      /newest-first|earlier event|requirements/i,
    );
  });

  it("migrates exact ff630a1e evidence to a neutral event path without inventing policy", () => {
    expect(hashState(PREDECESSOR)).toBe(WINTER_RETURN_DOCKET_PREDECESSOR_WORLD_HASH);
    expect(hashState(WORLD)).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH);

    const legacy = preparedForWolf(null, PREDECESSOR).session;
    if (legacy.journey().storyChoice?.kind === "relief_allocation") {
      legacy.chooseJourneyStory("albany:relief_cade_fodder");
    }
    moveToArea(legacy, CIVIC_AREA, PREDECESSOR);
    legacy.investigateEvent(EVENT_ID);
    legacy.resolveEvent(EVENT_ID);
    legacy.workLocalJob(JOB_ID);
    const predecessor = legacy.snapshot();
    const migrated = OverworldSession.restore(WORLD, predecessor);
    const migratedSnapshot = migrated.snapshot();
    expect(migratedSnapshot.worldHash).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH);
    expect(
      migratedSnapshot.journalEntries.find((entry) => entry.id === `resolve:${EVENT_ID}`)
        ?.localSceneProof,
    ).toMatchObject({
      sceneId: EVENT_SCENE_ID,
      optionId: AUTHORED_ALBANY_CHARTER_LEGACY_OPTION_ID,
      sourceWorldHash: WINTER_RETURN_DOCKET_PREDECESSOR_WORLD_HASH,
    });
    expect(
      migratedSnapshot.journalEntries.find((entry) => entry.id === `job:${JOB_ID}`)
        ?.localSceneProof,
    ).toMatchObject({
      sceneId: JOB_SCENE_ID,
      sourceWorldHash: WINTER_RETURN_DOCKET_PREDECESSOR_WORLD_HASH,
    });
    expect(migrated.view().eventChoices).toEqual([]);
    expect(migrated.view().jobChoices).toEqual([]);
    expect(OverworldSession.restore(WORLD, migratedSnapshot).snapshot()).toEqual(migratedSnapshot);
  });

  it.each([
    [
      "first Works scene",
      FIRST_WORKS_SCENE_WORLD,
      OVERWORLD_AUTHORED_LOCAL_JOB_FIRST_SCENE_WORLD_HASH,
    ],
    ["pre-Works", PRE_WORKS_WORLD, OVERWORLD_AUTHORED_LOCAL_JOB_PREDECESSOR_WORLD_HASH],
  ] as const)(
    "chains the %s generic Civic boundary through the current authored scenes",
    (_label, legacyWorld, sourceWorldHash) => {
      expect(hashState(legacyWorld)).toBe(sourceWorldHash);
      const legacy = preparedForWolf(null, legacyWorld).session;
      if (legacy.journey().storyChoice?.kind === "relief_allocation") {
        legacy.chooseJourneyStory("albany:relief_cade_fodder");
      }
      moveToArea(legacy, CIVIC_AREA, legacyWorld);
      legacy.investigateEvent(EVENT_ID);
      legacy.resolveEvent(EVENT_ID);
      legacy.workLocalJob(JOB_ID);

      const migrated = OverworldSession.restore(WORLD, legacy.snapshot());
      const snapshot = migrated.snapshot();
      expect(
        snapshot.journalEntries.find((entry) => entry.id === `resolve:${EVENT_ID}`)
          ?.localSceneProof,
      ).toMatchObject({
        sceneId: EVENT_SCENE_ID,
        optionId: authoredLocalEventLegacyOptionId(sourceWorldHash),
        sourceWorldHash,
      });
      expect(
        snapshot.journalEntries.find((entry) => entry.id === `job:${JOB_ID}`)?.localSceneProof,
      ).toMatchObject({
        sceneId: JOB_SCENE_ID,
        optionId: authoredLocalJobLegacyOptionId(sourceWorldHash),
        sourceWorldHash,
      });
      expect(OverworldSession.restore(WORLD, snapshot).snapshot()).toEqual(snapshot);
    },
  );

  it("does not add a mandatory decision to first-goal completion", () => {
    const session = returnedToCivic(null);
    expect(session.snapshot().resolvedEventIds).not.toContain(EVENT_ID);
    expect(session.snapshot().completedQuestIds).toContain("wolf_winter");
    expect(session.journey().acceptedDecisions).toBeLessThanOrEqual(45);
    expect(session.view().jobs.map((job) => job.id)).not.toContain(JOB_ID);
    expect(session.view().jobChoices).toEqual([]);
    expect(session.view().events.map((event) => event.id)).not.toContain(EVENT_ID);
    expect(session.view().eventChoices).toEqual([]);
    const beforeLateInvestigation = session.snapshot();
    expect(() => session.investigateEvent(EVENT_ID)).toThrow(/must be made before completing/i);
    expect(session.snapshot()).toEqual(beforeLateInvestigation);
    expect(session.snapshot().journalEntries.map((entry) => entry.id)).not.toContain(
      `investigate:${EVENT_ID}`,
    );
    expect(() => session.resolveEvent(EVENT_ID, PUBLIC)).toThrow(
      /Before resolving|must be made before completing/i,
    );

    const restored = OverworldSession.restore(WORLD, session.snapshot());
    expect(restored.view().events.map((event) => event.id)).not.toContain(EVENT_ID);
    expect(restored.view().eventChoices).toEqual([]);
    expect(() => restored.investigateEvent(EVENT_ID)).toThrow(/must be made before completing/i);
    expect(() => restored.resolveEvent(EVENT_ID, PROTECTED)).toThrow(
      /Before resolving|must be made before completing/i,
    );
  });
});
