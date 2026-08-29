/**
 * The count-preserving disable, and why DISABLED_RE is the only thing that can see it.
 *
 * Wrapping a suite in a conditional `describe` modifier stops every `it()` inside it from
 * running, and leaves ALL FOUR of the guard's counters byte-identical: `describe` is not
 * matched by TESTCASE_RE, no `it()` shell is touched, no `expect()` is removed, no strong
 * matcher is loosened and no tautology is added. So TEST_COUNT_REGRESSION,
 * ASSERTION_COUNT_REGRESSION, STRONG_ASSERTION_REGRESSION and TAUTOLOGY_REGRESSION all
 * stay silent in drift mode, every static floor still holds, and no protected file
 * changes. The old marker pattern required a word boundary after skip|only|todo, so
 * `skipIf` never matched (p→I is not a boundary) and `runIf` was not in the alternation at
 * all; the same pattern required the runner name IMMEDIATELY before the dot, so a
 * modifier hop such as `concurrent` also walked straight past it.
 *
 * Every probe string below is assembled at runtime rather than written verbatim, so this
 * file proves the detector works WITHOUT poking an exclusion hole in the static scan of
 * tests/ — the same technique verifier_integrity.test.ts uses for its own case table.
 */
import { describe, expect, it } from "vitest";
import {
  detectDisabledTests,
  countTestCases,
  countAssertions,
  countStrongAssertions,
  countTautologyAssertions,
} from "../../scripts/verify-integrity.js";

const IT = "it";
const TEST = "test";
const DESCRIBE = "describe";
const TO_BE = "toBe";

const flagged = (text: string): boolean =>
  detectDisabledTests([{ path: "probe.test.ts", text }]).length > 0;

describe("DISABLED_RE covers the conditional and chained disable forms", () => {
  const cases: [string, boolean][] = [
    // Conditional SUITE wrappers — the count-preserving disable.
    [`${DESCRIBE}.skipIf(true)("suite", () => {})`, true],
    [`${DESCRIBE}.runIf(false)("suite", () => {})`, true],
    [`  ${DESCRIBE} . skipIf(cond)("suite", () => {})`, true],
    // A modifier hop between the runner name and the terminal modifier.
    [`${TEST}.concurrent.skip("x", () => {})`, true],
    [`${IT}.concurrent.only("x", () => {})`, true],
    [`${IT}.each([1, 2]).skip("x", () => {})`, true],
    // Still flagged: the plain forms the original pattern already caught.
    [`${IT}.skip("x", () => {})`, true],
    [`${DESCRIBE}.todo("later")`, true],
    // NOT flagged: the per-test conditional gate this repo legitimately uses today.
    // Converting an honest it( into it.runIf(cond)( REMOVES an it( match, so the drift
    // case count already catches that direction; flagging it here would only red the
    // four existing platform-gated tests.
    [`${IT}.skipIf(process.platform !== "win32")("x", () => {})`, false],
    [`${IT}.runIf(hasParent)("x", () => {})`, false],
    // NOT flagged: ordinary suite and test declarations, and unrelated property reads.
    [`${DESCRIBE}("suite", () => {})`, false],
    [`${IT}("a real test", () => { expect(1).${TO_BE}(1); })`, false],
    [`${IT}.each([1, 2])("x", () => {})`, false],
    [`expect(result.only).${TO_BE}(1);`, false],
    [`const submit = { only: 1 };`, false],
  ];
  for (const [line, shouldFlag] of cases) {
    it(`${shouldFlag ? "flags" : "allows"}: ${line.trim().slice(0, 44)}`, () => {
      expect(flagged(line)).toBe(shouldFlag);
      if (shouldFlag)
        expect(detectDisabledTests([{ path: "probe.test.ts", text: line }])[0]!.code).toBe(
          "TEST_DISABLED",
        );
    });
  }
});

describe("the suite wrapper is invisible to every counter, which is why the marker scan matters", () => {
  const honest = [
    `${DESCRIBE}("suite", () => {`,
    `  ${IT}("a", () => { expect(compute()).${TO_BE}(2); });`,
    `  ${IT}("b", () => { expect(other()).${TO_BE}(3); });`,
    "});",
  ].join("\n");
  const disabled = honest.replace(`${DESCRIBE}(`, `${DESCRIBE}.skipIf(true)(`);

  it("all four counts are byte-identical across the disable", () => {
    expect(disabled).not.toBe(honest); // the wrapper was actually applied
    const before = [{ text: honest }];
    const after = [{ text: disabled }];
    expect(countTestCases(after)).toBe(countTestCases(before));
    expect(countAssertions(after)).toBe(countAssertions(before));
    expect(countStrongAssertions(after)).toBe(countStrongAssertions(before));
    expect(countTautologyAssertions(after)).toBe(countTautologyAssertions(before));
    // and the counts are non-zero, so the equality above is not an artefact of an
    // empty subject
    expect(countTestCases(before)).toBe(2);
    expect(countStrongAssertions(before)).toBe(2);
  });

  it("only the marker scan separates the honest suite from the disabled one", () => {
    expect(detectDisabledTests([{ path: "probe.test.ts", text: honest }])).toEqual([]);
    const findings = detectDisabledTests([{ path: "probe.test.ts", text: disabled }]);
    expect(findings.length).toBe(1);
    expect(findings[0]!.code).toBe("TEST_DISABLED");
    expect(findings[0]!.severity).toBe("error");
    expect(findings[0]!.where).toBe("probe.test.ts:1");
  });
});
