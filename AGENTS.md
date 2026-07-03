# Agent Charter

This project runs on **trust, but verify**.

## Authority

- Agents may change engine code, schemas, DSLs, mechanics, content, tooling, and docs.
- Normal implementation decisions have no human-approval gate and no §14 ceremony.
- Keep changes scoped to the task and the repo's existing patterns.

## Verification Bar

Before finishing substantive work, run the relevant checks. For normal repo changes,
the full bar is:

- `npm run typecheck`
- `npm run lint`
- `npm run format:check`
- `npm test`
- `npm run health`

`npm run health` runs verifier integrity, typecheck, lint, format check, tests, and
pack validation. Do not commit or merge red.

## Do Not Weaken Verification

- Do not disable, skip, delete, or hollow out tests to make a change pass.
- Do not weaken `scripts/verify-integrity.ts` or protected assets to route around the bar.
- If content behavior intentionally changes, update tests and traces honestly.
- When fixing a bug, add or keep a regression and a `traces/bugs/` artifact when the
  surrounding workflow calls for it.

## Runtime

- Node.js 22+.
- Install root deps with `npm install`.
- Install UI deps with `npm --prefix ui install`.
- Optional UI server: `npm run ui:dev` at `http://localhost:5173`.
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
- Owner preference is to land on `main`, but keep protected-branch checks green.
- Never print or commit secrets. Use local env files only when a task explicitly needs
  credentials.
