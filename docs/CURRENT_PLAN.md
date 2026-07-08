# Current Plan

This is the AFK loop's token-small handoff document. It is OVERWRITTEN each
ultraplan with the synthesis plus the one chosen next move; a fresh
implementation subagent reads ONLY this doc and the files it names. Keep it
current, terse, dated, and under ~60 lines — completed work belongs in git
history and `docs/DECISION_LOG.md`, not here.

## Cycle: 2026-07-08 — Tide-Mill late-fork visibility

## Synthesis

The benchmark slice is `world_quest_id=tide_mill`, anchored to
`new_york_city__waterfront` in the New York overworld. It now has the core mill
DAG, seeded combat, prep-backed seeded skill checks, telegraphed death forks, a
win-only +20 capstone, and a late takings fork after `gate_up`: pocket, return,
keep-through-rescue, or steal the coin-bag. `tests/regression/tide_mill_takings_branch.test.ts`
pins those outcomes and proves the clean route is still the only 55/55 route.

The branch had to be late-gated because letting the coin-bag duplicate the whole
quest state blew the exhaustive proof cap; explicit `droppable: false` is now an
optional object affordance and does not perturb legacy pack hashes. Full health
is green. Accepted blind seeds 157 and 159 both reached the clean 55/55 rescue
with clarity 5/5 and enjoyment 4/5. Common feedback: compact truncation and low
replay curiosity; seed 159 also hit a recoverable stale dialogue action id after
conversation state changed. Neither accepted run noticed the new late takings
choice.

## Chosen Move

Make the new late takings fork discoverable from normal play after the sea-gate
rises, without making the optimal route vaguer or adding another quest.

- Target file: `content/rpg/quests/tide_mill.yaml`.
- Start from the `gate_up` Wheel-Room / Mill-House / Counting-Nook compact prose;
  the player currently sees a strong "go down now" finish and no reason to check
  the counting-nook again.
- Surface the fork as temptation and consequence, not instruction: the clean
  route should remain obvious, while a curious player can recognize the coin-bag
  is now a deliberate replay choice.
- Keep prose compact enough that the important affordance survives compact
  observation truncation.
- Add or extend regression coverage for the specific post-`gate_up` observation
  that is meant to expose the fork.

## Acceptance

1. `npm run validate -- tide_mill` reports 0 errors / 0 warnings.
2. The post-`gate_up` route still reaches clean `ending_saved` at 55/55, while
   the takings branch remains reachable and lower-scored.
3. `npm run health` passes.
4. Run blind seeds after the fix. Target a broad Codex sample when practical
   (up to 20 seeds); at minimum one schema-valid report is required before
   commit, and count only reports that pass the verifier.

## Deferred Levers

- Compact truncation is now recurring. Fix it through shorter load-bearing prose
  and pinned compact observations, not by widening compact mode blindly.
- The seed-159 stale dialogue action id rejection is an engine/client ergonomics
  issue; consider stable dialogue action ids or clearer client expectations after
  the active branch-visibility lever.
- Add richer saboteur combat texture: once combat starts, the only visible
  moment-to-moment choice is repeated attack even though prep is fair.
- Review flood-hatch temptation wording: the bad crow-bar choice is intentional
  and strongly warned, but completionist players may still read it as required.
- Extend token/cost telemetry to agent work turns; blind-run telemetry already
  exists in `ai-runs/blind-telemetry.jsonl` plus `npm run blind:telemetry`.
