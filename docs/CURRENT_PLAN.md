# Current Plan

This is the AFK loop's token-small handoff document. It is OVERWRITTEN each
ultraplan with the synthesis plus the one chosen next move; a fresh
implementation subagent reads ONLY this doc and the files it names. Keep it
current, terse, dated, and under ~60 lines — completed work belongs in git
history and `docs/DECISION_LOG.md`, not here.

## Cycle: 2026-07-08 — Tide-Mill prepared-combat fairness

## Synthesis

The benchmark slice is `world_quest_id=tide_mill`, anchored to
`new_york_city__waterfront` in the New York overworld. It has the contained mill
DAG, seeded combat, prep-backed seeded skill checks, telegraphed death forks, a
win-only +20 capstone, and a late optional takings fork after `gate_up`: pocket,
return, keep-through-rescue, or steal the coin-bag. The clean rescue remains the
only 55/55 route.

The late fork is now visible but not duty-coded. `tests/regression/tide_mill_late_takings_visibility.test.ts`
pins the compact post-gate view: `down` saves the boat now, `south` is a detour
if Ives's coin-bag tempts the player, and the `pocket coin-bag` action remains
reachable. Accepted blind seed 167 reached clean `ending_saved` at 55/55 with
clarity 5/5 and enjoyment 4/5; the previous "last account" required-business
complaint did not recur.

The seed-167 exit interview's strongest new content finding is combat
swinginess: even correctly prepared with gaff-pole, oilskin, and Ives's advice,
the mandatory saboteur fight dropped the player from 20 HP to 8 HP in three
rounds. That was readable and not blocking, but it risks making correct play
feel punished on unlucky seeds. Secondary finding: compact dialogue mode still
looks like a normal room while non-dialogue actions are rejected.

## Chosen Move

Harden the prepared saboteur fight so correct prep stays tense but no longer
feels punitive or overly swingy.

- Target file first: `content/rpg/quests/tide_mill.yaml`.
- Preserve the death fork for underprepared/barehanded fighting; do not make
  combat toothless or remove seeded variance.
- Prefer a content-side mitigation tied to existing prep/advice (gaff-pole,
  oilskin, Ives's yard warning) over a broad engine change.
- Add a focused regression that brackets prepared combat across deterministic
  seeds/roll regimes and proves the prepared route survives with reasonable HP
  while underprepared combat can still reach `ending_cut_down`.
- Keep `max_score`, win-only capstone, and existing takings branch unchanged.

## Acceptance

1. `npm run validate -- tide_mill` reports 0 errors / 0 warnings.
2. Focused tests prove prepared combat is survivable and still meaningfully
   costs HP, while underprepared combat remains a telegraphed death risk.
3. `npm run health` passes.
4. Run blind after the fix. Target broader Codex samples when practical; at
   minimum one schema-valid report must actually play the quest before commit.

## Deferred Levers

- Dialogue mode visibility: seed 167 tried `read_millboard` during Ives dialogue
  because compact observation still looked like the normal room; consider a
  modal compact affordance or clearer dialogue-context text.
- Compact truncation is recurring. Fix through shorter load-bearing prose and
  pinned compact observations, not by widening compact mode blindly.
- Add richer saboteur combat texture beyond repeated attack once fairness is
  calibrated.
- Review flood-hatch temptation wording: the bad crow-bar choice is intentional
  and strongly warned, but completionist players may still read it as required.
- Collect a wider blind sample when the harness is stable; count only verifier
  reports that actually started and played `tide_mill`.
