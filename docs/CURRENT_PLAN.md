# Current Plan

This is the AFK loop's token-small handoff document. It is OVERWRITTEN each
ultraplan with the synthesis plus the one chosen next move; a fresh
implementation subagent reads ONLY this doc and the files it names. Keep it
current, terse, dated, and under ~60 lines — completed work belongs in git
history and `docs/DECISION_LOG.md`, not here.

## Cycle: 2026-07-08 - Tide-Mill millboard discovery tension

## Synthesis

The benchmark slice is `world_quest_id=tide_mill`, anchored to
`new_york_city__waterfront` in the New York overworld. It has the contained mill
DAG, seeded combat, prep-backed seeded skill checks, telegraphed death forks, a
win-only +20 capstone, and a late optional takings fork after `gate_up`: pocket,
return, keep-through-rescue, or steal the coin-bag. The clean rescue remains the
only 55/55 route.

The flood-hatch no longer sits as a stale late death action. It is now a hard
seeded might gamble before `sluice_clear`, with failure ending at
`ending_drowned`; on a strong roll it answers the race fault and then collapses
onto the normal `sluice_clear` state so the exhaustive proof graph stays under
cap. Once the safe sluice repair is done, the hatch is described as obsolete and
has no lever action.

Final-content blind seed 179 reached `ending_saved` at 55/55 with clarity 5/5
and enjoyment 4/5. Seed 173, run before the final hatch wording tweak, skipped
`read_millboard` and felt dinged at 50/55; seed 179 read the board and praised
the clue chain, so treat that as a sample signal rather than a confirmed common
defect. The repeated compact truncation around the millboard/yard warning
surfaces is now closed by concise board and yard prose plus regressions. The
clean and returned-takings ending texts are also compact-safe. Blind seed 187
reached `ending_saved` at 55/55 with clarity 5/5 and enjoyment 4/5, no bugs,
and no ending truncation complaint. Ives root dialogue IDs are now readable
(`ask_race`, `ask_pawl`, `ask_yard`), and blind seed 191 did not repeat that
friction.

Seed 191's strongest new finding is design, not mechanics: the millboard gives
nearly the whole optimal route immediately. It is fair onboarding, but it makes
the run feel checklist-driven and lowers replay desire. Secondary S0: "drop the
held water" in winch text is muddy beside "raise/open the sea-gate."

## Chosen Move

Retune the millboard so it remains the fastest operational order but no longer
spells out the whole optimal route as a checklist.

- Target file first: `content/rpg/quests/tide_mill.yaml`.
- Preserve first-run clarity: the board should still point to two faults,
  saboteur/tools, sea-gate, flood-hatch danger, and takings morality.
- Move one piece of solution specificity into Ives, object descriptions, or
  local room feedback so the player gets a deduction beat without obscure
  gating.
- Do not remove the 5-point scored board read or the no-board 50/55 branch.
- Add/update compact and route regressions to prove the board remains readable,
  does not truncate, and no-board rescue still works.
- Keep `max_score`, win-only capstone, and existing takings branch unchanged.

## Acceptance

1. `npm run validate -- tide_mill` reports 0 errors / 0 warnings.
2. Focused tests prove the millboard is less checklist-like while preserving
   clue sufficiency, compact fit, and the 50/55 no-board branch.
3. `npm run health` passes.
4. Run blind after the fix. Target a 20-seed Codex sample when runner capacity
   permits, parallel or sequential, and aggregate common issues; at minimum one
   schema-valid report must actually play `tide_mill` before commit.

## Deferred Levers

- Dialogue mode visibility: seed 167 tried `read_millboard` during Ives dialogue
  because compact observation still looked like the normal room; consider a
  modal compact affordance or clearer dialogue-context text.
- Head-Race compact refs: seed 183 noted `choked_sluice` remains visible by id
  after repair even though the variant name is "head-race"; content-only fixes
  are limited because compact object refs expose ids, not variant display names.
- Add richer saboteur combat texture beyond repeated attack once fairness is
  calibrated.
- Sea-gate wording: seed 191 flagged "drop the held water" as muddy beside
  raise/open gate language; fix with prose when touching Wheel-Room/winch.
- Coin-bag branch still feels vestigial to some 55/55 players; address after the
  millboard discovery tension is closed or measured across a wider sample.
- Collect a wider blind sample when the harness is stable; count only verifier
  reports that actually started and played `tide_mill`.
