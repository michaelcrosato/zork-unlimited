import { describe, expect, it } from "vitest";

import {
  cachedSessionProjection,
  invalidateSessionStateCaches,
  invalidateSessionTranscriptCaches,
  type SessionRuntimeCaches,
} from "../../src/mcp/session_cache.js";
import type { TranscriptSummary } from "../../src/mcp/sessions.js";
import type { RpgActionOption } from "../../src/rpg/legal_actions.js";
import type { RpgObservation } from "../../src/rpg/observation.js";

const actions: RpgActionOption[] = [{ id: "look", command: "look", action: { type: "LOOK" } }];

const observation = {
  room: "start",
} as RpgObservation;

const summary: TranscriptSummary = {
  steps: 0,
  scenes: ["start"],
  ended: false,
  ending_id: null,
  inventory: [],
  flags: [],
  journal: [],
};

function populatedCaches(): SessionRuntimeCaches<TranscriptSummary> {
  return {
    legalActionsCache: { stateHash: "state-1", actions },
    legalActionProjectionCaches: new Map([["legal:v1", { stateHash: "state-1", projection: [] }]]),
    observationCache: {
      stateHash: "state-1",
      hideGraph: false,
      includeWorldIntro: false,
      observation,
    },
    observationProjectionCaches: new Map([["obs:v1", { stateHash: "state-1", projection: {} }]]),
    transcriptSummaryCache: {
      stateHash: "state-1",
      transcriptLogHash: "log-1",
      summary,
    },
    transcriptSummaryProjectionCaches: new Map([
      ["summary:v1", { stateHash: "state-1", transcriptLogHash: "log-1", projection: {} }],
    ]),
    transcriptProjectionCaches: new Map([
      ["turns:v1", { transcriptLogHash: "log-1", projection: [] }],
    ]),
  };
}

describe("MCP session caches", () => {
  it("invalidates all state-derived caches while preserving transcript-only projections", () => {
    const caches = populatedCaches();

    invalidateSessionStateCaches(caches);

    expect(caches.legalActionsCache).toBeUndefined();
    expect(caches.legalActionProjectionCaches).toBeUndefined();
    expect(caches.observationCache).toBeUndefined();
    expect(caches.observationProjectionCaches).toBeUndefined();
    expect(caches.transcriptSummaryCache).toBeUndefined();
    expect(caches.transcriptSummaryProjectionCaches).toBeUndefined();
    expect(caches.transcriptProjectionCaches).toBeDefined();
  });

  it("invalidates transcript-derived caches while preserving pure state caches", () => {
    const caches = populatedCaches();

    invalidateSessionTranscriptCaches(caches);

    expect(caches.legalActionsCache).toBeDefined();
    expect(caches.legalActionProjectionCaches).toBeDefined();
    expect(caches.observationCache).toBeDefined();
    expect(caches.observationProjectionCaches).toBeDefined();
    expect(caches.transcriptSummaryCache).toBeUndefined();
    expect(caches.transcriptSummaryProjectionCaches).toBeUndefined();
    expect(caches.transcriptProjectionCaches).toBeUndefined();
  });

  it("reuses fresh projection entries and rebuilds stale ones", () => {
    const cacheMap = new Map([["compact:v1", { stateHash: "state-1", projection: ["look"] }]]);
    let builds = 0;

    const fresh = cachedSessionProjection(
      cacheMap,
      "compact:v1",
      (entry) => entry.stateHash === "state-1",
      (projection: string[]) => ({ stateHash: "state-1", projection }),
      () => {
        builds += 1;
        return ["inventory"];
      },
    );

    const stale = cachedSessionProjection(
      cacheMap,
      "compact:v1",
      (entry) => entry.stateHash === "state-2",
      (projection: string[]) => ({ stateHash: "state-2", projection }),
      () => {
        builds += 1;
        return ["inventory"];
      },
    );

    expect(fresh.value).toEqual(["look"]);
    expect(stale.value).toEqual(["inventory"]);
    expect(stale.cacheMap.get("compact:v1")?.stateHash).toBe("state-2");
    expect(builds).toBe(1);
  });
});
