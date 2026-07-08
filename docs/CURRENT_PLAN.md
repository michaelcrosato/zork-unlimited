# Current Plan

This is the AFK loop's token-small handoff document. It is OVERWRITTEN each
ultraplan with the synthesis plus the one chosen next move; a fresh
implementation subagent reads ONLY this doc and the files it names. Keep it
current, terse, dated, and under ~60 lines — completed work belongs in git
history and `docs/DECISION_LOG.md`, not here.

## Cycle: 2026-07-08 - Completed-State List Clarity

## Synthesis

Albany Civic Center's opening prose now points to concrete first moves: the
Notice Hall board, Rowan Quill's records desk, and the charter-backlog stair.
Focused UI tests pin that scout/talk/explore all still reveal Market Streets,
the Civic Ledger Run, and Civic Underrooms deterministically.

Fresh-game Codex seeds 491-515 all exited 0; clarity 25x4/5, enjoyment 25x4/5,
replay 25x true. The ledger now has 335 accepted reports. The explicit first
screen "what do I try?" complaint narrowed, but hidden-count scope still recurs
as a compact/UI issue rather than pure prose.

The loudest current starting-area friction is stale visible state after progress:
completed quest still listed is the top ledger trait; fresh reports also call
out completed jobs/events still listed, resolved events looking actionable, and
completed hooks staying visible after the Albany/Wolf-Winter loop.

## Chosen Move

Make completed local and quest hooks visibly stop reading as available work in
the Albany starting loop. Keep this as one focused state/readability change:
completed or resolved items should either leave active lists or carry a clear
completed marker in full and compact views, without hiding useful history.

- Target Albany Civic Center / Station Quarter jobs, events, and quest list
  surfaces first, because those are the fresh-run recurrence points.
- Keep deterministic seeded-free overworld behavior; no clocks or `Math.random`.
- Preserve journal/history access; the fix is active-list clarity, not deletion
  of evidence.
- Avoid broad map scaffolding, a second quest, or unrelated compact churn.

## Acceptance

1. Focused tests prove completed Albany local jobs, resolved events, and
   completed Wolf-Winter no longer look like available actions in full view.
2. Focused tests prove compact context exposes clear completed/resolved state or
   removes stale active refs without losing journal/history evidence.
3. `npm run health` passes.
4. Run a 25-seed fresh-game `npm run blind` batch, regenerate
   `docs/BLIND_FEEDBACK_LEDGER.md`, and confirm completed-content/listing
   complaints drop before committing.

## Deferred Levers

- Colonie and nearby towns still feel templated after Albany.
- Compact-view polish: stale/hash-like artifacts and clearer completed-state
  labels.
- Albany-to-Wolf-Winter bridge still needs a stronger genre/fiction handoff.
- Remote discovered jobs need a review surface outside their current area.
- Tide-Mill levers still open: tactical saboteur branch, coin-bag consequence,
  compact stale-ref cleanup.
