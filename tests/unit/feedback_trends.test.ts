import { describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyTrends,
  loadHotspotsFromDir,
  loadPreviousHotspots,
} from "../../src/feedback/trends.js";
import { HOTSPOTS_VERSION, type Hotspot, type HotspotsFile } from "../../src/feedback/schema.js";

function hotspot(overrides: Partial<Hotspot> = {}): Hotspot {
  return {
    id: "hs_a",
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
    sources: ["fleet"],
    personas: ["skeptic"],
    score: 10,
    fix_layer: "hint_text",
    evidence: [
      { source: "fleet", ref: "report_0001", excerpt: "couldn't tell the lever mattered" },
    ],
    trend: "new",
    prev_score: null,
    ...overrides,
  };
}

function hotspotsFile(hotspots: Hotspot[]): HotspotsFile {
  return {
    version: HOTSPOTS_VERSION,
    generated_at: "2026-07-09T00:00:00.000Z",
    commit: "deadbeef",
    inputs: {
      report_dirs: ["blind-tester/reports"],
      crawl_files: [],
      verified_reports: 4,
      rejected_reports: 0,
      crawl_findings: 0,
    },
    metrics: [],
    sycophancy: {
      reports: 4,
      zero_negative_rate: 0,
      clarity_histogram: [0, 0, 0, 0, 0],
      enjoyment_histogram: [0, 0, 0, 0, 0],
      by_persona_zero_negative: {},
    },
    hotspots,
    recommended_next_fix: hotspots[0]
      ? { hotspot_id: hotspots[0].id, rationale: "top score" }
      : null,
  };
}

describe("applyTrends", () => {
  it("marks a hotspot with no prior match as new, with a null prev_score", () => {
    const [result] = applyTrends(
      [hotspot({ id: "hs_new" })],
      hotspotsFile([hotspot({ id: "hs_a" })]),
    );
    expect(result!.trend).toBe("new");
    expect(result!.prev_score).toBeNull();
  });

  it("marks every hotspot new when there is no previous compile at all", () => {
    const [result] = applyTrends([hotspot({ id: "hs_a" })], null);
    expect(result!.trend).toBe("new");
    expect(result!.prev_score).toBeNull();
  });

  it("marks a hotspot regressed when its score exceeds 1.25x the previous score", () => {
    const previous = hotspotsFile([hotspot({ id: "hs_a", score: 10 })]);
    const [result] = applyTrends([hotspot({ id: "hs_a", score: 13 })], previous); // 13 > 12.5
    expect(result!.trend).toBe("regressed");
    expect(result!.prev_score).toBe(10);
  });

  it("marks a hotspot improved when its score drops below 0.8x the previous score", () => {
    const previous = hotspotsFile([hotspot({ id: "hs_a", score: 10 })]);
    const [result] = applyTrends([hotspot({ id: "hs_a", score: 7 })], previous); // 7 < 8
    expect(result!.trend).toBe("improved");
    expect(result!.prev_score).toBe(10);
  });

  it("marks a hotspot flat when its score stays within the 0.8x-1.25x band", () => {
    const previous = hotspotsFile([hotspot({ id: "hs_a", score: 10 })]);
    const [result] = applyTrends([hotspot({ id: "hs_a", score: 11 })], previous);
    expect(result!.trend).toBe("flat");
    expect(result!.prev_score).toBe(10);
  });

  it("matches purely on id, ignoring title/location/order", () => {
    const previous = hotspotsFile([
      hotspot({ id: "hs_a", score: 10, title: "old title @ somewhere else" }),
    ]);
    const [result] = applyTrends(
      [hotspot({ id: "hs_a", score: 10, title: "new title @ Barrow Mouth" })],
      previous,
    );
    expect(result!.trend).toBe("flat");
  });
});

