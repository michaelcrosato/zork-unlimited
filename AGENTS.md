# Agent Charter

This is the entry point every coding agent (Codex, Claude, Gemini, …) reads
first, and the single source of truth for how work happens here. Codex loads this
file by convention; [`CLAUDE.md`](./CLAUDE.md) and [`GEMINI.md`](./GEMINI.md) are
one-line pointers back to it so the other vendors land here too, because the dev
loop runs on whichever agent a machine has installed and a charter only one vendor
auto-loads is a charter the rest silently skip. Those pointers are deliberately not
copies: duplicated rules drift, and a stale copy is worse than none.

This project runs on **trust, but verify**.

## What this is

AdventureForge is a deterministic, text-based TTRPG engine **designed to be
AI-coded and AI-playtested**. The engine and content are the product; the web UI
(`ui/`) is only a human-facing layer. Quality compounds through an autonomous
improvement loop, and this charter orients the agent driving it.

## Communication

- Use ordinary game-development language in status updates: name the game behavior,
  code change, and check result directly.
- If a required service is unavailable, note it briefly and stop or continue with
  repo-local work as appropriate. Do not inspect personal application state.

## Two loops

Development and playtesting are **separate loops that run in parallel**, and
**any model can drive either one**. The full reference is
`docs/two_loop_workflow.md`.

- **Dev loop** — `loop.sh`. Makes changes and lands them against a mechanical
  bar. It does NOT play the game.
- **Playtest loop** — `playtest-loop.sh`. Plays the published build over and
  over, across as many vendors and personas as the operator's quota allows, and
  promotes corroborated findings into the intake queue.

Other teams are optional and use the same intake: an audit agent, a research or
design agent, the crawler, or a person. **Playtest feedback is not the only way
the game changes.** Everything files a submission into `intake/queue/` with
`npm run submit`, and the dev loop reads only that queue.

The dev loop reads it at the start of a cycle; it never waits for it. An empty
queue is normal and means the assessor's own candidates carry the cycle (set
`AI_LOOP_IDLE_WHEN_EMPTY=1` to wait instead).

## The dev loop (one cycle)

`loop.sh` is the repository's reference driver for this protocol;
`docs/afk_loop.md` is the full protocol; the three-tier testing pyramid (on its
always-on Tier 0 dev foundation) is `docs/testing_pyramid.md`. Each cycle:

1. **Assess** — read the intake queue first (`npm run work`): a queued
   submission is somebody's actual request, and a `verified` or `corroborated`
   playtest item is the strongest evidence available. Claim it with
   `npm run work -- --claim <id>` and close it with `--done <id>`. Then
   `npm run ai:loop` ranks the next-best improvement when the queue is empty —
   which is normal, not a stall.
2. **Crawl gate (pre)** — `npm run crawl:smoke` must be green before touching anything.
3. **One change** — make a single focused improvement (engine, content, or tooling).
4. **Freeze the revision** — run focused checks, then make a local provisional
   commit. Before committing, set the scaffold's machine-owned
   `feedback_cycle_selection` to the exact candidate id actually implemented (or
   null only for off-list work); this is what can consume an accepted feedback
   recommendation. Never push the provisional commit. Pure evidence starts only
   when `git status --porcelain` is exactly empty; a later red gate resets it.
5. **No playtest gate** — the dev loop does not play the game. Experience
   evidence is produced asynchronously by the playtest loop and consumed as QA
   tickets at the START of a cycle, not proven at the end of one. `loop.sh`
   prints the bucket for the cycle log; it can never fail the cycle.
6. **Compile feedback (prompted-agent step)** — run `npm run feedback:status`.
   It verifies the local report ledger plus hash-bound pending cycle reports against
   the last accepted report manifest. Run `npm run feedback:compile` only when status
   says the one-time bootstrap or a ≥3-actionable-report delta is ready. Pure,
   legacy-guided, and structural-smoke reports count; deterministic structural mocks
   remain recorded but never satisfy the threshold or steer product findings. The
   current cycle's pure report becomes pending only after its outer gates, so it is
   intentionally eligible for a later compile. `loop.sh` does not invoke the compiler.
   Crawler findings require explicit `--in` until crawler artifacts gain an equivalent
   tracked acceptance receipt; the mandatory pre/post crawl gates remain unchanged.
