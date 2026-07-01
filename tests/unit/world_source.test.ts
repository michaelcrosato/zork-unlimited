import { describe, expect, it } from "vitest";
import { SaveIntegrityError } from "../../src/persist/save_load.js";
import {
  resolvePackSource,
  resolveSavePackSource,
  resolveTracePackSource,
} from "../../src/world/source.js";
import type { Trace } from "../../src/trace/record.js";
import type { RpgAction } from "../../src/api/types.js";

const ROOT = process.cwd();
const PACK = "content/rpg/pack/sunken_barrow.yaml";

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
