/**
 * The benchmark scorecard scores the contamination-free HELD-OUT split, not only the
 * curated authored packs (bug_0165).
 *
 * The whole credibility of the successor benchmark (ULTRAPLAN 2026-06-02) rests on a
 * contamination-free held-out split — procedurally-generated packs sealed under
 * `corpus/` that no external agent or training set has seen. Before this, buildScorecard
 * played ONLY `list_stories()` (the ten authored disk packs), so the held-out corpus —
 * the uncontaminated signal the benchmark ultimately reports — never appeared in the
 * scorecard at all. This pins that every sealed corpus pack is now scored through the
 * SAME bot/cells as the curated baseline, tagged `held_out`, and that the held-out split
 * is genuinely PLAYED (not just enumerated) — without polluting the curated discovery.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildScorecard, renderJson, renderMarkdown } from "../../src/afk/benchmark.js";

type ManifestEntry = { mode: string; pack_id: string };
const manifest = JSON.parse(
  readFileSync(join(process.cwd(), "corpus", "manifest.json"), "utf8"),
) as { entries: ManifestEntry[] };

const card = buildScorecard({ root: process.cwd(), runs: 12 });
const held = card.rows.filter((r) => r.held_out);
const curated = card.rows.filter((r) => !r.held_out);

describe("benchmark scorecard — held-out corpus split", () => {
  it("scores EVERY sealed corpus pack, once per cell, tagged held_out", () => {
    // Non-empty corpus is a precondition for a meaningful held-out signal.
    expect(manifest.entries.length).toBeGreaterThan(0);
    const heldPackIds = new Set(held.map((r) => r.pack_id));
    const manifestPackIds = new Set(manifest.entries.map((e) => e.pack_id));
    expect(heldPackIds).toEqual(manifestPackIds);

    // Each held-out pack is scored across exactly the configured cells (mode preserved).
    for (const entry of manifest.entries) {
      const rowsForPack = held.filter((r) => r.pack_id === entry.pack_id);
      expect(rowsForPack.length).toBe(card.cells.length);
      expect(rowsForPack.every((r) => r.mode === entry.mode)).toBe(true);
    }
    // The full held-out row count is membership × cells — nothing silently dropped.
    expect(held.length).toBe(manifest.entries.length * card.cells.length);
  });

  it("the held-out split spans all three modes", () => {
    const modes = new Set(held.map((r) => r.mode));
    expect(modes.has("cyoa")).toBe(true);
    expect(modes.has("parser")).toBe(true);
    expect(modes.has("rpg")).toBe(true);
  });

  it("the held-out split is genuinely PLAYED, not just enumerated (non-vacuity)", () => {
    // Every held-out row actually ran the bot the full run count over a real pack.
    for (const r of held) {
      expect(r.runs).toBe(12);
      expect(r.scenes_total).toBeGreaterThan(0);
    }
    // The deterministic bot solves generated CYOA, so at least one held-out row must
    // reach a declared ending — proof the corpus was loaded and played, not listed.
    expect(held.some((r) => r.endings_reached > 0)).toBe(true);
  });

  it("held-out rows are well-formed fractional metrics (the curated invariants)", () => {
    for (const r of held) {
      expect(r.completed + r.unfinished).toBe(r.runs);
      for (const frac of [r.completion_rate, r.ending_coverage, r.scene_coverage]) {
        expect(frac).toBeGreaterThanOrEqual(0);
        expect(frac).toBeLessThanOrEqual(1);
      }
      expect(r.endings_reached).toBeLessThanOrEqual(r.endings_declared);
      expect(r.scenes_visited).toBeLessThanOrEqual(r.scenes_total);
    }
  });

  it("does NOT pollute the curated split: corpus pack ids never appear as curated", () => {
    expect(curated.length).toBeGreaterThan(0);
    expect(curated.every((r) => r.held_out === false)).toBe(true);
    const manifestPackIds = new Set(manifest.entries.map((e) => e.pack_id));
    // The curated rows are exactly the authored disk packs — no corpus id leaked in.
    expect(curated.some((r) => manifestPackIds.has(r.pack_id))).toBe(false);
  });

  it("is deterministic with the held-out split: same repo ⇒ byte-identical scorecard", () => {
    const again = buildScorecard({ root: process.cwd(), runs: 12 });
    expect(renderJson(again)).toBe(renderJson(card));
  });

  it("renders a Split column distinguishing held-out from curated rows", () => {
    const md = renderMarkdown(card);
    expect(md).toContain("| Pack | Mode | Strategy | Graph | Split |");
    expect(md).toContain("| held-out |");
    expect(md).toContain("| curated |");
    // One table row per scored cell across BOTH splits (plus the header row),
    // counted within the per-pack section so the headline summary table above it
    // is not miscounted as data rows.
    const perPack = md.slice(md.indexOf("## Per-pack rows"));
    const tableRows = perPack.split("\n").filter((l) => l.startsWith("| ") && !l.includes("---"));
    expect(tableRows.length).toBe(card.rows.length + 1);
  });
});
