/**
 * SS-F12 end-to-end campaign proof. The terminal Bloodied Byre evacuation is
 * deliberately distinct from both a held byre and the bloodless/drive exits:
 * two younger wolves are dead, old grey still holds the abandoned byre, and
 * the surviving people leave two cattle behind.
 */
import { describe, expect, it } from "vitest";

import { createToolApi } from "../../src/mcp/tools.js";
import type { OverworldManifest } from "../../src/world/overworld.js";
import { OverworldSession } from "../../src/world/session.js";
import type { OverworldSessionSnapshot } from "../../src/world/session_snapshot.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { OverworldSession as UiOverworldSession } from "../../ui/src/overworld.js";
import { revealCurrentJourneyStoryOptions } from "../regression/support/journey_story.js";

const WORLD = loadOverworldManifest(process.cwd());
const WOLF = WORLD.quests.find((quest) => quest.id === "wolf_winter")!;

const CIVIC_AREA = "albany_city__civic_core";
const EVENT_ID = "albany_city__civic_core__event";
const JOB_ID = "albany_city__civic_core__job";
const PUBLIC_RECORD = "open_public_relief_record";
const EVACUATED_DOCKET = "file_public_evacuated_return";
const JUNE = "albany:june_pike";
const JUNE_PROMISE = "albany:promise_june_cattle_first";
const ENDING = "ending_bloodied_byre_evacuated";
const TITLE = "The Bloodied Byre Evacuated";
const FULL = { compact_context: false, compact_result: false } as const;

const FACTS = [
  "fact:wolf_winter_bloodied_byre_evacuated",
  "fact:wolf_winter_bloodshed",
  "fact:wolf_winter_cattle_scattered",
  "fact:wolf_winter_flank_wolf_killed",
  "fact:wolf_winter_old_grey_leader_remains",
  "fact:wolf_winter_outer_line_abandoned",
  "fact:wolf_winter_people_safe",
  "fact:wolf_winter_steading_evacuated",
  "fact:wolf_winter_yearling_killed",
] as const;

const FALSE_FACTS = [
  "fact:wolf_winter_byre_held",
  "fact:wolf_winter_pack_diverted_alive",
  "fact:wolf_winter_two_wolves_diverted_alive",
  "fact:wolf_winter_pack_driven_alive",
  "fact:wolf_winter_winter_feed_spent",
  "fact:wolf_winter_drive_reserve_returned",
  "fact:wolf_winter_drive_reserve_spent",
  "fact:wolf_winter_cattle_whole",
] as const;

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

function wolfBoundaryWithJune(): OverworldSessionSnapshot {
  const session = new OverworldSession(WORLD);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(WORLD.opening_registration!.contact);
  session.chooseJourneyStory("albany:road_warden");
  revealCurrentJourneyStoryOptions(session, WORLD.opening_relief_oath!.id);
  session.chooseJourneyStory("albany:oath_limited_aid_only");
  session.chooseJourneyStory("albany:source_rowan_civic_docket");
  moveToArea(session, WORLD.opening_preparation!.area);
  session.chooseJourneyStory("albany:prep_works_fortification");
  session.chooseJourneyStory("albany:relief_resident_shelter");

  moveToArea(session, CIVIC_AREA);
  session.investigateEvent(EVENT_ID);
  session.resolveEvent(EVENT_ID, PUBLIC_RECORD);

  const ally = WORLD.opening_ally!;
  moveToArea(session, ally.area);
  session.talkToCharacter(ally.contact);
  session.chooseJourneyStory("albany:ally_june_cattle_first");
  session.startQuest(WOLF.id, "albany:wolf_approach_sheltered_stockway");
  return session.snapshot();
}

function completeBoundary(boundary: OverworldSessionSnapshot): OverworldSession {
  const session = OverworldSession.restore(WORLD, boundary);
  session.completeQuest(WOLF.id, { endingId: ENDING, endingTitle: TITLE, death: false });
  return session;
}

function memories(snapshot: OverworldSessionSnapshot, npcId: string): readonly string[] {
  return (
    snapshot.character.relationships.find((relationship) => relationship.npcId === npcId)
      ?.memories ?? []
  );
}

