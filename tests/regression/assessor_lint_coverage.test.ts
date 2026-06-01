/**
 * bug_0035 — the assessor regains a cross-category radar via a lint-COVERAGE detector.
 *
 * Backstory: bug_0031 wired ESLint+Prettier but scoped the gate to src/bin/scripts/
 * agents, deliberately excluding tests/ and ui/ "to keep that cycle bounded". bug_0032
 * then made the assessor honest about gated-CYOA bot coverage, after which it surfaced
 * ONLY uniform 0.5 blind-playtest reviews — no high-impact cross-category lever, because
 * its only two non-content detectors were both inert (repo-eslint disarmed since the
 * config ships; engine-todos inert at zero markers). The loop was blind to genuinely
 * real, currently-invisible work: tests/ (63 files) and ui/ hold first-party TS with NO
 * static-analysis or format gate.
 *
 * The fix adds a deterministic detector that FIRES while a first-party code dir exists,
 * holds lintable .ts/.tsx, yet falls outside the ESLint config's `files` globs — and
 * DISARMS the moment a future cycle brings that dir under the gate. This is the bug_0031
 * deferred[a] / bug_0032 deferred lever ("ADD a detector that FIRES on real, currently-
 * invisible work: extend ESLint/Prettier + the assessor's view to tests/ and ui/").
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assess, eslintCovers } from "../../src/afk/assessor.js";

const a = assess(process.cwd());
const LINT_COV = "repo-lint-coverage";

describe("bug_0035 — eslintCovers (the predicate that decides lint-gate membership)", () => {
  const FILES_AND_IGNORES = `
    { ignores: ["dist/**", "ui/**", "tests/**", "content/**"] },
    { files: ["src/**/*.ts", "bin/**/*.ts", "scripts/**/*.ts", "agents/**/*.ts"] },
  `;

  it("is TRUE for a dir named in files and not ignored (covered)", () => {
    expect(eslintCovers(FILES_AND_IGNORES, "src")).toBe(true);
    expect(eslintCovers(FILES_AND_IGNORES, "agents")).toBe(true);
  });

  it("is FALSE for a dir only listed in ignores / absent from files (uncovered)", () => {
    expect(eslintCovers(FILES_AND_IGNORES, "tests")).toBe(false);
    expect(eslintCovers(FILES_AND_IGNORES, "ui")).toBe(false);
  });

  it("DISARMS once a dir is added to files and dropped from ignores", () => {
    // Simulates a future cycle extending coverage — the detector must go quiet.
    const EXTENDED = `
      { ignores: ["dist/**", "content/**"] },
      { files: ["src/**/*.ts", "tests/**/*.ts", "ui/**/*.{ts,tsx}"] },
    `;
    expect(eslintCovers(EXTENDED, "tests")).toBe(true);
    expect(eslintCovers(EXTENDED, "ui")).toBe(true);
  });

  it("stays FALSE if a dir is in files but ALSO still ignored (ignore wins)", () => {
    const CONFLICTED = `
      { ignores: ["tests/**"] },
      { files: ["tests/**/*.ts"] },
    `;
    expect(eslintCovers(CONFLICTED, "tests")).toBe(false);
  });

  it("matches the SHIPPED eslint.config.js: src covered, tests+ui not", () => {
    const real = readFileSync(join(process.cwd(), "eslint.config.js"), "utf8");
    expect(eslintCovers(real, "src")).toBe(true);
    expect(eslintCovers(real, "bin")).toBe(true);
    expect(eslintCovers(real, "tests")).toBe(false);
    expect(eslintCovers(real, "ui")).toBe(false);
  });
});

describe("bug_0035 — assess() surfaces the lint-coverage gap as a real repo lever", () => {
  it("raises a repo-lint-coverage candidate while tests/ and ui/ are outside the gate", () => {
    const c = a.candidates.find((x) => x.id === LINT_COV);
    expect(c).toBeDefined();
    expect(c!.category).toBe("repo");
    expect(c!.effort).toBe("L");
    expect(c!.evidence.length).toBeGreaterThan(0);
    // Names the genuinely-uncovered first-party dirs.
    expect(c!.title).toMatch(/tests/);
    expect(c!.title).toMatch(/ui/);
  });

  it("ranks the lint-coverage lever ABOVE the uniform blind-playtest reviews", () => {
    // The whole point: restore a cross-category signal that out-ranks 'just review an
    // already-pristine pack again' (every content_fix is now a 0.5 review post-bug_0032).
    const c = a.candidates.find((x) => x.id === LINT_COV)!;
    const reviews = a.candidates.filter((x) => x.id.startsWith("playtest-"));
    expect(reviews.length).toBeGreaterThan(0);
    for (const r of reviews) expect(c.score).toBeGreaterThan(r.score);
    expect(a.top!.id).toBe(LINT_COV); // it is the honest recommended next lever
  });

  it("does NOT re-arm the disarmed repo-eslint candidate (config still ships)", () => {
    // The coverage detector is the SUCCESSOR lever, not a regression of bug_0031.
    expect(a.candidates.find((x) => x.id === "repo-eslint")).toBeUndefined();
  });
});
