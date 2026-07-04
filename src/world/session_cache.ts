import type { OverworldCompactView } from "./compact_view.js";
import type { OverworldSessionRoutePlan } from "./session_routes.js";
import type { OverworldRegionalArcProgress } from "./session_regional_arcs.js";
import type { OverworldSessionSnapshot } from "./session_snapshot.js";
import type { OverworldView } from "./session.js";

export type OverworldSessionSnapshotCache = {
  snapshot: OverworldSessionSnapshot;
  hash: string;
};

export type OverworldSessionCaches = {
  snapshot?: OverworldSessionSnapshotCache;
  routeOptions?: OverworldSessionRoutePlan[];
  compactView?: OverworldCompactView;
  regionalArcProgress?: OverworldRegionalArcProgress[];
  view?: OverworldView;
};

export function clearOverworldSessionCaches(caches: OverworldSessionCaches): void {
  delete caches.snapshot;
  delete caches.routeOptions;
  delete caches.compactView;
  delete caches.regionalArcProgress;
  delete caches.view;
}
