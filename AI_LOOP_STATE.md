# AI Loop State

<!-- historical_cycle_count: 231 -->

This live file is intentionally token-small. Detailed cycle prose before the
2026-06-25 token-efficiency cleanup was removed from the working tree; use Git
history only when deep recovery is truly needed. Keep future entries terse.

### Cycle result - indexed_overworld_restore_road_journal

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: snapshot restore now builds one parsed road-journal resolution index keyed by road arrival.
- Loop effect: pending-road checks, road renown replay, and resource replay share road journal facts instead of rescanning and reparsing road entries independently.
- Guard: focused typecheck plus overworld MCP lifecycle, UI overworld, and snapshot integrity tests passed over the shared road-journal path.
- VERIFY: focused checks, `npm run validate`, `npm test`, and `npm run health` passed on the final tree.

### Cycle result - indexed_overworld_restore_progress_bindings

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: snapshot restore now builds one progress journal source index for visited areas, jobs, quests, sites, event resolutions, and regional arcs.
- Loop effect: progress/state journal binding checks avoid seven full journal passes during repeated overworld restore/load validation.
- Guard: focused typecheck plus overworld MCP lifecycle and snapshot integrity tests passed over the refactored binding path.
- VERIFY: focused checks, `npm run validate`, `npm test`, and `npm run health` passed on the final tree.

### Cycle result - indexed_overworld_restore_resource_replay

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: local-action replay entries now carry action duration, and snapshot resource replay consumes that index instead of remapping every local journal entry from the full journal.
- Loop effect: repeated overworld restore/load validation only scans the journal for road/service rows during resource replay while reusing parsed local action facts.
- Guard: focused typecheck plus overworld MCP lifecycle and snapshot integrity tests passed over the refactored replay path.
- VERIFY: focused checks, `npm run validate`, `npm test`, and `npm run health` passed on the final tree.

### Cycle result — indexed_overworld_restore_local_journal

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: snapshot restore now builds one local-action journal replay index with sorted source entries and town/area action counts.
- Loop effect: local reachability, chronology, area-count replay, and source-count replay proofs share parsed journal facts instead of remapping journal entries independently.
- Guard: focused typecheck plus overworld MCP lifecycle and snapshot integrity tests passed over the refactored replay index.
- VERIFY: focused checks, `npm run validate`, `npm test`, and `npm run health` passed on the final tree.

### Cycle result — indexed_overworld_restore_event_proofs

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: snapshot restore event proofing now indexes journal ids plus earliest scout/contact times by area and earliest resolved-event times by town.
- Loop effect: repeated overworld restore/load validation avoids per-resolved-event journal scans and per-regional-arc resolved-event walks.
- Guard: focused typecheck plus overworld MCP lifecycle and snapshot integrity tests passed over the refactored proof indexes.
- VERIFY: focused checks, `npm run validate`, `npm test`, and `npm run health` passed on the final tree.

### Cycle result — indexed_overworld_restore_local_proofs

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: snapshot restore proof helpers now reuse the session's indexed local area/job/quest/site lists through the cached manifest index.
- Loop effect: repeated overworld restore/load validation avoids falling back to full manifest scans for local source prefix, chronology, and count replay checks.
- Guard: focused typecheck plus overworld MCP lifecycle and snapshot integrity tests passed over the refactored restore proofs.
- VERIFY: focused checks, `npm run validate`, `npm test`, and `npm run health` passed on the final tree.

### Cycle result — indexed_overworld_travel_exits

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: `OverworldSession` now keeps directional nested id indexes for town road exits and local area exits.
- Loop effect: road travel and local area movement resolve route ids directly for the current town/area instead of scanning visible exit arrays during agent play.
- Guard: existing overworld MCP lifecycle and snapshot integrity tests cover road travel, area movement, pending-road encounters, and restore validation over the refactored lookups.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` also passed before the health run.

### Cycle result — indexed_overworld_local_action_sources

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: `OverworldSession` now keeps direct id indexes for POIs, contacts, jobs, and exploration sites, sharing them with snapshot restore validation.
- Loop effect: local action entry points resolve stable ids directly and then apply current-town/current-area gates, avoiding repeated scans across town lists during agent play.
- Guard: existing overworld MCP lifecycle and snapshot integrity tests cover local actions, quest handoff, event resolution, and restore validation over the refactored lookups.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` also passed before the health run.

### Cycle result — indexed_overworld_regional_arc_state

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: `OverworldSession` now indexes regional arcs by region, caches their anchor-town nodes, and maintains resolved event home ids alongside resolved event ids.
- Loop effect: event resolution, regional arc completion, and regional arc progress rebuilds avoid rescanning all resolved events and remapping anchor towns.
- Guard: existing overworld MCP lifecycle and snapshot integrity tests cover live regional arc completion plus restore proofing.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` also passed before the health run.

### Cycle result — indexed_overworld_snapshot_restore

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: `OverworldSession` now builds snapshot-restore manifest validation indexes once per session.
- Loop effect: repeated overworld restore/load validation reuses town, area, local action, road, source-name, and regional-arc lookups instead of rebuilding those maps and sets per snapshot.
- Guard: existing overworld MCP lifecycle and snapshot integrity tests cover the restore assertions that now read from the cached manifest index.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` also passed before the health run.

