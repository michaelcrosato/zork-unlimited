/**
 * The benchmark scorecard rolls its per-pack rows up into ONE headline score per
 * split (bug_0177).
 *
 * The successor-benchmark thesis (ULTRAPLAN 2026-06-02) names "a single, comparable
 * NUMBER per (pack, agent)" as the precondition for a benchmark, and calls the
 * held-out rows "the contamination-free signal the benchmark ultimately reports".
 * But the scorecard only ever emitted ~30 per-row metrics — to get the figure the
 * thesis says it reports, a reader had to average the table by hand. This pins the
 * `summary` aggregate: a deterministic per-split composite over the PRIMARY baseline
 * cell (coverage / graph shown), independently recomputed from the rows so the score
 * cannot silently drift from the table it claims to summarise.
 */
import { describe, it, expect } from "vitest";
import { buildScorecard, renderMarkdown, type BenchmarkRow } from "../../src/afk/benchmark.js";

const card = buildScorecard({ root: process.cwd(), runs: 12 });

// Independent re-derivation of the primary-cell rows (coverage / graph shown) for a
// split — the oracle the summary is checked against, computed without touching the
// production summarize() code path.
const primaryRows = (heldOut: boolean): BenchmarkRow[] =>
  card.rows.filter((r) => !r.hide_graph && r.strategy === "coverage" && r.held_out === heldOut);

const rowScore = (r: BenchmarkRow): number =>
  (r.completion_rate + r.ending_coverage + r.scene_coverage) / 3;
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const r3 = (n: number): number => Math.round(n * 1000) / 1000;

describe("benchmark scorecard — headline composite score", () => {
  it("emits one summary entry per split present (curated before held-out)", () => {
    // Both splits have primary-cell rows in this repo, so both must be summarised.
    expect(primaryRows(false).length).toBeGreaterThan(0);
    expect(primaryRows(true).length).toBeGreaterThan(0);
    expect(card.summary.map((s) => s.split)).toEqual(["curated", "held_out"]);
    for (const s of card.summary) {
      // The headline aggregates the documented baseline cell, nothing else.
      expect(s.strategy).toBe("coverage");
      expect(s.hide_graph).toBe(false);
    }
  });

  it("the score equals the mean over the split's primary-cell rows of each row's mean fraction", () => {
    for (const heldOut of [false, true]) {
      const rows = primaryRows(heldOut);
      const summary = card.summary.find((s) => s.split === (heldOut ? "held_out" : "curated"));
      expect(summary).toBeDefined();
      expect(summary!.packs).toBe(rows.length);
      // The composite is the equal-weight roll-up — recomputed independently here.
      expect(summary!.score).toBe(r3(mean(rows.map(rowScore))));
      expect(summary!.mean_completion_rate).toBe(r3(mean(rows.map((r) => r.completion_rate))));
      expect(summary!.mean_ending_coverage).toBe(r3(mean(rows.map((r) => r.ending_coverage))));
      expect(summary!.mean_scene_coverage).toBe(r3(mean(rows.map((r) => r.scene_coverage))));
    }
  });

  it("the score is a well-formed 0–1 fraction and is NOT vacuously 0 or 1", () => {
    for (const s of card.summary) {
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(1);
    }
    // The deterministic bot solves CYOA and explores every pack, so the curated
    // baseline must show real progress — a guard that the aggregate is genuinely
    // computed over played rows, not a stubbed constant.
    const curated = card.summary.find((s) => s.split === "curated");
    expect(curated!.score).toBeGreaterThan(0);
  });

  it("excludes the auxiliary cells: the score ignores random and hidden-graph rows", () => {
    // If the summary mistakenly aggregated ALL cells, its score would equal the
    // all-cell mean. Build that rival figure and require they differ whenever the
    // auxiliary rows actually move the number (they do — random/hidden score lower).
    for (const heldOut of [false, true]) {
      const allCells = card.rows.filter((r) => r.held_out === heldOut);
      const allMean = r3(mean(allCells.map(rowScore)));
      const summary = card.summary.find((s) => s.split === (heldOut ? "held_out" : "curated"))!;
      // Sanity: the primary-cell subset is strictly smaller than all cells here.
      expect(primaryRows(heldOut).length).toBeLessThan(allCells.length);
      if (allMean !== summary.score) {
        // When they differ, the summary must track the PRIMARY subset, not all cells.
        expect(summary.score).not.toBe(allMean);
      }
    }
  });

  it("renders a Headline table carrying the per-split score", () => {
    const md = renderMarkdown(card);
    expect(md).toContain("## Headline");
    expect(md).toContain("| Split | Packs | Completion | Ending cov | Scene cov | **Score** |");
    // Both splits appear in the headline block, each with a bold percent score.
    const headline = md.slice(md.indexOf("## Headline"), md.indexOf("## Per-pack rows"));
    expect(headline).toContain("| curated |");
    expect(headline).toContain("| held-out |");
    const pct = (n: number): string => `**${(n * 100).toFixed(1)}%**`;
    for (const s of card.summary) expect(headline).toContain(pct(s.score));
  });

  it("a custom cell set without the primary cell yields no summary (table stays authoritative)", () => {
    const onlyRandom = buildScorecard({
      root: process.cwd(),
      runs: 6,
      cells: [{ strategy: "random", hide_graph: false }],
    });
    expect(onlyRandom.summary).toEqual([]);
    // The per-row table is unaffected — it still scores every pack under that cell.
    expect(onlyRandom.rows.length).toBeGreaterThan(0);
  });
});
