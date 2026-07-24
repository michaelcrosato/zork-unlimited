import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import type { OverworldManifest } from "../../src/world/overworld.js";
import { OverworldSession } from "../../src/world/session.js";
import {
  OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH,
  OVERWORLD_REGISTRATION_PROMISE_CLOSURE_PREDECESSOR_WORLD_HASH,
} from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import {
  exactRegistrationPromiseClosurePredecessor,
  exactRegistrationPromiseClosurePredecessorSnapshot,
} from "./fixtures/historical_overworlds.js";

const WORLD = loadOverworldManifest(process.cwd());
const PREDECESSOR = exactRegistrationPromiseClosurePredecessor(WORLD);
const BACKGROUND_PROMISES = new Map([
  ["albany:road_warden", "albany:promise_return_hayden_packet"],
  ["albany:ledger_advocate", "albany:promise_truthful_relief_account"],
  ["albany:ironhands_repairer", "albany:promise_return_reese_tools"],
  ["albany:unaffiliated_courier", "albany:promise_close_emergency_tag"],
] as const);

function moveToArea(world: OverworldManifest, session: OverworldSession, areaId: string): void {
  const currentAreaId = session.view().currentArea?.id;
  if (!currentAreaId) throw new Error("expected a current Albany area");
  for (
    let attempt = 0;
    attempt < 8 && !session.view().discoveredAreaIds.includes(areaId);
    attempt += 1
  ) {
    session.exploreArea(currentAreaId);
  }
  if (!session.view().discoveredAreaIds.includes(areaId)) {
    throw new Error(`Albany play did not discover ${areaId}`);
  }
  const queue: { areaId: string; routeIds: string[] }[] = [{ areaId: currentAreaId, routeIds: [] }];
  const seen = new Set([currentAreaId]);
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    if (current.areaId === areaId) {
      for (const routeId of current.routeIds) session.moveArea(routeId);
      return;
    }
    for (const route of world.area_edges.filter(
      (candidate) => candidate.from_area === current.areaId || candidate.to_area === current.areaId,
    )) {
      const nextAreaId = route.from_area === current.areaId ? route.to_area : route.from_area;
      if (seen.has(nextAreaId)) continue;
      seen.add(nextAreaId);
      queue.push({ areaId: nextAreaId, routeIds: [...current.routeIds, route.id] });
    }
  }
  throw new Error(`No Albany area path reaches ${areaId}`);
}

function wolfBoundary(world: OverworldManifest, profileId: string): OverworldSession {
  const registration = world.opening_registration!;
  const preparation = world.opening_preparation!;
  const wolf = world.quests.find((quest) => quest.id === "wolf_winter")!;
  const session = new OverworldSession(world);

  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(registration.contact);
  session.chooseJourneyStory(profileId);
  session.chooseJourneyStory("albany:oath_limited_aid_only");
  session.chooseJourneyStory("albany:source_hayden_frost_report");
  moveToArea(world, session, preparation.area);
  session.chooseJourneyStory("albany:prep_works_fortification");
  session.chooseJourneyStory("albany:relief_resident_shelter");
  moveToArea(world, session, wolf.area);
  session.startQuest(wolf.id, "albany:wolf_approach_sheltered_stockway");
  return session;
}

function complete(
  world: OverworldManifest,
  profileId: string,
  endingId = "ending_pack_diverted",
): OverworldSession {
  const session = wolfBoundary(world, profileId);
  const wolf = world.quests.find((quest) => quest.id === "wolf_winter")!;
  const ending = wolf.campaign_exports!.find((candidate) => candidate.ending_id === endingId)!;
  session.completeQuest(wolf.id, {
    endingId: ending.ending_id,
    endingTitle: ending.ending_title,
    death: false,
  });
  return session;
}

function promiseStatus(session: OverworldSession, promiseId: string): string | null {
  return (
    session.snapshot().character.promises.find((candidate) => candidate.promiseId === promiseId)
      ?.status ?? null
  );
}

