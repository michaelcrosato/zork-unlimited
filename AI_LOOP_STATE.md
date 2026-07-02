# AI Loop State

<!-- historical_cycle_count: 75 -->

This live file is intentionally token-small. Detailed cycle prose before the
2026-06-25 token-efficiency cleanup was removed from the working tree; use Git
history only when deep recovery is truly needed. Keep future entries terse.

### Cycle result — retire_get_scene_alias

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/API surface: removed the legacy `get_scene` alias from ToolApi and public MCP registration.
- Loop effect: RPG reads now have one observation contract: `get_observation(session_id, if_state_hash?, compact_observation?)`.
- Evidence: live MCP registration and ToolApi key checks no longer expose `get_scene`; `get_observation` still carries compact defaults and hash-only unchanged responses.
- Guard: MCP registration stays exact against ToolApi handlers, and unit coverage asserts the alias is absent.
- VERIFY: focused MCP registration/tools tests, typecheck, `npm run health`, `npm run validate`, and `npm test` passed: integrity, lint, format check, 193 test files / 1362 tests, and validate.

### Cycle result — retire_choose_option_alias

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/API surface: removed the legacy `choose_option` alias from ToolApi and public MCP registration.
- Loop effect: RPG play now has one action execution contract: `step_action(session_id, action_id, expected_state_hash?)`.
- Evidence: live MCP registration and ToolApi key checks no longer expose `choose_option`; `step_action` still carries compact defaults and stale-hash rejection.
- Guard: MCP registration stays exact against ToolApi handlers, and unit coverage asserts the alias is absent.
- VERIFY: focused MCP registration/tools tests, typecheck, `npm run health`, `npm run validate`, and `npm test` passed: integrity, lint, format check, 193 test files / 1362 tests, and validate.

### Cycle result — legal_actions_if_state_hash

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: RPG `list_legal_actions` now accepts `if_state_hash`.
- Loop effect: polling/resume loops can get a hash-only `unchanged` response instead of repeating compact action menus when reducer state has not changed.
- Evidence: live MCP unchanged action menu returned hash-only at 120 chars; stale menu read returned compact actions at 232 chars matching the post-step hash.
- Guard: MCP regression asserts matching hashes return no action payload, while stale hashes still return compact actions.
- VERIFY: focused MCP and registration tests, typecheck, live MCP adapter check, `npm run health`, `npm run validate`, and `npm test` passed: integrity, lint, format check, 193 test files / 1362 tests, and validate.

### Cycle result — overworld_if_snapshot_hash

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: overworld `get_overworld_session` and `get_overworld_session_context` now accept `if_snapshot_hash`.
- Loop effect: polling/resume loops can get a hash-only `unchanged` response instead of repeating compact/full overworld context when the snapshot has not changed.
- Evidence: live MCP unchanged compact/full reads returned hash-only at 125 chars; stale reads returned compact/full payloads at 2466/70771 chars matching the post-travel hash.
- Guard: MCP regression asserts matching hashes return no context/observation payload, while stale hashes still return compact/full context.
- VERIFY: focused MCP and registration tests, typecheck, live MCP adapter check, `npm run health`, `npm run validate`, and `npm test` passed: integrity, lint, format check, 193 test files / 1362 tests, and validate.

### Cycle result — observation_if_state_hash

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: RPG `get_observation` hash-only reads landed.
- Loop effect: polling/resume loops can get a hash-only `unchanged` response instead of repeating compact/full observation context when reducer state has not changed.
- Evidence: live MCP unchanged observation matched the supplied hash at 120 chars with no context; stale hash returned compact context at 878 chars matching the post-step hash.
- Guard: MCP regression asserts matching hashes return no context/observation payload, while stale hashes still return compact context.
- VERIFY: focused MCP and registration tests, typecheck, live MCP adapter check, `npm run health`, `npm run validate`, and `npm test` passed: integrity, lint, format check, 193 test files / 1362 tests, and validate.

### Cycle result — checkpoint_expected_hash

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/persistence surface: RPG `save_game` accepts `expected_state_hash`, and overworld `export_overworld_session` accepts `expected_snapshot_hash`.
- Loop effect: checkpoint loops can reject stale save/export requests before serializing save or snapshot blobs.
- Evidence: live MCP stale save/export guards returned current hashes and omitted blobs at 315/308 chars; matching guards serialized at 761/1252 chars.
- Guard: MCP regression asserts stale checkpoint guards return current hashes, omit save/snapshot payloads, and matching hashes still serialize.
- VERIFY: focused MCP and registration tests, typecheck, live MCP adapter check, `npm run health`, `npm run validate`, and `npm test` passed: integrity, lint, format check, 193 test files / 1362 tests, and validate.

### Cycle result — transcript_state_hash

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: RPG `get_transcript` responses now return `state_hash`.
- Loop effect: compact end-of-run audits can bind transcript summaries/turn rows to reducer state without a follow-up state read.
- Evidence: live MCP default compact transcript and compact-turn transcript both matched the post-step hash; compact transcript was 346 chars and compact-turn transcript was 584 chars.
- Guard: transcript regression asserts full, summary-only, and compact transcript responses carry the same current hash.
- VERIFY: focused MCP transcript test, typecheck, live MCP adapter check, `npm run health`, `npm run validate`, and `npm test` passed: integrity, lint, format check, 193 test files / 1361 tests, and validate.

### Cycle result — overworld_expected_snapshot_hash

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: stateful overworld action tools now accept `expected_snapshot_hash`.
- Loop effect: compact agents can reject stale route/local-action/quest menus before mutating overworld session state.
- Evidence: live MCP accepted a matching travel hash, rejected the stale repeat, returned the current hash, preserved travel-log rows, and kept the stale response to 2656 chars.
- Guard: compact overworld regression asserts matching hashes travel, stale hashes reject, current hash is returned, and travel log stays unchanged.
- VERIFY: focused MCP and registration tests, typecheck, live MCP adapter check, `npm run health`, `npm run validate`, and `npm test` passed: integrity, lint, format check, 193 test files / 1361 tests, and validate.

### Cycle result — step_expected_state_hash

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: RPG `step_action` stale-hash guards landed.
- Loop effect: compact agents can reject stale action menus before reducer mutation or transcript writes.
- Evidence: live MCP accepted a matching menu hash, rejected the stale repeat, returned the current hash, preserved transcript length, and kept the stale response to 1090 chars.
- Guard: MCP play-loop regression asserts matching hashes step, stale hashes reject, current hash is returned, and transcript length does not grow.
- VERIFY: focused MCP and registration tests, live MCP adapter check, `npm run health`, `npm run validate`, and `npm test` passed: integrity, typecheck, lint, format check, 193 test files / 1361 tests, and validate.

### Cycle result — legal_actions_state_hash

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: RPG `list_legal_actions` responses now return `state_hash` beside the action menu.
- Loop effect: agents can bind compact action ids to the exact reducer state without an extra observation/state read.
- Evidence: live MCP default action menu returned a matching `state_hash` at 150 chars; after `go_down`, the menu hash matched the step hash and changed at 232 chars.
- Guard: MCP action-payload regression asserts full and compact action menus carry the current hash and update after a step.
- VERIFY: focused MCP action test, typecheck, live MCP adapter check, `npm run health`, `npm run validate`, and `npm test` passed: integrity, lint, format check, 193 test files / 1360 tests, and validate.

### Cycle result — overworld_loop_snapshot_hash

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/persistence surface: overworld start/read/context/action/quest-start responses now return `snapshot_hash`.
- Loop effect: agents can detect overworld state changes and bind compact loop turns to checkpoint identity without exporting full snapshots every turn.
- Evidence: live MCP start/read/context hashes matched; travel changed the hash and returned a 3140-char compact payload.
- Guard: overworld compact-context test asserts stable read/context hashes and changed action hashes after travel.
- VERIFY: focused MCP loop-hash test, typecheck, live MCP adapter check, `npm run health`, `npm run validate`, and `npm test` passed: integrity, lint, format check, 193 test files / 1360 tests, and validate.

