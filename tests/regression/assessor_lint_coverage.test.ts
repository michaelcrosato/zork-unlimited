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

  it("matches the SHIPPED eslint.config.js: src+tests covered, ui not", () => {
    const real = readFileSync(join(process.cwd(), "eslint.config.js"), "utf8");
    expect(eslintCovers(real, "src")).toBe(true);
    expect(eslintCovers(real, "bin")).toBe(true);
    // bug_0036 brought tests/ under the gate — the detector's DISARM half, live. The
    // synthetic DISARM case above proves the mechanism; this is it on the real config.
    expect(eslintCovers(real, "tests")).toBe(true);
    expect(eslintCovers(real, "ui")).toBe(false); // ui/ still outside — a future cycle.
  });
});

describe("bug_0035 — assess() surfaces the lint-coverage gap as a real repo lever", () => {
  it("still raises a repo-lint-coverage candidate while ui/ is outside the gate", () => {
    // bug_0036 covered tests/, so the candidate disarmed for tests/ and now names ONLY
    // the genuinely-uncovered remainder (ui/). The radar stays honest: it keeps firing
    // while real uncovered first-party code exists, and will vanish once ui/ is gated too.
    const c = a.candidates.find((x) => x.id === LINT_COV);
    expect(c).toBeDefined();
    expect(c!.category).toBe("repo");
    expect(c!.effort).toBe("L");
    expect(c!.evidence.length).toBeGreaterThan(0);
    expect(c!.title).not.toMatch(/tests/); // disarmed for tests/ (bug_0036)
    expect(c!.title).toMatch(/ui/); // ui/ remains the live lever
  });

  it("scores the lint-coverage lever per the deterministic impact/effort rule", () => {
    // bug_0035's headline — the lever out-ranking the 0.5 reviews — held while >=2 dirs
    // were uncovered (impact 3 -> score 0.6 > 0.5). bug_0036 covered tests/, leaving one
    // uncovered dir (ui): impact 1 + 1 = 2, effort L (cost 3), repo weight 0.6 ->
    // (2/3)*0.6 = 0.4. The score tracks remaining work HONESTLY: less left, lower rank.
    // So with one dir left it now sits just BELOW the reviews — correct, not a regression.
    const c = a.candidates.find((x) => x.id === LINT_COV)!;
    expect(c.score).toBeCloseTo(0.4, 3);
    const reviews = a.candidates.filter((x) => x.id.startsWith("playtest-"));
    expect(reviews.length).toBeGreaterThan(0);
    for (const r of reviews) expect(c.score).toBeLessThan(r.score);
  });

  it("does NOT re-arm the disarmed repo-eslint candidate (config still ships)", () => {
    // The coverage detector is the SUCCESSOR lever, not a regression of bug_0031.
    expect(a.candidates.find((x) => x.id === "repo-eslint")).toBeUndefined();
  });
});
