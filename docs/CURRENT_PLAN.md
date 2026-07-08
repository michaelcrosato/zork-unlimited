# Current Plan

This is the AFK loop's token-small handoff document. It is OVERWRITTEN each
ultraplan with the synthesis plus the one chosen next move; a fresh
implementation subagent reads ONLY this doc and the files it names. Keep it
current, terse, dated, and under ~60 lines — completed work belongs in git
history and `docs/DECISION_LOG.md`, not here.

## Cycle: 2026-07-08 - Tide-Mill Billhook-Specific Race Action

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

The pre-billhook Head-Race affordance now says `check choked head-race` instead
of `clear choked head-race`, keeps the same stable `use_choked_sluice` id, and
does not alter score or repair state. An attempted journal/flag reminder was
rejected during implementation because it pushed multiple exhaustive graph
proofs over the 200k cap; the shipped fix stays state-neutral.

The latest 20-run Codex blind batch, seeds 281-300, all exited 0 and scored
55/55. Clarity was 20x5/5, enjoyment 20x4/5, and `would_replay` was 20x false.
The "clear before billhook" complaint softened, but compact reports still call
`use_choked_sluice` vague, especially after the billhook is already held. The
next step should make the decisive repair action name the billhook.

## Chosen Move

Make the post-billhook race repair interaction item-specific so compact action
ids and commands show the billhook doing the decisive work.

- Target `content/rpg/quests/tide_mill.yaml` around `choked_sluice`.
- Keep the post-billhook seeded craft checks, score award, state flags, and
  repair narrations unchanged unless a tiny wording adjustment is required.
- Preserve the pre-billhook `check choked head-race` no-progress beat and its
  `use_choked_sluice` id.
- Convert only the held-billhook repair interactions to `item: billhook` +
  `target: choked_sluice`, with a natural command like `cut choked head-race
  with billhook`.
- Accept and update the post-billhook action id honestly if it becomes
  `use_billhook_on_choked_sluice`; avoid broad object-id renames in this cycle.
- Update all focused route tests that step the race repair after obtaining the
  billhook.
- Do not weaken the telegraphing around the flood-hatch or the tool-shed fight.

## Acceptance

1. `npm run validate -- tide_mill` reports 0 errors / 0 warnings.
2. Focused tests prove pre-billhook remains `check`/no-progress, post-billhook
   legal actions include a billhook-specific repair id/command, and the old
   generic repair id is not offered once the billhook is held.
3. `npm run health` passes.
4. Run blind after the fix. Target a 20-seed Codex sample when runner capacity
   permits; at minimum one schema-valid `tide_mill` report must land before
   commit.

## Deferred Levers

- Saboteur continuity: several reports saw combat say he falls while later prose
  says he was driven off.
- Ives advice boosts: explicit stat labels are gone, but a few reports still
  find the large hidden craft/might jumps artificial and checklist-like.
- Solved Head-Race refs: compact reports still see `choked_sluice` after repair
  because compact refs expose ids, not variant display names.
- Coin-bag branch: several reports still read it as bait or moral decoy because
  the urgent full-score rescue can ignore it.
- Flood-hatch temptation: repeatedly fair but obvious, and still visible as a
  warned danger action.
- Dialogue compactness: a few reports dislike `ask_back` / `ask_leave` labels or
  trying room actions while still in dialogue.
- Replay remains low; after checklist/game-stat texture, prefer a deeper
  optional branch over further signpost polish.
