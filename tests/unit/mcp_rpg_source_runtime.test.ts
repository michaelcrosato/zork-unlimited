import { describe, expect, it } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  RPG_SOURCE_RUNTIME_CACHE_LIMIT,
  RpgSourceRuntime,
} from "../../src/mcp/rpg_source_runtime.js";

const ROOT = process.cwd();
const WORLD_QUEST_IDS = [
  "advocates_case",
  "bellfounders_alarm",
  "breaking_weir",
  "bridgewrights_proof",
  "cold_forge",
  "dawn_beacon",
  "factors_mark",
  "falconers_ransom",
  "gallowmere",
] as const;
const TEMP_WORLD_QUEST_ID = "same_size";
const TEMP_PACK_SOURCE = "not: rpg\n";
const TEMP_WORLD_MANIFEST = `id: charter_marches
name: The Charter Marches
hub: Charterhaven
graph:
  hub: hub
  nodes:
    - id: hub
      name: Hub
      kind: hub
    - id: ${TEMP_WORLD_QUEST_ID}
      name: Same Size
      kind: quest
      source: content/rpg/quests/${TEMP_WORLD_QUEST_ID}.yaml
  edges:
    - from: hub
      to: ${TEMP_WORLD_QUEST_ID}
      route: test road
`;

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

function writeTempWorldQuest(root: string, packSource = TEMP_PACK_SOURCE): string {
  mkdirSync(join(root, "content", "world"), { recursive: true });
  mkdirSync(join(root, "content", "rpg", "quests"), { recursive: true });
  const sourcePath = join(root, "content", "rpg", "quests", `${TEMP_WORLD_QUEST_ID}.yaml`);
  writeFileSync(join(root, "content", "world", "charter_marches.yaml"), TEMP_WORLD_MANIFEST);
  writeFileSync(sourcePath, packSource, "utf8");
  return sourcePath;
}

