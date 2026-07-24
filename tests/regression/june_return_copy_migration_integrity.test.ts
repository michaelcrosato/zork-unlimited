import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import type { OverworldManifest } from "../../src/world/overworld.js";
import { OverworldSession } from "../../src/world/session.js";
import {
  OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH,
  OVERWORLD_JUNE_RETURN_COPY_PREDECESSOR_WORLD_HASH,
  OVERWORLD_JUNE_RETURN_COPY_WORLD_HASH,
  OVERWORLD_RELIEF_ALLOCATION_WORLD_HASH,
  OVERWORLD_RELIEF_OATH_PREDECESSOR_WORLD_HASH,
  OVERWORLD_RELIEF_OATH_WORLD_HASH,
} from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import {
  exactAuthoredAlbanyWorksPredecessor,
  exactF06World,
} from "./fixtures/historical_overworlds.js";

const WORLD = loadOverworldManifest(process.cwd());
const JUNE_CONTACT_ID = "albany_city__transport_hub__june_pike";
const ROAD_WARDEN_PROMISE_ID = "albany:promise_return_hayden_packet";
const JUNE_LEFT_PRESENTATION_ID = "left_after_blood";
const JUNE_LEFT_JOURNAL_ID = `talk:${JUNE_CONTACT_ID}@${JUNE_LEFT_PRESENTATION_ID}`;
const PREDECESSOR_SUMMARY =
  "June's field seat is empty. Her separate return says the route crossed into combat before she could take the lower rail, ending the cattle-first field agreement.";
const CURRENT_SUMMARY =
  "June's field seat is empty. Her separate return records the first wolf death before she could take the lower rail; that death ended the cattle-first field agreement.";
const JUNE_LEFT_AGENDA =
  "The promise is recorded broken, June has left the party, and no ally return claim is available; the completed Wolf-Winter result still stands.";
const PREDECESSOR_CONTACT_TEXT = `${PREDECESSOR_SUMMARY} ${JUNE_LEFT_AGENDA}`;
const CURRENT_CONTACT_TEXT = `${CURRENT_SUMMARY} ${JUNE_LEFT_AGENDA}`;

function exactJuneReturnCopyPredecessor(world: OverworldManifest): OverworldManifest {
  const predecessor = exactAuthoredAlbanyWorksPredecessor(world);
  const june = predecessor.characters.find((character) => character.id === JUNE_CONTACT_ID);
  const left = june?.variants?.find((variant) => variant.id === JUNE_LEFT_PRESENTATION_ID);
  if (!left) throw new Error("Expected June's left-after-blood contact presentation.");
  left.summary = PREDECESSOR_SUMMARY;
  return predecessor;
}

const PREDECESSOR_WORLD = exactJuneReturnCopyPredecessor(WORLD);
const F06_WORLD = exactF06World(WORLD);

function moveToArea(session: OverworldSession, targetAreaId: string): void {
  const currentAreaId = session.view().currentArea?.id;
  if (!currentAreaId || currentAreaId === targetAreaId) return;
  const edges = PREDECESSOR_WORLD.area_edges.filter(
    (edge) => edge.home === session.view().current.id,
  );
  const queue = [currentAreaId];
  const previous = new Map<string, string>();
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    if (current === targetAreaId) break;
    for (const edge of edges.filter(
      (candidate) => candidate.from_area === current || candidate.to_area === current,
    )) {
      const next = edge.from_area === current ? edge.to_area : edge.from_area;
      if (next === currentAreaId || previous.has(next)) continue;
      previous.set(next, current);
      queue.push(next);
    }
  }
  const path: string[] = [];
  for (let cursor = targetAreaId; cursor !== currentAreaId; ) {
    const prior = previous.get(cursor);
    if (!prior) throw new Error(`No area route to ${targetAreaId}.`);
    path.unshift(cursor);
    cursor = prior;
  }
  for (const areaId of path) {
    const route = session.view().areaExits.find((candidate) => candidate.destination.id === areaId);
    if (!route) throw new Error(`Area route to ${areaId} is not visible.`);
    session.moveArea(route.id);
  }
}

