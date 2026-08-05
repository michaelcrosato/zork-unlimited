/**
 * A compact `roads` row must quote the cost of THAT road.
 *
 * `compactOverworldRoads` used to look the destination up in `routeOptions` and
 * emit that plan's estimate. `routeOptions` are Dijkstra shortest paths by
 * travel_minutes, and for eight ordered road pairs in the shipped world the
 * shortest path to a neighbouring town is a two-hop detour rather than the road
 * itself. So the very first move of a default game advertised Schenectady at 16
 * minutes for 2 supplies (Albany -> Colonie -> Schenectady) while
 * `travel_overworld_session` resolved the destination to the direct road and
 * charged 18 minutes for 1 supply. The direct road's true cost was not recoverable
 * from the compact surface at all, since `roads` and `route_options` emitted the
 * identical tuple — and the compact projection is what MCP agents and the blind
 * fleet plan from. Time and supplies are the overworld's core resources, and the
 * Goal Passage stop rule keys on supply deficit and fatigue tier.
 *
 * The non-compact `view()` was always right; only the projection was wrong.
 */
import { describe, expect, it } from "vitest";

import { compactOverworldRoads } from "../../src/world/compact_view.js";
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const world = loadOverworldManifest(process.cwd());

describe("compact roads quote the direct road, not a cheaper detour", () => {
  it("every advertised road cost is the one travel_to actually charges", () => {
    // A fresh session per road: travelling spends the resources the next estimate
    // would be computed from, so they cannot share one.
    const probe = new OverworldSession(world);
    const destinations = probe.compactView().roads.map((row) => row[0]);
    expect(destinations.length).toBeGreaterThan(0);

    for (const destination of destinations) {
      const session = new OverworldSession(world);
      const row = session.compactView().roads.find((candidate) => candidate[0] === destination);
      expect(row, `no compact road row for ${destination}`).toBeDefined();
      const [, promisedMinutes, promisedSupplies] = row!;

      // travelTo returns the TravelLogEntry it just wrote — the charge of record.
      const travel = new OverworldSession(world).travelTo(destination);
      expect(travel.minutes, `${destination} minutes`).toBe(promisedMinutes);
      expect(travel.suppliesUsed, `${destination} supplies`).toBe(promisedSupplies);
    }
  });

  it("reports the direct road even where a two-hop detour is faster", () => {
    // The named regression: Albany -> Schenectady is 18 minutes on its own road and
    // 16 via Colonie. `roads` must say 18; `route_options` may still offer the 16.
    const session = new OverworldSession(world);
    const view = session.view();
    const compact = session.compactView();

    const direct = view.exits.find((exit) => exit.destination.id === "schenectady_city");
    expect(direct, "Albany must border Schenectady").toBeDefined();
    expect(direct!.travel_minutes).toBe(18);

    const row = compact.roads.find((candidate) => candidate[0] === "schenectady_city");
    expect(row?.[1]).toBe(18);

    const plan = compact.route_options?.find((candidate) => candidate[0] === "schenectady_city");
    if (plan) {
      expect(plan[4].length, "the cheaper plan is a genuine detour").toBeGreaterThan(1);
      expect(plan[1], "route_options keeps its own, cheaper estimate").toBeLessThan(row![1]);
    }
  });

  it("no row anywhere in the world undercuts its own edge's base minutes", () => {
    // Delays can only ADD to a leg, so an advertised cost below the edge's own
    // travel_minutes can only come from quoting a different route. Swept over every
    // town rather than the starting one, so a future detour pair cannot slip in.
    const roadsByTown = new Map<
      string,
      { id: string; destination: { id: string }; travel_minutes: number }[]
    >();
    for (const edge of world.edges) {
      for (const [from, to] of [
        [edge.from, edge.to],
        [edge.to, edge.from],
      ] as const) {
        const list = roadsByTown.get(from) ?? [];
        list.push({ id: edge.id, destination: { id: to }, travel_minutes: edge.travel_minutes });
        roadsByTown.set(from, list);
      }
    }
    expect(roadsByTown.size).toBeGreaterThan(0);

    let checked = 0;
    for (const [, exits] of roadsByTown) {
      // No route plans: the rows must still be computed from the edges themselves.
      const rows = compactOverworldRoads(exits, [], { fatigue: 0, supplies: 12 }, exits.length);
      expect(rows).toHaveLength(exits.length);
      for (const [index, row] of rows.entries()) {
        const exit = exits[index]!;
        expect(row[0]).toBe(exit.destination.id);
        expect(row[1], `${exit.id} must not undercut its own base minutes`).toBeGreaterThanOrEqual(
          exit.travel_minutes,
        );
        checked += 1;
      }
    }
    expect(checked).toBe(world.edges.length * 2);
  });
});
