# AI Loop State

<!-- historical_cycle_count: 484 -->

This live file is intentionally token-small. Detailed cycle prose before the
2026-06-25 token-efficiency cleanup was removed from the working tree; use Git
history only when deep recovery is truly needed. Keep future entries terse.

### Cycle result - compact_world_path_rows

- Pre-cycle: `C:\dev\agent-cleaner` measure/gates passed through WSL; optional secret scanner remains absent, and WSL git-dir warnings still print after the green gate summary.
- Engine/loop surface: `world_path` now defaults to `path_v: 1` compact rows `[id, name, kind, coord, route_from_previous, distance_from_previous]`, while `compact_path: false` preserves the previous full `world` plus `path_from_hub` object response.
- Loop effect: measured `sunken_barrow` route lookup drops from 569 to 265 bytes; full opt-out remains 569 bytes for debug callers.
- Self-critique: this trims setup/navigation planning rather than per-turn play, but it removes repeated route-object field names without hiding the useful map facts agents need.
- Guard: focused MCP ToolApi and server-registration regressions pin compact defaults, full-path opt-out, coordinate lookup rows, and ToolSearch schema budget.
- VERIFY: `C:\dev\agent-cleaner`, focused MCP regressions, payload probe, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, `npm run health`, and `npm run assess` passed after loop-state rotation.

### Cycle result - save_content_hash_opt_in

- Pre-cycle: `C:\dev\agent-cleaner` measure/gates passed through WSL; optional secret scanner remains absent, and WSL git-dir warnings still print after the green gate summary.
- Engine/loop surface: `save_game` now omits duplicate public `content_hash` by default because the save blob already embeds the full content hash that `load_game` verifies; callers can request `include_content_hash: true` for explicit audit reads.
- Loop effect: default checkpoint response drops from 617 to 535 bytes on the measured `breaking_weir` save, while `include_content_hash: true` preserves the old 617-byte envelope; `include_source: true` still omits the duplicate hash unless explicitly requested.
- Self-critique: this trims checkpoint payloads, not per-turn stepping; the save blob still dominates response size, but removing the repeated hash is a clean response-envelope reduction without weakening persistence integrity.
- Guard: focused MCP save/load and server-registration regressions pin default omission, opt-in full hash echo, save-embedded hash verification, stale-save rejection behavior, and compact reload compatibility.
- VERIFY: `C:\dev\agent-cleaner`, focused MCP regressions, payload probe, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, `npm run health`, and `npm run assess` passed.

### Cycle result - compact_session_id_tokens

- Pre-cycle: `C:\dev\agent-cleaner` measure/gates passed through WSL; optional secret scanner remains absent, and WSL git-dir warnings still print after the green gate summary.
- Engine/loop surface: RPG MCP sessions now allocate `r<N>` ids and overworld MCP sessions allocate `o<N>` ids, preserving deterministic monotonic BigInt counters, LRU lookup behavior, and bridge semantics while removing long textual prefixes from public loop handles.
- Loop effect: `breaking_weir` `start_world_quest` drops from 689 to 685 bytes, transcript summary from 182 to 178, `load_game` from 794 to 790, `start_overworld` from 803 to 797, repeated overworld reads from 813 to 807, route planning from 879 to 873, and travel from 1230 to 1224; follow-up tool calls also send shorter session ids.
- Self-critique: this is a small fixed handle-size win, not a mechanics improvement; it is still worth taking because every long-running loop carries the session id through nearly every tool call.
- Guard: focused RPG session, overworld session, transcript projection, MCP ToolApi, and server-registration regressions pin compact ids, safe-integer-boundary monotonicity, eviction behavior, and bridge response identity.
- VERIFY: `C:\dev\agent-cleaner`, focused session/MCP regressions, payload probe, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, `npm run health`, and `npm run assess` passed.

### Cycle result - rpg_public_transcript_hash_tokens

