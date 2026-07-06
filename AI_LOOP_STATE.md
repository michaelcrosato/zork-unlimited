# AI Loop State

<!-- historical_cycle_count: 463 -->

This live file is intentionally token-small. Detailed cycle prose before the
2026-06-25 token-efficiency cleanup was removed from the working tree; use Git
history only when deep recovery is truly needed. Keep future entries terse.

### Cycle result - trace_inspect_compact_default

- Pre-cycle: `C:\dev\agent-cleaner` measure/gates passed through WSL; optional secret scanner remains absent.
- Engine/loop surface: `inspect_trace` now defaults to versioned compact step-summary tuples; full per-step action objects require `compact_summary: false`.
- Loop effect: trace/debug loops can inspect replay health, divergence, locations, endings, and diagnosis without echoing repeated object keys and structured actions for every step.
- Self-critique: trace inspection is lower-frequency than live turn stepping, but it is exactly the debug payload blind playtest agents will not flag as an in-game problem.
- Guard: focused MCP trace regressions pin compact default, full opt-out rows, divergence reporting, and trace load integrity.
- VERIFY: `C:\dev\agent-cleaner`, focused MCP trace regressions, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - save_source_opt_in

- Pre-cycle: `C:\dev\agent-cleaner` measure/gates passed through WSL; optional secret scanner remains absent.
- Engine/loop surface: `save_game` no longer echoes `world_quest_id` / `generated_rpg_seed` by default; callers opt in with `include_source: true`.
- Loop effect: checkpoint loops keep source identity inside the compact save `source_ref` instead of repeating it in every save response envelope.
- Self-critique: save blobs remain large by design; this only trims redundant response metadata around guarded checkpoint calls.
- Guard: focused MCP save/load and registration regressions pin default omission, opt-in source echo, stale hash-only saves, and source-ref reload integrity.
- VERIFY: `C:\dev\agent-cleaner`, focused MCP save/source regressions, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - overworld_actions_compact_default

- Pre-cycle: `C:\dev\agent-cleaner` measure/gates passed through WSL; optional secret scanner remains absent.
- Engine/loop surface: direct ToolApi overworld actions, restore, and quest handoff now default to compact context/result payloads; explicit false flags keep full readers available.
- Loop effect: local harnesses and direct agents no longer get full overworld observations/action result objects after every travel, local action, quest sync, or restore.
- Self-critique: API-default work only; full export snapshots and the tracked world JSON remain large follow-up surfaces.
- Guard: focused MCP/overworld regressions keep full-payload assertions explicit while pinning no-flag compact route, travel, and restore payloads.
- VERIFY: `C:\dev\agent-cleaner`, focused MCP/overworld compact-default regressions, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - overworld_loader_cache_tests

- Pre-cycle: `C:\dev\agent-cleaner` measure/gates passed through WSL; optional secret scanner remains absent.
- Engine/loop surface: overworld-heavy tests now use the cached production `loadOverworldManifest` path instead of direct JSON reads/parses.
- Loop effect: local and CI test loops stop duplicating manual parses of the 3.1 MB overworld manifest in read-only fixture setup.
- Self-critique: test-loop efficiency only; the tracked world JSON remains large and runtime payload surfaces still need deeper shrinking.
- Guard: focused overworld/session/UI regressions exercise the cached loader path with immutable manifests.
- VERIFY: `C:\dev\agent-cleaner`, focused overworld loader/cache regressions, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - ignored_run_artifact_tracking_guard

- Pre-cycle: `C:\dev\agent-cleaner` measure/gates passed through WSL; optional secret scanner remains absent.
- Engine/loop surface: verifier integrity now blocks tracked `ai-runs/` artifacts in addition to the ignored loop archive file.
- Loop effect: per-cycle logs, playtests, and cost evidence can stay local without becoming recurring clone/context payload.
- Self-critique: prevention guard only; it does not shrink the already-large world JSON or runtime payloads.
- Guard: verifier regressions pin prefix matching for nested `ai-runs/` paths and prove the real repo has no tracked ignored loop artifacts.
- VERIFY: `C:\dev\agent-cleaner`, focused verifier regressions, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - rpg_actions_compact_default

- Pre-cycle: `C:\dev\agent-cleaner` measure/gates passed through WSL; optional secret scanner remains absent.
- Engine/loop surface: ToolApi `list_legal_actions` now defaults to compact action-id arrays, matching the public MCP wrapper.
- Loop effect: direct harness/agent menu polls no longer emit repeated command labels unless `compact_actions: false` is explicit.
- Self-critique: closes another API-default payload path; deeper wins remain in the large tracked world JSON and generated trace/log footprint.
- Guard: MCP action-menu regressions pin no-flag compact ids while command-search helpers opt into full labels.
- VERIFY: `C:\dev\agent-cleaner`, `npm run typecheck`, focused action-menu regressions, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - rpg_transcript_compact_default

- Pre-cycle: `C:\dev\agent-cleaner` passed; optional secret scanner remains absent.
- Engine/loop surface: ToolApi `get_transcript` now defaults to compact summary-only transcript metadata, matching the public MCP transcript wrapper.
- Loop effect: direct harness/agent transcript polls no longer emit full turn arrays unless `summary_only: false` is explicit.
- Self-critique: transcript default only; deeper wins remain in compact summary/event tuple shape and persisted trace payloads.
- Guard: MCP transcript regressions pin no-flag summary-only behavior while full-turn readers opt out explicitly.
- VERIFY: `C:\dev\agent-cleaner`, `npm run typecheck`, focused transcript regressions, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - rpg_load_compact_default

