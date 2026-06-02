/**
 * bug_0142 — the benchmark gains a turns-to-end efficiency axis.
 *
 * The scorecard measured WHAT the bot reached (completion, ending/scene coverage)
 * but not HOW DIRECTLY it got there. `mean_turns_to_end` adds that: the mean number
 * of actions to reach an ending, over completed runs only. It is designed to pair
 * with hide_graph (an agent that completes a spatial pack both ways wanders more when
 * blind), but it is an efficiency reading in its own right. This pins the tool-API
 * plumbing the scorecard's new column rides on:
 *   - run_playtest reports a numeric mean_turns_to_end;
 *   - it is >= 1 on a pack the bot completes (an ending takes at least one action),
 *     and exactly 0 on a pack it never completes (the rendered "—" case);
 *   - it is deterministic (same seeds ⇒ same mean);
 *   - it is graph-agnostic for CYOA (no room graph), like every other CYOA metric.
 * A regression here would mean the aggregate drifted, leaked across runs, or started
 * counting actions on UNFINISHED runs (which would corrupt the efficiency reading).
 */
import { describe, it, expect } from "vitest";
import { createToolApi } from "../../src/mcp/tools.js";

const ROOT = process.cwd();
const RUNS = 12;
const api = createToolApi({ root: ROOT });

// watchtower_road: the coverage bot completes every run (a fully reachable CYOA).
const CYOA_COMPLETES = "content/cyoa/pack/watchtower_road.yaml";
// alchemists_tower: a parser PUZZLE pack the coverage bot cannot solve (0% completion).
const PARSER_UNSOLVED = "content/parser/pack/alchemists_tower.yaml";

describe("bug_0142 — run_playtest mean_turns_to_end", () => {
  it("is a positive mean (>= 1) on a pack the coverage bot completes", () => {
    const pt = api.run_playtest({ story_path: CYOA_COMPLETES, strategy: "coverage", runs: RUNS });
    expect(pt.ended).toBeGreaterThan(0);
    expect(typeof pt.mean_turns_to_end).toBe("number");
    // An ending is reached by at least one action, so the mean is at least 1, and a
    // mean of step counts can never exceed the per-run max_steps cap (80).
    expect(pt.mean_turns_to_end).toBeGreaterThanOrEqual(1);
    expect(pt.mean_turns_to_end).toBeLessThanOrEqual(80);
  });

  it("is exactly 0 when the bot never reaches an ending (the rendered dash)", () => {
    const pt = api.run_playtest({ story_path: PARSER_UNSOLVED, strategy: "coverage", runs: RUNS });
    expect(pt.ended).toBe(0);
    expect(pt.mean_turns_to_end).toBe(0);
  });

  it("is deterministic: same pack + runs ⇒ identical mean", () => {
    const a = api.run_playtest({ story_path: CYOA_COMPLETES, strategy: "coverage", runs: RUNS });
    const b = api.run_playtest({ story_path: CYOA_COMPLETES, strategy: "coverage", runs: RUNS });
    expect(b.mean_turns_to_end).toBe(a.mean_turns_to_end);
  });

  it("counts only COMPLETED runs: it stays bounded even when most runs time out", () => {
    // The unsolved parser pack has 0 completions, so the aggregate must not have
    // silently summed the 80-step unfinished runs into the mean — it reads 0, not 80.
    const pt = api.run_playtest({ story_path: PARSER_UNSOLVED, strategy: "coverage", runs: RUNS });
    expect(pt.unfinished).toBe(RUNS);
    expect(pt.mean_turns_to_end).toBe(0);
  });

  it("is graph-agnostic for CYOA (no room graph), like every other CYOA metric", () => {
    const shown = api.run_playtest({
      story_path: CYOA_COMPLETES,
      strategy: "coverage",
      runs: RUNS,
    });
    const hidden = api.run_playtest({
      story_path: CYOA_COMPLETES,
      strategy: "coverage",
      runs: RUNS,
      hide_graph: true,
    });
    expect(hidden.mean_turns_to_end).toBe(shown.mean_turns_to_end);
  });
});
