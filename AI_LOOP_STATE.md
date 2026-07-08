# AI Loop State

<!-- historical_cycle_count: 496 -->

This live file is intentionally token-small. Detailed cycle prose before the
token-efficiency cleanup (14621c7a) was removed from the working tree; rotation
moves aged entries into the local, gitignored AI_LOOP_STATE_ARCHIVE.md, and Git
history of this file is the source of truth for older detail.

Entry contract (machine-parsed by src/afk/loop_state.ts and src/afk/assessor.ts):

- PREPEND each new entry directly below this intro — the log is NEWEST-FIRST.
- Keep the exact heading form "### Cycle result - slug" (rotation and cycle counting match it at line start).
- Name the world quest(s) blind-played in the entry body — the blind-pass rotation derives attendance from those names.
- The historical_cycle_count marker above is maintained by the rotation and feeds the generated-eval seed window; never hand-edit or remove it.
- Keep entries terse (≤8 lines): the surface changed, the measured effect, the self-critique verdict, and the guard. The invariant gates (agent-cleaner pre-gates where the operator machine has them, the full `npm run health` bar) are assumed on every cycle — record deltas and exceptions, not the standard VERIFY litany.

### Cycle result - tide_mill_mill_house_compact_orientation

- Content surface: tightened `tide_mill` Mill-House base and reactive prose so compact start text opens with north=wheel-room/yard path and east=counting-nook.
- Loop effect: added a compact ToolApi start-view regression that keeps the opening map, objective, gaff/board affordances, and Ives visible under the 360-char cap.
- Blind playtest: `tide_mill` seed 127 reached `ending_saved` at 55/55, clarity 5/5 and enjoyment 4/5; the opening east/counting-nook confusion did not recur.
- Self-critique: compact entry orientation is tighter, but the next stale-state mismatch is repair narration that still says "one fault" when the pawl is the second fixed fault.
- Guard: `npm run validate -- tide_mill`, focused opening compact regression, `npm run health`, and schema-verified blind report `blind-tester/reports/20260708T063559Z_tide_mill_seed127.md` passed.

### Cycle result - tide_mill_wheel_room_compact_orientation

- Content surface: tightened all `tide_mill` Wheel-Room variants so compact prose opens with west=head-race, east=yard/tool-shed, south=mill-floor, and down=staith gate/open state.
- Loop effect: compact ToolApi regression pins the seed-101 Wheel-Room view under the 360-char cap while preserving the held-crank stale-prose regression.
- Blind playtest: `tide_mill` seed 113 reached `ending_saved` at 55/55, clarity 5/5 and enjoyment 4/5; Wheel-Room orientation did not recur.
- Self-critique: compact navigation is better inside the mill core, but the opening Mill-House still needs the same treatment so east=counting-nook is unambiguous.
- Guard: `npm run validate -- tide_mill`, focused compact/crank regressions, `npm run health`, and schema-verified blind report `blind-tester/reports/20260708T061855Z_tide_mill_seed113.md` passed.

### Cycle result - tide_mill_ives_dialogue_flow

- Content surface: added direct Miller Ives follow-up topics so `tide_mill` players can ask race, pawl, and yard advice without a repeated back action after every answer.
- Loop effect: advice remains deliberate and load-bearing; the regression drives all three rewards without `_back` topics and proves one topic does not auto-grant the others.
- Blind playtest: `tide_mill` seed 101 reached `ending_saved` at 55/55, clarity 5/5 and enjoyment 4/5; the Ives backtracking complaint did not recur.
- Self-critique: the conversation now moves at the urgency of the scene, but the slice still needs more compact-view orientation and richer combat texture.
- Guard: `npm run validate -- tide_mill`, focused dialogue regression, `npm run health`, and schema-verified blind report `blind-tester/reports/20260708T060425Z_tide_mill_seed101.md` passed.

### Cycle result - tide_mill_crank_handle_reactive

- Content surface: fixed `tide_mill` Wheel-Room variants so held crank-handle states beat the broader sluice/pawl text and never claim the handle still hangs on its peg.
- Loop effect: added a real-observation regression for the take-crank path plus held-handle `sluice_clear`, `pawl_free`, and both-faults-fixed combinations.
- Blind playtest: `tide_mill` seed 89 reached `ending_saved` at 55/55, clarity 5/5 and enjoyment 4/5; stale crank prose did not recur.
- Self-critique: the slice is cleaner but still not saturated; next lever is the Ives dialogue back-action friction, with flood-hatch temptation wording behind it.
- Guard: `npm run validate -- tide_mill`, focused regression, `npm run health`, and schema-verified blind report `blind-tester/reports/20260708T054924Z_tide_mill_seed89.md` passed.

