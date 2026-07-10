import { describe, expect, it } from "vitest";
import { sycophancyTelemetry, targetMetrics } from "../../src/feedback/metrics.js";
import type { ExitInterview } from "../../src/blind/exit_interview.js";

const iv = (clarity: number, bugs: number, conf: number, persona: string | null = "casual") => ({
  target: "overworld",
  persona,
  interview: {
    clarity,
    enjoyment: 3,
    goal_understood: true,
    got_stuck: false,
    confusions: Array(conf).fill("c"),
    bugs: Array(bugs).fill({ where: "w", severity: "S2", note: "n" }),
    best_moment: "b",
    worst_moment: "w",
    would_replay: true,
    verdict: "long enough verdict text",
  } as ExitInterview,
});

describe("metrics + sycophancy", () => {
  it("histograms and rates", () => {
    const m = targetMetrics([iv(5, 0, 0), iv(3, 1, 0), iv(1, 2, 2)]);
    expect(m[0]!.reports).toBe(3);
    expect(m[0]!.clarity.histogram).toEqual([1, 0, 1, 0, 1]);
  });

  it("zero-negative rate measures sycophancy without censoring", () => {
    const s = sycophancyTelemetry([iv(5, 0, 0), iv(4, 1, 0)]);
    expect(s.zero_negative_rate).toBe(0.5);
  });

  it("splits targets and computes per-persona breakdowns", () => {
    const rows = [
      iv(5, 0, 0, "skeptic"),
      iv(3, 1, 0, "skeptic"),
      { ...iv(4, 0, 0, "casual"), target: "sunken_barrow" },
    ];
    const m = targetMetrics(rows);
    expect(m.map((t) => t.target)).toEqual(["overworld", "sunken_barrow"]);
    const overworld = m.find((t) => t.target === "overworld")!;
    expect(overworld.by_persona.skeptic).toEqual({
      reports: 2,
      clarity_mean: 4,
      enjoyment_mean: 3,
      zero_negative_rate: 0.5,
    });
    expect(overworld.got_stuck_rate).toBe(0);
    expect(overworld.would_replay_rate).toBe(1);
  });

  it("excludes null personas from by_persona breakdowns but still counts them in totals", () => {
    const m = targetMetrics([iv(5, 0, 0, null), iv(3, 0, 0, "casual")]);
    expect(m[0]!.reports).toBe(2);
    expect(Object.keys(m[0]!.by_persona)).toEqual(["casual"]);
  });

  it("returns an empty array for no interviews", () => {
    expect(targetMetrics([])).toEqual([]);
  });

  it("sycophancy telemetry aggregates clarity/enjoyment histograms and per-persona zero-negative rates", () => {
    const s = sycophancyTelemetry([
      { persona: "skeptic", interview: iv(5, 0, 0).interview },
      { persona: "skeptic", interview: iv(2, 1, 1).interview },
      { persona: "casual", interview: iv(4, 0, 0).interview },
    ]);
    expect(s.reports).toBe(3);
    expect(s.clarity_histogram).toEqual([0, 1, 0, 1, 1]);
    expect(s.by_persona_zero_negative.skeptic).toBe(0.5);
    expect(s.by_persona_zero_negative.casual).toBe(1);
  });

  it("handles an empty interview set without NaN", () => {
    const s = sycophancyTelemetry([]);
    expect(s.reports).toBe(0);
    expect(s.zero_negative_rate).toBe(0);
    expect(s.clarity_histogram).toEqual([0, 0, 0, 0, 0]);
  });
});
