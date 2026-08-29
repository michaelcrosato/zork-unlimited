/**
 * Drift mode has two halves that must fail CLOSED, and both used to fail OPEN on the
 * working-tree side while failing loud on the baseline side.
 *
 *   - Guard self-integrity. runDrift compares the guard constants at the ref with the
 *     ones in the working tree and only runs detectGuardWeakening when BOTH parse. A null
 *     on the REF side has always raised GUARD_BASELINE_UNREADABLE; a null on the WORKING
 *     TREE side raised nothing and the run reported OK — so a cycle that made its own
 *     constants unparseable (a type annotation on a MIN_* floor was enough) disarmed the
 *     entire edit-the-checker guard while runStatic went on importing the real binding and
 *     enforcing whatever the cycle had lowered it to.
 *   - The count baseline. countTestArtifactsAtRef returns null for an unreadable ref, and
 *     runDrift turns that into COUNT_BASELINE_UNREADABLE — except that a ref whose tree
 *     yielded no test blobs returned a zero tuple instead, which bypassed that error and
 *     made every count-regression comparison trivially pass (now >= 0).
 *
 * Both are exercised against real git fixture repositories rather than synthetic structs,
 * because the defect was in runDrift's wiring, not in a pure detector: a test of the
 * detectors alone would have passed before and after the fix.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  runDrift,
  parseGuardConstants,
  detectGuardWeakening,
  MIN_TEST_CASES,
} from "../../scripts/verify-integrity.js";

/** A minimal but fully parseable guard source: the five fields parseGuardConstants
 *  requires, and nothing else. */
const PARSEABLE_GUARD = [
  "export const PROTECTED_FILES = [",
  '  "tests/sample.test.ts",',
  "];",
  'export const HASH_PIN_FILES = ["tests/sample.test.ts"];',
  "export const MIN_TEST_CASES = 10;",
  "export const MIN_ASSERTIONS = 20;",
  "export const MIN_STRONG_ASSERTIONS = 20;",
  "",
].join("\n");

/** The same file with one floor written as a call expression instead of a numeric
 *  literal — a shape the tolerant parser still cannot read, which is exactly the input
 *  the working-tree half must now refuse to shrug off. */
const UNPARSEABLE_GUARD = PARSEABLE_GUARD.replace(
  "export const MIN_TEST_CASES = 10;",
  "export const MIN_TEST_CASES = Number(10);",
);

const SAMPLE_TEST = [
  "import { describe, it, expect } from 'vitest';",
  "describe('sample', () => {",
  "  it('asserts something', () => {",
  "    expect(1 + 1).toBe(2);",
  "  });",
  "});",
  "",
].join("\n");

const fixtureRoots: string[] = [];

/** A committed git fixture repo containing exactly the given files. */
function fixtureRepo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "vint-drift-"));
  fixtureRoots.push(root);
  for (const [relative, text] of Object.entries(files)) {
    const absolute = join(root, relative);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, text, "utf8");
  }
  const git = (...args: string[]): void => {
    execFileSync("git", args, { cwd: root, stdio: "ignore" });
  };
  git("init", "--quiet");
  git("config", "user.email", "verifier-fixture@example.invalid");
  git("config", "user.name", "Verifier Fixture");
  git("add", "--all");
  git("commit", "--quiet", "-m", "fixture baseline");
  return root;
}

afterAll(() => {
  for (const root of fixtureRoots) rmSync(root, { recursive: true, force: true });
});

