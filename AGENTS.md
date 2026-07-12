# Agent Charter

This is the entry point every coding agent (Codex, Claude, Gemini, …) reads
first. This project runs on **trust, but verify**.

## What this is

AdventureForge is a deterministic, text-based TTRPG engine **designed to be
AI-coded and AI-playtested**. The engine and content are the product; the web UI
(`ui/`) is only a human-facing layer. Quality compounds through an autonomous
improvement loop, and this charter orients the agent driving it.

## The loop (one cycle)

`loop.sh` runs it; `docs/afk_loop.md` is the full protocol; the three-tier
testing pyramid behind it is `docs/testing_pyramid.md`. Each cycle:

1. **Assess** — `npm run ai:loop` ranks the next-best improvement (compiled hot spots, when present, are a primary input).
2. **Crawl gate (pre)** — `npm run crawl:smoke` must be green before touching anything.
3. **One change** — make a single focused improvement (engine, content, or tooling).
4. **Crawl gate (post)** — `npm run crawl:smoke` again; a new finding is YOUR regression.
5. **Blind playtest** — one fresh blind reasoning agent per normal cycle uses the
   canonical `pure` mode (protocol: docs/blind_playtest_protocol.md). It starts a
   brand-new overworld game and receives only the tutorial, goal, state, legal
   choices, turn/checkpoint information, and consequences available to a human.
   The game presents continue/end choices at its goal-completion/checkpoint
   boundaries; the harness interviews only after the player ends the journey.
   There is no test-only route, coverage target, or call-count stopping rule.
   Direct quest starts and crawler/smoke/mock modes are explicit structural QA
   instruments and never pure retention evidence. Milestone or feedback-harvest
   cycles (every ~10 cycles, or when the ledger's open questions outgrow single
   reports) run `npm run fleet -- --count 100` instead.
6. **Compile feedback** — when ≥3 new verified reports exist since the last compile: `npm run feedback:compile`;
   triage from `hotspots.md`.
7. **Verify** — `npm run health` must pass; no playtest report ⇒ no commit.
8. **Commit** — one green increment, terse note in `AI_LOOP_STATE.md`.

## Authority

- Agents may change engine code, schemas, DSLs, mechanics, content, tooling, and docs.
- Normal implementation decisions have no human-approval gate and no §14 ceremony
  (the retired engine-extension approval gate from the original numbered build
  spec; its history lives in `docs/archive/`).
- Keep changes scoped to the task and the repo's existing patterns.

## Verification Bar

`npm run health` is the bar for anything that lands. The granular scripts
(`npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`) are
strict subsets of it — use them for fast iteration, not as an additional
requirement on top of health.

`npm run health` runs verifier integrity, typecheck, lint, format check, tests,
UI typecheck, and pack validation. The UI typecheck means UI deps
(`npm --prefix ui install`) are required for the bar, not just for running the
UI server. Do not commit or merge red.

`npm run crawl:smoke` is the mechanical gate (docs/testing_pyramid.md); it is
deliberately NOT part of `health`.

## Do Not Weaken Verification

- Do not disable, skip, delete, or hollow out tests to make a change pass.
- Do not weaken `scripts/verify-integrity.ts` or protected assets to route around the bar.
- If content behavior intentionally changes, update tests and traces honestly.
- When fixing a bug, add or keep a regression and a `traces/bugs/` artifact when the
  surrounding workflow calls for it.

## Runtime

- Node.js 22+.
- Install root deps with `npm install`.
- Install UI deps with `npm --prefix ui install` (required for `npm run health`).
- Optional UI server: `npm run ui:dev` at `http://localhost:5173`.
- Codex agents: the repo-local `.codex/config.toml` registers the engine MCP
  server, but Codex loads project config **only when the project is trusted**
  (trust does not cascade from a parent dir — trust this exact repo path). Most
  robust for the autonomous loop: register the server once at the user level so
  it works regardless of project trust —
  `codex mcp add adventureforge -- npm --silent run mcp`.
- CLI RPG play requires no server: `npm run play`.
- MCP and live LLM playtests are optional; CI uses deterministic mocks.

## Token Economy

- Prefer targeted `rg`, `git grep`, `git ls-files`, and ranged file reads over broad
  whole-file dumps.
- Treat `AI_LOOP_STATE.md` as a terse index, not a transcript. Old detail is preserved
  by Git history.
- Keep raw evidence in ignored paths: `ai-runs/`, `blind-tester/reports/`, logs,
  coverage, build output, and local runtime directories.
- Large content packs, generated world JSON, traces, lockfiles, and historical docs are
  on-demand context. Open them only when the task needs them.

## Git

- Commit in clear increments when asked to land work.
- Branch policy: `main` is the only long-lived branch and the default. Work lands
  through short-lived feature branches merged into `main` via PR; the required
  status check is `verify` (`.github/workflows/ci.yml`). A direct push to `main`
  is rejected unless that commit already has a green `verify` run, so fresh work
  always goes through a branch. Keep every landing green — the bar is
  `npm run health`.
- Never print or commit secrets. Use local env files only when a task explicitly needs
  credentials.
