import { describe, expect, it } from "vitest";
import { SaveIntegrityError } from "../../src/persist/save_load.js";
import {
  assertOverworldQuestSourceCoverage,
  loadOverworldManifest,
  resolveGameSource,
  resolveSaveGameSource,
  resolveTraceGameSource,
  resolveWorldQuestSourceId,
  saveGeneratedRpgSeed,
  saveWorldQuestId,
  traceGeneratedRpgSeed,
} from "../../src/world/source.js";
import type { OverworldManifest } from "../../src/world/overworld.js";
import type { Trace } from "../../src/trace/record.js";
import type { RpgAction } from "../../src/api/types.js";

const ROOT = process.cwd();
const SOURCE = "content/rpg/quests/sunken_barrow.yaml";
const UNSAFE_GENERATED_RPG_SEED = Number.MAX_SAFE_INTEGER + 1;
const overworld = loadOverworldManifest(ROOT);

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

describe("world source resolution", () => {
  it("reuses parsed overworld manifests within a process", () => {
    expect(loadOverworldManifest(ROOT)).toBe(loadOverworldManifest(ROOT));
  });

  it("keeps cached overworld manifests immutable across callers", () => {
    const overworldManifest = loadOverworldManifest(ROOT);
    const overworldNodeName = overworldManifest.nodes[0]!.name;

    expect(Object.isFrozen(overworldManifest)).toBe(true);
    expect(Object.isFrozen(overworldManifest.nodes)).toBe(true);
    expect(Object.isFrozen(overworldManifest.nodes[0])).toBe(true);

    expect(() => {
      overworldManifest.nodes[0]!.name = "Mutated Town";
    }).toThrow(TypeError);
    expect(loadOverworldManifest(ROOT).nodes[0]!.name).toBe(overworldNodeName);
  });

  it("binds overworld quests one-to-one with the shipped RPG packs (no orphans)", () => {
    const realSources = overworld.quests.map((quest) => quest.source);
    expect(() => assertOverworldQuestSourceCoverage(overworld, realSources)).not.toThrow();

    const withQuestSources = (sources: string[]): OverworldManifest =>
      ({ quests: sources.map((source) => ({ source })) }) as unknown as OverworldManifest;

    // A shipped pack that no overworld quest binds is an orphan — rejected.
    expect(() =>
      assertOverworldQuestSourceCoverage(withQuestSources([SOURCE]), [
        SOURCE,
        "content/rpg/quests/cold_forge.yaml",
      ]),
    ).toThrow(/not bound to any overworld quest/);

    // Two quests naming the same pack — rejected.
    expect(() =>
      assertOverworldQuestSourceCoverage(withQuestSources([SOURCE, SOURCE]), [SOURCE]),
    ).toThrow(/more than once/);

    // A quest naming a pack that is not shipped on disk — rejected.
    expect(() =>
      assertOverworldQuestSourceCoverage(
        withQuestSources([SOURCE, "content/rpg/quests/cold_forge.yaml"]),
        [SOURCE],
      ),
    ).toThrow(/not shipped in content\/rpg\/quests/);
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
    ).toThrow(/start_overworld_session_quest/);
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