function predecessorLeftAfterBloodSnapshot(
  world: OverworldManifest = PREDECESSOR_WORLD,
): ReturnType<OverworldSession["snapshot"]> {
  const registration = world.opening_registration!;
  const oath = world.opening_relief_oath;
  const lead = world.opening_lead_source!;
  const preparation = world.opening_preparation!;
  const allocation = world.opening_relief_allocation!;
  const ally = world.opening_ally!;
  const wolf = world.quests.find((quest) => quest.id === ally.target_quest)!;
  const afterBlood = wolf.campaign_exports!.find(
    (candidate) => candidate.ending_id === "ending_pack_diverted_after_blood",
  );
  if (!afterBlood) throw new Error("Expected Wolf-Winter's after-blood campaign export.");

  const session = new OverworldSession(world);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(registration.contact);
  session.chooseJourneyStory(registration.profiles[0]!.id);
  if (oath) session.chooseJourneyStory(oath.options[0]!.id);
  session.chooseJourneyStory(lead.options[0]!.id);
  if (session.view().currentArea?.id !== preparation.area) {
    moveToArea(session, preparation.area);
  }
  session.chooseJourneyStory(preparation.profiles[0]!.id);
  moveToArea(session, ally.area);
  session.chooseJourneyStory(allocation.options[0]!.id);
  session.talkToCharacter(ally.contact);
  session.chooseJourneyStory("albany:ally_june_cattle_first");
  session.startQuest(wolf.id, "albany:wolf_approach_sheltered_stockway");
  session.completeQuest(wolf.id, {
    endingId: afterBlood.ending_id,
    endingTitle: afterBlood.ending_title,
    death: false,
  });
  session.chooseJourney("continue");
  session.chooseJourneyStory("send_wardens_north");
  moveToArea(session, ally.area);
  session.talkToCharacter(ally.contact);
  session.talkToCharacter(ally.contact);
  return session.snapshot();
}

function juneLeftJournalEntries(snapshot: ReturnType<OverworldSession["snapshot"]>) {
  return snapshot.journalEntries.filter(
    (entry) => entry.id === JUNE_LEFT_JOURNAL_ID || entry.id.startsWith(`${JUNE_LEFT_JOURNAL_ID}:`),
  );
}

