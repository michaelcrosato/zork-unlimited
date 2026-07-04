# AI Loop State

<!-- historical_cycle_count: 400 -->

This live file is intentionally token-small. Detailed cycle prose before the
2026-06-25 token-efficiency cleanup was removed from the working tree; use Git
history only when deep recovery is truly needed. Keep future entries terse.

### Cycle result - inspect_cli_mode_line_removed

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: `npm run inspect -- <world_quest_id>` no longer repeats `mode: rpg`; quest summaries keep world quest id, pack title/counts, and hash.
- Loop effect: local inspection stays RPG-only while dropping another redundant single-runtime token from CLI diagnostics.
- Guard: focused Prettier, typecheck, trace CLI, validation-bar, and RPG schema-standalone tests passed over the cleanup.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused tests, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - validate_cli_mode_line_removed

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: `npm run validate` no longer repeats `mode: rpg` for every shipped quest; each report keeps world quest id plus content hash.
- Loop effect: the public validation gate stays RPG-only while dropping another redundant single-runtime token from every cycle's validation output.
- Guard: focused Prettier, typecheck, validation-bar, loop-driver, and RPG schema-standalone tests passed over the cleanup.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused tests, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - latest_cycle_mode_removed

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: `latest-cycle.json` no longer carries generic `mode`; loop status reports run id, budget, target, and compact recommendation identity.
- Loop effect: the AFK handoff keeps prompt style out of machine metadata, reducing another non-RPG mode axis in unattended cycle coordination.
- Guard: focused Prettier, typecheck, AI loop tests, loop driver gates, and RPG schema-standalone tests passed over the cleanup.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused tests, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - generated_checks_seed_only

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: generated RPG mint-and-check rows now carry only deterministic seed plus the production validator report; drift evidence names `seed N`.
- Loop effect: AFK generator drift candidates no longer duplicate public generated pack ids, while validator reports keep internal pack ids for diagnostics.
- Guard: focused Prettier, typecheck, assessor, AI loop, RPG schema-standalone, and generator mint-and-check tests passed over the cleanup.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused tests, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - stale_reactive_audit_world_quest_ids

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: stale-reactive room-item audit now maps shipped packs through the canonical world graph and emits `worldQuestId` instead of raw pack paths.
- Loop effect: AFK structural candidate evidence names `world_quest_id:*` targets, keeping raw pack paths internal to loading while preserving room/object stale-prose triage.
- Guard: focused Prettier, typecheck, stale-reactive audit, assessor, and RPG schema-standalone tests passed over the cleanup.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused tests, `npm test`, and `npm run health` passed after loop-state rotation.

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
