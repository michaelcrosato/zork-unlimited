/**
 * Regression (§15) + §14 gate item 6: the recorded Stage-4 victory trace must
 * replay to its exact final hash forever. If any future change perturbs combat,
 * skill-check rolls, or the determinism contract, this goes red.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { indexRpgPack, buildRpgRules } from "../../src/rpg/runner.js";
import { runActions } from "../../src/trace/record.js";
import { replayTrace } from "../../src/trace/replay.js";
import type { Trace } from "../../src/trace/record.js";
import type { RpgAction } from "../../src/api/types.js";

describe("rpg barrow victory trace", () => {
  it("replays to its recorded final hash (combat + skill check are reproducible)", () => {
    const trace = JSON.parse(
      readFileSync("traces/rpg/barrow_victory.json", "utf8"),
    ) as Trace<RpgAction>;
    const loaded = loadRpgSourceFile("content/rpg/quests/sunken_barrow.yaml");
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    // The trace must match the pack it was recorded against (content-hash, §8.8).
    expect(trace.content_hash).toBe(loaded.compiled.contentHash);
    const rules = buildRpgRules(indexRpgPack(loaded.compiled.pack));
    const run = runActions(rules, trace.initial_state, trace.actions);
    // A matching hash is not enough for a named victory trace: rejected actions
    // leave state unchanged and can otherwise be laundered into a newly pinned hash.
    expect(run.steps.map((step) => step.ok)).toEqual(trace.actions.map(() => true));
    expect(run.finalState.ended).toBe(true);
    expect(run.finalState.endingId).toBe("ending_victory");
    expect(run.finalState.vars["hp"]).toBeGreaterThan(0);
    const result = replayTrace(trace, rules);
    expect(result.ok).toBe(true);
    expect(result.finalHash).toBe(trace.expected_final_hash);
  });
});
