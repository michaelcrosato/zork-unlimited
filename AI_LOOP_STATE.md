# AI Loop State

<!-- historical_cycle_count: 166 -->

This live file is intentionally token-small. Detailed cycle prose before the
2026-06-25 token-efficiency cleanup was removed from the working tree; use Git
history only when deep recovery is truly needed. Keep future entries terse.

### Cycle result — compact_step_events

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: public MCP `step_action` now defaults to compact event tuples while ToolApi/full event objects remain available with `compact_events: false`.
- Loop effect: routine action turns keep observation/context state but drop repeated event-object keys from the hot play loop.
- Guard: step-event tuple tests, MCP registration/source-size guard, docs/blind protocol tests, typecheck, and format check passed before full gates.
- VERIFY: focused MCP/event tests and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — compact_toolapi_state_read

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: ToolApi `get_state({ session_id })` now returns hash-only state by default; raw reducer state requires `include_state: true`.
- Loop effect: direct ToolApi callers now match public MCP state reads and avoid accidental full-state payloads in repeated loop turns.
- Guard: raw-state tests now opt in explicitly; focused MCP/state tests, registration guard, typecheck, and format check passed before full gates.
- VERIFY: focused MCP/state tests and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — compact_transcript_cache_hit

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: `get_transcript({ if_state_hash })` now returns hash-only `unchanged` instead of rebuilding repeated summary/turn payloads.
- Loop effect: end-of-run transcript polling joins observation/action cache-hit semantics and omits `session_id` on unchanged replies.
- Guard: ToolApi, MCP registration, blind-protocol docs, focused MCP/docs tests, and typecheck passed before full gates.
- VERIFY: focused MCP/docs tests and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — compact_unchanged_session_echo

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: guarded unchanged RPG observation/action replies and overworld read/context replies no longer echo `session_id`.
- Loop effect: cache-hit polling replies are now hash scoped only; callers already supplied the session id.
- Guard: MCP tests assert unchanged replies omit `session_id` while changed/full responses still carry session identity.
- VERIFY: focused MCP unchanged tests and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — compact_step_rejection_reason

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: successful `step_action()` replies no longer emit `rejection_reason: null`.
- Loop effect: every successful action turn drops a dead field while stale/illegal action replies still carry an explicit rejection reason.
- Guard: MCP step tests assert success payloads omit `rejection_reason` and rejection payloads retain it.
- VERIFY: focused MCP step tests and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — compact_rpg_source_fields

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: RPG session, save, load, and transcript wrappers now emit only the active source field instead of pairing it with a null source branch.
- Loop effect: world-quest loops carry `world_quest_id`; generated-pack loops carry `generated_rpg_seed`; neither repeats the absent source path.
- Guard: generated-session/save/load tests assert `world_quest_id` is omitted, while world-quest session/save/transcript/load tests assert `generated_rpg_seed` is omitted.
- VERIFY: focused MCP/source tests and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — compact_session_wrapper_mode

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: RPG session wrapper responses no longer return top-level `mode: "rpg"`.
- Loop effect: start/reload payloads stay session/hash/source scoped while full observations and persisted save/trace blobs keep mode where compatibility/integrity still needs it.
- Guard: session-start, generated-session, catalog, and load-game tests assert wrapper payloads omit `mode` while observations still report RPG mode.
- VERIFY: focused session-wrapper tests and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — compact_save_response_mode

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: `save_game()` success responses no longer return `mode: "rpg"`.
- Loop effect: save replies stay state/source/hash scoped while the serialized save blob retains its persisted RPG mode guard.
- Guard: save/load tests assert wrapper responses omit `mode` and the saved JSON still carries `mode: "rpg"`.
- VERIFY: focused save/load tests and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — compact_trace_inspect_mode

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: `inspect_trace()` summaries no longer return `mode: "rpg"`.
- Loop effect: trace audit payloads stay content-hash/source scoped while dropping a redundant one-value response discriminator.
- Guard: trace inspection tests assert inferred and explicit world-quest summaries omit `mode`, while trace-file mode validation remains covered.
- VERIFY: focused trace/MCP tests and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — compact_transcript_mode

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: `get_transcript()` responses no longer return `mode: "rpg"`.
- Loop effect: end-of-run audit payloads stay session/hash/source scoped while dropping another redundant one-value discriminator.
- Guard: transcript tests assert full, summary-only, and compact-turn transcript payloads omit `mode`.
- VERIFY: focused MCP tests and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — compact_rpg_context_mode

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: compact RPG MCP contexts no longer return `mode: "rpg"`.
- Loop effect: repeated agent-loop observations keep full/client observations stable while dropping a redundant one-value field from compact context payloads.
- Guard: compact-observation and MCP loop tests assert compact contexts omit `mode`.
- VERIFY: focused compact/MCP tests and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — compact_load_quest_mode

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: `load_quest()` responses no longer return `mode: "rpg"`.
- Loop effect: world-id quest metadata loads are RPG-only by tool contract and spend fewer tokens on a one-value discriminator.
- Guard: load/catalog tests assert non-session load payloads omit `mode`.
- VERIFY: focused load/catalog tests and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — compact_generation_authoring_mode

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: `generate_rpg_pack()` and `adapt_story()` responses no longer return `mode: "rpg"`.
- Loop effect: read-only generation/authoring payloads are RPG-only by tool contract and spend fewer tokens on a one-value discriminator.
- Guard: generated-pack and adapt-story tests assert those non-session payloads omit `mode`.
- VERIFY: focused generation/authoring tests and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — compact_patch_proposal_mode

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: structured `apply_content_patch` proposals no longer require `mode: "rpg"`.
- Loop effect: fixer payloads are world-quest-id scoped and RPG-only by construction, with one less model-facing discriminator.
- Guard: fixer/MCP tests accept mode-free proposals, reject the retired proposal `mode`, and MCP registration no longer advertises it.
- VERIFY: focused fixer/MCP tests and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — compact_world_catalog_mode

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: `list_world()` quest rows no longer repeat `mode: "rpg"` for every quest.
- Loop effect: discovery payloads stay quest-id/world-graph first and spend fewer tokens on a discriminator with one legal value.
- Guard: catalog/world-manifest tests assert quest rows omit `mode`, and the compact catalog size guard now caps the default JSON payload at 6100 chars.
- VERIFY: focused catalog/assessor tests, `npm run health`, `npm run validate`, and `npm test` passed: integrity, lint, format check, 195 test files / 1367 tests, and validate.