### Cycle result — overworld_snapshot_hash

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/persistence surface: overworld `export_overworld_session` and `restore_overworld_session` now return `snapshot_hash`.
- Loop effect: checkpoint/resume agents can bind exported and restored overworld snapshots without re-exporting or rereading full observations.
- Evidence: live MCP export returned `snapshot_hash` with a 774-char snapshot; full and compact restore returned the same hash.
- Guard: overworld MCP export/restore test asserts exported hash equals snapshot content and full/compact restores preserve it.
- VERIFY: focused MCP export/restore test, live MCP adapter check, `npm run health`, `npm run validate`, and `npm test` passed: integrity, typecheck, lint, format check, 193 test files / 1360 tests, and validate.

### Cycle result — save_game_state_hash

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/persistence surface: `save_game` now returns the current `state_hash` with the serialized save.
- Loop effect: checkpoint/resume agents can bind a save to reducer state without a follow-up `get_observation`/`get_state` call.
- Evidence: live MCP `save_game` returned a 64-char `state_hash`; `load_game` restored to the same hash from that save.
- Guard: save/load unit and referential-integrity regression tests assert saved hash equals the state that reloads.
- VERIFY: focused save/load tests, live MCP adapter check, `npm run health`, `npm run validate`, and `npm test` passed: integrity, typecheck, lint, format check, 193 test files / 1360 tests, and validate.

### Cycle result — mcp_legal_actions_compact_default

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Hidden loop surface: public MCP `list_legal_actions` now returns compact action ids by default; `compact_actions: false` preserves command-label debugging.
- Loop effect: blind/resume agents that call the action-list helper mid-run no longer pay repeated command-label payloads unless labels are explicitly needed.
- Evidence: live MCP `list_legal_actions` default returned ids-only at 70 chars; `compact_actions: false` returned command labels at 129 chars.
- Guard: MCP registration regression pins `defaultCompactActions(a)`, the opt-out label wording, and blind protocol docs require `compact_actions = false` for command text.
- VERIFY: focused MCP/docs regressions, live MCP adapter check, `npm run health`, `npm run validate`, and `npm test` passed: integrity, typecheck, lint, format check, 193 test files / 1360 tests, and validate.

### Cycle result — mcp_overworld_read_compact_default

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Hidden loop surface: public MCP `get_overworld_session` now returns compact context by default; `include_observation: true` preserves full observation debugging.
- Loop effect: agents that choose the obvious read tool no longer pull the full overworld object graph by accident.
- Evidence: live MCP default read returned context at 3578 chars; explicit full observation returned 93888 chars.
- Guard: MCP registration regression pins `compactMcpOverworldSession(a)` and the `include_observation` opt-in.
- VERIFY: focused MCP registration regression, `npm run health`, `npm run validate`, and `npm test` passed: integrity, typecheck, lint, format check, 193 test files / 1360 tests, and validate.

### Cycle result — mcp_state_hash_default

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Hidden loop surface: public MCP `get_state` now returns only `state_hash` by default; `include_state: true` opt-in preserves raw reducer state for debugging.
- Loop effect: integrity/hash checks no longer leak full GameState through MCP unless the caller explicitly asks for it.
- Evidence: live MCP `get_state` default returned hash-only at 86 chars; `include_state: true` returned raw state at 452 chars with matching hash.
- Guard: MCP registration regression pins `compactMcpState(a)` and the `include_state` opt-in.
- VERIFY: focused MCP registration regression, `npm run health`, `npm run validate`, and `npm test` passed: integrity, typecheck, lint, format check, 193 test files / 1360 tests, and validate.

### Cycle result — mcp_transcript_compact_default

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Hidden loop surface: public MCP `get_transcript` now defaults `summary_only: true` and `compact_summary: true`; explicit false flags keep full route/event history available.
- Loop effect: blind/resume agents that forget transcript flags no longer pull full turn/event rows by accident after a play run.
- Evidence: live MCP transcript with no flags returned summary-only at 380 chars; explicit full opt-out returned 4 turn rows at 1767 chars.
- Guard: MCP registration regression pins the compact transcript default and keeps the blind ToolSearch schema budget green.
- VERIFY: focused MCP registration regression, `npm run health`, `npm run validate`, and `npm test` passed: integrity, typecheck, lint, format check, 193 test files / 1359 tests, and validate.

### Cycle result — mcp_rpg_compact_default

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests, with optional secret scanner still absent.
- Engine/loop surface: public MCP RPG start/read/step/load tools now default `compact_observation: true`; explicit `compact_observation: false` keeps full observations.
- Bridge fix: `start_overworld_session_quest` now defaults both overworld and RPG payloads to compact context.
- Loop effect: blind/resume MCP clients no longer need perfect prompt discipline to avoid full RPG observations on repeated play turns.
- Guard: MCP registration regression pins compact defaults while leaving direct ToolApi and `list_legal_actions` full-label escape paths unchanged.
- Evidence: live MCP start/step without compact flags returned context-only payloads (1781/1353 chars); explicit `compact_observation: false` returned full observation.
- VERIFY: focused MCP registration regression, `npm run health`, `npm run validate`, and `npm test` passed: integrity, typecheck, lint, format check, 193 test files / 1358 tests, and validate.

### Cycle result — mcp_overworld_compact_default

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent and WSL worktree path noise remains outside the green gate.
- Token surface: public MCP stateful overworld start/action tools now default `compact_context: true`, while `compact_context: false` still requests full observations.
- Loop effect: MCP agents no longer pay the ~61k JSON full overworld start/action payload by default; direct ToolApi remains full by default for tests/debugging.
- Evidence: measured ToolApi full/compact overworld start at 61233 versus 2010 chars; MCP registration regression guards all stateful overworld action handlers through `defaultCompactOverworld`.
- VERIFY: focused MCP registration regression, `npm run health`, `npm run validate`, and `npm test` passed: integrity, typecheck, lint, format check, 193 test files / 1357 tests, and validate.
- Self-critique: this is an adapter-level default; callers that deliberately request full observations can still spend the larger payload.

### Cycle result — world_catalog_graph_routes_opt_in

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent and WSL worktree path noise remains outside the green gate.
- Token surface: `list_world` now returns a lean RPG quest catalog by default; full graph and all quest routes require `include_graph` / `include_routes`.
- Loop effect: AFK/blind setup can discover `world_quest_id` values without paying for duplicated graph metadata or every route path; `world_path` remains the single-route expansion tool.
- Evidence: default `list_world` measured 6208 JSON chars versus 21180 before; expanded graph+routes measured 15591 without duplicating graph under `world`.
- VERIFY: focused catalog regressions, `npm run health`, `npm run validate`, and `npm test` passed: integrity, typecheck, lint, format check, 193 test files / 1356 tests, and validate.
- Self-critique: this trims catalog setup payloads; repeated gameplay still depends on compact observation/context usage by callers.

### Cycle result — overworld_catalog_notes_opt_in

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent and WSL worktree path noise remains outside the green gate.
- Token surface: `list_overworld` now returns counts/start metadata by default; verbose source/design-rule notes require `include_design_notes: true`.
- Loop effect: overworld discovery/catalog calls avoid paying for authoring prose unless an agent is explicitly auditing world design.
- Evidence: unit coverage pins default `list_overworld` JSON below 1700 chars; measured default is 1055 chars versus 5691 with opt-in notes.
- VERIFY: focused MCP tools test, `npm run health`, `npm run validate`, and `npm test` passed: integrity, typecheck, lint, format check, 193 test files / 1356 tests, and validate.
- Self-critique: this reduces catalog payloads, not the full-session observation size; compact overworld context remains the intended repeated-turn path.

