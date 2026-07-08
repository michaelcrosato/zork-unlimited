# Current Plan

This is the AFK loop's token-small handoff document. It is OVERWRITTEN each
ultraplan with the synthesis plus the one chosen next move; a fresh
implementation subagent reads ONLY this doc and the files it names. Keep it
current, terse, dated, and under ~60 lines — completed work belongs in git
history and `docs/DECISION_LOG.md`, not here.

## Cycle: 2026-07-08 - Wolf-Winter Dialogue Surface Polish

## Synthesis

Completed Albany local jobs, resolved events, and completed Wolf-Winter now leave
active full/compact lists while completed/resolved ids and journal history remain
visible. Focused UI tests pin the full and compact behavior for all three
surfaces.

Fresh-game Codex seeds 516-540 all exited 0; clarity 25x4/5, enjoyment 25x4/5,
replay 25x true. The ledger now has 360 accepted reports. A targeted scan found
0 completed-active-list repeats in the fresh batch.

The loudest current starting-area friction moved to Wolf-Winter dialogue surface:
23/25 reports mention dialogue, 11/25 mention `ask_ask` or duplicated ask ids,
and many pair that with malformed nested quotation/back narration. Compact
journal hash fragments and off-area job visibility are still active deferred
issues, but dialogue is the most repeated, tightly scoped next cut.

## Chosen Move

Polish the Wolf-Winter dialogue surface without changing quest structure:
player-visible legal/action ids, dialogue back/leave text, and nested quote
formatting should read authored rather than generated.

- Target `content/rpg/quests/wolf_winter.yaml` first; inspect the dialogue
  rendering/tests only if the pack cannot express the cleaner surface directly.
- Prefer stable aliases if action ids need renaming so existing deterministic
  routes remain valid.
- Keep the houndsman/Old Cade advice mechanically identical unless a wording fix
  needs a small regression.
- Keep deterministic seeded-free overworld behavior; no clocks or `Math.random`.
- Avoid broad compact-view truncation work this cycle; hash fragments are the
  next likely lever after dialogue is clean.

## Acceptance

1. Focused quest/UI/MCP tests prove Wolf-Winter dialogue legal actions no longer
   expose doubled `ask_ask`-style labels or ids to players.
2. Focused tests or traces prove dialogue back/leave narration no longer emits
   malformed nested quotation/speaker text.
3. `npm run health` passes.
4. Run a 25-seed fresh-game `npm run blind` batch, regenerate
   `docs/BLIND_FEEDBACK_LEDGER.md`, and confirm dialogue-id/quote complaints
   drop before committing.

## Deferred Levers

- Colonie and nearby towns still feel templated after Albany.
- Compact-view polish: stale/hash-like journal artifacts and tuple labels.
- Albany-to-Wolf-Winter bridge still needs a stronger genre/fiction handoff.
- Remote discovered jobs need a review surface outside their current area.
- Tide-Mill levers still open: tactical saboteur branch, coin-bag consequence,
  compact stale-ref cleanup.