describe("loadHotspotsFromDir", () => {
  it("returns null when hotspots.json is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "hotspots-empty-"));
    expect(loadHotspotsFromDir(dir)).toBeNull();
  });

  it("returns null when hotspots.json fails schema validation", () => {
    const dir = mkdtempSync(join(tmpdir(), "hotspots-bad-"));
    writeFileSync(join(dir, "hotspots.json"), JSON.stringify({ not: "a hotspots file" }));
    expect(loadHotspotsFromDir(dir)).toBeNull();
  });

  it("reads and validates a real hotspots.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "hotspots-ok-"));
    const file = hotspotsFile([hotspot({ id: "hs_a" })]);
    writeFileSync(join(dir, "hotspots.json"), JSON.stringify(file));
    expect(loadHotspotsFromDir(dir)?.hotspots[0]?.id).toBe("hs_a");
  });

  it("warns when an explicit --prev path's hotspots.json is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "hotspots-explicit-missing-"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    loadHotspotsFromDir(dir, /* isExplicit */ true);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("previous hotspots at") &&
        expect.stringContaining("unreadable") &&
        expect.stringContaining('trends will show "new"'),
    );
    warnSpy.mockRestore();
  });

  it("warns when an explicit path's hotspots.json fails schema validation", () => {
    const dir = mkdtempSync(join(tmpdir(), "hotspots-explicit-bad-"));
    writeFileSync(join(dir, "hotspots.json"), JSON.stringify({ not: "a hotspots file" }));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    loadHotspotsFromDir(dir, /* isExplicit */ true);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("previous hotspots at") &&
        expect.stringContaining("unreadable") &&
        expect.stringContaining('trends will show "new"'),
    );
    warnSpy.mockRestore();
  });

  it("does NOT warn when auto-scan path is missing (isExplicit=false)", () => {
    const dir = mkdtempSync(join(tmpdir(), "hotspots-autoscan-"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    loadHotspotsFromDir(dir, /* isExplicit */ false);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("loadPreviousHotspots", () => {
  it("returns null when the feedback dir doesn't exist", () => {
    const root = mkdtempSync(join(tmpdir(), "feedback-root-none-"));
    expect(loadPreviousHotspots(root, null)).toBeNull();
  });

  it("picks the newest stamp dir overall when beforeDir is null", () => {
    const root = mkdtempSync(join(tmpdir(), "feedback-root-"));
    const feedbackDir = join(root, "ai-runs", "feedback");
    for (const stamp of ["20260101T000000Z", "20260105T000000Z", "20260103T000000Z"]) {
      const dir = join(feedbackDir, stamp);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "hotspots.json"),
        JSON.stringify(hotspotsFile([hotspot({ id: stamp })])),
      );
    }
    const result = loadPreviousHotspots(root, null);
    expect(result?.hotspots[0]?.id).toBe("20260105T000000Z");
  });

  it("picks the newest stamp dir strictly before beforeDir", () => {
    const root = mkdtempSync(join(tmpdir(), "feedback-root-before-"));
    const feedbackDir = join(root, "ai-runs", "feedback");
    for (const stamp of ["20260101T000000Z", "20260105T000000Z", "20260103T000000Z"]) {
      const dir = join(feedbackDir, stamp);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "hotspots.json"),
        JSON.stringify(hotspotsFile([hotspot({ id: stamp })])),
      );
    }
    const result = loadPreviousHotspots(root, "20260105T000000Z");
    expect(result?.hotspots[0]?.id).toBe("20260103T000000Z");
  });

  it("skips a dir with no hotspots.json and falls back to the next newest", () => {
    const root = mkdtempSync(join(tmpdir(), "feedback-root-skip-"));
    const feedbackDir = join(root, "ai-runs", "feedback");
    mkdirSync(join(feedbackDir, "20260101T000000Z"), { recursive: true });
    writeFileSync(
      join(feedbackDir, "20260101T000000Z", "hotspots.json"),
      JSON.stringify(hotspotsFile([hotspot({ id: "20260101T000000Z" })])),
    );
    // Newest dir by name has NO hotspots.json (e.g. a half-written / in-progress compile).
    mkdirSync(join(feedbackDir, "20260109T000000Z"), { recursive: true });
    const result = loadPreviousHotspots(root, null);
    expect(result?.hotspots[0]?.id).toBe("20260101T000000Z");
  });

  it("returns null when no candidate dir has a valid hotspots.json", () => {
    const root = mkdtempSync(join(tmpdir(), "feedback-root-invalid-"));
    const feedbackDir = join(root, "ai-runs", "feedback");
    mkdirSync(join(feedbackDir, "20260101T000000Z"), { recursive: true });
    expect(loadPreviousHotspots(root, null)).toBeNull();
  });
});
