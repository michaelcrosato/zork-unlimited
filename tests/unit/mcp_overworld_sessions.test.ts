import { describe, expect, it } from "vitest";

import { OverworldMcpSessionStore } from "../../src/mcp/overworld_sessions.js";
import { loadOverworldManifest } from "../../src/world/source.js";

function boundedStore(maxSessions = 2): OverworldMcpSessionStore {
  return new OverworldMcpSessionStore(() => loadOverworldManifest(process.cwd()), maxSessions);
}

describe("OverworldMcpSessionStore", () => {
  it("bounds created sessions and keeps recently accessed sessions", () => {
    const store = boundedStore();

    const first = store.create();
    const second = store.create();
    expect(store.get(first.session_id)).toBe(first.session);

    const third = store.create();

    expect(store.get(first.session_id)).toBe(first.session);
    expect(store.get(third.session_id)).toBe(third.session);
    expect(() => store.get(second.session_id)).toThrow(
      `Unknown overworld session "${second.session_id}".`,
    );
  });

  it("applies the same LRU cap to restored sessions", () => {
    const store = boundedStore();

    const first = store.create();
    const second = store.create();
    const snapshot = first.session.snapshot();
    expect(store.get(first.session_id)).toBe(first.session);

    const restored = store.restore(snapshot);

    expect(store.get(first.session_id)).toBe(first.session);
    expect(store.get(restored.session_id)).toBe(restored.session);
    expect(() => store.get(second.session_id)).toThrow(
      `Unknown overworld session "${second.session_id}".`,
    );
  });
});