### Cycle result — restore_trace_schema_trimmed

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed repo gates, with only optional secret-scanner absence and WSL worktree path noise outside the green gate.
- Token surface: `world_path`, `load_game`, `replay_trace`, and `inspect_trace` MCP schemas now use terse world-id/trace wording instead of repeating discovery-path prose.
- Loop effect: restore/debug ToolSearch payloads stay small for agents inspecting saves and traces, while handler behavior remains unchanged.
- Evidence: MCP registration regression pins the restore/trace schema block under 1500 source chars and bans the old `list_world().quests[].graph_node` hint.
- VERIFY: focused MCP registration regression, `npm run health`, `npm run validate`, and `npm test` passed: integrity, typecheck, lint, format check, 193 test files / 1356 tests, and validate.
- Self-critique: this trims schema noise only; the next hidden surface remains actual engine/session behavior, not blind-reported content polish.

### Cycle result — root_markdown_prettier_clean

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner Prettier still failed historical/root docs, while ESLint, tsc, and tests passed; WSL worktree path diff still fails.
- Loop surface: the 14 root-wide Markdown Prettier warnings are normalized instead of remaining recurring cleaner noise.
- Loop effect: agent-cleaner output is now down to the WSL/Windows worktree path issue plus missing optional secret scanner, so future cycles spend less context separating real failures from historical doc formatting.
- Evidence: `npx --no-install prettier --check .` passes after formatting the listed docs.
- VERIFY: `npx --no-install prettier --check .`, `npm run health`, `npm run validate`, and `npm test` passed: integrity, typecheck, lint, format check, 193 test files / 1355 tests, and validate.
- Self-critique: this is a maintenance-loop cleanup, not engine behavior; the remaining hidden loop issue is the WSL worktree path mismatch outside normal repo health.

### Cycle result — blind_smoke_lint_gate

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner still fails broad root Prettier/ESLint/git-worktree checks, while its tsc/test portions passed.
- Loop surface: `blind-tester/smoke.mjs` is now covered by repo lint/format scripts with Node ESM globals instead of leaking 20 false `process`/`console` root-wide ESLint errors.
- Loop effect: the no-LLM MCP smoke harness stays inside the normal repo gate, and root-wide cleaner output loses one recurring failure block.
- Evidence: focused lint tooling/blind contract tests passed; `npx --no-install eslint blind-tester/smoke.mjs`; `npx --no-install eslint .`; `prettier --check blind-tester`.
- VERIFY: focused lint/blind tests, `npx --no-install eslint .`, `npm run health`, `npm run validate`, and `npm test` passed: integrity, typecheck, lint, format check, 193 test files / 1355 tests, and validate.
- Self-critique: this removes the cleaner ESLint failure but leaves historical-doc root Prettier and WSL worktree path issues for later cycles.

### Cycle result — verifier_bad_ref_stderr_silenced

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner still fails broad root Prettier/ESLint/git-worktree checks, while its tsc/test portions passed.
- Loop/token surface: the verifier rejection corpus now captures expected `git diff` stderr for the synthetic bad-ref branch instead of leaking a fatal-looking Git line into every full test log.
- Loop effect: green test/health runs are easier for agents to parse and no longer spend context on a known negative-test subprocess failure.
- Evidence: focused verifier rejection test passes on Windows and WSL without emitting the zero-SHA fatal.
- VERIFY: focused verifier rejection test on Windows/WSL, `npm run health`, `npm run validate`, and `npm test` passed: integrity, typecheck, lint, format check, 193 test files / 1353 tests, and validate.
- Self-critique: this cleans verification-loop noise only; the broader cleaner WSL path mismatch and historical-doc formatting failures remain outside this scoped repo-local change.

### Cycle result — blind_tool_schema_trimmed

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner still fails broad root Prettier/ESLint/git-worktree checks, while its tsc/test portions passed.
- Token surface: selected blind MCP tool descriptions for start/observe/actions/step/transcript are shorter and guarded by a source-size regression.
- Loop effect: blind ToolSearch payload for the common play loop stays below the pinned budget without removing compact mode affordances.
- Evidence: focused MCP registration/blind contract tests cover the schema budget and blind harness contract.
- VERIFY: focused MCP/blind tests, `npm run health`, `npm run validate`, and `npm test` passed: integrity, typecheck, lint, format check, 193 test files / 1353 tests, and validate.
- Self-critique: the guard approximates ToolSearch payload from server source, but it pins drift on the exact tools blind agents use every run.

### Cycle result — compact_transcript_summary

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner still fails broad root Prettier/ESLint/git-worktree checks, while its tsc/test portions passed.
- Engine/token surface: `get_transcript` now supports `compact_summary`, capping scenes/inventory/flags to 16 and journal to the 5 most recent entries with `summary.more` omitted counts.
- Loop effect: blind end-of-run audits now request `summary_only: true, compact_summary: true`, so long playtests avoid full summary list growth unless explicitly diagnosing history.
- Evidence: focused MCP/blind-doc tests (61) cover the compact summary cap and blind harness contract.
- VERIFY: `npm run health`, `npm run validate`, and `npm test` passed: integrity, typecheck, lint, format check, 193 test files / 1352 tests, and validate.
- Self-critique: opt-in preserves full transcript summary compatibility; later cycles can consider making compact summaries the default for AFK-owned callers.

### Cycle result — compact_rpg_state_caps

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner still fails broad root Prettier/ESLint/git-worktree checks, while its tsc/test portions passed.
- Engine/token surface: compact RPG MCP observations now cap inventory/flags to 16 entries and journal to the 5 most recent entries, with `more` counts for omitted state.
- Loop effect: repeated blind/AFK turns no longer grow linearly with accumulated RPG state while full observations, saves, and transcripts remain complete.
- Evidence: direct compact observation tests cover truncation, recent-journal retention, core-var filtering, and no-metadata complete lists.
- VERIFY: `npm run health`, `npm run validate`, and `npm test` passed: integrity, typecheck, lint, format check, 193 test files / 1351 tests, and validate.
- Self-critique: this bounds one MCP context payload; future work should audit other unbounded compact fields and transcript summaries.

### Cycle result — blind_rotation_quest_label_parsed

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner still fails broad root Prettier/ESLint/git-worktree checks, while its tsc/test portions passed.
- Loop bug: blind-test attendance now parses current `Blind-playtest quest "<world_quest_id>"` recommendation lines instead of capturing literal `quest`.
- Token/ops effect: rotation stays on real quest ids after the quest-first handoff, avoiding repeated blind passes caused by invisible attendance.
- Evidence: focused assessor/rotation tests (43) cover the current quest-labeled line; `npm run assess` now rotates off `bellfounders_alarm`.
- VERIFY: `npm run assess` and `npm run health` passed: integrity, typecheck, lint, format check, 192 test files / 1349 tests, and validate.
- Self-critique: small but load-bearing loop fix; naming still keeps `packStem` for legacy log/path normalization.

### Cycle result — afk_assessment_quest_handoff

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner still fails broad root Prettier/ESLint/git-worktree checks, while its tsc/test portions passed.
- Loop/token surface: AFK assessment now exposes `rpgQuestCount`/`quests`, prints `Quest health`, and titles blind rotations by `world_quest_id` instead of pack ids.
- Loop prompt: content-fix/new instructions now say quest source/world-graph quest, not pack handoff.
- Evidence: `npm run assess` now recommends `Blind-playtest quest "bellfounders_alarm"`.
- VERIFY: focused AFK/loop tests (53), `npm run assess`, and `npm run health` passed: integrity, typecheck, lint, format check, 192 test files / 1347 tests, and validate.
- Self-critique: useful AI-ops cleanup, but internal YAML pack metadata still exists where validation/loading needs it.

