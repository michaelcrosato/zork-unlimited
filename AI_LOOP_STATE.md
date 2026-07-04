# AI Loop State

<!-- historical_cycle_count: 384 -->

This live file is intentionally token-small. Detailed cycle prose before the
2026-06-25 token-efficiency cleanup was removed from the working tree; use Git
history only when deep recovery is truly needed. Keep future entries terse.

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

### Cycle result - afk_quest_health_pack_id_removed

- Pre-cycle: ran `C:\dev\agent-cleaner` gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: AFK assessment quest-health entries no longer carry duplicate raw `pack_id`; internal assessor labels keep pack ids only for unbound fallback diagnostics.
- Loop effect: assessment JSON rows shrink to `world_quest_id`, playable, and validator warning status while preserving target selection and prompt wording.
- Guard: focused Prettier, typecheck, assessor, AFK loop prompt, and loop-state rotation tests passed.
- VERIFY: focused checks, `npm run validate`, `npm test`, and `npm run health` passed on the final tree.

### Cycle result - afk_quest_health_mode_field_removed

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: AFK assessment quest-health entries no longer carry the constant RPG `mode`; world quest id plus playable/warning status is the catalog axis.
- Loop effect: assessment JSON/markdown drops a retired multi-mode field from every quest row while preserving ranking, playtest targeting, and validator evidence.
- Guard: focused Prettier, typecheck, assessor, AFK loop prompt, and loop-state rotation tests passed.
- VERIFY: focused checks, `npm run validate`, `npm test`, and `npm run health` passed on the final tree.

### Cycle result - bounded_overworld_compact_id_buckets

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: live overworld compact views now build capped ID buckets directly, keeping counts from progress sets without materializing every sorted ID list for loop payloads.
- Loop effect: repeated compact overworld reads keep the same `ids`/`id_counts` contract while scaling better as sessions discover more towns, areas, quests, jobs, sites, and events.
- Guard: focused Prettier, typecheck, UI overworld, MCP tool, and overworld snapshot-integrity tests passed.
- VERIFY: focused checks, `npm run validate`, `npm test`, and `npm run health` passed on the final tree.

### Cycle result - shared_compact_truncation_helpers

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: compact RPG observations and compact transcript summaries now share one truncation helper for capped lists, recent journals, omission counts, and trimmed `more` tuples.
- Loop effect: future compact context/audit changes update one helper boundary instead of parallel tuple/list logic in engine-facing MCP paths.
- Guard: focused Prettier, typecheck, shared truncation helper, compact observation, MCP tool, and MCP server-registration tests passed.
- VERIFY: focused checks, `npm run validate`, `npm test`, and `npm run health` passed on the final tree.

### Cycle result - compact_rpg_more_trailing_zero_trim

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: compact RPG observation `more` tuples now trim trailing zero omission counts and advertise context `v: 6`.
- Loop effect: sparse inventory/flag overflows avoid carrying redundant later zero buckets while journal-only overflow keeps positional counts explicit.
- Guard: focused Prettier, typecheck, compact-observation, MCP tool, and MCP server-registration tests passed after the versioned tuple change.
- VERIFY: focused checks, `npm run validate`, `npm test`, and `npm run health` passed on the final tree.

### Cycle result - shared_mcp_hash_only_responses

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: MCP RPG state-hash unchanged/rejection, transcript unchanged, and overworld snapshot unchanged/rejection replies now construct through shared helpers.
- Loop effect: compact polling and stale-write responses keep one token-small shape across observation, action menu, transcript, save, step, and overworld handlers.
- Guard: focused Prettier, typecheck, MCP tool, and MCP server-registration tests passed over the shared hash-only response path.
- VERIFY: focused checks, `npm run validate`, `npm test`, and `npm run health` passed on the final tree.

### Cycle result - shared_session_projection_cache

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: MCP session action, observation, transcript-summary, and transcript-row projection caches now build through one shared helper.
- Loop effect: state-hash and transcript-hash cache invalidation rules are centralized, reducing drift risk in compact repeated reads that blind play agents only see indirectly.
- Guard: focused Prettier, typecheck, MCP session/tool/server-registration tests passed over the shared cache path.
- VERIFY: focused checks, `npm run validate`, `npm test`, and `npm run health` passed on the final tree.

### Cycle result - shared_compact_source_ref_consistency

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/source surface: compact `source_ref` and legacy source metadata consistency now merges through one shared helper for save load and world source inference.
- Loop effect: persisted saves reject mismatched world quest/generated seed metadata through the same tuple-vs-mirror contract before load or source selection proceeds.
- Guard: focused typecheck plus save/trace, world-source, MCP save/load, trace CLI, referential-integrity, and RPG play source tests passed over shared consistency.
- VERIFY: focused checks, `npm run validate`, `npm test`, and `npm run health` passed on the final tree.

### Cycle result - shared_compact_source_ref_projection

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/source surface: compact source refs now project legacy metadata mirrors and trace labels through shared helpers.
- Loop effect: save bundles and trace records derive compatibility `worldQuestId`/labels from the resolved tuple instead of separate call-site tuple branching.
- Guard: focused typecheck plus save/trace, world-source, MCP save/load, trace CLI, referential-integrity, and RPG play source tests passed over shared projection.
- VERIFY: focused checks, `npm run validate`, `npm test`, and `npm run health` passed on the final tree.

### Cycle result - shared_compact_source_ref_construction

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/source surface: save serialization and trace recording now construct compact source refs through one shared metadata resolver.
- Loop effect: persisted `source_ref` tuples and legacy save mirrors derive from the same resolved source identity, avoiding repeated null/seed/pack fallback branching.
- Guard: focused typecheck plus save/trace, world-source, MCP save/load, trace CLI, referential-integrity, and RPG play source tests passed over shared construction.
- VERIFY: focused checks, `npm run validate`, `npm test`, and `npm run health` passed on the final tree.

### Cycle result - shared_compact_source_ref_validation

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/source surface: compact save and trace `source_ref` shape validation now flows through one pure helper shared by persistence and world source resolution.
- Loop effect: malformed source identity tuples fail through the same tag/value contract before save load, trace replay, or shipped-source inference proceeds.
- Guard: focused typecheck plus save/trace, world-source, MCP save/load, trace CLI, and referential-integrity tests passed over shared validation.
- VERIFY: focused checks, `npm run validate`, `npm test`, and `npm run health` passed on the final tree.
