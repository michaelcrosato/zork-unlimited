// Flat ESLint config (ESLint 9+). Closes the assessor's standing repo gap: until
// now `npm run lint` was only `tsc --noEmit` (a typecheck) — real static analysis
// (unused vars, unsafe patterns, lint-level correctness) had no gate. Prettier owns
// formatting; eslint-config-prettier turns off every rule that would fight it, so
// the two never disagree.
//
// Scope is first-party engine/tooling TS (src, bin, scripts, agents). Deliberately
// NOT linting tests/ (its own conventions, and verify-integrity already guards it),
// nor content/ (YAML — content-hash-sensitive), traces/, ui/ (separate package).
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
      "tests/**",
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
);
