/**
 * bug_0138 — the benchmark's hide_graph axis is measurable, not just available.
 *
 * bug_0137 added the opt-in hidden-graph observation difficulty (parser/RPG exits
 * stop leaking their destination) but it was invisible: nothing exercised it, so
 * the difficulty existed without a number. This pins the tool-API plumbing the
 * scorecard's hidden-graph cell rides on:
 *   - run_playtest({hide_graph:true}) degrades the coverage bot's parser/RPG scene
 *     coverage (it can no longer steer toward unvisited rooms — it navigates blind);
 *   - it is a NO-OP for CYOA (which has no room graph);
 *   - it is observation-only, so it never changes WHICH endings are declared.
 * A regression here would mean either the flag stopped reaching the bot's
 * observation (silently no-op) or it leaked into state.
 */
import { describe, it, expect } from "vitest";
import { createToolApi } from "../../src/mcp/tools.js";

const ROOT = process.cwd();
const RUNS = 12;
const api = createToolApi({ root: ROOT });

const PARSER = "content/parser/pack/sealed_crypt.yaml";
const RPG = "content/rpg/pack/sunken_barrow.yaml";
const CYOA = "content/cyoa/pack/wreckers_light.yaml";

const sceneCov = (pt: ReturnType<typeof api.run_playtest>): number => {
  const visited = pt.visited_scenes?.length ?? 0;
  const total = visited + (pt.unvisited_scenes?.length ?? 0);
  return total > 0 ? visited / total : 1;
};

describe("bug_0138 — benchmark hide_graph axis", () => {
  it("hiding the graph strictly degrades the coverage bot on a parser pack", () => {
    const shown = api.run_playtest({ story_path: PARSER, strategy: "coverage", runs: RUNS });
    const hidden = api.run_playtest({
      story_path: PARSER,
      strategy: "coverage",
      runs: RUNS,
      hide_graph: true,
    });
    // Same declared endings (observation-only change), strictly worse exploration.
    expect(hidden.endings_declared).toEqual(shown.endings_declared);
    expect(sceneCov(hidden)).toBeLessThan(sceneCov(shown));
  });

  it("hiding the graph strictly degrades the coverage bot on an RPG pack", () => {
    const shown = api.run_playtest({ story_path: RPG, strategy: "coverage", runs: RUNS });
    const hidden = api.run_playtest({
      story_path: RPG,
      strategy: "coverage",
      runs: RUNS,
      hide_graph: true,
    });
    expect(hidden.endings_declared).toEqual(shown.endings_declared);
    expect(sceneCov(hidden)).toBeLessThan(sceneCov(shown));
  });

  it("is a no-op for CYOA (no room graph): identical coverage with and without", () => {
    const shown = api.run_playtest({ story_path: CYOA, strategy: "coverage", runs: RUNS });
    const hidden = api.run_playtest({
      story_path: CYOA,
      strategy: "coverage",
      runs: RUNS,
      hide_graph: true,
    });
    expect(sceneCov(hidden)).toBe(sceneCov(shown));
    expect(hidden.ending_distribution).toEqual(shown.ending_distribution);
  });

  it("random play is graph-agnostic — hide_graph leaves it unchanged", () => {
    const shown = api.run_playtest({ story_path: PARSER, strategy: "random", runs: RUNS });
    const hidden = api.run_playtest({
      story_path: PARSER,
      strategy: "random",
      runs: RUNS,
      hide_graph: true,
    });
    // Random never consults exit destinations, so the same seed stream visits the
    // same rooms whether the graph is shown or hidden.
    expect(hidden.visited_scenes).toEqual(shown.visited_scenes);
    expect(hidden.ending_distribution).toEqual(shown.ending_distribution);
  });
});
