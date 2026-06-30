/**
 * bug_0143 — inspect_trace SURFACES the first divergent step (it was computed,
 * then thrown away).
 *
 * Per-step divergence localization is a finished Trace-v2 feature: recordTrace
 * stamps `per_step_hashes`, and replayTrace returns `divergedAtStep` — the index
 * of the first action whose post-state diverged from that baseline (src/trace/
 * replay.ts, covered by tests/unit/save_trace.test.ts). But the MCP `inspect_trace`
 * tool — the project's bug-summarizing entry point (§9.4, §12.5) — called
 * replayTrace and returned only `hash_ok`/`final_hash`/`expected_final_hash`,
 * DROPPING `divergedAtStep`. So the one tool whose whole job is to localize a bug
 * reported "hash_ok: false" without saying WHERE, even though the localization had
 * already been computed. This pins that the field is now surfaced as
 * `diverged_at_step`:
 *   - a faithful Trace-v2 trace reports null (nothing to localize);
 *   - a trace whose MID-trace per-step baseline diverges is localized to the exact
 *     step AND marked hash_ok:false — even when the FINAL hash still matches (the
 *     headline value: a self-correcting final hash would hide this);
 *   - a v1 trace (no per_step_hashes) reports null — no per-step baseline to compare.
 * A regression here would mean the debugger silently lost its divergence pointer.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { createToolApi } from "../../src/mcp/tools.js";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import { recordTrace, type Trace } from "../../src/trace/record.js";
import type { RpgAction } from "../../src/api/types.js";

const ROOT = process.cwd();
const PACK = "content/rpg/pack/sunken_barrow.yaml";
const api = () => createToolApi({ root: ROOT });

type InspectResult = {
  ok: boolean;
  hash_ok: boolean;
  steps: number;
  diverged_at_step: number | null;
};

// A real 5-action route through sunken_barrow's opening and shade dialogue, so the
// recorded trace carries a genuine per_step_hashes baseline of length 5.
const ACTIONS: RpgAction[] = [
  { type: "MOVE", direction: "down" },
  { type: "TAKE", item: "iron_bar" },
  { type: "MOVE", direction: "west" },
  { type: "TALK", npc: "reaver_shade" },
  { type: "ASK", npc: "reaver_shade", topic: "ask_wight" },
];

let cleanTrace: Trace;

const FIXTURE = (name: string) => `traces/bug_0143_${name}.json`;

function write(path: string, trace: Trace) {
  mkdirSync("traces", { recursive: true });
  writeFileSync(path, JSON.stringify(trace));
}

beforeAll(() => {
  const compiled = loadRpgPackFile(PACK);
  if (!compiled.ok) throw new Error("pack must compile");
  const index = indexRpgPack(compiled.compiled.pack);
  const rules = buildRpgRules(index);
  cleanTrace = recordTrace(rules, initStateForRpgPack(index, 1), ACTIONS, {
    trace_id: "tr_0143",
    pack_id: compiled.compiled.pack.meta.id,
    content_hash: compiled.compiled.contentHash,
  });
});

describe("bug_0143 — inspect_trace surfaces per-step divergence (§8.8, §9.4)", () => {
  it("a faithful Trace-v2 trace localizes nothing (diverged_at_step null, hash_ok true)", () => {
    write(FIXTURE("clean"), cleanTrace);
    const r = api().inspect_trace({
      trace_path: FIXTURE("clean"),
      pack_path: PACK,
    }) as InspectResult;
    expect(r.hash_ok).toBe(true);
    expect(r.diverged_at_step).toBeNull();
    expect(r.steps).toBe(5);
  });

  it("localizes the FIRST divergent step even when the FINAL hash still matches", () => {
    // Corrupt only the 3rd step's recorded baseline; leave expected_final_hash
    // correct. The final-hash check alone would pass — per-step localization is the
    // ONLY thing that catches this, and must flip hash_ok to false.
    const hashes = [...cleanTrace.per_step_hashes!];
    hashes[2] = "0".repeat(64);
    write(FIXTURE("middiverge"), { ...cleanTrace, per_step_hashes: hashes });
    const r = api().inspect_trace({
      trace_path: FIXTURE("middiverge"),
      pack_path: PACK,
    }) as InspectResult;
    expect(r.diverged_at_step).toBe(2);
    expect(r.hash_ok).toBe(false);
  });

  it("a v1 trace (no per_step_hashes) reports null — no per-step baseline to compare", () => {
    const { per_step_hashes: _omit, ...v1 } = cleanTrace;
    write(FIXTURE("v1"), v1 as Trace);
    const r = api().inspect_trace({
      trace_path: FIXTURE("v1"),
      pack_path: PACK,
    }) as InspectResult;
    expect(r.hash_ok).toBe(true);
    expect(r.diverged_at_step).toBeNull();
  });
});
