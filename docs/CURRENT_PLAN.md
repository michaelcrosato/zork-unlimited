# Current Plan

This is the AFK loop's token-small handoff document. Keep it current, terse, and
focused on what a fresh agent needs next.

---

# Consolidation Cycle — Overworld Quest Bridge

## Synthesis

The repo is being normalized around one live game engine: RPG. CYOA was already
retired; parser remained as a compatibility layer with content packs, world graph
entries, negative fixtures, and a large parser-only regression cluster. That surface
has now been removed from the live runtime. The remaining architectural split is
inside the RPG surface itself: overworld sessions can discover quest leads, while
RPG quest sessions still run as separate pack sessions.

Blind MCP playtest agents should continue reporting in-game issues through the RPG
MCP surface. Engine/loop work should inspect the RPG runner, observation, validator,
MCP tools, overworld/session flow, and verifier integrity.

## Chosen Move

Make discovered overworld quest leads start real RPG sessions.

- `start_overworld_session_quest` validates discovery/current area, then creates a
  playable RPG session from the quest pack.
- The response preserves the overworld fields and adds `rpg_session_id` plus the
  RPG session payload.
- The MCP schema now exposes optional RPG `seed` and `hide_graph` controls on that
  bridge.
- `list_stories` is now a compatibility catalog over the Charter Marches quest graph,
  not an independent `content/rpg/pack` directory shelf.
- Shipped quests can now start by Charter Marches graph id through
  `start_world_quest` or `new_game({ world_quest_id })`; raw pack paths remain
  compatibility surfaces.

## Acceptance

1. `npm run validate` passes.
2. `npm test` passes.
3. Prefer `npm run health` before commit when time permits.
4. The overworld quest regression proves the returned RPG session can be observed.

## Deferred Levers

- Continue simplifying parser-era wording in historical docs when it affects current
  orientation.
- Reduce the duplicate static-vs-stateful overworld tool surface.
- Move remaining docs/AFK defaults from `main_story` raw paths toward world quest ids.
- Add lightweight token/cost telemetry under ignored run output when the loop needs
  measured efficiency data.
