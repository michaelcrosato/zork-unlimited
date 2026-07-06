import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SaveIntegrityError } from "../../src/persist/save_load.js";
import {
  assertWorldGraphIntegrity,
  assertWorldQuestSourceCoverage,
  assertOverworldQuestSourceBindings,
  loadOverworldManifest,
  loadWorldManifest,
  resolveGameSource,
  resolveSaveGameSource,
  resolveTraceGameSource,
  resolveWorldQuestSourceId,
  saveGeneratedRpgSeed,
  saveWorldQuestId,
  traceGeneratedRpgSeed,
} from "../../src/world/source.js";
import type { Trace } from "../../src/trace/record.js";
import type { RpgAction } from "../../src/api/types.js";
import type { WorldManifest } from "../../src/world/schema.js";

const ROOT = process.cwd();
const SOURCE = "content/rpg/pack/sunken_barrow.yaml";
const UNSAFE_GENERATED_RPG_SEED = Number.MAX_SAFE_INTEGER + 1;
const overworld = loadOverworldManifest(ROOT);

function worldWithQuestSources(quests: Array<{ id: string; source: string }>): WorldManifest {
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
          source: quest.source,
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
          source: SOURCE,
        },
      ],
      edges: [{ from: "hub", to: "sunken_barrow", route: "barrow road" }],
    },
  };
}

const trace = {
  mode: "rpg",
  worldQuestId: "sunken_barrow",
  source_ref: ["wq", "sunken_barrow"],
  trace_id: "tr_source_test",
  content_hash: "unused",
  seed: 1,
  initial_state: {},
  actions: [],
  expected_final_hash: "unused",
} as unknown as Trace<RpgAction>;

