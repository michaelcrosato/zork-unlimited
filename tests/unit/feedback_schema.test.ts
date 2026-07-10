import { describe, expect, it } from "vitest";
import { HOTSPOTS_VERSION, HotspotsFileSchema } from "../../src/feedback/schema.js";

function validHotspot() {
  return {
    id: "hs_0001",
    title: "confusing lever @ Barrow Mouth",
    location: {
      kind: "quest",
      questId: "sunken_barrow",
      region: null,
      node: null,
      sceneId: "barrow_mouth",
      raw: ["barrow_mouth"],
    },
    severity_band: "moderate",
    max_severity: "S2",
    count: 3,
    sources: ["crawler", "fleet"],
    personas: ["skeptic"],
    score: 6.5,
    fix_layer: "hint_text",
    evidence: [
      { source: "fleet", ref: "report_0012", excerpt: "couldn't tell the lever mattered" },
    ],
    trend: "new",
    prev_score: null,
  };
}

function validHotspotsFile() {
  return {
    version: HOTSPOTS_VERSION,
    generated_at: "2026-07-09T00:00:00.000Z",
    commit: "deadbeef",
    inputs: {
      report_dirs: ["blind-tester/reports"],
      crawl_files: ["crawl-results/latest.json"],
      verified_reports: 12,
      rejected_reports: 2,
      crawl_findings: 5,
    },
    metrics: [
      {
        target: "sunken_barrow",
        reports: 4,
        clarity: { mean: 3.5, stddev: 0.8, histogram: [0, 1, 1, 1, 1] },
        enjoyment: { mean: 4.0, stddev: 0.5, histogram: [0, 0, 1, 1, 2] },
        got_stuck_rate: 0.25,
        would_replay_rate: 0.75,
        by_persona: {
          skeptic: { reports: 2, clarity_mean: 3.0, enjoyment_mean: 3.5, zero_negative_rate: 0.5 },
        },
      },
    ],
    sycophancy: {
      reports: 4,
      zero_negative_rate: 0.25,
      clarity_histogram: [0, 1, 1, 1, 1],
      enjoyment_histogram: [0, 0, 1, 1, 2],
      by_persona_zero_negative: { skeptic: 0.5 },
    },
    hotspots: [validHotspot()],
    recommended_next_fix: { hotspot_id: "hs_0001", rationale: "highest score, cheap content fix" },
  };
}

describe("hotspots file schema", () => {
  it("parses a valid HotspotsFile", () => {
    const result = HotspotsFileSchema.safeParse(validHotspotsFile());
    expect(result.success).toBe(true);
  });

  it("parses a null recommended_next_fix", () => {
    const result = HotspotsFileSchema.safeParse({
      ...validHotspotsFile(),
      recommended_next_fix: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown top-level key (strict)", () => {
    const result = HotspotsFileSchema.safeParse({ ...validHotspotsFile(), extra: true });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown nested key anywhere (strict at every level)", () => {
    const result = HotspotsFileSchema.safeParse({
      ...validHotspotsFile(),
      hotspots: [{ ...validHotspot(), extra_field: "nope" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown key in a deeply nested strict object", () => {
    const result = HotspotsFileSchema.safeParse({
      ...validHotspotsFile(),
      hotspots: [{ ...validHotspot(), location: { ...validHotspot().location, extra: "nope" } }],
    });
    expect(result.success).toBe(false);
  });

  it("enforces the severity_band enum", () => {
    const result = HotspotsFileSchema.safeParse({
      ...validHotspotsFile(),
      hotspots: [{ ...validHotspot(), severity_band: "catastrophic" }],
    });
    expect(result.success).toBe(false);
  });

  it("enforces the fix_layer enum", () => {
    const result = HotspotsFileSchema.safeParse({
      ...validHotspotsFile(),
      hotspots: [{ ...validHotspot(), fix_layer: "vibes" }],
    });
    expect(result.success).toBe(false);
  });

  it("enforces the version literal", () => {
    const result = HotspotsFileSchema.safeParse({ ...validHotspotsFile(), version: 2 });
    expect(result.success).toBe(false);
  });
});
