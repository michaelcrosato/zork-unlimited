/**
 * Depth Contract #11 follow-up: Reese's optional pre-Wolf safety charter
 * licenses one additional Works return method without replacing the two
 * established priorities. The equal immediate choice creates a reachable
 * time-versus-standing reversal through the existing Civic recovery cot.
 */
import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import { createToolApi } from "../../src/mcp/tools.js";
import {
  AUTHORED_ALBANY_GREENWAY_PREDECESSOR_WORLD_HASH,
  AUTHORED_ALBANY_MARKET_PREDECESSOR_WORLD_HASH,
  AUTHORED_ALBANY_WORKS_HAZARD_PREDECESSOR_WORLD_HASH,
  authoredLocalEventLegacyOptionId,
} from "../../src/world/local_event_scene_legacy.js";
import type { OverworldManifest } from "../../src/world/overworld.js";
import { OverworldSession } from "../../src/world/session.js";
import { OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH } from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { OverworldSession as UiOverworldSession } from "../../ui/src/overworld.js";
import {
  exactAlbanyGreenwayDepthPredecessor,
  exactAlbanyMarketDepthPredecessor,
  exactAlbanyWorksHazardPredecessor,
} from "../regression/fixtures/historical_overworlds.js";

const WORLD = loadOverworldManifest(process.cwd());
const PREDECESSOR = exactAlbanyWorksHazardPredecessor(WORLD);
const REGION = "Capital / Mohawk";
const STATION = "albany_city__transport_hub";
const STATION_POI = "albany_city__transport_hub__poi";
const STATION_CONTACT = "albany_city__transport_hub__contact";
const WORKS = "albany_city__industrial";
const WORKS_POI = "albany_city__industrial__poi";
const WORKS_CONTACT = "albany_city__industrial__contact";
const EVENT = "albany_city__industrial__event";
const EVENT_SCENE = "albany:works-hazard-shift-charter";
const WITNESS_CHARTER = "license_shift_witness_count";
const BYPASS_CHARTER = "authorize_cold_set_gate_bypass";
const JOB = "albany_city__industrial__job";
const PROTECT = "protect_trapped_public_shift";
const INVENTORY = "inventory_outbound_cold_set_stock";
const WITNESS_RELEASE = "release_shift_under_witness_count";
const BYPASS_RELEASE = "open_cold_set_gate_bypass";
const CIVIC = "albany_city__civic_core";
const CIVIC_COT = "albany:works_public_shift_civic_rest";
const FULL = { compact_context: false, compact_result: false } as const;

function moveToArea(
  session: OverworldSession,
  target: string,
  world: OverworldManifest = WORLD,
): void {
  const start = session.view().currentArea?.id;
  if (!start || start === target) return;
  const edges = world.area_edges.filter((edge) => edge.home === session.view().current.id);
  const queue = [start];
  const previous = new Map<string, string>();
  for (let index = 0; index < queue.length; index += 1) {
    const here = queue[index]!;
    if (here === target) break;
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
    const route = session.view().areaExits.find((edge) => edge.destination.id === area);
    if (!route) throw new Error(`The mapped Albany route to ${area} is not visible.`);
    session.moveArea(route.id);
  }
}

function atInvestigatedWorks(
  world: OverworldManifest = WORLD,
  investigate = true,
): { session: OverworldSession; wolfId: string } {
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

  session.scoutPoi(STATION_POI);
  session.talkToCharacter(STATION_CONTACT);
  const wolf = session.view().quests.find((quest) => quest.id === "wolf_winter");
  if (!wolf) throw new Error("The Albany opening must expose Wolf-Winter.");

  moveToArea(session, WORKS, world);
  session.scoutPoi(WORKS_POI);
  session.talkToCharacter(WORKS_CONTACT);
  if (investigate) session.investigateEvent(EVENT);
  return { session, wolfId: wolf.id };
}

