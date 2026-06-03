/**
 * The benchmark headline scores must not SILENTLY REGRESS (bug_0178).
 *
 * bug_0177 rolled the per-pack rows up into one headline score per split and pinned
 * it — but only for SELF-CONSISTENCY: that `summary.score` equals an independent
 * re-mean of the rows, and that the curated baseline is `> 0`. That guard is blind to
 * the two failure modes that actually matter for a benchmark:
 *
 *   1. COLLAPSE — an engine / validator / generator / content regression that breaks
 *      the deterministic bot's progress (it can no longer reach endings or even
 *      explore rooms). The self-consistency test still passes: a headline that has
 *      cratered to ~0.05 still "equals the mean of the rows" and is still `> 0`. The
 *      number the benchmark "ultimately reports" would have quietly fallen off a cliff
 *      with nothing red.
 *
 *   2. INFLATION of the held-out split — the contamination-free corpus drifting into
 *      packs the greedy, no-planning bot trivially completes (a generator "deepening"
 *      that accidentally drops gating, or makes endings reachable without a plan).
 *      bug_0177 states the property explicitly: "the held-out being a DISTINCT, lower
 *      number is exactly the contamination-free signal". If the held-out score climbed
 *      toward — or past — the curated baseline, that signal would be DESTROYED, and
 *      again the self-consistency test would not notice. This is the score-level twin
 *      of the DGM "swap in a degraded eval distribution" launder the verifier-integrity
 *      guard fights at the hash level ([[verifier-assertion-guard]], arXiv 2510.14253).
 *
 * This is the standing "a score regression becomes a guarded signal" lever bug_0177
 * named for src/afk/assessor.ts — realised here as the ENFORCED verification bar (a
 * test that goes red) rather than the assessor's advisory ranking, which is the
 * stronger reading of "the automated verification is the bar" (docs/blind_playtest_protocol.md).
 *
 * The bands are deliberately WIDE — they catch a real regression, not benign drift.
 * curated carries a FLOOR only (the bot improving is welcome, never a failure);
 * held-out carries a two-sided BAND (both collapse AND inflation are real defects for
 * the contamination-free signal). The relative invariant `held_out < curated` encodes
 * bug_0177's "distinct lower number" property directly. Pinned at the documented runs=12
 * reading (curated 39.1%, held-out 33.5%); the scorecard is deterministic at a fixed run
 * count, so this is reproducible, not flaky.
 *
 * bug_0196 RE-PIN: the curated floor and the recorded curated reading dropped (49.1% → 39.1%)
 * when the 14th pack — The Breaking Weir, the first combatless skill-check RPG — shipped into
 * the CURATED split. This is NOT a collapse: the planning-free coverage bot cannot solve any
 * multi-step puzzle pack (the 6 existing parser/RPG packs already score ~0.13 composite), so a
 * 7th puzzle pack legitimately dilutes the curated mean. The floor is recalibrated to PRESERVE
 * its collapse-detection power, not weakened to pass: a single major curated pack cratering
 * (a CYOA pack ~0.75 → ~0.13) still drops the 14-pack mean by ~0.044, below the 0.35 floor.
 * WATCH (a future structural lever): the curated→held-out gap has thinned from ~0.156 to ~0.056
 * as curated gained puzzle packs the bot can't solve while held-out (generated) stays ~0.335;
 * adding more bot-unsolvable curated packs will erode the gap toward MIN_SPLIT_GAP and may
 * eventually need the composite/splits rethought.
 */
import { describe, it, expect } from "vitest";
import { buildScorecard, type BenchmarkSummary } from "../../src/afk/benchmark.js";

// The documented headline reading (bug_0196): curated 39.1%, held-out 33.5%.
const RUNS = 12;
const card = buildScorecard({ root: process.cwd(), runs: RUNS });

const bySplit = (split: BenchmarkSummary["split"]): BenchmarkSummary => {
  const s = card.summary.find((x) => x.split === split);
  if (!s) throw new Error(`no ${split} summary present`);
  return s;
};

// Bands. Each maps to a concrete failure the self-consistency test cannot see.
const CURATED_FLOOR = 0.35; // observed 0.391 (bug_0196, 14 packs) — below this a curated pack broke
const HELD_OUT_FLOOR = 0.25; // observed 0.335 — below this the bot can't even explore the corpus
const HELD_OUT_CEILING = 0.45; // observed 0.335 — above this the held-out difficulty has been destroyed
const MIN_SPLIT_GAP = 0.05; // the curated→held-out gap must stay material (observed ~0.056, bug_0196)

describe("benchmark headline — no silent score regression (bug_0178)", () => {
  it("reports exactly the two splits, curated before held-out", () => {
    // The shape the headline thesis names; a missing split would itself be a regression.
    expect(card.summary.map((s) => s.split)).toEqual(["curated", "held_out"]);
  });

  it("the curated baseline has not COLLAPSED (floor; improvement is welcome)", () => {
    const curated = bySplit("curated");
    // Floor only — a HIGHER curated score (a smarter bot, a clearer pack) must never fail.
    expect(curated.score).toBeGreaterThanOrEqual(CURATED_FLOOR);
    // Non-vacuity: genuinely played, not a stubbed constant (mirrors bug_0177's curated>0).
    expect(curated.packs).toBeGreaterThan(0);
  });

  it("the held-out (contamination-free) score stays in a sane BAND — not collapsed, not inflated", () => {
    const heldOut = bySplit("held_out");
    // Lower bound: a generator/engine regression that craters held-out exploration.
    expect(heldOut.score).toBeGreaterThanOrEqual(HELD_OUT_FLOOR);
    // Upper bound: the corpus drifting into bot-trivial packs — the contamination-free
    // difficulty destroyed (the score-level "degraded eval distribution" launder).
    expect(heldOut.score).toBeLessThanOrEqual(HELD_OUT_CEILING);
    expect(heldOut.packs).toBeGreaterThan(0);
  });

  it("the held-out score stays the DISTINCT LOWER number beneath the curated baseline", () => {
    // bug_0177's stated property: the contamination-free held-out figure is, and must
    // remain, lower than the curated baseline by a MATERIAL margin. This is the
    // run-count-robust inflation guard (the gap holds across runs 8/12/50), and it
    // would fire the moment held-out drifted up toward curated even within the band.
    const curated = bySplit("curated");
    const heldOut = bySplit("held_out");
    expect(heldOut.score).toBeLessThan(curated.score);
    expect(curated.score - heldOut.score).toBeGreaterThanOrEqual(MIN_SPLIT_GAP);
  });
});
