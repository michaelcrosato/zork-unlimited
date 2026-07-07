/**
 * Blind-run token/cost telemetry (blind-tester/telemetry.mjs) — the ROADMAP
 * lever "measure loop efficiency instead of guessing". The extraction is pinned
 * against the REAL claude CLI --output-format json envelope shape; the summary
 * must tolerate partial rows (nulls skipped per metric, never dropped rows).
 */
import { describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — plain-JS harness module without type declarations.
import { extractBlindTelemetry, summarizeBlindTelemetry } from "../../blind-tester/telemetry.mjs";

// Trimmed from a real overworld blind run's saved envelope.
const ENVELOPE = {
  type: "result",
  is_error: false,
  duration_ms: 445398,
  num_turns: 55,
  total_cost_usd: 1.42,
  usage: {
    input_tokens: 81,
    cache_creation_input_tokens: 56922,
    cache_read_input_tokens: 2512802,
    output_tokens: 21460,
  },
};

describe("extractBlindTelemetry", () => {
  it("flattens the claude envelope + run metadata into one row", () => {
    const row = extractBlindTelemetry(ENVELOPE, {
      ts: "2026-07-07T00:00:00.000Z",
      source: "overworld",
      seed: "7",
      model: "sonnet",
    });

    expect(row).toEqual({
      ts: "2026-07-07T00:00:00.000Z",
      source: "overworld",
      seed: 7,
      model: "sonnet",
      ok: true,
      duration_ms: 445398,
      num_turns: 55,
      total_cost_usd: 1.42,
      input_tokens: 81,
      output_tokens: 21460,
      cache_read_input_tokens: 2512802,
      cache_creation_input_tokens: 56922,
    });
  });

  it("degrades missing envelope fields to nulls instead of throwing", () => {
    const row = extractBlindTelemetry({}, { source: "overworld" });

    expect(row.source).toBe("overworld");
    expect(row.ok).toBeNull();
    expect(row.duration_ms).toBeNull();
    expect(row.num_turns).toBeNull();
    expect(row.total_cost_usd).toBeNull();
    expect(row.output_tokens).toBeNull();
  });

  it("marks failed runs (is_error true) so summaries can count them", () => {
    const row = extractBlindTelemetry({ ...ENVELOPE, is_error: true }, { source: "overworld" });
    expect(row.ok).toBe(false);
  });
});

describe("summarizeBlindTelemetry", () => {
  it("aggregates per source with means and totals, skipping nulls per metric", () => {
    const rows = [
      extractBlindTelemetry(ENVELOPE, { source: "overworld", seed: "7" }),
      extractBlindTelemetry(
        { ...ENVELOPE, num_turns: 45, duration_ms: 300_000, total_cost_usd: 1.0 },
        { source: "overworld", seed: "11" },
      ),
      extractBlindTelemetry({ is_error: true }, { source: "sunken_barrow" }),
    ];
    const summary = summarizeBlindTelemetry(rows);

    expect(summary).toHaveLength(2);
    const overworld = summary.find((s: { source: string }) => s.source === "overworld");
    expect(overworld).toMatchObject({
      runs: 2,
      failed: 0,
      total_cost_usd: 2.42,
      mean_turns: 50,
      output_tokens: 42920,
    });
    const quest = summary.find((s: { source: string }) => s.source === "sunken_barrow");
    // A failed, empty-envelope run still shows up — with null means, not fake zeros.
    expect(quest).toMatchObject({ runs: 1, failed: 1, mean_turns: null, mean_minutes: null });
  });
});
