# AI Loop State

<!-- historical_cycle_count: 152 -->

This live file is intentionally token-small. Detailed cycle prose before the
2026-06-25 token-efficiency cleanup was removed from the working tree; use Git
history only when deep recovery is truly needed. Keep future entries terse.

### Cycle result — compact_world_catalog_mode

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: `list_world()` quest rows no longer repeat `mode: "rpg"` for every quest.
- Loop effect: discovery payloads stay quest-id/world-graph first and spend fewer tokens on a discriminator with one legal value.
- Guard: catalog/world-manifest tests assert quest rows omit `mode`, and the compact catalog size guard now caps the default JSON payload at 6100 chars.
- VERIFY: focused catalog/assessor tests, `npm run health`, `npm run validate`, and `npm test` passed: integrity, lint, format check, 195 test files / 1367 tests, and validate.

### Cycle result — active_roadmap_rpg_only

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Docs/loop surface: replaced the stale multi-mode roadmap with current RPG-only open-world priorities.
- Loop effect: active roadmap guidance no longer preserves retired staged-engine work as the next plan.
- Guard: roadmap regression rejects retired mode/path guidance, and doc-staleness scanning now includes `docs/ROADMAP.md`.
- VERIFY: focused roadmap/doc-staleness/assessor tests, `npm run health`, `npm run validate`, and `npm test` passed: integrity, lint, format check, 195 test files / 1367 tests, and validate.

### Cycle result — active_build_spec_rpg_only

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Docs/token surface: replaced the 61KB staged build spec with a 7.3KB RPG-only open-world engine spec.
- Loop effect: root-level active guidance no longer tells agents to build retired CYOA/parser stages or package-mode trees.
- Guard: new build-spec regression rejects retired stage/path instructions and requires current RPG tool surfaces plus validate/test gates.
- VERIFY: focused build-spec/RPG-only/verifier tests, `npm run health`, `npm run validate`, and `npm test` passed: integrity, lint, format check, 194 test files / 1364 tests, and validate.

### Cycle result — compact_live_loop_state

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Loop/token surface: rotated the tracked `AI_LOOP_STATE.md` back to the tested 15-entry live window.
- Loop effect: fresh agents read a terse current index instead of 900+ lines of old cycle transcript.
- Evidence: rotation preserved total completed-cycle count in `historical_cycle_count` while moving old detail to ignored local archive/git history.
- Guard: loop-state rotation and assessor seed-window tests cover count preservation.
- VERIFY: focused loop-state/assessor tests, `npm run health`, `npm run validate`, and `npm test` passed: integrity, lint, format check, 193 test files / 1362 tests, and validate.

### Cycle result — unify_start_world_quest_source_key

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/API surface: `start_world_quest` now accepts only `world_quest_id`; standalone `quest_id` is rejected.
- Loop effect: shipped quest start/validate/load/path/playtest surfaces now use one public source key.
- Evidence: MCP schema, blind harness, MCP smoke, dev MCP harness, and AI loop prompt all pass `world_quest_id`.
- Guard: MCP registration and ToolApi tests reject standalone `quest_id` on shipped starts.
- VERIFY: focused MCP/blind/AI loop tests, blind MCP smoke, typecheck, `npm run health`, `npm run validate`, and `npm test` passed: integrity, lint, format check, 193 test files / 1362 tests, and validate.

### Cycle result — retire_quest_id_validation_alias

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/API surface: `validate_quest` and `load_quest` now accept only `world_quest_id`.
- Loop effect: shipped quest validation/loading have one source key; `quest_id` remains only on `start_world_quest`.
- Evidence: public MCP registration uses `WORLD_QUEST_SOURCE`, and ToolApi rejects `quest_id` on validate/load.
- Guard: MCP registration tests assert `QUEST_ID_SOURCE` is absent.
- VERIFY: focused MCP/source tests, typecheck, `npm run health`, `npm run validate`, and `npm test` passed: integrity, lint, format check, 193 test files / 1362 tests, and validate.

### Cycle result — narrow_new_game_to_generated

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/API surface: `new_game` now starts generated RPG packs only; shipped quests start through `start_world_quest`.
- Loop effect: world-bound play has one fresh-start contract, and generated-pack smoke play remains a separate null-world path.
- Evidence: public MCP `new_game` no longer advertises `world_quest_id`; ToolApi rejects `new_game({ world_quest_id })`.
- Guard: overworld quest bridge, save/load regressions, hide-graph regressions, and catalog play tests now use `start_world_quest`.
- VERIFY: focused MCP/source/start tests, typecheck, `npm run health`, `npm run validate`, and `npm test` passed: integrity, lint, format check, 193 test files / 1362 tests, and validate.

### Cycle result — retire_start_quest_alias

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/API surface: removed the legacy `start_quest` alias from ToolApi and public MCP registration.
- Loop effect: RPG quest starts now have one world-bound contract: `start_world_quest(world_quest_id, seed?, compact_observation?)`.
- Evidence: live MCP registration and ToolApi key checks no longer expose `start_quest`; `start_world_quest` still carries compact defaults and world route context.
- Guard: MCP registration stays exact against ToolApi handlers, and unit coverage asserts the alias is absent.
- VERIFY: focused MCP registration/tools tests, typecheck, `npm run health`, `npm run validate`, and `npm test` passed: integrity, lint, format check, 193 test files / 1362 tests, and validate.

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
