# AI Loop State

<!-- historical_cycle_count: 426 -->

This live file is intentionally token-small. Detailed cycle prose before the
2026-06-25 token-efficiency cleanup was removed from the working tree; use Git
history only when deep recovery is truly needed. Keep future entries terse.

### Cycle result - session_pack_path_retired

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: live MCP RPG `Session` and runtime start options no longer carry disk `packPath`; sessions retain only content hash plus canonical world/generated source identity.
- Loop effect: path-based package loading remains a resolver concern, so the engine loop cannot leak raw package paths back through session metadata, save/load, or repeated MCP turns.
- Guard: focused MCP session/tool/source/save regressions cover world quest start, save reload, and metadata absence on live sessions.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused MCP/source/save regressions, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - save_api_pack_id_retired

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: `save()` no longer accepts package-era `packId`; save writes now take state, content hash, RPG mode, and canonical world/generated source metadata only.
- Loop effect: persistence callers cannot smuggle package identity through a compatibility argument, and MCP `save_game` writes directly from session content hash plus `source_ref` metadata.
- Guard: focused save/trace, forged-save, save referential, determinism, stage4, and MCP save/load regressions passed.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused persistence/API regressions, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - session_pack_id_retired

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: MCP RPG `Session` and `SessionInit` no longer carry package-era `packId`; runtime startup stores only content hash plus canonical world/generated source identity.
- Loop effect: `save_game` derives its save-write guard from `worldQuestId` or `generatedRpgSeed`, so live sessions cannot leak package ids back into persisted save bytes.
- Guard: focused MCP session/tool, save/trace, forged-save, and save referential regressions passed.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused MCP/session/persistence regressions, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - save_pack_id_retired

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: persisted `SaveBundle` bytes no longer serialize package-era `packId`; `load()` rejects forged or historical `packId` fields and requires `source_ref` plus `contentHash`.
- Loop effect: save/load identity cannot fall back to package ids while the live `save(..., packId, ...)` call still validates existing runtime callers during staged consolidation.
- Guard: focused save/trace, forged-save, save referential, and MCP save/load regressions passed.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused persistence/MCP regressions, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - trace_pack_id_retired

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: trace recording, replay integrity, and canonical RPG trace fixtures no longer require or emit package-era `pack_id`.
- Loop effect: replayable trace identity now flows through compact `source_ref` plus content hash, reducing package identity available to leak back into CLI/MCP/debug paths.
- Guard: focused save/trace, world-source, MCP trace, trace CLI, play CLI, trace divergence, trace load-integrity, stage4, and schema-standalone regressions passed.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused trace/source regressions, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - pack_source_ref_retired

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: compact save/trace `source_ref` now admits only world quest or generated RPG identity; package-id tuples are malformed input.
- Loop effect: package-only persisted artifacts cannot re-enter load, replay, source resolution, or CLI trace labels as a valid engine source identity.
- Guard: focused save/trace, world-source, trace CLI, play CLI, and schema-standalone regressions cover rejection plus canonical labels.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused source/persistence/CLI regressions, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - source_ref_types_required

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: `SaveBundle` and `Trace` now declare compact `source_ref` as required, matching the runtime load/replay/source-resolution gates.
- Loop effect: new code can no longer treat persisted save/trace source identity as optional at the typed boundary; permissive optional shapes remain only at raw untrusted parse/forgery tests.
- Guard: schema-standalone regression now pins required save/trace source refs, and focused save/trace, world-source, MCP save/load, and generated-save tests passed.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused source/persistence regressions, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - save_source_ref_resolver_required

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: save source resolution now requires compact `source_ref` before deriving world/generated identity from a persisted save bundle.
- Loop effect: loose legacy `worldQuestId`/`generatedRpgSeed` fields no longer drive save source inference below `load()`, while explicit historical `["pack", id]` saves remain sourceable with caller-supplied world or generated identity.
- Guard: focused world-source, save/trace, MCP save/load, generated-save, and save referential regressions cover missing, conflicting, generated, shipped, and historical compact source refs.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused source/persistence regressions, `npm test`, and `npm run health` passed after loop-state rotation.

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
