# AI Loop State

<!-- historical_cycle_count: 22 -->

This live file is intentionally token-small. Detailed cycle prose before the
2026-06-25 token-efficiency cleanup was removed from the working tree; use Git
history only when deep recovery is truly needed. Keep future entries terse.

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
- Self-critique: strong live-token/path cleanup; remaining raw path surface is mostly catalog/debug (`list_world`, `list_stories`, trace/offline).
- Operator direction: pause after this cycle; do not start another AFK cycle.

### Cycle result — list_world_graph_identity

- Pre-cycle: ran `C:\dev\agent-cleaner` measure + gate helpers; same broad helper drift outside canonical repo scripts.
- Engine/API: `list_world` now returns sanitized world/graph quest ids without `pack` or `path` fields.
- Internal boundary: canonical manifests and `list_stories` compatibility still keep raw pack paths for loading/AFK assessment.
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
- Public MCP: `list_stories` now returns quest ids/world metadata without `path` or `main_story`.
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
- Token/API hygiene: normal replay output no longer echoes the resolved pack file; hidden `--pack` remains only for offline compatibility.
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

## Current Snapshot

- Verification bar: `npm run health` remains the required end gate.
- Current corpus: RPG and overworld content are broad enough that
  routine work should prefer targeted fixes or structural checks over more log prose.
- Current engine seam: public MCP and ToolApi push local overworld play through
  stateful sessions; the static overworld helper layer is retired.
- Catalog source of truth: `list_stories` is a compatibility view over the Charter
  Marches quest graph, not a raw RPG pack directory scan.
- Preferred shipped-quest start: use `start_world_quest` / `world_quest_id`;
  `new_game` rejects raw pack-path starts.
- AFK baseline prompt now carries `main_world_quest_id`; blind baseline playtests
  should use `start_world_quest`.
- Persistence: shipped quest saves reload with embedded/explicit
  `world_quest_id`; `load_game` rejects raw `pack_path`.
- Trace verification: shipped quest traces replay/inspect with `world_quest_id`.
- Trace CLIs: positional replay/inspect trace sources are quest ids; raw pack
  paths are hidden offline compatibility only.
- Inspect CLI: shipped quest summaries use positional `world_quest_id`; raw pack
  summaries require explicit `--pack` offline mode.
- Author CLI: generated RPG output is draft-only; direct writes under
  `content/rpg/pack` are rejected until registered through the world graph.
- Overworld session restore rejects forged history with duplicate journal ids,
  unknown journal towns, malformed/future/non-newest-first journal timelines,
  future/non-newest-first travel logs, or impossible travel vitals.
- Live session metadata: start/transcript/save/load return shipped
  `world_quest_id` or generated `generated_rpg_seed` without raw pack paths.
- Overworld quest view metadata: observations, action results, compact context,
  and quest-start responses expose quest ids/titles/areas without raw pack paths.
- World catalog: `list_world` returns sanitized graph/quest ids without raw
  `pack`/`path`; `list_stories` is now id-only compatibility.
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
- Pack validation/loading/patching: shipped quests use `world_quest_id` and
  return world identity without raw path envelopes.
- CLI validation: no-arg validation walks the canonical world graph; targeted
  validation uses `world_quest_id`; raw pack files require explicit `--pack`
  offline mode.
- ToolApi/public MCP validate/load/patch schemas and responses are
  `world_quest_id` only; trace replay/inspect keep raw pack paths only for
  offline compatibility.
- Quest aliases: ToolApi and public MCP `validate_quest`/`start_quest` use
  graph ids only; raw `quest_path` is rejected.
- Retired legacy story aliases: live MCP uses `validate_pack`, `new_game`, and
  `start_world_quest`; the legacy path alias is no longer a public start source.
- Token economy: RPG start/load responses include compact source identity once;
  follow-up observations omit the repeated world binding.
- Token economy: compact overworld quest refs are `[id,title]`; pack paths stay
  internal to source resolution and offline debug surfaces.
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
  `generate_rpg_seed`; raw pack paths remain offline validation/replay tooling only.
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
