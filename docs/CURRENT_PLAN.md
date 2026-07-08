# Current Plan

This is the AFK loop's token-small handoff document. It is OVERWRITTEN each
ultraplan with the synthesis plus the one chosen next move; a fresh
implementation subagent reads ONLY this doc and the files it names. Keep it
current, terse, dated, and under ~60 lines — completed work belongs in git
history and `docs/DECISION_LOG.md`, not here.

## Cycle: 2026-07-08 - Tide-Mill Head-Race Inspection Affordance

## Synthesis

The benchmark slice is `world_quest_id=tide_mill`, anchored to
`new_york_city__waterfront`. It has the contained mill DAG, seeded combat,
prep-backed seeded skill checks, telegraphed death forks, win-only +20 capstone,
and late takings branch. The clean rescue remains the only 55/55 route.

Recent closed loops: compact board/yard/ending truncation, flood-hatch stale
death action, prepared-combat fairness, no-board scoring tone, Ives dialogue IDs,
late coin-bag texture, and board fault-order wording. The millboard now says the
wheel runs when the choked race is clear and the brake-pawl free, without exact
billhook/crow-bar mapping or race-first imperative phrasing. Prep journal text
is now diegetic: gaff/oilskin/Ives advice still grant the same variables, but
the text no longer prints explicit attack/defense/craft/might bonus labels.

The latest 20-run Codex blind batch, seeds 261-280, all exited 0 and scored
55/55. Clarity was 20x5/5, enjoyment 20x4/5, and `would_replay` was 20x false.
The explicit stat-label complaint mostly disappeared, though a couple reports
still dislike the existence of large advice boosts.

The common S1 is now Head-Race affordance. The pre-billhook
`use_choked_sluice` / `clear choked head-race` action is useful as a state-neutral
reconnaissance beat, but many reports read it as a viable repair command before
the needed billhook. Several specifically ask for the first beat to feel like
inspection/reminder instead of a dead no-progress turn.

## Chosen Move

Retune the pre-billhook Head-Race interaction so it reads as inspection/tool
diagnosis, not a failed clear attempt, while preserving the post-billhook repair
route and stable action handling.

- Target `content/rpg/quests/tide_mill.yaml` around `choked_sluice`.
- Keep the post-billhook seeded craft checks, score award, state flags, and
  repair narrations unchanged unless a tiny wording adjustment is required.
- Prefer making the no-billhook command read like `inspect choked head-race` or
  equivalent, with narration/journal that says the bough needs the billhook from
  the shed past the knife-man.
- Preserve the stable action id if the engine's action-id derivation allows it;
  otherwise update regressions honestly and avoid the previous ID-swap failure.
- Keep the no-score reconnaissance beat, but give it a persistent reminder so
  players do not have to remember the one-off nudge after leaving for the shed.
- Do not weaken the telegraphing around the flood-hatch or the tool-shed fight.

## Acceptance

1. `npm run validate -- tide_mill` reports 0 errors / 0 warnings.
2. Focused tests prove the pre-billhook command reads as inspection, creates no
   score/progress, leaves a billhook reminder, and the post-billhook repair
   command remains legal and score-bearing.
3. `npm run health` passes.
4. Run blind after the fix. Target a 20-seed Codex sample when runner capacity
   permits; at minimum one schema-valid `tide_mill` report must land before
   commit.

## Deferred Levers

- Saboteur continuity: several reports saw combat say he falls while later prose
  says he was driven off.
- Ives advice boosts: explicit stat labels are gone, but a few reports still
  find the large hidden craft/might jumps artificial and checklist-like.
- Coin-bag branch: several reports still read it as bait or moral decoy because
  the urgent full-score rescue can ignore it.
- Flood-hatch temptation: repeatedly fair but obvious, and still visible as a
  warned danger action.
- Dialogue compactness: a few reports dislike `ask_back` / `ask_leave` labels or
  trying room actions while still in dialogue.
- Replay remains low; after checklist/game-stat texture, prefer a deeper
  optional branch over further signpost polish.
