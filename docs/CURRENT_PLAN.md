# Current Plan

This is the AFK loop's token-small handoff document. Keep it current, terse, and
focused on what a fresh agent needs next.

---

# Consolidation Cycle — Parser Runtime Retirement

## Synthesis

The repo is being normalized around one live game engine: RPG. CYOA was already
retired; parser remained as a compatibility layer with content packs, world graph
entries, negative fixtures, and a large parser-only regression cluster. That surface
kept increasing search cost and made future agents distinguish migration data from
the actual engine.

Blind MCP playtest agents should continue reporting in-game issues through the RPG
MCP surface. Engine/loop work should inspect the RPG runner, observation, validator,
MCP tools, overworld/session flow, and verifier integrity.

## Chosen Move

Retire the parser runtime and content rather than preserve it as migration data.

- Removed parser source, parser validator, parser content packs, parser negative
  fixtures, parser property tests, and parser-only regression suites.
- Kept RPG structural coverage by moving shared tests onto RPG helpers and zero-enemy
  RPG fixtures where needed.
- Updated the Charter Marches and New York overworld manifests to reference shipped
  RPG quests only.
- Moved retired parser paths into `FORBIDDEN_FILES` in `scripts/verify-integrity.ts`.

## Acceptance

1. `npm run typecheck` passes.
2. `npm run validate` passes and discovers only shipped RPG packs.
3. `npm test` passes.
4. `npm run health` passes before commit.
5. No live source imports parser modules.

## Deferred Levers

- Continue simplifying parser-era wording in historical docs when it affects current
  orientation.
- Review remaining generic CYOA-shaped broken fixtures and decide whether they still
  serve non-RPG rejection tests.
- Add lightweight token/cost telemetry under ignored run output when the loop needs
  measured efficiency data.