### Cycle result - tide_mill_benchmark_slice

- Content surface: added `tide_mill` as a New York Waterfront RPG world quest, porting the retired Tide-Mill dependency DAG into the live engine with a required seeded fight, prep-backed seeded skill checks, telegraphed greed/death forks, and a +20 win-only capstone.
- Loop effect: RPG catalog and overworld registry are now 12/12; `tide_mill` validates clean and the auto-discovered ending, score-economy, variant-liveness, combat, and registry suites cover it.
- Blind playtest: `tide_mill` seed 73 reached `ending_saved` at 55/55, clarity 5/5 and enjoyment 4/5, with one S1 finding: Wheel-Room text can still say the crank-handle hangs on its peg after it is held.
- Self-critique: the first slice is structurally sound and readable, but not saturated; next lever is the crank-handle stale-room variant, then replayability/deeper branch pressure.
- Guard: targeted validation/tests, prepared-route MCP smoke, `npm run assess`, `npm run health`, and schema-verified blind report `blind-tester/reports/20260708T053410Z_tide_mill_seed73.md` passed.

### Cycle result - compact_context_version_opt_in

- Pre-cycle: `C:\dev\agent-cleaner` measure/gates passed through WSL; optional secret scanner remains absent, and WSL git-dir warnings still print after the green gate summary.
- Engine/loop surface: default compact RPG observations now omit static `v`; `include_context_version: true` restores `RPG_COMPACT_OBSERVATION_VERSION` (`v: 15`) for audit clients, with separate projection cache keys.
- Loop effect: measured `sunken_barrow` compact `start_world_quest` drops from 510 to 503 bytes and repeated `get_observation` from 459 to 452 bytes; redundant public MCP schema labels were also tightened to keep the blind-playtest ToolSearch source under its 2600-character guard.
- Self-critique: this is a 7-byte fixed envelope trim, not a mechanics improvement; it follows the event-version opt-in pattern and removes repeated static metadata from hot loop contexts.
- Guard: focused compact-observation, generated-RPG start, MCP ToolApi, and server-registration regressions pin default omission, opt-in version tags, compact projection cache separation, and ToolSearch schema budget.
- VERIFY: `C:\dev\agent-cleaner`, focused compact-context/MCP regressions, payload probe, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, `npm run health`, `npm run assess`, broad `prettier --check .`, and `git diff --check` passed after plan update.

### Cycle result - compact_observation_action_cache_skip

- Pre-cycle: `C:\dev\agent-cleaner` measure/gates passed through WSL; optional secret scanner remains absent, and WSL git-dir warnings still print after the green gate summary.
- Engine/loop surface: default compact RPG observations now set `includeAvailableActions: false`, so start/read/load/step contexts that omit `include_actions` no longer enumerate or cache legal actions just to discard ids.
- Loop effect: no MCP JSON byte change; this trims hot-loop CPU/cache work and keeps `legalActionsCache` empty for no-action compact starts, while `include_actions: true` and full observations still populate action rows.
- Self-critique: this is an internal runtime efficiency win, not a player-visible mechanics change; it matters because long blind-agent loops ask for compact observations constantly and legal-action enumeration can be requested separately with state hashes.
- Guard: focused MCP tool, session-cache, view-projection, compact-observation, and server-registration regressions pin no-action cache skipping, action-including cache separation, and unchanged compact response shape.
- VERIFY: `C:\dev\agent-cleaner`, focused MCP cache/projection regressions, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, `npm run health`, `npm run assess`, broad `prettier --check .`, and `git diff --check` passed after loop-state rotation.

### Cycle result - legacy_source_alias_type_cleanup

- Pre-cycle: `C:\dev\agent-cleaner` measure/gates passed through WSL; optional secret scanner remains absent, and WSL git-dir warnings still print after the green gate summary.
- Engine/loop surface: retired `pack_path`, `quest_id`, and `quest_path` selectors no longer appear as `never` fields in live world-source, ToolApi, or RPG lifecycle argument types; runtime rejection paths still reject those keys explicitly.
- Loop effect: no MCP response-byte change this cycle; this is context/API surface cleanup so maintainers and agent code inspection see the single RPG source contract (`world_quest_id` or generated seed) instead of compatibility ghosts.
- Self-critique: this is not a payload optimization and will not show up in blind-agent play reports; it is useful because it removes misleading typed affordances at engine and tool boundaries while keeping boundary errors honest.
- Guard: focused world-source, MCP ToolApi, validation-bar, and server-registration regressions pin alias rejection plus the absence of retired alias declarations from public argument type blocks.
- VERIFY: `C:\dev\agent-cleaner`, focused source/MCP/schema regressions, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, `npm run health`, `npm run assess`, broad `prettier --check .`, and `git diff --check` passed after loop-state rotation.

