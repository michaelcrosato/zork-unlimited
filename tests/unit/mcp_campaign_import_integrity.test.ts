import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import type { RpgAction } from "../../src/api/types.js";
import { hashState } from "../../src/core/hash.js";
import { createToolApi } from "../../src/mcp/tools.js";
import { RpgSourceRuntime } from "../../src/mcp/rpg_source_runtime.js";
import { SAVE_MODE, SaveIntegrityError, save } from "../../src/persist/save_load.js";
import { buildRpgRules, indexRpgPack, initStateForRpgPack } from "../../src/rpg/runner.js";
import { recordTrace, type Trace } from "../../src/trace/record.js";
import { buildCampaignCharacterState } from "../../src/world/campaign_character_state.js";

const ROOT = process.cwd();
const QUEST_ID = "wolf_winter";
const SEED = 818;
const runtime = new RpgSourceRuntime(ROOT);
const wolf = runtime.requireWorldQuestPlayable(QUEST_ID);
if (!wolf.campaignImports) throw new Error("Wolf-Winter must declare campaign imports.");
const index = indexRpgPack(wolf.compiled.pack);
const importedState = initStateForRpgPack(index, SEED, {
  character: buildCampaignCharacterState({
    health: { current: 23, max: 30 },
    skills: [{ skillId: "skill:fieldcraft", rank: 5 }],
  }),
  imports: wolf.campaignImports,
});
if (!importedState.campaignImportReceipt) {
  throw new Error("The integrity fixture must produce an import receipt.");
}

function staleReceiptState() {
  const state = structuredClone(importedState);
  state.campaignImportReceipt!.catalog_hash = "0".repeat(64);
  return state;
}

function withTraceFile<T>(trace: Trace<RpgAction>, run: (tracePath: string) => T): T {
  const parent = join(ROOT, "ai-runs");
  mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, "campaign-import-integrity-"));
  const absolutePath = join(directory, "trace.json");
  try {
    writeFileSync(absolutePath, JSON.stringify(trace), "utf8");
    const tracePath = relative(ROOT, absolutePath).replaceAll("\\", "/");
    return run(tracePath);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("MCP campaign import receipt catalog compatibility", () => {
  it("loads a receipt only against the exact current world-quest catalog", () => {
    const api = createToolApi({ root: ROOT });
    const validSave = save(importedState, wolf.compiled.contentHash, SAVE_MODE, {
      worldQuestId: QUEST_ID,
    });
    const loaded = api.load_game({ save: validSave });

    expect(api.sessions.get(loaded.session_id).state).toEqual(importedState);
    expect(hashState(importedState).startsWith(loaded.state_hash)).toBe(true);

    const staleSave = save(staleReceiptState(), wolf.compiled.contentHash, SAVE_MODE, {
      worldQuestId: QUEST_ID,
    });
    expect(() => createToolApi({ root: ROOT }).load_game({ save: staleSave })).toThrow(
      SaveIntegrityError,
    );
    expect(() => createToolApi({ root: ROOT }).load_game({ save: staleSave })).toThrow(
      /campaign import receipt.*catalog hash.*stale/i,
    );

    const generated = runtime.requireGeneratedRpgPlayable(17);
    const catalogRemovedSave = save(importedState, generated.contentHash, SAVE_MODE, {
      generatedRpgSeed: 17,
    });
    expect(() => createToolApi({ root: ROOT }).load_game({ save: catalogRemovedSave })).toThrow(
      /campaign import receipt.*no import catalog/i,
    );
  });

  it("gates real-action MCP replay and inspection against the current catalog", () => {
    const rules = buildRpgRules(index);
    const validTrace = recordTrace<RpgAction>(rules, importedState, [{ type: "LOOK" }], {
      trace_id: "campaign_import_catalog_current",
      content_hash: wolf.compiled.contentHash,
      worldQuestId: QUEST_ID,
    });

    withTraceFile(validTrace, (tracePath) => {
      const api = createToolApi({ root: ROOT });
      expect(api.replay_trace({ trace_path: tracePath })).toMatchObject({ ok: true });
      expect(api.inspect_trace({ trace_path: tracePath })).toMatchObject({
        ok: true,
        hash_ok: true,
        steps: 1,
      });
    });

    const staleTrace = structuredClone(validTrace);
    staleTrace.initial_state = staleReceiptState();
    withTraceFile(staleTrace, (tracePath) => {
      const api = createToolApi({ root: ROOT });
      expect(() => api.replay_trace({ trace_path: tracePath })).toThrow(SaveIntegrityError);
      expect(() => api.inspect_trace({ trace_path: tracePath })).toThrow(
        /campaign import receipt.*catalog hash.*stale/i,
      );
    });

    const generated = runtime.requireGeneratedRpgPlayable(19);
    const catalogRemovedTrace = recordTrace<RpgAction>(rules, importedState, [{ type: "LOOK" }], {
      trace_id: "campaign_import_catalog_removed",
      content_hash: generated.contentHash,
      generatedRpgSeed: 19,
    });
    withTraceFile(catalogRemovedTrace, (tracePath) => {
      const api = createToolApi({ root: ROOT });
      expect(() => api.replay_trace({ trace_path: tracePath })).toThrow(
        /campaign import receipt.*no import catalog/i,
      );
      expect(() => api.inspect_trace({ trace_path: tracePath })).toThrow(SaveIntegrityError);
    });
  });
});