describe("registration-promise return snapshot integrity", () => {
  it("pins the exact predecessor and current manifest hashes", () => {
    expect(hashState(PREDECESSOR)).toBe(
      OVERWORLD_REGISTRATION_PROMISE_CLOSURE_PREDECESSOR_WORLD_HASH,
    );
    expect(OVERWORLD_REGISTRATION_PROMISE_CLOSURE_PREDECESSOR_WORLD_HASH).toBe(
      "a37f9fc6bc1752017c69c175efe506e97c393f3052d9ae27a7c69b1d6c62962f",
    );
    expect(hashState(WORLD)).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH);
    expect(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH).toBe(
      "1d8ed584e39c462a7eb5132c23796ea39b8f76a545add86a88080ecf926b9f9c",
    );
  });

  it("restores an exact pre-completion predecessor without closing its obligation early", () => {
    const predecessor = wolfBoundary(PREDECESSOR, "albany:ledger_advocate").snapshot();
    const restored = OverworldSession.restore(WORLD, predecessor);

    expect(promiseStatus(restored, "albany:promise_truthful_relief_account")).toBe("active");
    expect(restored.snapshot().journey).toEqual(predecessor.journey);
    expect(restored.snapshot().minutes).toBe(predecessor.minutes);
    expect(restored.snapshot().worldHash).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH);
    expect(OverworldSession.restore(WORLD, restored.snapshot()).snapshot()).toEqual(
      restored.snapshot(),
    );
  });

  it("upgrades only a selected, outcome-proven stale promise and remains idempotent", () => {
    for (const [profileId, selectedPromiseId] of BACKGROUND_PROMISES) {
      const predecessorSession = complete(PREDECESSOR, profileId);
      expect(promiseStatus(predecessorSession, selectedPromiseId), profileId).toBe(
        profileId === "albany:unaffiliated_courier" ? "kept" : "active",
      );

      const predecessor = exactRegistrationPromiseClosurePredecessorSnapshot(
        predecessorSession.snapshot(),
      );
      const restored = OverworldSession.restore(WORLD, predecessor);
      expect(promiseStatus(restored, selectedPromiseId), profileId).toBe("kept");
      expect(
        restored.snapshot().character.promises.map((promise) => promise.promiseId),
        profileId,
      ).toEqual([selectedPromiseId, "albany:promise_wolf_limited_aid_only"].sort());
      expect(restored.snapshot().journey).toEqual(predecessor.journey);
      const predecessorCompletion = predecessor.journalEntries.find(
        (entry) => entry.id === "quest_done:wolf_winter",
      )!;
      const restoredCompletion = restored
        .snapshot()
        .journalEntries.find((entry) => entry.id === "quest_done:wolf_winter")!;
      expect(predecessorCompletion.text).not.toContain("Registration receipt —");
      expect(restoredCompletion.text).toContain("Registration receipt —");
      const restoredWithoutCompletion = restored
        .snapshot()
        .journalEntries.filter((entry) => entry.id !== "quest_done:wolf_winter");
      const predecessorWithoutCompletion = predecessor.journalEntries.filter(
        (entry) => entry.id !== "quest_done:wolf_winter",
      );
      expect(restoredWithoutCompletion).toEqual(predecessorWithoutCompletion);
      expect(OverworldSession.restore(WORLD, restored.snapshot()).snapshot()).toEqual(
        restored.snapshot(),
      );
    }
  });

  it("rejects forged predecessor character state and an adjacent unknown hash", () => {
    const forged = complete(PREDECESSOR, "albany:ledger_advocate").snapshot();
    const promise = forged.character.promises.find(
      (candidate) => candidate.promiseId === "albany:promise_truthful_relief_account",
    )!;
    promise.status = "kept";
    expect(() => OverworldSession.restore(WORLD, forged)).toThrow(
      /registration-promise predecessor campaign character does not match/i,
    );

    const unknown = wolfBoundary(PREDECESSOR, "albany:ledger_advocate").snapshot();
    unknown.worldHash = `f${OVERWORLD_REGISTRATION_PROMISE_CLOSURE_PREDECESSOR_WORLD_HASH.slice(
      1,
    )}`;
    expect(() => OverworldSession.restore(WORLD, unknown)).toThrow(/different world manifest/i);
  });

  it.each([99, 37])(
    "rejects a stripped receipt and an Ironhands equipment snapshot at condition %i",
    (condition) => {
      const stripped = complete(WORLD, "albany:ledger_advocate").snapshot();
      const completion = stripped.journalEntries.find(
        (entry) => entry.id === "quest_done:wolf_winter",
      )!;
      completion.text = completion.text.replace(/\sRegistration receipt —.*$/u, "");
      expect(() => OverworldSession.restore(WORLD, stripped)).toThrow(
        /not bound to its canonical completion journal/i,
      );

      const forgedEquipment = complete(WORLD, "albany:ironhands_repairer").snapshot();
      const repairRoll = forgedEquipment.character.equipment.find(
        (equipment) => equipment.equipmentId === "albany:ironhands_repair_roll",
      )!;
      repairRoll.condition = condition;
      expect(() => OverworldSession.restore(WORLD, forgedEquipment)).toThrow(
        /campaign character does not match replayed quest consequences/i,
      );
    },
  );
});
