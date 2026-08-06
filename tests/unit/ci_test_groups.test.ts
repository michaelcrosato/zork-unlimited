import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assignTestGroups,
  discoverTestFiles,
  MEASURED_TEST_COST_MS,
  parseGroupArguments,
} from "../../scripts/ci-test-groups.js";

describe("CI test groups", () => {
  it("balances measured expensive files while assigning every file exactly once", () => {
    const files = [
      ...Object.keys(MEASURED_TEST_COST_MS),
      "tests/unit/a_future_test.test.ts",
      "tests/unit/b_future_test.test.ts",
      "tests/unit/c_future_test.test.ts",
    ];

    const groups = assignTestGroups(files, 2);
    const assigned = groups.flatMap((group) => group.files);

    expect(assigned).toHaveLength(files.length);
    expect(new Set(assigned)).toEqual(new Set(files));
    expect(groups[0]?.estimatedMs).toBeGreaterThan(0);
    expect(groups[1]?.estimatedMs).toBeGreaterThan(0);
    // The greedy grouping gets this deliberately adversarial input within
    // 20s, less than 0.5% of the sampled multi-million-ms total.
    expect(Math.abs((groups[0]?.estimatedMs ?? 0) - (groups[1]?.estimatedMs ?? 0))).toBeLessThan(
      20_000,
    );
  });

  it("keeps identical input deterministic and refuses duplicate discovery", () => {
    const files = ["tests/unit/future.test.ts", "tests/unit/other.test.ts"];
    expect(assignTestGroups(files, 2)).toEqual(assignTestGroups(files, 2));
    expect(() => assignTestGroups([files[0]!, files[0]!], 2)).toThrow("duplicate");
  });

  it("partitions the current discovered suite exactly once, including unmeasured future files", () => {
    const files = discoverTestFiles();
    const groups = assignTestGroups(files, 2);

    expect(files.length).toBeGreaterThan(400);
    expect(
      groups.flatMap((group) => group.files).sort((left, right) => left.localeCompare(right)),
    ).toEqual(files);
  });

  it("accepts only an explicit valid one-based group request", () => {
    expect(parseGroupArguments(["--count", "2", "--group", "2"])).toEqual({ count: 2, group: 2 });
    expect(() => parseGroupArguments(["--count", "2", "--group", "3"])).toThrow("Usage");
    expect(() => parseGroupArguments(["--group", "1"])).toThrow("Usage");
  });

  it("wires both CI jobs to dynamic groups while retaining the required verify gate", () => {
    const workflow = readFileSync(resolve(".github/workflows/ci.yml"), "utf8");

    expect(workflow).toContain("scripts/ci-test-groups.ts --count 2 --group");
    expect(workflow).not.toContain("--shard=");
    expect(workflow).toMatch(/^ {2}verify:$/m);
  });

  // AGENTS.md calls `crawl:smoke` a mandatory pre- and post-work gate and loop.sh treats a
  // red crawl as a halt, but branch protection keys on the single `verify` check. Until the
  // crawl-smoke job was in `verify.needs` a red mechanical gate could still be merged, so
  // pin both halves: the dependency edge and the result assertion that consumes it.
  it("blocks the required verify gate on the mechanical crawl job", () => {
    const workflow = readFileSync(resolve(".github/workflows/ci.yml"), "utf8");

    expect(workflow).toMatch(/^ {2}crawl-smoke:$/m);
    expect(workflow).toContain("needs: [verify-prerequisites, test-shards, crawl-smoke]");
    expect(workflow).toContain("CRAWL_SMOKE_RESULT: ${{ needs.crawl-smoke.result }}");
    expect(workflow).toContain('test "$CRAWL_SMOKE_RESULT" = success');
  });
});
