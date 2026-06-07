/**
 * bug_0038 — ui/ is brought UNDER the ESLint gate (the last first-party dir).
 *
 * Backstory: bug_0031 wired ESLint+Prettier but scoped the gate to src/bin/scripts/
 * agents; bug_0035 added the lint-COVERAGE detector that fires while a first-party dir
 * holds lintable .ts/.tsx yet sits outside the gate; bug_0036 brought tests/ under it,
 * leaving ui/ (the React/Vite view package) as the one remaining uncovered dir at score
 * 0.4. This cycle closes it: ui/ gets the same correctness bar as the engine (the global
 * js + typescript-eslint recommended sets, the unused-vars policy) over its .ts AND .tsx,
 * PLUS the two canonical react-hooks rules. (The broader eslint-plugin-react and the full
 * React-Compiler ruleset are deferred until upstream supports ESLint 10 — see the config.)
 *
 * This locks the gate so it cannot silently regress:
 *   (1) the SHIPPED eslint.config.js covers ui/ (files-named + un-ignored);
 *   (2) the lint/format npm scripts actually RUN over ui/;
 *   (3) the react-hooks gate is genuinely ACTIVE on a ui .tsx file (rules-of-hooks=error,
 *       exhaustive-deps=warn) and BITES a real conditional-hook violation;
 *   (4) the shipped ui/ source passes the gate clean (it is a live linter, not inert);
 *   (5) the assessor's lint-coverage detector has FULLY disarmed (no dir left uncovered).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ESLint } from "eslint";
import { assess, eslintCovers } from "../../src/afk/assessor.js";

const root = process.cwd();
const eslintText = readFileSync(join(root, "eslint.config.js"), "utf8");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

describe("bug_0038 — ui/ is under the ESLint gate", () => {
  it("the shipped eslint.config.js covers ui/ (named in files, dropped from ignores)", () => {
    expect(eslintCovers(eslintText, "ui")).toBe(true);
    // An EXTENSION, not a re-scope — the previously-gated dirs stay covered.
    for (const dir of ["src", "bin", "scripts", "agents", "tests"]) {
      expect(eslintCovers(eslintText, dir)).toBe(true);
    }
  });

  it("the lint/format npm scripts actually run over ui/ (not a config-only no-op)", () => {
    for (const key of ["lint", "format:check", "format"]) {
      expect(pkg.scripts[key]).toMatch(/(^|\s)ui(\s|$)/);
    }
  });

  // Each ESLint() instance loads the full type-aware config; on a slow host under full-suite
  // contention that exceeds vitest's 60s default, so the ESLint-API tests get explicit
  // headroom — they assert behaviour (rules active, violations caught), not speed.
  it("the react-hooks rules are ACTIVE for a ui .tsx file", async () => {
    const eslint = new ESLint({ cwd: root });
    const cfg = await eslint.calculateConfigForFile(join(root, "ui/src/App.tsx"));
    // severity: 2 = error, 1 = warn.
    expect(cfg.rules?.["react-hooks/rules-of-hooks"]?.[0]).toBe(2);
    expect(cfg.rules?.["react-hooks/exhaustive-deps"]?.[0]).toBe(1);
  }, 120_000);

  it("ESLint BITES a real conditional-hook violation in a ui .tsx file", async () => {
    const eslint = new ESLint({ cwd: root });
    const probe = join(root, "ui/src/__hook_probe__.tsx");
    const bad = `import { useState } from "react";
export function Bad({ cond }: { cond: boolean }): null {
  if (cond) {
    const [x] = useState(0);
    void x;
  }
  return null;
}
`;
    const res = await eslint.lintText(bad, { filePath: probe });
    expect(res[0]!.errorCount).toBeGreaterThan(0);
    expect(res[0]!.messages.some((m) => m.ruleId === "react-hooks/rules-of-hooks")).toBe(true);
  }, 120_000);

  it("the shipped ui/ source passes the gate clean (zero errors)", async () => {
    const eslint = new ESLint({ cwd: root });
    const results = await eslint.lintFiles(["ui/src/**/*.{ts,tsx}", "ui/*.ts"]);
    expect(results.length).toBeGreaterThan(0); // it really matched the .tsx, not nothing
    const errors = results.reduce((n, r) => n + r.errorCount, 0);
    expect(errors).toBe(0);
  }, 120_000);
});

describe("bug_0038 — the assessor's lint-coverage detector has fully disarmed", () => {
  const a = assess(root);

  it("no repo-lint-coverage candidate remains (every first-party dir is gated)", () => {
    expect(a.candidates.find((x) => x.id === "repo-lint-coverage")).toBeUndefined();
  });

  it("does NOT re-arm the disarmed repo-eslint candidate (config still ships)", () => {
    expect(a.candidates.find((x) => x.id === "repo-eslint")).toBeUndefined();
  });
});
