# Current Plan

This is the AFK loop's token-small handoff document. It is OVERWRITTEN each
ultraplan with the synthesis and one chosen next move; keep it dated, terse, and
under ~60 lines. Completed detail belongs in Git history.

## Cycle: 2026-07-11 - Pure Journey Contract

## Synthesis

The fresh-game tutorial, fresh-overworld live start policy, and 100-member fleet
default landed green in `bedbf670`. A subsequent 79-report guided cohort is
preserved only as a non-retention baseline: its harness still prescribed a route
and an artificial 30-45-call stopping point, so it cannot answer whether players
choose to stay in the game.

The blind player must now behave like a human player. The game, not the test
harness, owns the objective and session rhythm.

## Chosen Move

Build one versioned journey contract shared by engine, UI, MCP, and blind-test
evidence before running a new milestone fleet.

- Show the exact current goal everywhere: "Find one local lead in Albany and see
  it through."
- Count accepted gameplay decisions identically across human and MCP surfaces.
  Reads, legal-action listings, save/export, rejected calls, and the retention
  choice itself do not count.
- Present a real continue/end choice at decision 40, then 80, 120, and every 40
  thereafter; also present it when the current goal completes early.
- End only through that choice and return a verifiable receipt containing the
  decision count, proof, goal status, checkpoint history, and exit reason.
- Make `play_mode: pure` plus `start_surface: fresh_overworld` the enforced live
  default for `npm run blind` and every live fleet member. Pure prompts describe
  transport syntax only; game responses supply all content and direction.
- Keep crawler, smoke, mock, and direct-quest paths as explicit development/QA
  instruments that are never counted as pure retention evidence.

## Acceptance

1. UI and MCP expose the same goal, journey count, checkpoint choice, and
   consequences from one authoritative engine state, including save/restore.
2. The tutorial concisely teaches the goal and 40/80/+40 cadence on one screen.
3. Pure live runs cannot use authoring, state-inspection, import/restore, direct
   quest, or structural tools and cannot resume legacy guided evidence.
4. The exit interview occurs only after a game-confirmed exit; the 15-minute
   timeout is recorded as a technical failure, never a planned endpoint.
5. Schema/runtime regressions pin pure metadata and receipt agreement so prompt
   or configuration drift cannot silently weaken the contract.
6. Focused tests, browser checks, crawl, health, one real pure canary, and a new
   100-member pure fleet plus feedback compile all pass.

## Deferred Levers

- Gameplay/content fixes inferred only from the legacy guided baseline.
- Further Wolf combat-pressure tuning and broader cross-quest outcome export.
- Non-pure persona experiments; they remain QA instruments until explicitly
  separated from canonical pure-player retention evidence.
