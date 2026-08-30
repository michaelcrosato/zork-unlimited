# Parallel agent lanes

How 4+ agents work this repo concurrently without corrupting each other's
state. Design rationale and phasing:
`docs/superpowers/specs/2026-08-27-scaleout-design.md`. Tooling:
`scripts/lane.mjs` (`npm run lane -- <command>`).

## Why lanes exist

The AFK loop's coordination layer is deliberately single-writer: fixed-path
state (`ai-runs/latest-cycle.json`, `AI_LOOP_STATE.md` machine markers, PID
files, the feedback acceptance chain) plus gates that require an untouched
tree (`require_final_ledger_only`, `verify:integrity --against`, the pure
sidecar's clean-worktree bit). Two agents in one worktree corrupt each other;
a failed cycle's self-recovery hard-resets the tree. Lanes solve this with
isolation instead of surgery: each agent gets its own git worktree and
branch, and git's merge machinery plus the required `verify` CI check arbitrate
integration — the same landing bar as before.

## The lanes

| Lane | Zone (primary write scope) |
|---|---|
| `content-a` | `content/rpg/quests/` split 1 + their tests and traces |
| `content-b` | `content/rpg/quests/` split 2 + their tests and traces |
| `engine` | `src/` (except `src/afk`, `src/feedback`), `ui/`, their tests |
| `harness` | `blind-tester/`, `scripts/`, `src/afk/`, `src/feedback/`, docs |

Zones are a coordination convention, not an ACL: a lane may read anything, and
may touch outside its zone when a task genuinely requires it — the orchestrator
resolves overlaps in the task brief before dispatch, never after a conflict.

**Single-writer rule.** These are global, conflict-prone files; at most one
lane holds each at a time, assigned in the task brief:

- `content/world/new_york_overworld.json` (single world hash pinned by tests)
- `AI_LOOP_STATE.md` (machine-owned markers; normally the AFK loop's alone)
- `docs/DECISION_LOG.md` (append-only)
- `traces/bugs/` next sequence number (two lanes minting `bug_0XXX` collide)

## Working a lane

```
npm run lane -- create content-a        # worktree ../zork-lanes/content-a, branch lane/content-a
cd ../zork-lanes/content-a
# … work, commit …
git push -u origin lane/content-a       # then open a PR; verify (~50 min) gates the merge
npm run lane -- remove content-a        # after the PR lands
```

- Lanes branch from `origin/main` and should rebase on it before opening a PR.
- `node_modules` is junction-linked from the primary checkout by default; use
  `--no-link` + `npm install` when the task changes dependencies.
- Stagger landings: each PR burns ~50 runner-minutes of `verify`; per-ref
  cancel-in-progress means lanes never cancel each other's CI.
- Task briefs follow the ultraplan subagent contract: objective, output
  format, tool guidance, boundaries — with `docs/DECISION_LOG.md` "Confirmed
  CLOSED" as a hard do-not-re-nominate boundary.
- The bar for landing is unchanged: `npm run health` green, no weakened
  verification, PR through the required `verify` check.

## What lanes must NOT do

- Run `loop.sh` or `npm run fleet` (live) concurrently in a tree where either
  is already running. The AFK loop keeps a dedicated worktree; the fleet
  cohort ledger (shared across linked worktrees via the git common dir)
  already rejects concurrent live fleet starts unconditionally.
- Write to `blind-tester/reports/` (pure-lane attendance namespace) or edit
  `AI_LOOP_STATE.md` machine markers by hand.
- Land red or route around `verify:integrity` — the charter's
  "Do Not Weaken Verification" applies in every lane.

QA evidence for lane work comes from the advisory persona fleet
(`docs/qa_fleet.md`, `npm run qa:fleet`), whose output is quarantined under
`ai-runs/qa/` and never counts as retention evidence.