### Cycle result - compact_event_version_opt_in

- Pre-cycle: `C:\dev\agent-cleaner` measure/gates passed through WSL; optional secret scanner remains absent, and WSL git-dir warnings still print after the green gate summary.
- Engine/loop surface: compact RPG step/transcript event rows still use stable `event_v: 6`, but default responses no longer repeat the static top-level `event_v`; `include_event_version: true` restores it.
- Loop effect: measured `breaking_weir` `step_action(read_flood_book)` drops from 1465 to 1453 bytes, `sunken_barrow` movement from 676 to 664, and an illegal-action compact rejection from 943 to 931.
- Self-critique: this is a very small fixed envelope trim, not a gameplay or persistence upgrade; it is aligned because the version tag is static metadata and remains available when an audit client needs to branch on event-row schema.
- Guard: focused compact-event, MCP ToolApi, internal-event hiding, and server-registration regressions pin default omission, opt-in version tags, transcript compatibility, and ToolSearch schema budget.
- VERIFY: `C:\dev\agent-cleaner`, focused compact-event/MCP regressions, payload probe, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, `npm run health`, and `npm run assess` passed after loop-state rotation.

### Cycle result - transcript_session_id_opt_in

- Pre-cycle: `C:\dev\agent-cleaner` measure/gates passed through WSL; optional secret scanner remains absent, and WSL git-dir warnings still print after the green gate summary.
- Engine/loop surface: `get_transcript` now omits the echoed `session_id` by default, while `include_session_id: true` restores it; unchanged transcript polls already stayed hash-only.
- Loop effect: measured `breaking_weir` default transcript summary drops from 166 to 148 bytes and compact-turn transcript drops from 215 to 197 bytes; opt-in session-id audit reads preserve the 166-byte default-summary envelope.
- Self-critique: this is a small fixed envelope trim, not a mechanics upgrade; it is still aligned because every transcript read already requires the caller-owned RPG session handle.
- Guard: focused transcript, session, MCP ToolApi, and server-registration regressions pin default omission, session-id opt-in, source-id opt-in independence, unchanged transcript responses, and ToolSearch schema coverage.
- VERIFY: `C:\dev\agent-cleaner`, focused transcript/MCP regressions, payload probe, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, `npm run health`, and `npm run assess` passed after loop-state rotation.

### Cycle result - overworld_read_session_id_opt_in

- Pre-cycle: `C:\dev\agent-cleaner` measure/gates passed through WSL; optional secret scanner remains absent, and WSL git-dir warnings still print after the green gate summary.
- Engine/loop surface: compact overworld read/context responses now omit the echoed `session_id` by default, while `include_session_id: true` restores it; full observation reads still include the session id.
- Loop effect: measured repeated `get_overworld_session_context` and default `get_overworld_session` reads drop from 772 to 754 bytes; `include_session_id: true` preserves the 772-byte envelope.
- Self-critique: this is a small hot-read envelope trim, not a mechanics upgrade; it is still aligned because the caller already carries the session handle on every repeated read.
- Guard: focused MCP overworld and server-registration regressions pin default omission, session-id opt-in, unchanged hash-only responses, and ToolSearch schema budget.
- VERIFY: `C:\dev\agent-cleaner`, focused MCP regressions, payload probe, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, `npm run health`, and `npm run assess` passed after loop-state rotation.

### Cycle result - overworld_world_name_opt_in

- Pre-cycle: `C:\dev\agent-cleaner` measure/gates passed through WSL; optional secret scanner remains absent, and WSL git-dir warnings still print after the green gate summary.
- Engine/loop surface: MCP compact overworld projections now omit repeated `context.world` by default, while `include_world_name: true` restores the world label; underlying UI/engine compact views still carry the name.
- Loop effect: measured `start_overworld` drops from 797 to 762 bytes, repeated `get_overworld_session_context` from 807 to 772, route planning from 873 to 838, and travel from 1224 to 1189; opt-in world-name reads remain 807 bytes.
- Self-critique: this is a small repeated-envelope win rather than a mechanic upgrade, but it removes static metadata from the hot overworld loop without hiding current town, area, or region.
- Guard: focused MCP overworld and server-registration regressions pin default omission, world-name opt-in, clone safety, and ToolSearch schema budget.
- VERIFY: `C:\dev\agent-cleaner`, focused MCP regressions, payload probe, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, `npm run health`, and `npm run assess` passed after loop-state rotation.

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
