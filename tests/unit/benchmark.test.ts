/**
 * The objective benchmark scorecard (ULTRAPLAN 2026-06-02). Verifies it scores
 * every playable pack, that its metrics are well-formed fractions, and that it is
 * DETERMINISTIC — the property that makes a scorecard a benchmark rather than a
 * one-off reading. Also pins the hide_graph spatial-difficulty axis (§Week.4).
 */
import { describe, it, expect } from "vitest";
import { buildScorecard, renderMarkdown, renderJson } from "../../src/afk/benchmark.js";

// A small run count keeps the suite fast; determinism does not depend on it.
const card = buildScorecard({ root: process.cwd(), runs: 12 });

describe("buildScorecard()", () => {
  it("scores every mode across the default cells (incl. a hidden-graph cell)", () => {
    expect(card.rows.length).toBeGreaterThan(0);
    const modes = new Set(card.rows.map((r) => r.mode));
    expect(modes.has("cyoa")).toBe(true);
    expect(modes.has("parser")).toBe(true);
    expect(modes.has("rpg")).toBe(true);
    const strategies = new Set(card.rows.map((r) => r.strategy));
    expect(strategies.has("coverage")).toBe(true);
    expect(strategies.has("random")).toBe(true);
    // The hidden-graph axis exists and is scored only for coverage (random is
    // graph-agnostic, so a hidden-graph random row would be redundant noise).
    expect(card.cells).toContainEqual({ strategy: "coverage", hide_graph: true });
    expect(card.rows.some((r) => r.hide_graph)).toBe(true);
    expect(card.rows.filter((r) => r.hide_graph).every((r) => r.strategy === "coverage")).toBe(
      true,
    );
  });

  it("every row is a well-formed set of fractional metrics", () => {
    for (const row of card.rows) {
      expect(row.runs).toBe(12);
      expect(row.completed + row.unfinished).toBe(row.runs);
      for (const frac of [row.completion_rate, row.ending_coverage, row.scene_coverage]) {
        expect(frac).toBeGreaterThanOrEqual(0);
        expect(frac).toBeLessThanOrEqual(1);
      }
      expect(row.endings_reached).toBeLessThanOrEqual(row.endings_declared);
      expect(row.scenes_visited).toBeLessThanOrEqual(row.scenes_total);
      // Turns-to-end is defined only over completed runs: a completed row took at
      // least one action to reach an ending; a 0%-completion row reads exactly 0.
      if (row.completed > 0) {
        expect(row.mean_turns_to_end).toBeGreaterThanOrEqual(1);
        expect(row.mean_turns_to_end).toBeLessThanOrEqual(80); // a mean ≤ the max_steps cap
      } else {
        expect(row.mean_turns_to_end).toBe(0);
      }
    }
  });

  it("hiding the graph is a NO-OP for CYOA (no room graph) and BITES on parser/RPG", () => {
    const find = (mode: string, hide: boolean): typeof card.rows =>
      card.rows.filter(
        (r) => r.mode === mode && r.strategy === "coverage" && r.hide_graph === hide,
      );

    // CYOA: every pack's hidden coverage row equals its shown coverage row exactly.
    const cyoaShown = find("cyoa", false);
    const cyoaHidden = find("cyoa", true);
    expect(cyoaShown.length).toBeGreaterThan(0);
    expect(cyoaHidden.length).toBe(cyoaShown.length);
    for (const shown of cyoaShown) {
      const hidden = cyoaHidden.find((r) => r.pack_id === shown.pack_id)!;
      expect(hidden.scene_coverage).toBe(shown.scene_coverage);
      expect(hidden.completion_rate).toBe(shown.completion_rate);
      expect(hidden.ending_coverage).toBe(shown.ending_coverage);
      // CYOA has no room graph, so turns-to-end is graph-agnostic too.
      expect(hidden.mean_turns_to_end).toBe(shown.mean_turns_to_end);
    }

    // Spatial modes: at least one pack loses scene coverage when the graph is hidden
    // (the bot can no longer steer toward unvisited rooms). That measurable drop is
    // the whole point — the difficulty is real, not cosmetic.
    const spatialShown = [...find("parser", false), ...find("rpg", false)];
    const spatialHidden = [...find("parser", true), ...find("rpg", true)];
    expect(spatialShown.length).toBeGreaterThan(0);
    let droppedSomewhere = false;
    for (const shown of spatialShown) {
      const hidden = spatialHidden.find((r) => r.pack_id === shown.pack_id)!;
      // Hiding navigational hints never IMPROVES the coverage bot's exploration.
      expect(hidden.scene_coverage).toBeLessThanOrEqual(shown.scene_coverage);
      if (hidden.scene_coverage < shown.scene_coverage) droppedSomewhere = true;
    }
    expect(droppedSomewhere).toBe(true);
  });

  it("is deterministic: same repo + runs ⇒ byte-identical scorecard", () => {
    const again = buildScorecard({ root: process.cwd(), runs: 12 });
    expect(renderJson(again)).toBe(renderJson(card));
  });

  it("renders a markdown table with a Graph column and a row per scored cell", () => {
    const md = renderMarkdown(card);
    expect(md).toContain("# Benchmark Scorecard");
    expect(md).toContain("| Pack | Mode | Strategy | Graph |");
    expect(md).toContain("Turns→end |"); // the efficiency axis column
    expect(md).toContain("| hidden |");
    expect(md).toContain("| shown |");
    // A 0%-completion row renders turns-to-end as a dash, not a misleading "0.0".
    if (card.rows.some((r) => r.completed === 0)) expect(md).toContain("| — |");
    // One table row per scored cell (plus header + separator).
    const tableRows = md.split("\n").filter((l) => l.startsWith("| ") && !l.includes("---"));
    expect(tableRows.length).toBe(card.rows.length + 1); // +1 header
  });
});
