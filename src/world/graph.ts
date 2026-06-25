import type { WorldGraphEdge, WorldGraphNode, WorldManifest } from "./schema.js";

export type WorldRouteStep = {
  id: string;
  name: string;
  kind: WorldGraphNode["kind"];
  route_from_previous?: string;
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

export function worldNodeById(manifest: WorldManifest): Map<string, WorldGraphNode> {
  return new Map(manifest.graph.nodes.map((node) => [node.id, node]));
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
    if (index > 0) {
      const prev = ids[index - 1]!;
      const route = routes.get(edgeKey(prev, id));
      if (route) step.route_from_previous = route;
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
