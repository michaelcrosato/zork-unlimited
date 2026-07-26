import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import { DROVER_ROUTE_FAIL_FORWARD_PREDECESSOR_PREVIEW } from "../../src/world/drover_route_fail_forward_legacy.js";
import {
  OVERWORLD_DROVER_ROUTE_FAIL_FORWARD_PREDECESSOR_WORLD_HASH,
  OVERWORLD_DROVER_ROUTE_FAIL_FORWARD_TRUSTED_PREDECESSOR_WORLD_HASHES,
} from "../../src/world/opening_preparation_copy_migrations.js";
import type { OverworldManifest } from "../../src/world/overworld.js";
import { OverworldSession } from "../../src/world/session.js";
import {
  OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH,
  OVERWORLD_OPENING_PREPARATION_PREDECESSOR_WORLD_HASH,
  OVERWORLD_REGISTRATION_PROMISE_CLOSURE_PREDECESSOR_WORLD_HASH,
} from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import {
  exactDroverRouteFailForwardPredecessor,
  exactRegistrationPromiseClosurePredecessor,
} from "./fixtures/historical_overworlds.js";

const WORLD = loadOverworldManifest(process.cwd());
const PREDECESSOR = exactDroverRouteFailForwardPredecessor(WORLD);
const REGISTRATION_PROMISE_PREDECESSOR = exactRegistrationPromiseClosurePredecessor(WORLD);
const DROVER = "albany:prep_drover_route";
const WORKS = "albany:prep_works_fortification";
const CURRENT_DROVER = WORLD.opening_preparation?.profiles.find((profile) => profile.id === DROVER);
if (!CURRENT_DROVER) throw new Error("Albany must retain Emery's Drover Route");

function moveToArea(session: OverworldSession, targetAreaId: string): void {
  const start = session.view().currentArea?.id;
  if (!start || start === targetAreaId) return;
  const edges = WORLD.area_edges.filter((edge) => edge.home === session.view().current.id);
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
    if (!prior) throw new Error(`No Albany area route to ${targetAreaId}.`);
    path.unshift(cursor);
    cursor = prior;
  }
  for (const areaId of path) {
    const route = session.view().areaExits.find((candidate) => candidate.destination.id === areaId);
    if (!route) throw new Error(`Area route to ${areaId} is not visible.`);
    session.moveArea(route.id);
  }
}

function sessionAtPreparation(world: OverworldManifest): OverworldSession {
  const registration = world.opening_registration;
  const oath = world.opening_relief_oath;
  const source = world.opening_lead_source;
  const preparation = world.opening_preparation;
  if (!registration || !source || !preparation) {
    throw new Error("Albany must retain registration, source, and preparation");
  }
  const session = new OverworldSession(world);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(registration.contact);
  session.chooseJourneyStory("albany:ledger_advocate");
  if (oath) session.chooseJourneyStory("albany:oath_full_compact_duty");
  session.chooseJourneyStory("albany:source_jamie_market_testimony");
  moveToArea(session, preparation.area);
  return session;
}

function preparedSession(world: OverworldManifest, profileId: string): OverworldSession {
  const session = sessionAtPreparation(world);
  session.chooseJourneyStory(profileId);
  return session;
}

function preparationEntry(session: OverworldSession, profileId: string) {
  const entry = session
    .snapshot()
    .journalEntries.find((candidate) => candidate.id.endsWith(`:${profileId}`));
  if (!entry) throw new Error(`Expected persisted preparation ${profileId}.`);
  return entry;
}

