/**
 * Regression lock (§15) for bug_0129 — the verifier-integrity guard must catch
 * ASSERTION GUTTING, not just shell deletion.
 *
 * The reward-hack this guards against: an autonomous cycle keeps every it()/test()
 * shell intact (so countTestCases / TEST_COUNT_REGRESSION stay silent) but deletes the
 * expect() assertions inside a test body, leaving a green test that verifies nothing.
 * The behavioral suite cannot catch it (a body with no assertions cannot fail), and
 * before this fix neither could the integrity guard, which counted only the shells.
 *
 * scripts/verify-integrity.ts now counts expect() calls in parallel: detectCountRegressions
 * compares {cases, assertions} before/after a cycle and a drop in EITHER is a hard error,
 * so gutting a body (cases held, assertions dropped) is caught. This test fails if that
 * parallel guard is ever removed or its two counts are re-coupled.
 */
import { describe, it, expect } from "vitest";
import {
  countAssertions,
  detectCountRegressions,
  runStatic,
  MIN_ASSERTIONS,
} from "../../scripts/verify-integrity.js";

describe("bug_0129 — assertion gutting is caught even when the it() count is unchanged", () => {
  it("countAssertions counts expect() bodies independently of it()/test() shells", () => {
    // One shell, three assertions: the case count cannot reveal a body losing assertions.
    const shellOnly = "it('keeps the shell', () => {});";
    const fullBody =
      "it('keeps the shell', () => { expect(a).toBe(1); expect(b).toBe(2); expect(c).toBe(3); });";
    expect(countAssertions([{ text: shellOnly }])).toBe(0);
    expect(countAssertions([{ text: fullBody }])).toBe(3);
  });

  it("a gutted body (same cases, fewer assertions) is a hard ASSERTION_COUNT_REGRESSION", () => {
    const before = { cases: 50, assertions: 180 };
    const gutted = { cases: 50, assertions: 177 }; // shells held; 3 expect()s deleted
    const fs = detectCountRegressions(before, gutted);
    expect(fs.map((f) => f.code)).toEqual(["ASSERTION_COUNT_REGRESSION"]);
    expect(fs[0]!.severity).toBe("error");
    // And crucially the test-case guard alone would NOT have fired on this drift.
    expect(fs.some((f) => f.code === "TEST_COUNT_REGRESSION")).toBe(false);
  });

  it("an honest cycle that adds tests AND assertions trips nothing", () => {
    expect(
      detectCountRegressions({ cases: 50, assertions: 180 }, { cases: 53, assertions: 191 }),
    ).toEqual([]);
  });

  it("the real repo carries assertions well above the mass-deletion floor", () => {
    const res = runStatic(process.cwd());
    expect(res.findings.filter((f) => f.code === "ASSERTION_COUNT_FLOOR")).toEqual([]);
    expect(MIN_ASSERTIONS).toBeGreaterThan(0);
  });
});
