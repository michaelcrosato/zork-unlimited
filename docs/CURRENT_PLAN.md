# Current Plan

This is the AFK loop's token-small handoff document. It is OVERWRITTEN each
ultraplan with the synthesis plus the one chosen next move; a fresh
implementation subagent reads ONLY this doc and the files it names. Keep it
current, terse, dated, and under ~60 lines — completed work belongs in git
history and `docs/DECISION_LOG.md`, not here.

## Cycle: 2026-07-08 — Tide-Mill benchmark hardening

## Synthesis

The first benchmark slice is now live as `world_quest_id=tide_mill`, anchored to
`new_york_city__waterfront` in the New York overworld. It ports the retired
Tide-Mill DAG into the RPG engine with required seeded combat, prep-backed seeded
skill checks, telegraphed greed/death forks, and a win-only score capstone.
The seed-73 blind pass reached `ending_saved` at 55/55 with clarity 5/5 and
enjoyment 4/5, but found one concrete S1 polish defect.

## Chosen Move

Fix the Tide-Mill Wheel-Room stale crank-handle prose.

- Target file: `content/rpg/quests/tide_mill.yaml`.
- The blind report says that after taking the crank-handle, later Wheel-Room
  variants can still say it hangs on its peg. Update the affected variants so
  `has_flag: crank_handle_taken` is respected alongside `sluice_clear`,
  `pawl_free`, and both-faults-fixed states.
- Add a focused regression if an existing variant-liveness/prose test does not
  pin this exact held-handle state.

## Acceptance

1. `npm run validate -- tide_mill` reports 0 errors / 0 warnings.
2. The stale Wheel-Room text is impossible on the seed-73 prepared route after
   the crank-handle is taken.
3. `npm run health` passes, then re-run `npm run blind --quest=tide_mill` with a
   new seed and use its exit interview as the next lever.

## Deferred Levers

- Deepen replayability once the first blind polish finding is closed: add a
  real alternate repair ordering payoff, a second branch around the takings, or
  another informed gamble inside the same Tide-Mill slice.
- Extend token/cost telemetry to agent work turns (the blind-run half landed
  2026-07-06: ai-runs/blind-telemetry.jsonl + `npm run blind:telemetry`).
- Shrink low-level debug helpers that still leak raw pack paths in diagnostics.
- Tighten the remaining restore-time local action sequencing beyond discovery
  prefixes (most sequencing properties are already enforced; state the specific
  remaining gap when picking this up).