- Pre-cycle: `C:\dev\agent-cleaner` measure/gates passed through WSL; optional secret scanner remains absent, and WSL git-dir warnings still print after the green gate summary.
- Engine/loop surface: public RPG MCP/ToolApi `transcript_hash` values are now compact 24-hex tokens, while transcript freshness still derives from the full internal transcript hash over the cached log hash plus full RPG state hash; stale guards accept compact or full transcript hashes.
- Loop effect: post-run transcript summary drops from 262 to 222 bytes, full transcript from 1227 to 1187, compact-turn transcript from 441 to 401, and unchanged transcript polls from 143 to 103.
- Self-critique: this is another fixed 40-byte response-envelope win rather than a world-structure or loop-strategy change; it closes the obvious public hash overhead left after RPG state and overworld snapshot compaction.
- Guard: focused MCP regressions pin 24-hex public transcript tokens, public-to-full derivation, and compact/full `if_transcript_hash` compatibility without weakening internal transcript hashing.
- VERIFY: `C:\dev\agent-cleaner`, focused MCP/session regressions, payload probe, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run health`, and `npm run assess` passed.

### Cycle result - overworld_public_snapshot_hash_tokens

- Pre-cycle: `C:\dev\agent-cleaner` measure/gates passed through WSL; optional secret scanner remains absent, and WSL git-dir warnings still print after the green gate summary.
- Engine/loop surface: public overworld MCP/ToolApi `snapshot_hash` values are now compact 24-hex tokens, while internal cached snapshot hashes and exported snapshot integrity keep full SHA-256; stale guards accept compact or full hashes.
- Loop effect: default `start_overworld` drops from 843 to 803 bytes, repeated `get_overworld_session_context` from 853 to 813, default `get_overworld_session` to 813, `plan_overworld_session_route` to 879, `travel_overworld_session` to 1230, and stale travel rejection to 139.
- Self-critique: this is another fixed 40-byte response-envelope win rather than a world-structure change; transcript hashes and other integrity digests remain full-length follow-up surfaces.
- Guard: focused overworld/MCP regressions pin 24-hex public snapshot tokens, public-to-full derivation, and compact/full stale-guard compatibility without weakening internal snapshot hashing or exported snapshot payloads.
- VERIFY: `C:\dev\agent-cleaner`, focused overworld/MCP regressions, payload probe, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run health`, and `npm run assess` passed; post-rotation `npm run verify:integrity`, `npm run format:check`, broad `prettier --check .`, and `git diff --check` also passed.

### Cycle result - rpg_public_state_hash_tokens

