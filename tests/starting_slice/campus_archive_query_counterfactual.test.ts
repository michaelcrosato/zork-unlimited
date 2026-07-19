import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import { createToolApi } from "../../src/mcp/tools.js";
import { campaignServiceLocalJobOptionKey } from "../../src/world/campaign_service_rules.js";
import { assertOverworldIntegrity, type OverworldManifest } from "../../src/world/overworld.js";
import { OverworldSession } from "../../src/world/session.js";
import { timeLabel } from "../../src/world/session_journal_codec.js";
import { cloneOverworldSessionSnapshot } from "../../src/world/session_snapshot.js";
import { OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH } from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { OverworldSession as UiOverworldSession } from "../../ui/src/overworld.js";
import {
  exactCampusArchiveQueryPredecessor,
  exactWinterReturnDocketPredecessor,
} from "../regression/fixtures/historical_overworlds.js";

const WORLD = loadOverworldManifest(process.cwd());
const JOB = "albany_city__campus__job";
const AREA = "albany_city__campus";
const WARNING = "issue_calibrated_road_warning";
const ARCHIVE = "prepare_traceable_field_archive";
const WARNING_SERVICE = "albany:campus_calibrated_warning_rest";
const WARNING_DROVER_SERVICE = "albany:campus_calibrated_warning_drover_rest";
const ARCHIVE_SERVICE = "albany:campus_traceable_archive_resupply";
const ARCHIVE_MOBILE_SERVICE = "albany:campus_traceable_archive_mobile_resupply";
const TANNERS_RECOVERED_FACT = "fact:tanners_fever_formula_corrected";
const TANNERS_EXPELLED_FACT = "fact:tanners_fever_corridor_closed";
const FULL = { compact_context: false, compact_result: false } as const;

function authorTannersCampaignExports(world: OverworldManifest): void {
  const tanners = world.quests.find((quest) => quest.id === "tanners_fever");
  if (!tanners) throw new Error("Expected The Tanner's Fever quest.");
  tanners.campaign_exports = [
    {
      ending_id: "ending_recovered",
      ending_title: "The Meadowsweet",
      effects: [{ type: "set_world_fact", fact_id: TANNERS_RECOVERED_FACT }],
    },
    {
      ending_id: "ending_expelled",
      ending_title: "The Corridor",
      effects: [{ type: "set_world_fact", fact_id: TANNERS_EXPELLED_FACT }],
    },
  ];
}

function retainOnlyOpeningOathServiceConsumers(world: OverworldManifest): void {
  const oathId = world.opening_relief_oath?.id;
  if (!oathId) throw new Error("Expected the Albany relief oath.");
  // Keep integrity-required oath consumers while excluding service locations
  // unrelated to these synthetic transitive-dependency proofs.
  world.campaign_service_rules = (world.campaign_service_rules ?? []).filter((rule) =>
    rule.requires_all_story_choices?.some((choice) => choice.story_choice_id === oathId),
  );
}

