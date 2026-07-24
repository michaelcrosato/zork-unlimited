/**
 * Blind-run token/cost telemetry (blind-tester/telemetry.mjs) — the ROADMAP
 * lever "measure loop efficiency instead of guessing". The extraction is pinned
 * against the normalized provider-envelope fields; the summary must tolerate
 * partial and historical rows (nulls skipped per metric, never dropped rows).
 */
import { describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — plain-JS harness module without type declarations.
import * as blindTelemetry from "../../blind-tester/telemetry.mjs";

const { extractBlindTelemetry, parseBlindTelemetryEnvelope, summarizeBlindTelemetry } =
  blindTelemetry;

// Representative normalized envelope, including historical nominal-cost fields.
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
  it("flattens the normalized envelope + run metadata into one row", () => {
    const row = extractBlindTelemetry(ENVELOPE, {
      ts: "2026-07-07T00:00:00.000Z",
      source: "overworld",
      seed: "7",
      model: "gpt-5.3-codex-spark",
    });

    expect(row).toEqual({
      ts: "2026-07-07T00:00:00.000Z",
      source: "overworld",
      phase: "playthrough",
      report_outcome: null,
      seed: 7,
      model: "gpt-5.3-codex-spark",
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

  it("retains historical report-recovery outcomes without relabeling them as playthroughs", () => {
    const row = extractBlindTelemetry(ENVELOPE, {
      source: "overworld",
      phase: "report_recovery",
      outcome: "failed",
    });
    expect(row).toMatchObject({
      phase: "report_recovery",
      report_outcome: "failed",
      total_cost_usd: 1.42,
    });
  });

  it("turns empty or malformed CLI output into a null-usage envelope", () => {
    expect(parseBlindTelemetryEnvelope("")).toEqual({});
    expect(parseBlindTelemetryEnvelope("{partial")).toEqual({});
    expect(parseBlindTelemetryEnvelope(JSON.stringify(ENVELOPE))).toEqual(ENVELOPE);
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
      extractBlindTelemetry(
        { ...ENVELOPE, total_cost_usd: 0.08, usage: { output_tokens: 320 } },
        { source: "overworld", phase: "report_recovery", outcome: "failed" },
      ),
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
      recovery_attempts: 1,
      recovery_failed: 1,
      recovery_total_cost_usd: 0.08,
      recovery_output_tokens: 320,
    });
    const quest = summary.find((s: { source: string }) => s.source === "sunken_barrow");
    // A failed, empty-envelope run still shows up — with null means, not fake zeros.
    expect(quest).toMatchObject({ runs: 1, failed: 1, mean_turns: null, mean_minutes: null });
  });

  it("counts terminal report outcomes instead of transport success", () => {
    const rows = [
      extractBlindTelemetry(ENVELOPE, {
        source: "overworld",
        phase: "playthrough",
        outcome: "verification_failed",
      }),
      extractBlindTelemetry(ENVELOPE, {
        source: "overworld",
        phase: "playthrough",
        outcome: "verified",
      }),
      extractBlindTelemetry(ENVELOPE, {
        source: "overworld",
        phase: "playthrough",
        outcome: "verified_receipt_bound",
      }),
      extractBlindTelemetry(
        {},
        {
          source: "overworld",
          phase: "playthrough",
          outcome: "technical_timeout",
        },
      ),
    ];
    expect(summarizeBlindTelemetry(rows)[0]).toMatchObject({ runs: 4, failed: 2 });
  });
});