- Pre-cycle: `C:\dev\agent-cleaner` passed; optional secret scanner remains absent.
- Engine/loop surface: ToolApi `load_game` now defaults to compact RPG context; full restored observations require `compact_observation: false`.
- Loop effect: direct harness/agent resumes no longer emit full room/action/state observations before compact poll/action loops continue.
- Self-critique: closes the remaining direct RPG full-payload default; deeper savings now move to payload shape and persistence internals rather than API defaults.
- Guard: MCP reload regressions pin no-flag compact restored context while full-observation reload readers opt out explicitly.
- VERIFY: `C:\dev\agent-cleaner`, `npm run typecheck`, focused MCP reload/save regressions, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - rpg_step_compact_default

- Pre-cycle: `C:\dev\agent-cleaner` passed; optional secret scanner remains absent.
- Engine/loop surface: ToolApi `step_action` now defaults to compact RPG context and compact event tuples; full turn observations/events require explicit opt-out flags.
- Loop effect: direct harness/agent turns no longer emit full room/action/state observations or reducer event objects on the hot repeated action path.
- Self-critique: turn stepping is the highest-frequency hidden payload surface; `load_game` direct default remains a follow-up surface.
- Guard: MCP loop regressions pin no-flag compact `step_action`, while full observation/event regressions opt out explicitly.
- VERIFY: `C:\dev\agent-cleaner`, `npm run typecheck`, focused MCP step/action regressions, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - rpg_generated_start_compact_default

- Pre-cycle: `C:\dev\agent-cleaner` passed; optional secret scanner remains absent.
- Engine/loop surface: ToolApi `new_game` now defaults to compact RPG context; generated full start observations require `compact_observation: false`.
- Loop effect: direct generated-RPG starts no longer emit full opening room/action/state observations before compact reads take over.
- Self-critique: generated-start path only; `step_action` and `load_game` direct defaults remain follow-up surfaces.
- Guard: generated RPG/MCP regressions keep full-start readers explicit while pinning the no-flag compact generated start.
- VERIFY: `C:\dev\agent-cleaner`, `npm run typecheck`, focused generated RPG/MCP regressions, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - rpg_start_compact_default

- Pre-cycle: `C:\dev\agent-cleaner` passed; optional secret scanner remains absent.
- Engine/loop surface: ToolApi `start_world_quest` now defaults to compact RPG context; full start observations require `compact_observation: false`.
- Loop effect: direct harness/agent world-quest starts no longer emit the full opening room/action/state observation before compact reads take over.
- Self-critique: world-quest start only; generated `new_game`, `step_action`, and `load_game` direct defaults remain follow-up surfaces.
- Guard: MCP unit/regression tests keep full-start readers explicit while pinning the no-flag compact start.
- VERIFY: `C:\dev\agent-cleaner`, `npm run typecheck`, focused MCP/RPG start regressions, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - rpg_read_compact_default

- Pre-cycle: `C:\dev\agent-cleaner` passed; optional secret scanner remains absent.
- Engine/loop surface: ToolApi `get_observation` now returns compact RPG context by default; full observations require `compact_observation: false`.
- Loop effect: direct harness/agent RPG reads no longer pull the full room/action/state observation when a compact context plus state hash is enough.
- Self-critique: read-path only; start/step/load direct defaults still remain separate follow-up surfaces.
- Guard: MCP unit/regression tests keep full-observation readers explicit while pinning the no-flag compact read.
- VERIFY: `C:\dev\agent-cleaner`, `npm run typecheck`, focused MCP/RPG observation regressions, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - overworld_start_compact_default

- Pre-cycle: `C:\dev\agent-cleaner` passed; optional secret scanner remains absent.
- Engine/loop surface: ToolApi `start_overworld` now defaults to compact overworld context; full start observations require `compact_context: false`.
- Loop effect: direct harness/agent starts no longer pull the full New York observation before switching into compact poll/action loops.
- Self-critique: narrow API-default work, but it closes the start-of-session payload path that blind playtest agents would not flag as an in-game error.
- Guard: focused MCP and overworld snapshot regressions keep full-observation tests explicit while pinning the compact default start.
- VERIFY: `C:\dev\agent-cleaner`, `npm run typecheck`, focused MCP/overworld regressions, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - overworld_read_compact_default

- Pre-cycle: `C:\dev\agent-cleaner` passed; optional secret scanner remains absent.
- Engine/loop surface: ToolApi `get_overworld_session` now returns compact overworld context by default; full observations require `include_observation: true`.
- Loop effect: direct harness/agent overworld reads no longer accidentally pull the full New York view when they only need ids, vitals, route tuples, and hash polling.
- Self-critique: not a content/world-map reduction, but it closes a hidden full-payload path beneath the MCP wrapper.
- Guard: focused MCP and overworld snapshot regressions pin compact default plus explicit full reads.
- VERIFY: `C:\dev\agent-cleaner`, `npm run typecheck`, focused MCP/overworld regressions, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - transcript_source_opt_in

- Pre-cycle: `C:\dev\agent-cleaner` initially failed on README table formatting; Prettier fixed the drift and the cleaner rerun passed.
- Engine/loop surface: `get_transcript` no longer echoes `world_quest_id` / `generated_rpg_seed` by default; callers opt in with `include_source: true`.
- Loop effect: repeated transcript polls keep source identity out of the hot MCP payload while start/save/load still expose source when needed.
- Self-critique: narrow token-efficiency win, but it hits a recurring blind-agent loop call instead of gameplay content.
- Guard: MCP tool and generated-source tests pin default omission plus opt-in source echo; registration tests keep ToolSearch schema budgets strict.
- VERIFY: `C:\dev\agent-cleaner`, `npm run typecheck`, focused MCP/registration regressions, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, and `npm run health` passed after loop-state rotation.