### Cycle result — mcp_pack_validation_aliases_retired

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner still fails broad root Prettier/ESLint/git-worktree checks, while its tsc/test portions passed.
- Public MCP/API: retired `validate_pack` and `load_pack`; `validate_quest` and new `load_quest` are the world-quest validation/loading surface.
- Loop internals: AFK assessment now calls `validate_quest`, keeping maintenance on quest ids.
- Token economy: public agents no longer see duplicate pack/quest validation and loading tools for the same world graph.
- VERIFY: focused MCP validation/loading tests (55), typecheck, lint, format:check, and `npm run health` passed: integrity, typecheck, lint, format check, 192 test files / 1347 tests, and validate.
- Self-critique: removes public pack-named validation/loading; internal source helpers still compile YAML RPG packs by path.

### Cycle result — mcp_list_stories_retired

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner still fails broad root Prettier/ESLint/git-worktree checks, while its tsc/test portions passed.
- Public MCP/API: retired the `list_stories` compatibility catalog; `list_world` is the single quest discovery surface.
- Token economy: blind/AFK agents no longer receive two catalogs for the same RPG quest graph.
- VERIFY: focused MCP catalog/registration tests (55) and `npm run health` passed: integrity, typecheck, lint, format check, 192 test files / 1347 tests, and validate.
- Self-critique: removes one compatibility alias; later cycles retired public `validate_pack`/`load_pack` too.

### Cycle result — validate_cli_world_source_only

- Pre-cycle: ran `C:\dev\agent-cleaner` measure; gates hit timeout after known broad root Prettier/git-worktree issues, so repo-local verification was used.
- CLI/API: `npm run validate` now rejects explicit `--pack` and positional raw paths; shipped validation is canonical world graph / `world_quest_id` only.
- Token economy: loop docs and play CLI no longer teach agents a raw-pack validation path.
- VERIFY: focused validation/play CLI tests (27) and `npm run health` passed: integrity, typecheck, lint, format check, 192 test files / 1347 tests, and validate.
- Self-critique: removes the last public CLI raw-pack source; internal compile/edit paths still carry pack paths as source metadata.

### Cycle result — cli_trace_world_source_only

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner still fails broad root Prettier/ESLint outside canonical package scripts, while its tsc/test portions passed.
- CLI/API: `npm run replay` and `npm run inspect` now reject raw trace `--pack` sources; trace source resolver no longer infers world ids from pack paths.
- Token economy: trace debugging uses embedded/explicit world ids only, avoiding repeated raw pack path payloads.
- VERIFY: focused trace/source/CLI tests (44) and `npm run health` passed: integrity, typecheck, lint, format check, 192 test files / 1347 tests, and validate.
- Self-critique: trace/debug raw-pack seam is closed; validate `--pack` was removed in the next cycle.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — toolapi_trace_world_source_only

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner still fails broad root Prettier/ESLint outside canonical package scripts, while its tsc/test portions passed.
- Public API: ToolApi `replay_trace`/`inspect_trace` now reject raw `pack_path`; shipped traces use embedded or explicit `world_quest_id`.
- Token economy: repeated trace debugging no longer needs raw pack-path payload when traces already carry world identity.
- VERIFY: focused trace/source tests (71) and `npm run health` passed: integrity, typecheck, lint, format check, 192 test files / 1346 tests, and validate.
- Self-critique: public MCP/ToolApi is cleaner; CLI `--pack` compatibility was removed in later CLI cycles.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — overworld_snapshot_regional_arc_completion_proof

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner still fails broad root Prettier/ESLint outside canonical package scripts, while its tsc/test portions passed.
- Engine/persistence: overworld restore now derives regional arc completion from resolved anchor-town events, rejects unearned or missing completed arcs, and checks arc journal timing.
- Token economy: arc completion stays compact as ids/journals; restore derives proof from existing event ids and timestamps instead of storing arc transcripts.
- VERIFY: `npm run health` passed: integrity, typecheck, lint, format check, 192 test files / 1346 tests, and validate.
- Self-critique: closes regional arc state drift; broader exact replay of optional unjournaled local movement remains future work.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — overworld_snapshot_clock_replay

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner still fails broad root Prettier/ESLint outside canonical package scripts, while its tsc/test portions passed.
- Engine/persistence: overworld restore now rejects snapshots whose local journals, travel, services, or final clock occur before deterministic elapsed time could reach them.
- Token economy: compact saves still avoid step transcripts; restore derives minimum clock proof from manifest durations and journal/travel timestamps.
- VERIFY: focused overworld snapshot test (84), typecheck, lint, format:check, validate, npm test (192/1344), `npm run health` EXIT 0.
- Self-critique: closes too-early clock drift while still allowing extra unlogged local movement/wait time.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — overworld_snapshot_resource_replay

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner still fails broad root Prettier/ESLint outside canonical package scripts, while its tsc/test portions passed.
- Engine/persistence: overworld restore now replays travel, road encounter, rest, and resupply resource effects before trusting saved supplies/fatigue or travel-log vitals.
- Token economy: snapshots keep compact numeric vitals without verbose transition transcripts because restore derives the expected resource state from travel/journal chronology.
- VERIFY: focused overworld snapshot test (82), typecheck, lint, format:check, validate, npm test (192/1342), `npm run health` EXIT 0.
- Self-critique: closes travel/resource drift; exact clock replay across unjournaled area movement remains future work.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — overworld_snapshot_local_source_identity_chronology

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner still fails broad root Prettier/ESLint outside canonical package scripts, while its tsc/test portions passed.
- Engine/persistence: overworld restore now rejects job/site journals whose specific source id was not yet in the replayed reveal prefix at that timestamp.
- Token economy: compact source ids remain timestamp-free while restore derives per-entry reveal identity from ordered local journals and manifest source order.
- VERIFY: focused overworld snapshot test (81), typecheck, lint, format:check, validate, npm test (192/1341), `npm run health` EXIT 0.
- Self-critique: closes job/site source identity chronology; quest lead start-state replay remains future work.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — overworld_snapshot_local_source_count_replay

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner still fails broad root Prettier/ESLint outside canonical package scripts, while its tsc/test portions passed.
- Engine/persistence: overworld restore now requires discovered job/site/quest counts to exactly match live local-action reveal replay, rejecting missing earned source ids as well as extras.
- Token economy: compact source id sets remain transcript-free while restore derives exact reveal cardinality from local journal source ids and final discovered-area prefixes.
- VERIFY: focused overworld snapshot test (80), typecheck, lint, format:check, validate, npm test (192/1340), `npm run health` EXIT 0.
- Self-critique: closes source count drift; exact per-timestamp source identity replay beyond prefix/order remains future work.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — overworld_snapshot_area_count_replay

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner still fails broad root Prettier/ESLint outside canonical package scripts, while its tsc/test portions passed.
- Engine/persistence: overworld restore now replays discovered local-area counts from visited towns plus recorded local actions, rejecting both smuggled extra areas and missing earned areas.
- Token economy: compact area id sets remain transcript-free while restore derives exact area reveal cardinality from journal source ids.
- VERIFY: focused overworld snapshot test (77), typecheck, lint, format:check, validate, npm test (192/1337), `npm run health` EXIT 0.
- Self-critique: closes area count drift; exact per-action job/site/quest replay remains future work.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — overworld_snapshot_local_source_count_proof

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner still fails broad root Prettier/ESLint outside canonical package scripts, while its tsc/test portions passed.
- Engine/persistence: overworld restore now requires discovered job/site/quest ids to be backed by enough local journal actions, and discovered sites obey per-area prefix order.
- Token economy: compact discovery ids stay timestamp-free while restore derives minimum reveal proof from local journal counts.
- VERIFY: focused overworld snapshot test (75), typecheck, lint, format:check, validate, npm test (192/1335), `npm run health` EXIT 0.
- Self-critique: closes source count over-discovery; exact per-action multi-source replay remains future work.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — overworld_snapshot_local_source_chronology

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner still fails broad root Prettier/ESLint outside canonical package scripts, while its tsc/test portions passed.
- Engine/persistence: overworld restore now rejects completed job and explored site journals recorded before a prior local action could reveal that job/site.
- Token economy: compact discovered source ids remain timestamp-free, with restore deriving minimum reveal proof from ordered local journals instead of storing verbose reveal transcripts.
- VERIFY: focused overworld snapshot test (72), typecheck, lint, format:check, validate, npm test (192/1332), `npm run health` EXIT 0.
- Self-critique: closes first-step job/site reveal chronology; exact multi-source reveal replay and quest-lead timestamp proof remain future work.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — overworld_snapshot_local_area_chronology

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner still fails broad root Prettier/ESLint outside canonical package scripts, while its tsc/test portions passed.
- Engine/persistence: overworld restore now resolves every local journal kind to its real area and rejects local action journals recorded before enough prior town-local actions could discover that area.
- Token economy: compact snapshots can keep area ids and journal rows without carrying verbose discovery transcripts, because restore now derives the area-unlock proof from ordered journal counts.
- VERIFY: focused overworld snapshot test (70), typecheck, lint, format:check, validate, npm test (192/1330), `npm run health` EXIT 0.
- Self-critique: closes local-area unlock chronology; exact replay of job/site/quest reveal order by timestamp remains future work.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — overworld_snapshot_pending_road_unresolved

