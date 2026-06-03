/**
 * The contamination signal must be read PER MODE, not off the composition-sensitive
 * cross-mode headline (bug_0198).
 *
 * bug_0178's `benchmark_headline_no_regression` guards the cross-mode curated→held-out
 * gap (`MIN_SPLIT_GAP`) as the contamination proxy: held-out is the "distinct lower
 * number". But that headline `score` is a FLAT mean over a split's packs, so it tracks
 * the split's MODE MIX, not just difficulty. The deterministic coverage bot completes
 * CYOA packs (~0.7 composite) but cannot plan the multi-step parser/RPG puzzles
 * (~0.15). The curated split keeps gaining authored puzzle packs while the held-out
 * corpus stays mode-balanced (4 CYOA / 4 parser / 4 RPG), so the cross-mode gap was
 * eroding toward `MIN_SPLIT_GAP` as a COMPOSITION ARTIFACT — the exact "may eventually
 * need the composite/splits rethought" WATCH bug_0196 recorded.
 *
 * Read mode-matched, the picture is different from the cross-mode mean:
 *   - CYOA   : curated > held-out by a material margin — the contamination gap is REAL
 *              here, the only mode the bot can actually complete.
 *   - parser : held-out is ABOVE curated (the generated packs are bot-easier than the
 *              richer authored parser packs) — the cross-mode "held < curated" ordering
 *              does NOT hold within this mode.
 *   - RPG    : the two are within noise — both floor out near the bot's planning ceiling.
 *
 * So the cross-mode gap is not a uniform per-mode ordering; it is dominated by the
 * curated split's higher CYOA share. `summarizeByMode` exposes the gap WITHIN each
 * mode, where pack difficulty is roughly held constant, making the contamination
 * signal robust to the curated split's drifting mode composition. This test pins that
 * mode-matched reading so future packs erode the cross-mode headline without anyone
 * mistaking composition drift for a contamination collapse.
 *
 * Pinned at the documented runs=12 reading (same fixed, deterministic run count as the
 * headline test); the scorecard is deterministic at a fixed run count, so this is
 * reproducible, not flaky.
 */
import { describe, it, expect } from "vitest";
import { buildScorecard, type BenchmarkModeSummary } from "../../src/afk/benchmark.js";

const RUNS = 12;
const card = buildScorecard({ root: process.cwd(), runs: RUNS });

const r3 = (n: number): number => Math.round(n * 1000) / 1000;
const rowScore = (r: {
  completion_rate: number;
  ending_coverage: number;
  scene_coverage: number;
}) => (r.completion_rate + r.ending_coverage + r.scene_coverage) / 3;

const modeCell = (mode: string, split: BenchmarkModeSummary["split"]): BenchmarkModeSummary => {
  const s = card.mode_summary.find((x) => x.mode === mode && x.split === split);
  if (!s) throw new Error(`no mode_summary cell for ${mode}/${split}`);
  return s;
};

// CYOA carries the only real contamination gap (the bot completes CYOA, so its score
// has headroom to differ between splits); observed ~0.066 at runs=12. Floor, not exact.
const CYOA_GAP_FLOOR = 0.03;
// The cross-mode gap the headline guard pins (bug_0178). Used here only to show the
// per-mode view disagrees with it — at least one mode's gap falls below it.
const CROSS_MODE_MIN_GAP = 0.05;

describe("benchmark contamination signal is composition-robust per mode (bug_0198)", () => {
  it("mode_summary covers exactly the (split, mode) pairs the primary-cell rows present", () => {
    const primary = card.rows.filter((r) => r.strategy === "coverage" && !r.hide_graph);
    const expected = [
      ...new Set(primary.map((r) => `${r.held_out ? "held_out" : "curated"}/${r.mode}`)),
    ].sort();
    const got = [...new Set(card.mode_summary.map((s) => `${s.split}/${s.mode}`))].sort();
    expect(got).toEqual(expected);
    // Ordered mode-alphabetical, curated before held-out within a mode (a stable,
    // byte-deterministic ordering the rendered table and the JSON both rely on).
    const order = card.mode_summary.map((s) => `${s.mode}:${s.split}`);
    expect(order).toEqual([...order].sort());
  });

  it("each mode_summary score equals an independent re-mean of its rows (self-consistency)", () => {
    // The semantic twin of the byte-pin: a stubbed/constant score would diverge here.
    for (const s of card.mode_summary) {
      const rows = card.rows.filter(
        (r) =>
          r.strategy === "coverage" &&
          !r.hide_graph &&
          r.mode === s.mode &&
          r.held_out === (s.split === "held_out"),
      );
      expect(s.packs).toBe(rows.length);
      expect(s.packs).toBeGreaterThan(0);
      expect(s.score).toBe(r3(rows.reduce((a, r) => a + rowScore(r), 0) / rows.length));
    }
  });

  it("the contamination gap is real and CURATED-higher in CYOA (the mode the bot completes)", () => {
    const cur = modeCell("cyoa", "curated");
    const held = modeCell("cyoa", "held_out");
    expect(cur.packs).toBeGreaterThan(0);
    expect(held.packs).toBeGreaterThan(0);
    // Mode-matched, the thesis property ("held-out is the distinct lower number") holds
    // where it can: in the only mode the bot can finish. Robust to curated mode drift.
    expect(held.score).toBeLessThan(cur.score);
    expect(cur.score - held.score).toBeGreaterThanOrEqual(CYOA_GAP_FLOOR);
  });

  it("the cross-mode headline gap is NOT a uniform per-mode ordering — why the slice exists", () => {
    // The weakest per-mode gap falls BELOW the cross-mode MIN_SPLIT_GAP the headline
    // guard pins — i.e. the headline gap is inflated by the curated split's CYOA share,
    // not by held-out being uniformly harder. (Here parser is even inverted.) This is
    // the witness that summarizeByMode adds signal the flat cross-mode mean masks.
    const modes = [...new Set(card.mode_summary.map((s) => s.mode))];
    const perModeGaps = modes
      .map((m) => {
        const c = card.mode_summary.find((s) => s.mode === m && s.split === "curated");
        const h = card.mode_summary.find((s) => s.mode === m && s.split === "held_out");
        return c && h ? c.score - h.score : null;
      })
      .filter((g): g is number => g !== null);
    expect(perModeGaps.length).toBeGreaterThanOrEqual(2);
    expect(Math.min(...perModeGaps)).toBeLessThan(CROSS_MODE_MIN_GAP);
  });
});
