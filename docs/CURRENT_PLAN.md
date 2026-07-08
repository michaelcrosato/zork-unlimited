# Current Plan

This is the AFK loop's token-small handoff document. It is OVERWRITTEN each
ultraplan with the synthesis plus the one chosen next move; a fresh
implementation subagent reads ONLY this doc and the files it names. Keep it
current, terse, dated, and under ~60 lines — completed work belongs in git
history and `docs/DECISION_LOG.md`, not here.

## Cycle: 2026-07-08 - Road Encounter Travel Timing

## Synthesis

Quest completion time accounting shipped. Completed world quests now spend
deterministic overworld minutes from quest-area travel plus marquee quest renown;
`wolf_winter` spends 139 minutes and the journal says so. Focused lifecycle,
UI/MCP, local-journal, and resource-replay tests pin it.

Fresh-game Codex seeds 391-415 all exited 0; clarity 24x4/5 + 1x3/5, enjoyment
23x4/5 + 2x3/5, replay 23x true / 2x false. The ledger now has 235 accepted
reports, with no fresh zero-overworld-time complaint.

Newest issues: road encounters appear after arrival, the same Albany-Colonie
road event repeats quickly, completed content remains unclearly listed, compact
journal suffixes look hash-like, and nearby towns still feel templated. Keep one
benchmark quest; do not start a second quest or touch CYOA/parser.

## Chosen Move

Make road encounters read and behave as during-travel interruptions, not
after-arrival town blockers, and stop the same road event from immediately
repeating on the short Albany-Colonie return loop.

- Target `src/world/session_travel_log.ts`, `src/world/session_road_encounters.ts`,
  `src/world/session_road_travel.ts`, compact/view shaping, and focused tests.
- Keep deterministic seeded-free overworld behavior; no clocks or `Math.random`.
- Prefer a narrow state/prose fix: frame the event as route trouble encountered
  while traveling, and suppress immediate same-edge repeats after resolution.
- Preserve snapshot restore integrity; update replay/proof tests honestly if the
  pending/resolved road model changes.

## Acceptance

1. Focused tests prove Albany-Colonie road trouble is framed as a travel
   interruption and blocks town actions only until resolved.
2. Focused tests prove resolving a road event suppresses the same edge event on
   the immediate return trip.
3. `npm run health` passes.
4. Run a 25-seed fresh-game `npm run blind` batch, regenerate
   `docs/BLIND_FEEDBACK_LEDGER.md`, and commit only after reports verify.

## Deferred Levers

- Completed job/quest/event status remains unclear in visible lists.
- Colonie and nearby towns still feel templated after Albany.
- Compact-view polish: stale/hash-like artifacts and clearer completed-state
  labels.
- Tool-surface blind reports sometimes miss local area/job/site actions.
- Tide-Mill levers still open: tactical saboteur branch, coin-bag consequence,
  compact stale-ref cleanup.
