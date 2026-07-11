// Flat ESLint config (ESLint 9+). Closes the assessor's standing repo gap: until
// now `npm run lint` was only `tsc --noEmit` (a typecheck) — real static analysis
// (unused vars, unsafe patterns, lint-level correctness) had no gate. Prettier owns
// formatting; eslint-config-prettier turns off every rule that would fight it, so
// the two never disagree.
//
// Scope is first-party engine/tooling TS (src, bin, scripts, agents), tests/
// (bug_0036), blind-tester/ (Node ESM MCP smoke harness), AND ui/ (the React/Vite package, brought under the gate in bug_0038 —
// see the ui-specific block below: typescript-eslint recommended over its .tsx PLUS
// the canonical react-hooks rules). Deliberately still NOT linting content/ (YAML —
// content-hash-sensitive) or traces/ (frozen verification snapshots).
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "ui/dist/**",
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
  {
    // src/crawl/worker_bootstrap.mjs is plain-JS worker-thread bootstrap glue
    // (see its doc comment) — deliberately outside the src/**/*.ts block above
    // since it must load natively in a worker thread with no transform. Only
    // needs the Node `URL` global (no-undef); mirrors the blind-tester/**/*.mjs
    // block below.
    files: ["src/**/*.mjs"],
    languageOptions: {
      globals: {
        URL: "readonly",
      },
    },
  },
  {
    // ui/scripts/ is Node ESM build tooling (the post-build single-file inliner
    // behind PLAY.bat). Plain JS by design — it runs under bare `node` in the ui
    // build script with no transform. Needs the Node `URL` and `console` globals;
    // mirrors the src/**/*.mjs and blind-tester/**/*.mjs blocks.
    files: ["ui/scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        URL: "readonly",
        console: "readonly",
      },
    },
  },
  {
    // blind-tester/ is Node ESM loop tooling. Root-wide cleaner runs `eslint .`, so
    // keep the smoke harness in the lint gate with Node globals instead of carrying
    // false no-undef noise for process/console/setTimeout (fleet.mjs's pacing delays).
    files: ["blind-tester/**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        setTimeout: "readonly",
      },
    },
  },
  {
    // ui/ — the React/Vite view package (bug_0038), the last first-party dir that
    // had no static-analysis gate. It gets the same correctness bar as the engine
    // (the global js + typescript-eslint recommended sets, unused-vars policy) over
    // its .ts AND .tsx, PLUS the two canonical react-hooks rules. We pin react-hooks
    // explicitly rather than spreading its `recommended` preset: under ESLint 10 the
    // preset bundles the opinionated React-Compiler ruleset (purity/immutability/…),
    // and the broader eslint-plugin-react (jsx-key etc.) still caps its peer at
    // ESLint 9 so it can't be installed here yet — so we ship the stable, universally
    // accepted hooks rules now and leave the Compiler/JSX layer for a future cycle
    // when upstream supports ESLint 10. `no-undef` is off under typescript-eslint
    // (TS owns undefined-symbol checking), so browser globals need no `globals` entry.
    files: ["ui/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
);