- Pre-cycle: ran `C:\dev\agent-cleaner` measurement helper; gate helper timed out here, so canonical package scripts remain authoritative.
- Engine/persistence: overworld restore now rejects snapshots with both a pending road encounter and an existing road journal resolution for that same latest arrival.
- Token economy: compact pending-road saves can stay edge-id-only without trusting contradictory journal proof that live play cannot emit.
- VERIFY: focused overworld snapshot test (69), typecheck, lint, format:check, npm test (192/1329), `npm run health` EXIT 0.
- Self-critique: closes pending-road double-resolution drift; broader local action replay invariants remain future work.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — overworld_snapshot_pending_road_binding

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gate helpers; helper still fails broad root formatting/ESLint outside canonical package scripts.
- Engine/persistence: overworld restore now requires a pending road encounter to match the newest travel-log road, after preserving existing unknown-road diagnostics.
- Token economy: compact pending-road snapshots can keep only `edgeId` without allowing unrelated road events to be attached at restore.
- VERIFY: focused overworld snapshot/MCP/UI tests, typecheck, lint, format:check, validate, npm test, `npm run health` EXIT 0.
- Self-critique: closes pending-road/travel binding; full local action sequencing remains a larger future invariant.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — overworld_snapshot_area_map_exactness

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gate helpers; helper still fails broad root formatting/ESLint outside canonical package scripts.
- Engine/persistence: overworld restore now requires saved local area positions for every visited town with local areas, and requires the current town's saved area to match `currentAreaId`.
- Token economy: compact local position maps can no longer omit visited towns or carry contradictory current-area state that live play cannot emit.
- VERIFY: focused overworld snapshot/MCP/UI tests, typecheck, lint, format:check, validate, npm test, `npm run health` EXIT 0.
- Self-critique: closes saved area-map exactness; full local action sequencing and same-area site-prefix replay remain larger future invariants.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — overworld_snapshot_local_source_prefix

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gate helpers; helper still fails broad root formatting/ESLint outside canonical package scripts.
- Engine/persistence: overworld restore now rejects discovered jobs or quest leads that skip earlier visible sources in a visited town's deterministic reveal order.
- Token economy: compact local source arrays can no longer smuggle later job/quest ids while omitting earlier visible ids.
- VERIFY: focused overworld snapshot/MCP/UI tests, typecheck, lint, format:check, validate, npm test, `npm run health` EXIT 0.
- Self-critique: closes local source prefix exactness for town-level reveals; full local action sequencing and same-area site-prefix replay remain larger future invariants.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — overworld_snapshot_area_discovery_prefix

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gate helpers; helper still fails broad root formatting/ESLint outside canonical package scripts.
- Engine/persistence: overworld restore now requires discovered local areas in every visited town to match the engine's sorted prefix unlock order.
- Token economy: compact local discovery arrays can no longer skip hidden area order while looking locally valid.
- VERIFY: focused overworld snapshot/MCP/UI tests, typecheck, lint, format:check, validate, npm test, `npm run health` EXIT 0.
- Self-critique: closes area-discovery prefix exactness; full local action sequencing remains a larger future invariant.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — overworld_snapshot_discovered_town_frontier

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gate helpers; helper still fails broad root formatting/ESLint outside canonical package scripts.
- Engine/persistence: overworld restore now requires discovered towns to equal visited towns plus immediate road neighbors of every visited town.
- Token economy: compact map state can no longer smuggle arbitrary far towns or omit frontier towns live play would know.
- VERIFY: focused overworld snapshot/MCP/UI tests, typecheck, lint, format:check, validate, npm test, `npm run health` EXIT 0.
- Self-critique: closes discovered-town frontier exactness; area-discovery timing remains a larger future invariant.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — overworld_snapshot_travel_path_replay

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gate helpers; helper still fails broad root formatting/ESLint outside canonical package scripts.
- Engine/persistence: overworld restore now replays travel logs from the start town, rejects non-contiguous road history, and requires replay to end at the saved current town.
- Token economy: compact travel history can be trusted as one route chain instead of arbitrary arrival rows that only look individually valid.
- VERIFY: focused overworld snapshot/MCP/UI tests, typecheck, lint, format:check, validate, npm test, `npm run health` EXIT 0.
- Self-critique: closes town-level path replay; discovered-town frontier exactness and area-discovery timing remain larger future invariants.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — overworld_snapshot_visit_chronology

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gate helpers; helper still fails broad root formatting/ESLint outside canonical package scripts.
- Engine/persistence: overworld restore now requires visited towns to be start or travel-log arrivals, and scout/contact/investigate journals cannot predate first arrival at their source town.
- Token economy: compact map history no longer has to trust forged visited-town ids or impossible local-action timestamps.
- VERIFY: focused overworld snapshot/MCP/UI tests, typecheck, lint, format:check, validate, npm test (192/1316), `npm run health` EXIT 0.
- Self-critique: closes town-level chronology; full road-by-road replay and area-discovery timing remain larger future invariants.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — overworld_snapshot_local_action_reachability

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gate helpers; helper still fails broad root formatting/ESLint outside canonical package scripts.
- Engine/persistence: overworld restore now rejects scout/contact/investigate journal entries whose real source is in an unvisited town or undiscovered local area.
- Token economy: compact local-action history can no longer invent plausible scout/talk/investigate proof from unreachable map state.
- VERIFY: focused overworld snapshot/MCP/UI tests, typecheck, lint, format:check, validate, npm test (192/1312), `npm run health` EXIT 0.
- Self-critique: closes local-action reachability; full chronological replay of every local action remains a larger future invariant.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — overworld_snapshot_journal_place_binding

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gate helpers; helper still fails broad root formatting/ESLint outside canonical package scripts.
- Engine/persistence: overworld restore now rejects journal entries whose real source id is bound to the wrong real town/region, including road arrival towns.
- Token economy: journal provenance is source-local, so compact history cannot smuggle plausible-but-off-map town text.
- VERIFY: focused overworld snapshot/MCP/UI tests, typecheck, lint, format:check, validate, npm test (192/1306), `npm run health` EXIT 0.
- Self-critique: binds journal sources to places; full chronological replay across local action journals remains larger future work.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — overworld_snapshot_event_resolution_proof

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gate helpers; helper still fails broad root formatting/ESLint outside canonical package scripts.
- Engine/persistence: overworld restore now requires resolved events to have local scout, local contact, and investigated-event journal prerequisites at/before resolution.
- Token economy: compact resolved-event ids now imply enough replay proof to avoid trusting forged completion-only checkpoints.
- VERIFY: focused overworld snapshot/MCP/UI tests, typecheck, lint, format:check, validate, npm test (192/1297), `npm run health` EXIT 0.
- Self-critique: proves resolver prerequisites by journal evidence; full chronological replay of every local action remains a larger invariant.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — overworld_snapshot_resolved_event_locality

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gate helpers; helper still fails broad root formatting/ESLint outside canonical package scripts.
- Engine/persistence: overworld restore now rejects resolved local events that point into unvisited towns or undiscovered areas even when journal/renown proof is forged.
- Token economy: compact resolved-event ids are now map-reachable state, not arbitrary manifest ids with matching totals.
- VERIFY: focused overworld snapshot/MCP/UI tests, typecheck, lint, format:check, validate, npm test (192/1293), `npm run health` EXIT 0.
- Self-critique: closes resolved-event map locality; prerequisite-action replay remains a future invariant.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — overworld_snapshot_discovery_locality

