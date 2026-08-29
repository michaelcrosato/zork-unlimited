/**
 * The suite-shrink hole in the bar: vitest.config.ts decides which of the discovered test
 * files each project actually RUNS, and until detectSuiteCoverage existed, nothing in
 * `npm run health` read that file at all. It is not under tests/ (no count, no
 * disabled-marker scan), not in the tsconfig include list (no typecheck), and not in the
 * lint/format targets. Appending one glob to a project exclude array removes hundreds of
 * files from every shard while countTestCases, countAssertions, countStrongAssertions and
 * countTautologyAssertions stay byte-identical, DISABLED_RE finds nothing, no protected
 * file changes — and the shards still exit 0, because vitest silently ignores a per-file
 * filter that matches no project include and the shard step can only check that
 * ci-test-groups.ts (an independent readdir walk) produced a non-empty list.
 *
 * These tests are the rejection-direction witness for that detector, in the style of
 * verifier_static_rejection_corpus.test.ts: the exact audited attacks are replayed
 * against the REAL config text, each pinned to the specific finding code it must raise,
 * with the healthy config as the non-vacuity anchor. Every attack asserts that its own
 * edit actually landed, so a future reformat of the config makes these tests FAIL rather
 * than quietly stop testing anything.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  detectSuiteCoverage,
  parseVitestSuiteProjects,
  listTestFiles,
  runStatic,
  PROTECTED_FILES,
  VITEST_CONFIG_FILE,
} from "../../scripts/verify-integrity.js";

const root = process.cwd();
const configText = readFileSync(join(root, VITEST_CONFIG_FILE), "utf8");
const testPaths = listTestFiles(root);
const codes = (findings: { code: string }[]): string[] => findings.map((f) => f.code);

describe("the vitest config is inside the bar", () => {
  it("vitest.config.ts is a protected verification asset", () => {
    expect(PROTECTED_FILES).toContain("vitest.config.ts");
    expect(PROTECTED_FILES).toContain("scripts/ci-test-groups.ts");
  });

  it("the live config parses into every project with its include/exclude filters", () => {
    const projects = parseVitestSuiteProjects(configText);
    expect(projects).not.toBeNull();
    expect(projects!.length).toBeGreaterThanOrEqual(2);
    const standard = projects!.find((p) => p.name === "standard");
    expect(standard).toBeDefined();
    // The broad include is `tests/**` followed by `/*.test.ts`. Its middle is literally
    // a block-comment open and close, so a naive comment strip deletes it from the string
    // and turns the widest include in the file into a pattern matching nothing. Pin the
    // resolved value so that specific parser regression cannot come back silently.
    expect(standard!.include).toEqual(["tests/**/*.test.ts"]);
    expect(standard!.exclude.length).toBeGreaterThanOrEqual(6);
    // Every project other than standard claims exactly the files standard excludes.
    const claimedElsewhere = projects!
      .filter((p) => p.name !== "standard")
      .flatMap((p) => p.include)
      .sort();
    expect(claimedElsewhere).toEqual([...standard!.exclude].sort());
  });

  it("the healthy repo raises nothing — the anchor that makes the rejections below real", () => {
    expect(detectSuiteCoverage(configText, testPaths)).toEqual([]);
  });

  it("runStatic on the real repo raises no suite-coverage finding", () => {
    const res = runStatic(root);
    expect(res.findings.filter((f) => f.code === "SUITE_FILE_UNCLAIMED")).toEqual([]);
    expect(res.findings.filter((f) => f.code === "SUITE_FILTER_STALE")).toEqual([]);
    expect(res.findings.filter((f) => f.code === "SUITE_CONFIG_UNREADABLE")).toEqual([]);
  });
});

