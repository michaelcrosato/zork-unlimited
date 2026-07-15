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
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { hashState } from "../../src/core/hash.js";
import {
  RPG_SOURCE_RUNTIME_CACHE_LIMIT,
  RpgSourceRuntime,
} from "../../src/mcp/rpg_source_runtime.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const ROOT = process.cwd();
const WORLD_QUEST_IDS = [
  "advocates_case",
  "breaking_weir",
  "cold_forge",
  "dawn_beacon",
  "factors_mark",
  "falconers_ransom",
  "gallowmere",
  "printers_night",
  "sunken_barrow",
  "tanners_fever",
  "tide_mill",
  "wolf_winter",
] as const;
const TEMP_WORLD_QUEST_ID = "same_size";
const TEMP_PACK_SOURCE = "not: rpg\n";
const VALID_PACK_SOURCE = readFileSync(
  join(ROOT, "content", "rpg", "quests", "sunken_barrow.yaml"),
  "utf8",
);
const MULTI_VICTORY_PACK_SOURCE = readFileSync(
  join(ROOT, "content", "rpg", "quests", "wolf_winter.yaml"),
  "utf8",
);
const TEST_CAMPAIGN_EFFECTS = [
  { type: "set_world_fact", fact_id: "fact:test_campaign_export" },
] as const;

// The overworld is the single quest registry. A temp root reuses the real,
// integrity-passing overworld manifest but swaps its quest list for one temp quest,
// so the shipped-source bijection (assertOverworldQuestSourceCoverage) holds with
// exactly the temp pack on disk. The temp quest is anchored to a real Albany area.
type FixtureOverworld = Record<string, unknown> & {
  characters: Array<{ variants?: unknown }>;
  opening_ally?: unknown;
  opening_lead_source?: unknown;
  opening_preparation?: unknown;
  opening_relief_allocation?: unknown;
  opening_registration?: unknown;
};

const REAL_OVERWORLD = JSON.parse(
  readFileSync(join(ROOT, "content", "world", "new_york_overworld.json"), "utf8"),
) as FixtureOverworld;

function fixtureOverworldWithoutQuestConditionedFeatures(): FixtureOverworld {
  const world = structuredClone(REAL_OVERWORLD);
  for (const character of world.characters) delete character.variants;
  delete world.campaign_service_rules;
  delete world.opening_ally;
  delete world.opening_lead_source;
  delete world.opening_preparation;
  delete world.opening_relief_allocation;
  delete world.opening_registration;
  return world;
}

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

function writeTempWorldQuest(
  root: string,
  packSource = TEMP_PACK_SOURCE,
  campaignExports?: unknown,
  campaignImports?: unknown,
): string {
  mkdirSync(join(root, "content", "world"), { recursive: true });
  mkdirSync(join(root, "content", "rpg", "quests"), { recursive: true });
  const sourcePath = join(root, "content", "rpg", "quests", `${TEMP_WORLD_QUEST_ID}.yaml`);
  const quest: Record<string, unknown> = {
    id: TEMP_WORLD_QUEST_ID,
    title: "Same Size",
    source: `content/rpg/quests/${TEMP_WORLD_QUEST_ID}.yaml`,
    home: "albany_city",
    area: "albany_city__transport_hub",
    discovery: "Ask around Albany city for the Same Size lead.",
    visibility: "local_notice_board",
  };
  if (campaignExports !== undefined) quest.campaign_exports = campaignExports;
  if (campaignImports !== undefined) quest.campaign_imports = campaignImports;
  const overworld = {
    ...fixtureOverworldWithoutQuestConditionedFeatures(),
    quests: [quest],
  };
  writeFileSync(
    join(root, "content", "world", "new_york_overworld.json"),
    JSON.stringify(overworld),
  );
  writeFileSync(sourcePath, packSource, "utf8");
  return sourcePath;
}