### Cycle result — typed_overworld_compact_clones

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: compact overworld context returns now clone cached payloads with typed tuple/array copies instead of JSON stringify/parse.
- Loop effect: repeated compact overworld reads preserve caller isolation without paying full serialization/deserialization cost for unchanged session context.
- Guard: MCP compact-context regression mutates nested route/id arrays and verifies cached context remains isolated.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — indexed_overworld_road_routes

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: `OverworldSession` now indexes sorted town road exits and road events once per session, and route planning uses that adjacency.
- Loop effect: route menus, compact/full exits, travel actions, pending-road restore, and repeated discovered-route planning avoid rescanning/sorting all overworld roads and road events.
- Guard: existing overworld MCP lifecycle and snapshot integrity tests cover the refactored road view, travel, route, and restore paths.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — indexed_overworld_journal_entries

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: `OverworldSession` now maintains a journal-entry id index across normal play, repeatable service entries, road events, regional arcs, and snapshot restore.
- Loop effect: repeat-action detection, event-resolution prerequisites, restored idempotent actions, and journal proof checks avoid growing linear scans over long overworld play histories.
- Guard: existing overworld MCP lifecycle and snapshot integrity tests cover the refactored journal mutation and restore paths.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — indexed_overworld_local_lists

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: `OverworldSession` now indexes sorted town/area local lists and bidirectional area exits once per manifest-backed session.
- Loop effect: full/compact overworld views and local actions avoid repeated scans/sorts over areas, POIs, contacts, events, jobs, sites, quests, and area routes.
- Guard: existing overworld MCP lifecycle and snapshot integrity tests cover the refactored local-list paths.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — indexed_overworld_manifest_lookups

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: `OverworldSession` now indexes areas, local events, and quests once per manifest-backed session.
- Loop effect: area resolution, regional-arc proofing, and overworld quest completion avoid repeated linear scans across large world arrays.
- Guard: existing overworld MCP lifecycle and snapshot integrity tests cover the refactored lookup paths.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — cached_overworld_full_views

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: `OverworldSession` now caches full overworld observations until session mutation invalidates snapshot-derived caches.
- Loop effect: repeated full overworld reads reuse the derived observation shell instead of rebuilding local lists, id arrays, route rows, regional arcs, and travel state for unchanged state.
- Guard: focused MCP read tests prove repeated full observations stay value-stable while returned wrappers remain isolated from caller mutation.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — cached_overworld_regional_arcs

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: `OverworldSession` now caches regional arc progress until session mutation invalidates snapshot-derived caches.
- Loop effect: repeated full overworld reads reuse arc progress calculations instead of rescanning resolved events and rebuilding arc progress for unchanged state.
- Guard: focused MCP read tests prove repeated regional arc values stay stable while returned arrays/objects remain isolated from caller mutation.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — cached_overworld_compact_views

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: `OverworldSession` now caches compact context payloads until session mutation invalidates snapshot-derived caches.
- Loop effect: repeated compact overworld reads reuse roads, route tuples, id payloads, local lists, and capped journal/travel slices for unchanged state.
- Guard: focused MCP read tests prove repeated compact context values stay stable while returned payloads remain clone-isolated from caller mutation.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — cached_overworld_route_options

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: `OverworldSession` now caches derived discovered route options until session mutation invalidates snapshot-derived caches.
- Loop effect: repeated overworld full/compact reads reuse route plans and resource estimates instead of rerunning route search across discovered towns for unchanged state.
- Guard: focused MCP read tests prove repeated route values remain stable while full observations do not expose the cached internal route-option array/object wrappers.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — cached_overworld_snapshot_hashes

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: `OverworldSession` now caches its serialized snapshot plus `snapshotHash`; public snapshots stay clone-isolated while MCP guard paths read the cached hash.
- Loop effect: repeated overworld reads, unchanged checks, stale-action rejections, route planning, and guarded exports avoid rebuilding and hashing the full session snapshot until state mutates.
- Guard: focused MCP export tests prove repeated snapshot reuse semantics and protect against caller mutation of cached snapshot internals.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

### Cycle result — cached_action_row_projections

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gates; cleaner passed Prettier, ESLint, typecheck, and tests; optional secret scanner remains absent.
- Engine/token surface: `SessionStore` now caches public legal-action row projections by shape and `stateHash`; `sessions.update` clears those projections with the legal-action cache.
- Loop effect: repeated action-menu reads avoid remapping cached legal actions into compact id arrays or full public action rows for unchanged reducer state.
- Guard: focused MCP session/tool tests prove row-projection reuse, separate compact/full entries, transcript-safe retention, and state invalidation.
- VERIFY: focused checks and `npm run health` passed; final explicit `npm run validate` and `npm test` passed on the final tree.

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
