# Current Plan

This is the AFK loop's token-small handoff document. It is OVERWRITTEN each
ultraplan with the synthesis plus the one chosen next move; a fresh
implementation subagent reads ONLY this doc and the files it names. Keep it
current, terse, dated, and under ~60 lines — completed work belongs in git
history and `docs/DECISION_LOG.md`, not here.

## Cycle: 2026-07-08 - Directional Road Event Texture

## Synthesis

True mid-route road interruptions shipped. While `pending_road` exists, full and
compact context now present a route location (`road:<edge_id>`) with no town
roads/local affordances; resolving the encounter lands the arrival beat and
restores destination-town actions. Compact overworld context is now v13.

Fresh-game Codex seeds 441-465 all exited 0; clarity 25x4/5, enjoyment 25x4/5,
replay 25x true. The ledger now has 285 accepted reports. The explicit
after-arrival road complaint did not recur in the fresh batch.

Newest issues: several reports now call the Albany-Colonie road event generic or
directionally awkward ("road report" text can read like the opposite travel
direction), completed quest/event/job status is still unclearly listed, dialogue
ids/quotes are noisy, compact journal hash/truncation persists, and the
Albany-to-Wolf-Winter tone bridge still needs stronger fiction.

## Chosen Move

Make early road encounters read as concrete, direction-safe incidents rather than
generic road reports. The Albany-Colonie road is the priority because it is the
first-route benchmark path hit by the blind batch.

- Target the New York overworld road-event generation/content surface and focused
  tests around the Albany-Colonie road event title/summary/resolution text.
- Keep deterministic seeded-free overworld behavior; no clocks or `Math.random`.
- Prefer direction-neutral or route-relative wording when an edge can be traveled
  both ways.
- Avoid broad map scaffolding or a second quest.

## Acceptance

1. Focused tests prove Albany-Colonie road-event prose no longer says generic
   "road report" or names the wrong direction for either travel direction.
2. Focused tests prove the compact/full pending-road and resolution text still
   preserve the v13 mid-route state.
3. `npm run health` passes.
4. Run a 25-seed fresh-game `npm run blind` batch, regenerate
   `docs/BLIND_FEEDBACK_LEDGER.md`, and confirm road-direction/generic-road
   complaints drop before committing.

## Deferred Levers

- Completed job/quest/event status remains unclear in visible lists.
- Colonie and nearby towns still feel templated after Albany.
- Compact-view polish: stale/hash-like artifacts and clearer completed-state
  labels.
- Albany-to-Wolf-Winter bridge still needs a stronger genre/fiction handoff.
- Remote discovered jobs need a review surface outside their current area.
- Tide-Mill levers still open: tactical saboteur branch, coin-bag consequence,
  compact stale-ref cleanup.
