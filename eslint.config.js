// Flat ESLint config (ESLint 9+). Closes the assessor's standing repo gap: until
// now `npm run lint` was only `tsc --noEmit` (a typecheck) — real static analysis
// (unused vars, unsafe patterns, lint-level correctness) had no gate. Prettier owns
// formatting; eslint-config-prettier turns off every rule that would fight it, so
// the two never disagree.
//
// Scope is first-party engine/tooling TS (src, bin, scripts, agents) PLUS tests/
// (brought under the gate in bug_0036 — see the tests-specific rules block below;
// its first-party .ts had no static-analysis or format gate until now). Deliberately
// still NOT linting content/ (YAML — content-hash-sensitive), traces/, ui/ (a
// separate Vite/React package that needs its own React/TSX lint setup).
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "ui/**",
      "content/**",
      "traces/**",
      "saves/**",
      "ai-runs/**",
      ".codex/**",
      "**/*.js",
      "**/*.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ["src/**/*.ts", "bin/**/*.ts", "scripts/**/*.ts", "agents/**/*.ts"],
    rules: {
      // Unused symbols are real dead-code/typo signals — keep as errors, but allow
      // the conventional underscore-prefix escape hatch for intentionally-unused
      // params (e.g. interface-shaped callbacks) and caught errors.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // tests/ comes under the same correctness gate as first-party code (bug_0036):
    // the identical unused-vars policy, and the recommended rule set otherwise. The
    // suite already passes it clean (zero `any`, no unsafe patterns), so no
    // test-specific relaxations are warranted — keeping the rules on holds new test
    // code to the same bar as the engine it exercises.
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
);
