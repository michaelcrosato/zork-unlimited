# Linear workflow — the human ticket surface

The repo's machine work-queue is `intake/queue/` (see `docs/parallel_lanes.md`
and `intake/queue/README.md`). Linear mirrors it for human visibility,
prioritization, and assignment:

- **Workspace/project**: Linear project **AdventureForge**
  (linear.app/michael-crosato, team `MIC`).
- **Join key**: every mirrored issue's title starts with the repo submission id
  as `[16-hex]`. That id is the handle for `npm run work -- --claim/--done`.
- **Priority map**: repo `P0/P1/P2/P3` ↔ Linear Urgent/High/Medium/Low.
- **Labels**: `intake-mirror` (mirrored item), `source:audit|playtest|…`
  (submission source), `lane:content|dev|playtest|ops` (routing suggestion).

## Source of truth

The JSON file in `intake/queue/` wins every disagreement. Linear is a mirror:
closing an issue in Linear does **not** close the repo item, and vice versa,
until a sync runs. Never let an agent treat Linear state as authoritative.

## How it syncs today

The orchestrator session syncs manually via Linear's MCP tools:

- repo → Linear: new open submissions become issues (title `[id] …`, priority
  mapped, labels applied); repo-side closes move the issue to Done.
- Linear → repo: a human assignment or priority change is reflected by the
  orchestrator as a claim (`npm run work -- --claim <id>` with the assignee's
  lane identity) or a priority edit to the queue JSON.

A scripted two-way sync (the `sync-intake-github.ts` pattern, pointed at
Linear's API with a local `LINEAR_API_KEY`) is tracked in the intake queue as
its own submission; until it lands, the manual MCP sync above is the
procedure.

## What humans do in Linear

Reprioritize, assign to a lane (set the `lane:*` label or assignee), comment
context. Agents pull work from the repo queue; the orchestrator carries your
Linear-side decisions into claims. The GitHub Issues mirror
(`scripts/sync-intake-github.ts`) remains available and marker-idempotent;
Linear does not replace it, it fronts it.