function moveToArea(session: OverworldSession, target: string, world = WORLD): void {
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

function returnedToCampus(
  world = WORLD,
  options: {
    preparationId?: string;
    reliefAllocationId?: string;
    endingId?: string;
    endingTitle?: string;
  } = {},
): OverworldSession {
  const session = new OverworldSession(world);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(world.opening_registration!.contact);
  session.chooseJourneyStory("albany:ledger_advocate");
  session.chooseJourneyStory("albany:oath_full_compact_duty");
  session.chooseJourneyStory("albany:source_rowan_civic_docket");
  session.chooseJourneyStory(options.preparationId ?? "albany:prep_works_fortification");
  const wolf = session.view().quests.find((quest) => quest.id === "wolf_winter");
  if (!wolf) throw new Error("Wolf-Winter must be exposed.");
  moveToArea(session, wolf.area, world);
  if (session.journey().storyChoice?.kind === "relief_allocation") {
    session.chooseJourneyStory(options.reliefAllocationId ?? "albany:relief_cade_fodder");
  }
  session.scoutPoi("albany_city__transport_hub__poi");
  session.talkToCharacter("albany_city__transport_hub__contact");
  session.startQuest(wolf.id, "albany:wolf_approach_sheltered_stockway");
  session.completeQuest(wolf.id, {
    endingId: options.endingId ?? "ending_held",
    endingTitle: options.endingTitle ?? "The Byre Held",
    death: false,
  });
  session.chooseJourney("continue");
  session.chooseJourneyStory("send_wardens_north");
  moveToArea(session, AREA, world);
  session.scoutPoi("albany_city__campus__poi");
  session.talkToCharacter("albany_city__campus__contact");
  return session;
}

describe("Albany Campus Archive Query", () => {
  it("requires a completed Wolf-Winter and projects exactly two post-return operational records", () => {
    const job = WORLD.local_jobs.find((candidate) => candidate.id === JOB);
    expect(job?.authored_scene?.requires_completed_quests).toEqual(["wolf_winter"]);
    const session = returnedToCampus();
    expect(session.view().jobChoices).toEqual([
      [JOB, WARNING],
      [JOB, ARCHIVE],
    ]);
    expect(session.compactView().job_choices).toEqual([
      [JOB, WARNING],
      [JOB, ARCHIVE],
    ]);
    expect(() => session.workLocalJob(JOB)).toThrow(/Choose one authored option/i);
    expect(() => session.workLocalJob(JOB, "archive")).toThrow(/Unknown local-job scene option/i);
  });

  it("makes warning and archive non-dominant, exclusive Campus services across full, compact, UI, and MCP views", () => {
    const warning = returnedToCampus();
    const archive = returnedToCampus();
    const warningBefore = warning.snapshot().minutes;
    const archiveBefore = archive.snapshot().minutes;
    warning.workLocalJob(JOB, WARNING);
    archive.workLocalJob(JOB, ARCHIVE);
    expect(warning.snapshot().minutes - warningBefore).toBe(35);
    expect(archive.snapshot().minutes - archiveBefore).toBe(75);
    expect(warning.view().serviceOffers.map((offer) => offer.id)).toContain(WARNING_SERVICE);
    expect(warning.view().serviceOffers.map((offer) => offer.id)).not.toContain(ARCHIVE_SERVICE);
    expect(archive.view().serviceOffers.map((offer) => offer.id)).toContain(ARCHIVE_SERVICE);
    expect(archive.view().serviceOffers.map((offer) => offer.id)).not.toContain(WARNING_SERVICE);
    expect(warning.compactView().service_offers).toContainEqual([
      WARNING_SERVICE,
      "rest",
      "Take Blair's Dispatch-Room Recovery Cot",
      expect.any(String),
      15,
    ]);
    expect(archive.compactView().service_offers).toContainEqual([
      ARCHIVE_SERVICE,
      "resupply",
      "Claim Blair's Traceable Field Cache",
      expect.any(String),
      15,
    ]);
    expect(UiOverworldSession.restore(WORLD, archive.snapshot()).view().serviceOffers).toEqual(
      archive.view().serviceOffers,
    );
    const api = createToolApi({ root: process.cwd() });
    expect(
      api.restore_overworld_session({ ...FULL, snapshot: warning.snapshot() }).observation
        .serviceOffers,
    ).toEqual(warning.view().serviceOffers);
  });

  it.each([
    {
      label: "held drover warning",
      optionId: WARNING,
      expectedServiceId: WARNING_DROVER_SERVICE,
      action: "rest" as const,
      preparationId: "albany:prep_drover_route",
      reliefAllocationId: "albany:relief_cade_fodder",
      endingId: "ending_held",
      endingTitle: "The Byre Held",
      suppressedServiceId: "albany:wolf_drover_route_return_rest",
    },
    {
      label: "evacuated drover warning",
      optionId: WARNING,
      expectedServiceId: WARNING_DROVER_SERVICE,
      action: "rest" as const,
      preparationId: "albany:prep_drover_route",
      reliefAllocationId: "albany:relief_cade_fodder",
      endingId: "ending_drive_person_cattle_lost",
      endingTitle: "The People Out, Cattle Lost",
      suppressedServiceId: "albany:wolf_drover_route_return_rest",
    },
    {
      label: "held mobile archive",
      optionId: ARCHIVE,
      expectedServiceId: ARCHIVE_MOBILE_SERVICE,
      action: "resupply" as const,
      preparationId: "albany:prep_works_fortification",
      reliefAllocationId: "albany:relief_mobile_reserve",
      endingId: "ending_held",
      endingTitle: "The Byre Held",
      suppressedServiceId: "albany:mobile_reserve_return_resupply",
    },
    {
      label: "evacuated mobile archive",
      optionId: ARCHIVE,
      expectedServiceId: ARCHIVE_MOBILE_SERVICE,
      action: "resupply" as const,
      preparationId: "albany:prep_works_fortification",
      reliefAllocationId: "albany:relief_mobile_reserve",
      endingId: "ending_drive_person_cattle_lost",
      endingTitle: "The People Out, Cattle Lost",
      suppressedServiceId: "albany:mobile_reserve_return_resupply",
    },
  ])(
    "keeps the promised service available without a same-action collision for $label",
    ({
      optionId,
      expectedServiceId,
      action,
      preparationId,
      reliefAllocationId,
      endingId,
      endingTitle,
      suppressedServiceId,
    }) => {
      const session = returnedToCampus(WORLD, {
        preparationId,
        reliefAllocationId,
        endingId,
        endingTitle,
      });
      session.workLocalJob(JOB, optionId);
      const offersForAction = session
        .view()
        .serviceOffers.filter((offer) => offer.action === action);
      expect(offersForAction).toHaveLength(1);
      expect(offersForAction[0]?.id).toBe(expectedServiceId);
      expect(session.view().serviceOffers.map((offer) => offer.id)).not.toContain(
        suppressedServiceId,
      );
    },
  );

  it("consumes the selected 15-minute service once and rejects missing, altered, or backdated proof", () => {
    const warning = returnedToCampus();
    warning.workLocalJob(JOB, WARNING);
    expect(warning.view().fatigue).toBeGreaterThan(0);
    expect(warning.restAtTown()).toMatchObject({ changed: true, minutes: 15, fatigueAfter: 0 });
    const consumed = warning.snapshot();
    expect(
      OverworldSession.restore(WORLD, consumed)
        .view()
        .serviceOffers.map((offer) => offer.id),
    ).not.toContain(WARNING_SERVICE);

    const altered = structuredClone(consumed);
    const job = altered.journalEntries.find((entry) => entry.id === `job:${JOB}`);
    if (!job?.localSceneProof) throw new Error("Expected Campus proof.");
    job.localSceneProof.optionId = ARCHIVE;
    expect(() => OverworldSession.restore(WORLD, altered)).toThrow(/accepted decision proof/i);

    const absent = structuredClone(consumed);
    const absentJob = absent.journalEntries.find((entry) => entry.id === `job:${JOB}`);
    if (!absentJob) throw new Error("Expected Campus job.");
    delete absentJob.localSceneProof;
    expect(() => OverworldSession.restore(WORLD, absent)).toThrow(
      /missing its exact local-scene proof/i,
    );

    const backdated = structuredClone(consumed);
    const service = backdated.journalEntries.find(
      (entry) => entry.serviceRuleId === WARNING_SERVICE,
    );
    const proof = backdated.journalEntries.find(
      (entry) => entry.id === `job:${JOB}`,
    )?.localSceneProof;
    if (!service?.serviceBoundary || !proof?.boundary)
      throw new Error("Expected replay boundaries.");
    const beforeJob = proof.boundary.minutes - 1;
    service.recordedAt = timeLabel(beforeJob);
    service.serviceBoundary.minutes = beforeJob;
    expect(() => OverworldSession.restore(WORLD, backdated)).toThrow(/newest-first|boundary|time/i);
  });

  it("consumes archive resupply once across restore and preserves cloned full/compact journal parity", () => {
    const archive = returnedToCampus();
    const worked = archive.workLocalJob(JOB, ARCHIVE);
    expect(worked.entry.title).toContain("Prepare a Traceable Field Archive");
    const clonedBeforeService = cloneOverworldSessionSnapshot(archive.snapshot());
    const fullJob = archive.view().journal.find((entry) => entry.title === worked.entry.title);
    const compactJob = archive
      .compactView()
      .journal?.find(([, title]) => title === worked.entry.title);
    expect(fullJob).toMatchObject({ kind: "job", recordedAt: worked.entry.recordedAt });
    expect(compactJob).toEqual(["job", worked.entry.title, worked.entry.recordedAt]);
    expect(OverworldSession.restore(WORLD, clonedBeforeService).snapshot()).toEqual(
      clonedBeforeService,
    );
    const api = createToolApi({ root: process.cwd() });
    const fullMcp = api.restore_overworld_session({ ...FULL, snapshot: clonedBeforeService });
    const compactMcp = api.restore_overworld_session({
      compact_context: true,
      snapshot: clonedBeforeService,
    });
    expect(fullMcp.observation.journal).toContainEqual(
      expect.objectContaining({ kind: "job", title: worked.entry.title }),
    );
    expect(compactMcp.context.journal).toContainEqual([
      "job",
      worked.entry.title,
      worked.entry.recordedAt,
    ]);

    expect(archive.resupplyAtTown()).toMatchObject({
      changed: true,
      minutes: 15,
      suppliesAfter: 8,
    });
    const consumed = archive.snapshot();
    const restored = OverworldSession.restore(WORLD, consumed);
    expect(restored.view().serviceOffers.map((offer) => offer.id)).not.toContain(ARCHIVE_SERVICE);
    expect(restored.resupplyAtTown()).toMatchObject({ changed: false, minutes: 0 });
    expect(UiOverworldSession.restore(WORLD, consumed).snapshot()).toEqual(consumed);
  });

  it("migrates the exact generic predecessor without inventing a Campus option or service", () => {
    const predecessor = exactCampusArchiveQueryPredecessor(WORLD);
    expect(hashState(predecessor)).toBe(
      "db23dea42bb2cd62beb8ac5871e4b5c74ee127c05b36941b4e170247ab8a5858",
    );
    expect(hashState(WORLD)).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH);
    const legacy = returnedToCampus(predecessor);
    legacy.workLocalJob(JOB);
    const restored = OverworldSession.restore(WORLD, legacy.snapshot());
    expect(restored.view().serviceOffers.map((offer) => offer.id)).not.toContain(WARNING_SERVICE);
    expect(restored.view().serviceOffers.map((offer) => offer.id)).not.toContain(ARCHIVE_SERVICE);
    expect(
      restored.snapshot().journalEntries.find((entry) => entry.id === `job:${JOB}`)
        ?.localSceneProof,
    ).toMatchObject({
      sceneId: "albany:campus-wolf-archive-query",
      sourceWorldHash: hashState(predecessor),
    });
    expect(
      restored
        .snapshot()
        .journalEntries.find((entry) => entry.id.startsWith("talk:albany_city__campus__contact"))
        ?.text,
    ).toContain("one honest operational record");
  });

  it("updates Blair's contact copy for an older trusted predecessor that never took Campus work", () => {
    const older = exactWinterReturnDocketPredecessor(WORLD);
    expect(hashState(older)).toBe(
      "815a138cbeeafbc9595c04e37260ccaba9d2d52d6a3341b3c38afe9eade62636",
    );
    const legacy = returnedToCampus(older);
    expect(legacy.snapshot().completedJobIds).not.toContain(JOB);

    const migrated = OverworldSession.restore(WORLD, legacy.snapshot());
    const migratedSnapshot = migrated.snapshot();
    expect(migratedSnapshot.worldHash).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH);
    expect(migratedSnapshot.completedJobIds).not.toContain(JOB);
    expect(
      migratedSnapshot.journalEntries.find((entry) =>
        entry.id.startsWith("talk:albany_city__campus__contact"),
      )?.text,
    ).toContain("one honest operational record");
    expect(migrated.view().serviceOffers.map((offer) => offer.id)).not.toContain(WARNING_SERVICE);
    expect(migrated.view().serviceOffers.map((offer) => offer.id)).not.toContain(ARCHIVE_SERVICE);
    expect(OverworldSession.restore(WORLD, migratedSnapshot).snapshot()).toEqual(migratedSnapshot);
  });

  it("does not relabel a non-immediate generic Campus completion as an authored option", () => {
    const older = exactWinterReturnDocketPredecessor(WORLD);
    expect(hashState(older)).not.toBe(
      "db23dea42bb2cd62beb8ac5871e4b5c74ee127c05b36941b4e170247ab8a5858",
    );
    const legacy = returnedToCampus(older);
    legacy.workLocalJob(JOB);
    expect(() => OverworldSession.restore(WORLD, legacy.snapshot())).toThrow(
      /authored job .* missing its exact local-scene proof/i,
    );
  });

  it("rejects service rules that name generic jobs or an unknown authored option", () => {
    for (const [jobId, optionId] of [
      ["albany_city__market__job", WARNING],
      [JOB, "invented"],
    ] as const) {
      const invalid: OverworldManifest = structuredClone(WORLD);
      invalid.campaign_service_rules?.push({
        id: `test:invalid_${optionId}`,
        home: "albany_city",
        area: AREA,
        action: "rest",
        title: "Invalid",
        summary: "Invalid",
        minutes: 15,
        requires_all_local_job_options: [{ job_id: jobId, option_id: optionId }],
      });
      expect(() => assertOverworldIntegrity(invalid)).toThrow(/local job|local-job option/i);
    }
  });

  it("rejects a latent Campus same-action collision across local-option integrity states", () => {
    const colliding: OverworldManifest = structuredClone(WORLD);
    const warning = colliding.campaign_service_rules?.find((rule) => rule.id === WARNING_SERVICE);
    if (!warning) throw new Error("Expected the base Campus warning service.");
    delete warning.forbids_any_story_choices;
    expect(() => assertOverworldIntegrity(colliding)).toThrow(
      /both resolve for action "rest" at "albany_city__campus"/i,
    );
  });

  it("rejects the same collision when Campus requires a non-target quest", () => {
    const colliding: OverworldManifest = structuredClone(WORLD);
    const campus = colliding.local_jobs.find((job) => job.id === JOB)?.authored_scene;
    const warning = colliding.campaign_service_rules?.find((rule) => rule.id === WARNING_SERVICE);
    if (!campus || !warning) throw new Error("Expected Campus job and warning service.");
    campus.requires_completed_quests = ["tanners_fever"];
    delete warning.forbids_any_story_choices;

    expect(() => assertOverworldIntegrity(colliding)).toThrow(
      /both resolve for action "rest" at "albany_city__campus"/i,
    );
  });

  it("rejects a collision gated by a non-target quest's exported fact", () => {
    const colliding: OverworldManifest = structuredClone(WORLD);
    authorTannersCampaignExports(colliding);
    const campus = colliding.local_jobs.find((job) => job.id === JOB)?.authored_scene;
    const warningOption = campus?.options.find((option) => option.id === WARNING);
    const warning = colliding.campaign_service_rules?.find((rule) => rule.id === WARNING_SERVICE);
    if (!warningOption || !warning) throw new Error("Expected Campus warning authoring.");
    warningOption.requires_all_world_facts = [TANNERS_RECOVERED_FACT];
    delete warning.forbids_any_story_choices;

    expect(() => assertOverworldIntegrity(colliding)).toThrow(
      /both resolve for action "rest" at "albany_city__campus"/i,
    );
  });

  it("keeps a no-export completion branch for a partially exported non-target quest", () => {
    const colliding: OverworldManifest = structuredClone(WORLD);
    const tanners = colliding.quests.find((quest) => quest.id === "tanners_fever");
    const campus = colliding.local_jobs.find((job) => job.id === JOB)?.authored_scene;
    const warningOption = campus?.options.find((option) => option.id === WARNING);
    const warning = colliding.campaign_service_rules?.find((rule) => rule.id === WARNING_SERVICE);
    if (!tanners || !campus || !warningOption || !warning) {
      throw new Error("Expected Tanners and Campus warning authoring.");
    }
    tanners.campaign_exports = [
      {
        ending_id: "ending_recovered",
        ending_title: "The Meadowsweet",
        effects: [{ type: "set_world_fact", fact_id: TANNERS_RECOVERED_FACT }],
      },
    ];
    campus.requires_completed_quests = ["tanners_fever"];
    warningOption.forbids_any_world_facts = [TANNERS_RECOVERED_FACT];
    delete warning.forbids_any_story_choices;

    expect(() => assertOverworldIntegrity(colliding)).toThrow(
      /both resolve for action "rest" at "albany_city__campus"/i,
    );
  });

  it("never combines mutually exclusive exports from one non-target quest", () => {
    const exclusive: OverworldManifest = structuredClone(WORLD);
    authorTannersCampaignExports(exclusive);
    const occupiedLocations = new Set(
      (exclusive.campaign_service_rules ?? []).map((rule) => `${rule.home}\u0000${rule.area}`),
    );
    const location = exclusive.areas.find(
      (area) => !occupiedLocations.has(`${area.home}\u0000${area.id}`),
    );
    if (!location) throw new Error("Expected an unused service location.");
    exclusive.campaign_service_rules?.push(
      {
        id: "test:tanners_recovered_rest",
        home: location.home,
        area: location.id,
        action: "rest",
        title: "Recovered formula rest",
        summary: "This service follows only the corrected formula outcome.",
        minutes: 15,
        requires_all_world_facts: [TANNERS_RECOVERED_FACT],
      },
      {
        id: "test:tanners_expelled_rest",
        home: location.home,
        area: location.id,
        action: "rest",
        title: "Closed corridor rest",
        summary: "This service follows only the closed corridor outcome.",
        minutes: 15,
        requires_all_world_facts: [TANNERS_EXPELLED_FACT],
      },
    );

    expect(() => assertOverworldIntegrity(exclusive)).not.toThrow();
  });

  it("closes transitive companion dependencies across relevant quest exports", () => {
    const chained: OverworldManifest = structuredClone(WORLD);
    retainOnlyOpeningOathServiceConsumers(chained);
    const tanners = chained.quests.find((quest) => quest.id === "tanners_fever");
    const coldForge = chained.quests.find((quest) => quest.id === "cold_forge");
    if (!tanners || !coldForge) throw new Error("Expected Tanners and Cold Forge quests.");
    tanners.campaign_exports = [
      {
        ending_id: "ending_recovered",
        ending_title: "The Meadowsweet",
        effects: [{ type: "add_companion", npc_id: "test:gate" }],
      },
    ];
    coldForge.campaign_exports = [
      {
        ending_id: "ending_victory",
        ending_title: "Keeper of the Ember",
        effects: [],
        conditional_effects: [
          {
            id: "test:cold_forge_gate_adds_june",
            when: { requires_all_companions: ["test:gate"] },
            effects: [{ type: "add_companion", npc_id: "albany:june_pike" }],
          },
        ],
      },
    ];
    const occupiedLocations = new Set(
      (chained.campaign_service_rules ?? []).map((rule) => `${rule.home}\u0000${rule.area}`),
    );
    const location = chained.areas.find(
      (area) => !occupiedLocations.has(`${area.home}\u0000${area.id}`),
    );
    if (!location) throw new Error("Expected an unused service location.");
    chained.campaign_service_rules?.push(
      {
        id: "test:transitive_june_rest",
        home: location.home,
        area: location.id,
        action: "rest",
        title: "June's transitive rest",
        summary: "This service requires the companion produced through both quest exports.",
        minutes: 15,
        requires_all_companions: ["albany:june_pike"],
      },
      {
        id: "test:transitive_solo_rest",
        home: location.home,
        area: location.id,
        action: "rest",
        title: "Solo transitive rest",
        summary: "This service remains available on the solo opening branch.",
        minutes: 15,
        requires_all_story_choices: [
          {
            story_choice_id: "albany:wolf_ally_commitment",
            choice_id: "albany:ally_travel_solo",
          },
        ],
      },
    );

    expect(() => assertOverworldIntegrity(chained)).toThrow(
      new RegExp(`both resolve for action "rest" at "${location.id}"`, "i"),
    );
  });

  it("closes transitive promise dependencies across relevant quest exports", () => {
    const chained: OverworldManifest = structuredClone(WORLD);
    retainOnlyOpeningOathServiceConsumers(chained);
    const tanners = chained.quests.find((quest) => quest.id === "tanners_fever");
    const coldForge = chained.quests.find((quest) => quest.id === "cold_forge");
    if (!tanners || !coldForge) throw new Error("Expected Tanners and Cold Forge quests.");
    const promiseId = "albany:promise_wolf_full_compact_duty";
    tanners.campaign_exports = [
      {
        ending_id: "ending_recovered",
        ending_title: "The Meadowsweet",
        effects: [],
        conditional_effects: [
          {
            id: "test:tanners_keeps_full_oath",
            when: {
              requires_all_promises: [{ promise_id: promiseId, status: "active" }],
            },
            effects: [{ type: "resolve_promise", promise_id: promiseId, status: "kept" }],
          },
        ],
      },
    ];
    coldForge.campaign_exports = [
      {
        ending_id: "ending_victory",
        ending_title: "Keeper of the Ember",
        effects: [],
        conditional_effects: [
          {
            id: "test:cold_forge_kept_oath_adds_june",
            when: {
              requires_all_promises: [{ promise_id: promiseId, status: "kept" }],
            },
            effects: [{ type: "add_companion", npc_id: "albany:june_pike" }],
          },
        ],
      },
    ];
    const occupiedLocations = new Set(
      (chained.campaign_service_rules ?? []).map((rule) => `${rule.home}\u0000${rule.area}`),
    );
    const location = chained.areas.find(
      (area) => !occupiedLocations.has(`${area.home}\u0000${area.id}`),
    );
    if (!location) throw new Error("Expected an unused service location.");
    chained.campaign_service_rules?.push(
      {
        id: "test:promise_chain_june_rest",
        home: location.home,
        area: location.id,
        action: "rest",
        title: "Promise-chain June rest",
        summary: "This service requires June after the kept-promise export chain.",
        minutes: 15,
        requires_all_companions: ["albany:june_pike"],
      },
      {
        id: "test:promise_chain_solo_rest",
        home: location.home,
        area: location.id,
        action: "rest",
        title: "Promise-chain solo rest",
        summary: "This service marks the full-oath solo opening branch.",
        minutes: 15,
        requires_all_story_choices: [
          {
            story_choice_id: "albany:wolf_relief_oath",
            choice_id: "albany:oath_full_compact_duty",
          },
          {
            story_choice_id: "albany:wolf_ally_commitment",
            choice_id: "albany:ally_travel_solo",
          },
        ],
      },
    );

    expect(() => assertOverworldIntegrity(chained)).toThrow(
      new RegExp(`both resolve for action "rest" at "${location.id}"`, "i"),
    );
  });

  it("accepts held Civic and evacuated Campus capabilities that cannot coexist", () => {
    const reachable: OverworldManifest = structuredClone(WORLD);
    const campus = reachable.local_jobs.find((job) => job.id === JOB)?.authored_scene;
    const evacuatedArchive = campus?.options.find((option) => option.id === ARCHIVE);
    if (!evacuatedArchive) throw new Error("Expected the Campus archive option.");
    evacuatedArchive.requires_all_world_facts = ["fact:wolf_winter_steading_evacuated"];
    evacuatedArchive.forbids_any_world_facts = ["fact:wolf_winter_byre_held"];
    const occupiedLocations = new Set(
      (reachable.campaign_service_rules ?? []).map((rule) => `${rule.home}\u0000${rule.area}`),
    );
    const location = reachable.areas.find(
      (area) => !occupiedLocations.has(`${area.home}\u0000${area.id}`),
    );
    if (!location) throw new Error("Expected an unused service location.");
    reachable.campaign_service_rules?.push(
      {
        id: "test:held_civic_rest",
        home: location.home,
        area: location.id,
        action: "rest",
        title: "Held Civic proof",
        summary: "Only the held Civic return can resolve this proof.",
        minutes: 15,
        requires_all_local_job_options: [
          {
            job_id: "albany_city__civic_core__job",
            option_id: "file_public_held_return",
          },
        ],
      },
      {
        id: "test:evacuated_campus_rest",
        home: location.home,
        area: location.id,
        action: "rest",
        title: "Evacuated Campus proof",
        summary: "Only the evacuated Campus archive can resolve this proof.",
        minutes: 15,
        requires_all_local_job_options: [{ job_id: JOB, option_id: ARCHIVE }],
      },
    );

    expect(() => assertOverworldIntegrity(reachable)).not.toThrow();
  });

  it("treats a pre-quest Civic event decision as reachable after Wolf-Winter", () => {
    const chronological: OverworldManifest = structuredClone(WORLD);
    const occupiedLocations = new Set(
      (chronological.campaign_service_rules ?? []).map((rule) => `${rule.home}\u0000${rule.area}`),
    );
    const location = chronological.areas.find(
      (area) => !occupiedLocations.has(`${area.home}\u0000${area.id}`),
    );
    if (!location) throw new Error("Expected an unused service location.");
    chronological.campaign_service_rules?.push(
      {
        id: "test:civic_public_held_rest",
        home: location.home,
        area: location.id,
        action: "rest",
        title: "Public held proof",
        summary: "The exact pre-departure public record remains proof after the return.",
        minutes: 15,
        requires_all_local_job_options: [
          {
            job_id: "albany_city__civic_core__job",
            option_id: "file_public_held_return",
          },
        ],
      },
      {
        id: "test:civic_public_held_works_rest",
        home: location.home,
        area: location.id,
        action: "rest",
        title: "Public held Works proof",
        summary: "A Works-prepared return shares the same exact public held proof.",
        minutes: 15,
        requires_all_story_choices: [
          {
            story_choice_id: "albany:wolf_preparation",
            choice_id: "albany:prep_works_fortification",
          },
        ],
        requires_all_local_job_options: [
          {
            job_id: "albany_city__civic_core__job",
            option_id: "file_public_held_return",
          },
        ],
      },
    );

    expect(() => assertOverworldIntegrity(chronological)).toThrow(
      new RegExp(`both resolve for action "rest" at "${location.id}"`, "i"),
    );
  });

  it("does not multiply unrelated authored job refs across service locations", () => {
    const scoped: OverworldManifest = structuredClone(WORLD);
    const campusJob = scoped.local_jobs.find((job) => job.id === JOB);
    if (!campusJob?.authored_scene) throw new Error("Expected the authored Campus job.");
    const occupiedLocations = new Set(
      (scoped.campaign_service_rules ?? []).map((rule) => `${rule.home}\u0000${rule.area}`),
    );
    const locations = scoped.areas
      .filter((area) => !occupiedLocations.has(`${area.home}\u0000${area.id}`))
      .slice(0, 7);
    expect(locations).toHaveLength(7);

    for (const [index, location] of locations.entries()) {
      const clone = structuredClone(campusJob);
      const poi = scoped.points_of_interest.find((candidate) => candidate.area === location.id);
      const contact = scoped.characters.find((candidate) => candidate.area === location.id);
      if (!poi || !contact || !clone.authored_scene) {
        throw new Error(`Expected authored anchors for ${location.id}.`);
      }
      clone.id = `test_scoped_job_${index}`;
      clone.home = location.home;
      clone.area = location.id;
      clone.authored_scene.id = `test:scoped_job_scene_${index}`;
      clone.authored_scene.required_poi_id = poi.id;
      clone.authored_scene.required_contact_id = contact.id;
      scoped.local_jobs.push(clone);
      scoped.campaign_service_rules?.push({
        id: `test:scoped_service_${index}`,
        home: location.home,
        area: location.id,
        action: "rest",
        title: `Scoped service ${index}`,
        summary: "This proof belongs only to its own service location.",
        minutes: 15,
        requires_all_local_job_options: [{ job_id: clone.id, option_id: ARCHIVE }],
      });
    }

    expect(() => assertOverworldIntegrity(scoped)).not.toThrow();
  });

  it("uses collision-free canonical local-job option keys even when ids contain NULs", () => {
    const left = campaignServiceLocalJobOptionKey({
      job_id: "alpha\u0000beta",
      option_id: "gamma",
    });
    const right = campaignServiceLocalJobOptionKey({
      job_id: "alpha",
      option_id: "beta\u0000gamma",
    });
    expect(left).not.toBe(right);
    expect(JSON.parse(left)).toEqual(["alpha\u0000beta", "gamma"]);
    expect(JSON.parse(right)).toEqual(["alpha", "beta\u0000gamma"]);
  });
});
