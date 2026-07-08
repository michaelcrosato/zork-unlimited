# Current Plan

This is the AFK loop's token-small handoff document. It is OVERWRITTEN each
ultraplan with the synthesis plus the one chosen next move; a fresh
implementation subagent reads ONLY this doc and the files it names. Keep it
current, terse, dated, and under ~60 lines — completed work belongs in git
history and `docs/DECISION_LOG.md`, not here.

## Cycle: 2026-07-08 - Off-Area Job Memory Surface

## Synthesis

Wolf-Winter dialogue now exposes authored topic ids (`ask_wolves`, `ask_byre`,
`ask_leave`), hides old doubled ids as MCP aliases, offers direct follow-ups and
leave from advice nodes, and uses pure spoken return text. Focused regressions
pin legal ids, alias stepping, and non-nested Cade narration.

Fresh-game Codex seeds 541-565 all exited 0; clarity 25x4/5, enjoyment 25x4/5,
replay 25x true. The ledger now has 385 accepted reports. Targeted dialogue
terms dropped to 0/25 for `ask_ask`, duplicated/doubled ask, quote, nested,
malformed, and back-action complaints.

The loudest starting-area friction is now memory/scope: 20/25 reports mention
jobs, many specifically saying jobs revealed from another Albany area disappear
from the current-area context. Hidden counts remain abstract because they say
content exists but do not help players remember where discovered work lives.

## Chosen Move

Add a compact, deterministic discovered-work memory surface for the starting
area so off-area jobs no longer feel vanished while preserving the active
current-area job list.

- Target Albany Civic Center / Station Quarter first; full and compact views
  should show known unfinished jobs outside the current area as remembered leads,
  not available local actions.
- Keep active `jobs` area-scoped; add a separate review/list/memory surface or
  clear result prose rather than making remote jobs executable from anywhere.
- Preserve completed-job filtering and completed ids/journal history.
- Keep deterministic seeded-free overworld behavior; no clocks or `Math.random`.
- Avoid broad compact hash/truncation work this cycle unless it is required to
  make the new memory surface readable.

## Acceptance

1. Focused overworld/UI/MCP tests prove discovered unfinished jobs outside the
   current area remain visible as remembered leads in full and compact views.
2. Focused tests prove remembered off-area jobs are not executable as current-area
   work and completed jobs still leave active/memory surfaces while staying in
   completed ids/journal history.
3. `npm run health` passes.
4. Run a 25-seed fresh-game `npm run blind` batch, regenerate
   `docs/BLIND_FEEDBACK_LEDGER.md`, and confirm off-area job disappearance
   complaints drop before committing.

## Deferred Levers

- Colonie and nearby towns still feel templated after Albany.
- Compact-view polish: stale/hash-like journal artifacts and tuple labels.
- Albany-to-Wolf-Winter bridge still needs a stronger genre/fiction handoff.
- Road encounter arrival/timing wording still repeats in fresh samples.
- Tide-Mill levers still open: tactical saboteur branch, coin-bag consequence,
  compact stale-ref cleanup.
