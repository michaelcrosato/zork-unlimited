# Current Plan

This is the AFK loop's token-small handoff document. It is OVERWRITTEN each
ultraplan with the synthesis plus the one chosen next move; a fresh
implementation subagent reads ONLY this doc and the files it names. Keep it
current, terse, dated, and under ~60 lines — completed work belongs in git
history and `docs/DECISION_LOG.md`, not here.

## Cycle: 2026-07-08 - Fresh-Game Starting-Area Baseline

## Synthesis

The benchmark quest remains `world_quest_id=tide_mill`, anchored to
`new_york_city__waterfront`. It now has the contained mill DAG, seeded combat,
prep-backed seeded skill checks, telegraphed death forks, win-only +20 capstone,
late takings branch, and Head-Race action-id stability. The clean rescue remains
the only 55/55 route.

Latest closed loop: post-billhook Head-Race repair keeps the explicit
`use_billhook_on_choked_sluice` / `cut choked head-race with billhook` affordance
and restores `use_choked_sluice` / `clear choked head-race` as a legal held-tool
alias. Seeds 321-340 all scored 55/55, clarity 20x5/5, enjoyment 20x4/5, replay
20x false, and the old-id rejection did not recur.

Direction pivot from the operator: keep the benchmark quest, but judge future
work against the best starting-area/open-world experience from a fresh New York
start, not only targeted quest runs. Use large blind samples (25 fresh-game
agents when capacity permits), accumulate feedback over time, keep the most
recent 100 usable entries available, and categorize older repeated traits. This
is allowed scaffolding only when it directly improves the starting slice and the
benchmark quest funnel; do not start a second quest or reopen retired formats.

Current repeated Tide-Mill signals to carry forward: saboteur combat is too
attack-loop/simple and has fallen-vs-driven-off continuity noise; coin-bag is
visible but underdeveloped; solved Head-Race ids can still read stale in compact
refs; Ives/board route can feel checklist-like; replay remains low despite
perfect clarity.

## Chosen Move

Establish the fresh-game starting-area baseline before changing content again.

- Inspect the RPG overworld start, New York notice-board wiring, and existing
  blind report format.
- Add or reuse a lightweight feedback ledger for the new direction: latest 100
  raw/parsed findings stay easy to scan; older repeats collapse into categories.
- Run a fresh-game blind sample with varied seeds using `npm run blind
  --seed=<n>` (no `--quest`) and aggregate common issues before choosing the next
  content lever.
- Keep `tide_mill` as the benchmark quest/funnel anchor; any scaffolding must
  directly support fresh-start feedback or its route into the quest.

## Acceptance

1. The next loop records the fresh-game feedback storage shape and keeps it
   token-small enough for repeated use.
2. A 25-run fresh-game blind batch lands when capacity permits; if capacity is
   lower, record the shortfall and continue the batch next cycle.
3. `npm run health` passes.
4. Commit only after green health and at least one schema-valid fresh-game blind
   report; prefer committing the full 25-run aggregate if it completes cleanly.

## Deferred Levers

- Preserve Tide-Mill alias stability; do not break `use_choked_sluice` or
  `use_billhook_on_choked_sluice`.
- Candidate content levers after the fresh-game baseline: tactical saboteur
  branch, coin-bag consequence branch, compact stale-ref cleanup, or a better
  starting-area funnel into the waterfront notice board.
- Do not start a second quest, add unanchored systems, or touch CYOA/parser.