const generatedTrace = {
  mode: "rpg",
  source_ref: ["gen", 3],
  generatedRpgSeed: 3,
  trace_id: "tr_generated_source_test",
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

  it("keeps cached canonical manifests immutable across callers", () => {
    const world = loadWorldManifest(ROOT);
    const overworldManifest = loadOverworldManifest(ROOT);
    const worldNodeName = world.graph.nodes[0]!.name;
    const overworldNodeName = overworldManifest.nodes[0]!.name;

    expect(Object.isFrozen(world)).toBe(true);
    expect(Object.isFrozen(world.graph)).toBe(true);
    expect(Object.isFrozen(world.graph.nodes)).toBe(true);
    expect(Object.isFrozen(world.graph.nodes[0])).toBe(true);
    expect(Object.isFrozen(overworldManifest)).toBe(true);
    expect(Object.isFrozen(overworldManifest.nodes)).toBe(true);
    expect(Object.isFrozen(overworldManifest.nodes[0])).toBe(true);

    expect(() => {
      world.graph.nodes[0]!.name = "Mutated Hub";
    }).toThrow(TypeError);
    expect(() => {
      overworldManifest.nodes[0]!.name = "Mutated Town";
    }).toThrow(TypeError);
    expect(loadWorldManifest(ROOT).graph.nodes[0]!.name).toBe(worldNodeName);
    expect(loadOverworldManifest(ROOT).nodes[0]!.name).toBe(overworldNodeName);
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
    ).toThrow(/does not match canonical world graph source/);
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

    expect(() =>
      assertWorldGraphIntegrity({
        ...connectedWorld(),
        graph: {
          ...connectedWorld().graph,
          nodes: connectedWorld().graph.nodes.map((node) =>
            node.id === "hub" ? { ...node, coord: [0, 0] as [number, number] } : node,
          ),
        },
      }),
    ).toThrow(/coordinate map is incomplete/);

    expect(() =>
      assertWorldGraphIntegrity({
        ...connectedWorld(),
        graph: {
          ...connectedWorld().graph,
          nodes: connectedWorld().graph.nodes.map((node) => ({
            ...node,
            coord: [0, 0] as [number, number],
          })),
        },
      }),
    ).toThrow(/duplicate coordinate/);
  });

  it("rejects detached, duplicate, or unshipped RPG source bindings in the world graph", () => {
    expect(() =>
      assertWorldQuestSourceCoverage(
        worldWithQuestSources([{ id: "sunken_barrow", source: SOURCE }]),
        [SOURCE],
      ),
    ).not.toThrow();

    expect(() =>
      assertWorldQuestSourceCoverage(
        worldWithQuestSources([{ id: "sunken_barrow", source: SOURCE }]),
        [SOURCE, "content/rpg/pack/cold_forge.yaml"],
      ),
    ).toThrow(/missing shipped RPG source binding/);

    expect(() =>
      assertWorldQuestSourceCoverage(
        worldWithQuestSources([
          { id: "sunken_barrow", source: SOURCE },
          { id: "duplicate_barrow", source: SOURCE },
        ]),
        [SOURCE],
      ),
    ).toThrow(/more than once/);

    expect(() =>
      assertWorldQuestSourceCoverage(
        worldWithQuestSources([
          { id: "sunken_barrow", source: SOURCE },
          { id: "cold_forge", source: "content/rpg/pack/cold_forge.yaml" },
        ]),
        [SOURCE],
      ),
    ).toThrow(/not shipped in content\/rpg\/pack/);
  });

  it("resolves live world quest source ids without raw pack selectors", () => {
    expect(resolveWorldQuestSourceId({ world_quest_id: "sunken_barrow" }, "test")).toBe(
      "sunken_barrow",
    );
    expect(() => resolveWorldQuestSourceId({ pack_path: SOURCE } as never, "test")).toThrow(
      /not pack_path/,
    );
    expect(() => resolveWorldQuestSourceId({}, "test")).toThrow(/requires world_quest_id/);
  });

  it("resolves generated new-game sources only", () => {
    expect(resolveGameSource(ROOT, { generate_rpg_seed: 3 }, "new_game")).toEqual({
      kind: "generated",
      worldQuestId: null,
      generateRpgSeed: 3,
    });
    expect(() => resolveGameSource(ROOT, {}, "new_game")).toThrow(/requires generate_rpg_seed/);
    expect(() => resolveGameSource(ROOT, { pack_path: SOURCE } as never, "new_game")).toThrow(
      /not pack_path/,
    );
    expect(() =>
      resolveGameSource(
        ROOT,
        { world_quest_id: "sunken_barrow", generate_rpg_seed: 3 } as never,
        "new_game",
      ),
    ).toThrow(/start_world_quest/);
    expect(() => resolveGameSource(ROOT, { generate_rpg_seed: 3.5 } as never, "new_game")).toThrow(
      /must be an integer/,
    );
    expect(() =>
      resolveGameSource(
        ROOT,
        { generate_rpg_seed: UNSAFE_GENERATED_RPG_SEED } as never,
        "new_game",
      ),
    ).toThrow(/safe range/);
  });

  it("infers trace and save sources from embedded worldQuestId", () => {
    expect(resolveTraceGameSource(ROOT, {}, trace, "trace_test")).toEqual({
      kind: "worldQuest",
      worldQuestId: "sunken_barrow",
      generateRpgSeed: null,
    });
    const traceWithSourceRefOnly = { ...trace };
    delete (traceWithSourceRefOnly as { worldQuestId?: string }).worldQuestId;
    expect(resolveTraceGameSource(ROOT, {}, traceWithSourceRefOnly, "trace_test")).toEqual({
      kind: "worldQuest",
      worldQuestId: "sunken_barrow",
      generateRpgSeed: null,
    });
    expect(resolveTraceGameSource(ROOT, {}, trace, "trace_test")).toEqual({
      kind: "worldQuest",
      worldQuestId: "sunken_barrow",
      generateRpgSeed: null,
    });
    expect(resolveTraceGameSource(ROOT, {}, generatedTrace, "trace_test")).toEqual({
      kind: "generated",
      worldQuestId: null,
      generateRpgSeed: 3,
    });
    expect(traceGeneratedRpgSeed(generatedTrace, "trace_test")).toBe(3);
    expect(() =>
      resolveTraceGameSource(ROOT, { pack_path: SOURCE } as never, trace, "trace_test"),
    ).toThrow(/not pack_path/);
    expect(
      resolveSaveGameSource(ROOT, {}, { source_ref: ["wq", "sunken_barrow"] }, "save_test"),
    ).toEqual({
      kind: "worldQuest",
      worldQuestId: "sunken_barrow",
      generateRpgSeed: null,
    });
    expect(resolveSaveGameSource(ROOT, {}, { source_ref: ["gen", 3] }, "save_test")).toEqual({
      kind: "generated",
      worldQuestId: null,
      generateRpgSeed: 3,
    });
    expect(saveWorldQuestId({ source_ref: ["wq", "sunken_barrow"] }, "save_test")).toBe(
      "sunken_barrow",
    );
    expect(saveGeneratedRpgSeed({ source_ref: ["gen", 3] }, "save_test")).toBe(3);
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
        { generate_rpg_seed: UNSAFE_GENERATED_RPG_SEED } as never,
        {},
        "save_test",
      ),
    ).toThrow(/safe range/);

    expect(() =>
      resolveSaveGameSource(ROOT, {}, { generatedRpgSeed: UNSAFE_GENERATED_RPG_SEED }, "save_test"),
    ).toThrow(/source_ref/);

    expect(() =>
      resolveSaveGameSource(
        ROOT,
        {},
        { source_ref: ["gen", UNSAFE_GENERATED_RPG_SEED] },
        "save_test",
      ),
    ).toThrow(SaveIntegrityError);

    expect(() =>
      resolveSaveGameSource(
        ROOT,
        {},
        { worldQuestId: "sunken_barrow", generatedRpgSeed: 3, source_ref: ["wq", "sunken_barrow"] },
        "save_test",
      ),
    ).toThrow(SaveIntegrityError);

    expect(() =>
      resolveSaveGameSource(
        ROOT,
        { generate_rpg_seed: 4 },
        { generatedRpgSeed: 3, source_ref: ["gen", 3] },
        "save_test",
      ),
    ).toThrow(SaveIntegrityError);

    expect(() =>
      resolveSaveGameSource(
        ROOT,
        { pack_path: SOURCE } as never,
        { generatedRpgSeed: 3, source_ref: ["gen", 3] },
        "save_test",
      ),
    ).toThrow(/not pack_path/);
    expect(() =>
      resolveSaveGameSource(
        ROOT,
        { pack_path: SOURCE } as never,
        { worldQuestId: "sunken_barrow", source_ref: ["wq", "sunken_barrow"] },
        "save_test",
      ),
    ).toThrow(/not pack_path/);
    expect(() =>
      resolveSaveGameSource(
        ROOT,
        { world_quest_id: "cold_forge" },
        { worldQuestId: "sunken_barrow", source_ref: ["wq", "sunken_barrow"] },
        "save_test",
      ),
    ).toThrow(SaveIntegrityError);

    expect(() =>
      resolveSaveGameSource(
        ROOT,
        {},
        { worldQuestId: "sunken_barrow", source_ref: ["wq", "cold_forge"] },
        "save_test",
      ),
    ).toThrow(SaveIntegrityError);

    expect(() =>
      resolveSaveGameSource(ROOT, {}, { generatedRpgSeed: 3, source_ref: ["gen", 4] }, "save_test"),
    ).toThrow(SaveIntegrityError);

    expect(() =>
      resolveSaveGameSource(
        ROOT,
        {},
        { worldQuestId: "sunken_barrow", source_ref: ["gen", 3] },
        "save_test",
      ),
    ).toThrow(SaveIntegrityError);

    expect(() => resolveSaveGameSource(ROOT, {}, { source_ref: ["wq", 3] }, "save_test")).toThrow(
      SaveIntegrityError,
    );

    expect(() =>
      resolveSaveGameSource(
        ROOT,
        { world_quest_id: "sunken_barrow" },
        { source_ref: ["pack", "sunken_barrow_v1"] },
        "save_test",
      ),
    ).toThrow(SaveIntegrityError);

    expect(() =>
      resolveSaveGameSource(
        ROOT,
        { generate_rpg_seed: 3 },
        { source_ref: ["pack", "genrpg_3_v1"] },
        "save_test",
      ),
    ).toThrow(SaveIntegrityError);

    expect(() =>
      resolveTraceGameSource(
        ROOT,
        {},
        { ...trace, source_ref: ["wq", "cold_forge"] },
        "trace_test",
      ),
    ).toThrow(SaveIntegrityError);

    expect(() =>
      resolveTraceGameSource(ROOT, {}, { ...trace, source_ref: ["gen", 3] }, "trace_test"),
    ).toThrow(SaveIntegrityError);

    const malformedPackTraceRef = {
      ...trace,
      source_ref: ["pack", "sunken_barrow_v1"],
    } as unknown as Trace<RpgAction>;
    expect(() => resolveTraceGameSource(ROOT, {}, malformedPackTraceRef, "trace_test")).toThrow(
      SaveIntegrityError,
    );

    const malformedGeneratedTraceRef = {
      ...trace,
      source_ref: ["gen", 3.5],
    } as unknown as Trace<RpgAction>;
    delete (malformedGeneratedTraceRef as { worldQuestId?: string }).worldQuestId;
    expect(() =>
      resolveTraceGameSource(ROOT, {}, malformedGeneratedTraceRef, "trace_test"),
    ).toThrow(SaveIntegrityError);

    expect(() =>
      resolveTraceGameSource(
        ROOT,
        { world_quest_id: "sunken_barrow" },
        generatedTrace,
        "trace_test",
      ),
    ).toThrow(SaveIntegrityError);
  });

  it("requires a source when save and trace metadata carry no world quest id", () => {
    const traceWithoutWorldQuest = { ...trace };
    delete (traceWithoutWorldQuest as { worldQuestId?: string }).worldQuestId;
    delete (traceWithoutWorldQuest as { source_ref?: unknown }).source_ref;

    expect(() => resolveTraceGameSource(ROOT, {}, traceWithoutWorldQuest, "trace_test")).toThrow(
      /source_ref/,
    );
    expect(() => resolveSaveGameSource(ROOT, {}, {}, "save_test")).toThrow(/source_ref/);
  });

  it("rejects loose legacy save source metadata without source_ref", () => {
    expect(() =>
      resolveSaveGameSource(ROOT, {}, { worldQuestId: "sunken_barrow" }, "save_test"),
    ).toThrow(SaveIntegrityError);
    expect(() =>
      resolveSaveGameSource(ROOT, {}, { worldQuestId: "sunken_barrow" }, "save_test"),
    ).toThrow(/source_ref/);
    expect(() => resolveSaveGameSource(ROOT, {}, { generatedRpgSeed: 3 }, "save_test")).toThrow(
      SaveIntegrityError,
    );
    expect(() => resolveSaveGameSource(ROOT, {}, { generatedRpgSeed: 3 }, "save_test")).toThrow(
      /source_ref/,
    );
    expect(() => resolveSaveGameSource(ROOT, { generate_rpg_seed: 3 }, {}, "save_test")).toThrow(
      /source_ref/,
    );
  });

  it("rejects loose legacy trace source metadata without source_ref", () => {
    const traceWithoutSourceRef = { ...trace };
    delete (traceWithoutSourceRef as { source_ref?: unknown }).source_ref;

    expect(() => resolveTraceGameSource(ROOT, {}, traceWithoutSourceRef, "trace_test")).toThrow(
      SaveIntegrityError,
    );
    expect(() => resolveTraceGameSource(ROOT, {}, traceWithoutSourceRef, "trace_test")).toThrow(
      /source_ref/,
    );
  });
});
