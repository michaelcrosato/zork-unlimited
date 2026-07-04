import type { WorldGraphEdge, WorldGraphNode, WorldManifest } from "./schema.js";

export type WorldCoord = [number, number];

export type WorldMapBounds = {
  min: WorldCoord;
  max: WorldCoord;
  width: number;
  height: number;
  node_count: number;
};

export type WorldMapEdge = WorldGraphEdge & {
  from_coord?: WorldCoord;
  to_coord?: WorldCoord;
  delta?: WorldCoord;
  distance?: number;
};

export type WorldRouteStep = {
  id: string;
  name: string;
  kind: WorldGraphNode["kind"];
  coord?: WorldCoord;
  route_from_previous?: string;
  delta_from_previous?: WorldCoord;
  distance_from_previous?: number;
};

export function normalizePackPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^(\.\.\/)+/, "");
}

function edgeKey(a: string, b: string): string {
  return `${a}\u0000${b}`;
}

function routeLookup(edges: WorldGraphEdge[]): Map<string, string> {
  const routes = new Map<string, string>();
  for (const edge of edges) {
    routes.set(edgeKey(edge.from, edge.to), edge.route);
    routes.set(edgeKey(edge.to, edge.from), edge.route);
  }
  return routes;
}

function coordDelta(from: WorldCoord, to: WorldCoord): WorldCoord {
  return [to[0] - from[0], to[1] - from[1]];
}

function coordDistance(delta: WorldCoord): number {
  return Math.abs(delta[0]) + Math.abs(delta[1]);
}

function coordKey(coord: WorldCoord): string {
  return `${coord[0]},${coord[1]}`;
}

export function worldNodeById(manifest: WorldManifest): Map<string, WorldGraphNode> {
  return new Map(manifest.graph.nodes.map((node) => [node.id, node]));
}

export function worldNodeByCoord(manifest: WorldManifest): Map<string, WorldGraphNode> {
  const nodes = new Map<string, WorldGraphNode>();
  for (const node of manifest.graph.nodes) {
    if (node.coord) nodes.set(coordKey(node.coord), node);
  }
  return nodes;
}

export function worldNodeAtCoord(
  manifest: WorldManifest,
  coord: WorldCoord,
): WorldGraphNode | null {
  return worldNodeByCoord(manifest).get(coordKey(coord)) ?? null;
}

export function worldMapBounds(manifest: WorldManifest): WorldMapBounds | null {
  const coords = manifest.graph.nodes.flatMap((node) => (node.coord ? [node.coord] : []));
  if (coords.length === 0 || coords.length !== manifest.graph.nodes.length) return null;

  const xs = coords.map((coord) => coord[0]);
  const ys = coords.map((coord) => coord[1]);
  const min: WorldCoord = [Math.min(...xs), Math.min(...ys)];
  const max: WorldCoord = [Math.max(...xs), Math.max(...ys)];
  return {
    min,
    max,
    width: max[0] - min[0] + 1,
    height: max[1] - min[1] + 1,
    node_count: coords.length,
  };
}

export function worldMapEdges(manifest: WorldManifest): WorldMapEdge[] {
  const nodes = worldNodeById(manifest);
  return manifest.graph.edges.map((edge) => {
    const mappedEdge: WorldMapEdge = { from: edge.from, to: edge.to, route: edge.route };
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    if (from?.coord && to?.coord) {
      const delta = coordDelta(from.coord, to.coord);
      mappedEdge.from_coord = from.coord;
      mappedEdge.to_coord = to.coord;
      mappedEdge.delta = delta;
      mappedEdge.distance = coordDistance(delta);
    }
    return mappedEdge;
  });
}

export function worldQuestNodeForPack(
  manifest: WorldManifest,
  packPath: string,
): WorldGraphNode | null {
  const normalized = normalizePackPath(packPath);
  return (
    manifest.graph.nodes.find(
      (node) => node.kind === "quest" && node.pack && normalizePackPath(node.pack) === normalized,
    ) ?? null
  );
}

export function worldQuestNodeById(
  manifest: WorldManifest,
  questNodeId: string,
): WorldGraphNode | null {
  const node = worldNodeById(manifest).get(questNodeId) ?? null;
  return node?.kind === "quest" ? node : null;
}

export function worldPathFromHub(manifest: WorldManifest, targetNodeId: string): string[] | null {
  const nodes = worldNodeById(manifest);
  if (!nodes.has(manifest.graph.hub) || !nodes.has(targetNodeId)) return null;

  const adjacency = new Map<string, string[]>();
  for (const node of manifest.graph.nodes) adjacency.set(node.id, []);
  for (const edge of manifest.graph.edges) {
    adjacency.get(edge.from)?.push(edge.to);
    adjacency.get(edge.to)?.push(edge.from);
  }

  const queue = [manifest.graph.hub];
  const previous = new Map<string, string | null>([[manifest.graph.hub, null]]);
  for (let i = 0; i < queue.length; i += 1) {
    const current = queue[i]!;
    if (current === targetNodeId) break;
    for (const next of adjacency.get(current) ?? []) {
      if (previous.has(next)) continue;
      previous.set(next, current);
      queue.push(next);
    }
  }

  if (!previous.has(targetNodeId)) return null;
  const path: string[] = [];
  for (let at: string | null = targetNodeId; at !== null; at = previous.get(at) ?? null) {
    path.push(at);
  }
  return path.reverse();
}

export function worldRouteFromHub(
  manifest: WorldManifest,
  targetNodeId: string,
): WorldRouteStep[] | null {
  const ids = worldPathFromHub(manifest, targetNodeId);
  if (!ids) return null;

  const nodes = worldNodeById(manifest);
  const routes = routeLookup(manifest.graph.edges);
  return ids.map((id, index) => {
    const node = nodes.get(id);
    if (!node) throw new Error(`World graph path references missing node "${id}".`);
    const step: WorldRouteStep = { id: node.id, name: node.name, kind: node.kind };
    if (node.coord) step.coord = node.coord;
    if (index > 0) {
      const prev = ids[index - 1]!;
      const prevNode = nodes.get(prev);
      const route = routes.get(edgeKey(prev, id));
      if (route) step.route_from_previous = route;
      if (prevNode?.coord && node.coord) {
        const delta = coordDelta(prevNode.coord, node.coord);
        step.delta_from_previous = delta;
        step.distance_from_previous = coordDistance(delta);
      }
    }
    return step;
  });
}

export function worldRouteForPack(
  manifest: WorldManifest,
  packPath: string,
): WorldRouteStep[] | null {
  const node = worldQuestNodeForPack(manifest, packPath);
  return node ? worldRouteFromHub(manifest, node.id) : null;
}
