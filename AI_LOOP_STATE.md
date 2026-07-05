# AI Loop State

<!-- historical_cycle_count: 418 -->

This live file is intentionally token-small. Detailed cycle prose before the
2026-06-25 token-efficiency cleanup was removed from the working tree; use Git
history only when deep recovery is truly needed. Keep future entries terse.

### Cycle result - trace_source_ref_required

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: trace replay and trace source resolution now require compact `source_ref` before accepting persisted trace identity.
- Loop effect: loose legacy `worldQuestId`/`generatedRpgSeed` fields no longer drive CLI/MCP replay or inspect alone, while explicit historical `["pack", id]` trace refs remain replay-compatible.
- Guard: focused trace replay, world-source, MCP trace, and CLI trace regressions cover missing, conflicting, generated, shipped, and historical source refs.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused trace/source regressions, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - save_source_ref_required

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: `load()` now requires compact `source_ref` on every save bundle before accepting persisted state.
- Loop effect: loose legacy `worldQuestId`/`generatedRpgSeed` fields no longer pass the persistence boundary alone, while explicit historical `["pack", id]` source refs remain load-only compatibility.
- Guard: focused save/trace, forged-save, world-source, MCP save/load, and generated-pack regressions cover the stricter load boundary.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused persistence/source tests, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - session_source_required

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: `SessionStore.create` now requires canonical `worldQuestId` or `generatedRpgSeed` before retaining an MCP RPG session.
- Loop effect: pack-only sessions fail at the session boundary instead of surviving until save serialization, and disk `packPath` remains valid only when bound to a world quest.
- Guard: focused MCP session/tool/generated-pack regressions cover source-less, pack-path-only, overworld, world, and generated session paths.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused MCP/session tests, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - write_source_pack_fallback_retired

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: save and trace writers now require canonical `worldQuestId` or `generatedRpgSeed` instead of minting package-only `source_ref` fallback.
- Loop effect: new persisted artifacts stay tied to world/generated identity while historical `["pack", id]` save/trace artifacts remain load/replay-only compatibility inputs.
- Guard: focused save/trace, stage4, determinism, and source-integrity regressions cover write rejection plus legacy load/replay tolerance.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused changed tests, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - session_source_identity_guarded

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: `SessionStore.create` now rejects contradictory MCP RPG source identity before retaining a session.
- Loop effect: generated sessions cannot also carry world quest or pack-path identity, and overworld-launched RPG sessions must bind to a world quest.
- Guard: focused session-store regression covers conflict rejection, safe generated-seed validation, id preservation after rejected creates, and metadata locks for shipped/generated sessions.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused session regression, `npm test`, and `npm run health` passed after loop-state rotation.

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
