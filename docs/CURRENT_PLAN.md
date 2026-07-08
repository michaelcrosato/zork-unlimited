# Current Plan

This is the AFK loop's token-small handoff document. It is OVERWRITTEN each
ultraplan with the synthesis plus the one chosen next move; a fresh
implementation subagent reads ONLY this doc and the files it names. Keep it
current, terse, dated, and under ~60 lines — completed work belongs in git
history and `docs/DECISION_LOG.md`, not here.

## Cycle: 2026-07-08 - Tide-Mill millboard fault-order wording

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
The board obligation pass named the opening board as Ives's written night-order,
had Ives distinguish the written order from his live tricks, and softened the
no-board rescue ending away from "less clean." A 20-run Codex batch, seeds
195-214, all reached `ending_saved` at 55/55; clarity was 19x5/5 and 1x4/5,
enjoyment was 20x4/5, and no run got stuck. The hidden-board complaint did not
recur.

The head-race pass added a state-neutral pre-billhook `clear choked head-race`
beat, then converted the billhook repair to the same stable `use_choked_sluice`
action id. The first 20-run batch for seeds 215-234 exposed the initial id swap;
after the stable-id fix, seed 235 reached `ending_saved` at 55/55 with clarity
5/5 and enjoyment 4/5. Race/billhook friction did not recur in that final run.

The dialogue pass renamed Ives follow-up topic ids to stable
`race`/`pawl`/`yard`/`leave` ids across all advice nodes. Seed 237 reached
`ending_saved` at 55/55 with clarity 5/5 and enjoyment 4/5, no rejected
actions, and no dialogue-id complaint.

The coin-bag texture pass removed meta "detour/tempts/choice" labels from
post-gate prose while keeping the counting-desk fork visible. Seed 239 reached
`ending_saved` at 55/55 with clarity 5/5 and enjoyment 4/5; no coin-bag meta
complaint recurred.

The next S1 is the board's fault-order wording. "Clear choked race; free
brake-pawl" reads like the first repair should happen before getting tools,
while the real path must reach the shed/billhook first. The current recovery
feedback is good, but the board can avoid implying a false traversal order.

## Chosen Move

Retune the millboard so it names the two faults without implying race-first
traversal.

- Target file first: `content/rpg/quests/tide_mill.yaml`.
- Preserve the less-checklist board: do not reintroduce exact billhook/crow-bar
  mapping, and do not restore a full optimal checklist.
- Prefer wording like "wheel runs when race is clear and brake-pawl free; tools
  are in the shed..." so players infer tools before repairs.
- Keep the shed/knife-man, gaff/oilskin, sea-gate, flood-hatch, and takings
  warnings compact-safe.
- Do not remove the 5-point board read, no-board 50/55 branch, clean 55/55
  branch, seeded checks, or flood-hatch gamble.
- Update compact board and head-race reconnaissance regressions so the board no
  longer implies race-first traversal and still fits compact events.
- Keep `max_score`, win-only capstone, and existing takings branch unchanged.

## Acceptance

1. `npm run validate -- tide_mill` reports 0 errors / 0 warnings.
2. Focused tests prove the board still names both faults and tool access, avoids
   exact tool mapping, and no longer phrases the race as a first step.
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
- Overall route still reads highly guided and replay desire remains low; after
  board order wording, consider one deeper optional branch rather than more
  signpost polish.
