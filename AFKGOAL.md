# AFK Goal

Make this repository genuinely ready for safe, fully AFK, Codex-driven game
improvement loops.

The loop must be evidence-driven and conservative:

- Work only inside this repository.
- Preserve unrelated user work if the tree starts dirty.
- Use MCP playtesting as real gameplay evidence; do not rely on prose-only
  playtesting.
- Keep raw generated evidence in ignored scratch directories such as `ai-runs/`.
- Do not commit generated saves, transcripts, coverage, `dist/`, or
  `node_modules/`.
- Prefer small, testable, high-impact changes.
- Do not mark a cycle green unless health checks pass.

For AdventureForge, the required MCP evidence cycle is:

1. Call `list_stories`.
2. Select the main CYOA story, currently
   `content/cyoa/pack/watchtower_road.yaml`.
3. Call `validate_story` and fail on hard errors.
4. Call `run_playtest` with `strategy: "random"`.
5. Call `run_playtest` with `strategy: "coverage"`.
6. Use `start_game`, `get_scene`, `choose_option`, and `get_transcript` to
   complete the known true route to `ending_truth`.
7. Start a second session and perform an exploratory route that tests a risky,
   missed-clue, backtracking, or non-happy path.
8. Summarize evidence, weak spots, risks, and the highest-priority next task in
   `AI_LOOP_STATE.md`.

The bounded launch command is:

```bash
CODEX_HOME="$PWD/.codex" AI_CODEX_SANDBOX=workspace-write AI_LOOP_MAX_CYCLES=1 ./loop.sh --once
```

The long-running launch command is:

```bash
CODEX_HOME="$PWD/.codex" AI_CODEX_SANDBOX=workspace-write ./loop.sh
```

Current OpenAI/Codex reference notes, checked on May 31, 2026:

- Local Codex CLI: `codex-cli 0.135.0`.
- Official OpenAI Codex docs cover non-interactive `codex exec`, MCP
  configuration, and workspace-write sandboxing for automation.
- Official OpenAI help says GPT-5.5 is current in ChatGPT/Codex for eligible
  users; GPT-5.5 Thinking is the deeper reasoning option, GPT-5.5 Pro is the
  highest-capability ChatGPT option, and GPT-5.5 API availability is not the
  same as ChatGPT/Codex availability.
