import { describe, expect, it } from "vitest";
import { discoverTestFiles } from "../../scripts/ci-test-groups.js";
import {
  detectLanePartition,
  EXHAUSTIVE_PROOF_FILES,
  filterTestFilesByLane,
  LANE_NAMES,
  laneForTestFile,
  parseLaneProjects,
  readLaneProjects,
  readVitestProjects,
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
  it("keeps the duplicated proof list byte-identical to the exhaustive projects' includes", () => {
    // EXHAUSTIVE_PROOF_FILES cannot be imported INTO vitest.config.ts: the verifier's
    // suite-coverage guard parses that config as text and resolves only const bindings
    // declared in it, and it fails closed on a config it cannot read. So the list is
    // duplicated, and this is the assertion that makes the duplication safe. If it fails,
    // fix the copy in scripts/test-lanes.ts — do not relax the check.
    const lanes = readLaneProjects();
    const configured = readVitestProjects()
      .filter((project) => lanes.exhaustive.includes(project.name))
      .flatMap((project) => project.include);

    expect(configured.length).toBeGreaterThan(0);
    expect([...configured].sort()).toEqual([...EXHAUSTIVE_PROOF_FILES].sort());
    // Every entry names a real file: a renamed proof would otherwise leave both the config
    // pin and this copy pointing at nothing while the lanes still looked healthy.
    const discovered = new Set(discoverTestFiles());
    for (const proof of EXHAUSTIVE_PROOF_FILES) expect(discovered.has(proof)).toBe(true);
  });

  it("splits every discovered test file into exactly one lane", () => {
    const files = discoverTestFiles();
    const fast = filterTestFilesByLane(files, "fast");
    const exhaustive = filterTestFilesByLane(files, "exhaustive");

    expect(fast.length + exhaustive.length).toBe(files.length);
    expect([...fast, ...exhaustive].sort()).toEqual([...files].sort());
    expect(exhaustive.sort()).toEqual([...EXHAUSTIVE_PROOF_FILES].sort());
    // A file nobody has classified is ordinary, so a new test joins the lane that runs on
    // every commit rather than the one that runs once a night.
    expect(laneForTestFile("tests/unit/a_future_test.test.ts")).toBe("fast");
  });
});
