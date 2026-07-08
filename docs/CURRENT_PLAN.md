# Current Plan

This is the AFK loop's token-small handoff document. It is OVERWRITTEN each
ultraplan with the synthesis plus the one chosen next move; a fresh
implementation subagent reads ONLY this doc and the files it names. Keep it
current, terse, dated, and under ~60 lines — completed work belongs in git
history and `docs/DECISION_LOG.md`, not here.

## Cycle: 2026-07-08 - Overworld Quest Time Accounting

## Synthesis

The Albany bridge shipped: Civic Center / Station Quarter / Hayden / relief
packet / signal-yard / job / `wolf_winter` discovery now ground the first quest
lead in local winter-relief logistics. Fresh-game Codex seeds 366-390 all exited
0 and reached `wolf_winter`; clarity 25x4/5, enjoyment 25x4/5, replay 25x true.

`docs/BLIND_FEEDBACK_LEDGER.md` now has 210 accepted reports. Broader goal:
improve Albany/New York as an open-world start, not only an embedded quest. The
slice should take time, contain local systems, and support seeded TTRPG variance.

Newest issues: Albany-Colonie road encounter timing, `wolf_winter` consumes no
overworld time, completed content is unclearly listed, compact view exposes
hash-like artifacts, and nearby towns feel templated. Keep one benchmark quest;
do not start a second quest or touch CYOA/parser. Preserve `tide_mill` aliases.

## Chosen Move

Make completing a discovered world quest advance deterministic overworld time so
the first expedition feels like a real stretch of day.

- Target `src/world/session_quests.ts`, `src/world/session_quest_lifecycle.ts`,
  MCP/UI result shaping, and focused `wolf_winter`/shipped-quest tests.
- Reuse existing quest metadata where possible; if a deterministic duration is
  missing, derive a compact bounded duration from existing difficulty/risk
  rather than adding broad new schema.
- Result text should say time passed in-world, the observation clock should
  advance, and repeated completion must remain idempotent.
- State accounting only: do not change RPG combat/check randomness except
  through already seeded quest play.

## Acceptance

1. Focused tests prove completed discovered quests advance minutes, record
   journal time, and keep repeated completion zero-change.
2. `npm run health` passes.
3. Run a 25-seed fresh-game `npm run blind` batch, regenerate
   `docs/BLIND_FEEDBACK_LEDGER.md`, and commit only after reports verify.

## Deferred Levers

- Road/state bookkeeping: pending road encounter after arrival, repeated
  same-road encounter, and completed job/quest/event status.
- Colonie and nearby towns still feel templated after Albany.
- Compact-view polish: stale/hash-like artifacts and clearer completed-state
  labels.
- Tide-Mill levers still open: tactical saboteur branch, coin-bag consequence,
  compact stale-ref cleanup.
