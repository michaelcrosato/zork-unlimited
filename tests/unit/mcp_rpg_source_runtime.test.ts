import { describe, expect, it } from "vitest";

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
});
