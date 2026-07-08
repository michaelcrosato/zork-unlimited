# Current Plan

This is the AFK loop's token-small handoff document. It is OVERWRITTEN each
ultraplan with the synthesis plus the one chosen next move; a fresh
implementation subagent reads ONLY this doc and the files it names. Keep it
current, terse, dated, and under ~60 lines — completed work belongs in git
history and `docs/DECISION_LOG.md`, not here.

## Cycle: 2026-07-08 - True Mid-Route Road Interruptions

## Synthesis

Road encounter timing shipped as a first pass. Pending road trouble now carries
route/timing text, compact `pending_road.where`, snapshot `roadEventId` proof,
resource replay integrity, and immediate same-edge repeat suppression on the
Albany-Colonie loop. The Codex blind runner now injects AdventureForge MCP for
Codex and allows one ToolSearch fallback when direct tools are not surfaced.

Fresh-game Codex seeds 416-440 all exited 0; clarity 25x4/5, enjoyment 25x4/5,
replay 25x true. The ledger now has 260 accepted reports. No fresh same-road
repeat complaint appeared, but the dominant fresh/common issue is still that
road trouble feels like it fires after arrival because the session is already
located in the destination town while pending.

Newest issues: true road pending state, completed quest/event/job status still
listed unclearly, generic civic overworld texture, abrupt Albany-to-Wolf-Winter
tone bridge, compact journal hash/truncation, and remote discovered jobs being
hard to review. The updated goal is broader starting-area/open-world depth, but
keep strengthening this same benchmark slice.

## Chosen Move

Make road encounters truly occupy a mid-route interruption state: while
`pending_road` exists, the compact/full context should read as being on the road
between origin and destination, town actions remain blocked, and arrival fiction
should land only after resolution.

- Target `src/world/session_road_travel.ts`, `src/world/session_road_encounters.ts`,
  context/compact view shaping, snapshot restore/replay, and focused UI/MCP
  tests.
- Keep deterministic seeded-free overworld behavior; no clocks or `Math.random`.
- Prefer the smallest state model that makes the player's location/timing
  truthful; avoid a second quest or broad map scaffolding.
- Preserve snapshot restore integrity and compact payload limits.

## Acceptance

1. Focused tests prove a pending Albany-Colonie road encounter reports the player
   as on the route, not simply arrived in Colonie.
2. Focused tests prove resolving the encounter produces the destination-arrival
   beat and then restores normal town actions.
3. `npm run health` passes.
4. Run a 25-seed fresh-game `npm run blind` batch, regenerate
   `docs/BLIND_FEEDBACK_LEDGER.md`, and confirm the after-arrival complaint drops
   before committing.

## Deferred Levers

- Completed job/quest/event status remains unclear in visible lists.
- Colonie and nearby towns still feel templated after Albany.
- Compact-view polish: stale/hash-like artifacts and clearer completed-state
  labels.
- Albany-to-Wolf-Winter bridge still needs a stronger genre/fiction handoff.
- Remote discovered jobs need a review surface outside their current area.
- Tide-Mill levers still open: tactical saboteur branch, coin-bag consequence,
  compact stale-ref cleanup.