- Pre-cycle: `C:\dev\agent-cleaner` measure/gates passed through WSL; optional secret scanner remains absent, and WSL git-dir warnings still print after the green gate summary.
- Engine/loop surface: public RPG MCP/ToolApi `state_hash` values are now compact 24-hex tokens, while internal session hashes, save content hashes, and transcript hashing keep full SHA-256; stale guards accept compact or full hashes.
- Loop effect: `breaking_weir` default `start_world_quest` drops from 729 to 689 bytes, `get_observation` from 674 to 634, `list_legal_actions` from 255 to 215, `step_action(go_north)` from 845 to 805, and `step_action(read_flood_book)` from 1505 to 1465.
- Self-critique: this is a fixed 40-byte win on every stateful RPG response rather than a gameplay-content improvement; overworld `snapshot_hash` and transcript hashes remain full-length follow-up surfaces.
- Guard: focused MCP lifecycle/session/bridge regressions pin 24-hex public state tokens, public-to-full derivation, and compact/full stale-guard compatibility without weakening internal state hashing.
- VERIFY: `C:\dev\agent-cleaner`, focused MCP regressions, payload probe, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run health`, and `npm run assess` passed; post-rotation `npm run verify:integrity`, `npm run format:check`, broad `prettier --check .`, and `git diff --check` also passed.

### Cycle result - compact_visible_refs_id_only_v15

- Pre-cycle: `C:\dev\agent-cleaner` measure/gates passed through WSL; optional secret scanner remains absent, and WSL git-dir warnings still print after the green gate summary.
- Engine/loop surface: compact RPG observations are now `v: 15`; visible `objects` and `npcs` are ID arrays, and `enemies` are `[id, hp]` tuples while full observations remain the label-rich debug surface.
- Loop effect: `breaking_weir` default `start_world_quest` drops from 801 to 729 bytes, `get_observation` from 746 to 674, `step_action(go_north)` from 866 to 845, and `step_action(read_flood_book)` from 1577 to 1505.
- Self-critique: this trims repeated loop context without touching gameplay state, but agents now rely on prose/action ids or full observations when they need display labels.
- Guard: compact-observation, MCP ToolApi, schema-budget, cache-clone, and play-harness regressions pin `v: 15`, ID-only visible refs, `[id,hp]` enemies, mutation-safe cached clones, and measured response budgets.
- VERIFY: `C:\dev\agent-cleaner`, focused compact-observation/MCP/schema/cache regressions, payload probe, `npm run health`, and `npm run assess` passed; post-rotation `npm run verify:integrity`, `npm run format:check`, broad `prettier --check .`, and `git diff --check` also passed.

### Cycle result - compact_observation_prose_caps_v14

- Pre-cycle: `C:\dev\agent-cleaner` measure/gates passed through WSL; optional secret scanner remains absent, and WSL git-dir warnings still print after the green gate summary.
- Engine/loop surface: compact RPG observations are now `v: 14`, cap room/ending prose at 360 chars, and compact start/load openings omit the full world-intro paragraph unless a ToolApi caller requests `include_world_intro`.
- Loop effect: `breaking_weir` default `start_world_quest` drops from 863 to 801 bytes, `get_observation` from 806 to 746, `step_action(go_north)` from 926 to 866, and `step_action(read_flood_book)` from 1637 to 1577.
- Self-critique: this is a straightforward hot-path prose-cap reduction; it preserves full observations for debug reads, but the remaining 66-byte state hash and response envelope are still visible overhead.
- Guard: compact-observation, MCP ToolApi, schema-budget, and session-cache regressions pin `v: 14`, named cap constants, compact intro omission, full-observation intro preservation, and measured response budgets.
- VERIFY: `C:\dev\agent-cleaner`, focused compact-observation/MCP/schema/cache regressions, payload probe, `npm run health`, and `npm run assess` passed; post-rotation `npm run verify:integrity`, `npm run format:check`, broad `prettier --check .`, and `git diff --check` also passed.

### Cycle result - list_world_titles_opt_in

- Pre-cycle: `C:\dev\agent-cleaner` measure/gates passed through WSL; optional secret scanner remains absent, and the same WSL git-dir warnings print after the green gate summary.
- Engine/loop surface: default `list_world` quest rows are now `[world_quest_id, playable]`; `include_titles: true` restores `[world_quest_id, title, playable]`, while details/routes keep titled object rows.
- Loop effect: default `list_world` drops from 863 to 517 bytes, with titled opt-in preserving the old 863-byte catalog response.
- Self-critique: this trims target-selection and catalog discovery reads, not per-turn stepping; state-hash/envelope overhead and detailed graph reads remain separate follow-up surfaces.
- Guard: catalog, AI-loop, assessor, and server-registration regressions pin tuple shape, title opt-in, playable-index consumers, and schema budget.
- VERIFY: `C:\dev\agent-cleaner`, focused catalog/assessor/schema regressions, payload probe, `npm run health`, and `npm run assess` passed; post-rotation `npm run verify:integrity`, `npm run format:check`, broad `prettier --check .`, and `git diff --check` also passed.

### Cycle result - compact_observation_prose_caps_v13

- Pre-cycle: `C:\dev\agent-cleaner` measure/gates passed through WSL; optional secret scanner remains absent, and the same WSL git-dir warnings print after the green gate summary.
- Engine/loop surface: compact RPG observations are now `v: 13` and cap room/ending prose at 420 chars, dialogue at 280, and blocked-exit hints at 180 while preserving full observations behind `compact_observation: false`.
- Loop effect: `breaking_weir` default `start_world_quest` drops from 1005 to 863 bytes, `get_observation` from 916 to 808, `step_action(read_flood_book)` from 1759 to 1651, and `step_action(talk_pell)` from 1576 to 1438.
- Self-critique: this directly trims the post-step context surface agents see every turn, but it is still a prose-cap win rather than a structural reduction in the remaining state-hash/envelope overhead.
- Guard: compact-observation and MCP ToolApi regressions pin `v: 13`, named cap constants, prose-heavy start under 900 bytes, and prose-heavy talk step under 1450.
- VERIFY: `C:\dev\agent-cleaner`, focused compact-observation/MCP regressions, payload probe, `npm run health`, and `npm run assess` passed after loop-state rotation; post-rotation `npm run verify:integrity`, `npm run format:check`, broad `prettier --check .`, and `git diff --check` also passed.

### Cycle result - compact_event_prose_caps_v6

- Pre-cycle: `C:\dev\agent-cleaner` measure/gates passed through WSL; optional secret scanner remains absent, and WSL git-dir warnings still print after the green gate summary.
- Engine/loop surface: compact RPG step/transcript events are now `event_v: 6` and cap transient narration at 280 chars, journal text at 220, and rejection/diagnostic text at 180.
- Loop effect: prose-heavy default `step_action(read_flood_book)` drops from 2077 to 1759 bytes and `step_action(talk_pell)` drops from 1637 to 1576 bytes; movement steps remain unchanged at 969.
- Self-critique: this trims per-action transient prose without changing reducer events, observation context, or full debug reads; callers still use `compact_events: false` for uncapped event objects.
- Guard: compact-event unit tests and MCP ToolApi regressions pin `event_v: 6`, named cap constants, default prose-step response under 1800 bytes, and compact-vs-full event savings.
- VERIFY: `C:\dev\agent-cleaner`, focused compact-event/MCP regressions, payload probe, `npm run health`, and `npm run assess` passed after loop-state rotation; post-rotation `npm run verify:integrity`, `npm run format:check`, broad `prettier --check .`, and `git diff --check` also passed.

### Cycle result - overworld_ids_opt_in_context

- Pre-cycle: `C:\dev\agent-cleaner` initially caught docs/CURRENT_PLAN.md broad-Prettier drift; after the doc wording fix, measure/gates passed through WSL; optional secret scanner remains absent.
- Engine/loop surface: compact overworld MCP contexts keep exact `id_counts` by default but omit global id buckets unless `include_ids: true`; route opt-in remains independent.
- Loop effect: default `start_overworld` drops from 1041 to 843 bytes and repeated `get_overworld_session_context` drops from 1051 to 853 bytes, while `include_ids` preserves the old 1041/1051-byte debug/recovery shape.
- Self-critique: this trims repeated overworld loop context without changing session/snapshot semantics; callers that inspect global discovery ids now need the explicit opt-in.
- Guard: focused MCP overworld and server-registration regressions pin default id omission, `include_ids` clone safety, discovery-id cache invalidation, and schema budget.
- VERIFY: `C:\dev\agent-cleaner`, focused MCP overworld/schema regressions, payload probe, `npm run assess`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, and `npm run health` passed after loop-state rotation; post-rotation `npm run verify:integrity`, `npm run format:check`, broad `prettier --check .`, and `git diff --check` also passed.

### Cycle result - rpg_actions_opt_in_context_v12

- Pre-cycle: `C:\dev\agent-cleaner` measure/gates passed through WSL; optional secret scanner remains absent.
- Engine/loop surface: compact RPG observations are now `v: 12` and omit action ids by default; `include_actions: true` preserves the bundled-id escape hatch, including overworld quest handoff.
- Loop effect: `breaking_weir` default `get_observation` is 914 bytes vs 1088 with bundled actions, and default `start_world_quest` is 1003 vs 1177; `list_legal_actions` remains the state-bound 255-byte action menu.
- Self-critique: this trims the hot observe/start/step context surface, but live players still pay a separate menu read when they need choices; the win is clearest on observation polling, stale-step refresh, and state-bound action-menu reuse.
- Guard: focused compact-observation, MCP loop, server-registration, blind-smoke, and docs-coherence regressions pin default omission, opt-in action ids, cache clone separation, schema budget, and the blind agent loop contract.
- VERIFY: `C:\dev\agent-cleaner`, focused regressions, payload probe, `node blind-tester/smoke.mjs --quest breaking_weir --seed 7`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, and `npm run health` passed; post-rotation `npm run verify:integrity`, `npm run format:check`, and `git diff --check` also passed.

### Cycle result - overworld_destination_roads_v10

- Pre-cycle: `C:\dev\agent-cleaner` measure/gates passed through WSL; optional secret scanner remains absent.
- Engine/loop surface: compact overworld context is now `v: 10`; immediate road tuples are `[destination_town_id, minutes, supplies, fatigue]` and MCP travel accepts `destination_town_id` while preserving full `road_id`.
- Loop effect: default `start_overworld` drops from 1256 to 1041 bytes and repeated `get_overworld_session_context` drops from 1266 to 1051 bytes by removing repeated manifest road ids from the ordinary movement menu.
- Self-critique: this trims the hot overworld loop surface and keeps the command directly actionable, but route-option opt-ins and travel logs still carry full road ids for debug/replay integrity.
- Guard: focused overworld MCP, UI compact-view, server-registration, and snapshot-integrity regressions pin tuple shape, destination travel, compatibility `road_id` travel, and schema budget.
- VERIFY: `C:\dev\agent-cleaner`, focused overworld/schema regressions, payload probe, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - list_world_tuple_default

- Pre-cycle: `C:\dev\agent-cleaner` measure/gates passed through WSL; optional secret scanner remains absent.
- Engine/loop surface: default `list_world` quest rows are now compact `[world_quest_id, title, playable]` tuples; `include_details`/`include_routes` keep object rows for readable graph/debug callers.
- Loop effect: the shipped quest catalog default drops from 1439 to 863 bytes, and AFK target selection decodes the tuple directly instead of pulling object fields.
- Self-critique: this is a catalog-read win rather than a per-turn engine win, but it trims the ordinary target-selection surface blind agents and maintenance loops touch before play starts.
- Guard: focused MCP catalog, assessor, AI-loop, and MCP registration regressions pin tuple defaults, detailed object opt-ins, and the public tool description.
- VERIFY: `C:\dev\agent-cleaner`, focused catalog/assessor/AI-loop/schema regressions, payload probe, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, and `npm run health` passed after loop-state rotation.
