/**
 * The shipped library is one world, not a shelf of unrelated campaigns.
 *
 * Schemas keep `meta.world` optional so tiny validator fixtures and generated eval
 * packs stay minimal. Shipped packs are different: every YAML under
 * content/rpg/pack must bind to the same canonical world and hub.
 * MCP play is RPG-only, so the shipped quest graph is now the same set that
 * play tools can start.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  CANONICAL_HUB_CITY,
  CANONICAL_WORLD_ID,
  CANONICAL_WORLD_NAME,
  WorldManifestSchema,
} from "../../src/world/schema.js";
import {
  normalizePackPath,
  worldMapBounds,
  worldMapEdges,
  worldNodeAtCoord,
  worldQuestNodeForPack,
  worldRouteForPack,
} from "../../src/world/graph.js";
import { createToolApi } from "../../src/mcp/tools.js";

const root = process.cwd();
const PACK_DIRS = ["content/rpg/pack"];

type RawPack = {
  meta?: {
    id?: string;
    title?: string;
    world?: {
      id?: string;
      name?: string;
      hub?: string;
      district?: string;
      quest?: string;
      role?: string;
      connection?: string;
    };
  };
};

function discoverPacks(dirs: string[] = PACK_DIRS): string[] {
  return dirs
    .flatMap((dir) =>
      readdirSync(join(root, dir))
        .filter((file) => file.endsWith(".yaml"))
        .map((file) => `${dir}/${file}`),
    )
    .sort();
}

function loadYaml(path: string): unknown {
  return parseYaml(readFileSync(join(root, path), "utf8"));
}

function loadWorldManifest() {
  return WorldManifestSchema.parse(loadYaml("content/world/charter_marches.yaml"));
}

describe("single-world library contract", () => {
  const packs = discoverPacks();
  const api = createToolApi({ root });

  it("declares the canonical hub world once", () => {
    const world = loadWorldManifest();

    expect(world.id).toBe(CANONICAL_WORLD_ID);
    expect(world.name).toBe(CANONICAL_WORLD_NAME);
    expect(world.hub).toBe(CANONICAL_HUB_CITY);
    expect(world.rule).toContain("Every shipped pack");
    expect(world.graph.hub).toBe("charterhaven");
    expect(world.graph.nodes.find((node) => node.id === world.graph.hub)).toMatchObject({
      name: CANONICAL_HUB_CITY,
      kind: "hub",
    });
  });

  it("connects every shipped quest pack into one reachable world graph", () => {
    const world = loadWorldManifest();
    const nodes = new Map(world.graph.nodes.map((node) => [node.id, node]));
    const questPacks = world.graph.nodes
      .filter((node) => node.kind === "quest")
      .map((node) => normalizePackPath(node.pack ?? ""))
      .sort();
    const coordKeys = world.graph.nodes.map((node) => node.coord?.join(","));

    expect(new Set(world.graph.nodes.map((node) => node.id)).size).toBe(world.graph.nodes.length);
    expect(new Set(questPacks).size).toBe(questPacks.length);
    expect(questPacks).toEqual(packs);
    expect(world.graph.nodes.every((node) => node.coord !== undefined)).toBe(true);
    expect(nodes.get(world.graph.hub)?.coord).toEqual([0, 0]);
    expect(new Set(coordKeys).size).toBe(world.graph.nodes.length);
    expect(worldMapBounds(world)).toEqual({
      min: [-4, -2],
      max: [4, 3],
      width: 9,
      height: 6,
      node_count: world.graph.nodes.length,
    });
    expect(worldMapEdges(world).find((edge) => edge.route === "moor road")).toMatchObject({
      from: "charterhaven",
      to: "moor_road",
      from_coord: [0, 0],
      to_coord: [-2, 2],
      delta: [-2, 2],
      distance: 4,
    });
    expect(worldNodeAtCoord(world, [-2, 2])?.id).toBe("moor_road");
    expect(worldNodeAtCoord(world, [99, 99])).toBeNull();

    for (const edge of world.graph.edges) {
      expect(nodes.has(edge.from), `missing graph edge endpoint ${edge.from}`).toBe(true);
      expect(nodes.has(edge.to), `missing graph edge endpoint ${edge.to}`).toBe(true);
      expect(
        nodes.get(edge.from)?.coord,
        `missing graph edge coordinate ${edge.from}`,
      ).toBeDefined();
      expect(nodes.get(edge.to)?.coord, `missing graph edge coordinate ${edge.to}`).toBeDefined();
    }

    const adjacency = new Map(world.graph.nodes.map((node) => [node.id, [] as string[]]));
    for (const edge of world.graph.edges) {
      adjacency.get(edge.from)?.push(edge.to);
      adjacency.get(edge.to)?.push(edge.from);
    }
    const queue = [world.graph.hub];
    const reached = new Set(queue);
    for (let i = 0; i < queue.length; i += 1) {
      for (const next of adjacency.get(queue[i]!) ?? []) {
        if (reached.has(next)) continue;
        reached.add(next);
        queue.push(next);
      }
    }

    expect(
      world.graph.nodes.filter((node) => !reached.has(node.id)).map((node) => node.id),
    ).toEqual([]);
    for (const path of packs) {
      const route = worldRouteForPack(world, path);
      expect(route?.[0]?.name, `${path} route must start at the hub`).toBe(CANONICAL_HUB_CITY);
      expect(route?.at(-1)?.kind, `${path} route must end at the quest`).toBe("quest");
      expect(
        route?.every((step) => Array.isArray(step.coord)),
        `${path} route must carry map coordinates`,
      ).toBe(true);
      expect(
        route?.slice(1).every((step) => Array.isArray(step.delta_from_previous)),
        `${path} route must carry map deltas`,
      ).toBe(true);
    }
  });

  it.each(packs)("%s is bound to the Charter Marches, not a separate campaign", (path) => {
    const pack = loadYaml(path) as RawPack;
    const world = pack.meta?.world;

    expect(world, `${path} is missing meta.world`).toBeDefined();
    expect(world?.id).toBe(CANONICAL_WORLD_ID);
    expect(world?.name).toBe(CANONICAL_WORLD_NAME);
    expect(world?.hub).toBe(CANONICAL_HUB_CITY);
    expect(
      world?.district?.trim().length,
      `${path} needs a concrete district/area`,
    ).toBeGreaterThan(3);
    expect(world?.quest?.trim().length, `${path} needs a concrete quest hook`).toBeGreaterThan(8);
    expect(world?.role?.trim().length, `${path} needs the player/world role`).toBeGreaterThan(3);
    expect(
      world?.connection?.trim().length,
      `${path} needs a non-trivial connection back to Charterhaven`,
    ).toBeGreaterThan(24);
  });

  it.each(packs)("%s opens as a Charterhaven RPG quest in play", (path) => {
    const pack = loadYaml(path) as RawPack;
    const packWorld = pack.meta?.world;
    const quest = worldQuestNodeForPack(loadWorldManifest(), path);
    const game = api.start_world_quest({ world_quest_id: quest?.id ?? "" });
    if (game.observation.mode !== "rpg") throw new Error("expected RPG observation");
    const opening = game.observation.description;

    expect(game.observation.world?.id).toBe(CANONICAL_WORLD_ID);
    expect(opening).toContain(CANONICAL_HUB_CITY);
    expect(opening).toContain(packWorld?.district);
    expect(opening).toContain(packWorld?.role);
    expect(opening).toContain(packWorld?.quest);
  });

  it("exposes graph routes through the MCP world listing", () => {
    const world = api.list_world({ include_graph: true, include_routes: true });
    const breakingWeir = world.quests.find((q) => q.world_quest_id === "breaking_weir");

    expect(world.graph.hub).toBe("charterhaven");
    expect(world.graph.bounds).toEqual({
      min: [-4, -2],
      max: [4, 3],
      width: 9,
      height: 6,
      node_count: world.graph.nodes.length,
    });
    expect(world.graph.edges.find((edge) => edge.route === "moor road")).toMatchObject({
      from: "charterhaven",
      to: "moor_road",
      from_coord: [0, 0],
      to_coord: [-2, 2],
      delta: [-2, 2],
      distance: 4,
    });
    expect(world.graph.nodes.every((node) => !("pack" in node))).toBe(true);
    expect(world.graph.nodes.every((node) => Array.isArray(node.coord))).toBe(true);
    expect(world.graph.nodes.find((node) => node.id === "charterhaven")?.coord).toEqual([0, 0]);
    expect("graph" in world.world).toBe(false);
    expect(world.quests.every((q) => !("path" in q))).toBe(true);
    expect(world.quests.every((q) => !("mode" in q))).toBe(true);
    expect(breakingWeir?.graph_node).toBe("breaking_weir");
    expect(breakingWeir?.path_from_hub.map((step) => step.name)).toEqual([
      CANONICAL_HUB_CITY,
      "Industrial Cut",
      "The Breaking Weir",
    ]);
    for (const quest of world.quests) {
      expect(
        quest.path_from_hub[0]?.name,
        `${quest.world_quest_id} route must start at the hub`,
      ).toBe(CANONICAL_HUB_CITY);
      expect(
        quest.path_from_hub.at(-1)?.kind,
        `${quest.world_quest_id} route must end at the quest`,
      ).toBe("quest");
    }
  });
});
