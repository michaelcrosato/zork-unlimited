import { describe, expect, it } from "vitest";

import type { OverworldCompactView } from "../../src/world/compact_view.js";
import {
  clearOverworldSessionCaches,
  type OverworldSessionCaches,
} from "../../src/world/session_cache.js";
import type { OverworldRegionalArcProgress } from "../../src/world/session_regional_arcs.js";
import type { OverworldSessionRoutePlan } from "../../src/world/session_routes.js";
import type { OverworldSessionSnapshot } from "../../src/world/session_snapshot.js";
import type { OverworldView } from "../../src/world/session_view.js";

describe("overworld session cache", () => {
  it("clears every runtime cache slot together", () => {
    const caches: OverworldSessionCaches = {
      snapshot: { snapshot: {} as OverworldSessionSnapshot, hash: "hash" },
      routeOptions: [{} as OverworldSessionRoutePlan],
      compactView: {} as OverworldCompactView,
      regionalArcProgress: [{} as OverworldRegionalArcProgress],
      view: {} as OverworldView,
    };

    clearOverworldSessionCaches(caches);

    expect(caches).toEqual({});
  });
});
