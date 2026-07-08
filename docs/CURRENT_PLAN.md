# Current Plan

This is the AFK loop's token-small handoff document. It is OVERWRITTEN each
ultraplan with the synthesis plus the one chosen next move; a fresh
implementation subagent reads ONLY this doc and the files it names. Keep it
current, terse, dated, and under ~60 lines — completed work belongs in git
history and `docs/DECISION_LOG.md`, not here.

## Cycle: 2026-07-08 - Tide-Mill compact ending payoff

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
surfaces is now closed by concise board and yard prose plus regressions. Blind
seed 183 reached `ending_saved` at 55/55 with clarity 5/5 and enjoyment 4/5.
Its remaining content-local finding is that compact ending text truncates
mid-word, making the final payoff less satisfying in compact mode.

## Chosen Move

Compress the clean rescue ending variants so the final payoff survives compact
mode without truncating mid-word.

- Target file first: `content/rpg/quests/tide_mill.yaml`.
- Prefer concise prose edits and pinned compact regressions over engine or
  compact-width changes.
- Preserve the ending distinctions: clean 55/55 rescue, no-board rescue,
  returned-takings rescue, kept-takings rescue, thief, and deaths.
- Keep the win-only +20 capstone on entering the staith; do not add sea-gate
  score feedback unless that lever repeats across samples and is handled without
  breaking the capstone.
- Add compact ending regressions that drive real routes to the relevant endings
  and assert compact ending text stays under the compact limit without `(+N
  chars)` truncation.
- Keep `max_score`, win-only capstone, and existing takings branch unchanged.

## Acceptance

1. `npm run validate -- tide_mill` reports 0 errors / 0 warnings.
2. Focused tests prove compact ending payloads preserve the final payoff without
   truncation and keep the distinct ending branches intact.
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
- Sea-gate feedback: seed 179 flagged no immediate score on the winch as S1, but
  the capstone must still pay only on the win; handle through prose/journal if
  this repeats across samples.
- Coin-bag branch still feels vestigial to some 55/55 players; address after the
  compact warning friction is closed or measured across a wider sample.
- Collect a wider blind sample when the harness is stable; count only verifier
  reports that actually started and played `tide_mill`.
