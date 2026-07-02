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
- `list_world` is now the only public quest catalog over the Charter Marches
  quest graph; the legacy `list_stories` compatibility catalog is retired.
- Shipped quests can now start by Charter Marches graph id through
  `start_world_quest` or `new_game({ world_quest_id })`; `new_game` rejects raw
  `pack_path` starts.
- Shipped quest saves can now restore through embedded or explicit
  `world_quest_id`; `load_game` rejects raw `pack_path`.
- Shipped quest traces can replay/inspect through `world_quest_id`, so verification
  follows the world graph too.
- Live shipped quest sessions now surface `world_quest_id` on start,
  transcript, save, and load responses without echoing raw pack paths.
- Overworld quest observations, action discoveries, compact context, and
  quest-start metadata expose quest ids/titles/areas without raw pack paths.
- `list_world` exposes sanitized world graph/quest-id entries without raw
  `pack` or `path` fields.
- AFK loop internals resolve any needed maintenance paths through `world/source`,
  not public catalog responses.
- AFK assessment and `latest-cycle.json` now use quest ids as primary targets
  for world-bound content fixes; pack paths are edit metadata only.
- AFK assessment output now reports quest counts/health and blind-playtest
  recommendations by `world_quest_id`, not RPG pack ids.
- AFK blind-test rotation now parses those quest-labeled recommendation lines,
  so recently played quests remain visible to the attendance sorter.
- AFK baseline playtests now carry `main_world_quest_id` and instruct blind agents
  to start shipped baseline quests through `start_world_quest`.
- The external blind-test harness now starts shipped playtests only through
  `--quest` ids; raw pack paths are internal edit metadata, not blind play,
  validation, or replay inputs.
- The dev MCP play harness also starts shipped quests through `start_world_quest`
  and `world_quest_id`, not retired `pack_path` starts.
- `world_path` now accepts `world_quest_id` only in ToolApi and public MCP, and
  returns graph-route metadata without raw `quest_path`.
- `validate_quest` and `load_quest` now accept `quest_id` / `world_quest_id`
  for shipped quests and return world identity without echoing raw pack paths.
- `apply_content_patch` now accepts shipped `world_quest_id` in ToolApi/public
  MCP and returns world identity only.
- `replay_trace` and `inspect_trace` now advertise shipped `world_quest_id` on
  public MCP; CLI replay/inspect now also reject raw pack paths.
- ToolApi `replay_trace` and `inspect_trace` now reject raw `pack_path`; shipped
  traces infer their source from embedded `worldQuestId` or explicit
  `world_quest_id`.
- `start_quest` and `validate_quest` now accept only `quest_id` /
  `world_quest_id` in ToolApi and public MCP; raw `quest_path` is rejected.
- Retired legacy story and pack-named aliases from the live MCP surface; use
  `validate_quest`, `load_quest`, `new_game`, and `start_world_quest` for
  current RPG play.
- RPG start/load responses now carry one-time world context; follow-up
  observations omit that repeated binding to lower per-turn MCP payload.
- Repeated observe/step calls can carry action ids without repeated command
  labels; full labels remain available on demand.
- Public MCP `list_legal_actions` defaults to compact action ids; callers can pass
  `compact_actions: false` when they need player-facing command labels.
- `list_legal_actions` also returns `state_hash`, so compact action menus can be
  bound to the reducer state without a follow-up state read.
- `step_action` / `choose_option` accept `expected_state_hash` and reject stale
  action menus before mutating reducer state or transcript history.
- Compact RPG MCP observations now cap inventory/flags and keep only recent
  journal entries, with `more` counts when state was omitted.
- `get_observation({ if_state_hash })` / `get_scene({ if_state_hash })` can return
  hash-only `unchanged` responses, avoiding repeated context payloads for polling
  or resume loops.
- `get_transcript({ summary_only: true })` keeps session/end-state metadata while
  dropping detailed turn/event payload for token-light checks.
- `get_transcript({ compact_summary: true })` caps summary scenes, inventory,
  flags, and journal entries for blind end-of-run audits.
- Transcript responses include `state_hash`, so compact end-of-run audits can
  bind summary/turn rows to reducer state without a follow-up state read.
- Public MCP `get_transcript` defaults to compact summary-only output; callers can
  pass `summary_only: false` and `compact_summary: false` when they need full
  route/event history.
