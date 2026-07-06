# AI Loop State

<!-- historical_cycle_count: 451 -->

This live file is intentionally token-small. Detailed cycle prose before the
2026-06-25 token-efficiency cleanup was removed from the working tree; use Git
history only when deep recovery is truly needed. Keep future entries terse.

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

### Cycle result - overworld_quest_source_field

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: New York overworld quest entries now declare `source` instead of package-era `pack`, matching canonical world graph quest bindings.
- Loop effect: overworld/world binding validation normalizes one private source field across the open-world manifest path instead of carrying a second quest package alias.
- Guard: focused overworld, world-source, and world-session regressions cover source binding uniqueness, mismatch detection, and fixture shape.
- VERIFY: `npm run typecheck`, focused overworld/world-source/session regressions, `npm run validate`, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - world_graph_source_field

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: canonical world graph quest nodes now declare `source` instead of package-era `pack`; graph normalization and coverage use `normalizeSourcePath` plus `assertWorldQuestSourceCoverage`.
- Loop effect: validate, world loading, and MCP source runtime dereference world quest sources without teaching future loops a graph-level package field.
- Guard: single-world, world-source, source-runtime, catalog, and validation-bar regressions cover `source` graph bindings and reject private `source`/old `pack` fields from public graph output.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused world/source regressions, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - rpg_source_loader_module

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: RPG compile/load imports now come from `src/rpg/source.ts`; the old `src/rpg/pack.ts` module and generic `ContentPack` compiler abstraction are retired.
- Loop effect: MCP runtime, CLI, and regression loops import a source loader with `CompiledRpgSource`, `compileRpgSource`, and `loadRpgSourceFile` names instead of reusing package-era loader names.
- Guard: standalone RPG contract regression asserts `src/rpg/pack.ts` is absent, the source loader has no generic content-pack exports, and MCP runtime imports `../rpg/source.js`.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused source/runtime regressions, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - rpg_index_pack_alias_retired

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: `RpgIndex` no longer duplicates the model source as a package-era `rpgPack` alias; runtime code uses the single `index.pack` field inherited from the RPG model index.
- Loop effect: legal actions, combat, scoring, and state initialization share one indexed source reference instead of carrying a redundant alias through the hot runtime object.
- Guard: focused RPG unit regression asserts `indexRpgPack` returns the original `pack` reference without a `rpgPack` runtime field.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused RPG regression, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - validation_report_source_id

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: `ValidationReport` now carries `source_id` and formats optional `Source:` diagnostics instead of package-era `pack_id` / `Pack:` identity.
- Loop effect: MCP validation, load, generation, and patch responses no longer serialize report-level `pack_id`; recurring validate/inspect CLI outputs stay keyed by `world_quest_id` without report source headers.
- Guard: focused report, MCP tool, assessor, author CLI, validation-bar, and trace CLI regressions pin `source_id` plus absence of public report `pack_id`.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused report/MCP/CLI regressions, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - rpg_source_file_loader_private

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: `RpgSourceRuntime` no longer exposes path-taking `loadAndReport` or `requirePlayable` methods; file-backed quest loading is private to the source runtime.
- Loop effect: public runtime/tests now exercise file cache behavior through canonical `world_quest_id` loading, including a temp world-manifest fixture for same-size rewrite invalidation.
- Guard: source-runtime regression rejects direct `.loadAndReport(...)` and `.requirePlayable(...)` callers while pinning the private file-backed loader boundary.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused source-runtime/world-source/validation-bar regressions, `npm test`, and `npm run health` passed after loop-state rotation.

### Cycle result - quest_source_path_private

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/loop surface: `src/world/source.ts` no longer exports `WorldQuestPackSource` or `resolveWorldQuestPackPath`; world-source resolution validates canonical quest identity without returning disk package paths.
- Loop effect: RPG source runtime owns the private world-quest-to-file dereference, so save/trace/world-source callers cannot depend on a path-bearing source API.
- Guard: source-runtime regression rejects `WorldQuestPackSource` and `resolveWorldQuestPackPath` from both world source and runtime source files.
- VERIFY: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate`, focused world-source/source-runtime/validation-bar regressions, `npm test`, and `npm run health` passed after loop-state rotation.
