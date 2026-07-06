# AI Loop State

<!-- historical_cycle_count: 470 -->

This live file is intentionally token-small. Detailed cycle prose before the
2026-06-25 token-efficiency cleanup was removed from the working tree; use Git
history only when deep recovery is truly needed. Keep future entries terse.

### Cycle result - list_world_tuple_default

- Pre-cycle: `C:\dev\agent-cleaner` measure/gates passed through WSL; optional secret scanner remains absent.
- Engine/loop surface: default `list_world` quest rows are now compact `[world_quest_id, title, playable]` tuples; `include_details`/`include_routes` keep object rows for readable graph/debug callers.
- Loop effect: the shipped quest catalog default drops from 1439 to 863 bytes, and AFK target selection decodes the tuple directly instead of pulling object fields.
- Self-critique: this is a catalog-read win rather than a per-turn engine win, but it trims the ordinary target-selection surface blind agents and maintenance loops touch before play starts.
- Guard: focused MCP catalog, assessor, AI-loop, and MCP registration regressions pin tuple defaults, detailed object opt-ins, and the public tool description.
- VERIFY: `C:\dev\agent-cleaner`, focused catalog/assessor/AI-loop/schema regressions, payload probe, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - rpg_compact_prose_caps_v11

- Pre-cycle: `C:\dev\agent-cleaner` measure/gates passed through WSL; optional secret scanner remains absent.
- Engine/loop surface: compact RPG observations now use `v: 11`, trim trailing compact prose whitespace, and cap room/ending prose at 560 chars, dialogue at 420, blocked-exit hints at 240.
- Loop effect: default `get_observation` on the current first shipped quest drops from 1232 to 1073 bytes; `start_world_quest` drops from 1471 to 1131 bytes while full observations remain opt-in.
- Self-critique: this is a direct hot-path shrink, but it still pays prose cost each changed room; unchanged hash polling remains the main repeat-turn savings.
- Guard: focused compact-observation/MCP start tests pin exported caps, versioning, clone behavior, and full-observation opt-out.
- VERIFY: `C:\dev\agent-cleaner`, focused compact-observation/MCP tests, payload probes, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - overworld_route_options_opt_in

- Pre-cycle: `C:\dev\agent-cleaner` measure/gates passed through WSL; optional secret scanner remains absent.
- Engine/loop surface: compact overworld MCP contexts now omit multi-hop `route_options` by default; callers opt in with `include_route_options: true`.
- Loop effect: repeated overworld starts/reads/actions keep immediate `roads` but stop echoing route summaries unless the agent is actively planning routes.
- Self-critique: this trims the overworld loop payload, not world manifest size; route planning remains available through the explicit route tool and opt-in context flag.
- Guard: focused MCP overworld and registration regressions pin default omission, opt-in route arrays, clone safety, and schema-size budget.
- VERIFY: `C:\dev\agent-cleaner`, focused MCP overworld/schema regressions, payload probes, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - start_world_route_context_opt_in

- Pre-cycle: `C:\dev\agent-cleaner` measure/gates passed through WSL; optional secret scanner remains absent.
- Engine/loop surface: `start_world_quest` now omits the extra world/quest route envelope by default; callers opt in with `include_world_context: true`.
- Loop effect: blind starts keep `world_quest_id` plus compact opening context without echoing route arrays already available through `world_path`.
- Self-critique: this trims a start payload, not the hot per-turn path, but the payload probe showed it as the largest remaining ordinary default response after catalog compaction.
- Guard: focused MCP start/catalog regressions pin default omission, explicit route-context opt-in, compact starts, and schema registration.
- VERIFY: `C:\dev\agent-cleaner`, focused MCP start/catalog regressions, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - list_world_compact_default

- Pre-cycle: `C:\dev\agent-cleaner` measure/gates passed through WSL; optional secret scanner remains absent.
- Engine/loop surface: `list_world` default quest rows now omit district/quest/role/connection prose; callers opt in with `include_details: true` or `include_routes: true`.
- Loop effect: blind/AFK catalog reads keep title/playable/id discovery without echoing every quest hook before a target is chosen.
- Self-critique: catalog reads are not as hot as per-turn stepping, but the payload probe showed `list_world` was the largest ordinary default ToolApi response.
- Guard: focused catalog regressions pin compact default rows, details opt-in, route-expanded details, and the smaller default byte ceiling.
- VERIFY: `C:\dev\agent-cleaner`, focused catalog regressions, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - adapt_story_pack_echo_opt_in

- Pre-cycle: `C:\dev\agent-cleaner` measure/gates passed through WSL; optional secret scanner remains absent.
- Engine/loop surface: `adapt_story` now returns compact story/validation proof plus `content_hash` by default; full authored RPG packs require `include_pack: true`.
- Loop effect: authoring loops can verify rounds, beat classifications, report health, and content identity without echoing complete generated quest data.
- Self-critique: authoring is lower-frequency than live play, but its full-pack payload was one of the largest remaining hidden MCP responses.
- Guard: focused MCP authoring and registration regressions pin default omission, opt-in pack echo, RPG-only mode rejection, and schema-size limits.
- VERIFY: `C:\dev\agent-cleaner`, focused MCP authoring/schema regressions, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - patch_pack_echo_opt_in

- Pre-cycle: `C:\dev\agent-cleaner` measure/gates passed through WSL; optional secret scanner remains absent.
- Engine/loop surface: `apply_content_patch` no longer returns the full modified RPG pack by default; callers opt in with `include_pack: true`.
- Loop effect: fix/debug loops can apply deterministic content patches and read validation proof without echoing complete quest content after every candidate patch.
- Self-critique: this is a fix-loop payload, not a live player turn path; the next deeper wins remain authoring payloads and full validation reports.
- Guard: focused MCP patch and registration regressions pin default omission, opt-in full-pack echo, source identity, and schema-size limits.
- VERIFY: `C:\dev\agent-cleaner`, focused MCP patch/schema regressions, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, and `npm run health` passed after loop-state rotation.

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
