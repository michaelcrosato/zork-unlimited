# Current Plan

This is the AFK loop's token-small handoff document. It is OVERWRITTEN each
ultraplan with the synthesis plus the one chosen next move; a fresh
implementation subagent reads ONLY this doc and the files it names. Keep it
current, terse, dated, and under ~60 lines — completed work belongs in git
history and `docs/DECISION_LOG.md`, not here.

## Cycle: 2026-07-08 - Starting-Area Action Signposting

## Synthesis

Albany-Colonie's first road event is now a hand-authored Thruway shoulder
incident with direction-neutral prose. Focused manifest/UI/MCP tests pin that it
no longer says "road report" or encodes Colonie->Albany while the player travels
Albany->Colonie, and full/compact pending-road v13 behavior still holds.

Fresh-game Codex seeds 466-490 all exited 0; clarity 25x4/5, enjoyment 25x4/5,
replay 25x true. The ledger now has 310 accepted reports. Road-direction and
literal "road report" complaints dropped to 0/25; residual road feedback was
one vague-road-premise report and one "pending road says arrived" wording report.

The updated goal is broader: make the starting area and nearby overworld feel
like a deep open-world slice, not only a quest launcher. In the fresh batch,
hidden-count/action-discovery friction appeared in 25/25 reports; dialogue
formatting/action ids appeared in 22/25; compact hash/truncation in 19/25; and
completed quest/list status in 11/25.

## Chosen Move

Make the opening Albany Civic Center read like a place with natural first moves,
not a raw hidden-count checklist. Keep this as one focused starting-area
improvement: stronger fiction around why scouting/talking/exploring exposes
nearby work, and clearer first-action affordance text where the fresh player
actually starts.

- Target the New York overworld starting view/content surface and focused tests
  around Albany Civic Center / first local actions.
- Keep deterministic seeded-free overworld behavior; no clocks or `Math.random`.
- Prefer fiction-forward prompts over tutorial paragraphs or visible rule prose.
- Avoid broad map scaffolding, a second quest, or compact-format churn unless it
  directly supports the first-start read.

## Acceptance

1. Focused tests prove Albany's first visible local affordances point players
   toward concrete scout/talk/explore choices without exposing raw tutorial copy.
2. Focused tests prove the opening still reveals the same Albany Station Quarter,
   Wolf-Winter lead, local jobs, and sites through normal deterministic actions.
3. `npm run health` passes.
4. Run a 25-seed fresh-game `npm run blind` batch, regenerate
   `docs/BLIND_FEEDBACK_LEDGER.md`, and confirm hidden-count/first-action
   friction drops before committing.

## Deferred Levers

- Completed job/quest/event status remains unclear in visible lists.
- Colonie and nearby towns still feel templated after Albany.
- Compact-view polish: stale/hash-like artifacts and clearer completed-state
  labels.
- Albany-to-Wolf-Winter bridge still needs a stronger genre/fiction handoff.
- Remote discovered jobs need a review surface outside their current area.
- Tide-Mill levers still open: tactical saboteur branch, coin-bag consequence,
  compact stale-ref cleanup.
