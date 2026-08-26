/**
 * Cade's certified Wolf-Winter losses become one bounded Station follow-up:
 * exact facts expose exact dispatches, simultaneous losses compete for the same
 * crew, and the chosen proof creates or truthfully consolidates one replay-bound
 * downstream service.
 */
import { describe, expect, it } from "vitest";

import { createToolApi } from "../../src/mcp/tools.js";
import { assertOverworldIntegrity, type OverworldManifest } from "../../src/world/overworld.js";
import { OverworldSession } from "../../src/world/session.js";
import { timeLabel } from "../../src/world/session_journal_codec.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { OverworldSession as UiOverworldSession } from "../../ui/src/overworld.js";
import { revealCurrentJourneyStoryOptions } from "../regression/support/journey_story.js";

const WORLD = loadOverworldManifest(process.cwd());
const JOB = "albany_city__transport_hub__job";
const SCENE = "albany:cade-return-packet";
const STATION = "albany_city__transport_hub";
const WORKS = "albany_city__industrial";
const GREENWAY = "albany_city__greenway";
const PALING = "dispatch_paling_rebuild";
const EVACUATION = "dispatch_evacuation_line";
const PASTURE = "dispatch_pasture_search";
const PASTURE_CONSEQUENCE =
  "Hayden assigns the crew to search the lower pasture. The packet closes, and no second fence or boundary crew is sent.";
const PASTURE_JOURNAL_TEXT = `${PASTURE_CONSEQUENCE} Location: Albany Station Quarter.`;
const PALING_REST = "albany:cade_paling_rebuild_works_rest";
const EVACUATION_REST = "albany:cade_evacuation_line_works_rest";
const PASTURE_RESUPPLY = "albany:cade_pasture_search_greenway_resupply";
const CONSOLIDATED_RESUPPLY = "albany:cade_pasture_search_unaffiliated_greenway_resupply";
const UNAFFILIATED_RESUPPLY = "albany:unaffiliated_bond_returned_rig_resupply";
const FULL = { compact_context: false, compact_result: false } as const;

const OUTCOMES = {
  ending_held: { title: "The Byre Held", choices: [PALING] },
  ending_held_gate_barred: { title: "The Byre Held, Inner Gate Barred", choices: [PALING] },
  ending_held_timber_saved: {
    title: "The Byre Held, Paling Timber Saved",
    choices: [PALING],
  },
  ending_pack_diverted: { title: "The Pack Diverted Alive", choices: [PALING] },
  ending_pack_diverted_after_blood: {
    title: "The Pack Broken After Blood",
    choices: [PALING, PASTURE],
  },
  ending_drive_cattle_wounded: {
    title: "The Herd Out, Rider Hurt",
    choices: [EVACUATION],
  },
  ending_drive_reserve_spent: {
    title: "The Steading Evacuated, Reserve Spent",
    choices: [EVACUATION],
  },
  ending_pack_diverted_cattle_scattered: {
    title: "The Pack Diverted, Cattle Scattered",
    choices: [PALING, PASTURE],
  },
  ending_drive_person_cattle_lost: {
    title: "The People Out, Cattle Lost",
    choices: [EVACUATION, PASTURE],
  },
  ending_fortified_cade_terms: {
    title: "Dawn Behind Cade's Shutters",
    choices: [],
  },
  ending_fortified_albany_authority: {
    title: "Dawn Under Albany Seal",
    choices: [],
  },
} as const;

type OutcomeId = keyof typeof OUTCOMES;
type DawnChoice = "send_wagon_to_cade" | "send_wardens_north";

function choicesFor(endingId: OutcomeId, dawnChoice: DawnChoice): readonly string[] {
  const choices = OUTCOMES[endingId].choices;
  return dawnChoice === "send_wagon_to_cade"
    ? choices.filter((choice) => choice === PASTURE)
    : choices;
}

function moveToArea(
  session: OverworldSession,
  targetAreaId: string,
  world: OverworldManifest = WORLD,
): void {
  for (let attempts = 0; !session.view().areas.some((area) => area.id === targetAreaId); ) {
    if (attempts >= 8) throw new Error(`Could not map ${targetAreaId}.`);
    const currentArea = session.view().currentArea;
    if (!currentArea) throw new Error("Expected a current Albany area.");
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
    if (current === targetAreaId) break;
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
    if (!prior) throw new Error(`No Albany route reaches ${targetAreaId}.`);
    path.unshift(cursor);
    cursor = prior;
  }
  for (const areaId of path) {
    const route = session.view().areaExits.find((edge) => edge.destination.id === areaId);
    if (!route) throw new Error(`Missing visible Albany route to ${areaId}.`);
    session.moveArea(route.id);
  }
}