function completeWolf(
  source: { session: OverworldSession; wolfId: string },
  world: OverworldManifest = WORLD,
  returnToWorks = true,
): OverworldSession {
  const { session, wolfId } = source;
  moveToArea(session, STATION, world);
  session.startQuest(wolfId, "albany:wolf_approach_sheltered_stockway");
  session.completeQuest(wolfId, {
    endingId: "ending_held",
    endingTitle: "The Byre Held",
    death: false,
  });
  if (!returnToWorks) return session;
  session.chooseJourney("continue");
  session.chooseJourneyStory("send_wardens_north");
  moveToArea(session, WORKS, world);
  return session;
}

function returnedForCharter(
  charterId: typeof WITNESS_CHARTER | typeof BYPASS_CHARTER,
): OverworldSession {
  const source = atInvestigatedWorks();
  source.session.resolveEvent(EVENT, charterId);
  return completeWolf(source);
}

function completedMatchingReturn(args: {
  charterId: typeof WITNESS_CHARTER | typeof BYPASS_CHARTER;
  optionId: typeof WITNESS_RELEASE | typeof BYPASS_RELEASE;
  restBeforeWork?: boolean;
}): { session: OverworldSession; minutesBeforeWork: number } {
  const session = returnedForCharter(args.charterId);
  if (args.restBeforeWork) {
    moveToArea(session, CIVIC);
    expect(session.restAtTown()).toMatchObject({ changed: true, minutes: 180, fatigueAfter: 0 });
    moveToArea(session, WORKS);
  }
  const minutesBeforeWork = session.snapshot().minutes;
  session.workLocalJob(JOB, args.optionId);
  moveToArea(session, CIVIC);
  return { session, minutesBeforeWork };
}

function expectedJobChoices(matching?: string): string[][] {
  return [PROTECT, INVENTORY, ...(matching ? [matching] : [])].map((optionId) => [JOB, optionId]);
}