describe("suite-shrink attacks on the real config text are rejected", () => {
  it("BLOCKS a widened exclude glob that silently drops a whole test directory", () => {
    const attacked = configText.replace(
      "exclude: ALL_EXHAUSTIVE_RPG_PROOFS,",
      'exclude: [...ALL_EXHAUSTIVE_RPG_PROOFS, "tests/regression/**"],',
    );
    expect(attacked).not.toBe(configText); // the edit landed; this test is not vacuous
    const findings = detectSuiteCoverage(attacked, testPaths);
    expect(codes(findings)).toContain("SUITE_FILE_UNCLAIMED");
    expect(findings.every((f) => f.severity === "error")).toBe(true);
    // and it names the scale of the loss rather than a single file
    expect(findings[0]!.message).toMatch(/\d+ test file\(s\) are matched by no vitest project/);
    expect(findings[0]!.where).toBe(VITEST_CONFIG_FILE);
  });

  it("BLOCKS a narrowed include that quietly stops running most of the suite", () => {
    const attacked = configText.replace(
      'const STANDARD_TESTS = "tests/**/*.test.ts";',
      'const STANDARD_TESTS = "tests/unit/**/*.test.ts";',
    );
    expect(attacked).not.toBe(configText);
    expect(codes(detectSuiteCoverage(attacked, testPaths))).toContain("SUITE_FILE_UNCLAIMED");
  });

  it("BLOCKS a filter left pinned to a file that no longer exists", () => {
    const attacked = configText.replace(
      '"tests/regression/rpg_action_id_unique.test.ts"',
      '"tests/regression/rpg_action_id_unique_renamed.test.ts"',
    );
    expect(attacked).not.toBe(configText);
    const findings = detectSuiteCoverage(attacked, testPaths);
    expect(codes(findings)).toContain("SUITE_FILTER_STALE");
    expect(findings.every((f) => f.severity === "error")).toBe(true);
  });

  it("FAILS CLOSED on a config it cannot parse, rather than assuming coverage", () => {
    for (const unreadable of [
      "export default {};",
      "export default defineConfig({ test: { projects: [{ test: { name: 'x' } }] } });",
      'export default defineConfig({ test: { projects: [{ test: { include: ["tests/**/*.{test,spec}.ts"] } }] } });',
    ]) {
      const findings = detectSuiteCoverage(unreadable, testPaths);
      expect(codes(findings)).toEqual(["SUITE_CONFIG_UNREADABLE"]);
      expect(findings[0]!.severity).toBe("error");
    }
  });
});

describe("the check is wired into runStatic, not merely exported", () => {
  it("runStatic reports SUITE_FILE_UNCLAIMED on a root whose config runs nothing", () => {
    // A synthetic root with one test file and a config whose only project excludes it.
    // runStatic on this root raises plenty of other errors (no protected assets, below
    // every floor); the claim under test is only that the suite-coverage code fires from
    // inside the static bar that `npm run health` runs.
    const syntheticRoot = mkdtempSync(join(tmpdir(), "vint-suite-"));
    try {
      mkdirSync(join(syntheticRoot, "tests"), { recursive: true });
      writeFileSync(
        join(syntheticRoot, "tests", "orphan.test.ts"),
        "import { describe, it, expect } from 'vitest';\n" +
          "describe('orphan', () => { it('runs nowhere', () => { expect(1 + 1).toBe(2); }); });\n",
        "utf8",
      );
      writeFileSync(
        join(syntheticRoot, VITEST_CONFIG_FILE),
        [
          'const STANDARD_TESTS = "tests/**/*.test.ts";',
          "export default defineConfig({",
          "  test: {",
          "    projects: [",
          '      { test: { name: "standard", include: [STANDARD_TESTS], exclude: [STANDARD_TESTS] } },',
          "    ],",
          "  },",
          "});",
          "",
        ].join("\n"),
        "utf8",
      );
      const res = runStatic(syntheticRoot);
      expect(res.ok).toBe(false);
      const unclaimed = res.findings.filter((f) => f.code === "SUITE_FILE_UNCLAIMED");
      expect(unclaimed.length).toBe(1);
      expect(unclaimed[0]!.severity).toBe("error");
      expect(unclaimed[0]!.message).toContain("tests/orphan.test.ts");
    } finally {
      rmSync(syntheticRoot, { recursive: true, force: true });
    }
  });
});
