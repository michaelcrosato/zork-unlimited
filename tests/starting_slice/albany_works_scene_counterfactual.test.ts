/**
 * Depth Contract #11 increment: one Albany checklist job becomes a replay-safe,
 * authored local decision with exact UI/MCP choices and distinct clock/renown
 * consequences. This deliberately proves the reusable scene primitive without
 * claiming that the remaining Albany template jobs/events are converted yet.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { createToolApi } from "../../src/mcp/tools.js";
import { hashState } from "../../src/core/hash.js";
import type { OverworldManifest } from "../../src/world/overworld.js";
import { AUTHORED_ALBANY_WORKS_LEGACY_OPTION_ID } from "../../src/world/local_job_scene_legacy.js";
import { OverworldSession } from "../../src/world/session.js";
import type { OverworldSessionSnapshot } from "../../src/world/session_snapshot.js";
import {
  OVERWORLD_AUTHORED_LOCAL_JOB_PREDECESSOR_WORLD_HASH,
  OVERWORLD_AUTHORED_LOCAL_JOB_FIRST_SCENE_WORLD_HASH,
  OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH,
} from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import {
  exactAuthoredAlbanyWorksPredecessor,
  exactAuthoredAlbanyWorksFirstSceneWorld,
  exactF06World,
} from "../regression/fixtures/historical_overworlds.js";

const WORLD = loadOverworldManifest(process.cwd());
const JOB_ID = "albany_city__industrial__job";
const WORKS_AREA_ID = "albany_city__industrial";
const WORKS_POI_ID = "albany_city__industrial__poi";
const WORKS_CONTACT_ID = "albany_city__industrial__contact";
const PROTECT_SHIFT = "protect_trapped_public_shift";
const INVENTORY_STOCK = "inventory_outbound_cold_set_stock";
const FULL = { compact_context: false, compact_result: false } as const;
const PREDECESSOR_WORLD = exactAuthoredAlbanyWorksPredecessor(WORLD);
const FIRST_SCENE_WORLD = exactAuthoredAlbanyWorksFirstSceneWorld(WORLD);
const EARLIER_TRUSTED_WORLD = exactF06World(WORLD);

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
    const route = session.view().areaExits.find((edge) => edge.destination.id === areaId);
    if (!route) throw new Error(`The mapped route to ${areaId} is not visible.`);
    session.moveArea(route.id);
  }
}

function preparedForWolf(
  world: OverworldManifest = WORLD,
  preparationId = "albany:prep_works_fortification",
): { session: OverworldSession; wolf: { id: string; area: string } } {
  const session = new OverworldSession(world);
  const opening = session.view();
  session.scoutPoi(opening.pois[0]!.id);
  session.talkToCharacter(world.opening_registration!.contact);
  session.chooseJourneyStory("albany:ledger_advocate");
  session.chooseJourneyStory("albany:oath_full_compact_duty");
  session.chooseJourneyStory("albany:source_rowan_civic_docket");
  moveToArea(session, world.opening_preparation!.area, world);
  session.chooseJourneyStory(preparationId);
  if (session.view().departureInteractions[0]?.kind === "relief_allocation") {
    session.chooseJourneyStory("albany:relief_resident_shelter");
  }

  const wolf = session.view().quests.find((quest) => quest.id === "wolf_winter");
  if (!wolf) throw new Error("The registered Albany opening must reveal Wolf-Winter.");
  moveToArea(session, wolf.area, world);

  const leadView = session.view();
  session.scoutPoi(leadView.pois[0]!.id);
  session.talkToCharacter(leadView.characters[0]!.id);
  const leadSite = session.view().sites.find((site) => site.area === wolf.area);
  if (!leadSite) throw new Error("The Albany lead area must reveal its regional site.");
  session.exploreSite(leadSite.id);

  return { session, wolf };
}

function returnedToWorks(
  world: OverworldManifest = WORLD,
  preparationId = "albany:prep_works_fortification",
  expectWorksVisible = true,
): OverworldSession {
  const { session, wolf } = preparedForWolf(world, preparationId);

  session.startQuest(wolf.id, "albany:wolf_approach_sheltered_stockway");
  session.completeQuest(wolf.id, {
    endingId: "ending_held",
    endingTitle: "The Byre Held",
    death: false,
  });
  session.chooseJourney("continue");
  session.chooseJourneyStory("send_wardens_north");

  moveToArea(session, WORKS_AREA_ID, world);
  session.scoutPoi(WORKS_POI_ID);
  session.talkToCharacter(WORKS_CONTACT_ID);
  if (expectWorksVisible) expect(session.view().jobs.map((job) => job.id)).toContain(JOB_ID);
  return session;
}

function completedWorks(optionId: string): {
  session: OverworldSession;
  before: OverworldSessionSnapshot;
} {
  const session = returnedToWorks();
  const before = session.snapshot();
  session.workLocalJob(JOB_ID, optionId);
  return { session, before };
}

describe("Depth Contract #11 — authored Albany Works scene", () => {
  it("projects only exact legal choices and makes the two priorities mechanically distinct", () => {
    const protect = returnedToWorks();
    const inventory = returnedToWorks();
    const expectedChoices = [
      [JOB_ID, PROTECT_SHIFT],
      [JOB_ID, INVENTORY_STOCK],
    ];

    expect(protect.view().jobChoices).toEqual(expectedChoices);
    expect(protect.compactView().job_choices).toEqual(expectedChoices);
    const compactScene = protect
      .compactView()
      .job_scenes?.find(([candidateJobId]) => candidateJobId === JOB_ID);
    expect(compactScene?.slice(0, 2)).toEqual([JOB_ID, "albany:works-yard-winter-shift"]);
    expect(compactScene?.[2]).toContain("only one line");
    expect(compactScene?.slice(3, 6)).toEqual([WORKS_POI_ID, WORKS_CONTACT_ID, ["wolf_winter"]]);
    expect(() => protect.workLocalJob(JOB_ID)).toThrow(/Choose one authored option/i);
    expect(() => protect.workLocalJob(JOB_ID, "invented_priority")).toThrow(
      /Unknown local-job scene option/i,
    );

    const protectBefore = protect.snapshot();
    const inventoryBefore = inventory.snapshot();
    const protectRenownBefore = protect.view().regionRenown["Capital / Mohawk"] ?? 0;
    const inventoryRenownBefore = inventory.view().regionRenown["Capital / Mohawk"] ?? 0;
    const protectedShift = protect.workLocalJob(JOB_ID, PROTECT_SHIFT);
    const inventoriedStock = inventory.workLocalJob(JOB_ID, INVENTORY_STOCK);

    expect(protectedShift.minutes).toBe(80);
    expect(inventoriedStock.minutes).toBe(35);
    expect(protect.snapshot().minutes - protectBefore.minutes).toBe(80);
    expect(inventory.snapshot().minutes - inventoryBefore.minutes).toBe(35);
    expect(protect.view().regionRenown["Capital / Mohawk"]).toBe(protectRenownBefore + 5);
    expect(inventory.view().regionRenown["Capital / Mohawk"]).toBe(inventoryRenownBefore + 2);
    expect(protectedShift.entry.title).toContain("Protect the trapped public Works shift");
    expect(inventoriedStock.entry.title).toContain("Inventory and seal the outbound cold-set");
    expect(protectedShift.entry).not.toHaveProperty("localSceneProof");
    expect(protect.view().jobChoices).toEqual([]);
    expect(inventory.view().jobChoices).toEqual([]);
    expect(protect.workLocalJob(JOB_ID, PROTECT_SHIFT)).toMatchObject({
      alreadyKnown: true,
      minutes: 0,
    });
    expect(() => protect.workLocalJob(JOB_ID, INVENTORY_STOCK)).toThrow(
      /completed with a different authored option/i,
    );
  });

  it("keeps a real full-session authored choice legal beyond the compact twelve-job window", () => {
    const denseWorld = structuredClone(WORLD);
    const worksIndex = denseWorld.local_jobs.findIndex((job) => job.id === JOB_ID);
    const generic = denseWorld.local_jobs.find(
      (job) => job.home === "albany_city" && job.authored_scene === undefined,
    );
    const worksPoi = denseWorld.points_of_interest.find((poi) => poi.id === WORKS_POI_ID);
    if (worksIndex < 0 || !generic || !worksPoi) {
      throw new Error("Expected Works and generic Albany fixtures.");
    }
    const denseJobs = Array.from({ length: 12 }, (_, index) => ({
      ...structuredClone(generic),
      id: `albany_city__industrial__dense_job_${index}`,
      home: "albany_city",
      area: WORKS_AREA_ID,
      title: `Dense predecessor job ${index}`,
    }));
    denseWorld.local_jobs.splice(worksIndex, 0, ...denseJobs);
    const discoveryPois = Array.from({ length: 12 }, (_, index) => ({
      ...structuredClone(worksPoi),
      id: `albany_city__industrial__dense_poi_${index}`,
      title: `Dense discovery point ${index}`,
    }));
    denseWorld.points_of_interest.push(...discoveryPois);

    const session = returnedToWorks(denseWorld, "albany:prep_works_fortification", false);
    for (const poi of discoveryPois) {
      if (session.view().jobs.some((job) => job.id === JOB_ID)) break;
      if (session.journey().status === "awaiting_choice") session.chooseJourney("continue");
      session.scoutPoi(poi.id);
    }
    expect(session.view().jobs.findIndex((job) => job.id === JOB_ID)).toBeGreaterThanOrEqual(12);
    expect(session.view().jobChoices).toEqual([
      [JOB_ID, PROTECT_SHIFT],
      [JOB_ID, INVENTORY_STOCK],
    ]);
    expect(session.compactView().job_choices).toBeUndefined();

    const result = session.workLocalJob(JOB_ID, INVENTORY_STOCK);
    expect(result).toMatchObject({ alreadyKnown: false, minutes: 35 });
  });

  it("keeps post-return work invisible before Wolf-Winter, then reveals the already-discovered scene", () => {
    const { session, wolf } = preparedForWolf(WORLD, "albany:prep_drover_route");
    moveToArea(session, WORKS_AREA_ID);
    session.scoutPoi(WORKS_POI_ID);
    session.talkToCharacter(WORKS_CONTACT_ID);

    expect(session.snapshot().discoveredJobIds).toContain(JOB_ID);
    expect(session.view().jobs.map((job) => job.id)).not.toContain(JOB_ID);
    expect(session.view().rememberedJobs.map((job) => job.id)).not.toContain(JOB_ID);
    expect(session.view().jobChoices).not.toContainEqual([JOB_ID, PROTECT_SHIFT]);
    expect(() => session.workLocalJob(JOB_ID, PROTECT_SHIFT)).toThrow(
      /Complete quest "wolf_winter"/i,
    );

    moveToArea(session, wolf.area);
    session.startQuest(wolf.id, "albany:wolf_approach_sheltered_stockway");
    session.completeQuest(wolf.id, {
      endingId: "ending_held",
      endingTitle: "The Byre Held",
      death: false,
    });
    session.chooseJourney("continue");
    session.chooseJourneyStory("send_wardens_north");
    moveToArea(session, WORKS_AREA_ID);

    expect(session.view().jobs.map((job) => job.id)).toContain(JOB_ID);
    expect(session.view().jobChoices).toEqual([
      [JOB_ID, PROTECT_SHIFT],
      [JOB_ID, INVENTORY_STOCK],
    ]);
  });

  it("offers universally truthful Works copy after every mutually exclusive preparation", () => {
    for (const preparationId of [
      "albany:prep_works_fortification",
      "albany:prep_drover_route",
      "albany:prep_relief_protocol",
    ]) {
      const session = returnedToWorks(WORLD, preparationId);
      const works = session.view().jobs.find((job) => job.id === JOB_ID);
      expect(works?.authored_scene).toBeDefined();
      expect(JSON.stringify(works)).not.toMatch(/returned (cold-set|relief stock)/i);
      expect(session.view().jobChoices).toEqual([
        [JOB_ID, PROTECT_SHIFT],
        [JOB_ID, INVENTORY_STOCK],
      ]);
    }
  });

  it("round-trips the selected option and rejects missing or contradictory save proof", () => {
    const { session } = completedWorks(PROTECT_SHIFT);
    const snapshot = session.snapshot();
    const restored = OverworldSession.restore(WORLD, snapshot);
    expect(restored.snapshot()).toEqual(snapshot);

    const proofEntry = snapshot.journalEntries.find((entry) => entry.id === `job:${JOB_ID}`);
    expect(proofEntry?.localSceneProof).toMatchObject({
      sceneId: "albany:works-yard-winter-shift",
      optionId: PROTECT_SHIFT,
      boundary: {
        townId: "albany_city",
        areaId: WORKS_AREA_ID,
      },
    });

    const contradictory = structuredClone(snapshot);
    const contradictoryEntry = contradictory.journalEntries.find(
      (entry) => entry.id === `job:${JOB_ID}`,
    );
    if (!contradictoryEntry?.localSceneProof) throw new Error("Expected local-scene proof.");
    contradictoryEntry.localSceneProof.optionId = INVENTORY_STOCK;
    expect(() => OverworldSession.restore(WORLD, contradictory)).toThrow(
      /does not match its accepted decision proof/i,
    );

    const proofless = structuredClone(snapshot);
    const prooflessEntry = proofless.journalEntries.find((entry) => entry.id === `job:${JOB_ID}`);
    if (!prooflessEntry?.localSceneProof) throw new Error("Expected local-scene proof.");
    delete prooflessEntry.localSceneProof.boundary;
    expect(() => OverworldSession.restore(WORLD, proofless)).toThrow(
      /serialized local-scene proof requires its accepted-decision boundary/i,
    );
  });

  it("migrates unaffected and completed predecessor saves without inventing a new priority", () => {
    expect(hashState(PREDECESSOR_WORLD)).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_PREDECESSOR_WORLD_HASH);
    expect(hashState(WORLD)).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH);

    const unaffected = returnedToWorks(PREDECESSOR_WORLD).snapshot();
    expect(unaffected.worldHash).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_PREDECESSOR_WORLD_HASH);
    const migrated = OverworldSession.restore(WORLD, unaffected);
    expect(migrated.snapshot().worldHash).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH);
    expect(migrated.view().jobChoices).toEqual([
      [JOB_ID, PROTECT_SHIFT],
      [JOB_ID, INVENTORY_STOCK],
    ]);
    expect(OverworldSession.restore(WORLD, migrated.snapshot()).snapshot()).toEqual(
      migrated.snapshot(),
    );

    const opaqueLegacyChoice = returnedToWorks(PREDECESSOR_WORLD);
    opaqueLegacyChoice.workLocalJob(JOB_ID);
    const legacySnapshot = opaqueLegacyChoice.snapshot();
    const restoredLegacy = OverworldSession.restore(WORLD, legacySnapshot);
    const migratedLegacySnapshot = restoredLegacy.snapshot();
    expect(migratedLegacySnapshot.minutes).toBe(legacySnapshot.minutes);
    expect(migratedLegacySnapshot.regionRenown).toEqual(legacySnapshot.regionRenown);
    expect(migratedLegacySnapshot.completedJobIds).toContain(JOB_ID);
    expect(
      migratedLegacySnapshot.journalEntries.find((entry) => entry.id === `job:${JOB_ID}`)
        ?.localSceneProof,
    ).toMatchObject({
      sceneId: "albany:works-yard-winter-shift",
      optionId: AUTHORED_ALBANY_WORKS_LEGACY_OPTION_ID,
    });
    expect(restoredLegacy.view().jobChoices).toEqual([]);
    expect(() => restoredLegacy.workLocalJob(JOB_ID, PROTECT_SHIFT)).toThrow(
      /completed with a different authored option/i,
    );
    expect(OverworldSession.restore(WORLD, migratedLegacySnapshot).snapshot()).toEqual(
      migratedLegacySnapshot,
    );
  });

  it("accepts the first authored-Works manifest as a stacked no-op predecessor", () => {
    expect(hashState(FIRST_SCENE_WORLD)).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_FIRST_SCENE_WORLD_HASH);
    const firstSceneSession = returnedToWorks(FIRST_SCENE_WORLD);
    firstSceneSession.workLocalJob(JOB_ID, PROTECT_SHIFT);
    const firstSceneSnapshot = firstSceneSession.snapshot();

    const restored = OverworldSession.restore(WORLD, firstSceneSnapshot);
    const restoredSnapshot = restored.snapshot();
    expect(restoredSnapshot.worldHash).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH);
    expect(
      restoredSnapshot.journalEntries.find((entry) => entry.id === `job:${JOB_ID}`)
        ?.localSceneProof,
    ).toMatchObject({
      sceneId: "albany:works-yard-winter-shift",
      optionId: PROTECT_SHIFT,
    });
    expect(restoredSnapshot.minutes).toBe(firstSceneSnapshot.minutes);
    expect(restoredSnapshot.regionRenown).toEqual(firstSceneSnapshot.regionRenown);
    expect(OverworldSession.restore(WORLD, restoredSnapshot).snapshot()).toEqual(restoredSnapshot);
  });

  it("preserves a generic Works completion made before registration existed in the journey trail", () => {
    for (const legacyWorld of [PREDECESSOR_WORLD, EARLIER_TRUSTED_WORLD]) {
      const legacy = new OverworldSession(legacyWorld);
      legacy.scoutPoi(legacy.view().pois[0]!.id);
      moveToArea(legacy, "albany_city__market", legacyWorld);
      legacy.scoutPoi(legacy.view().pois[0]!.id);
      legacy.talkToCharacter(legacy.view().characters[0]!.id);
      moveToArea(legacy, WORKS_AREA_ID, legacyWorld);
      legacy.scoutPoi(WORKS_POI_ID);
      legacy.talkToCharacter(WORKS_CONTACT_ID);
      legacy.workLocalJob(JOB_ID);

      const legacyHiddenJobCount = legacy.view().hiddenJobCount;
      const predecessorSnapshot = legacy.snapshot();
      expect(predecessorSnapshot.openingLeadSourceDecisionTrail).toBeUndefined();
      const migrated = OverworldSession.restore(WORLD, predecessorSnapshot);
      const migratedSnapshot = migrated.snapshot();
      const proof = migratedSnapshot.journalEntries.find(
        (entry) => entry.id === `job:${JOB_ID}`,
      )?.localSceneProof;
      expect(proof).toMatchObject({
        sceneId: "albany:works-yard-winter-shift",
        optionId: AUTHORED_ALBANY_WORKS_LEGACY_OPTION_ID,
        sourceWorldHash: OVERWORLD_AUTHORED_LOCAL_JOB_PREDECESSOR_WORLD_HASH,
      });
      expect(proof).not.toHaveProperty("boundary");
      expect(migratedSnapshot.minutes).toBe(predecessorSnapshot.minutes);
      expect(migratedSnapshot.regionRenown).toEqual(predecessorSnapshot.regionRenown);
      // The current world also contains the unavailable Winter Return Docket,
      // Campus Archive Query, and Cade Return Packet. Their truthful hidden
      // count is independent of preserving this Works completion.
      expect(migrated.view().hiddenJobCount).toBe(legacyHiddenJobCount + 3);
      expect(OverworldSession.restore(WORLD, migratedSnapshot).snapshot()).toEqual(
        migratedSnapshot,
      );
    }
  });

  it("exposes the exact option through MCP and wires the human UI to the same action", () => {
    const source = returnedToWorks();
    const renownBefore = source.view().regionRenown["Capital / Mohawk"] ?? 0;
    const api = createToolApi({ root: process.cwd() });
    const restored = api.restore_overworld_session({
      compact_context: true,
      snapshot: source.snapshot(),
    });

    expect(restored.context.job_choices).toEqual([
      [JOB_ID, PROTECT_SHIFT],
      [JOB_ID, INVENTORY_STOCK],
    ]);
    expect(restored.context.job_scenes?.[0]?.[0]).toBe(JOB_ID);
    expect(() =>
      api.work_overworld_session_job({
        ...FULL,
        session_id: restored.session_id,
        job_id: JOB_ID,
      }),
    ).toThrow(/Choose one authored option/i);

    const worked = api.work_overworld_session_job({
      ...FULL,
      session_id: restored.session_id,
      job_id: JOB_ID,
      option_id: INVENTORY_STOCK,
    });
    expect(worked.result.minutes).toBe(35);
    expect(worked.observation.completedJobIds).toContain(JOB_ID);
    expect(worked.observation.regionRenown["Capital / Mohawk"]).toBe(renownBefore + 2);

    const appSource = readFileSync("ui/src/App.tsx", "utf8");
    expect(appSource).toContain("scene.options.map((option)");
    expect(appSource).toContain("option.terms.minutes");
    expect(appSource).toContain("option.terms.renown");
    expect(appSource).toContain("worldSession.workLocalJob(job.id, option.id)");
  });
});
