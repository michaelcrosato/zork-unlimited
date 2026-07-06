# AI Loop State

<!-- historical_cycle_count: 458 -->

This live file is intentionally token-small. Detailed cycle prose before the
2026-06-25 token-efficiency cleanup was removed from the working tree; use Git
history only when deep recovery is truly needed. Keep future entries terse.

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

### Cycle result - quest_source_directory_migration

- Pre-cycle: `C:\dev\agent-cleaner` passed after rerun with a longer timeout; the first short run killed Vitest mid-output.
- Engine/loop surface: shipped RPG YAML moved out of the package-named folder into `content/rpg/quests`; world graph, overworld bindings, source discovery, author guards, tests, and traces now follow quest-source paths.
- Loop effect: the single-world runtime no longer relies on a package-named content directory when resolving canonical world quest sources.
- Self-critique: broad mechanical migration, but it removes real package-era structure instead of only hiding it behind APIs.
- Guard: focused world-source, source-runtime, author, validation-bar, UI, and full-suite regressions cover the path change.
- VERIFY: `C:\dev\agent-cleaner`, `npm run typecheck`, focused migration regressions, `npm run validate`, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - archive_guard_wsl_git_fallback

- Pre-cycle: `C:\dev\agent-cleaner` initially exposed a WSL-only test failure in the archive tracking guard; rerun passed after the fix.
- Engine/loop surface: `verify-integrity` now retries tracked-file checks through a translated Windows `.git` pointer when running under WSL.
- Loop effect: the token-heavy loop archive guard stays enforced in both Windows health runs and the WSL cleaner path used before cycles.
- Self-critique: maintenance-focused, but it fixes a real verification portability hole from the prior cycle.
- Guard: focused verifier/loop-state regressions cover the guard path.
- VERIFY: `C:\dev\agent-cleaner`, `npm run typecheck`, focused verifier/loop-state regressions, `npm run validate`, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - ignored_archive_tracking_guard

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: verifier integrity now blocks `AI_LOOP_STATE_ARCHIVE.md` if it becomes tracked, preserving the intended gitignored archive boundary.
- Loop effect: future agents can keep local deep history without shipping a token-heavy archive into every clone or recurring context scan.
- Self-critique: not player-facing, but it locks a real token-regression class instead of relying on ignore-file convention.
- Guard: focused verifier/loop-state regressions cover forbidden tracked artifacts and guard-self weakening.
- VERIFY: `npm run typecheck`, focused verifier/loop-state regressions, `npm run validate`, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - trace_source_ref_diagnostics

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: trace replay/inspect fixtures and diagnostics now use embedded `source_ref` and source-hash language instead of legacy `worldQuestId` / package wording.
- Loop effect: future trace debugging starts from the same compact source identity that current saves and traces serialize, reducing package-era recovery cues in operator loops.
- Guard: focused trace CLI/MCP/source regressions cover source-ref inference, raw pack rejection, and explicit-source conflict diagnostics.
- VERIFY: `npm run typecheck`, focused trace/source/MCP regressions, `npm run validate`, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - source_ref_mirror_write_retired

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: new save and trace artifacts now serialize only compact `source_ref`; legacy `worldQuestId` / `generatedRpgSeed` mirrors are accepted for old-artifact validation but dropped from loaded bundles.
- Loop effect: persistence and replay state carry one canonical source identity, reducing duplicated context in save/trace blobs while preserving source-integrity checks.
- Guard: focused save/trace, world-source, MCP save/load, generated-source, and recorded-play regressions cover source-ref-only emission plus legacy mirror rejection.
- VERIFY: `npm run typecheck`, focused save/trace/world-source/MCP regressions, `npm run validate`, `npm test`, and `npm run health` passed after loop-state rotation.
