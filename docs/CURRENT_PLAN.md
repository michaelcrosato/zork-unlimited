# Current Plan

This is the AFK loop's token-small handoff document. It is OVERWRITTEN each
ultraplan with the synthesis and one chosen next move; keep it dated, terse, and
under ~60 lines. Completed detail belongs in Git history.

## Cycle: 2026-07-11 - Fresh-Game Tutorial Contract

## Synthesis

Wolf-Winter now has complementary clues, cross-encounter resources, a spatial
loft route, and consequence-sensitive victory: saved wood can bar the herd now
or survive into dawn for repair, with equal score but durable outcome titles.
The 449-report ledger measures twelve fresh Wolf runs at clarity 4.67,
enjoyment 3.67, and replay 4/12. That cycle lands before this plan begins.

The user has set three new operating constraints for the next tranche:

1. milestone blind fleets are 100 agents, not 200;
2. every live blind LLM playtest starts from a fresh open-world game, never a
   targeted quest drop-in;
3. every new game opens with a one-page, single-screen tutorial containing only
   enough orientation to begin confidently.

These belong together. The tutorial must be judged at the actual fresh-game
surface, and the 100-agent fleet should test that onboarding plus the natural
route into the marquee quest rather than a developer shortcut.

## Chosen Move

Build and lock the fresh-game tutorial contract before running the 100-agent
milestone fleet.

- Audit the UI start flow, `start_overworld` MCP response, and save/new-game
  boundaries so one canonical tutorial can serve humans and blind agents.
- Design one dismissible screen: premise/goal, how to inspect and choose legal
  actions, how travel/discovery works, and where status/journal/save fit—no
  encyclopedic mechanics or quest spoilers.
- Make it appear once at the beginning of every genuinely new game, never on
  ordinary resume/import, and remain usable at supported viewport sizes.
- Change live blind harness/protocol paths to reject targeted quest starts;
  deterministic smoke/crawler tests may remain targeted because they are not
  blind LLM playtests.
- Change the milestone fleet contract/documentation from 200 to 100 and then
  run 100 fresh-open-world agents after tutorial verification.

## Acceptance

1. A new human game opens on one complete, single-screen tutorial with a clear
   dismiss/start action; no scroll or second page is required at target viewports.
2. Fresh MCP/open-world context exposes the same minimal orientation without
   source knowledge; resume/import does not replay it as new state.
3. Live blind LLM tooling cannot start at `--quest`; every verified live report
   begins at fresh Albany open world. Mock/structural tests retain needed seams.
4. Fleet docs/defaults and the milestone command use 100 agents, with no stale
   active instruction requiring 200.
5. UI browser smoke, compact budgets, full health, and a 100-agent fresh-world
   fleet plus feedback compile are green.

## Deferred Levers

- Further Wolf combat-pressure tuning; prepared safety remains a stated promise.
- A generic cross-quest inventory/outcome export beyond durable ending titles.
- Structured `combat_roll` events separating diegetic prose from exact math.
