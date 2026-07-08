# Current Plan

This is the AFK loop's token-small handoff document. It is OVERWRITTEN each
ultraplan with the synthesis plus the one chosen next move; a fresh
implementation subagent reads ONLY this doc and the files it names. Keep it
current, terse, dated, and under ~60 lines — completed work belongs in git
history and `docs/DECISION_LOG.md`, not here.

## Cycle: 2026-07-08 — Tide-Mill opening orientation

## Synthesis

The first benchmark slice is now live as `world_quest_id=tide_mill`, anchored to
`new_york_city__waterfront` in the New York overworld. It ports the retired
Tide-Mill DAG into the RPG engine with required seeded combat, prep-backed seeded
skill checks, telegraphed greed/death forks, and a win-only score capstone.
The seed-73 stale Wheel-Room crank-handle finding is closed and pinned by
`tests/regression/tide_mill_crank_handle_reactive.test.ts`. The seed-89 blind
Ives dialogue pacing finding is closed and pinned by
`tests/regression/tide_mill_ives_dialogue_flow.test.ts`. The seed-101 blind pass
Wheel-Room compact finding is closed and pinned by
`tests/regression/tide_mill_wheel_room_compact_orientation.test.ts`. The seed-113
blind pass reached `ending_saved` at 55/55 with clarity 5/5 and enjoyment 4/5,
then reported that the opening Mill-House compact text can leave east/counting
nook versus yard/tool-shed orientation briefly ambiguous.

## Chosen Move

Make opening Mill-House orientation survive compact observation truncation.

- Target file: `content/rpg/quests/tide_mill.yaml`.
- Put the Mill-House's live exit map early and tersely enough that compact start
  views show north=wheel-room (then east to yard/tool-shed) and
  east=counting-nook before any truncation.
- Preserve the opening objective, board/gaff/Ives affordances, and the
  `hook_taken`/`gate_up` reactive variants without bloating compact prose.
- Add or extend a compact-observation regression for the opening view.

## Acceptance

1. `npm run validate -- tide_mill` reports 0 errors / 0 warnings.
2. A compact Mill-House start observation names north/wheel-room/yard path and
   east/counting-nook clearly before truncation on the seed-113 route.
3. `npm run health` passes, then re-run `npm run blind --quest=tide_mill` with a
   new seed and use its exit interview as the next lever.

## Deferred Levers

- The seed-113 coin-bag uncertainty is already covered by `ending_thief`; only
  revisit if a future blind player takes it and finds the consequence unclear.
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
