# Current Plan

This is the AFK loop's token-small handoff document. It is OVERWRITTEN each
ultraplan with the synthesis plus the one chosen next move; a fresh
implementation subagent reads ONLY this doc and the files it names. Keep it
current, terse, dated, and under ~60 lines — completed work belongs in git
history and `docs/DECISION_LOG.md`, not here.

## Cycle: 2026-07-08 — Tide-Mill optional-fork wording

## Synthesis

The benchmark slice is `world_quest_id=tide_mill`, anchored to
`new_york_city__waterfront` in the New York overworld. It has the contained mill
DAG, seeded combat, prep-backed seeded skill checks, telegraphed death forks, a
win-only +20 capstone, and a late takings fork after `gate_up`: pocket, return,
keep-through-rescue, or steal the coin-bag. The clean rescue remains the only
55/55 route.

The branch is now visible in the post-`gate_up` compact path:
`tests/regression/tide_mill_late_takings_visibility.test.ts` drives a compact Tool
API route through real seeded combat and proves the Wheel-Room text names the
coin-bag route and that `pocket coin-bag` is reachable from there. The blind
harness also now allows one broad Codex ToolSearch fallback after a zero-result
exact selector, and the verifier rejects no-tool reports that previously slipped
through.

Accepted blind seed 163 reached clean `ending_saved` at 55/55 with clarity 5/5
and enjoyment 4/5. It noticed the late coin-bag line, but reported one S1:
"south leaves one last account with Ives's coin-bag" briefly sounded like
unfinished required business even though going down immediately is the full-score
rescue. Seed 161 was a harness no-tools failure and is not a content playtest.

## Chosen Move

Tune the post-`gate_up` wording so the coin-bag fork reads as optional temptation,
not a required account, while preserving compact discoverability.

- Target file: `content/rpg/quests/tide_mill.yaml`.
- Update the `gate_up` Wheel-Room line first; it is the final clean-route view
  every player sees before `go_down`.
- Keep the affordance short and early enough to survive compact observation.
- Preserve the clean-route urgency: `down` should still read as the obvious full
  rescue; `south` should read as a deliberate aside for players who care about
  Ives's takings.
- Update the compact visibility regression to pin the new optional wording.

## Acceptance

1. `npm run validate -- tide_mill` reports 0 errors / 0 warnings.
2. Focused tests prove the clean route still wins at 55/55 and the takings branch
   remains reachable and lower-scored.
3. `npm run health` passes.
4. Run blind after the fix. Target broader Codex samples when practical; at
   minimum one schema-valid report must actually play the quest before commit.

## Deferred Levers

- Compact truncation is recurring. Fix through shorter load-bearing prose and
  pinned compact observations, not by widening compact mode blindly.
- The seed-159 stale dialogue action id rejection is an engine/client ergonomics
  issue; consider stable dialogue action ids or clearer client expectations.
- Add richer saboteur combat texture: once combat starts, the only visible
  moment-to-moment choice is repeated attack even though prep is fair.
- Review flood-hatch temptation wording: the bad crow-bar choice is intentional
  and strongly warned, but completionist players may still read it as required.
- Collect a wider blind sample when the harness is stable; count only verifier
  reports that actually started and played `tide_mill`.