function preparedForWolf(
  world: OverworldManifest = WORLD,
  oathId = "albany:oath_full_compact_duty",
): { session: OverworldSession; wolfId: string } {
  const session = new OverworldSession(world);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(world.opening_registration!.contact);
  session.chooseJourneyStory("albany:ledger_advocate");
  revealCurrentJourneyStoryOptions(session, world.opening_relief_oath!.id);
  session.chooseJourneyStory(oathId);
  session.chooseJourneyStory("albany:source_rowan_civic_docket");
  moveToArea(session, world.opening_preparation!.area, world);
  session.chooseJourneyStory("albany:prep_works_fortification");
  const wolf = session.view().quests.find((quest) => quest.id === "wolf_winter");
  if (!wolf) throw new Error("Expected the certified Wolf-Winter lead.");
  moveToArea(session, wolf.area, world);
  if (session.journey().storyChoice?.kind === "relief_allocation") {
    session.chooseJourneyStory("albany:relief_resident_shelter");
  }
  session.scoutPoi("albany_city__transport_hub__poi");
  session.talkToCharacter("albany_city__transport_hub__contact");
  return { session, wolfId: wolf.id };
}

function finishWolf(
  session: OverworldSession,
  wolfId: string,
  endingId: OutcomeId,
  dawnChoice: DawnChoice = "send_wardens_north",
): OverworldSession {
  session.startQuest(wolfId, "albany:wolf_approach_sheltered_stockway");
  session.completeQuest(wolfId, {
    endingId,
    endingTitle: OUTCOMES[endingId].title,
    death: false,
  });
  session.chooseJourney("continue");
  session.chooseJourneyStory(dawnChoice);
  return session;
}

function returned(
  endingId: OutcomeId,
  options: { world?: OverworldManifest; oathId?: string; dawnChoice?: DawnChoice } = {},
): OverworldSession {
  const world = options.world ?? WORLD;
  const { session, wolfId } = preparedForWolf(
    world,
    options.oathId ?? "albany:oath_full_compact_duty",
  );
  return finishWolf(session, wolfId, endingId, options.dawnChoice);
}

function addRoadStrain(session: OverworldSession): void {
  const outbound = session.view().exits.find((road) => road.destination.id === "colonie_town");
  if (!outbound) throw new Error("Expected Albany's Colonie road.");
  session.travel(outbound.id);
  if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
  const inbound = session.view().exits.find((road) => road.destination.id === "albany_city");
  if (!inbound) throw new Error("Expected Colonie's Albany road.");
  session.travel(inbound.id);
  if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
}

function choicePairs(optionIds: readonly string[]): [string, string][] {
  return optionIds.map((optionId) => [JOB, optionId]);
}

