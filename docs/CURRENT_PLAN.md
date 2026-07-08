# Current Plan

This is the AFK loop's token-small handoff document. It is OVERWRITTEN each
ultraplan with the synthesis plus the one chosen next move; a fresh
implementation subagent reads ONLY this doc and the files it names. Keep it
current, terse, dated, and under ~60 lines — completed work belongs in git
history and `docs/DECISION_LOG.md`, not here.

## Cycle: 2026-07-08 - Tide-Mill head-race tool friction

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

The new common lever is race/tool ordering friction: several runs followed the
board to the head-race before access to the billhook, then treated the required
tool-shed detour as backtracking or checklist mismatch. Related reports say the
route remains too prescribed and replay desire is 0/20.

## Chosen Move

Make the first head-race visit feel like intentional reconnaissance instead of
a failed checklist step.

- Target file first: `content/rpg/quests/tide_mill.yaml`.
- Consider a no-item `clear`/`work` interaction, tighter Head-Race room prose, or
  a local journal beat that points back to the shed for the billhook after the
  player investigates the choke.
- Preserve the less-checklist board: do not reintroduce exact billhook/crow-bar
  mapping into `read_millboard`.
- Do not add score for reconnaissance; it should be clarity/state texture, not
  another required point.
- Do not remove the 5-point board read, no-board 50/55 branch, clean 55/55
  branch, seeded checks, or flood-hatch gamble.
- Update focused regressions so a pre-billhook race visit/attempt is legal,
  compact-safe, and sends the player toward the shed without a gotcha.
- Keep `max_score`, win-only capstone, and existing takings branch unchanged.

## Acceptance

1. `npm run validate -- tide_mill` reports 0 errors / 0 warnings.
2. Focused tests prove the head-race pre-tool beat is legal/clear, does not
   change score, and the normal 55/55 and no-board 50/55 rescues still work.
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
- Dialogue follow-up action ids (`ask_race_to_pawl` etc.) still cause QA agents
  to try stale root ids after one answer; fix after content-local race friction.
