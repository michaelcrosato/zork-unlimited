/**
 * Regression (§15) for bug_0290 — `divergedAtStep` is now populated in
 * `replayTrace` / `ReplayResult` and surfaced by the `inspect_trace` MCP tool.
 *
 * BACKGROUND: `record.ts` computes a `per_step_hashes` array (the post-state
 * hash after each action) and stamps it into the returned `Trace` object.
 * `replay.ts` walks that baseline step-by-step and sets `divergedAtStep` to the
 * 0-based index of the FIRST action whose replayed post-state hash differs from
 * the recorded one. Before bug_0290 the field was a reserved `undefined`
 * placeholder — a trace replay could report *that* it diverged (via a
 * mismatched `expected_final_hash`) but never *where*.
 *
 * BACKWARD-COMPATIBILITY: a v1 `Trace` without `per_step_hashes` must still
 * replay without error; `divergedAtStep` stays `undefined` (no baseline to
 * compare against).
 *
 * LOCKED HERE (5 cases — acceptance check §bug_0290):
 *   (1) NO-DIVERGENCE: a trace replayed against the same rules with no
 *       modification produces `divergedAtStep === undefined` throughout.
 *   (2) DIVERGENCE AT STEP N: corrupting the recorded baseline at step N causes
 *       `replayTrace` to return `divergedAtStep === N`.
 *   (3) FIRST-DIVERGENCE SEMANTICS: when steps 2 AND 4 both have a corrupted
 *       baseline, `divergedAtStep === 2` (the first), not 4 or later.
 *   (4) inspect_trace MCP TOOL: when replay detects a divergence, the
 *       `inspect_trace` response includes `diverged_at_step: N` (not null).
 *   (5) NON-VACUITY: `divergedAtStep` must equal `N` exactly — returning
 *       `undefined` (the pre-fix state) would fail cases 2 and 3.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { replayTrace } from "../../src/trace/replay.js";
import { recordTrace, type Trace } from "../../src/trace/record.js";
import { createToolApi } from "../../src/mcp/tools.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import {
  MICRO_ACTIONS,
  microRules,
  microInitState,
  MICRO_CONTENT_HASH,
} from "../../src/demo/micro.js";
import type { RpgAction } from "../../src/api/types.js";

// Four-action winning route through the micro engine (take torch -> enter cave ->
// grab gold -> claim treasure). These cover steps 0-3, giving us indices 0-3 for divergence
// injection testing.
const WIN: RpgAction[] = [
  MICRO_ACTIONS.takeTorch,
  MICRO_ACTIONS.enterCave,
  MICRO_ACTIONS.grabGold,
  MICRO_ACTIONS.claimTreasure,
];

type RpgTrace = Trace<RpgAction>;

function newTrace(): RpgTrace {
  return recordTrace(microRules, microInitState(), WIN, {
    trace_id: "tr_0290_regression",
    content_hash: MICRO_CONTENT_HASH,
    worldQuestId: "micro_divergence",
  });
}

/** Return a trace whose per_step_hashes baseline is corrupted at the given indices. */
function corruptAt(trace: RpgTrace, ...indices: number[]): RpgTrace {
  const hashes = [...trace.per_step_hashes!];
  for (const i of indices) {
    hashes[i] = "0".repeat(64); // a known-bad 64-char hash string
  }
  return { ...trace, per_step_hashes: hashes };
}

// ------------------------------------------------------------------
// MCP fixture support (case 4) — write a trace to disk for inspect_trace.
// ------------------------------------------------------------------
const ROOT = process.cwd();
const PACK = "content/rpg/quests/sunken_barrow.yaml";
const FIXTURE = (name: string) => `traces/bug_0290_${name}.json`;

const ACTIONS_RPG: RpgAction[] = [
  { type: "MOVE", direction: "down" },
  { type: "TAKE", item: "iron_bar" },
  { type: "MOVE", direction: "west" },
  { type: "TALK", npc: "reaver_shade" },
  { type: "ASK", npc: "reaver_shade", topic: "ask_wight" },
];

let cleanTraceMcp: RpgTrace;
let divergedTraceMcp: RpgTrace;

function write(path: string, trace: RpgTrace): void {
  mkdirSync("traces", { recursive: true });
  writeFileSync(path, JSON.stringify(trace));
}

