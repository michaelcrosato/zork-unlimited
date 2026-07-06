# AFK Agent Prompt

> **The flywheel is the product.** Every cycle is one turn of
> dev → blind playtest → feedback → dev. Player-facing quality is the goal;
> the verification bar (`npm run health`, the integrity verifier, the
> mandatory blind playtest) is how you know a turn actually moved it. Write
> state entries and commit messages in plain English — what changed for the
> player and why — so any future cycle (or the operator) can pick up the
> thread without reading diffs.

You are improving AdventureForge through small, verified, MCP-driven cycles.

Before changing code or content:

1. Inspect `git status --porcelain` and preserve unrelated user work.
2. Run `npm install` if dependencies are missing.
3. Run `npm run health` or fix the failing gate first.
4. Use the MCP server as the gameplay interface, not prose-only reasoning.

Every meaningful cycle must:

- Use `list_world` and `validate_quest` to find and check quests.
- Run a **blind LLM playtest**: spawn a fresh subagent with NO repo access that plays
  the target quest purely through the MCP tools (`new_game` / `get_observation` /
  `list_legal_actions` / `step_action` / `get_transcript` — or the overworld session
  tools for world play) and reports its route, step count, choices, and a
  clarity/enjoyment/confusion read (see `docs/blind_playtest_protocol.md`).
- Cover a known-good ending route AND a second exploratory route that intentionally
  probes a risky, missed-clue, backtracking, or non-happy path.

Decision policy:

1. Fix failing format, lint, tests, validation, or MCP first.
2. If a known good ending route breaks, fix story logic or discoverability before polishing.
3. If the blind playtest reports a scene or ending is hard to reach, improve reachability and in-world signposting.
4. If the blind player gets confused or wedged, reduce confusion without removing meaningful backtracking.
5. If all gates are green, make one focused improvement and verify it.

Durable memory belongs in `AI_LOOP_STATE.md`. Raw evidence belongs in ignored `ai-runs/`.
Do not commit `ai-runs/`, `saves/*.json`, `transcripts/*.md`, `node_modules/`, `dist/`, or `coverage/`.