describe("RpgSourceRuntime caches", () => {
  it("discovers world quest catalog entries by graph ids instead of reverse pack lookup", () => {
    const runtime = new RpgSourceRuntime(ROOT);
    const sources = runtime.discoverWorldQuestSources();

    expect(sources).toHaveLength(16);
    expect(sources.every((source) => typeof source.world_quest_id === "string")).toBe(true);
    expect(sources.map((source) => source.world_quest_id)).toContain("sunken_barrow");

    const runtimeSource = readFileSync("src/mcp/rpg_source_runtime.ts", "utf8");
    const worldSource = readFileSync("src/world/source.ts", "utf8");
    const testSource = readFileSync("tests/unit/mcp_rpg_source_runtime.test.ts", "utf8");
    expect(runtimeSource).toContain("loadWorldQuestReport(worldQuestId, world)");
    expect(runtimeSource).toContain("private loadSourceBackedReport(sourcePath: string)");
    expect(runtimeSource).toContain("private requireSourceBackedPlayable(sourcePath: string)");
    expect(runtimeSource).not.toContain("worldQuestNodeForPack");
    expect(runtimeSource).not.toContain("worldQuestPackPaths");
    expect(runtimeSource).not.toContain('kind: "pack"');
    expect(worldSource).not.toContain('kind: "pack"');
    expect(worldSource).not.toContain("GamePackSource");
    expect(worldSource).not.toContain("resolvePackSource");
    expect(worldSource).not.toContain("resolveTracePackSource");
    expect(worldSource).not.toContain("WorldQuestPackSource");
    expect(worldSource).not.toContain("resolveWorldQuestPackPath");
    expect(runtimeSource).not.toContain("WorldQuestPackSource");
    expect(runtimeSource).not.toContain("resolveWorldQuestPackPath");
    for (const retiredMethod of ["loadAndReport", "requirePlayable"]) {
      expect(testSource).not.toContain(`.${retiredMethod}(`);
    }
  });

  it("loads world quests by canonical id without returning raw pack paths", () => {
    const runtime = new RpgSourceRuntime(ROOT);
    const source = runtime.requireWorldQuestPlayable("sunken_barrow");

    expect(source.node.id).toBe("sunken_barrow");
    expect(source.compiled.pack.meta.title).toBe("The Sunken Barrow");
    expect("packPath" in source).toBe(false);
  });

  it("loads world quest reports by canonical id without returning raw pack paths", () => {
    const runtime = new RpgSourceRuntime(ROOT);
    const source = runtime.loadWorldQuestReport("sunken_barrow");

    expect(source.node.id).toBe("sunken_barrow");
    expect(source.result.ok).toBe(true);
    expect(source.result.report.ok).toBe(true);
    expect("packPath" in source).toBe(false);
  });

  it("reports a source that vanishes AFTER the manifest coverage check as not-ok — no raw fs error, no absolute path (bug_0493)", () => {
    withTempRoot((root) => {
      // A source missing at manifest-load time is already rejected cleanly by
      // assertWorldQuestSourceCoverage. The remaining hole is the gap AFTER that
      // check: a file deleted mid-session (or unreadable on open) used to escape
      // as Node's raw fs error carrying the resolved ABSOLUTE path — which no
      // MCP client may see — and broke every catalog caller. Model the race by
      // loading the manifest green, then deleting the source out from under it.
      const sourcePath = writeTempWorldQuest(root);
      const runtime = new RpgSourceRuntime(root);
      const world = runtime.loadWorldManifest();
      rmSync(sourcePath);

      // The catalog stays intact: the broken row reports unplayable.
      const sources = runtime.discoverWorldQuestSources(world);
      expect(
        sources.some((source) => source.world_quest_id === TEMP_WORLD_QUEST_ID && !source.playable),
      ).toBe(true);

      const report = runtime.loadWorldQuestReport(TEMP_WORLD_QUEST_ID, world);
      expect(report.result.ok).toBe(false);
      expect(report.result.report.findings.some((f) => f.code === "SOURCE_UNREADABLE")).toBe(true);
      const text = JSON.stringify(report.result);
      expect(text).toContain(`content/rpg/quests/${TEMP_WORLD_QUEST_ID}.yaml`);
      expect(text).not.toContain("ENOENT");
      expect(text).not.toContain(JSON.stringify(root).slice(1, -1));
    });
  });

  it("loads trace sources by embedded world id without returning raw pack paths", () => {
    const runtime = new RpgSourceRuntime(ROOT);
    const trace = JSON.parse(readFileSync("traces/rpg/barrow_victory.json", "utf8"));
    const source = runtime.resolveTraceSource({}, trace, "test");

    expect(source.kind).toBe("worldQuest");
    expect(source.worldQuestId).toBe("sunken_barrow");
    expect(source.compiled.pack.meta.title).toBe("The Sunken Barrow");
    expect("packPath" in source).toBe(false);
  });

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

  it("bounds file-backed quest load reports while preserving recent id reuse", () => {
    expect(WORLD_QUEST_IDS.length).toBeGreaterThan(RPG_SOURCE_RUNTIME_CACHE_LIMIT);
    const runtime = new RpgSourceRuntime(ROOT);
    const loaded = WORLD_QUEST_IDS.slice(0, RPG_SOURCE_RUNTIME_CACHE_LIMIT).map(
      (questId) => runtime.loadWorldQuestReport(questId).result,
    );

    const refreshedFirst = runtime.loadWorldQuestReport(WORLD_QUEST_IDS[0]).result;
    const added = runtime.loadWorldQuestReport(
      WORLD_QUEST_IDS[RPG_SOURCE_RUNTIME_CACHE_LIMIT],
    ).result;
    const retainedFirst = runtime.loadWorldQuestReport(WORLD_QUEST_IDS[0]).result;
    const evictedSecond = runtime.loadWorldQuestReport(WORLD_QUEST_IDS[1]).result;

    expect(refreshedFirst).toBe(loaded[0]);
    expect(added).not.toBe(loaded[RPG_SOURCE_RUNTIME_CACHE_LIMIT - 1]);
    expect(retainedFirst).toBe(loaded[0]);
    expect(evictedSecond).not.toBe(loaded[1]);
  });

  it("invalidates file-backed reports after same-size rewrites with restored mtime", () => {
    withTempRoot((root) => {
      const sourcePath = writeTempWorldQuest(root);
      const fixedTime = new Date("2026-01-01T00:00:00.000Z");
      utimesSync(sourcePath, fixedTime, fixedTime);

      const runtime = new RpgSourceRuntime(root);
      const first = runtime.loadWorldQuestReport(TEMP_WORLD_QUEST_ID).result;
      const firstStat = statSync(sourcePath);
      waitForTimestampTick();
      writeFileSync(sourcePath, TEMP_PACK_SOURCE, "utf8");
      utimesSync(sourcePath, fixedTime, fixedTime);
      const secondStat = statSync(sourcePath);
      const second = runtime.loadWorldQuestReport(TEMP_WORLD_QUEST_ID).result;

      expect(secondStat.size).toBe(firstStat.size);
      expect(secondStat.mtimeMs).toBe(firstStat.mtimeMs);
      expect(secondStat.ctimeMs).not.toBe(firstStat.ctimeMs);
      expect(second).not.toBe(first);
      expect(second).toEqual(first);
    });
  });
});
