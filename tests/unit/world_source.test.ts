import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SaveIntegrityError } from "../../src/persist/save_load.js";
import {
  assertOverworldQuestSourceBindings,
  loadWorldManifest,
  resolveGameSource,
  resolvePackSource,
  resolveSavePackSource,
  resolveTracePackSource,
} from "../../src/world/source.js";
import { parseOverworldManifest } from "../../src/world/overworld.js";
import type { Trace } from "../../src/trace/record.js";
import type { RpgAction } from "../../src/api/types.js";

const ROOT = process.cwd();
const PACK = "content/rpg/pack/sunken_barrow.yaml";
const overworld = parseOverworldManifest(
  JSON.parse(readFileSync("content/world/new_york_overworld.json", "utf8")),
);

const trace = {
  mode: "rpg",
  worldQuestId: "sunken_barrow",
  trace_id: "tr_source_test",
  pack_id: "sunken_barrow_v1",
  content_hash: "unused",
  seed: 1,
  initial_state: {},
  actions: [],
  expected_final_hash: "unused",
} as unknown as Trace<RpgAction>;

describe("world source resolution", () => {
  it("binds New York overworld quests to canonical world graph quest sources", () => {
    const world = loadWorldManifest(ROOT);
    expect(() => assertOverworldQuestSourceBindings(world, overworld)).not.toThrow();

    expect(() =>
      assertOverworldQuestSourceBindings(world, {
        ...overworld,
        quests: [{ ...overworld.quests[0]!, id: "missing_quest" }],
      }),
    ).toThrow(/missing from the canonical world graph/);

    expect(() =>
      assertOverworldQuestSourceBindings(world, {
        ...overworld,
        quests: [{ ...overworld.quests[0]!, pack: "content/rpg/pack/cold_forge.yaml" }],
      }),
    ).toThrow(/does not match canonical world graph pack/);
  });

  it("resolves ordinary shipped pack sources by world quest id or compatibility pack path", () => {
    expect(resolvePackSource(ROOT, { world_quest_id: "sunken_barrow" }, "test")).toEqual({
      packPath: PACK,
      worldQuestId: "sunken_barrow",
    });
    expect(resolvePackSource(ROOT, { pack_path: PACK }, "test")).toEqual({
      packPath: PACK,
      worldQuestId: "sunken_barrow",
    });
  });

  it("resolves new-game sources, including generated in-memory packs", () => {
    expect(resolveGameSource(ROOT, { world_quest_id: "sunken_barrow" }, "new_game")).toEqual({
      kind: "pack",
      packPath: PACK,
      worldQuestId: "sunken_barrow",
      generateRpgSeed: null,
    });
    expect(resolveGameSource(ROOT, { generate_rpg_seed: 3 }, "new_game")).toEqual({
      kind: "generated",
      packPath: null,
      worldQuestId: null,
      generateRpgSeed: 3,
    });
    expect(() => resolveGameSource(ROOT, {}, "new_game")).toThrow(
      /world_quest_id, pack_path, or generate_rpg_seed/,
    );
    expect(() =>
      resolveGameSource(
        ROOT,
        { world_quest_id: "sunken_barrow", generate_rpg_seed: 3 },
        "new_game",
      ),
    ).toThrow(/exactly one/);
  });

  it("infers trace and save sources from embedded worldQuestId", () => {
    expect(resolveTracePackSource(ROOT, {}, trace, "trace_test")).toEqual({
      packPath: PACK,
      worldQuestId: "sunken_barrow",
    });
    expect(resolveSavePackSource(ROOT, {}, { worldQuestId: "sunken_barrow" }, "save_test")).toEqual(
      {
        packPath: PACK,
        worldQuestId: "sunken_barrow",
      },
    );
  });

  it("rejects ambiguous or conflicting shipped source identities", () => {
    expect(() =>
      resolveSavePackSource(
        ROOT,
        { world_quest_id: "sunken_barrow", pack_path: PACK },
        { worldQuestId: "sunken_barrow" },
        "save_test",
      ),
    ).toThrow(/exactly one/);

    expect(() =>
      resolveSavePackSource(
        ROOT,
        { world_quest_id: "cold_forge" },
        { worldQuestId: "sunken_barrow" },
        "save_test",
      ),
    ).toThrow(SaveIntegrityError);
  });

  it("requires a source when save and trace metadata carry no world quest id", () => {
    const traceWithoutWorldQuest = { ...trace };
    delete (traceWithoutWorldQuest as { worldQuestId?: string }).worldQuestId;

    expect(() => resolveSavePackSource(ROOT, {}, {}, "save_test")).toThrow(
      /save with worldQuestId/,
    );
    expect(() => resolveTracePackSource(ROOT, {}, traceWithoutWorldQuest, "trace_test")).toThrow(
      /trace with worldQuestId/,
    );
  });
});
