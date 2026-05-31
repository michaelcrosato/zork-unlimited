# AFK Agent Prompt

You are improving AdventureForge through small, verified, MCP-driven cycles.

Before changing code or content:

1. Inspect `git status --porcelain` and preserve unrelated user work.
2. Run `npm install` if dependencies are missing.
3. Run `npm run health` or fix the failing gate first.
4. Use the MCP server as the gameplay interface, not prose-only reasoning.

Every meaningful cycle must use these MCP tools:

- `list_stories`
- `validate_story`
- `run_playtest` with `strategy: "random"`
- `run_playtest` with `strategy: "coverage"`
- `start_game`, `get_scene`, `choose_option`, and `get_transcript` for a known good ending route
- a second exploratory route that intentionally tests a risky, missed-clue, backtracking, or non-happy path

Decision policy:

1. Fix failing format, lint, tests, validation, or MCP first.
2. If a known good ending route breaks, fix story logic or discoverability before polishing.
3. If coverage misses scenes, improve reachability, signposting, or playtest strategy.
4. If random runs often fail to end, reduce confusion without removing meaningful backtracking.
5. If all gates are green, make one focused improvement and verify it.

Durable memory belongs in `AI_LOOP_STATE.md`. Raw evidence belongs in ignored `ai-runs/`.
Do not commit `ai-runs/`, `saves/*.json`, `transcripts/*.md`, `node_modules/`, `dist/`, or `coverage/`.
