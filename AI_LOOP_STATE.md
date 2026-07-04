# AI Loop State

<!-- historical_cycle_count: 395 -->

This live file is intentionally token-small. Detailed cycle prose before the
2026-06-25 token-efficiency cleanup was removed from the working tree; use Git
history only when deep recovery is truly needed. Keep future entries terse.

### Cycle result - stale_reactive_audit_pack_id_removed

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: stale-reactive room-item audit sites no longer carry unused pack metadata; site payloads keep only pack path plus room/object evidence needed for triage.
- Loop effect: AFK structural candidates avoid another raw pack identity field while preserving deterministic stale-prose evidence for engine-side follow-up.
- Guard: focused Prettier, typecheck, stale-reactive audit, assessor, and RPG schema-standalone tests passed over the cleanup.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused tests, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - stale_reactive_audit_mode_removed

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: stale-reactive room-item audit now scans the single RPG pack directory directly and no longer emits a constant `mode` field on audit sites.
- Loop effect: AFK structural candidates carry only pack identity and room/object evidence, removing a retired mode axis from loop-facing audit payloads.
- Guard: focused Prettier, typecheck, stale-reactive audit, assessor, and RPG schema-standalone tests passed over the cleanup.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused tests, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - world_catalog_mode_field_removed

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/public surface: world quest discovery no longer stores a discarded internal `mode` field before building the mode-free `list_world` catalog.
- Loop effect: the world catalog path carries only quest/world identity and playability, avoiding constant single-runtime metadata in the discovery projection.
- Guard: focused Prettier, typecheck, MCP tools, and RPG schema-standalone tests passed over the catalog cleanup.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused tests, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - remove_packmode_alias

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/public surface: removed the `PackMode` alias and the `adapt_story` mode parameter from the in-process MCP tool API; stray runtime `mode` input still rejects.
- Loop effect: MCP and AFK internals now key the single runtime through `SAVE_MODE` or literal RPG-only directory tuples instead of a fake mode selector.
- Guard: focused Prettier, typecheck, MCP authoring, MCP registration, RPG schema-standalone, and stale-reactive audit tests passed.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused tests, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - equal_hash_session_cache_retention

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: `SessionStore.update` now preserves state-derived legal-action, observation, and transcript-summary caches when a replacement state has the same canonical hash.
- Loop effect: no-op, rejected, and state-equivalent turns keep compact MCP projections warm instead of rebuilding token-facing views on unchanged state.
- Guard: focused Prettier, typecheck, MCP session, and MCP tool tests passed over equal-hash cache retention.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused tests, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - world_path_coordinate_lookup

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/world surface: world graph helpers now resolve nodes by coordinate, and `world_path` can route from Charterhaven to a node coordinate.
- Loop effect: the coordinate matrix is now an input surface for route lookup, not only metadata emitted by `list_world`.
- Guard: focused typecheck plus MCP tool, MCP server registration, and single-world manifest tests passed over coordinate route lookup.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused tests, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - world_graph_edge_metrics

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/world surface: world graph edge projection now derives endpoint coordinates, deltas, and Manhattan distances from canonical node coordinates.
- Loop effect: `list_world({ include_graph: true })` exposes a pack-free coordinate edge map while the default catalog remains compact.
- Guard: focused typecheck plus MCP tool, MCP RPG catalog, and single-world manifest tests passed over edge metric projection.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused tests, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - world_graph_map_bounds

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/world surface: world graph helpers now derive compact matrix bounds from complete node coordinates.
- Loop effect: `list_world({ include_graph: true })` exposes pack-free map bounds so tool consumers can reason about world extent without scanning every node first.
- Guard: focused typecheck plus MCP tool, MCP RPG catalog, and single-world manifest tests passed over bounds derivation/projection.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused tests, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - world_route_coordinate_steps

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/world surface: `worldRouteFromHub` now projects graph coordinates, movement deltas, and Manhattan step distances into route steps.
- Loop effect: `world_path`, `list_world` route opt-ins, and quest-start metadata consume the coordinate map directly instead of returning prose-only routes.
- Guard: focused typecheck plus MCP tool, MCP RPG catalog, and single-world manifest tests passed over coordinate route projection.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused tests, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - canonical_world_graph_coordinates

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/world surface: the canonical Charter Marches graph now carries unique integer coordinates for every hub, route, district, and quest node.
- Loop effect: `list_world({ include_graph: true })` exposes pack-free map coordinates, giving blind agents and future engine work a stable matrix surface instead of prose-only routes.
- Guard: focused typecheck plus world-source, manifest, MCP catalog, and MCP tool tests passed over coordinate validation/projection.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused tests, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - verifier_legacy_cli_test_families

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: verifier integrity now forbids retired CYOA/parser CLI files and unit-test path families from reappearing.
- Loop effect: single-RPG runtime lock-down covers the objective's old binary/test surfaces, not only source/content directories.
- Guard: focused Prettier, typecheck, verifier integrity, RPG-only guard, generator-protection, and loop-state rotation tests passed.
- VERIFY: `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, and `npm run health` passed.

### Cycle result - verify_loop_state_rotation_bound

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: verifier integrity now fails when live `AI_LOOP_STATE.md` exceeds the rotation keep window.
- Loop effect: manual and automated cycles cannot silently rebuild a large prompt handoff; older detail stays in git history or ignored archives.
- Guard: focused Prettier, typecheck, verifier integrity, and loop-state rotation tests passed.
- VERIFY: `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, and `npm run health` passed.

### Cycle result - compact_latest_cycle_run_dir_removed

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: `latest-cycle.json` no longer stores derived `runDir`; consumers keep `runId`, target, playtest record, mode, timeout, and compact recommendation ids.
- Loop effect: machine handoff removes another repeated path while ai-runs artifacts still use `ai-runs/<runId>/...`.
- Guard: focused Prettier, typecheck, AI loop metadata, loop driver gate, and loop-state rotation tests passed.
- VERIFY: `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, and `npm run health` passed.

### Cycle result - compact_afk_handoff_recommendations

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: `latest-cycle.json` and automatic loop-state appends now persist recommendation ids/categories instead of full titles and rationales.
- Loop effect: per-cycle machine handoffs stay quest-id/status based and avoid re-ingesting verbose recommendation prose outside the human prompt.
- Guard: focused Prettier, typecheck, AI loop metadata, assessor attendance, loop driver gate, and loop-state rotation tests passed.
- VERIFY: focused checks, `npm run validate`, `npm test`, and `npm run health` passed on the final tree.

### Cycle result - afk_quest_health_path_removed

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: AFK quest-health rows no longer carry raw pack paths; shipped loop metadata and prompts use `world_quest_id` plus warning/playable status.
- Loop effect: assessment JSON and latest-cycle payloads stop repeating source paths while assessor candidates still retain internal edit refs for diagnostics.
- Guard: focused Prettier, typecheck, assessor, AFK loop prompt, and loop-state rotation tests passed.
- VERIFY: focused checks, `npm run validate`, `npm test`, and `npm run health` passed on the final tree.