describe("Cade Return Packet", () => {
  it("is hidden before Wolf-Winter and exposes only loss-backed dispatches afterward", () => {
    const prepared = preparedForWolf();
    expect(prepared.session.snapshot().discoveredJobIds).toContain(JOB);
    expect(prepared.session.view().jobs.map((job) => job.id)).not.toContain(JOB);
    expect(() => prepared.session.workLocalJob(JOB, PALING)).toThrow(
      /Complete quest "wolf_winter"/i,
    );

    for (const endingId of Object.keys(OUTCOMES) as OutcomeId[]) {
      for (const dawnChoice of ["send_wagon_to_cade", "send_wardens_north"] as const) {
        const session = returned(endingId, { dawnChoice });
        const expectedChoices = choicesFor(endingId, dawnChoice);
        expect(session.view().currentArea?.id).toBe(STATION);
        expect(session.view().jobChoices, `${endingId}:${dawnChoice}`).toEqual(
          choicePairs(expectedChoices),
        );
        expect(session.compactView().job_choices, `${endingId}:${dawnChoice}`).toEqual(
          expectedChoices.length > 0 ? choicePairs(expectedChoices) : undefined,
        );
        expect(
          session
            .view()
            .jobs.map((job) => job.id)
            .includes(JOB),
          `${endingId}:${dawnChoice}`,
        ).toBe(expectedChoices.length > 0);
        expect(
          session.journey().opportunities?.leads.some((lead) => lead.id === JOB) ?? false,
          `${endingId}:${dawnChoice}`,
        ).toBe(expectedChoices.length > 0);
      }
    }
  });

  it("rejects wagon-repaired structural dispatches while preserving cattle search and wardens", () => {
    const wagon = returned("ending_drive_person_cattle_lost", {
      dawnChoice: "send_wagon_to_cade",
    });
    expect(wagon.view().jobChoices).toEqual(choicePairs([PASTURE]));
    expect(() => wagon.workLocalJob(JOB, EVACUATION)).toThrow(/unavailable in this journey/i);
    expect(wagon.workLocalJob(JOB, PASTURE).entry.text).toBe(PASTURE_JOURNAL_TEXT);

    const wardens = returned("ending_drive_person_cattle_lost", {
      dawnChoice: "send_wardens_north",
    });
    expect(wardens.view().jobChoices).toEqual(choicePairs([EVACUATION, PASTURE]));
    expect(wardens.workLocalJob(JOB, EVACUATION)).toMatchObject({ minutes: 35 });

    const wardensPasture = returned("ending_drive_person_cattle_lost", {
      dawnChoice: "send_wardens_north",
    });
    expect(wardensPasture.workLocalJob(JOB, PASTURE).entry.text).toBe(PASTURE_JOURNAL_TEXT);
  });

  it("makes either simultaneous loss an exact, irreversible priority", () => {
    const paling = returned("ending_pack_diverted_cattle_scattered");
    const pasture = returned("ending_pack_diverted_cattle_scattered");
    const palingBefore = paling.snapshot();
    const pastureBefore = pasture.snapshot();
    const palingRenown = paling.view().regionRenown["Capital / Mohawk"] ?? 0;
    const pastureRenown = pasture.view().regionRenown["Capital / Mohawk"] ?? 0;

    expect(paling.workLocalJob(JOB, PALING)).toMatchObject({ minutes: 45 });
    expect(pasture.workLocalJob(JOB, PASTURE)).toMatchObject({ minutes: 60 });
    expect(paling.snapshot().minutes - palingBefore.minutes).toBe(45);
    expect(pasture.snapshot().minutes - pastureBefore.minutes).toBe(60);
    expect(paling.view().regionRenown["Capital / Mohawk"]).toBe(palingRenown + 3);
    expect(pasture.view().regionRenown["Capital / Mohawk"]).toBe(pastureRenown + 4);
    expect(paling.view().jobChoices).toEqual([]);
    expect(pasture.view().jobChoices).toEqual([]);
    expect(() => paling.workLocalJob(JOB, PASTURE)).toThrow(
      /completed with a different authored option/i,
    );
    expect(() => pasture.workLocalJob(JOB, PALING)).toThrow(
      /completed with a different authored option/i,
    );
  });

  it("projects legal choices through full, compact, UI, and MCP surfaces", () => {
    for (const [dawnChoice, expectedIds] of [
      ["send_wagon_to_cade", [PASTURE]],
      ["send_wardens_north", [EVACUATION, PASTURE]],
    ] as const) {
      const session = returned("ending_drive_person_cattle_lost", { dawnChoice });
      const expected = choicePairs(expectedIds);
      const compactScene = session
        .compactView()
        .job_scenes?.find(([candidateJobId]) => candidateJobId === JOB);
      expect(session.view().jobs.find((job) => job.id === JOB)?.authored_scene?.id).toBe(SCENE);
      expect(session.view().jobChoices).toEqual(expected);
      expect(session.compactView().job_choices).toEqual(expected);
      expect(compactScene?.[6].map(([optionId]) => optionId)).toEqual(
        expected.map(([, optionId]) => optionId),
      );
      expect(UiOverworldSession.restore(WORLD, session.snapshot()).view().jobChoices).toEqual(
        expected,
      );

      const api = createToolApi({ root: process.cwd() });
      const full = api.restore_overworld_session({ ...FULL, snapshot: session.snapshot() });
      const compact = api.restore_overworld_session({
        compact_context: true,
        snapshot: session.snapshot(),
      });
      expect(full.observation.jobChoices).toEqual(expected);
      expect(compact.context.job_choices).toEqual(expected);
      expect(full.journey.opportunities).toEqual(session.journey().opportunities);
      expect(compact.journey.opportunities).toEqual(full.journey.opportunities);
      if (dawnChoice === "send_wagon_to_cade") {
        expect(() =>
          api.work_overworld_session_job({
            ...FULL,
            session_id: full.session_id,
            job_id: JOB,
            option_id: EVACUATION,
          }),
        ).toThrow(/unavailable in this journey/i);
        expect(() =>
          UiOverworldSession.restore(WORLD, session.snapshot()).workLocalJob(JOB, EVACUATION),
        ).toThrow(/unavailable in this journey/i);
      }
      const worked = api.work_overworld_session_job({
        ...FULL,
        session_id: full.session_id,
        job_id: JOB,
        option_id: PASTURE,
      });
      expect(worked.result).toMatchObject({ minutes: 60, alreadyKnown: false });
      expect(worked.observation.completedJobIds).toContain(JOB);
    }
  });

  it.each([
    {
      endingId: "ending_held" as const,
      optionId: PALING,
      serviceId: PALING_REST,
    },
    {
      endingId: "ending_drive_reserve_spent" as const,
      optionId: EVACUATION,
      serviceId: EVACUATION_REST,
    },
  ])("creates one exact Industrial rest for $optionId", ({ endingId, optionId, serviceId }) => {
    const session = returned(endingId);
    session.workLocalJob(JOB, optionId);
    addRoadStrain(session);
    moveToArea(session, WORKS);
    const rests = session.view().serviceOffers.filter((offer) => offer.action === "rest");
    expect(rests).toEqual([expect.objectContaining({ id: serviceId, minutes: 15 })]);
    expect(session.restAtTown()).toMatchObject({ changed: true, minutes: 15, fatigueAfter: 0 });
    const consumed = session.snapshot();
    expect(
      OverworldSession.restore(WORLD, consumed)
        .view()
        .serviceOffers.map((offer) => offer.id),
    ).not.toContain(serviceId);
  });

  it("creates one pasture cache and consolidates unaffiliated stores without order dependence", () => {
    const ordinary = returned("ending_pack_diverted_cattle_scattered");
    ordinary.workLocalJob(JOB, PASTURE);
    addRoadStrain(ordinary);
    moveToArea(ordinary, GREENWAY);
    expect(ordinary.view().serviceOffers.map((offer) => offer.id)).toContain(PASTURE_RESUPPLY);
    expect(ordinary.resupplyAtTown()).toMatchObject({ changed: true, minutes: 15 });

    const unaffiliated = returned("ending_drive_person_cattle_lost", {
      oathId: "albany:oath_unaffiliated_personal_bond",
    });
    unaffiliated.workLocalJob(JOB, PASTURE);
    addRoadStrain(unaffiliated);
    moveToArea(unaffiliated, GREENWAY);
    expect(unaffiliated.view().serviceOffers.map((offer) => offer.id)).toContain(
      UNAFFILIATED_RESUPPLY,
    );
    expect(unaffiliated.view().serviceOffers.map((offer) => offer.id)).not.toContain(
      CONSOLIDATED_RESUPPLY,
    );
    expect(unaffiliated.view().serviceOffers.map((offer) => offer.id)).not.toContain(
      PASTURE_RESUPPLY,
    );
    expect(unaffiliated.resupplyAtTown()).toMatchObject({ changed: true, minutes: 15 });
    const consumed = unaffiliated.snapshot();
    expect(OverworldSession.restore(WORLD, consumed).snapshot()).toEqual(consumed);
    expect(
      UiOverworldSession.restore(WORLD, consumed)
        .view()
        .serviceOffers.map((offer) => offer.id),
    ).not.toContain(UNAFFILIATED_RESUPPLY);

    const oldFirst = returned("ending_drive_person_cattle_lost", {
      oathId: "albany:oath_unaffiliated_personal_bond",
    });
    addRoadStrain(oldFirst);
    moveToArea(oldFirst, GREENWAY);
    expect(oldFirst.view().serviceOffers.map((offer) => offer.id)).toContain(UNAFFILIATED_RESUPPLY);
    expect(oldFirst.resupplyAtTown()).toMatchObject({ changed: true, minutes: 15 });
    moveToArea(oldFirst, STATION);
    oldFirst.workLocalJob(JOB, PASTURE);
    addRoadStrain(oldFirst);
    moveToArea(oldFirst, GREENWAY);
    expect(
      oldFirst
        .view()
        .serviceOffers.map((offer) => offer.id)
        .filter((id) =>
          [UNAFFILIATED_RESUPPLY, PASTURE_RESUPPLY, CONSOLIDATED_RESUPPLY].includes(id),
        ),
    ).toEqual([]);

    for (const endingId of [
      "ending_pack_diverted_after_blood",
      "ending_pack_diverted_cattle_scattered",
    ] as const) {
      const diverted = returned(endingId, {
        oathId: "albany:oath_unaffiliated_personal_bond",
      });
      diverted.workLocalJob(JOB, PASTURE);
      addRoadStrain(diverted);
      moveToArea(diverted, GREENWAY);
      expect(diverted.view().serviceOffers.map((offer) => offer.id)).toContain(
        CONSOLIDATED_RESUPPLY,
      );
      expect(diverted.view().serviceOffers.map((offer) => offer.id)).not.toContain(
        UNAFFILIATED_RESUPPLY,
      );
      expect(diverted.view().serviceOffers.map((offer) => offer.id)).not.toContain(
        PASTURE_RESUPPLY,
      );
    }

    const diverted = returned("ending_pack_diverted_cattle_scattered", {
      oathId: "albany:oath_unaffiliated_personal_bond",
    });
    diverted.workLocalJob(JOB, PASTURE);
    addRoadStrain(diverted);
    moveToArea(diverted, GREENWAY);
    expect(diverted.resupplyAtTown()).toMatchObject({ changed: true, minutes: 15 });
    const divertedConsumed = diverted.snapshot();

    const backdated = structuredClone(divertedConsumed);
    const service = backdated.journalEntries.find(
      (entry) => entry.serviceRuleId === CONSOLIDATED_RESUPPLY,
    );
    const proof = backdated.journalEntries.find(
      (entry) => entry.id === `job:${JOB}`,
    )?.localSceneProof;
    if (!service?.serviceBoundary || !proof?.boundary) throw new Error("Expected boundaries.");
    const beforeJob = proof.boundary.minutes - 1;
    service.recordedAt = timeLabel(beforeJob);
    service.serviceBoundary.minutes = beforeJob;
    expect(() => OverworldSession.restore(WORLD, backdated)).toThrow(/newest-first|boundary|time/i);
  });

  it("round-trips the selected option and rejects missing or altered proof", () => {
    const session = returned("ending_pack_diverted_cattle_scattered");
    session.workLocalJob(JOB, PASTURE);
    const snapshot = session.snapshot();
    expect(OverworldSession.restore(WORLD, snapshot).snapshot()).toEqual(snapshot);

    const altered = structuredClone(snapshot);
    const alteredEntry = altered.journalEntries.find((entry) => entry.id === `job:${JOB}`);
    if (!alteredEntry?.localSceneProof) throw new Error("Expected local proof.");
    alteredEntry.localSceneProof.optionId = PALING;
    expect(() => OverworldSession.restore(WORLD, altered)).toThrow(/accepted decision proof/i);

    const missing = structuredClone(snapshot);
    const missingEntry = missing.journalEntries.find((entry) => entry.id === `job:${JOB}`);
    if (!missingEntry) throw new Error("Expected Station job entry.");
    delete missingEntry.localSceneProof;
    expect(() => OverworldSession.restore(WORLD, missing)).toThrow(
      /missing its exact local-scene proof/i,
    );
  });

  it("rejects either latent Greenway collision if its consolidation fence is removed", () => {
    const consolidatedCollision = structuredClone(WORLD);
    const consolidatedRule = consolidatedCollision.campaign_service_rules?.find(
      (rule) => rule.id === CONSOLIDATED_RESUPPLY,
    );
    if (!consolidatedRule) throw new Error("Expected consolidated service.");
    delete consolidatedRule.forbids_any_world_facts;
    expect(() => assertOverworldIntegrity(consolidatedCollision)).toThrow(
      /both resolve for action "resupply" at "albany_city__greenway"/i,
    );

    const baseRuleCollision = structuredClone(WORLD);
    const baseRule = baseRuleCollision.campaign_service_rules?.find(
      (rule) => rule.id === PASTURE_RESUPPLY,
    );
    if (!baseRule) throw new Error("Expected pasture service.");
    delete baseRule.forbids_any_story_choices;
    expect(() => assertOverworldIntegrity(baseRuleCollision)).toThrow(
      /both resolve for action "resupply" at "albany_city__greenway"/i,
    );
  });
});
