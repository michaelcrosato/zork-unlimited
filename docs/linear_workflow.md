# Linear workflow - the human ticket surface

The repo's machine work-queue is `intake/queue/` (see `docs/parallel_lanes.md`
and `intake/queue/README.md`). Linear mirrors it for human visibility,
prioritization, and assignment:

- **Workspace/project**: Linear project **AdventureForge**
  (linear.app/michael-crosato, team `MIC`).
- **Join key**: every mirrored issue's title starts with the repo submission id
  as `[16-hex]`. That id is the handle for `npm run work -- --claim/--done`.
- **Priority map**: repo `P0/P1/P2/P3` -> Linear Urgent/High/Medium/Low.
- **Labels**: `intake-mirror` (mirrored item), `source:audit|playtest|...`
  (submission source), `lane:content|dev|playtest|ops` (routing suggestion).

## Source of truth

The JSON file in `intake/queue/` wins every disagreement. Linear is a mirror:
closing an issue in Linear does **not** close the repo item, and vice versa,
until a sync runs. Never let an agent treat Linear state as authoritative.

## How it syncs

The repository provides a scripted two-way sync:

```bash
LINEAR_API_KEY=... npm run intake:sync:linear -- --dry-run
LINEAR_API_KEY=... npm run intake:sync:linear
```

`LINEAR_PROJECT` defaults to `adventureforge-59cb5298fba1` and `LINEAR_TEAM`
defaults to `MIC`; both can be overridden for a fork. The key is read only from
the local environment. `--push-only`, `--pull-only`, and `--queue <dir>` are
available for bounded runs.

- repo -> Linear: local submissions are upserted by the `[16-hex]` title marker,
  with priority, metadata, labels, and local lifecycle state mirrored; local
  `done`, `declined`, and `stale` items move to a completed Linear state.
- Linear -> repo: unmarked issues are adopted as open human submissions, remote
  priority changes become queue priority edits, and assignees are printed as
  claim suggestions.

Linear workflow state is never imported as a local close. If somebody closes an
issue in Linear while the queue still says `open` or `in_progress`, the next
push reopens it to match the repository. Run `--dry-run` before the first write
and after manual Linear changes.

The Linear MCP connection is useful for interactive work, but the scripted sync
uses the same public GraphQL API directly so it can run from a checkout. If the
MCP connection or API key is unavailable, the local queue remains usable and the
sync reports the reason without failing the dev loop.

## What humans do in Linear

Reprioritize, assign to a lane (set the `lane:*` label or assignee), and comment
context. Agents pull work from the repo queue; the sync carries priority changes
into queue files and prints claim suggestions for assignees. The GitHub Issues
mirror (`scripts/sync-intake-github.ts`) remains available and marker-idempotent;
Linear is the human project surface for this workflow, not the local source of
truth.
