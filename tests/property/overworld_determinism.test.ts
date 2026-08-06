/**
 * The §8.5 determinism contract, established on the OVERWORLD.
 *
 * The overworld is not driven by the core `Rules`/`makeStep` seam — it is a session
 * class with its own snapshot/restore in place of save/load — so the RPG property
 * suite cannot reach it, and until now nothing quantified over it at all. It is the
 * surface every blind playtest and every MCP agent actually plays, and 54% of the
 * source lives behind it.
 *
 *   (a) determinism    — the same journey twice yields the same snapshot-hash chain
 *   (c) snapshot/load  — every reached session restores to an identical hash
 *   (e) idempotence    — re-snapshotting a restored session reproduces the bytes
 *
 * (b) purity and (d) legality have no analogue here: the session mutates itself by
 * design, and its legal moves come from the same projection the caller reads.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const world = loadOverworldManifest(process.cwd());

/** Pinned, like the RPG suite's, so a fast-check default change cannot shrink coverage. */
const RUNS = { numRuns: 60 };

/** Journeys are short: travel spends supplies, and a stranded session stops moving. */
const picksArb = fc.array(fc.nat({ max: 1000 }), { maxLength: 6 });

type Journey = {
  hashes: string[];
  snapshots: unknown[];
  towns: string[];
};

/** Travel the map guided by `picks`: at each step take a road by index. */
function journey(picks: readonly number[]): Journey {
  const session = new OverworldSession(world);
  const hashes: string[] = [];
  const snapshots: unknown[] = [];
  const towns: string[] = [];

  const record = (): void => {
    hashes.push(session.snapshotHash());
    snapshots.push(session.snapshot());
    towns.push(session.compactView().here[0]);
  };

  for (const pick of picks) {
    const roads = session.compactView().roads;
    if (roads.length === 0) break;
    session.travelTo(roads[pick % roads.length]![0]);
    record();
    // travel_to leaves the session mid-edge whenever the road carries an encounter,
    // and no further road is offered until it is answered. Answer it the same way
    // every time — the point here is determinism, not strategy choice — and record
    // the arrival too, so the walk covers both sides of that boundary.
    if (session.compactView().pending_road) {
      session.resolveRoadEncounter("press_on");
      record();
    }
  }
  return { hashes, snapshots, towns };
}

describe("overworld determinism contract (§8.5)", () => {
  it("(a) the same journey twice yields the same snapshot-hash chain", () => {
    fc.assert(
      fc.property(picksArb, (picks) => {
        expect(journey(picks).hashes).toEqual(journey(picks).hashes);
      }),
      RUNS,
    );
  });

  it("(c) every reached session restores from its snapshot to an identical hash", () => {
    fc.assert(
      fc.property(picksArb, (picks) => {
        for (const snapshot of journey(picks).snapshots) {
          const restored = OverworldSession.restore(world, snapshot);
          expect(restored.snapshotHash()).toBe(
            OverworldSession.restore(world, snapshot).snapshotHash(),
          );
          expect(restored.snapshot()).toEqual(snapshot);
        }
      }),
      RUNS,
    );
  });

  it("(e) restoring and re-snapshotting is idempotent (no field is lost or invented)", () => {
    fc.assert(
      fc.property(picksArb, (picks) => {
        for (const snapshot of journey(picks).snapshots) {
          const once = OverworldSession.restore(world, snapshot).snapshot();
          const twice = OverworldSession.restore(world, once).snapshot();
          expect(twice).toEqual(once);
        }
      }),
      RUNS,
    );
  });

  it("the journey actually moves (a property over a stationary session proves nothing)", () => {
    // Guards the file against becoming vacuous the way a toy subject would.
    const walked = journey([0, 1, 2, 3]);
    expect(walked.hashes.length).toBeGreaterThan(1);
    expect(new Set(walked.hashes).size).toBe(walked.hashes.length);
    expect(new Set(walked.towns).size).toBeGreaterThan(1);
  });
});
