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
- Shipped quest saves can now restore through `load_game({ world_quest_id })`, so
  start and persistence both share graph identity.
- Shipped quest traces can replay/inspect through `world_quest_id`, so verification
  follows the world graph too.
- Live shipped quest sessions now surface `world_quest_id`/`pack_path` on start,
  transcript, save, and load responses.
- AFK baseline playtests now carry `main_world_quest_id` and instruct blind agents
  to start shipped baseline quests through `start_world_quest`.
- The external blind-test harness should default to shipped `--quest` ids and use
  pack paths only for compatibility/new authored packs.
- `world_path` now follows the same rule: prefer `world_quest_id`; `quest_path` is
  compatibility.
- `validate_pack` and `load_pack` now accept `world_quest_id` for shipped quests
  and return source identity metadata.
- `apply_content_patch` now accepts shipped `world_quest_id`; raw `pack_path`
  remains compatibility/new-pack fallback.
- `validate_quest` and `start_quest` now prefer `quest_id` / `world_quest_id`;
  `quest_path` remains compatibility.
- Retired legacy story aliases from the live MCP surface; use `validate_pack`,
  `new_game`, and `start_world_quest` for current RPG play.
- RPG start/load responses now carry one-time world context; follow-up
  observations omit that repeated binding to lower per-turn MCP payload.
- Repeated observe/step calls can set `compact_actions` to carry action ids
  without repeated command labels; full labels remain available on demand.
- `get_transcript({ summary_only: true })` keeps session/end-state metadata while
  dropping detailed turn/event payload for token-light checks.
- Save/load now requires `mode: "rpg"` on disk; missing or legacy modes are
  rejected at the integrity boundary.
- Trace artifacts now carry and require `mode: "rpg"` before replay or inspect
  steps untrusted trace state.
- CLI replay/inspect now use the same RPG state reference gate as MCP trace
  tools before stepping trace state.
- Shipped saves now embed `worldQuestId`, letting `load_game({ save })` restore
  through the world graph without a separate raw pack-path argument.
- Shipped traces now embed `worldQuestId`, letting replay/inspect resolve
  through the world graph without a separate raw pack-path argument.
- CLI replay/inspect now share that source resolver, so shipped traces can be
  debugged without passing raw pack paths.

## Acceptance

1. `npm run validate` passes.
2. `npm test` passes.
3. Prefer `npm run health` before commit when time permits.
4. The overworld quest regression proves the returned RPG session can be observed.

## Deferred Levers

- Continue simplifying parser-era wording in historical docs when it affects current
  orientation.
- Reduce the duplicate static-vs-stateful overworld tool surface.
- Keep raw pack paths for generated packs and compatibility only.
- Add lightweight token/cost telemetry under ignored run output when the loop needs
  measured efficiency data.
