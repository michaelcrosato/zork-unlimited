import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  RPG_SOURCE_RUNTIME_CACHE_LIMIT,
  RpgSourceRuntime,
} from "../../src/mcp/rpg_source_runtime.js";

const ROOT = process.cwd();
const PACK_PATHS = [
  "content/rpg/pack/advocates_case.yaml",
  "content/rpg/pack/bellfounders_alarm.yaml",
  "content/rpg/pack/breaking_weir.yaml",
  "content/rpg/pack/bridgewrights_proof.yaml",
  "content/rpg/pack/cold_forge.yaml",
  "content/rpg/pack/dawn_beacon.yaml",
  "content/rpg/pack/factors_mark.yaml",
  "content/rpg/pack/falconers_ransom.yaml",
  "content/rpg/pack/gallowmere.yaml",
] as const;

function withTempRoot(run: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "rpg-source-cache-"));
  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function waitForTimestampTick(): void {
  const start = Date.now();
  while (Date.now() - start < 20) {
    // Busy wait keeps this test dependency-free and below filesystem timestamp granularity.
  }
}

describe("RpgSourceRuntime caches", () => {
  it("bounds generated RPG cache entries while preserving recent seed reuse", () => {
    const runtime = new RpgSourceRuntime(ROOT);
    const entries = Array.from({ length: RPG_SOURCE_RUNTIME_CACHE_LIMIT }, (_, seed) =>
      runtime.generatedRpg(seed),
    );

    const refreshedFirst = runtime.generatedRpg(0);
    const added = runtime.generatedRpg(RPG_SOURCE_RUNTIME_CACHE_LIMIT);
    const retainedFirst = runtime.generatedRpg(0);
    const evictedSecond = runtime.generatedRpg(1);

    expect(refreshedFirst).toBe(entries[0]);
    expect(added).not.toBe(entries[RPG_SOURCE_RUNTIME_CACHE_LIMIT - 1]);
    expect(retainedFirst).toBe(entries[0]);
    expect(evictedSecond).not.toBe(entries[1]);
  });

  it("bounds file-backed pack load reports while preserving recent path reuse", () => {
    expect(PACK_PATHS.length).toBeGreaterThan(RPG_SOURCE_RUNTIME_CACHE_LIMIT);
    const runtime = new RpgSourceRuntime(ROOT);
    const loaded = PACK_PATHS.slice(0, RPG_SOURCE_RUNTIME_CACHE_LIMIT).map((path) =>
      runtime.loadAndReport(path),
    );

    const refreshedFirst = runtime.loadAndReport(PACK_PATHS[0]);
    const added = runtime.loadAndReport(PACK_PATHS[RPG_SOURCE_RUNTIME_CACHE_LIMIT]);
    const retainedFirst = runtime.loadAndReport(PACK_PATHS[0]);
    const evictedSecond = runtime.loadAndReport(PACK_PATHS[1]);

    expect(refreshedFirst).toBe(loaded[0]);
    expect(added).not.toBe(loaded[RPG_SOURCE_RUNTIME_CACHE_LIMIT - 1]);
    expect(retainedFirst).toBe(loaded[0]);
    expect(evictedSecond).not.toBe(loaded[1]);
  });

  it("invalidates file-backed reports after same-size rewrites with restored mtime", () => {
    withTempRoot((root) => {
      mkdirSync(join(root, "packs"), { recursive: true });
      const packPath = join(root, "packs", "same-size.yaml");
      const packSource = "not: rpg\n";
      const fixedTime = new Date("2026-01-01T00:00:00.000Z");
      writeFileSync(packPath, packSource, "utf8");
      utimesSync(packPath, fixedTime, fixedTime);

      const runtime = new RpgSourceRuntime(root);
      const first = runtime.loadAndReport("packs/same-size.yaml");
      const firstStat = statSync(packPath);
      waitForTimestampTick();
      writeFileSync(packPath, packSource, "utf8");
      utimesSync(packPath, fixedTime, fixedTime);
      const secondStat = statSync(packPath);
      const second = runtime.loadAndReport("packs/same-size.yaml");

      expect(secondStat.size).toBe(firstStat.size);
      expect(secondStat.mtimeMs).toBe(firstStat.mtimeMs);
      expect(secondStat.ctimeMs).not.toBe(firstStat.ctimeMs);
      expect(second).not.toBe(first);
      expect(second).toEqual(first);
    });
  });
});