describe("RpgSourceRuntime caches", () => {
  it("discovers quest catalog entries from the overworld quest registry", () => {
    const runtime = new RpgSourceRuntime(ROOT);
    const sources = runtime.discoverWorldQuestSources();

    expect(sources).toHaveLength(12);
    expect(sources.every((source) => typeof source.world_quest_id === "string")).toBe(true);
    expect(sources.map((source) => source.world_quest_id)).toContain("sunken_barrow");

    const runtimeSource = readFileSync("src/mcp/rpg_source_runtime.ts", "utf8");
    const worldSource = readFileSync("src/world/source.ts", "utf8");
    const testSource = readFileSync("tests/unit/mcp_rpg_source_runtime.test.ts", "utf8");
    expect(runtimeSource).toContain("overworldQuestById(overworld, worldQuestId)");
    expect(runtimeSource).toContain("loadWorldQuestReport(worldQuestId: string)");
    expect(runtimeSource).toContain("private loadSourceBackedReport(sourcePath: string)");
    expect(runtimeSource).toContain("private requireWorldQuestSourcePlayable(");
    expect(runtimeSource).not.toContain("worldQuestNodeForPack");
    expect(runtimeSource).not.toContain("worldQuestPackPaths");
    expect(runtimeSource).not.toContain("loadWorldManifest");
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

  it("loads world quests by overworld id without returning raw pack paths", () => {
    const runtime = new RpgSourceRuntime(ROOT);
    const source = runtime.requireWorldQuestPlayable("sunken_barrow");

    expect(source.questId).toBe("sunken_barrow");
    expect(source.compiled.pack.meta.title).toBe("The Sunken Barrow");
    expect("packPath" in source).toBe(false);
  });

  it("loads world quest reports by overworld id without returning raw pack paths", () => {
    const runtime = new RpgSourceRuntime(ROOT);
    const source = runtime.loadWorldQuestReport("sunken_barrow");

    expect(source.questId).toBe("sunken_barrow");
    expect(source.result.ok).toBe(true);
    expect(source.result.report.ok).toBe(true);
    expect("packPath" in source).toBe(false);
  });

  it("validates Wolf-Winter's declared campaign exports against compiled non-death endings", () => {
    const runtime = new RpgSourceRuntime(ROOT);
    const source = runtime.loadWorldQuestReport("wolf_winter");

    expect(source.result.ok).toBe(true);
    expect(source.result.report.ok).toBe(true);
    expect(
      source.result.report.findings.filter((finding) =>
        finding.code.startsWith("CAMPAIGN_EXPORT_"),
      ),
    ).toEqual([]);
    expect(() => runtime.requireWorldQuestPlayable("wolf_winter")).not.toThrow();
  });

  it("returns Wolf-Winter's detached, frozen, canonically hashed campaign-import catalog", () => {
    const runtime = new RpgSourceRuntime(ROOT);
    const source = runtime.requireWorldQuestPlayable("wolf_winter");
    const manifestCatalog = loadOverworldManifest(ROOT).quests.find(
      (quest) => quest.id === "wolf_winter",
    )!.campaign_imports;

    expect(source.campaignImports).toEqual(manifestCatalog);
    expect(source.campaignImports).not.toBe(manifestCatalog);
    expect(source.campaignImportsHash).toBe(hashState(source.campaignImports));
    expect(Object.isFrozen(source.campaignImports)).toBe(true);
    expect(Object.isFrozen(source.campaignImports?.rules)).toBe(true);
    expect(Object.isFrozen(source.campaignImports?.rules[0])).toBe(true);
    expect(
      runtime
        .loadWorldQuestReport("wolf_winter")
        .result.report.findings.filter((finding) => finding.code.startsWith("CAMPAIGN_IMPORT_")),
    ).toEqual([]);
  });

  it("keeps campaign imports and their hashes absent for legacy quest catalogs", () => {
    const source = new RpgSourceRuntime(ROOT).requireWorldQuestPlayable("sunken_barrow");

    expect(source.campaignImports).toBeUndefined();
    expect(source.campaignImportsHash).toBeUndefined();
    expect("campaignImports" in source).toBe(false);
    expect("campaignImportsHash" in source).toBe(false);
  });

  it("treats imported flags as external setters for optional authored routes", () => {
    withTempRoot((root) => {
      const raw = parseYaml(VALID_PACK_SOURCE) as {
        rooms: Array<{
          id: string;
          exits: Array<{ direction: string; conditions?: unknown[] }>;
        }>;
      };
      const entryHall = raw.rooms.find((room) => room.id === "entry_hall");
      const west = entryHall?.exits.find((exit) => exit.direction === "west");
      if (!west) throw new Error("Sunken Barrow fixture is missing its optional west route.");
      west.conditions = [{ has_flag: "imported_scout_route" }];
      writeTempWorldQuest(root, stringifyYaml(raw), undefined, {
        version: 1,
        rules: [
          {
            id: "import:test_scout_route",
            type: "background_to_flag",
            background_id: "background:scout",
            target_flag: "imported_scout_route",
          },
        ],
      });

      const source = new RpgSourceRuntime(root).loadWorldQuestReport(TEMP_WORLD_QUEST_ID);
      expect(source.result.ok).toBe(true);
      expect(source.result.report.ok).toBe(true);
      expect(
        source.result.report.findings.some((finding) => finding.code === "IMPOSSIBLE_GATE"),
      ).toBe(false);
    });
  });

  it("treats an explicit equipment target as an import-only inventory spawn", () => {
    withTempRoot((root) => {
      const raw = parseYaml(VALID_PACK_SOURCE) as {
        rooms: Array<{
          id: string;
          exits: Array<{ direction: string; conditions?: unknown[] }>;
        }>;
        objects: Array<Record<string, unknown>>;
      };
      raw.objects.push({
        id: "imported_field_kit",
        name: "imported field kit",
        description: "A campaign-issued kit represented by this quest-local object.",
        takeable: true,
      });
      const entryHall = raw.rooms.find((room) => room.id === "entry_hall");
      const west = entryHall?.exits.find((exit) => exit.direction === "west");
      if (!west) throw new Error("Sunken Barrow fixture is missing its optional west route.");
      west.conditions = [{ has_item: "imported_field_kit" }];
      writeTempWorldQuest(root, stringifyYaml(raw), undefined, {
        version: 1,
        rules: [
          {
            id: "import:test_field_kit",
            type: "equipment_to_item",
            item_id: "item:field_kit",
            target_object: "imported_field_kit",
          },
        ],
      });

      const source = new RpgSourceRuntime(root).loadWorldQuestReport(TEMP_WORLD_QUEST_ID);
      expect(source.result.ok).toBe(true);
      expect(source.result.report.ok).toBe(true);
      expect(
        source.result.report.findings.some((finding) =>
          ["ITEM_REQUIRED_UNOBTAINABLE", "ITEM_UNPLACED"].includes(finding.code),
        ),
      ).toBe(false);
    });
  });

  it("rejects a catalog when every victory requires imported state", () => {
    withTempRoot((root) => {
      const raw = parseYaml(VALID_PACK_SOURCE) as {
        objects: Array<Record<string, unknown>>;
        win_conditions: Array<{ conditions: unknown[] }>;
      };
      raw.objects.push({
        id: "import_only_key",
        name: "import-only key",
        description: "A quest-local key projected only from campaign equipment.",
        takeable: true,
      });
      for (const win of raw.win_conditions) {
        win.conditions.push({ has_item: "import_only_key" });
      }
      writeTempWorldQuest(root, stringifyYaml(raw), undefined, {
        version: 1,
        rules: [
          {
            id: "import:test_only_key",
            type: "equipment_to_item",
            item_id: "item:only_key",
            target_object: "import_only_key",
          },
        ],
      });

      const runtime = new RpgSourceRuntime(root);
      const source = runtime.loadWorldQuestReport(TEMP_WORLD_QUEST_ID);
      expect(source.result.ok).toBe(true);
      expect(source.result.report.ok).toBe(false);
      expect(source.result.report.findings).toContainEqual(
        expect.objectContaining({
          severity: "error",
          code: "CAMPAIGN_IMPORT_DIRECT_START_UNWINNABLE",
        }),
      );
      expect(() => runtime.requireWorldQuestPlayable(TEMP_WORLD_QUEST_ID)).toThrow(
        /every win condition directly requires a campaign import target/i,
      );
    });
  });

  it("rejects a skill import used as a direct numeric win predicate", () => {
    withTempRoot((root) => {
      const raw = parseYaml(VALID_PACK_SOURCE) as {
        meta: { vars_init: Record<string, number> };
        win_conditions: Array<{ conditions: unknown[] }>;
      };
      raw.meta.vars_init.imported_lore = 0;
      for (const win of raw.win_conditions) {
        win.conditions.push({ var_gte: { name: "imported_lore", value: 2 } });
      }
      writeTempWorldQuest(root, stringifyYaml(raw), undefined, {
        version: 1,
        rules: [
          {
            id: "import:test_lore",
            type: "skill_rank_to_var",
            skill_id: "skill:lore",
            target_var: "imported_lore",
          },
        ],
      });

      const source = new RpgSourceRuntime(root).loadWorldQuestReport(TEMP_WORLD_QUEST_ID);
      expect(source.result.ok).toBe(true);
      expect(source.result.report.ok).toBe(false);
      expect(source.result.report.findings).toContainEqual(
        expect.objectContaining({ code: "CAMPAIGN_IMPORT_DIRECT_START_UNWINNABLE" }),
      );
    });
  });

  it("rejects health imports that would invalidate a combat guarantee", () => {
    withTempRoot((root) => {
      writeTempWorldQuest(root, MULTI_VICTORY_PACK_SOURCE, undefined, {
        version: 1,
        rules: [
          {
            id: "import:test_guaranteed_health",
            type: "health_current_to_var",
            target_var: "hp",
          },
        ],
      });

      const runtime = new RpgSourceRuntime(root);
      const source = runtime.loadWorldQuestReport(TEMP_WORLD_QUEST_ID);
      expect(source.result.ok).toBe(true);
      expect(source.result.report.ok).toBe(false);
      expect(source.result.report.findings).toContainEqual(
        expect.objectContaining({
          severity: "error",
          code: "CAMPAIGN_IMPORT_COMBAT_GUARANTEE_CONFLICT",
        }),
      );
      expect(() => runtime.requireWorldQuestPlayable(TEMP_WORLD_QUEST_ID)).toThrow(
        /health_current_to_var cannot target a combat_guaranteed quest/i,
      );
    });
  });

  it("allows an imported skill in an optional any-of win branch", () => {
    withTempRoot((root) => {
      const raw = parseYaml(VALID_PACK_SOURCE) as {
        meta: { vars_init: Record<string, number> };
        win_conditions: Array<{ conditions: unknown[] }>;
      };
      raw.meta.vars_init.imported_lore = 0;
      for (const win of raw.win_conditions) {
        win.conditions.push({
          any_of: [{ var_gte: { name: "imported_lore", value: 2 } }, { has_item: "circlet" }],
        });
      }
      writeTempWorldQuest(root, stringifyYaml(raw), undefined, {
        version: 1,
        rules: [
          {
            id: "import:test_optional_lore",
            type: "skill_rank_to_var",
            skill_id: "skill:lore",
            target_var: "imported_lore",
          },
        ],
      });

      const source = new RpgSourceRuntime(root).loadWorldQuestReport(TEMP_WORLD_QUEST_ID);
      expect(source.result.ok).toBe(true);
      expect(source.result.report.ok).toBe(true);
      expect(
        source.result.report.findings.some(
          (finding) => finding.code === "CAMPAIGN_IMPORT_DIRECT_START_UNWINNABLE",
        ),
      ).toBe(false);
    });
  });

  it("rejects an any-of win when every branch requires imported state", () => {
    withTempRoot((root) => {
      const raw = parseYaml(VALID_PACK_SOURCE) as {
        meta: { vars_init: Record<string, number> };
        objects: Array<Record<string, unknown>>;
        win_conditions: Array<{ conditions: unknown[] }>;
      };
      raw.meta.vars_init.imported_lore = 0;
      raw.objects.push({
        id: "imported_route_kit",
        name: "imported route kit",
        description: "A quest-local representation of campaign equipment.",
        takeable: true,
      });
      for (const win of raw.win_conditions) {
        win.conditions.push({
          any_of: [
            { var_gte: { name: "imported_lore", value: 2 } },
            { has_item: "imported_route_kit" },
          ],
        });
      }
      writeTempWorldQuest(root, stringifyYaml(raw), undefined, {
        version: 1,
        rules: [
          {
            id: "import:test_any_lore",
            type: "skill_rank_to_var",
            skill_id: "skill:lore",
            target_var: "imported_lore",
          },
          {
            id: "import:test_any_kit",
            type: "equipment_to_item",
            item_id: "item:route_kit",
            target_object: "imported_route_kit",
          },
        ],
      });

      const source = new RpgSourceRuntime(root).loadWorldQuestReport(TEMP_WORLD_QUEST_ID);
      expect(source.result.ok).toBe(true);
      expect(source.result.report.ok).toBe(false);
      expect(source.result.report.findings).toContainEqual(
        expect.objectContaining({ code: "CAMPAIGN_IMPORT_DIRECT_START_UNWINNABLE" }),
      );
    });
  });

  it("uses the actual default on-enter state for numeric win independence", () => {
    withTempRoot((root) => {
      const raw = parseYaml(VALID_PACK_SOURCE) as {
        meta: { start_room: string; vars_init: Record<string, number> };
        rooms: Array<{ id: string; on_enter?: unknown[] }>;
        win_conditions: Array<{ conditions: unknown[] }>;
      };
      raw.meta.vars_init.imported_lore = 3;
      const start = raw.rooms.find((room) => room.id === raw.meta.start_room);
      if (!start) throw new Error("Sunken Barrow fixture is missing its start room.");
      start.on_enter = [...(start.on_enter ?? []), { dec_var: { name: "imported_lore", by: 10 } }];
      for (const win of raw.win_conditions) {
        win.conditions.push({ var_lte: { name: "imported_lore", value: 1 } });
      }
      writeTempWorldQuest(root, stringifyYaml(raw), undefined, {
        version: 1,
        rules: [
          {
            id: "import:test_decremented_lore",
            type: "skill_rank_to_var",
            skill_id: "skill:lore",
            target_var: "imported_lore",
          },
        ],
      });

      const source = new RpgSourceRuntime(root).loadWorldQuestReport(TEMP_WORLD_QUEST_ID);
      expect(source.result.ok).toBe(true);
      expect(source.result.report.ok).toBe(true);
    });
  });

  it("does not use raw vars_init when on-enter falsifies a default numeric win", () => {
    withTempRoot((root) => {
      const raw = parseYaml(VALID_PACK_SOURCE) as {
        meta: { start_room: string; vars_init: Record<string, number> };
        rooms: Array<{ id: string; on_enter?: unknown[] }>;
        win_conditions: Array<{ conditions: unknown[] }>;
      };
      raw.meta.vars_init.imported_lore = 0;
      const start = raw.rooms.find((room) => room.id === raw.meta.start_room);
      if (!start) throw new Error("Sunken Barrow fixture is missing its start room.");
      start.on_enter = [...(start.on_enter ?? []), { inc_var: { name: "imported_lore", by: 10 } }];
      for (const win of raw.win_conditions) {
        win.conditions.push({ var_lte: { name: "imported_lore", value: 1 } });
      }
      writeTempWorldQuest(root, stringifyYaml(raw), undefined, {
        version: 1,
        rules: [
          {
            id: "import:test_on_enter_lore",
            type: "skill_rank_to_var",
            skill_id: "skill:lore",
            target_var: "imported_lore",
          },
        ],
      });

      const source = new RpgSourceRuntime(root).loadWorldQuestReport(TEMP_WORLD_QUEST_ID);
      expect(source.result.ok).toBe(true);
      expect(source.result.report.ok).toBe(false);
      expect(source.result.report.findings).toContainEqual(
        expect.objectContaining({ code: "CAMPAIGN_IMPORT_DIRECT_START_UNWINNABLE" }),
      );
    });
  });

  it.each([
    {
      label: "unknown variable",
      rule: {
        id: "import:test_unknown_var",
        type: "skill_rank_to_var",
        skill_id: "skill:test",
        target_var: "missing_var",
      },
      code: "CAMPAIGN_IMPORT_UNKNOWN_VAR",
    },
    {
      label: "non-hp health variable",
      rule: {
        id: "import:test_invalid_health_var",
        type: "health_current_to_var",
        target_var: "defense",
      },
      code: "CAMPAIGN_IMPORT_INVALID_HEALTH_TARGET",
    },
    {
      label: "reserved skill variable",
      rule: {
        id: "import:test_invalid_skill_var",
        type: "skill_rank_to_var",
        skill_id: "skill:test",
        target_var: "hp",
      },
      code: "CAMPAIGN_IMPORT_INVALID_SKILL_TARGET",
    },
    {
      label: "unknown flag",
      rule: {
        id: "import:test_unknown_flag",
        type: "background_to_flag",
        background_id: "background:test",
        target_flag: "missing_flag",
      },
      code: "CAMPAIGN_IMPORT_UNKNOWN_FLAG",
    },
    {
      label: "unknown object",
      rule: {
        id: "import:test_unknown_object",
        type: "equipment_to_item",
        item_id: "item:test",
        target_object: "missing_object",
      },
      code: "CAMPAIGN_IMPORT_UNKNOWN_OBJECT",
    },
    {
      label: "non-inventory object",
      rule: {
        id: "import:test_non_inventory_object",
        type: "equipment_to_item",
        item_id: "item:test",
        target_object: "stone_slab",
      },
      code: "CAMPAIGN_IMPORT_INVALID_INVENTORY_TARGET",
    },
  ])("rejects a campaign import with an $label target", ({ rule, code }) => {
    withTempRoot((root) => {
      writeTempWorldQuest(root, VALID_PACK_SOURCE, undefined, { version: 1, rules: [rule] });
      const runtime = new RpgSourceRuntime(root);
      const source = runtime.loadWorldQuestReport(TEMP_WORLD_QUEST_ID);

      expect(source.result.ok).toBe(true);
      expect(source.result.report.ok).toBe(false);
      expect(source.result.report.findings).toContainEqual(
        expect.objectContaining({ severity: "error", code }),
      );
      expect(() => runtime.requireWorldQuestPlayable(TEMP_WORLD_QUEST_ID)).toThrow(
        /campaign import rule/i,
      );
    });
  });

  it.each([
    {
      label: "missing ending",
      ending_id: "ending_missing",
      ending_title: "Missing Ending",
      code: "CAMPAIGN_EXPORT_ENDING_MISSING",
      message: /does not exist in the compiled RPG/i,
    },
    {
      label: "title mismatch",
      ending_id: "ending_victory",
      ending_title: "Not Lord of the Barrow",
      code: "CAMPAIGN_EXPORT_TITLE_MISMATCH",
      message: /does not exactly match compiled ending title/i,
    },
    {
      label: "death ending",
      ending_id: "ending_fallen",
      ending_title: "Another Niche Filled",
      code: "CAMPAIGN_EXPORT_DEATH_ENDING",
      message: /death ending and cannot grant persistent consequences/i,
    },
  ])("rejects a campaign export with a $label", ({ ending_id, ending_title, code, message }) => {
    withTempRoot((root) => {
      writeTempWorldQuest(root, VALID_PACK_SOURCE, [
        { ending_id, ending_title, effects: TEST_CAMPAIGN_EFFECTS },
      ]);
      const runtime = new RpgSourceRuntime(root);
      const source = runtime.loadWorldQuestReport(TEMP_WORLD_QUEST_ID);

      expect(source.result.ok).toBe(true);
      expect(source.result.report.ok).toBe(false);
      expect(source.result.report.findings).toContainEqual(
        expect.objectContaining({
          severity: "error",
          code,
          message: expect.stringMatching(message),
        }),
      );
      expect(() => runtime.requireWorldQuestPlayable(TEMP_WORLD_QUEST_ID)).toThrow(message);
    });
  });

  it("keeps campaign exports opt-in for legacy quest catalogs", () => {
    withTempRoot((root) => {
      writeTempWorldQuest(root, VALID_PACK_SOURCE);
      const source = new RpgSourceRuntime(root).loadWorldQuestReport(TEMP_WORLD_QUEST_ID);

      expect(source.result.ok).toBe(true);
      expect(source.result.report.ok).toBe(true);
      expect(
        source.result.report.findings.some((finding) =>
          finding.code.startsWith("CAMPAIGN_EXPORT_"),
        ),
      ).toBe(false);
    });
  });

  it("rejects an opted-in catalog that omits a compiled non-death ending", () => {
    withTempRoot((root) => {
      writeTempWorldQuest(root, MULTI_VICTORY_PACK_SOURCE, [
        {
          ending_id: "ending_held",
          ending_title: "The Byre Held",
          effects: TEST_CAMPAIGN_EFFECTS,
        },
      ]);
      const runtime = new RpgSourceRuntime(root);
      const source = runtime.loadWorldQuestReport(TEMP_WORLD_QUEST_ID);

      expect(source.result.ok).toBe(true);
      expect(source.result.report.ok).toBe(false);
      expect(source.result.report.findings).toContainEqual(
        expect.objectContaining({
          severity: "error",
          code: "CAMPAIGN_EXPORT_ENDING_UNDECLARED",
          message: expect.stringMatching(/non-death ending .* has no campaign export/i),
        }),
      );
      expect(() => runtime.requireWorldQuestPlayable(TEMP_WORLD_QUEST_ID)).toThrow(
        /non-death ending .* has no campaign export/i,
      );
    });
  });

  it("reports a source that vanishes AFTER the overworld coverage check as not-ok — no raw fs error, no absolute path (bug_0493)", () => {
    withTempRoot((root) => {
      // A source missing at manifest-load time is already rejected cleanly by
      // assertOverworldQuestSourceCoverage. The remaining hole is the gap AFTER
      // that check: a file deleted mid-session (or unreadable on open) used to
      // escape as Node's raw fs error carrying the resolved ABSOLUTE path — which
      // no MCP client may see — and broke every catalog caller. Model the race by
      // loading + caching the overworld green, then deleting the source under it.
      const sourcePath = writeTempWorldQuest(root);
      const runtime = new RpgSourceRuntime(root);
      runtime.shippedWorldQuestIds();
      rmSync(sourcePath);

      // The catalog stays intact: the broken row reports unplayable.
      const sources = runtime.discoverWorldQuestSources();
      expect(
        sources.some((source) => source.world_quest_id === TEMP_WORLD_QUEST_ID && !source.playable),
      ).toBe(true);

      const report = runtime.loadWorldQuestReport(TEMP_WORLD_QUEST_ID);
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

  it("carries a detached, frozen campaign-import catalog on world-quest trace sources", () => {
    const runtime = new RpgSourceRuntime(ROOT);
    const playable = runtime.requireWorldQuestPlayable("wolf_winter");
    const trace = JSON.parse(readFileSync("traces/rpg/barrow_victory.json", "utf8"));
    trace.source_ref = ["wq", "wolf_winter"];

    const source = runtime.resolveTraceSource({}, trace, "test");
    expect(source.kind).toBe("worldQuest");
    if (source.kind !== "worldQuest") throw new Error("Expected a world-quest trace source.");

    expect(source.campaignImports).toEqual(playable.campaignImports);
    expect(source.campaignImports).not.toBe(playable.campaignImports);
    expect(source.campaignImportsHash).toBe(hashState(source.campaignImports));
    expect(Object.isFrozen(source.campaignImports)).toBe(true);
    expect(Object.isFrozen(source.campaignImports?.rules)).toBe(true);
    expect(Object.isFrozen(source.campaignImports?.rules[0])).toBe(true);
  });

  it("keeps campaign-import catalog fields absent on generated trace sources", () => {
    const runtime = new RpgSourceRuntime(ROOT);
    const trace = JSON.parse(readFileSync("traces/rpg/barrow_victory.json", "utf8"));
    trace.source_ref = ["gen", 17];

    const source = runtime.resolveTraceSource({}, trace, "test");
    expect(source.kind).toBe("generated");
    expect(source.generateRpgSeed).toBe(17);
    expect("campaignImports" in source).toBe(false);
    expect("campaignImportsHash" in source).toBe(false);
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
