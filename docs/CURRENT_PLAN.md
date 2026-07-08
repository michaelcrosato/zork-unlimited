# Current Plan

This is the AFK loop's token-small handoff document. It is OVERWRITTEN each
ultraplan with the synthesis plus the one chosen next move; a fresh
implementation subagent reads ONLY this doc and the files it names. Keep it
current, terse, dated, and under ~60 lines — completed work belongs in git
history and `docs/DECISION_LOG.md`, not here.

## Cycle: 2026-07-08 — Tide-Mill dialogue pacing

## Synthesis

The first benchmark slice is now live as `world_quest_id=tide_mill`, anchored to
`new_york_city__waterfront` in the New York overworld. It ports the retired
Tide-Mill DAG into the RPG engine with required seeded combat, prep-backed seeded
skill checks, telegraphed greed/death forks, and a win-only score capstone.
The seed-73 stale Wheel-Room crank-handle finding is closed and pinned by
`tests/regression/tide_mill_crank_handle_reactive.test.ts`. The seed-89 blind
pass reached `ending_saved` at 55/55 with clarity 5/5 and enjoyment 4/5, then
reported the next S1 friction: Miller Ives' advice topics require a separate
back action after every answer.

## Chosen Move

Smooth the Miller Ives opening conversation without weakening the prep choices.

- Target file: `content/rpg/quests/tide_mill.yaml`.
- The player should be able to consume the urgent race/pawl/yard advice without
  repeated mechanical backtracking. Prefer a content-level solution that keeps
  advice explicit and optional; only touch dialogue runtime if the existing DSL
  cannot express the cleaner flow.
- Keep the advice load-bearing: it should still grant the existing prep buffs and
  should not auto-teach every clue before the player chooses topics.
- Add a focused regression covering the improved Ives flow and the three advice
  rewards if existing dialogue tests do not already pin that surface.

## Acceptance

1. `npm run validate -- tide_mill` reports 0 errors / 0 warnings.
2. A player can gather all three Ives advice topics with less repeated back
   friction than the seed-89 route, while each topic remains a deliberate choice.
3. `npm run health` passes, then re-run `npm run blind --quest=tide_mill` with a
   new seed and use its exit interview as the next lever.

## Deferred Levers

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
