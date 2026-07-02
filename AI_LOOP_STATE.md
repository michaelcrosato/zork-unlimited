# AI Loop State

<!-- historical_cycle_count: 210 -->

This live file is intentionally token-small. Detailed cycle prose before the
2026-06-25 token-efficiency cleanup was removed from the working tree; use Git
history only when deep recovery is truly needed. Keep future entries terse.

### Cycle result — cached_observation_projections

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: `SessionStore` now caches public/compact observation projections by shape and `stateHash`; `sessions.update` clears those projections alongside the full observation cache.
- Loop effect: repeated observation reads can reuse compact context/public action-label projections without rebuilding capped arrays, action rows, or compact exit/object/enemy tuples for unchanged reducer state.
- Guard: focused MCP session/tool tests prove projection cache reuse, separate shape entries, transcript-safe retention, and state invalidation.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — cached_compact_transcript_summaries

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: `SessionStore` now caches transcript summary projections by shape, `stateHash`, and `transcriptLogHash`; state/transcript mutations clear those projections.
- Loop effect: repeated compact transcript-summary audits avoid rebuilding capped arrays and omission tuples when reducer state and transcript history are unchanged.
- Guard: focused MCP session tests prove summary-projection reuse, separate shape entries, and invalidation on state and transcript mutation.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — cached_transcript_projections

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: `SessionStore` now caches transcript turn projections by shape and `transcriptLogHash`; transcript append/replace clears those projection caches.
- Loop effect: repeated full/compact transcript reads avoid remapping transcript rows and refiltering/compacting visible events when transcript history is unchanged.
- Guard: focused MCP session tests prove projection cache reuse across unchanged/state-only updates and invalidation on transcript append/replace.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — cached_transcript_summaries

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: `SessionStore` now caches transcript summaries by `stateHash` and `transcriptLogHash`; state/transcript mutations invalidate the summary cache.
- Loop effect: repeated non-unchanged transcript reads avoid rebuilding step counts, scene sets, public flags, inventory, and journal arrays while compact/full summary projection stays unchanged.
- Guard: focused MCP session tests prove summary cache reuse and invalidation on transcript append, transcript replace, and state replacement.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — cached_rpg_observations

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: `SessionStore` now caches MCP RPG observations by `stateHash`, `hideGraph`, and `includeWorldIntro`; `sessions.update` invalidates both observation and legal-action caches.
- Loop effect: repeated observe/render paths can reuse visible object, exit, enemy, public-state, and action projection work for unchanged reducer state while compact/full payloads remain projection-only.
- Guard: focused MCP session tests prove observation cache reuse, option-keyed rebuilds, and invalidation on state replacement.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — cached_observation_actions

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: MCP RPG observation construction now passes the session cached legal-action set into `buildRpgObservation`, so start/open/read/reject/step observations do not re-enumerate actions behind the cache.
- Loop effect: observe/list/step loops share one action graph per reducer state across both menu and observation payloads, while pure RPG observation callers keep the default enumerator path.
- Guard: focused MCP tests prove cached legal actions are used when building observations and public action payloads still strip reducer actions.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — cached_legal_action_sets

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: RPG sessions now cache the current legal-action option set behind `SessionStore.legalActions`; `list_legal_actions` and `step_action` reuse it while `sessions.update` invalidates it.
- Loop effect: list-then-step MCP turns avoid recomputing the same action graph for an unchanged reducer state, while stale-action protection still binds to the cached `stateHash`.
- Guard: focused MCP session tests prove action caches are reused for unchanged state and cleared on state replacement.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — cached_session_state_hash

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: RPG sessions now cache `stateHash` in `SessionStore`; start/load, observation polling, legal-action polling, stale-action guards, transcript polling, and save guards read the cached hash instead of re-hashing reducer state.
- Loop effect: repeated MCP loop calls stay O(1) for state hash checks between state replacements, while `sessions.update` refreshes the cache at the mutation boundary.
- Guard: focused MCP session/tool tests prove cached state hashes initialize/update correctly and synthetic test mutations go through the store.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — cached_transcript_log_hash

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: session transcripts now maintain an append-only `transcriptLogHash`; `get_transcript` combines that cached log hash with `state_hash` instead of hashing full transcript rows every poll.
- Loop effect: repeated transcript freshness checks stay O(1) relative to transcript length while still changing when state or transcript history changes.
- Guard: focused MCP/session tests prove store-owned append/replace writes keep the transcript log hash in sync.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — transcript_hash_polling

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: RPG transcript responses now include `transcript_hash`, and `get_transcript({ if_transcript_hash })` returns hash-only `unchanged` when transcript history is unchanged.
- Loop effect: end-of-run audit loops can poll transcript history directly instead of overloading state freshness, preserving compact hash-only reads when transcript rows have not changed.
- Guard: focused MCP transcript/tool-registration tests prove transcript-only mutations change `transcript_hash` while `state_hash` stays stable.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — direct_overworld_compact_view

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: compact overworld MCP reads/actions now call `OverworldSession.compactView()` instead of building a full `view()` and compacting it afterward.
- Loop effect: compact overworld turns skip full regional-arc expansion plus uncapped journal/log array clones before returning the capped context payload.
- Guard: direct compact-view parity is asserted against the existing full-view compactor in long-session overworld tests.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — direct_rpg_action_enumeration

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: `list_legal_actions` and successful `step_action` now use the RPG legal-action enumerator directly instead of building a full pre-step observation.
- Loop effect: normal action-menu reads and successful RPG turns avoid redundant room/object/dialogue/view packing before the response needs post-step context.
- Guard: focused MCP action-loop docs/tests, typecheck, lint, and format check passed before full gates.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — hash_only_stale_overworld

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: stale overworld action guards now return only `ok`, `snapshot_hash`, and `rejection_reason` without constructing compact/full context.
- Loop effect: stale travel/local/quest-handoff retries avoid duplicate overworld views; callers refresh context only when needed.
- Guard: focused MCP overworld guard docs/tests, typecheck, lint, and format check passed before full gates.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — hash_only_stale_step

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: stale `step_action({ expected_state_hash })` now short-circuits before observation construction and returns only `ok`, `state_hash`, and `rejection_reason`.
- Loop effect: stale action retries no longer pay for duplicate context, event tuple/version, or legal-action payloads; callers refresh only when needed.
- Guard: focused MCP stale-step docs/tests, typecheck, lint, and format check passed before full gates.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

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
