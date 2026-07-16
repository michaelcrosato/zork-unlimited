import { describe, expect, it } from "vitest";

import { OverworldMcpSessionStore } from "../../src/mcp/overworld_sessions.js";
import { loadOverworldManifest } from "../../src/world/source.js";

function boundedStore(maxSessions = 2): OverworldMcpSessionStore {
  return new OverworldMcpSessionStore(() => loadOverworldManifest(process.cwd()), maxSessions);
}

describe("OverworldMcpSessionStore", () => {
  it("gives sessions from independent MCP stores globally distinct opaque ids", () => {
    const firstStore = boundedStore();
    const secondStore = boundedStore();

    const first = firstStore.create();
    const second = secondStore.create();

    expect(first.session_id).toMatch(
      /^o-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(second.session_id).toMatch(
      /^o-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(second.session_id).not.toBe(first.session_id);
    expect(firstStore.get(first.session_id)).toBe(first.session);
    expect(secondStore.get(second.session_id)).toBe(second.session);
  });

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
