/**
 * Quest catalog for the UI (spec §13 Stage 5).
 *
 * Vite bundles every shipped content pack as raw YAML text at build time, so the
 * browser never touches the filesystem. Each entry carries the source text the
 * GameSession compiles on demand. Broken fixtures are excluded; only playable
 * quests in the single Charter Marches world are offered.
 */
import { detectMode, type Mode } from "./engine.js";
import { parse as parseYaml } from "yaml";

export type WorldBinding = {
  id: string;
  name: string;
  hub: string;
  district: string;
  quest: string;
  role: string;
  connection: string;
};

export type PackEntry = {
  path: string;
  name: string;
  mode: Mode;
  source: string;
  world: WorldBinding;
  graphNode: string | null;
  route: WorldRouteStep[];
};

export type WorldGraphNode = {
  id: string;
  name: string;
  kind: "hub" | "district" | "route" | "quest";
  district?: string;
  pack?: string;
};

export type WorldGraphEdge = {
  from: string;
  to: string;
  route: string;
};

export type WorldRouteStep = {
  id: string;
  name: string;
  kind: WorldGraphNode["kind"];
  routeFromPrevious?: string;
};

export type WorldEntry = {
  id: string;
  name: string;
  hub: string;
  premise: string;
  rule: string;
  graph: {
    hub: string;
    nodes: WorldGraphNode[];
    edges: WorldGraphEdge[];
  };
};

// All shipped packs, as raw strings (cyoa / parser / rpg "pack" directories).
const raw = import.meta.glob("../../content/**/pack/*.yaml", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const worldRaw = import.meta.glob("../../content/world/charter_marches.yaml", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function readPackMeta(source: string): { title: string; world: WorldBinding } {
  const rawPack = parseYaml(source) as {
    meta?: {
      title?: string;
      world?: Partial<WorldBinding>;
    };
  };
  const world = rawPack.meta?.world;
  if (
    !rawPack.meta?.title ||
    !world?.id ||
    !world.name ||
    !world.hub ||
    !world.district ||
    !world.quest ||
    !world.role ||
    !world.connection
  ) {
    throw new Error("A shipped quest is missing its Charter Marches world binding.");
  }
  return { title: rawPack.meta.title, world: world as WorldBinding };
}

function readWorld(): WorldEntry {
  const source = Object.values(worldRaw)[0];
  if (!source) throw new Error("Missing Charter Marches world manifest.");
  const world = parseYaml(source) as Partial<WorldEntry>;
  if (
    !world.id ||
    !world.name ||
    !world.hub ||
    !world.premise ||
    !world.rule ||
    !world.graph?.hub ||
    !world.graph.nodes ||
    !world.graph.edges
  ) {
    throw new Error("Charter Marches world manifest is incomplete.");
  }
  return world as WorldEntry;
}

export const WORLD: WorldEntry = readWorld();

function normalizePackPath(path: string): string {
  return path.replace(/^(\.\.\/)+/, "");
}

function routeToNode(target: string): WorldRouteStep[] {
  const nodes = new Map(WORLD.graph.nodes.map((node) => [node.id, node]));
  if (!nodes.has(WORLD.graph.hub) || !nodes.has(target)) return [];

  const adjacency = new Map<string, string[]>();
  for (const node of WORLD.graph.nodes) adjacency.set(node.id, []);
  for (const edge of WORLD.graph.edges) {
    adjacency.get(edge.from)?.push(edge.to);
    adjacency.get(edge.to)?.push(edge.from);
  }

  const queue = [WORLD.graph.hub];
  const previous = new Map<string, string | null>([[WORLD.graph.hub, null]]);
  for (let i = 0; i < queue.length; i += 1) {
    const current = queue[i]!;
    if (current === target) break;
    for (const next of adjacency.get(current) ?? []) {
      if (previous.has(next)) continue;
      previous.set(next, current);
      queue.push(next);
    }
  }
  if (!previous.has(target)) return [];

  const ids: string[] = [];
  for (let at: string | null = target; at !== null; at = previous.get(at) ?? null) ids.push(at);
  ids.reverse();

  return ids.map((id, index) => {
    const node = nodes.get(id)!;
    const step: WorldRouteStep = { id, name: node.name, kind: node.kind };
    if (index > 0) {
      const prev = ids[index - 1]!;
      const edge = WORLD.graph.edges.find(
        (e) => (e.from === prev && e.to === id) || (e.from === id && e.to === prev),
      );
      if (edge) step.routeFromPrevious = edge.route;
    }
    return step;
  });
}

function routeForPack(path: string): { graphNode: string | null; route: WorldRouteStep[] } {
  const normalized = normalizePackPath(path);
  const node =
    WORLD.graph.nodes.find(
      (candidate) =>
        candidate.kind === "quest" &&
        candidate.pack !== undefined &&
        normalizePackPath(candidate.pack) === normalized,
    ) ?? null;
  return { graphNode: node?.id ?? null, route: node ? routeToNode(node.id) : [] };
}

export const PACKS: PackEntry[] = Object.entries(raw)
  .map(([path, source]) => {
    const mode = detectMode(source);
    const meta = readPackMeta(source);
    const route = routeForPack(path);
    return {
      path,
      name: meta.title,
      mode,
      source,
      world: meta.world,
      graphNode: route.graphNode,
      route: route.route,
    };
  })
  .sort((a, b) => a.world.district.localeCompare(b.world.district) || a.name.localeCompare(b.name));