- Public MCP `get_state` defaults to hash-only output; callers can pass
  `include_state: true` only when they need the raw reducer state for debugging.
- Blind-playtest MCP ToolSearch schema prose for the selected
  start/observe/action/transcript tools is trimmed and guarded by a source-size
  regression.
- Restore/debug MCP ToolSearch schema prose for `world_path`, `load_game`,
  `replay_trace`, and `inspect_trace` is trimmed and guarded by a source-size
  regression.
- The verifier negative corpus captures expected bad-ref Git stderr, keeping
  passing test logs free of fatal-looking synthetic failure noise.
- The no-LLM blind MCP smoke harness is now inside the repo lint/format gates with
  Node ESM globals, removing root-wide cleaner ESLint noise.
- Root/historical Markdown files are normalized for root-wide Prettier, removing
  the remaining repo-local cleaner formatting noise.
- Save/load now requires `mode: "rpg"` on disk; missing or legacy modes are
  rejected at the integrity boundary.
- Trace artifacts now carry and require `mode: "rpg"` before replay or inspect
  steps untrusted trace state.
- CLI replay/inspect now use the same RPG state reference gate as MCP trace
  tools before stepping trace state.
- Shipped saves now embed `worldQuestId`, letting `load_game({ save })` restore
  through the world graph without a separate raw pack-path argument.
- `save_game` now returns the current `state_hash`, letting checkpoint loops bind
  saved state without a follow-up observation/state read.
- `save_game({ expected_state_hash })` and
  `export_overworld_session({ expected_snapshot_hash })` reject stale checkpoint
  requests before serializing save/snapshot blobs.
- Shipped traces now embed `worldQuestId`, letting replay/inspect resolve
  through the world graph without a separate raw pack-path argument.
- CLI replay/inspect now share that source resolver, so shipped traces can be
  debugged without passing raw pack paths; positional trace sources are quest ids
  only.
- CLI inspect now summarizes shipped quest packs by `world_quest_id`; positional
  raw pack summaries and explicit `--pack` are rejected.
- CLI validate now defaults through the canonical world graph and accepts
  targeted `world_quest_id` values; positional raw pack files and explicit
  `--pack` mode are rejected.
- CLI authoring now writes draft RPG packs only; direct `content/rpg/pack` output
  is rejected until the quest is deliberately registered in the canonical world
  graph.
- CLI play now accepts/defaults to shipped `world_quest_id` sources and records
  `worldQuestId`, so local traces replay without raw pack paths.
- Save restore source inference now shares the same world source resolver as
  trace replay and CLI play.
- `new_game` source selection is now world-id or generated-pack only, keeping
  generated packs as the explicit null-world source.
- Generated RPG saves now embed `generatedRpgSeed`, letting `load_game({ save })`
  reconstruct in-memory generated packs without a raw pack path.
- `load_game` source selection is save-embedded, `world_quest_id`, or
  `generate_rpg_seed`; raw pack paths are internal source metadata, not public
  loop inputs.
- `validate_quest`, `load_quest`, and `apply_content_patch` now use shared
  source identity directly instead of re-deriving `world_quest_id` from the
  resolved path.
- Retired the static overworld compatibility helper module; local overworld play
  now goes through stateful sessions only.
- Stateful overworld MCP action wrappers now share one session response envelope
  helper.
- Discovered overworld quest starts now create RPG sessions through
  `world_quest_id`, not the compatibility raw pack path.
- MCP overworld loading now verifies local quest ids and packs against the
  canonical world graph before play.
- Static and stateful local overworld actions now share descriptor text, timing,
  and renown values.
- New York overworld loading/validation now lives in `world/source`; MCP only
  asks for the loaded manifest.
- Overworld session restore now rejects duplicate save maps, invalid discovery
  lifecycles, and tampered pending road encounter options.
- MCP now exposes compact overworld context for repeated loop turns: stable ids,
  vitals, local actions, capped route options, pending roads, and recent journal.
- Public MCP `get_overworld_session` now returns compact context by default;
  callers can pass `include_observation: true` only when they need the full
  observation object.
- `get_overworld_session({ if_snapshot_hash })` and
  `get_overworld_session_context({ if_snapshot_hash })` can return hash-only
  `unchanged` responses when the overworld snapshot has not changed.