beforeAll(() => {
  const compiled = loadRpgSourceFile(PACK);
  if (!compiled.ok) throw new Error("pack must compile for MCP fixture");
  const index = indexRpgPack(compiled.compiled.pack);
  const rules = buildRpgRules(index);
  cleanTraceMcp = recordTrace(rules, initStateForRpgPack(index, 1), ACTIONS_RPG, {
    trace_id: "tr_0290_mcp",
    content_hash: compiled.compiled.contentHash,
    worldQuestId: "sunken_barrow",
  });
  // Corrupt step 2 of the per-step baseline to trigger a mid-trace divergence.
  divergedTraceMcp = corruptAt(cleanTraceMcp, 2);
});

describe("bug_0290 — divergedAtStep is populated in replayTrace and inspect_trace", () => {
  it("(1) no-divergence: faithful replay produces divergedAtStep === undefined", () => {
    const result = replayTrace(newTrace(), microRules);
    expect(result.ok).toBe(true);
    // Absence of divergence — the field must be undefined, not 0.
    expect(result.divergedAtStep).toBeUndefined();
  });

  it("(2) divergence at step N: corrupting baseline[N] yields divergedAtStep === N", () => {
    // Corrupt step 1 (second action). The engine runs identically; only the
    // RECORDED baseline is tampered, so replayTrace detects hash[1] != baseline[1].
    const tampered = corruptAt(newTrace(), 1);
    const result = replayTrace(tampered, microRules);
    // NON-VACUITY (case 5): returning undefined (pre-fix) would fail this assertion.
    expect(result.divergedAtStep).toBe(1);
    expect(result.ok).toBe(false);
  });

  it("(3) first-divergence semantics: with steps 2 and 4 corrupted, divergedAtStep === 2", () => {
    // Both step 2 and step 3 (0-based; WIN has 4 steps: 0–3) are corrupted.
    // The engine's actual hashes are unchanged — only the recorded baseline at
    // those two indices is set to a known-bad string. divergedAtStep must be the
    // FIRST divergence (2), not the last (3) or anything else.
    const tampered = corruptAt(newTrace(), 2, 3);
    const result = replayTrace(tampered, microRules);
    // NON-VACUITY (case 5): returning undefined (pre-fix) would fail this assertion.
    expect(result.divergedAtStep).toBe(2);
    expect(result.ok).toBe(false);
  });

  it("(4) inspect_trace MCP tool: a mid-trace divergence surfaces as diverged_at_step: N (not null)", () => {
    // Write the diverged trace (per-step baseline corrupted at step 2) to disk and
    // call inspect_trace — the tool must report diverged_at_step: 2, not null.
    write(FIXTURE("diverged"), divergedTraceMcp);
    const api = createToolApi({ root: ROOT });
    const r = api.inspect_trace({
      trace_path: FIXTURE("diverged"),
    }) as { ok: boolean; hash_ok: boolean; diverged_at_step: number | null };
    expect(r.ok).toBe(true);
    expect(r.diverged_at_step).toBe(2);
    expect(r.hash_ok).toBe(false);

    // GREEN guard: a clean trace reports null.
    write(FIXTURE("clean"), cleanTraceMcp);
    const rClean = api.inspect_trace({
      trace_path: FIXTURE("clean"),
    }) as { ok: boolean; hash_ok: boolean; diverged_at_step: number | null };
    expect(rClean.ok).toBe(true);
    expect(rClean.diverged_at_step).toBeNull();
  });

  it("(5) non-vacuity: divergedAtStep must equal N exactly — undefined would fail cases 2 and 3", () => {
    // This case re-asserts the discriminating property directly: when a SPECIFIC
    // step is corrupted, divergedAtStep is that exact index, not undefined and not
    // a different index. A pre-fix implementation (returning undefined) would fail.
    const step0 = corruptAt(newTrace(), 0);
    expect(replayTrace(step0, microRules).divergedAtStep).toBe(0);

    const step3 = corruptAt(newTrace(), 3);
    expect(replayTrace(step3, microRules).divergedAtStep).toBe(3);

    // And a v1 trace (no per_step_hashes) must replay without error, divergedAtStep undefined.
    const { per_step_hashes: _omit, ...v1 } = newTrace();
    const v1Result = replayTrace(v1 as RpgTrace, microRules);
    expect(v1Result.ok).toBe(true);
    expect(v1Result.divergedAtStep).toBeUndefined();
  });
});
