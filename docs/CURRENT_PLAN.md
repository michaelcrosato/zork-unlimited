# Current Plan

This is the AFK loop's token-small handoff document. It is OVERWRITTEN each
ultraplan with the synthesis plus the one chosen next move; a fresh
implementation subagent reads ONLY this doc and the files it names. Keep it
current, terse, dated, and under ~60 lines — completed work belongs in git
history and `docs/DECISION_LOG.md`, not here.

## Cycle: 2026-07-08 - Albany Opening Fiction Bridge

## Synthesis

Fresh-game feedback is now tracked in `docs/BLIND_FEEDBACK_LEDGER.md`, generated
by `npm run blind:feedback`. It parses verified blind reports, keeps the latest
100 entries explicit, and collapses older accepted entries into trait counts.

Baseline: 25 Codex fresh-game `overworld` runs, seeds 341-365, all exited 0 and
reached valid reports. They consistently found `wolf_winter`; clarity 25x4/5,
enjoyment 25x4/5, replay 25x true. The embedded quest is carrying the opening:
prep, advice, gear, and combat payoff are strong.

The repeated opening weakness is not solvability. It is authored-place feel.
Agents describe Albany Civic Center / Station Quarter as procedural, list-like,
or a compact content index before the quest begins. The `wolf_winter` handoff
then feels like a sudden jump from New York civic/transit work into a mythic
winter steading without enough local bridge. Secondary repeats: completed jobs
and completed quest leads remain listed without status, road encounters resolve
after arrival and repeat too easily, quest completion consumes no overworld
time, and nearby towns can feel like renamed civic templates.

Keep `tide_mill` as the benchmark quest and preserve its Head-Race aliases, but
the next move should harden the actual fresh-start slice: Albany first, then the
route into an authored quest.

## Chosen Move

Make Albany Station Quarter and its first quest lead feel authored and
world-coherent before changing systems.

- Target `content/world/new_york_overworld.json` around `albany_city`,
  `albany_city__civic_core`, `albany_city__transport_hub`, and the local
  `wolf_winter` quest lead/discovery text.
- Add Albany-specific arrival/notice/lead texture that connects the station
  quarter to the winter byre crisis through local rumor, freight, weather, or
  relief logistics; keep prose compact and deterministic.
- Do not create a second quest, move the start, or hide the existing discovery
  loop. This is a framing/depth pass on the current start and first quest bridge.
- Add a focused regression pinning the Albany-specific bridge so generator-like
  civic boilerplate cannot return as the first impression.

## Acceptance

1. Focused tests prove Albany's starting/Station Quarter text and `wolf_winter`
   lead are no longer generic civic-template phrasing.
2. `npm run health` passes.
3. Run a 25-seed fresh-game `npm run blind` batch, regenerate
   `docs/BLIND_FEEDBACK_LEDGER.md`, and commit only after reports verify.

## Deferred Levers

- Preserve Tide-Mill alias stability; do not break `use_choked_sluice` or
  `use_billhook_on_choked_sluice`.
- Road/state bookkeeping: pending road encounter after arrival, repeated
  same-road encounter, zero overworld quest time, and completed job/quest status.
- Larger texture pass: Colonie and other nearby towns still feel templated after
  Albany; address after the start slice has a stronger first impression.
- Tide-Mill levers still open: tactical saboteur branch, coin-bag consequence,
  compact stale-ref cleanup.
- Do not start a second quest, add unanchored systems, or touch CYOA/parser.
