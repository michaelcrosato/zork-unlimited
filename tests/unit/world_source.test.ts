import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SaveIntegrityError } from "../../src/persist/save_load.js";
import {
  assertWorldGraphIntegrity,
  assertWorldQuestPackCoverage,
  assertOverworldQuestSourceBindings,
  loadOverworldManifest,
  loadWorldManifest,
  resolveGameSource,
  resolvePackSource,
  resolveSaveGameSource,
  resolveTracePackSource,
} from "../../src/world/source.js";
import type { Trace } from "../../src/trace/record.js";
import type { RpgAction } from "../../src/api/types.js";
import type { WorldManifest } from "../../src/world/schema.js";

const ROOT = process.cwd();
const PACK = "content/rpg/pack/sunken_barrow.yaml";
const overworld = loadOverworldManifest(ROOT);

function worldWithQuestPacks(quests: Array<{ id: string; pack: string }>): WorldManifest {
  return {
    id: "charter_marches",
    name: "The Charter Marches",
    hub: "Charterhaven",
    graph: {
      hub: "hub",
      nodes: [
        { id: "hub", name: "Hub", kind: "hub" },
        ...quests.map((quest) => ({
          id: quest.id,
          name: quest.id,
          kind: "quest" as const,
          pack: quest.pack,
        })),
      ],
      edges: [],
    },
  };
}

function connectedWorld(): WorldManifest {
  return {
    id: "charter_marches",
    name: "The Charter Marches",
    hub: "Charterhaven",
    graph: {
      hub: "hub",
      nodes: [
        { id: "hub", name: "Hub", kind: "hub" },
        {
          id: "sunken_barrow",
          name: "Sunken Barrow",
          kind: "quest",
          pack: PACK,
        },
      ],
      edges: [{ from: "hub", to: "sunken_barrow", route: "barrow road" }],
    },
  };
}

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

