# AI Loop State

<!-- historical_cycle_count: 16 -->

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

## Current Snapshot

- Verification bar: `npm run health` remains the required end gate.
- Current corpus: RPG and overworld content are broad enough that
  routine work should prefer targeted fixes or structural checks over more log prose.
- Current engine seam: `start_overworld_session_quest` now bridges a discovered
  overworld quest lead into a real RPG session; future work should reduce remaining
  static-vs-stateful MCP duplication.
- Catalog source of truth: `list_stories` is a compatibility view over the Charter
  Marches quest graph, not a raw RPG pack directory scan.
- Preferred shipped-quest start: use `start_world_quest` / `world_quest_id`;
  raw pack-path starts remain compatibility only.
- AFK baseline prompt now carries `main_world_quest_id`; blind baseline playtests
  should use `start_world_quest`.
- Persistence: shipped quest saves can reload with `world_quest_id`; raw save
  `pack_path` is compatibility.
- Trace verification: shipped quest traces replay/inspect with `world_quest_id`.
- Live session metadata: start/transcript/save/load preserve shipped
  `world_quest_id`; generated sessions report null source identity.
- Blind harness default: shipped playtests should use `--quest` /
  `start_world_quest`; `--pack` is compatibility/new-pack fallback.
- World routes: `world_path` should prefer `world_quest_id`; `quest_path` remains
  compatibility.
- Pack validation/loading: shipped quests can use `world_quest_id` and preserve
  source identity in responses.
- Content patching: shipped patch targets can use `world_quest_id`; raw
  `pack_path` remains compatibility/new-pack fallback.
- Quest aliases: `validate_quest`/`start_quest` prefer graph ids; `quest_path`
  remains compatibility.
- Retired legacy story aliases: live MCP uses `validate_pack`, `new_game`, and
  `start_world_quest`; the legacy path alias is no longer a public start source.
- Token economy: RPG start/load responses include world context once; follow-up
  observations omit the repeated world binding.
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
- `new_game` source selection now shares that resolver while keeping generated
  packs as the explicit null-world source.
- Pack validation/loading/patching now consume shared source identity instead of
  re-deriving `world_quest_id` after path resolution.
- Static overworld compatibility tools now delegate to `world/static_overworld`
  instead of open-coding graph queries in MCP.
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
