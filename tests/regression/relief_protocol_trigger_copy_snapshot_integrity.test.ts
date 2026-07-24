import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import type { OverworldManifest } from "../../src/world/overworld.js";
import {
  RELIEF_PROTOCOL_TRIGGER_COPY_PREDECESSOR_PREVIEW,
  RELIEF_PROTOCOL_TRIGGER_COPY_PREDECESSOR_SUMMARY,
} from "../../src/world/relief_protocol_trigger_copy_legacy.js";
import { OverworldSession } from "../../src/world/session.js";
import {
  OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH,
  OVERWORLD_RELIEF_PROTOCOL_TRIGGER_COPY_PREDECESSOR_WORLD_HASH,
} from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { exactReliefProtocolTriggerCopyPredecessor } from "./fixtures/historical_overworlds.js";

const WORLD = loadOverworldManifest(process.cwd());
const PREDECESSOR = exactReliefProtocolTriggerCopyPredecessor(WORLD);
const RELIEF = "albany:prep_relief_protocol";
const WORKS = "albany:prep_works_fortification";
const CURRENT_RELIEF = WORLD.opening_preparation?.profiles.find((profile) => profile.id === RELIEF);
if (!CURRENT_RELIEF) throw new Error("Albany must retain Jamie's Relief Protocol");

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

function preparedSession(world: OverworldManifest, profileId: string): OverworldSession {
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

describe("Relief Protocol trigger-copy snapshot integrity", () => {
  it("pins the exact predecessor and progressive-comparison manifest hashes", () => {
    expect(hashState(PREDECESSOR)).toBe(
      OVERWORLD_RELIEF_PROTOCOL_TRIGGER_COPY_PREDECESSOR_WORLD_HASH,
    );
    expect(OVERWORLD_RELIEF_PROTOCOL_TRIGGER_COPY_PREDECESSOR_WORLD_HASH).toBe(
      "951c541f10fefa869449427ef15666a7546ced7172144c85866e465d6f3f9de0",
    );
    expect(hashState(WORLD)).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH);
    expect(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH).toBe(
      "1d8ed584e39c462a7eb5132c23796ea39b8f76a545add86a88080ecf926b9f9c",
    );
    expect(WORLD.opening_preparation?.profiles.map((profile) => profile.trigger_category)).toEqual([
      "Opening repair at Cade's first loose paling rail.",
      "One-shot lure recovery after the first feed cast fails.",
      "Herd calming after the public-rail lure recovery.",
    ]);
  });

  it("migrates the exact persisted Relief selection without reopening it", () => {
    const predecessor = preparedSession(PREDECESSOR, RELIEF);
    const predecessorText = preparationEntry(predecessor, RELIEF).text;
    expect(predecessorText).toContain(RELIEF_PROTOCOL_TRIGGER_COPY_PREDECESSOR_SUMMARY);
    expect(predecessorText).toContain(RELIEF_PROTOCOL_TRIGGER_COPY_PREDECESSOR_PREVIEW);

    const migrated = OverworldSession.restore(WORLD, predecessor.snapshot()).snapshot();
    const native = preparedSession(WORLD, RELIEF).snapshot();
    expect(migrated).toEqual(native);
    const migratedText = preparationEntry(
      OverworldSession.restore(WORLD, predecessor.snapshot()),
      RELIEF,
    ).text;
    expect(migratedText).toContain(CURRENT_RELIEF.summary);
    expect(migratedText).toContain(CURRENT_RELIEF.preview);
    expect(migratedText).not.toContain(RELIEF_PROTOCOL_TRIGGER_COPY_PREDECESSOR_PREVIEW);
    expect(OverworldSession.restore(WORLD, migrated).snapshot()).toEqual(migrated);
  });

  it("accepts an unaffected preparation while changing no mechanics or consequences", () => {
    const predecessor = preparedSession(PREDECESSOR, WORKS);
    const migrated = OverworldSession.restore(WORLD, predecessor.snapshot()).snapshot();
    expect(migrated).toEqual(preparedSession(WORLD, WORKS).snapshot());
  });

  it.each([
    ["summary", "rough rail recovery", "forged rail recovery"],
    ["preview", "ordinary split-rail", "forged split-rail"],
  ] as const)("rejects tampered predecessor %s copy", (_fragment, before, after) => {
    const tampered = preparedSession(PREDECESSOR, RELIEF).snapshot();
    const entry = tampered.journalEntries.find((candidate) => candidate.id.endsWith(`:${RELIEF}`));
    if (!entry) throw new Error("Expected persisted Relief preparation.");
    entry.text = entry.text.replace(before, after);
    expect(() => OverworldSession.restore(WORLD, tampered)).toThrow(/exact authored copy/i);
  });

  it("rejects an adjacent unknown manifest hash", () => {
    const unknown = preparedSession(PREDECESSOR, RELIEF).snapshot();
    unknown.worldHash = `f${OVERWORLD_RELIEF_PROTOCOL_TRIGGER_COPY_PREDECESSOR_WORLD_HASH.slice(
      1,
    )}`;
    expect(() => OverworldSession.restore(WORLD, unknown)).toThrow(/different world manifest/i);
  });
});
