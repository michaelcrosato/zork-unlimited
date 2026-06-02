/**
 * Regression lock (§15) for bug_0133 — the verifier-integrity guard must catch the
 * count-preserving STRICT→LOOSE matcher swap, not just shell deletion (bug_0129's
 * it()-count guard) and body gutting (bug_0129's expect()-count guard).
 *
 * The reward-hack this guards against: an autonomous cycle keeps every it()/test()
 * shell AND every expect() call — so countTestCases / countAssertions and both their
 * regression guards stay silent — but rewrites the matchers from strict, value-pinning
 * forms (`toBe(x)`, `toEqual(x)`, `toContain(x)`) into weak existence checks
 * (`toBeDefined()`, `toBeTruthy()`), leaving a green test that no longer pins anything.
 * The behavioral suite cannot catch it (a `toBeDefined()` on a defined value passes),
 * and before this fix neither could the integrity guard — bug_0129's own header
 * confessed this swap "needs a semantic judge."
 *
 * It does NOT need a semantic judge: scripts/verify-integrity.ts now counts STRONG
 * (value-pinning) matchers as a third artifact count. Swapping strict→loose holds the
 * expect() count but drops the strong count, so detectCountRegressions emits
 * STRONG_ASSERTION_REGRESSION even when TEST_COUNT_REGRESSION and ASSERTION_COUNT_REGRESSION
 * stay silent. This test fails if that third guard is ever removed.
 */
import { describe, it, expect } from "vitest";
import {
  countStrongAssertions,
  countAssertions,
  detectCountRegressions,
  runStatic,
  MIN_STRONG_ASSERTIONS,
} from "../../scripts/verify-integrity.js";

describe("bug_0133 — a strict→loose matcher swap is caught even when the expect() count holds", () => {
  it("counts strong (value-pinning) matchers independently of the expect() count", () => {
    // Same number of expect()s; the second body has swapped every strict matcher for a
    // weak existence check. The expect() count cannot tell them apart — the strong count can.
    const strict = "it('x', () => { expect(a).toBe(1); expect(b).toContain('z'); });";
    const loosened = "it('x', () => { expect(a).toBeDefined(); expect(b).toBeTruthy(); });";
    expect(countAssertions([{ text: strict }])).toBe(countAssertions([{ text: loosened }]));
    expect(countStrongAssertions([{ text: strict }])).toBe(2);
    expect(countStrongAssertions([{ text: loosened }])).toBe(0);
  });

  it("counts negated specific matchers as strong (they still pin a value) but not weak existence checks", () => {
    const text =
      "expect(a).not.toContain('z'); expect(b).not.toBe(2); expect(c).toBeNull(); expect(d).not.toBeNull();";
    // .not.toContain( and .not.toBe( are strong; .toBeNull()/.not.toBeNull() are weak existence checks.
    expect(countStrongAssertions([{ text }])).toBe(2);
  });

  it("does NOT mistake toBe-prefixed weak matchers for the strong toBe", () => {
    const text =
      "expect(a).toBeDefined(); expect(b).toBeUndefined(); expect(c).toBeFalsy(); expect(d).toBeTruthy();";
    expect(countStrongAssertions([{ text }])).toBe(0);
    // ...while the genuine comparators that share the toBe prefix DO count.
    const cmp = "expect(a).toBeGreaterThan(1); expect(b).toBeLessThanOrEqual(3);";
    expect(countStrongAssertions([{ text: cmp }])).toBe(2);
  });

  it("a strict→loose swap (cases held, expect()s held, strong dropped) is a hard STRONG_ASSERTION_REGRESSION", () => {
    const before = { cases: 50, assertions: 180, strong: 175 };
    const swapped = { cases: 50, assertions: 180, strong: 172 }; // 3 strict matchers → loose
    const fs = detectCountRegressions(before, swapped);
    expect(fs.map((f) => f.code)).toEqual(["STRONG_ASSERTION_REGRESSION"]);
    expect(fs[0]!.severity).toBe("error");
    // Crucially neither the case guard NOR the assertion guard would have fired on this drift.
    expect(fs.some((f) => f.code === "TEST_COUNT_REGRESSION")).toBe(false);
    expect(fs.some((f) => f.code === "ASSERTION_COUNT_REGRESSION")).toBe(false);
  });

  it("an honest cycle that adds tests, assertions AND strong matchers trips nothing", () => {
    expect(
      detectCountRegressions(
        { cases: 50, assertions: 180, strong: 175 },
        { cases: 53, assertions: 191, strong: 186 },
      ),
    ).toEqual([]);
  });

  it("the real repo carries strong matchers well above the mass-swap floor", () => {
    const res = runStatic(process.cwd());
    expect(res.findings.filter((f) => f.code === "STRONG_ASSERTION_FLOOR")).toEqual([]);
    expect(MIN_STRONG_ASSERTIONS).toBeGreaterThan(0);
  });
});
