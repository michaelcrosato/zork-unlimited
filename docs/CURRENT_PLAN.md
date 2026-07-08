# Current Plan

This is the AFK loop's token-small handoff document. It is OVERWRITTEN each
ultraplan with the synthesis plus the one chosen next move; a fresh
implementation subagent reads ONLY this doc and the files it names. Keep it
current, terse, dated, and under ~60 lines — completed work belongs in git
history and `docs/DECISION_LOG.md`, not here.

## Cycle: 2026-07-08 - Tide-Mill meaningful temptation branches

## Synthesis

The benchmark slice is `world_quest_id=tide_mill`, anchored to
`new_york_city__waterfront` in the New York overworld. It has the contained mill
DAG, seeded combat, prep-backed seeded skill checks, telegraphed death forks, a
win-only +20 capstone, and a late optional takings fork after `gate_up`: pocket,
return, keep-through-rescue, or steal the coin-bag. The clean rescue remains the
only 55/55 route.

Prepared combat is now fairer without defanging the yard. The saboteur has 8 HP
instead of 12 HP; `tests/regression/tide_mill_prepared_combat_fairness.test.ts`
pins that a player with Ives's warning, the gaff-pole, and oilskin survives
worst combat rolls with meaningful HP loss, while barehanded yard combat still
dies under the same hostile roll regime. Accepted blind seed 169 reached clean
`ending_saved` at 55/55 with clarity 5/5 and enjoyment 4/5.

Seed 169's strongest finding is now branch value, not readability or combat:
the flood-hatch remains a legal warned death/trap option even after the correct
sluice repair, and the coin-bag detour is visible but feels vestigial because
the perfect route ignores it. That keeps enjoyment at 4/5 and `would_replay`
false despite full clarity.

## Chosen Move

Turn one of the current temptations, preferably the Head-Race flood-hatch, from
an obvious punished choice into a tighter informed gamble or reactive branch.

- Target file first: `content/rpg/quests/tide_mill.yaml`.
- Preserve telegraphing: no gotcha death, no hidden required failure.
- The bad crow-bar choice can stay dangerous, but after the sluice is correctly
  cleared it should either disappear, clearly become obsolete, or pay off in a
  different deterministic branch instead of sitting as a stale trap.
- Prefer content state/prose/action gating before engine changes.
- Add a focused regression for the chosen branch so compact actions and endings
  do not drift.
- Keep `max_score`, win-only capstone, and existing takings branch unchanged.

## Acceptance

1. `npm run validate -- tide_mill` reports 0 errors / 0 warnings.
2. Focused tests prove the flood-hatch or equivalent temptation is no longer a
   stale late trap while the intended danger remains telegraphed.
3. `npm run health` passes.
4. Run blind after the fix. Target a 20-seed Codex sample when runner capacity
   permits, parallel or sequential, and aggregate common issues; at minimum one
   schema-valid report must actually play `tide_mill` before commit.

## Deferred Levers

- Dialogue mode visibility: seed 167 tried `read_millboard` during Ives dialogue
  because compact observation still looked like the normal room; consider a
  modal compact affordance or clearer dialogue-context text.
- Compact truncation is recurring. Fix through shorter load-bearing prose and
  pinned compact observations, not by widening compact mode blindly.
- Add richer saboteur combat texture beyond repeated attack once fairness is
  calibrated.
- Collect a wider blind sample when the harness is stable; count only verifier
  reports that actually started and played `tide_mill`.
