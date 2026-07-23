import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import type { OverworldManifest } from "../../src/world/overworld.js";
import { OverworldSession } from "../../src/world/session.js";
import {
  OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH,
  OVERWORLD_FROST_JAMB_SIGNPOST_PREDECESSOR_WORLD_HASH,
} from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { exactFrostJambSignpostPredecessor } from "./fixtures/historical_overworlds.js";

const WORLD = loadOverworldManifest(process.cwd());
const PREDECESSOR = exactFrostJambSignpostPredecessor(WORLD);
const HAYDEN_SOURCE = "albany:source_hayden_frost_report";
const WORKS_PREPARATION = "albany:prep_works_fortification";

function moveToArea(session: OverworldSession, targetAreaId: string): void {
  const currentAreaId = session.view().currentArea?.id;
  if (!currentAreaId || currentAreaId === targetAreaId) return;
  const route = session
    .view()
    .areaExits.find((candidate) => candidate.destination.id === targetAreaId);
  if (!route) throw new Error(`Expected a visible route to ${targetAreaId}.`);
  session.moveArea(route.id);
}

function preparedSession(world: OverworldManifest): OverworldSession {
  const session = new OverworldSession(world);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(world.opening_registration!.contact);
  session.chooseJourneyStory("albany:ledger_advocate");
  session.chooseJourneyStory("albany:oath_full_compact_duty");
  session.chooseJourneyStory(HAYDEN_SOURCE);
  moveToArea(session, world.opening_preparation!.area);
  session.chooseJourneyStory(WORKS_PREPARATION);
  if (session.journey().storyChoice?.kind === "relief_allocation") {
    session.chooseJourneyStory("albany:relief_resident_shelter");
  }
  session.talkToCharacter("albany_city__transport_hub__contact");
  return session;
}

describe("frost-jamb signpost snapshot integrity", () => {
  it("reconstructs the exact predecessor while keeping every older fixture rooted there", () => {
    expect(hashState(PREDECESSOR)).toBe(OVERWORLD_FROST_JAMB_SIGNPOST_PREDECESSOR_WORLD_HASH);
    expect(hashState(WORLD)).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH);
  });

  it("migrates the exact predecessor without reopening Hayden or Reese's accepted choices", () => {
    const predecessorSnapshot = preparedSession(PREDECESSOR).snapshot();
    const migrated = OverworldSession.restore(WORLD, predecessorSnapshot).snapshot();
    const native = preparedSession(WORLD).snapshot();

    expect(migrated).toEqual(native);
    expect(OverworldSession.restore(WORLD, migrated).snapshot()).toEqual(migrated);
  });

  it("rejects a neighboring manifest hash instead of widening the text-only migration", () => {
    const predecessorSnapshot = preparedSession(PREDECESSOR).snapshot();
    predecessorSnapshot.worldHash = `f${OVERWORLD_FROST_JAMB_SIGNPOST_PREDECESSOR_WORLD_HASH.slice(
      1,
    )}`;

    expect(() => OverworldSession.restore(WORLD, predecessorSnapshot)).toThrow(
      /different world manifest/i,
    );
  });
});
