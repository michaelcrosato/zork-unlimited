/**
 * bug_0031 — ESLint + Prettier tooling (the assessor's standing rank-3 repo lever).
 *
 * Until this cycle `npm run lint` was only `tsc --noEmit` (a typecheck); there was
 * no real static-analysis or formatting gate. This locks the tooling in so `lint`
 * can never silently revert to a bare typecheck and the config can't be dropped:
 *   1. the npm scripts are wired to ESLint / Prettier / tsc and health runs all three;
 *   2. the config files ship;
 *   3. ESLint actually FUNCTIONS with our config — it flags an unused var and passes
 *      clean code (proving it's a live linter, not an inert config).
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ESLint } from "eslint";

const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

describe("bug_0031 — ESLint + Prettier are wired as real gates", () => {
  it("npm scripts invoke ESLint, Prettier, and tsc (lint is no longer just tsc)", () => {
    expect(pkg.scripts.lint).toContain("eslint");
    expect(pkg.scripts.lint).not.toMatch(/^tsc\b/); // the old "lint is just tsc" gap
    expect(pkg.scripts["format:check"]).toContain("prettier");
    expect(pkg.scripts.format).toContain("prettier");
    expect(pkg.scripts.typecheck).toContain("tsc");
  });

  it("health runs typecheck + lint + format:check (the bar enforces all three)", () => {
    const health = pkg.scripts.health;
    expect(health).toContain("npm run typecheck");
    expect(health).toContain("npm run lint");
    expect(health).toContain("npm run format:check");
  });

  it("the ESLint and Prettier config files ship", () => {
    expect(existsSync(join(root, "eslint.config.js"))).toBe(true);
    expect(existsSync(join(root, ".prettierrc.json"))).toBe(true);
    expect(existsSync(join(root, ".prettierignore"))).toBe(true);
  });

  // Instantiating ESLint loads the full type-aware config (typescript-eslint); on a slow
  // host under full-suite contention this runs well past vitest's 60s default, so give the
  // ESLint-API tests explicit headroom — they assert behaviour, not speed.
  it("ESLint actually catches an unused variable and passes clean code", async () => {
    const eslint = new ESLint({ cwd: root });
    const probePath = join(root, "src/__lint_probe__.ts");
    const bad = await eslint.lintText("const unusedX = 1;\n", { filePath: probePath });
    expect(bad[0]!.errorCount).toBeGreaterThan(0);
    const good = await eslint.lintText("export const x = 1;\n", { filePath: probePath });
    expect(good[0]!.errorCount).toBe(0);
  }, 120_000);
});