- Pre-cycle: ran `C:\dev\agent-cleaner` measurement helper; gate helper timed out here, so canonical package scripts remain authoritative.
- Engine/persistence: overworld restore rejects discovered areas, saved area maps, jobs, sites, and quests that point into unvisited towns or undiscovered areas.
- Token economy: compact discovery arrays can be trusted as reachable map state instead of accepting forged off-route content ids.
- VERIFY: focused overworld snapshot/MCP/UI tests, typecheck, lint, format:check, validate, npm test (192/1291), `npm run health` EXIT 0.
- Self-critique: closes map-locality drift; resolved-event spatial replay remains a future invariant.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — repo_token_efficiency / CONTEXT_BUDGET_CLEANUP

- Compacted `AGENTS.md` and `AI_LOOP_STATE.md`; Git history preserves prior detail.
- Added Cursor/Aider/Continue context ignore files plus `.gitignore` runtime/build patterns.
- Deleted ignored local artifacts: `ui/dist`, Vite logs, stale blind-tester reports.
- Added `historical_cycle_count` support so loop trimming does not reset generator seed windows.
- VERIFY: `npm run health` EXIT 0 after restoring protected `no §14 ceremony` wording.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — ai_loop_quest_id_handoff

- Engine/loop: blind playtest targets now resolve to `world_quest_id` for content_fix and baseline cycles; missing ids fail prompt generation.
- Token economy: `latest-cycle.json` primary `target` is the quest id; `targetPackPath` is metadata only when needed.
- Docs: blind protocol/README now teach `--quest`/`start_world_quest`, not raw `--pack` starts.
- VERIFY: focused ai_loop test, typecheck, lint, format:check, validate, npm test (191/1252), `npm run health` EXIT 0.
- Self-critique: structural loop handoff fix, not content polish; closes an agent-token waste/error source blind testers would only report late.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — public_mcp_world_id_sources

- Pre-cycle: ran `C:\dev\agent-cleaner` measurement helper; canonical repo gates remain package scripts.
- Public MCP: validate/load/patch/replay/inspect no longer advertise raw `pack_path`; shipped sources are `world_quest_id`.
- Compatibility: ToolApi/CLI trace replay/inspect keep raw paths only for offline migration verification, not public agent schemas.
- VERIFY: focused MCP registration test, typecheck, lint, format:check, validate, npm test (191/1253), `npm run health` EXIT 0.
- Self-critique: aligned structural source-surface cut; small but real reduction of agent path confusion/token waste.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — toolapi_world_id_pack_handlers

- Pre-cycle: ran `C:\dev\agent-cleaner` measurement helper; clean branch baseline.
- Engine/API: ToolApi `validate_pack`, `load_pack`, and `apply_content_patch` now reject raw `pack_path`; assessor validates through `world_quest_id`.
- Offline boundary: trace replay/inspect keep raw paths for migration checks; live content handlers are world-id only.
- VERIFY: focused world/MCP/assessor tests, typecheck, lint, format:check, validate, npm test (191/1252), `npm run health` EXIT 0.
- Self-critique: structural source-surface cut, not content polish; moves one more internal layer to single-world addressing.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — live_content_response_world_identity

- Pre-cycle: ran `C:\dev\agent-cleaner` measurement helper; clean branch baseline.
- Engine/API: `validate_pack`, `validate_quest`, `load_pack`, and `apply_content_patch` no longer echo raw `pack_path`; responses carry `world_quest_id`.
- Offline boundary: trace replay/inspect and validation reports may still reference paths for debugging; live content-handler envelopes are world-id only.
- VERIFY: focused MCP/world/assessor tests, typecheck, lint, format:check, validate, npm test, `npm run health` EXIT 0.
- Self-critique: small structural payload cut; useful token/confusion reduction, but session/save envelopes still expose paths for a later cycle.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — live_session_response_world_identity

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + check helpers; check helper exposed pre-existing broad-gate drift outside canonical repo scripts.
- Engine/API: RPG start, transcript, save, and load envelopes no longer echo raw `pack_path`; shipped sessions carry `world_quest_id`, generated sessions carry `generated_rpg_seed`.
- Offline boundary: session internals still keep pack paths for content loading/hash checks; trace replay/inspect remain the raw-path migration/debug surface.
- VERIFY: focused MCP/generated response tests, typecheck, lint, format:check, validate, npm test, `npm run health` EXIT 0.
- Self-critique: meaningful live-token cleanup; overworld quest view models still expose `pack` and should be the next path-surface target.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — overworld_quest_view_identity

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + check helpers; same pre-existing broad-gate drift outside canonical repo scripts.
- Engine/API: overworld quest observations, action discoveries, compact context, and quest-start metadata now use `OverworldQuestView` without raw `pack`.
- Internal boundary: canonical world manifests and source resolvers still keep quest pack paths for loading/hash checks; live view models expose quest ids.
- VERIFY: focused MCP/overworld/world tests, typecheck, lint, format:check, validate, npm test, `npm run health` EXIT 0.
- Self-critique: strong live-token/path cleanup; later cycles removed `list_stories` and raw trace/validation selectors.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — list_world_graph_identity

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gate helpers; same broad helper drift outside canonical repo scripts.
- Engine/API: `list_world` now returns sanitized world/graph quest ids without `pack` or `path` fields.
- Internal boundary: canonical manifests and then-current `list_stories` compatibility still kept raw pack paths; later cycles retired that catalog.
- VERIFY: focused catalog/world tests, typecheck, lint, format:check, validate, npm test, `npm run health` EXIT 0.
- Self-critique: closes the public world-catalog path leak; remaining raw path surfaces are compatibility/offline debug.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — mcp_play_world_id_entry

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gate helpers; same broad helper drift outside canonical repo scripts.
- Loop/tooling: `scripts/mcp_play.ts` now starts MCP play with `start_world_quest` and `world_quest_id`, not `new_game`/`pack_path`.
- Protocol: blind playtest docs point target discovery at `list_world().quests[].world_quest_id`.
- VERIFY: focused blind harness regression, typecheck, lint, format:check, validate, npm test, `npm run health` EXIT 0.
- Self-critique: small but important loop repair; prevents stale MCP harnesses from testing a retired start surface.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — list_stories_world_id_catalog

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gate helpers; same broad helper drift outside canonical repo scripts.
- Public MCP: `list_stories` then returned quest ids/world metadata without `path` or `main_story`; it is now retired.
- Loop internals: AFK path metadata now resolves through `world/source`, not the public story catalog.
- VERIFY: focused catalog/loop/assessor tests, typecheck, lint, format:check, validate, npm test, `npm run health` EXIT 0.
- Self-critique: closes another live path leak; remaining path usage is internal maintenance and offline trace/debug.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — world_path_graph_only_response

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gate helpers; same broad helper drift outside canonical repo scripts.
- Public MCP/API: `world_path` now returns world id/name/hub, quest graph id, and route steps without echoing raw `quest_path`.
- Scope: internal source resolvers still map graph ids to pack files for loading; public route discovery stays graph-only.
- VERIFY: focused MCP/server tests, typecheck, lint, format:check, validate, npm test, `npm run health` EXIT 0.
- Self-critique: targets an engine/loop surface blind agents will not report directly; closes a token/confusion leak in route discovery.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — afk_loop_quest_id_targets

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gate helpers; same broad helper drift outside canonical repo scripts.
- Loop/assessor: world-bound content-fix candidates and `latest-cycle.json` targets are now quest ids; pack paths are edit metadata only.
- Token economy: assessment health output prints quest ids where available, reducing path churn in loop handoffs.
- VERIFY: focused AFK/loop tests, typecheck, lint, format:check, validate, npm test, `npm run health` EXIT 0.
- Self-critique: closes an engine-loop coordination leak blind agents would not report; still leaves offline trace compatibility raw-path capable.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — trace_cli_quest_id_sources

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gate helpers; same broad helper drift outside canonical repo scripts.
- Trace CLIs: replay/inspect now advertise positional trace sources as `world_quest_id` only and reject positional raw pack paths.
- Token/API hygiene: normal replay output no longer echoes the resolved pack file; later CLI cycles removed hidden `--pack` compatibility too.
- VERIFY: focused trace/world tests, typecheck, lint, format:check, validate, npm
  test (191/1253), `npm run health` EXIT 0.
