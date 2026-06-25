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
- Current corpus: CYOA, parser, RPG, and overworld content are broad enough that
  routine work should prefer targeted fixes or structural checks over more log prose.
- Raw evidence belongs in ignored paths: `ai-runs/`, `blind-tester/reports/`,
  local logs, and build output.
- Append at most 8 lines per cycle. Do not paste tool logs, full playthroughs,
  generated JSON/YAML, or broad file listings here.

## Recent Blind-Playtest Attendance

- Mandatory LLM playtest target this cycle: content/cyoa/pack/watchtower_road.yaml
- Mandatory LLM playtest target this cycle: content/cyoa/pack/clockwork_heist.yaml
- Mandatory LLM playtest target this cycle: content/rpg/pack/advocates_case.yaml
- Mandatory LLM playtest target this cycle: content/cyoa/pack/tidewaiters_watch.yaml
- Mandatory LLM playtest target this cycle: content/rpg/pack/tanners_fever.yaml
- Mandatory LLM playtest target this cycle: content/cyoa/pack/bellmans_round.yaml
- Mandatory LLM playtest target this cycle: content/rpg/pack/falconers_ransom.yaml
- Mandatory LLM playtest target this cycle: content/rpg/pack/factors_mark.yaml
- Mandatory LLM playtest target this cycle: content/parser/pack/collectors_warrant.yaml