7. **Outer gates** — `npm run crawl:smoke` again, then `npm run health`, and
   integrity drift against the cycle-start ref. That is the whole bar. A new crawl
   finding is YOUR regression; any red gate resets the provisional commit.
8. **Finalize** — after every gate is green, the driver seals any provisional
   feedback manifest into the machine-owned acceptance marker in `AI_LOOP_STATE.md`,
   then commits that ledger-only update. Optional push happens only afterward, and
   publishing the build is what the playtest loop picks up. Missing or
   digest-mismatched ignored feedback artifacts fail closed.

With `AI_LOOP_COMMIT=0`, no provisional commit is allowed: the cycle runs its
checks and leaves the work uncommitted. The driver rechecks cleanliness at every
cycle boundary and stops continuous mode after a successful evidence-only cycle
leaves pending work.

Never claim a build was exercised by evidence that was produced against a
different one. Session records carry the exact commit they played, and triage
ages findings out after `STALE_AFTER_BUILDS`; do not hand-wave past either.

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

`npm run health` runs nine steps, in this order: verifier integrity, bug-trace
integrity, the opening-density budget, typecheck, lint, format check, UI
typecheck, pack validation, and finally the vitest suite. Everything cheap runs
first on purpose — the suite is ~48 of the bar's ~50 minutes, so a broken pack or
a UI type error that used to surface three quarters of an hour in now fails in
about a minute. The UI typecheck means UI deps
(`npm --prefix ui install`) are required for the bar, not just for running the
UI server. Do not commit or merge red.

Budget the wall clock: the vitest step dominates and the whole bar takes roughly
50 minutes on a fast machine. Under load, a handful of subprocess-spawning CLI
tests can exceed their 60s/120s timeouts and fail for reasons unrelated to the
change under test — check what actually failed before assuming your work broke
something.

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
- Any supported coding agent can run the dev loop. `loop.sh` auto-detects the
  first installed one (`codex`, `claude`, `gemini`); `AI_AGENT=<id>` selects one
  explicitly and `AI_AGENT_CMD` overrides the command entirely. The only contract
  is: read the prompt from STDIN, edit files in `$PWD`, run non-interactively,
  and exit nonzero on failure.
- Connecting to the engine MCP server. The repo ships `.mcp.json`, which any
  client reading the standard project MCP config — Claude Code among them — picks
  up automatically with no setup. A client that keeps its own registry instead
  needs the server added there once; the command is always
  `npm --silent run mcp` from the repo root.
- Codex needs one extra step, and it fails silently without it. `.codex/config.toml`
  registers the same server, but Codex loads project config **only when the project
  is trusted**, and trust does not cascade from a parent directory — trust this exact
  repo path. Untrusted, the server is simply absent and a headless `codex exec` runs
  with no engine tools rather than erroring. Most robust for the autonomous loop is to
  register it at the user level so project trust stops mattering:
  `codex mcp add adventureforge -- npm --silent run mcp`.
- CLI RPG play requires no server: `npm run play`.
- MCP and live LLM playtests are optional and belong to the playtest loop; CI uses deterministic mocks.

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
  status check is `verify` (`.github/workflows/ci.yml`), with strict up-to-date
  branches and force-pushes disabled. A direct push to `main` is rejected unless
  that commit already has a green `verify` run, so fresh work always goes through a
  branch — **for everyone except a repository admin**. `enforce_admins` is
  currently disabled, so an admin push bypasses the required check entirely. Treat
  the rule as binding on yourself regardless: the protection is not what stops you,
  the charter is. (Enabling `enforce_admins` would make the two agree, at the cost
  of removing the owner's manual override.) Keep every landing green — the bar is
  `npm run health`.
- Never print or commit secrets. Use local env files only when a task explicitly needs
  credentials.