- Self-critique: closes a user-facing debug-loop path leak; source resolver internals still keep path data for integrity checks.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — validate_cli_world_id_targets

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gate helpers; same broad helper drift outside canonical repo scripts.
- CLI/tooling: `npm run validate` now defaults through the canonical world graph and targeted validation accepts `world_quest_id`.
- Token/API hygiene: normal validation output labels quests by id and rejects positional raw pack paths; explicit `--pack` remains offline-only.
- VERIFY: focused validation/world tests, targeted `npm run validate -- sunken_barrow`,
  typecheck, lint, format:check, validate, npm test (191/1255), `npm run health`
  EXIT 0.
- Self-critique: closes another package-era operator surface; source internals still keep pack paths for loading/hash checks.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — inspect_cli_world_id_targets

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gate helpers; same broad helper drift outside canonical repo scripts.
- CLI/tooling: `npm run inspect -- <world_quest_id>` now summarizes shipped quest packs through the canonical world graph.
- Token/API hygiene: positional raw pack inspection is rejected; explicit `--pack` remains offline-only and trace inspect still uses quest ids.
- VERIFY: focused trace/world tests, direct `npm run inspect -- sunken_barrow`,
  typecheck, lint, format:check, validate, npm test (191/1258), `npm run health`
  EXIT 0.
- Self-critique: closes a package-era debug surface; trace/offline internals still keep pack paths for integrity checks.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — author_cli_draft_output_only

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gate helpers; same broad helper drift outside canonical repo scripts.
- CLI/tooling: `npm run author -- --out` now writes draft RPG packs only and rejects direct writes under `content/rpg/pack`.
- Architecture: shipped quest content must go through canonical world graph registration instead of standalone pack drops.
- VERIFY: focused authoring tests, direct shipped-pack rejection smoke, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test`, and `npm run health` all pass.
- Self-critique: closes an authoring/package shortcut; a full registration workflow remains a later engine task.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — overworld_snapshot_history_integrity

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gate helpers; same broad helper drift outside canonical repo scripts.
- Engine/persistence: overworld snapshot restore now rejects duplicate journal ids, future or non-newest-first travel logs, and impossible travel supplies/fatigue.
- Token economy: compact context and exported checkpoints can trust restored history order/counts instead of accepting forged bloat.
- VERIFY: focused overworld snapshot/MCP tests, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test` (192/1264), and `npm run health` all pass.
- Self-critique: strengthens restore integrity for long-running loops; snapshot payload size itself remains a later compression target.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — overworld_snapshot_journal_timeline

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gate helpers; same broad helper drift outside canonical repo scripts.
- Engine/persistence: overworld snapshot restore now parses journal timestamps and rejects malformed, future, or non-newest-first journal history.
- Token economy: restored compact context can trust journal order without accepting forged checkpoint bloat or stale chronology.
- VERIFY: focused overworld snapshot/MCP tests, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test` (192/1267), and `npm run health` all pass.
- Self-critique: closes the journal side of snapshot timeline integrity; export payload compression remains separate.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — overworld_snapshot_journal_world_binding

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gate helpers; same broad helper drift outside canonical repo scripts.
- Engine/persistence: overworld snapshot restore now rejects journal entries whose town does not exist in the loaded world manifest.
- Token economy: restored compact context can trust journal locality without accepting forged off-world history.
- VERIFY: focused overworld snapshot/MCP tests, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test` (192/1268), and `npm run health` all pass.
- Self-critique: narrows another forged checkpoint gap; journal entry ids still encode source type by convention rather than a compact typed schema.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — overworld_snapshot_journal_source_binding

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gate helpers; same broad helper drift outside canonical repo scripts.
- Engine/persistence: overworld snapshot restore now validates journal kind/id prefixes against manifest sources and travel-log road arrivals.
- Token economy: restored compact context can trust journal provenance instead of accepting forged source ids or mismatched action kinds.
- VERIFY: focused overworld snapshot/MCP tests, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test` (192/1271), and `npm run health` all pass.
- Self-critique: source binding is now explicit for restore, but broader progression consistency remains a later engine task.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — overworld_snapshot_progress_journal_binding

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gate helpers; same broad helper drift outside canonical repo scripts.
- Engine/persistence: overworld snapshot restore now requires progress flags and journal proof to agree for visited areas, jobs, sites, event resolutions, and regional arcs.
- Token economy: restored compact progress arrays can be trusted without accepting forged completion flags or orphaned journal proof.
- VERIFY: focused overworld snapshot/MCP tests, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test` (192/1281), and `npm run health` all pass.
- Self-critique: closes state/journal drift for restore; deeper semantic checks such as renown recomputation remain later engine work.
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — overworld_snapshot_region_renown_binding

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gate helpers; same broad helper drift outside canonical repo scripts.
- Engine/persistence: overworld snapshot restore now recomputes region renown from completed jobs, explored sites, resolved events, and road encounter journal choices.
- Token economy: compact progress can trust renown totals without accepting forged high-value region scores.
- VERIFY: focused overworld snapshot/MCP/UI tests, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, `npm test` (192/1286), and `npm run health` all pass.
- Self-critique: closes derived renown drift at restore; full progression replay remains a larger future invariant.
- Operator direction: pause after this cycle; do not start another AFK cycle.

## Current Snapshot

- Verification bar: `npm run health` remains the required end gate.
- Current corpus: RPG and overworld content are broad enough that
  routine work should prefer targeted fixes or structural checks over more log prose.
- Current engine seam: public MCP and ToolApi push local overworld play through
  stateful sessions; the static overworld helper layer is retired.
- Catalog source of truth: `list_world` is the single public view over the
  Charter Marches quest graph; `list_stories` is retired.
- Preferred shipped-quest start: use `start_world_quest` / `world_quest_id`;
  `new_game` rejects raw pack-path starts.
- AFK baseline prompt now carries `main_world_quest_id`; blind baseline playtests
  should use `start_world_quest`.
- Persistence: shipped quest saves reload with embedded/explicit
  `world_quest_id`; `load_game` rejects raw `pack_path`.
- Trace verification: shipped quest traces replay/inspect with `world_quest_id`.
- Trace CLIs: positional replay/inspect trace sources are quest ids; raw pack
  path sources are rejected.
- Inspect CLI: shipped quest summaries use positional `world_quest_id`; raw pack
  summaries and explicit `--pack` are rejected.
