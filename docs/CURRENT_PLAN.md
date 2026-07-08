# Current Plan

This is the AFK loop's token-small handoff document. It is OVERWRITTEN each
ultraplan with the synthesis plus the one chosen next move; a fresh
implementation subagent reads ONLY this doc and the files it names. Keep it
current, terse, dated, and under ~60 lines — completed work belongs in git
history and `docs/DECISION_LOG.md`, not here.

## Cycle: 2026-07-08 — Tide-Mill compact orientation

## Synthesis

The first benchmark slice is now live as `world_quest_id=tide_mill`, anchored to
`new_york_city__waterfront` in the New York overworld. It ports the retired
Tide-Mill DAG into the RPG engine with required seeded combat, prep-backed seeded
skill checks, telegraphed greed/death forks, and a win-only score capstone.
The seed-73 stale Wheel-Room crank-handle finding is closed and pinned by
`tests/regression/tide_mill_crank_handle_reactive.test.ts`. The seed-89 blind
Ives dialogue pacing finding is closed and pinned by
`tests/regression/tide_mill_ives_dialogue_flow.test.ts`. The seed-101 blind pass
reached `ending_saved` at 55/55 with clarity 5/5 and enjoyment 4/5, then reported
that compact Wheel-Room text can truncate the exit-orientation sentence.

## Chosen Move

Make Wheel-Room orientation survive compact observation truncation.

- Target file: `content/rpg/quests/tide_mill.yaml`.
- Put the Wheel-Room's live exit map early and tersely enough that compact
  `start`/`step` views show west=head-race, east=yard/tool-shed, south=mill-floor,
  and down=staith/gated before any truncation.
- Keep the full prose reactive to `crank_handle_taken`, `sluice_clear`,
  `pawl_free`, and `gate_up`; do not undo the crank-handle regression.
- Add a compact-observation regression if existing tests only check full prose.

## Acceptance

1. `npm run validate -- tide_mill` reports 0 errors / 0 warnings.
2. A compact Wheel-Room observation names the east/west/south/down orientation
   clearly before truncation on the seed-101 route.
3. `npm run health` passes, then re-run `npm run blind --quest=tide_mill` with a
   new seed and use its exit interview as the next lever.

## Deferred Levers

- Add richer saboteur combat texture: seed 101 flagged that once combat starts,
  the only visible moment-to-moment choice is repeated attack even though prep is
  fair and load-bearing.
- Review flood-hatch temptation wording: the bad crow-bar choice is intentional
  and strongly warned, but seed 89 flagged that completionist players may still
  read the action wording as a required use.
- Deepen replayability once the first blind polish finding is closed: add a
  real alternate repair ordering payoff, a second branch around the takings, or
  another informed gamble inside the same Tide-Mill slice.
- Extend token/cost telemetry to agent work turns (the blind-run half landed
  2026-07-06: ai-runs/blind-telemetry.jsonl + `npm run blind:telemetry`).
- Shrink low-level debug helpers that still leak raw pack paths in diagnostics.
- Tighten the remaining restore-time local action sequencing beyond discovery
  prefixes (most sequencing properties are already enforced; state the specific
  remaining gap when picking this up).
