/**
 * bug_0036 — tests/ is brought UNDER the ESLint/Prettier gate.
 *
 * Backstory: bug_0031 wired ESLint+Prettier but scoped the gate to src/bin/scripts/
 * agents, deliberately excluding tests/ and ui/ "to keep that cycle bounded". bug_0035
 * then added a deterministic lint-COVERAGE detector to the assessor that FIRES while a
 * first-party code dir holds lintable .ts/.tsx yet sits outside the gate — and DISARMS
 * the moment a cycle brings that dir under it. tests/ was the larger of the two queued
 * dirs (63 files); the suite turned out already clean (zero `any`, no unsafe patterns —
 * a single prefer-const, fixed here) plus a one-time Prettier normalization of 49 files.
 *
 * This locks the gate so it cannot silently regress:
 *   (1) the SHIPPED eslint.config.js actually covers tests/ (files-named + un-ignored);
 *   (2) the package.json lint/format scripts actually RUN over tests/ (a config-only
 *       gate that the npm scripts never invoke would be a no-op);
 *   (3) the assessor's lint-coverage detector has correctly DISARMED for tests/ — its
 *       repo-lint-coverage candidate no longer names tests (it still names ui, the one
 *       dir left outside the gate, so the radar stays honest about remaining work).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assess, eslintCovers } from "../../src/afk/assessor.js";

const root = process.cwd();
const eslintText = readFileSync(join(root, "eslint.config.js"), "utf8");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

describe("bug_0036 — tests/ is under the ESLint/Prettier gate", () => {
  it("the shipped eslint.config.js covers tests/ (named in files, dropped from ignores)", () => {
    expect(eslintCovers(eslintText, "tests")).toBe(true);
    // The other gated dirs stay covered — this is an EXTENSION, not a re-scope.
    expect(eslintCovers(eslintText, "src")).toBe(true);
    expect(eslintCovers(eslintText, "bin")).toBe(true);
    expect(eslintCovers(eslintText, "scripts")).toBe(true);
    expect(eslintCovers(eslintText, "agents")).toBe(true);
  });

  it("ui/ remains OUTSIDE the gate (separate Vite/React package — future cycle)", () => {
    // Documents the deliberately-remaining scope so a later cycle's ui work is expected.
    expect(eslintCovers(eslintText, "ui")).toBe(false);
  });

  it("the lint/format npm scripts actually run over tests/ (not a config-only no-op)", () => {
    for (const key of ["lint", "format:check", "format"]) {
      expect(pkg.scripts[key]).toMatch(/(^|\s)tests(\s|$)/);
    }
  });
});

describe("bug_0036 — the assessor's lint-coverage detector has disarmed for tests/", () => {
  const a = assess(root);

  it("repo-lint-coverage no longer names tests/ (it disarmed when tests came under the gate)", () => {
    const c = a.candidates.find((x) => x.id === "repo-lint-coverage");
    // If ui/ is still uncovered the candidate persists but must NOT list tests anymore;
    // if a future cycle also covers ui/, the candidate is gone entirely. Both are valid.
    if (c) {
      expect(c.title).not.toMatch(/tests/);
      expect(c.title).toMatch(/ui/);
    } else {
      expect(eslintCovers(eslintText, "ui")).toBe(true);
    }
  });
});