describe("June return-copy migration integrity", () => {
  it("pins the exact one-copy predecessor and current canonical manifest hashes", () => {
    expect(hashState(PREDECESSOR_WORLD)).toBe(OVERWORLD_JUNE_RETURN_COPY_PREDECESSOR_WORLD_HASH);
    expect(OVERWORLD_JUNE_RETURN_COPY_PREDECESSOR_WORLD_HASH).toBe(
      "a2ddc6e9042a208f2821451f10b0152874ef55bc77b0f7801f3ea58591357474",
    );
    expect(hashState(exactAuthoredAlbanyWorksPredecessor(WORLD))).toBe(
      OVERWORLD_JUNE_RETURN_COPY_WORLD_HASH,
    );
    expect(OVERWORLD_JUNE_RETURN_COPY_WORLD_HASH).toBe(
      "69604947643a24fc2d7c2377a85963742282ac7f83e7cec18a58bfc5eb8f53fc",
    );
    expect(hashState(WORLD)).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH);
    expect(OVERWORLD_RELIEF_OATH_WORLD_HASH).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH);
    expect(OVERWORLD_RELIEF_ALLOCATION_WORLD_HASH).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH);
  });

  it("normalizes only the exact old June contact copy and remains stable on replay", () => {
    const predecessor = predecessorLeftAfterBloodSnapshot();
    const predecessorEntries = juneLeftJournalEntries(predecessor);
    expect(predecessor.worldHash).toBe(OVERWORLD_JUNE_RETURN_COPY_PREDECESSOR_WORLD_HASH);
    expect(predecessorEntries).toHaveLength(1);
    expect(predecessorEntries.every((entry) => entry.text === PREDECESSOR_CONTACT_TEXT)).toBe(true);

    const restoredSession = OverworldSession.restore(WORLD, predecessor);
    const restored = restoredSession.snapshot();
    const restoredEntries = juneLeftJournalEntries(restored);
    const expectedCharacter = structuredClone(predecessor.character);
    const registrationPromise = expectedCharacter.promises.find(
      (promise) => promise.promiseId === ROAD_WARDEN_PROMISE_ID,
    );
    if (!registrationPromise) throw new Error("Expected Road-Warden's return promise.");
    registrationPromise.status = "kept";
    expect(restored).toMatchObject({
      worldHash: OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH,
      minutes: predecessor.minutes,
      supplies: predecessor.supplies,
      fatigue: predecessor.fatigue,
      questOutcomes: predecessor.questOutcomes,
      character: expectedCharacter,
    });
    expect(restoredEntries).toHaveLength(predecessorEntries.length);
    expect(restoredEntries.every((entry) => entry.text === CURRENT_CONTACT_TEXT)).toBe(true);
    expect(
      restoredSession.view().characters.find((character) => character.id === JUNE_CONTACT_ID)
        ?.summary,
    ).toBe(CURRENT_SUMMARY);
    expect(
      restored.journalEntries.find((entry) => entry.id === "quest_done:wolf_winter")?.text,
    ).toContain("Registration receipt —");
    expect(
      restored.journalEntries.find((entry) => entry.id === "quest_done:wolf_winter")?.text,
    ).not.toContain("Legacy registration receipt —");
    expect(OverworldSession.restore(WORLD, restored).snapshot()).toEqual(restored);
  });

  it("composes the same exact copy normalization with the older F06 migration", () => {
    const predecessor = predecessorLeftAfterBloodSnapshot(F06_WORLD);
    const predecessorEntries = juneLeftJournalEntries(predecessor);
    expect(predecessor.worldHash).toBe(OVERWORLD_RELIEF_OATH_PREDECESSOR_WORLD_HASH);
    expect(predecessorEntries).toHaveLength(1);
    expect(predecessorEntries.every((entry) => entry.text === PREDECESSOR_CONTACT_TEXT)).toBe(true);

    const restored = OverworldSession.restore(WORLD, predecessor).snapshot();
    const restoredEntries = juneLeftJournalEntries(restored);
    expect(restored.worldHash).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH);
    expect(restoredEntries).toHaveLength(predecessorEntries.length);
    expect(restoredEntries.every((entry) => entry.text === CURRENT_CONTACT_TEXT)).toBe(true);
    expect(
      restored.journalEntries.find((entry) => entry.id === "quest_done:wolf_winter")?.text,
    ).toContain("Legacy registration receipt —");
    expect(
      restored.journalEntries.find((entry) => entry.id === "quest_done:wolf_winter")?.text,
    ).toContain(OVERWORLD_RELIEF_OATH_PREDECESSOR_WORLD_HASH);
    expect(OverworldSession.restore(WORLD, restored).snapshot()).toEqual(restored);
  });

  it("rejects a forged presentation relabeled with the trusted predecessor hash", () => {
    const forged = predecessorLeftAfterBloodSnapshot();
    const entry = juneLeftJournalEntries(forged)[0];
    if (!entry) throw new Error("Expected June's left-after-blood journal entry.");
    entry.text = CURRENT_CONTACT_TEXT;

    expect(() => OverworldSession.restore(WORLD, forged)).toThrow(/exact authored contact copy/i);
  });

  it("does not admit an adjacent unknown world hash", () => {
    const unknown = predecessorLeftAfterBloodSnapshot();
    unknown.worldHash = `${OVERWORLD_JUNE_RETURN_COPY_PREDECESSOR_WORLD_HASH.slice(0, -1)}0`;

    expect(() => OverworldSession.restore(WORLD, unknown)).toThrow(/different world manifest/i);
  });
});