describe("runDrift fails closed when the WORKING TREE guard constants cannot be parsed", () => {
  it("raises GUARD_SELF_UNREADABLE while the readable baseline raises nothing", () => {
    const root = fixtureRepo({
      "scripts/verify-integrity.ts": PARSEABLE_GUARD,
      "tests/sample.test.ts": SAMPLE_TEST,
    });
    // The cycle under test: rewrite the guard so its own floor stops parsing.
    writeFileSync(join(root, "scripts/verify-integrity.ts"), UNPARSEABLE_GUARD, "utf8");
    // Sanity on the two parses runDrift performs, so the assertion below is about
    // runDrift's reaction and not about a parser that happens to read both sides.
    expect(parseGuardConstants(PARSEABLE_GUARD)).not.toBeNull();
    expect(parseGuardConstants(UNPARSEABLE_GUARD)).toBeNull();

    const res = runDrift(root, "HEAD");
    const selfUnreadable = res.findings.filter((f) => f.code === "GUARD_SELF_UNREADABLE");
    expect(selfUnreadable.length).toBe(1);
    expect(selfUnreadable[0]!.severity).toBe("error");
    expect(selfUnreadable[0]!.where).toBe("scripts/verify-integrity.ts");
    expect(res.ok).toBe(false);
    // The baseline half is readable here, so its own error must stay silent — that
    // asymmetry (loud baseline, silent working tree) was the whole defect.
    expect(res.findings.filter((f) => f.code === "GUARD_BASELINE_UNREADABLE")).toEqual([]);
  });

  it("stays silent when both sides parse — the non-vacuity anchor", () => {
    const root = fixtureRepo({
      "scripts/verify-integrity.ts": PARSEABLE_GUARD,
      "tests/sample.test.ts": SAMPLE_TEST,
    });
    writeFileSync(join(root, "tests/sample.test.ts"), `${SAMPLE_TEST}// an honest edit\n`, "utf8");
    const res = runDrift(root, "HEAD");
    expect(res.findings.filter((f) => f.code === "GUARD_SELF_UNREADABLE")).toEqual([]);
  });

  it("an annotated floor now PARSES, so lowering it is caught as a weakening", () => {
    // The audited probe: `export const MIN_TEST_CASES: number = 100;` used to make the
    // whole parse return null, which (before the branch above existed) silently disarmed
    // detectGuardWeakening. It now reads as the number it is, so the lowering itself is
    // what gets reported.
    const annotated = PARSEABLE_GUARD.replace(
      "export const MIN_TEST_CASES = 10;",
      "export const MIN_TEST_CASES: number = 1;",
    );
    const parsed = parseGuardConstants(annotated);
    expect(parsed).not.toBeNull();
    expect(parsed!.minTestCases).toBe(1);
    const before = parseGuardConstants(PARSEABLE_GUARD)!;
    const findings = detectGuardWeakening(before, parsed!);
    expect(findings.map((f) => f.code)).toEqual(["GUARD_WEAKENED"]);
    expect(findings[0]!.severity).toBe("error");
    expect(findings[0]!.message).toContain("MIN_TEST_CASES lowered");
  });
});

describe("runDrift fails closed when the ref carries no test corpus to compare against", () => {
  it("raises COUNT_BASELINE_UNREADABLE instead of comparing against a zero corpus", () => {
    // A ref with no tests/**/*.test.ts blobs at all. The old zero tuple made every
    // count-regression comparison pass trivially (any count >= 0) while the run said OK.
    const root = fixtureRepo({
      "scripts/verify-integrity.ts": PARSEABLE_GUARD,
      "README.md": "fixture with no test corpus\n",
    });
    const res = runDrift(root, "HEAD");
    const unreadable = res.findings.filter((f) => f.code === "COUNT_BASELINE_UNREADABLE");
    expect(unreadable.length).toBe(1);
    expect(unreadable[0]!.severity).toBe("error");
    expect(res.ok).toBe(false);
    // and no count-regression finding was computed from a phantom baseline
    expect(res.findings.filter((f) => f.code === "TEST_COUNT_REGRESSION")).toEqual([]);
  });

  it("stays silent when the ref does carry a test corpus — the non-vacuity anchor", () => {
    const root = fixtureRepo({
      "scripts/verify-integrity.ts": PARSEABLE_GUARD,
      "tests/sample.test.ts": SAMPLE_TEST,
    });
    const res = runDrift(root, "HEAD");
    expect(res.findings.filter((f) => f.code === "COUNT_BASELINE_UNREADABLE")).toEqual([]);
  });
});

describe("the real repository passes both fail-closed branches", () => {
  it("this tree's own guard parses, and its HEAD carries a readable corpus", () => {
    const res = runDrift(process.cwd(), "HEAD");
    expect(res.findings.filter((f) => f.code === "GUARD_SELF_UNREADABLE")).toEqual([]);
    expect(res.findings.filter((f) => f.code === "COUNT_BASELINE_UNREADABLE")).toEqual([]);
    // sanity: the live floor is a real number the parser can still read
    expect(MIN_TEST_CASES).toBeGreaterThan(0);
  });
});
