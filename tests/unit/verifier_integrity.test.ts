/**
 * Verifier-integrity guard (scripts/verify-integrity.ts) — the enforced form of
 * "don't route around the verifier" (AGENTS.md, trust-but-verify).
 *
 * Unit-tests the pure detectors on synthetic input (so we know the guard actually
 * catches the mechanical reward-hacks), and asserts the REAL repo passes the static
 * check — which makes this guard part of `npm test` and therefore part of the bar.
 */
import { describe, it, expect } from "vitest";
import {
  detectDisabledTests,
  countTestCases,
  runStatic,
  PROTECTED_FILES,
  MIN_TEST_CASES,
} from "../../scripts/verify-integrity.js";

describe("detectDisabledTests catches every disabled/focused marker", () => {
  // Markers are assembled at runtime (not written verbatim) so this test file does
  // not itself trip the guard's scan of tests/ — proving the detector works WITHOUT
  // poking an exclusion hole in the static check.
  const I = "it", T = "test", D = "describe";
  const cases: [string, boolean][] = [
    [`${I}.skip('x', () => {})`, true],
    [`  ${I}.only('x', () => {})`, true],
    [`${D}.skip('x', () => {})`, true],
    [`${T}.todo('later')`, true],
    [`x${I}('x', () => {})`, true],
    [`x${D}('x', () => {})`, true],
    [`${I}('a real test', () => { expect(1).toBe(1); })`, false],
    [`// ${I}.skip in a comment is still conservatively flagged`, true],
  ];
  for (const [line, shouldFlag] of cases) {
    it(`${shouldFlag ? "flags" : "allows"}: ${line.trim().slice(0, 40)}`, () => {
      const findings = detectDisabledTests([{ path: "t.test.ts", text: line }]);
      expect(findings.length > 0).toBe(shouldFlag);
      if (shouldFlag) expect(findings[0]!.code).toBe("TEST_DISABLED");
    });
  }
});

describe("countTestCases", () => {
  it("counts it()/test() calls", () => {
    const text = "it('a',()=>{}); test('b',()=>{}); it ('c',()=>{}); describe('grp',()=>{});";
    expect(countTestCases([{ text }])).toBe(3); // two it + one test; describe not counted
  });
});

describe("runStatic on the real repo (this is the bar)", () => {
  const res = runStatic(process.cwd());

  it("passes — no protected asset missing, no disabled test, count above floor", () => {
    if (!res.ok) console.error(res.findings);
    expect(res.ok).toBe(true);
    expect(res.findings.filter((f) => f.severity === "error")).toEqual([]);
  });

  it("every protected verification asset actually exists", () => {
    const missing = res.findings.filter((f) => f.code === "PROTECTED_MISSING");
    expect(missing).toEqual([]);
    // sanity: the protected list includes the determinism property tests + the guard itself
    expect(PROTECTED_FILES).toContain("tests/property/determinism.test.ts");
    expect(PROTECTED_FILES).toContain("scripts/verify-integrity.ts");
  });

  it("the repo is comfortably above the test-count floor", () => {
    expect(MIN_TEST_CASES).toBeGreaterThan(0);
    // If this ever trips, tests were mass-removed — investigate, don't lower the floor.
  });
});
