import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  loadOverworldManifest,
  overworldIntegrityCacheKey,
  overworldIntegrityMarkerPath,
} from "../../src/world/source.js";

/**
 * bug_0611 — every process that loaded the shipped world re-ran assertOverworldIntegrity
 * (about 19 s of the loader's 20 s), and vitest isolates every test file in its own
 * process, so the same immutable bytes were re-proven ~115 times per suite run. The
 * verdict is a pure function of the world bytes and the engine source, so a marker
 * keyed on both lets a later process skip straight to the cheap checks. `npm run
 * validate` never trusts the marker: it re-proves and rewrites it.
 */
const WORLD = join("content", "world", "new_york_overworld.json");
const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function shippedWorldText(): string {
  return readFileSync(WORLD, "utf8");
}

function makeRoot(worldText: string): string {
  const root = mkdtempSync(join(tmpdir(), "world-integrity-cache-"));
  roots.push(root);
  mkdirSync(dirname(join(root, WORLD)), { recursive: true });
  writeFileSync(join(root, WORLD), worldText, "utf8");
  cpSync(join("content", "rpg", "quests"), join(root, "content", "rpg", "quests"), {
    recursive: true,
  });
  return root;
}

function integrityBrokenWorldText(): string {
  // Passes the schema (a string is a string) and fails assertOverworldIntegrity (the
  // edge now points at a node that does not exist).
  const raw = JSON.parse(shippedWorldText()) as { edges: { to: string }[] };
  raw.edges[0]!.to = "no_such_node";
  return JSON.stringify(raw);
}

describe("overworldIntegrityCacheKey", () => {
  it("hashes the world bytes and the engine source, and moves with the bytes", () => {
    const a = overworldIntegrityCacheKey('{"a":1}');
    const b = overworldIntegrityCacheKey('{"a":2}');
    expect(a.world).toMatch(/^[0-9a-f]{64}$/);
    expect(a.code).toMatch(/^[0-9a-f]{64}$/);
    expect(a.world).not.toBe(b.world);
    expect(a.code).toBe(b.code);
    expect(overworldIntegrityCacheKey('{"a":1}')).toEqual(a);
  });
});

describe("loadOverworldManifest integrity cache", () => {
  it('writes nothing with integrityCache "off"', { timeout: 180_000 }, () => {
    const root = makeRoot(shippedWorldText());
    loadOverworldManifest(root, { integrityCache: "off" });
    expect(existsSync(join(root, "ai-runs", "world-integrity"))).toBe(false);
  });

  it(
    'records the verdict for exactly these bytes with integrityCache "refresh"',
    { timeout: 180_000 },
    () => {
      const text = shippedWorldText();
      const root = makeRoot(text);
      loadOverworldManifest(root, { integrityCache: "refresh" });
      const key = overworldIntegrityCacheKey(text);
      const marker = overworldIntegrityMarkerPath(root, key);
      expect(marker).not.toBeNull();
      const stored = JSON.parse(readFileSync(marker!, "utf8")) as Record<string, unknown>;
      expect(stored.world_sha256).toBe(key.world);
      expect(stored.code_sha256).toBe(key.code);
    },
  );

  it(
    'skips the integrity proof when a marker for these exact bytes exists ("use")',
    { timeout: 180_000 },
    () => {
      const text = integrityBrokenWorldText();
      const key = overworldIntegrityCacheKey(text);
      const root = makeRoot(text);
      const marker = overworldIntegrityMarkerPath(root, key)!;
      mkdirSync(dirname(marker), { recursive: true });
      writeFileSync(
        marker,
        JSON.stringify({ world_sha256: key.world, code_sha256: key.code }),
        "utf8",
      );
      // The broken world loads only because the marker vouches for these bytes.
      expect(() => loadOverworldManifest(root, { integrityCache: "use" })).not.toThrow();
    },
  );

  it(
    'never trusts a marker with "refresh" or "off", and a marker for other bytes is a miss',
    { timeout: 180_000 },
    () => {
      const text = integrityBrokenWorldText();
      const key = overworldIntegrityCacheKey(text);
      for (const mode of ["refresh", "off"] as const) {
        const root = makeRoot(text);
        const marker = overworldIntegrityMarkerPath(root, key)!;
        mkdirSync(dirname(marker), { recursive: true });
        writeFileSync(
          marker,
          JSON.stringify({ world_sha256: key.world, code_sha256: key.code }),
          "utf8",
        );
        expect(() => loadOverworldManifest(root, { integrityCache: mode })).toThrow(
          /missing to node/,
        );
      }
      const root = makeRoot(text);
      const stale = overworldIntegrityMarkerPath(root, key)!;
      mkdirSync(dirname(stale), { recursive: true });
      writeFileSync(
        stale,
        JSON.stringify({ world_sha256: "0".repeat(64), code_sha256: key.code }),
        "utf8",
      );
      expect(() => loadOverworldManifest(root, { integrityCache: "use" })).toThrow(
        /missing to node/,
      );
    },
  );
});
