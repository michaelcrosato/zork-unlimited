/**
 * The objective benchmark scorecard (ULTRAPLAN 2026-06-02). Verifies it scores
 * every playable pack, that its metrics are well-formed fractions, and that it is
 * DETERMINISTIC — the property that makes a scorecard a benchmark rather than a
 * one-off reading.
 */
import { describe, it, expect } from "vitest";
import { buildScorecard, renderMarkdown, renderJson } from "../../src/afk/benchmark.js";

// A small run count keeps the suite fast; determinism does not depend on it.
const card = buildScorecard({ root: process.cwd(), runs: 12 });

describe("buildScorecard()", () => {
  it("scores every mode across both strategies", () => {
    expect(card.rows.length).toBeGreaterThan(0);
    const modes = new Set(card.rows.map((r) => r.mode));
    expect(modes.has("cyoa")).toBe(true);
    expect(modes.has("parser")).toBe(true);
    expect(modes.has("rpg")).toBe(true);
    const strategies = new Set(card.rows.map((r) => r.strategy));
    expect(strategies.has("coverage")).toBe(true);
    expect(strategies.has("random")).toBe(true);
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
    }
  });

  it("is deterministic: same repo + runs ⇒ byte-identical scorecard", () => {
    const again = buildScorecard({ root: process.cwd(), runs: 12 });
    expect(renderJson(again)).toBe(renderJson(card));
  });

  it("renders a markdown table with a row per scored cell", () => {
    const md = renderMarkdown(card);
    expect(md).toContain("# Benchmark Scorecard");
    expect(md).toContain("| Pack | Mode | Strategy |");
    // One table row per scored cell (plus header + separator).
    const tableRows = md.split("\n").filter((l) => l.startsWith("| ") && !l.includes("---"));
    expect(tableRows.length).toBe(card.rows.length + 1); // +1 header
  });
});
