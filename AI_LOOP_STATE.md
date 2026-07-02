# AI Loop State

<!-- historical_cycle_count: 196 -->

This live file is intentionally token-small. Detailed cycle prose before the
2026-06-25 token-efficiency cleanup was removed from the working tree; use Git
history only when deep recovery is truly needed. Keep future entries terse.

### Cycle result — compact_list_action_ids

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: `list_legal_actions({ compact_actions: true })` now returns action-id strings instead of `{ id }` rows.
- Loop effect: polling/resume loops keep menu identity plus `state_hash` without object wrappers; command labels remain available with `compact_actions: false`.
- Guard: focused MCP action-menu docs/tests, typecheck, lint, and format check passed before full gates.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — compact_rpg_action_ids

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: compact RPG observation actions now serialize as bare action-id strings under context `v: 5`.
- Loop effect: default MCP observe/start/step contexts keep legal action identity without repeating `{ "id": ... }` object wrappers every turn.
- Guard: focused compact-observation/MCP docs/tests, typecheck, lint, and format check passed before full gates.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — compact_transcript_more_tuple

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: compact transcript summary omissions now serialize as `more: [scenes, inventory, flags, journal]` with trailing zero counts trimmed.
- Loop effect: end-of-run audits keep omitted route/state counts without repeating four object keys in long transcript summaries.
- Guard: focused transcript-summary docs/tests, typecheck, lint, and format check passed before full gates.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — compact_rpg_more_tuple

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: compact RPG observation truncation metadata now serializes as `more: [inventory, flags, journal]` under context `v: 4`.
- Loop effect: long-running RPG turns keep omitted-state counts without repeating three object keys whenever inventory, flags, or journal are capped.
- Guard: focused compact-observation docs/tests, typecheck, lint, and format check passed before full gates.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — compact_transcript_events

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: transcript turns now support `compact_events: true`, returning `event_v: 3` event tuples while preserving full turn metadata.
- Loop effect: end-of-run audits can inspect event identity without paying for full reducer event objects or dropping events entirely.
- Guard: focused transcript/MCP registration tests, typecheck, lint, and format check passed before full gates.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — compact_rpg_state_event_codes

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: compact RPG step events now use `event_v: 3` state-effect codes that preserve object, quest-stage, var, flag, journal, and diagnostic payloads.
- Loop effect: compact MCP players keep full state-change identity without paying for long reducer effect names each turn.
- Guard: focused compact-event/MCP tests, typecheck, lint, and format check passed before full gates.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — compact_rpg_event_tags

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: compact RPG step events now use `event_v: 2` single-character tuple tags.
- Loop effect: repeated `step_action` turns keep reducer-visible event semantics while paying fewer bytes per event type tag.
- Guard: focused MCP event tests, typecheck, lint, and format check passed before full gates.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — compact_rpg_score_vars

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: compact RPG observations now filter duplicate `score`/`max_score` vars under context `v: 3`.
- Loop effect: repeated RPG turns keep score in `vitals` without paying for the same value again in `vars`.
- Guard: focused compact-RPG/MCP tests, typecheck, lint, and format check passed before full gates.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — compact_overworld_progress_tuple

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: compact overworld `progress` now serializes as `[visited, total]` under context `v: 4`.
- Loop effect: every compact overworld turn keeps town-progress counts without paying for the `towns` object wrapper.
- Guard: focused compact-overworld/MCP tests, typecheck, lint, and format check passed before full gates.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — compact_overworld_hidden_tuple

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: compact overworld `hidden` counts now serialize as `[areas, jobs, sites, quests]` under context `v: 3`.
- Loop effect: every compact overworld turn keeps hidden frontier counts without repeating four object keys.
- Guard: focused compact-overworld/MCP tests, typecheck, lint, and format check passed before full gates.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — compact_overworld_empty_progress

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: compact overworld progress now omits empty renown and completed-arc lists.
- Loop effect: fresh/idle overworld reads keep town progress without paying for two empty progress arrays.
- Guard: focused compact-overworld/MCP tests, typecheck, lint, and format check passed before full gates.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — compact_overworld_sparse_ids

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: compact overworld `ids` now omits empty progress-id categories while keeping `id_counts`.
- Loop effect: fresh/idle overworld reads keep category counts and non-empty ids without paying for eight empty arrays.
- Guard: focused compact-overworld/MCP tests, typecheck, lint, and format check passed before full gates.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — compact_overworld_empty_lists

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: compact overworld contexts now omit empty area-route, job, site, quest, journal, and travel-log lists.
- Loop effect: fresh/idle overworld reads keep navigation, visible locals, counts, and hashes without paying for local/recovery arrays that carry no choices.
- Guard: focused MCP/overworld/docs tests, typecheck, lint, and format check passed before full gates.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — compact_transcript_empty_lists

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: compact RPG transcript summaries now omit empty inventory, flag, and journal lists.
- Loop effect: early/state-light transcript audits keep route and hash metadata without paying for three empty arrays.
- Guard: focused MCP/docs tests, typecheck, lint, and format check passed before full gates.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — compact_rpg_empty_exits

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: compact RPG observations now omit `exits` when no exit ids are available.
- Loop effect: terminal compact observations keep ending state without paying for an empty navigation array.
- Guard: focused compact-RPG/MCP/docs tests, typecheck, and format check passed before full gates.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.