describe("Albany Works hazard-shift charter", () => {
  it("is optional before Wolf-Winter, expires afterward, and preserves the discovered Works return lead", () => {
    const event = WORLD.local_events.find((candidate) => candidate.id === EVENT);
    expect(event?.authored_scene?.forbids_completed_quests).toEqual(["wolf_winter"]);

    const source = atInvestigatedWorks();
    expect(source.session.view().eventChoices).toEqual([
      [EVENT, WITNESS_CHARTER],
      [EVENT, BYPASS_CHARTER],
    ]);
    expect(source.session.snapshot().discoveredJobIds).toContain(JOB);

    const atCompletion = completeWolf(source, WORLD, false);
    const leadIds = atCompletion.journey().opportunities?.leads.map((lead) => lead.id) ?? [];
    expect(leadIds).toContain(JOB);
    expect(leadIds).not.toContain(EVENT);

    atCompletion.chooseJourney("continue");
    atCompletion.chooseJourneyStory("send_wardens_north");
    moveToArea(atCompletion, WORKS);
    expect(atCompletion.view().events.map((candidate) => candidate.id)).not.toContain(EVENT);
    expect(atCompletion.view().jobChoices).toEqual(expectedJobChoices());
    expect(() => atCompletion.resolveEvent(EVENT, WITNESS_CHARTER)).toThrow(
      /must be made before completing wolf_winter|not available/i,
    );
  });

  it("projects the equal charter choice through full, compact, UI, and MCP surfaces", () => {
    const { session } = atInvestigatedWorks();
    const choices = [
      [EVENT, WITNESS_CHARTER],
      [EVENT, BYPASS_CHARTER],
    ];
    expect(session.view().eventChoices).toEqual(choices);
    expect(session.compactView().event_choices).toEqual(choices);
    expect(session.compactView().event_scenes?.[0]?.slice(0, 2)).toEqual([EVENT, EVENT_SCENE]);
    expect(
      session
        .view()
        .events.find((candidate) => candidate.id === EVENT)
        ?.authored_scene?.options.map((option) => [
          option.id,
          option.terms.minutes,
          option.terms.renown,
        ]),
    ).toEqual([
      [WITNESS_CHARTER, 20, 1],
      [BYPASS_CHARTER, 20, 1],
    ]);
    expect(UiOverworldSession.restore(WORLD, session.snapshot()).view().eventChoices).toEqual(
      choices,
    );

    const api = createToolApi({ root: process.cwd() });
    const full = api.restore_overworld_session({ ...FULL, snapshot: session.snapshot() });
    const compact = api.restore_overworld_session({
      compact_context: true,
      snapshot: session.snapshot(),
    });
    expect(full.observation.eventChoices).toEqual(choices);
    expect(compact.context.event_choices).toEqual(choices);
    const resolved = api.resolve_overworld_session_event({
      ...FULL,
      session_id: full.session_id,
      event_id: EVENT,
      option_id: WITNESS_CHARTER,
    });
    expect(resolved.result).toMatchObject({ alreadyKnown: false, minutes: 20 });
    expect(resolved.observation.regionRenown[REGION]).toBe(
      (session.view().regionRenown[REGION] ?? 0) + 1,
    );
  });

  it.each([
    [WITNESS_CHARTER, WITNESS_RELEASE, BYPASS_RELEASE, 45, 3],
    [BYPASS_CHARTER, BYPASS_RELEASE, WITNESS_RELEASE, 60, 4],
  ] as const)(
    "makes %s expose only its matching method plus both established priorities",
    (charterId, matching, forbidden, minutes, renown) => {
      const session = returnedForCharter(charterId);
      const choices = expectedJobChoices(matching);
      expect(session.view().jobChoices).toEqual(choices);
      expect(session.compactView().job_choices).toEqual(choices);
      expect(
        session
          .view()
          .jobs.find((candidate) => candidate.id === JOB)
          ?.authored_scene?.options.map((option) => option.id),
      ).toEqual(choices.map(([, optionId]) => optionId));
      expect(JSON.stringify(session.view().jobs)).not.toContain(forbidden);

      const ui = UiOverworldSession.restore(WORLD, session.snapshot());
      expect(ui.view().jobChoices).toEqual(choices);
      const api = createToolApi({ root: process.cwd() });
      const full = api.restore_overworld_session({ ...FULL, snapshot: session.snapshot() });
      const compact = api.restore_overworld_session({
        compact_context: true,
        snapshot: session.snapshot(),
      });
      expect(full.observation.jobChoices).toEqual(choices);
      expect(compact.context.job_choices).toEqual(choices);

      const before = session.snapshot();
      const renownBefore = Object.fromEntries(before.regionRenown)[REGION] ?? 0;
      const result = session.workLocalJob(JOB, matching);
      expect(result.minutes).toBe(minutes);
      expect(session.snapshot().minutes - before.minutes).toBe(minutes);
      expect(session.view().regionRenown[REGION]).toBe(renownBefore + renown);
      expect(() => session.workLocalJob(JOB, forbidden)).toThrow(
        /not available in this journey|completed with a different authored option/i,
      );
    },
  );

  it("reverses the best charter by fatigue through the existing 13-standing Civic cot", () => {
    const restedWitness = completedMatchingReturn({
      charterId: WITNESS_CHARTER,
      optionId: WITNESS_RELEASE,
      restBeforeWork: true,
    });
    const restedBypass = completedMatchingReturn({
      charterId: BYPASS_CHARTER,
      optionId: BYPASS_RELEASE,
      restBeforeWork: true,
    });
    const witnessLowElapsed =
      restedWitness.session.snapshot().minutes - restedWitness.minutesBeforeWork;
    const bypassLowElapsed =
      restedBypass.session.snapshot().minutes - restedBypass.minutesBeforeWork;
    // Both lines include the same 13-minute Works-to-Civic relocation.
    expect(witnessLowElapsed).toBe(45 + 13);
    expect(bypassLowElapsed).toBe(60 + 13);
    expect(bypassLowElapsed - witnessLowElapsed).toBe(15);
    expect(restedWitness.session.view().fatigue).toBe(0);
    expect(restedBypass.session.view().fatigue).toBe(0);

    const fatiguedWitness = completedMatchingReturn({
      charterId: WITNESS_CHARTER,
      optionId: WITNESS_RELEASE,
    });
    const fatiguedBypass = completedMatchingReturn({
      charterId: BYPASS_CHARTER,
      optionId: BYPASS_RELEASE,
    });
    expect(fatiguedWitness.session.view().regionRenown[REGION]).toBe(12);
    expect(fatiguedBypass.session.view().regionRenown[REGION]).toBe(13);
    expect(fatiguedWitness.session.view().serviceOffers.map((offer) => offer.id)).not.toContain(
      CIVIC_COT,
    );
    expect(fatiguedBypass.session.view().serviceOffers.map((offer) => offer.id)).toContain(
      CIVIC_COT,
    );
    expect(fatiguedWitness.session.restAtTown()).toMatchObject({
      changed: true,
      minutes: 180,
      fatigueAfter: 0,
    });
    expect(fatiguedBypass.session.restAtTown()).toMatchObject({
      changed: true,
      minutes: 15,
      fatigueAfter: 0,
    });
    const witnessHighElapsed =
      fatiguedWitness.session.snapshot().minutes - fatiguedWitness.minutesBeforeWork;
    const bypassHighElapsed =
      fatiguedBypass.session.snapshot().minutes - fatiguedBypass.minutesBeforeWork;
    expect(witnessHighElapsed).toBe(45 + 13 + 180);
    expect(bypassHighElapsed).toBe(60 + 13 + 15);
    expect(witnessHighElapsed - bypassHighElapsed).toBe(150);
  });

  it("round-trips exact event/job proof and rejects a relabel or reversed chronology", () => {
    const session = completedMatchingReturn({
      charterId: WITNESS_CHARTER,
      optionId: WITNESS_RELEASE,
    }).session;
    const snapshot = session.snapshot();
    expect(OverworldSession.restore(WORLD, snapshot).snapshot()).toEqual(snapshot);
    expect(
      snapshot.journalEntries.find((entry) => entry.id === `resolve:${EVENT}`)?.localSceneProof,
    ).toMatchObject({ sceneId: EVENT_SCENE, optionId: WITNESS_CHARTER });
    expect(
      snapshot.journalEntries.find((entry) => entry.id === `job:${JOB}`)?.localSceneProof,
    ).toMatchObject({ optionId: WITNESS_RELEASE });

    const relabeled = structuredClone(snapshot);
    const jobProof = relabeled.journalEntries.find(
      (entry) => entry.id === `job:${JOB}`,
    )?.localSceneProof;
    if (!jobProof) throw new Error("Expected Works job proof.");
    jobProof.optionId = BYPASS_RELEASE;
    expect(() => OverworldSession.restore(WORLD, relabeled)).toThrow(
      /accepted decision proof|requirements/i,
    );

    const reversed = structuredClone(snapshot);
    const jobIndex = reversed.journalEntries.findIndex((entry) => entry.id === `job:${JOB}`);
    const eventIndex = reversed.journalEntries.findIndex(
      (entry) => entry.id === `resolve:${EVENT}`,
    );
    const [eventEntry] = reversed.journalEntries.splice(eventIndex, 1);
    reversed.journalEntries.splice(jobIndex, 0, eventEntry!);
    expect(() => OverworldSession.restore(WORLD, reversed)).toThrow(
      /earlier event|requirements|newest-first/i,
    );
  });

  it("migrates the exact current-main predecessor neutrally and rejects divergent hashes", () => {
    expect(hashState(PREDECESSOR)).toBe(AUTHORED_ALBANY_WORKS_HAZARD_PREDECESSOR_WORLD_HASH);
    expect(hashState(WORLD)).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH);

    const unresolvedSource = atInvestigatedWorks(PREDECESSOR, false);
    const unresolved = OverworldSession.restore(WORLD, unresolvedSource.session.snapshot());
    expect(unresolved.snapshot().worldHash).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH);
    unresolved.investigateEvent(EVENT);
    expect(unresolved.view().eventChoices).toEqual([
      [EVENT, WITNESS_CHARTER],
      [EVENT, BYPASS_CHARTER],
    ]);

    const genericAfterWolf = completeWolf(atInvestigatedWorks(PREDECESSOR), PREDECESSOR);
    genericAfterWolf.resolveEvent(EVENT);
    const genericSnapshot = genericAfterWolf.snapshot();
    const migrated = OverworldSession.restore(WORLD, genericSnapshot);
    expect(
      migrated.snapshot().journalEntries.find((entry) => entry.id === `resolve:${EVENT}`)
        ?.localSceneProof,
    ).toMatchObject({
      sceneId: EVENT_SCENE,
      optionId: authoredLocalEventLegacyOptionId(
        AUTHORED_ALBANY_WORKS_HAZARD_PREDECESSOR_WORLD_HASH,
      ),
      sourceWorldHash: AUTHORED_ALBANY_WORKS_HAZARD_PREDECESSOR_WORLD_HASH,
    });
    expect(migrated.view().jobChoices).toEqual(expectedJobChoices());
    expect(JSON.stringify(migrated.snapshot())).not.toContain(WITNESS_RELEASE);
    expect(JSON.stringify(migrated.snapshot())).not.toContain(BYPASS_RELEASE);
    expect(OverworldSession.restore(WORLD, migrated.snapshot()).snapshot()).toEqual(
      migrated.snapshot(),
    );

    const nativeJob = completeWolf(atInvestigatedWorks(PREDECESSOR), PREDECESSOR);
    nativeJob.workLocalJob(JOB, PROTECT);
    const nativeProof = nativeJob
      .snapshot()
      .journalEntries.find((entry) => entry.id === `job:${JOB}`)?.localSceneProof;
    const restoredNative = OverworldSession.restore(WORLD, nativeJob.snapshot());
    expect(
      restoredNative.snapshot().journalEntries.find((entry) => entry.id === `job:${JOB}`)
        ?.localSceneProof,
    ).toEqual(nativeProof);

    const divergentWorld = structuredClone(PREDECESSOR);
    const divergentEvent = divergentWorld.local_events.find((candidate) => candidate.id === EVENT);
    if (!divergentEvent) throw new Error("Expected predecessor Works event.");
    divergentEvent.summary = `${divergentEvent.summary} Divergent copy.`;
    const divergent = structuredClone(genericSnapshot);
    divergent.worldHash = hashState(divergentWorld);
    expect(() => OverworldSession.restore(WORLD, divergent)).toThrow(/different world manifest/i);
  });

  it.each([
    [
      "pre-Greenway",
      exactAlbanyGreenwayDepthPredecessor(WORLD),
      AUTHORED_ALBANY_GREENWAY_PREDECESSOR_WORLD_HASH,
    ],
    [
      "pre-Market",
      exactAlbanyMarketDepthPredecessor(WORLD),
      AUTHORED_ALBANY_MARKET_PREDECESSOR_WORLD_HASH,
    ],
  ] as const)(
    "stacks a neutral Works marker through the %s migration epoch",
    (_label, source, hash) => {
      expect(hashState(source)).toBe(hash);
      const genericAfterWolf = completeWolf(atInvestigatedWorks(source), source);
      genericAfterWolf.resolveEvent(EVENT);

      const restored = OverworldSession.restore(WORLD, genericAfterWolf.snapshot());
      expect(
        restored.snapshot().journalEntries.find((entry) => entry.id === `resolve:${EVENT}`)
          ?.localSceneProof,
      ).toMatchObject({
        sceneId: EVENT_SCENE,
        optionId: authoredLocalEventLegacyOptionId(hash),
        sourceWorldHash: hash,
      });
      expect(restored.view().jobChoices).toEqual(expectedJobChoices());
      expect(JSON.stringify(restored.snapshot())).not.toContain(WITNESS_RELEASE);
      expect(JSON.stringify(restored.snapshot())).not.toContain(BYPASS_RELEASE);
    },
  );
});