describe("Drover route fail-forward snapshot integrity", () => {
  it("pins the exact prior-current and pressure-neutral manifest hashes", () => {
    expect(hashState(PREDECESSOR)).toBe(OVERWORLD_DROVER_ROUTE_FAIL_FORWARD_PREDECESSOR_WORLD_HASH);
    expect(OVERWORLD_DROVER_ROUTE_FAIL_FORWARD_PREDECESSOR_WORLD_HASH).toBe(
      "1d8ed584e39c462a7eb5132c23796ea39b8f76a545add86a88080ecf926b9f9c",
    );
    expect(hashState(WORLD)).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH);
    expect(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH).toBe(
      "5757ef201328662d8145b1e4fbad87907996fc1d9dad10170c3c2f8d422d2077",
    );
    expect(OVERWORLD_DROVER_ROUTE_FAIL_FORWARD_TRUSTED_PREDECESSOR_WORLD_HASHES.size).toBe(22);
    expect(
      OVERWORLD_DROVER_ROUTE_FAIL_FORWARD_TRUSTED_PREDECESSOR_WORLD_HASHES.has(
        OVERWORLD_DROVER_ROUTE_FAIL_FORWARD_PREDECESSOR_WORLD_HASH,
      ),
    ).toBe(true);
    expect(
      OVERWORLD_DROVER_ROUTE_FAIL_FORWARD_TRUSTED_PREDECESSOR_WORLD_HASHES.has(
        OVERWORLD_REGISTRATION_PROMISE_CLOSURE_PREDECESSOR_WORLD_HASH,
      ),
    ).toBe(true);
    expect(
      OVERWORLD_DROVER_ROUTE_FAIL_FORWARD_TRUSTED_PREDECESSOR_WORLD_HASHES.has(
        OVERWORLD_OPENING_PREPARATION_PREDECESSOR_WORLD_HASH,
      ),
    ).toBe(false);
  });

  it("migrates the exact persisted Drover selection without reopening it", () => {
    const predecessor = preparedSession(PREDECESSOR, DROVER);
    expect(preparationEntry(predecessor, DROVER).text).toContain(
      DROVER_ROUTE_FAIL_FORWARD_PREDECESSOR_PREVIEW,
    );

    const migrated = OverworldSession.restore(WORLD, predecessor.snapshot()).snapshot();
    const native = preparedSession(WORLD, DROVER).snapshot();
    expect(migrated).toEqual(native);
    const migratedText = preparationEntry(
      OverworldSession.restore(WORLD, predecessor.snapshot()),
      DROVER,
    ).text;
    expect(migratedText).toContain(CURRENT_DROVER.preview);
    expect(migratedText).not.toContain(DROVER_ROUTE_FAIL_FORWARD_PREDECESSOR_PREVIEW);
    expect(OverworldSession.restore(WORLD, migrated).snapshot()).toEqual(migrated);
  });

  it("migrates selected Drover copy from the composed registration-promise predecessor", () => {
    expect(hashState(REGISTRATION_PROMISE_PREDECESSOR)).toBe(
      OVERWORLD_REGISTRATION_PROMISE_CLOSURE_PREDECESSOR_WORLD_HASH,
    );
    const predecessor = preparedSession(REGISTRATION_PROMISE_PREDECESSOR, DROVER);
    expect(preparationEntry(predecessor, DROVER).text).toContain(
      DROVER_ROUTE_FAIL_FORWARD_PREDECESSOR_PREVIEW,
    );
    const migrated = OverworldSession.restore(WORLD, predecessor.snapshot()).snapshot();
    expect(migrated).toEqual(preparedSession(WORLD, DROVER).snapshot());
  });

  it("accepts an unaffected preparation while changing no campaign state", () => {
    const predecessor = preparedSession(PREDECESSOR, WORKS);
    const migrated = OverworldSession.restore(WORLD, predecessor.snapshot()).snapshot();
    expect(migrated).toEqual(preparedSession(WORLD, WORKS).snapshot());
  });

  it("migrates an exact predecessor with no preparation entry as a no-op", () => {
    const predecessor = sessionAtPreparation(PREDECESSOR);
    expect(
      predecessor.snapshot().journalEntries.some((entry) => entry.id.endsWith(`:${DROVER}`)),
    ).toBe(false);
    const migrated = OverworldSession.restore(WORLD, predecessor.snapshot()).snapshot();
    expect(migrated).toEqual(sessionAtPreparation(WORLD).snapshot());
  });

  it("rejects tampered predecessor Drover copy", () => {
    const tampered = preparedSession(PREDECESSOR, DROVER).snapshot();
    const entry = tampered.journalEntries.find((candidate) => candidate.id.endsWith(`:${DROVER}`));
    if (!entry) throw new Error("Expected persisted Drover preparation.");
    entry.text = entry.text.replace("raises alarm by 1", "raises alarm by 2");
    expect(() => OverworldSession.restore(WORLD, tampered)).toThrow(/exact authored copy/i);
  });

  it("rejects an adjacent unknown manifest hash", () => {
    const unknown = preparedSession(PREDECESSOR, DROVER).snapshot();
    unknown.worldHash = `f${OVERWORLD_DROVER_ROUTE_FAIL_FORWARD_PREDECESSOR_WORLD_HASH.slice(1)}`;
    expect(() => OverworldSession.restore(WORLD, unknown)).toThrow(/different world manifest/i);
  });
});
