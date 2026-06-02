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
  countAssertions,
  detectCountRegressions,
  runStatic,
  classifyDrift,
  PROTECTED_FILES,
  MIN_TEST_CASES,
  MIN_ASSERTIONS,
} from "../../scripts/verify-integrity.js";

describe("detectDisabledTests catches every disabled/focused marker", () => {
  // Markers are assembled at runtime (not written verbatim) so this test file does
  // not itself trip the guard's scan of tests/ — proving the detector works WITHOUT
  // poking an exclusion hole in the static check.
  const I = "it",
    T = "test",
    D = "describe";
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

describe("countAssertions", () => {
  it("counts expect() calls (the test-body guard, not it()/test())", () => {
    const text = "it('a',()=>{ expect(1).toBe(1); expect (x).toEqual(y); }); test('b',()=>{});";
    expect(countAssertions([{ text }])).toBe(2); // two expect( ; it/test not counted
  });
});

describe("detectCountRegressions — neither test cases NOR assertions may drop", () => {
  const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

  it("passes when both counts grow (a normal +tests cycle)", () => {
    expect(
      detectCountRegressions({ cases: 100, assertions: 300 }, { cases: 103, assertions: 312 }),
    ).toEqual([]);
  });

  it("BLOCKS a dropped test-case count (tests removed/skipped)", () => {
    const fs = detectCountRegressions(
      { cases: 100, assertions: 300 },
      { cases: 99, assertions: 300 },
    );
    expect(codes(fs)).toContain("TEST_COUNT_REGRESSION");
    expect(fs.every((f) => f.severity === "error")).toBe(true);
  });

  it("BLOCKS gutting a test body — cases held, assertions dropped (the launder this closes)", () => {
    // The exact reward-hack the it()-count-only guard misses: keep every it() shell so
    // the case count is unchanged, but delete the expect()s inside one of them.
    const fs = detectCountRegressions(
      { cases: 100, assertions: 300 },
      { cases: 100, assertions: 297 },
    );
    expect(codes(fs)).toEqual(["ASSERTION_COUNT_REGRESSION"]);
    expect(fs[0]!.severity).toBe("error");
  });
});

describe("classifyDrift — legitimate re-pin vs launder vs weakening (research-aligned)", () => {
  const errs = (fs: { severity: string }[]) => fs.filter((f) => f.severity === "error");

  it("ALLOWS (warns) a hash re-pin ACCOMPANIED by a content change — the user's loop case", () => {
    // The exact thing that was wrongly blocking the loop: improve a pack, re-pin its hash.
    const fs = classifyDrift(
      ["content/cyoa/pack/watchtower_road.yaml", "tests/unit/rpg_validator.test.ts"],
      () => true,
    );
    expect(errs(fs)).toEqual([]); // no hard error → the cycle commits
    expect(fs.some((f) => f.code === "HASH_PIN_REPINNED" && f.severity === "warning")).toBe(true);
  });

  it("BLOCKS a re-pin with NO content change (the launder / regenerate-to-green pattern)", () => {
    const fs = classifyDrift(["tests/unit/rpg_validator.test.ts"], () => true);
    expect(fs.some((f) => f.code === "HASH_PIN_UNACCOMPANIED" && f.severity === "error")).toBe(
      true,
    );
  });

  it("SURFACES (warns) a modified protected file — free rein over code, weakening caught elsewhere", () => {
    const fs = classifyDrift(["src/core/engine.ts"], () => true);
    expect(errs(fs)).toEqual([]);
    expect(fs.some((f) => f.code === "VERIFIER_TOUCHED" && f.severity === "warning")).toBe(true);
  });

  it("BLOCKS deleting a protected verification asset", () => {
    const fs = classifyDrift(["tests/property/determinism.test.ts"], () => false);
    expect(fs.some((f) => f.code === "PROTECTED_DELETED" && f.severity === "error")).toBe(true);
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

  it("passes the assertion-count floor — no test body has been mass-gutted", () => {
    expect(MIN_ASSERTIONS).toBeGreaterThan(0);
    expect(res.findings.filter((f) => f.code === "ASSERTION_COUNT_FLOOR")).toEqual([]);
    // If this ever trips, expect()s were mass-removed — investigate, don't lower the floor.
  });
});