function withTempRoot(run: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "world-source-"));
  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("world source resolution", () => {
  it("reuses parsed canonical manifests within a process", () => {
    expect(loadWorldManifest(ROOT)).toBe(loadWorldManifest(ROOT));
    expect(loadOverworldManifest(ROOT)).toBe(loadOverworldManifest(ROOT));
  });

  it("falls back only when the canonical world manifest is absent, not malformed", () => {
    withTempRoot((root) => {
      expect(loadWorldManifest(root).graph.hub).toBe("charterhaven");
    });

    withTempRoot((root) => {
      mkdirSync(join(root, "content", "world"), { recursive: true });
      writeFileSync(join(root, "content", "world", "charter_marches.yaml"), "graph: [broken]\n");

      expect(() => loadWorldManifest(root)).toThrow();
    });
  });

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

  it("rejects malformed canonical world graph topology before play starts", () => {
    expect(() => assertWorldGraphIntegrity(connectedWorld())).not.toThrow();

    expect(() =>
      assertWorldGraphIntegrity({
        ...connectedWorld(),
        graph: {
          ...connectedWorld().graph,
          nodes: [...connectedWorld().graph.nodes, { id: "hub", name: "Again", kind: "route" }],
        },
      }),
    ).toThrow(/duplicate node id/);

    expect(() =>
      assertWorldGraphIntegrity({
        ...connectedWorld(),
        graph: { ...connectedWorld().graph, hub: "missing_hub" },
      }),
    ).toThrow(/hub "missing_hub" is missing/);

    expect(() =>
      assertWorldGraphIntegrity({
        ...connectedWorld(),
        graph: {
          ...connectedWorld().graph,
          nodes: connectedWorld().graph.nodes.map((node) =>
            node.id === "hub" ? { ...node, kind: "route" as const } : node,
          ),
        },
      }),
    ).toThrow(/must be a hub node/);

    expect(() =>
      assertWorldGraphIntegrity({
        ...connectedWorld(),
        graph: {
          ...connectedWorld().graph,
          edges: [{ from: "hub", to: "missing_quest", route: "lost road" }],
        },
      }),
    ).toThrow(/references missing node/);

    expect(() =>
      assertWorldGraphIntegrity({
        ...connectedWorld(),
        graph: {
          ...connectedWorld().graph,
          edges: [{ from: "hub", to: "hub", route: "loop road" }],
        },
      }),
    ).toThrow(/cannot loop to itself/);

    expect(() =>
      assertWorldGraphIntegrity({
        ...connectedWorld(),
        graph: { ...connectedWorld().graph, edges: [] },
      }),
    ).toThrow(/disconnected from hub/);
  });

  it("rejects detached, duplicate, or unshipped RPG pack bindings in the world graph", () => {
    expect(() =>
      assertWorldQuestPackCoverage(worldWithQuestPacks([{ id: "sunken_barrow", pack: PACK }]), [
        PACK,
      ]),
    ).not.toThrow();

    expect(() =>
      assertWorldQuestPackCoverage(worldWithQuestPacks([{ id: "sunken_barrow", pack: PACK }]), [
        PACK,
        "content/rpg/pack/cold_forge.yaml",
      ]),
    ).toThrow(/missing shipped RPG pack binding/);

    expect(() =>
      assertWorldQuestPackCoverage(
        worldWithQuestPacks([
          { id: "sunken_barrow", pack: PACK },
          { id: "duplicate_barrow", pack: PACK },
        ]),
        [PACK],
      ),
    ).toThrow(/more than once/);

    expect(() =>
      assertWorldQuestPackCoverage(
        worldWithQuestPacks([
          { id: "sunken_barrow", pack: PACK },
          { id: "cold_forge", pack: "content/rpg/pack/cold_forge.yaml" },
        ]),
        [PACK],
      ),
    ).toThrow(/not shipped in content\/rpg\/pack/);
  });

  it("resolves live pack sources by world quest id only", () => {
    expect(resolvePackSource(ROOT, { world_quest_id: "sunken_barrow" }, "test")).toEqual({
      packPath: PACK,
      worldQuestId: "sunken_barrow",
    });
    expect(() => resolvePackSource(ROOT, { pack_path: PACK } as never, "test")).toThrow(
      /not pack_path/,
    );
    expect(() => resolvePackSource(ROOT, {}, "test")).toThrow(/requires world_quest_id/);
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
      /world_quest_id or generate_rpg_seed/,
    );
    expect(() => resolveGameSource(ROOT, { pack_path: PACK } as never, "new_game")).toThrow(
      /not pack_path/,
    );
    expect(() =>
      resolveGameSource(
        ROOT,
        { world_quest_id: "sunken_barrow", generate_rpg_seed: 3 },
        "new_game",
      ),
    ).toThrow(/exactly one/);
    expect(() => resolveGameSource(ROOT, { generate_rpg_seed: 3.5 } as never, "new_game")).toThrow(
      /must be an integer/,
    );
  });

  it("infers trace and save sources from embedded worldQuestId", () => {
    expect(resolveTracePackSource(ROOT, {}, trace, "trace_test")).toEqual({
      packPath: PACK,
      worldQuestId: "sunken_barrow",
    });
    expect(() =>
      resolveTracePackSource(ROOT, { pack_path: PACK } as never, trace, "trace_test"),
    ).toThrow(/not pack_path/);
    expect(resolveSaveGameSource(ROOT, {}, { worldQuestId: "sunken_barrow" }, "save_test")).toEqual(
      {
        kind: "pack",
        packPath: PACK,
        worldQuestId: "sunken_barrow",
        generateRpgSeed: null,
      },
    );
    expect(resolveSaveGameSource(ROOT, {}, { generatedRpgSeed: 3 }, "save_test")).toEqual({
      kind: "generated",
      packPath: null,
      worldQuestId: null,
      generateRpgSeed: 3,
    });
    expect(resolveSaveGameSource(ROOT, { generate_rpg_seed: 3 }, {}, "save_test")).toEqual({
      kind: "generated",
      packPath: null,
      worldQuestId: null,
      generateRpgSeed: 3,
    });
  });

  it("rejects ambiguous or conflicting shipped source identities", () => {
    expect(() =>
      resolveSaveGameSource(
        ROOT,
        { world_quest_id: "sunken_barrow", generate_rpg_seed: 3 },
        {},
        "save_test",
      ),
    ).toThrow(/exactly one/);

    expect(() =>
      resolveSaveGameSource(ROOT, { generate_rpg_seed: 3.5 } as never, {}, "save_test"),
    ).toThrow(/must be an integer/);

    expect(() =>
      resolveSaveGameSource(
        ROOT,
        {},
        { worldQuestId: "sunken_barrow", generatedRpgSeed: 3 },
        "save_test",
      ),
    ).toThrow(SaveIntegrityError);

    expect(() =>
      resolveSaveGameSource(ROOT, { generate_rpg_seed: 4 }, { generatedRpgSeed: 3 }, "save_test"),
    ).toThrow(SaveIntegrityError);

    expect(() =>
      resolveSaveGameSource(
        ROOT,
        { pack_path: PACK } as never,
        { generatedRpgSeed: 3 },
        "save_test",
      ),
    ).toThrow(/not pack_path/);
    expect(() =>
      resolveSaveGameSource(
        ROOT,
        { pack_path: PACK } as never,
        { worldQuestId: "sunken_barrow" },
        "save_test",
      ),
    ).toThrow(/not pack_path/);
    expect(() =>
      resolveSaveGameSource(
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

    expect(() => resolveTracePackSource(ROOT, {}, traceWithoutWorldQuest, "trace_test")).toThrow(
      /trace with worldQuestId/,
    );
    expect(() => resolveSaveGameSource(ROOT, {}, {}, "save_test")).toThrow(
      /worldQuestId\/generatedRpgSeed/,
    );
  });
});
