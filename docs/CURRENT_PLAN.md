# Current Plan

This is the AFK loop's token-small handoff document. It is OVERWRITTEN each
ultraplan with the synthesis plus the one chosen next move; a fresh
implementation subagent reads ONLY this doc and the files it names. Keep it
current, terse, dated, and under ~60 lines — completed work belongs in git
history and `docs/DECISION_LOG.md`, not here.

## Cycle: 2026-07-08 - Tide-Mill board obligation clarity

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
surfaces is now closed by concise board and yard prose plus regressions. Ives
root dialogue IDs are readable (`ask_race`, `ask_pawl`, `ask_yard`).

Seed 191 found the millboard too prescriptive: it handed over exact billhook and
crow-bar mapping and made the route feel checklist-driven. That is now closed:
the board keeps the operational order and critical warnings, while tool
specificity lives in Ives, the tool shed, and object descriptions. Wheel-Room
winch text now says "wind the sea-gate open" instead of "drop the held water."

Seed 193 reached `ending_saved` at 50/55 with clarity 5/5 and enjoyment 4/5
after asking Ives, skipping the millboard, and following the rescue cleanly.
The new common-risk pattern is not "board too helpful" but "board score/moral
weight is under-signposted beside the urgent Ives/tool path." It also reported
compact final score text truncation even though vitals preserved `50/55`.

## Chosen Move

Make the millboard's scored importance feel intentional without restoring the
old checklist.

- Target file first: `content/rpg/quests/tide_mill.yaml`.
- Consider first-room affordance, Ives root wording, and/or no-board ending tone
  before changing score math. The player should understand the board is the
  miller's formal night order, not optional scenery.
- Preserve the less-checklist board: do not reintroduce exact billhook/crow-bar
  mapping into `read_millboard`.
- Do not remove the 5-point scored board read, the no-board 50/55 branch, or the
  clean 55/55 branch.
- If touching ending text, keep compact payloads under limit and check the
  reported final score truncation.
- Update focused regressions for board affordance/no-board tone and compact fit.
- Keep `max_score`, win-only capstone, and existing takings branch unchanged.

## Acceptance

1. `npm run validate -- tide_mill` reports 0 errors / 0 warnings.
2. Focused tests prove the board is better signposted without becoming a
   solution checklist, and no-board rescue still lands at 50/55 without feeling
   like a hidden gotcha.
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
- Coin-bag branch still feels vestigial to some 55/55 players; address after the
  millboard discovery tension is closed or measured across a wider sample.
- Collect a wider blind sample when the harness is stable; count only verifier
  reports that actually started and played `tide_mill`.
