/**
 * The committed benchmark scorecard (`traces/benchmark/scorecard.{json,md}`) must stay
 * BYTE-IDENTICAL to a live rebuild — a freshness pin (the deferred-#1 lever, the last
 * unguarded committed benchmark artifact).
 *
 * The scorecard is the project's headline objective signal (ULTRAPLAN 2026-06-02): one
 * comparable row per (pack, strategy), curated vs held-out. But it is a GENERATED file
 * committed to disk, and nothing forced it to track reality — so it silently rotted. When
 * this pin was added the committed card still read "10 packs / 47.7% curated" while a fresh
 * runs=50 rebuild read "13 packs / 40.0% curated": dawn_beacon (bug_0187), friars_postern
 * (bug_0185) and wolf_winter (bug_0189) had each shipped without the scorecard being
 * regenerated, so the published headline score was stale by 7.7 points and three packs.
 *
 * `buildScorecard` is fully byte-deterministic (the bot is seeded; the only header field is
 * the constant `generated_by` string — no clock/RNG), so a rebuild-and-compare is a sound,
 * non-flaky guard. This test reconstructs the card through the EXACT code path `bin/benchmark.ts`
 * writes (`renderJson(card) + "\n"` / `renderMarkdown(card) + "\n"`, runs=50) and asserts the
 * committed bytes match. Any future pack added without `npm run benchmark -- --runs 50 --out
 * traces/benchmark/scorecard`, or any drift in the bot/benchmark logic, turns this RED — forcing
 * a deliberate, visible regeneration instead of a silently stale published score.
 *
 * The committed file's `runs_per_cell` is the source of truth for RUNS here; if the artifact is
 * ever re-pinned at a different runs count this test reads it back and stays self-consistent.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildScorecard, renderJson, renderMarkdown } from "../../src/afk/benchmark.js";

const root = process.cwd();
const jsonPath = join(root, "traces", "benchmark", "scorecard.json");
const mdPath = join(root, "traces", "benchmark", "scorecard.md");

const committedJson = readFileSync(jsonPath, "utf8");
const committedMd = readFileSync(mdPath, "utf8");

// The committed artifact declares the runs count it was built at; rebuild at the same count.
const RUNS = (JSON.parse(committedJson) as { runs_per_cell: number }).runs_per_cell;
const card = buildScorecard({ root, runs: RUNS });
// Exactly how bin/benchmark.ts serializes when writing `--out`.
const freshJson = renderJson(card) + "\n";
const freshMd = renderMarkdown(card) + "\n";

describe("benchmark scorecard — committed artifact is FRESH (freshness pin)", () => {
  it("declares a positive runs_per_cell (so the rebuild matches what was committed)", () => {
    expect(Number.isInteger(RUNS)).toBe(true);
    expect(RUNS).toBeGreaterThan(0);
  });

  it("scores EVERY playable pack — a pack added without regenerating the card fails here", () => {
    // The stale-card witness was exactly a missing-pack drift (10 → 13). Pin the pack set:
    // the rebuild's curated pack ids must all be present in the committed JSON, byte-for-byte.
    const curatedIds = new Set(card.rows.filter((r) => !r.held_out).map((r) => r.pack_id));
    expect(curatedIds.size).toBeGreaterThanOrEqual(13);
    for (const id of curatedIds) {
      expect(committedJson).toContain(`"pack_id": "${id}"`);
    }
  });

  it("committed scorecard.json is byte-identical to a fresh rebuild", () => {
    expect(committedJson).toBe(freshJson);
  });

  it("committed scorecard.md is byte-identical to a fresh rebuild", () => {
    expect(committedMd).toBe(freshMd);
  });

  it("the headline curated score in the committed card matches the rebuild (no stale number)", () => {
    const freshCurated = card.summary.find((s) => s.split === "curated");
    expect(freshCurated).toBeDefined();
    // The exact headline percentage the rebuild reports must appear verbatim in the committed md.
    const pct = (freshCurated!.score * 100).toFixed(1);
    expect(committedMd).toContain(`**${pct}%**`);
  });
});