describe("SS-F12 — Bloodied Byre evacuation survives the truthful Albany return", () => {
  it("folds the exact evacuation count through replay, projections, dispatch, and its only lawful docket", () => {
    const boundary = wolfBoundaryWithJune();
    expect(boundary.character.companions).toContain(JUNE);
    expect(boundary.character.promises).toContainEqual({
      promiseId: JUNE_PROMISE,
      recipientId: JUNE,
      status: "active",
    });

    const completed = completeBoundary(boundary);
    const snapshot = completed.snapshot();
    expect(snapshot.questOutcomes).toContainEqual([WOLF.id, ENDING]);
    expect(completed.campaignWorldFactIds()).toEqual(FACTS);
    for (const fact of FALSE_FACTS) expect(completed.campaignWorldFactIds()).not.toContain(fact);

    expect(memories(snapshot, "npc:old_cade")).toContain(
      "memory:wolf_winter_bloodied_byre_evacuated",
    );
    expect(memories(snapshot, "albany:emery_sloane")).toContain(
      "albany:memory_emery_wolf_bloodied_byre_evacuated",
    );
    expect(memories(snapshot, JUNE)).toContain("albany:memory_june_left_after_blood");
    expect(snapshot.character.companions).not.toContain(JUNE);
    expect(snapshot.character.promises).toContainEqual({
      promiseId: JUNE_PROMISE,
      recipientId: JUNE,
      status: "broken",
    });

    const completion = snapshot.journalEntries.find(
      (entry) => entry.id === `quest_done:${WOLF.id}`,
    );
    expect(completion?.questCompletionBoundary).toBeDefined();
    const replayed = OverworldSession.restore(WORLD, snapshot);
    expect(replayed.snapshot()).toEqual(snapshot);
    expect(OverworldSession.restore(WORLD, replayed.snapshot()).snapshot()).toEqual(snapshot);
    expect(replayed.campaignWorldFactIds()).toEqual(FACTS);
    expect(replayed.snapshot().character.companions).not.toContain(JUNE);

    const ui = UiOverworldSession.restore(WORLD, snapshot);
    expect(ui.campaignWorldFactIds()).toEqual(completed.campaignWorldFactIds());
    expect(ui.view().jobChoices).toEqual(completed.view().jobChoices);
    expect(ui.compactView().job_choices).toEqual(completed.compactView().job_choices);

    const api = createToolApi({ root: process.cwd() });
    const full = api.restore_overworld_session({ ...FULL, snapshot });
    const compact = api.restore_overworld_session({ compact_context: true, snapshot });
    expect(compact.snapshot_hash).toBe(full.snapshot_hash);
    expect(full.observation.jobChoices).toEqual(completed.view().jobChoices);
    expect(compact.context.job_choices).toEqual(completed.compactView().job_choices);
    expect(full.observation.character.companions).not.toContain(JUNE);
    expect(compact.context.character[3]).not.toContain(JUNE);

    completed.chooseJourney("continue");
    const dispatch = completed.journey().storyChoice;
    expect(dispatch?.id).toBe("albany_dawn_dispatch");
    expect(dispatch?.options.map((option) => option.id)).toEqual([
      "send_wagon_to_cade",
      "send_wardens_north",
    ]);
    for (const option of dispatch?.options ?? []) {
      expect(option.consequence).toMatch(/yearling and flank wolf[^]*dead/i);
      expect(option.consequence).toMatch(/old grey[^]*(?:remains|holds)/i);
      expect(option.consequence).toMatch(/two (?:missing )?cattle|two cattle[^]*missing/i);
      expect(option.consequence).toMatch(/Cade[^]*(?:every|safe|evacuat)/i);
    }
    completed.chooseJourneyStory("send_wardens_north");
    moveToArea(completed, CIVIC_AREA);
    expect(completed.view().jobChoices).toEqual([[JOB_ID, EVACUATED_DOCKET]]);
    expect(completed.compactView().job_choices).toEqual([[JOB_ID, EVACUATED_DOCKET]]);
    expect(() => completed.workLocalJob(JOB_ID, "file_public_held_return")).toThrow(
      /not available/i,
    );

    const docketSnapshot = completed.snapshot();
    expect(UiOverworldSession.restore(WORLD, docketSnapshot).view().jobChoices).toEqual([
      [JOB_ID, EVACUATED_DOCKET],
    ]);
    const docketFull = api.restore_overworld_session({ ...FULL, snapshot: docketSnapshot });
    const docketCompact = api.restore_overworld_session({
      compact_context: true,
      snapshot: docketSnapshot,
    });
    expect(docketFull.observation.jobChoices).toEqual([[JOB_ID, EVACUATED_DOCKET]]);
    expect(docketCompact.context.job_choices).toEqual([[JOB_ID, EVACUATED_DOCKET]]);
    const filed = api.work_overworld_session_job({
      ...FULL,
      session_id: docketFull.session_id,
      job_id: JOB_ID,
      option_id: EVACUATED_DOCKET,
    });
    expect(filed.result).toMatchObject({ minutes: 60 });
    expect(filed.observation.completedJobIds).toContain(JOB_ID);
  });
});
