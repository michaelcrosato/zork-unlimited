# Current Plan

This is the AFK loop's token-small handoff document. It is OVERWRITTEN each
ultraplan with the synthesis plus the one chosen next move; a fresh
implementation subagent reads ONLY this doc and the files it names. Keep it
current, terse, dated, and under ~60 lines — completed work belongs in git
history and `docs/DECISION_LOG.md`, not here.

## Cycle: 2026-07-08 - Tide-Mill Diegetic Prep Feedback

## Synthesis

The benchmark slice is `world_quest_id=tide_mill`, anchored to
`new_york_city__waterfront`. It has the contained mill DAG, seeded combat,
prep-backed seeded skill checks, telegraphed death forks, win-only +20 capstone,
and late takings branch. The clean rescue remains the only 55/55 route.

Recent closed loops: compact board/yard/ending truncation, flood-hatch stale
death action, prepared-combat fairness, no-board scoring tone, Ives dialogue IDs,
late coin-bag texture, and board fault-order wording. The millboard now says the
wheel runs when the choked race is clear and the brake-pawl free, without exact
billhook/crow-bar mapping or race-first imperative phrasing.

The latest 20-run Codex blind batch, seeds 241-260, all exited 0 and completed
the clean rescue at 55/55. Clarity was 20x5/5, enjoyment 20x4/5, and
`would_replay` was 20x false. The board-order complaint did not recur.

The common S1 is now broader game feel: many reports say the board plus Ives
make the route checklist-like. Smaller repeats point at the same surface:
item/dialogue journals expose explicit `+attack` / `+defense` / stat-reward
language, the gaff-pole journal names the tool-shed saboteur before the player
meets that threat, and Ives advice can feel like optimal-route transcription.

## Chosen Move

Retune prep feedback to be diegetic and less checklist/game-stat flavored while
preserving the same mechanics and score structure.

- Target `content/rpg/quests/tide_mill.yaml` first: gaff-pole, oilskin, Ives
  advice journals, and any visible stat-reward prose touched by those beats.
- Keep the actual rewards, seeded combat math, topic ids, board score, no-board
  branch, and 55/55 clean route unchanged.
- Remove explicit `(+2 attack)`, `(+2 defense)`, `(+3 craft)`, `(+2 might)`, and
  similar game-stat labels from player-facing journal/prose where a tight
  fiction line can carry the same information.
- Do not hide fair warnings: gaff/oilskin must still read as useful protection,
  Ives must still make prepared combat a rational choice, and unprepared combat
  must remain knowingly risky.
- Avoid revealing "tool-shed saboteur" from the gaff-pole pickup before the yard
  establishes the knife-man.
- Update focused regressions to prove rewards still apply, clue sufficiency
  remains, and the gamey stat labels / premature saboteur reveal stay out.

## Acceptance

1. `npm run validate -- tide_mill` reports 0 errors / 0 warnings.
2. Focused tests prove prep rewards and dialogue flow still work while banning
   explicit stat-label prose in the touched surfaces.
3. `npm run health` passes.
4. Run blind after the fix. Target a 20-seed Codex sample when runner capacity
   permits; at minimum one schema-valid `tide_mill` report must land before
   commit.

## Deferred Levers

- Head-Race action label: seeds 247/251/260 still found `use_choked_sluice`
  vague before the billhook, though the nudge is now useful and nonblocking.
- Saboteur continuity: several reports saw combat say he falls while later prose
  says he was driven off.
- Coin-bag branch: several reports still read it as bait or moral decoy because
  the urgent full-score rescue can ignore it.
- Flood-hatch temptation: repeatedly fair but obvious, and still visible as a
  warned danger action.
- Replay remains low; after checklist/game-stat texture, prefer a deeper
  optional branch over further signpost polish.