- Author CLI: generated RPG output is draft-only; direct writes under
  `content/rpg/pack` are rejected until registered through the world graph.
- Overworld session restore rejects forged history with duplicate journal ids,
  unknown journal towns or source ids, source/place mismatches, mismatched
  journal kind/id prefixes, malformed/future/non-newest-first journal
  timelines, unmatched road journal arrivals, progress/journal state drift,
  region-renown mismatches, discovery locality drift, resolved-event
  locality/prerequisite drift, future/non-newest-first travel logs, or
  impossible travel vitals.
- Live session metadata: start/transcript/save/load return shipped
  `world_quest_id` or generated `generated_rpg_seed` without raw pack paths.
- Overworld quest view metadata: observations, action results, compact context,
  and quest-start responses expose quest ids/titles/areas without raw pack paths.
- World catalog: `list_world` returns sanitized graph/quest ids without raw
  `pack`/`path`; the legacy `list_stories` alias is retired.
- AFK loop internals resolve pack paths through `world/source`, not public
  catalog responses.
- AFK candidate targets and latest-cycle primary target are quest ids for
  world-bound content fixes; pack paths are edit metadata only.
- Blind harness default: shipped playtests use `--quest` / `start_world_quest`;
  raw `--pack` starts are rejected.
- MCP dev harness: `scripts/mcp_play.ts` starts shipped quests through
  `start_world_quest` / `world_quest_id`.
- World routes: ToolApi and public MCP `world_path` accept only
  `world_quest_id` and return graph-route metadata without raw `quest_path`;
  raw `quest_path` input is rejected.
- Quest validation/loading/patching: shipped quests use `world_quest_id` and
  return world identity without raw path envelopes.
- CLI validation: no-arg validation walks the canonical world graph; targeted
  validation uses `world_quest_id`; raw pack files and explicit `--pack` are
  rejected.
- ToolApi/public MCP validate/load/patch schemas and responses are
  `world_quest_id` only; trace replay/inspect resolve shipped sources from
  embedded or explicit `world_quest_id`.
- Quest tools: ToolApi and public MCP `validate_quest`/`load_quest`/`start_quest`
  use graph ids only; raw `quest_path`/`pack_path` is rejected.
- Retired legacy aliases: live MCP uses `validate_quest`, `load_quest`,
  `new_game`, and `start_world_quest`; legacy story and pack aliases are no
  longer public sources.
- Token economy: RPG start/load responses include compact source identity once;
  follow-up observations omit the repeated world binding.
- Token economy: compact overworld quest refs are `[id,title]`; pack paths stay
  internal to source resolution and edit metadata.
- Token economy: `compact_actions` lets repeated observe/step calls carry
  action ids without command labels; request full actions only when needed.
- Token economy: `get_transcript({ summary_only: true })` keeps end-state
  metadata while dropping detailed turn/event payload.
- Persistence: saves must carry `mode: "rpg"`; missing or legacy modes are
  integrity failures, not migration inputs.
- Trace replay: trace artifacts must carry `mode: "rpg"` before any replay or
  inspect path steps their state.
- Trace CLI: replay/inspect now share RPG state reference checks with MCP before
  stepping trace state.
- Persistence: shipped saves embed `worldQuestId`, so `load_game({ save })`
  can restore through the world graph without a raw pack path.
- Trace verification: shipped traces can embed `worldQuestId`, so replay/inspect
  can resolve through the world graph without a raw pack path.
- CLI trace verification now shares the same `worldQuestId` source resolver as
  MCP replay/inspect instead of assuming a raw pack path.
- CLI play now accepts/defaults to shipped `world_quest_id` sources and records
  `worldQuestId` into traces.
- Save restore source inference now shares the world source resolver with trace
  replay and CLI play.
- `new_game` source selection is world-id or generated-pack only, keeping
  generated packs as the explicit null-world source.
- Generated RPG saves now embed `generatedRpgSeed`, so `load_game({ save })`
  can reconstruct in-memory generated packs without a raw pack path.
- `load_game` source selection is save-embedded, `world_quest_id`, or
  `generate_rpg_seed`; raw pack paths are rejected at public restore surfaces.
- Pack validation/loading/patching now consume shared source identity instead of
  re-deriving `world_quest_id` after path resolution.
- Static overworld compatibility helpers are retired; ToolApi and public MCP use
  stateful overworld sessions for local play.
- Stateful overworld MCP action wrappers now share one session response envelope
  helper.
- Discovered overworld quest starts now use canonical `world_quest_id` source
  identity.
- MCP overworld loading now rejects local quest ids/packs that drift from the
  canonical world graph.
- Static and stateful local overworld actions now share descriptor text/timing.
- New York overworld loading/validation now lives in `world/source`, not MCP.
- Overworld session restore now rejects duplicate maps and tampered road options.
- MCP can now return compact overworld context for repeated loop turns.
- Stateful overworld MCP actions can return compact context directly when requested.
- Overworld start/restore can now enter compact context mode immediately.
- RPG start and overworld quest handoff can omit repeated command labels.
- RPG transcripts can return compact id-only turn rows.
- World source now caches parsed canonical world manifests per process.
- MCP pack loading caches unchanged RPG compile/validate reports per API instance.
- Overworld pending-road snapshots now save edge ids and rebuild manifest text.
- Overworld travel-log snapshots now save road ids and dynamic outcomes only.
- Compact overworld context now includes capped id-only recent travel tuples.
- Compact overworld context now caps progress id arrays with counts/truncation.
- Compact overworld route options now omit destination names and carry ids only.
- Compact overworld road and area-route tuples now omit repeated destination names.
- Compact overworld pending-road tuples now omit event titles and option labels.
- Raw evidence belongs in ignored paths: `ai-runs/`, `blind-tester/reports/`,
  local logs, and build output.
- Append at most 8 lines per cycle. Do not paste tool logs, full playthroughs,
  generated JSON/YAML, or broad file listings here.

## Recent Blind-Playtest Attendance

- Mandatory LLM playtest target this cycle: content/rpg/pack/advocates_case.yaml
- Mandatory LLM playtest target this cycle: content/rpg/pack/tanners_fever.yaml
- Mandatory LLM playtest target this cycle: content/rpg/pack/falconers_ransom.yaml
- Mandatory LLM playtest target this cycle: content/rpg/pack/factors_mark.yaml
- Parser and CYOA playtest targets were retired with the old runtime trees.

## AFK Cycle 2026-06-25T05-03-36-260Z — ULTRAPLAN (saturation re-aim)

- Assessment: packs cyoa=20 parser=16 rpg=16; 52 candidate(s) ranked.
- Next best improvement (recommended): [content_fix] Blind-playtest "aleconners_seal_v1" — structurally clean; only a fresh blind LLM player can judge its quality.
- Why: The validator and exhaustive solver prove this pack is winnable and sound; only a fresh blind LLM playtest reveals signposting/clarity/pacing issues a static check can't see.
- ⟳ SATURATED: top candidate at the 0.5 floor → this cycle runs a multi-agent ultraplan to re-aim (plan → docs/CURRENT_PLAN.md), then implements in a fresh context.
- Mandatory LLM playtest target this cycle: retired with the old CYOA tree; choose an RPG pack for future blind passes.
- Process: assessor ranks → blind LLM playtest for quality → one improvement → health + verify:integrity green → commit (trust-but-verify).

### Cycle result — bug_0491 / parser skill-check roll-complete proofs

- Blind playtest: `aleconners_seal` passed mechanically; polish deferred.
- Implemented parser best/worst d20 rule helper for structural proofs.
- Updated parser reachability, score, variant, menu, relabel, generator, render, and soft-lock proofs.
- Added synthetic success-only/failure-only parser skill-check regression.
- VERIFY: 275 focused tests passed; full `npm run health` EXIT 0.
- Operator direction: pause after this cycle; do not start another AFK cycle.
