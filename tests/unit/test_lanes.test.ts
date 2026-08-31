import { describe, expect, it } from "vitest";
import {
  detectLanePartition,
  LANE_NAMES,
  parseLaneProjects,
  readLaneProjects,
  readVitestProjectNames,
} from "../../scripts/test-lanes.js";

describe("test lanes", () => {
  it("reads every --project form a lane script may use", () => {
    expect(
      parseLaneProjects("vitest run --reporter=dot --project standard --project other"),
    ).toEqual(["standard", "other"]);
    expect(parseLaneProjects("vitest run --project=standard")).toEqual(["standard"]);
    // A dangling flag selects nothing rather than swallowing the next flag as a name.
    expect(parseLaneProjects("vitest run --project --reporter=dot")).toEqual([]);
    expect(parseLaneProjects("vitest run --reporter=dot")).toEqual([]);
  });

  it("reports a project that no lane runs, an unknown name, and a double-counted project", () => {
    expect(
      detectLanePartition({ fast: ["standard"], exhaustive: ["census"] }, ["standard", "census"]),
    ).toEqual([]);

    // The silent skip this guard exists for: a new project lands in vitest.config.ts and
    // neither lane names it, so it never runs while both lanes still exit 0.
    const orphaned = detectLanePartition({ fast: ["standard"], exhaustive: ["census"] }, [
      "standard",
      "census",
      "brand-new-proof",
    ]);
    expect(orphaned).toHaveLength(1);
    expect(orphaned[0]).toContain('vitest project "brand-new-proof" runs in NO lane');

    // A renamed project leaves the lane pointing at a name vitest does not define.
    const stale = detectLanePartition({ fast: ["standard"], exhaustive: ["typo-census"] }, [
      "standard",
      "census",
    ]);
    expect(stale.some((problem) => problem.includes('selects project "typo-census"'))).toBe(true);
    expect(stale.some((problem) => problem.includes('"census" runs in NO lane'))).toBe(true);

    const doubled = detectLanePartition({ fast: ["standard"], exhaustive: ["standard"] }, [
      "standard",
    ]);
    expect(doubled).toEqual([
      'vitest project "standard" runs in more than one lane (fast, exhaustive)',
    ]);

    expect(detectLanePartition({ fast: [], exhaustive: ["standard"] }, ["standard"])).toContain(
      "lane fast selects no vitest project at all",
    );
  });

  it("partitions this repository's real vitest projects across the real lane scripts", () => {
    const lanes = readLaneProjects();
    const configProjects = readVitestProjectNames();

    expect(configProjects.length).toBeGreaterThan(1);
    expect(detectLanePartition(lanes, configProjects)).toEqual([]);
    expect(LANE_NAMES.flatMap((lane) => lanes[lane]).sort()).toEqual([...configProjects].sort());
    // The fast lane is the pre-commit bar; the exhaustive lane is what it defers.
    expect(lanes.fast).toContain("standard");
    expect(lanes.exhaustive.length).toBeGreaterThan(0);
  });
});
