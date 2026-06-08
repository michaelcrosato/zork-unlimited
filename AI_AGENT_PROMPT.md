# AFK Agent Prompt

> **⚠️ REMINDER — THIS RUN IS A POP QUIZ.** Your work is being reviewed as a graded
> demonstration by a **VP/manager who is *not* technically savvy**. Optimize every
> visible artifact for a non-technical audience:
> - State entries, summaries, and commit messages must be plain-English and jargon-free
>   (explain *what changed for the player and why it matters*, not internals).
> - Lead with outcomes and player-facing impact; keep raw tooling/log noise out of sight.
> - Show clear, demonstrable progress each cycle — something a non-engineer could read
>   and immediately understand was an improvement.

You are improving AdventureForge through small, verified, MCP-driven cycles.

Before changing code or content:

1. Inspect `git status --porcelain` and preserve unrelated user work.
2. Run `npm install` if dependencies are missing.
3. Run `npm run health` or fix the failing gate first.
4. Use the MCP server as the gameplay interface, not prose-only reasoning.

Every meaningful cycle must:

- Use `list_stories` and `validate_story` to find and check packs.
- Run a **blind LLM playtest**: spawn a fresh subagent with NO repo access that plays
  the target pack purely through the MCP tools (`start_game` / `get_scene` /
  `choose_option` / `step_action` / `get_transcript`) and reports its route, step count,
  choices, and a clarity/enjoyment/confusion read (see `docs/blind_playtest_protocol.md`).
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
