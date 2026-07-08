# Current Plan

This is the AFK loop's token-small handoff document. It is OVERWRITTEN each
ultraplan with the synthesis plus the one chosen next move; a fresh
implementation subagent reads ONLY this doc and the files it names. Keep it
current, terse, dated, and under ~60 lines — completed work belongs in git
history and `docs/DECISION_LOG.md`, not here.

## Cycle: 2026-07-08 — Tide-Mill replay pressure

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
opening-orientation finding is closed and pinned by
`tests/regression/tide_mill_mill_house_compact_orientation.test.ts`. The seed-127
second-fault narration finding is closed and pinned by
`tests/regression/tide_mill_second_fault_narration.test.ts`. The Codex blind-runner
override is also repaired in `blind-tester/run.sh`: it now injects the AdventureForge
MCP server and the required deferred-MCP feature flag for Codex. Seed 143 reached
`ending_saved` at 55/55 with clarity 5/5 and enjoyment 4/5, no bugs, and one design
critique: the optimal route is so heavily signposted that replay desire is low.

## Chosen Move

Open one deeper replay branch inside Tide-Mill without reducing first-run clarity.

- Target file: `content/rpg/quests/tide_mill.yaml`.
- Prefer a real ethical/mechanical fork around the counting-nook takings, because
  the route already foregrounds the coin-bag and the full-score ending rewards
  leaving it.
- The branch must be an informed gamble with telegraphed consequence, not a hidden
  punishment: taking, returning, or leaving the money should affect score/ending
  texture while preserving the rescue route when fair.
- Keep Ives and the board useful, but do not add more direct instructions to the
  already-clean optimal path.
- Add regression coverage for the new branch and run a broader blind sample if the
  branch changes route comprehension; target 20 Codex blind seeds when practical,
  at minimum one schema-valid blind gate before commit.

## Acceptance

1. `npm run validate -- tide_mill` reports 0 errors / 0 warnings.
2. The new branch has distinct, deterministic score/ending consequences and does
   not steal the win-only capstone from the clean rescue route.
3. `npm run health` passes, then re-run `npm run blind --quest=tide_mill` with a
   new seed and use its exit interview as the next lever.

## Deferred Levers

- The seed-143 "optimal route heavily signposted" critique is the active lever;
  do not respond by making clues vaguer. Add consequence/replay depth instead.
- The seed-113 coin-bag uncertainty is already covered by `ending_thief`; only
  revisit if the active takings branch proves too large for one clean cycle.
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
