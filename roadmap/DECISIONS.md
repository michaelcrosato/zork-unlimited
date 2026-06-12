# Decisions Log (append-only, ADR-lite)

> One entry per autonomous judgment call: context → decision → reversible? → where it lives.

---

2026-06-11 | Stack: TypeScript (Node.js 22+, ESM) confirmed as primary language → charter §4.1 recommends TypeScript; the arc terminates in a React web UI making a single language across engine + UI the conventional choice. Reversible (Python alternative documented in §4.2). Lives in package.json + tsconfig.json. (department)

2026-06-11 | Schema/validation: Zod (runtime schema validation) confirmed → charter §4.1 explicitly specifies Zod; schemas double as the content contract (single source of truth). Not reversible without a schema rewrite. Lives in src/. (department)

2026-06-11 | Test framework: Vitest + fast-check confirmed → charter §4.1 specifies Vitest for unit tests and fast-check for property tests. Reversible. Lives in package.json devDependencies. (department)

2026-06-11 | Content format: YAML authored, compiled to validated JSON at runtime → charter §4.1 specifies this; YAML is human-readable for AI authoring and the validator enforces the schema at compile time. Reversible. Lives in content/ directory. (department)

2026-06-11 | Database: None (filesystem content packs) → the engine is headless; all game state lives in YAML/JSON content packs versioned in git. No external database service is warranted. Content-hash integrity replaces database integrity guarantees. Reversible (a future Stage 5+ UI might add a persistence layer). Lives in AI_OPERATIONS_PLAN.md §2.1. (department)

2026-06-11 | QA surface: CLI + MCP stdio server (no web deployment) → the product is a headless engine; the operator QAs by running `npm run play` / `npm run health` and reading the blind LLM playtest transcript attached to each PR. A browser URL is not relevant. Reversible when Stage 5 web UI ships. Lives in AI_OPERATIONS_PLAN.md §2.1 and OPERATOR_GUIDE.md. (department)

2026-06-11 | E2E approach: Blind LLM playtest via MCP (`npm run health` + blind-tester/ harness) → the charter §12.8 explicitly defines two testing modes: dev tests (full knowledge, deterministic) and blind LLM playtest (no repo access, plays over MCP tools). No browser automation is appropriate for a headless engine. Reversible when a web UI ships. Lives in AI_OPERATIONS_PLAN.md §2.1 and docs/blind_playtest_protocol.md. (department)

2026-06-11 | Package name: adventureforge → kebab-case product slug matching the product's public identity (AdventureForge); short, unambiguous, matches the MCP server name `adventureforge`. Reversible. Lives in package.json. (department)

2026-06-11 | GitHub repo: michaelcrosato/zork-unlimited → repo already existed under this handle/name; kept as-is. Not reversible without a repo rename. Lives in AI_OPERATIONS_PLAN.md §2.1. (department)