- Stateful overworld MCP actions now accept `compact_context` so repeated loop
  turns can avoid full observations after movement or local actions.
- Overworld MCP start and restore also accept `compact_context`, so long-running
  agents can stay compact from the first session payload.
- Public MCP stateful overworld start/action tools now default to compact context;
  callers can pass `compact_context: false` only when they need full observations.
- Public MCP RPG start/read/step/load tools now default to compact observation
  context; callers can pass `compact_observation: false` when they need full
  observations.
- Public MCP `list_legal_actions` now defaults to compact ids; callers can pass
  `compact_actions: false` for command labels.
- RPG session start tools and overworld quest handoff now accept compact action
  menus, avoiding repeated command labels on the opening RPG observation.
- RPG transcripts now support compact id-only turn rows for route debugging
  without replaying event text.
- World source loading now caches parsed Charter Marches and New York overworld
  manifests per process.
- MCP pack loading now caches unchanged RPG compile/validate reports within each
  API instance.
- `list_overworld` now keeps source/design-rule prose behind
  `include_design_notes`, leaving the default catalog response counts-first and
  token-small.
- `list_world` now keeps full graph and all quest route arrays behind
  `include_graph` / `include_routes`, leaving the default RPG quest catalog
  token-small for blind/AFK setup.
- Overworld pending-road session snapshots now persist only the edge id and
  reconstruct road event/options from the content-bound world manifest.
- Overworld session start/read/action/export/restore responses now return
  `snapshot_hash`, letting checkpoint loops verify session identity without
  re-exporting.
- Stateful overworld action tools accept `expected_snapshot_hash` and reject stale
  compact menus before mutating route, local-action, or quest-handoff state.
- Overworld travel-log session snapshots now persist road ids plus dynamic
  outcomes and rebuild route text/event payloads from the world manifest.
- Overworld snapshot restore now rejects duplicate journal history,
  unknown journal towns/source ids, source/place mismatches, mismatched journal
  kind/id prefixes, unmatched road journal arrivals,
  malformed/future/non-newest-first journal timelines, progress/journal state
  drift, region-renown mismatches, discovery locality drift, visited-town travel
  proof drift, non-contiguous travel path replay, discovered-town frontier drift,
  area-discovery prefix/count drift, local-area chronology drift, local source prefix
  drift, local source identity/chronology/count replay drift, site-prefix drift, saved-area-map drift,
  pending-road/travel binding drift,
  pending-road unresolved-state drift,
  travel/road/service clock and resource replay drift,
  local-action journal reachability/town-chronology drift,
  resolved-event locality/prerequisite drift,
  regional-arc completion proof/timing drift,
  non-newest-first or future travel logs, and impossible travel vitals before
  rebuilding live session state.
- Compact overworld context now carries capped id-only recent travel tuples so
  agents do not need full observations to recover route history.
- Compact overworld context now caps global progress id arrays and exposes
  counts/truncation flags for long-running sessions.
- Compact overworld route options now omit repeated destination names and carry
  stable destination ids plus route metrics/path ids only.
- Compact overworld road and area-route tuples now omit repeated destination
  names, keeping stable ids and numeric route metrics.
- Compact overworld pending-road tuples now omit road-event titles and stable
  option labels while preserving ids, risk, strategy, and numeric outcomes.
- Static overworld compatibility helpers are absent from ToolApi and public MCP;
  agent play uses stateful overworld sessions and compact session context.

## Acceptance

1. `npm run validate` passes.
2. `npm test` passes.
3. Prefer `npm run health` before commit when time permits.
4. The overworld quest regression proves the returned RPG session can be observed.

## Deferred Levers

- Continue simplifying parser-era wording in historical docs when it affects current
  orientation.
- Continue shrinking lower-level debug helpers that still leak raw pack paths in
  diagnostics or historical wording.
- Add lightweight token/cost telemetry under ignored run output when the loop needs
  measured efficiency data.
- Tighten full restore-time local action sequencing beyond discovery prefixes;
  discovered-town frontier exactness, area-discovery prefix order, local source
  prefix order, saved area-map exactness, pending-road/travel binding, travel
  path replay, local-action reachability, and town-arrival chronology are now
  enforced.
