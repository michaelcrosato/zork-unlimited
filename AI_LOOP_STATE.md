# AI Loop State

<!-- historical_cycle_count: 413 -->

This live file is intentionally token-small. Detailed cycle prose before the
2026-06-25 token-efficiency cleanup was removed from the working tree; use Git
history only when deep recovery is truly needed. Keep future entries terse.

### Cycle result - trace_generated_source_replay

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: trace source resolution now treats embedded `generatedRpgSeed`/`source_ref: ["gen", seed]` as a first-class replay source for MCP and CLI replay/inspect.
- Loop effect: generated RPG traces replay from compact source metadata through the same generated-pack validator/cache as live generated sessions, without raw pack paths or world-quest backsolves.
- Guard: focused world-source and MCP trace regressions cover generated-source inference, conflict rejection, and inspect payload identity.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused regressions, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - trace_source_ref_replay_guarded

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: trace replay now validates compact `source_ref` consistency with `worldQuestId`/`generatedRpgSeed` before stepping untrusted trace state through the engine.
- Loop effect: generated RPG traces carry explicit generated-seed metadata, and malformed or conflicting trace source identity fails at the replay boundary.
- Guard: save/trace, world-source, and trace CLI focused regressions cover generated trace identity plus replay-boundary source-ref rejection.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused trace/source regressions, `npm test`, and `npm run health` passed.

### Cycle result - source_discovery_identity_trimmed

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: internal world quest source discovery no longer returns package-era `path` or pack `id`; entries carry title, playability, world binding, and canonical `world_quest_id`.
- Loop effect: `list_world` and AFK discovery stay on world graph identity before public catalog packing, with less stale package identity available to re-leak.
- Guard: focused RPG catalog test asserts source discovery has no `path`/`id` and matches `list_world` world quest ids.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused RPG catalog test, `npm test`, and `npm run health` passed.

### Cycle result - world_catalog_identity_compacted

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: `list_world` quest rows now expose canonical `world_quest_id` without duplicate row `id` or `graph_node`; `world_path` keeps graph node identity for coordinate/path lookups.
- Loop effect: public world discovery and AFK ranking stay world-graph keyed while catalog payload size drops to about 5.1 KB.
- Guard: catalog, RPG tool, world manifest, and assessor focused regressions cover the compact identity contract.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused regressions, `npm test`, and `npm run health` passed.

### Cycle result - mcp_play_compact_context

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: `scripts/mcp_play.ts` now calls the MCP server with compact hidden-graph RPG args and renders `context` instead of stale full observations.
- Loop effect: the external MCP play harness exercises the same compact payload path blind agents use, including compact step events and action ids.
- Guard: blind-runner contract now asserts compact harness args/context shape, and a live `npx tsx scripts/mcp_play.ts breaking_weir --seed 1` MCP round trip passed.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused regression, `npm test`, and `npm run health` passed.

### Cycle result - compact_state_projection_cached

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: `get_state({ compact_state: true })` now uses a version-keyed, state-hash `SessionStore` projection cache and returns cloned compact payloads.
- Loop effect: repeated compact-state polling avoids rebuilding public state scalars, lists, object summaries, and quest stages while keeping returned MCP payloads detached.
- Guard: session cache invalidation/freeze coverage, compact-state tool cache use, and response-mutation regression passed.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused unit tests, `npm test`, and `npm run health` passed.

### Cycle result - blind_compact_state_audits

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: blind MCP prompt/protocol/smoke now load `get_state` up front and prescribe `compact_state: true` for mechanical audits, reserving raw `include_state` for engine-state debugging.
- Loop effect: blind agents can verify state/hash freshness without pulling full reducer snapshots, and the no-LLM smoke path proves compact state plus unchanged polling.
- Guard: focused blind runner/docs/MCP registration contracts, blind smoke, and schema-size budget passed.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused regressions, `npm run blind:smoke`, `npm test`, and `npm run health` passed.

### Cycle result - rpg_utility_schema_prose_trimmed

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: public RPG utility MCP schema prose for generated starts, state reads, transcripts, saves, loads, and trace helpers is trimmed and guarded by source-size regressions.
- Loop effect: generated-game, save/load, transcript, and trace ToolSearch reads spend fewer tokens before agents reach compact RPG payloads.
- Guard: focused Prettier, MCP registration schema-size regression, and typecheck passed.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused regression, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - overworld_schema_prose_trimmed

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: overworld MCP ToolSearch schema prose now reuses terse shared session/hash fields and short action-id descriptions, guarded by a source-size regression.
- Loop effect: overworld loop/action discovery spends fewer tokens on repeated schema prose before agents reach compact context payloads.
- Guard: focused Prettier, MCP registration schema-size regression, and typecheck passed.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused regression, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - authoring_fix_schema_prose_trimmed

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: authoring/fix MCP ToolSearch schema prose for `generate_rpg_pack`, `adapt_story`, and `apply_content_patch` is trimmed and guarded by a source-size regression.
- Loop effect: ToolSearch reads for generation, authoring, and content-patch operations spend fewer tokens before the agent reaches actual engine/tool payloads.
- Guard: focused Prettier, MCP registration schema-size regression, and typecheck passed.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused regression, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - trace_cli_duplicate_world_source_removed

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: CLI replay/inspect trace summaries no longer repeat world quest identity after `source: world_quest_id:*`; trace diagnostics keep trace id, source, seed/steps, hashes, and replay status.
- Loop effect: trace debugging output stays world-bound while dropping a duplicate package-era source axis from every replay/inspect trace read.
- Guard: focused Prettier, typecheck, trace CLI, RPG play source, and replay smoke checks passed over the cleanup.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused tests, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - inspect_cli_pack_line_removed

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: `npm run inspect -- <world_quest_id>` no longer prints internal `Pack:` identifiers; quest summaries keep world quest id, title, counts, stats, enemies, and hash.
- Loop effect: shipped quest diagnostics drop the package-era id while preserving internal pack ids for author/generated diagnostics.
- Guard: focused Prettier, typecheck, trace CLI, and report-format checks passed over the cleanup.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused tests, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - validate_cli_pack_line_removed

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: `npm run validate` no longer prints internal `Pack:` identifiers for shipped world quests; each report stays keyed by world quest id plus content hash.
- Loop effect: the recurring validation gate drops another package-era identity line per quest while preserving internal pack ids for author/generated diagnostics.
- Guard: focused Prettier, typecheck, validation-bar, and report-format checks passed over the cleanup.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused tests, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - blind_smoke_mode_line_removed

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: the no-LLM blind MCP smoke runner no longer prints stale top-level `mode` from `start_world_quest`; startup logs keep session id plus quest id.
- Loop effect: blind harness smoke output now matches mode-free MCP start responses instead of showing `mode undefined` during preflight checks.
- Guard: focused Prettier, typecheck, blind runner contract, and blind smoke checks passed over the cleanup.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, `npm run blind:smoke`, focused test, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - inspect_cli_mode_line_removed

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: `npm run inspect -- <world_quest_id>` no longer repeats `mode: rpg`; quest summaries keep world quest id, pack title/counts, and hash.
- Loop effect: local inspection stays RPG-only while dropping another redundant single-runtime token from CLI diagnostics.
- Guard: focused Prettier, typecheck, trace CLI, validation-bar, and RPG schema-standalone tests passed over the cleanup.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused tests, `npm test`, and `npm run health` passed after loop-state rotation.
