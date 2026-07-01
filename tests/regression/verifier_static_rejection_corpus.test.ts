/**
 * bug_0227 — a SoundnessBench-style NEGATIVE CORPUS for the verify-integrity GUARD
 * itself: a synthetic BAD repo root engineered to trip each of the guard's OWN
 * error-emitting branches, asserting the targeted finding `code` fires at
 * `severity: "error"` in the REJECTION direction.
 *
 * This is the META-VERIFIER leg of the negative-corpus pattern the project already
 * trusts. bug_0182 built the first SoundnessBench-style negative corpus (a checker is
 * only proven sound if its FAILING branches are exercised on input that SHOULD fail —
 * arXiv:2412.03154; the single-checker blind spot arXiv:2510.14253) for `validateRpg`;
 * bug_0218 completed the validator negative corpus for legacy validators. That
 * discipline was NEVER applied to `scripts/verify-integrity.ts` — the meta-verifier the
 * entire trust-but-verify bar rests on. Its own `error`-emitting branches —
 * PROTECTED_MISSING, TEST_COUNT_FLOOR, ASSERTION_COUNT_FLOOR, STRONG_ASSERTION_FLOOR
 * (in `runStatic`), and GIT_DIFF_FAILED (in `runDrift`) — had ZERO rejection-direction
 * witness: every existing `runStatic`/`runDrift` call in the suite asserts these codes
 * ABSENT against the healthy `process.cwd()`. A future regression that inverted a floor
 * comparison, dropped a `findings.push`, or broke the `GIT_DIFF_FAILED` catch would
 * leave every existing test GREEN while silently disarming the guard.
 *
 * SCOPE HONESTY (parity with bug_0182/0218, NOT a discovered live defect): every audited
 * branch is correctly emitted today. This adds the missing rejection-direction WITNESS
 * for already-correct guard code. It moves NO source byte (verify-integrity.ts is
 * PROTECTED — editing it self-trips VERIFIER_TOUCHED), NO pack hash, NO scorecard byte,
 * NO corpus seal. The new file only ADDS it()/expect()/strong matchers, so all three
 * guard counts RISE — it can never lower a floor or weaken a check.
 *
 * METHOD: build ONE synthetic bad root in `beforeAll` (string literals only — no clock,
 * RNG, or timestamps in any asserted content), containing a single tiny `.test.ts` whose
 * body has FEWER than MIN_TEST_CASES it()/test() shells, FEWER than MIN_ASSERTIONS
 * expect() calls, and FEWER than MIN_STRONG_ASSERTIONS strong matchers, and NONE of the
 * PROTECTED_FILES paths. So all four `runStatic` codes fire together; each is pinned by
 * code + count (PROTECTED_MISSING by set-equality of its where-set with the imported
 * PROTECTED_FILES; the three floors by exactly-one-each). The differential anchor proves
 * the real healthy `process.cwd()` raises none of the four — non-vacuity.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  runStatic,
  runDrift,
  PROTECTED_FILES,
  MIN_TEST_CASES,
  MIN_ASSERTIONS,
  MIN_STRONG_ASSERTIONS,
  type Finding,
} from "../../scripts/verify-integrity.js";

// A deterministically-absent git ref: a fixed all-zeros 40-char sha. No revision can
// resolve to it, so `git diff` throws and runDrift returns GIT_DIFF_FAILED before it
// ever reads the guard-self path. No clock/RNG; the asserted `where` is this literal.
const BOGUS_REF = "0000000000000000000000000000000000000000";

// A tiny test file (string literal) that is DELIBERATELY below all three floors: ONE
// it() shell, ONE expect() call, ONE strong (toBe) matcher — far under MIN_TEST_CASES /
// MIN_ASSERTIONS / MIN_STRONG_ASSERTIONS (each is 120/400/400). So runStatic emits all
// three floor codes on this root. Assembled so it does NOT contain any disabled marker.
const TINY_TEST_FILE = [
  "import { describe, it, expect } from 'vitest';",
  "describe('synthetic below-floor test', () => {",
  "  it('one shell, one expect, one strong matcher', () => {",
  "    expect(1 + 1).toBe(2);",
  "  });",
  "});",
  "",
].join("\n");

let syntheticRoot: string;

beforeAll(() => {
  // Synthetic BAD root: a tests/ subdir with ONE below-floor .test.ts, and NONE of the
  // PROTECTED_FILES paths created → PROTECTED_MISSING fires for every protected entry and
  // all three floor codes fire together. Populated from string literals only.
  syntheticRoot = mkdtempSync(join(tmpdir(), "vint-"));
  mkdirSync(join(syntheticRoot, "tests"), { recursive: true });
  writeFileSync(join(syntheticRoot, "tests", "below_floor.test.ts"), TINY_TEST_FILE, "utf8");
});

afterAll(() => {
  rmSync(syntheticRoot, { recursive: true, force: true });
});

const codesOf = (findings: Finding[]): string[] => findings.map((f) => f.code);
const errorCount = (findings: Finding[], code: string): number =>
  findings.filter((f) => f.code === code && f.severity === "error").length;

describe("bug_0227 — verify-integrity GUARD rejection-direction corpus (runStatic on a synthetic bad root)", () => {
  it("PROTECTED_MISSING fires for EVERY PROTECTED_FILES entry (set-equality, all severity:error)", () => {
    const res = runStatic(syntheticRoot);
    const missing = res.findings.filter((f) => f.code === "PROTECTED_MISSING");
    // every PROTECTED_MISSING finding is an error
    expect(missing.every((f) => f.severity === "error")).toBe(true);
    // for EVERY imported protected entry there is a PROTECTED_MISSING with .where === that path
    for (const f of PROTECTED_FILES) {
      const hit = missing.find((m) => m.where === f);
      expect(hit).toBeDefined();
      expect(hit!.severity).toBe("error");
    }
    // SET EQUALITY: the set of PROTECTED_MISSING where-values EQUALS PROTECTED_FILES
    // (single-defect attribution — no over- or under-emission masked).
    const whereSet = [...new Set(missing.map((m) => m.where))].sort();
    expect(whereSet).toEqual([...PROTECTED_FILES].sort());
    expect(missing.length).toBe(PROTECTED_FILES.length);
  });

  it("TEST_COUNT_FLOOR fires exactly once at severity:error (below MIN_TEST_CASES)", () => {
    const res = runStatic(syntheticRoot);
    expect(errorCount(res.findings, "TEST_COUNT_FLOOR")).toBe(1);
    const f = res.findings.find((x) => x.code === "TEST_COUNT_FLOOR")!;
    expect(f.severity).toBe("error");
    expect(MIN_TEST_CASES).toBeGreaterThan(1); // sanity: the floor is above the synthetic count
  });

  it("ASSERTION_COUNT_FLOOR fires exactly once at severity:error (below MIN_ASSERTIONS)", () => {
    const res = runStatic(syntheticRoot);
    expect(errorCount(res.findings, "ASSERTION_COUNT_FLOOR")).toBe(1);
    const f = res.findings.find((x) => x.code === "ASSERTION_COUNT_FLOOR")!;
    expect(f.severity).toBe("error");
    expect(MIN_ASSERTIONS).toBeGreaterThan(1);
  });

  it("STRONG_ASSERTION_FLOOR fires exactly once at severity:error (below MIN_STRONG_ASSERTIONS)", () => {
    const res = runStatic(syntheticRoot);
    expect(errorCount(res.findings, "STRONG_ASSERTION_FLOOR")).toBe(1);
    const f = res.findings.find((x) => x.code === "STRONG_ASSERTION_FLOOR")!;
    expect(f.severity).toBe("error");
    expect(MIN_STRONG_ASSERTIONS).toBeGreaterThan(1);
  });

  it("res.ok is false on the synthetic bad root (at least one severity:error finding)", () => {
    const res = runStatic(syntheticRoot);
    expect(res.ok).toBe(false);
    expect(res.findings.some((f) => f.severity === "error")).toBe(true);
  });

  it("all four runStatic error codes are present together (the bad root trips them at once)", () => {
    const res = runStatic(syntheticRoot);
    const codes = new Set(codesOf(res.findings));
    expect(codes.has("PROTECTED_MISSING")).toBe(true);
    expect(codes.has("TEST_COUNT_FLOOR")).toBe(true);
    expect(codes.has("ASSERTION_COUNT_FLOOR")).toBe(true);
    expect(codes.has("STRONG_ASSERTION_FLOOR")).toBe(true);
  });
});

describe("bug_0227 — runDrift GIT_DIFF_FAILED on a bogus ref (the runDrift error branch)", () => {
  it("emits GIT_DIFF_FAILED at severity:error with where === the bogus ref", () => {
    // The bogus all-zeros ref makes `git diff` throw; runDrift's catch returns
    // GIT_DIFF_FAILED BEFORE the guard-self readFileSync, so the missing
    // scripts/verify-integrity.ts in the synthetic root is irrelevant here.
    const res = runDrift(syntheticRoot, BOGUS_REF);
    expect(res.ok).toBe(false);
    const hit = res.findings.find((f) => f.code === "GIT_DIFF_FAILED");
    expect(hit).toBeDefined();
    expect(hit!.severity).toBe("error");
    expect(hit!.where).toBe(BOGUS_REF);
    // exactly one GIT_DIFF_FAILED, attributable to the bogus ref
    expect(errorCount(res.findings, "GIT_DIFF_FAILED")).toBe(1);
  });
});

describe("bug_0227 — DIFFERENTIAL ANCHOR: the healthy real repo raises NONE of the four runStatic codes (non-vacuity)", () => {
  // Mirrors the absence-assertion style of verifier_integrity.test.ts: the same codes
  // that FIRE on the synthetic-bad root are SILENT on the real healthy process.cwd().
  // If they were not, the rejection-direction assertions above would be vacuous.
  const res = runStatic(process.cwd());

  it("raises NO PROTECTED_MISSING on the healthy repo", () => {
    expect(res.findings.filter((f) => f.code === "PROTECTED_MISSING")).toEqual([]);
  });

  it("raises NO TEST_COUNT_FLOOR on the healthy repo", () => {
    expect(res.findings.filter((f) => f.code === "TEST_COUNT_FLOOR")).toEqual([]);
  });

  it("raises NO ASSERTION_COUNT_FLOOR on the healthy repo", () => {
    expect(res.findings.filter((f) => f.code === "ASSERTION_COUNT_FLOOR")).toEqual([]);
  });

  it("raises NO STRONG_ASSERTION_FLOOR on the healthy repo", () => {
    expect(res.findings.filter((f) => f.code === "STRONG_ASSERTION_FLOOR")).toEqual([]);
  });

  it("the healthy repo's static check is ok (no severity:error finding)", () => {
    expect(res.ok).toBe(true);
    expect(res.findings.filter((f) => f.severity === "error")).toEqual([]);
  });
});
