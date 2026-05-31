# AFK Goal

```markdown
/goal Make `zork-unlimited` genuinely ready for safe, fully AFK, Codex-driven game improvement loops.

You must web search for the latest on any information regarding AI and AI related technologies and coding, It is May 31, 2026. Make sure we are using the latest implemenations and knowing exactly what Codex latest version AND ChatGPT 5.5 model can do.

You are operating inside the `zork-unlimited` repository. Treat this as playable software, not as a static writing sample. Your deliverable is a stronger autonomous development system that can repeatedly improve the game through evidence, MCP playtesting, validation, self-feedback, and small verified commits.

Use high/maximum reasoning if available. Work autonomously. Do not ask for permission for obvious next steps. Do not wait on the user unless a safety, credential, or destructive-action boundary blocks progress.

## Non-negotiable constraints

- Work only inside this repository.
- Prefer `workspace-write` compatible behavior. Do not require `danger-full-access`.
- Do not rely on prose-only playtesting. Every meaningful cycle must actually play the game through the MCP server interface.
- Keep generated artifacts out of commits unless repository policy explicitly changes.
- Do not commit `ai-runs/`, `saves/*.json`, `transcripts/*.md`, `node_modules/`, `dist/`, `coverage/`, or other generated scratch files.
- Do not make broad speculative rewrites. Prefer small, testable, high-impact changes.
- Do not mark work complete unless `npm run health` passes.
- Do not commit or push failing work.
- If the repo starts dirty, inspect and preserve user work. Do not mix unrelated baseline changes into an autonomous commit.

## First, read and internalize these files

Read these before changing anything:

- `README.md`
- `AGENTS.md`
- `AI_AGENT_PROMPT.md`
- `AI_LOOP_STATE.md`
- `.codex/config.toml`
- `.gitignore`
- `package.json`
- `src/ai-loop.ts`
- `src/mcp.ts`
- `src/cli.ts`
- `src/engine.ts`
- `src/playtest.ts`
- `src/validate.ts`
- `src/transcript.ts`
- `stories/demo.yaml`
- all files in `tests/`

Understand the current architecture:

- The game is a YAML-authored choose-your-own-adventure engine.
- CLI commands validate, start, inspect, choose, render transcripts, and run playtests.
- The MCP server is the required interface for real agent play.
- `./loop.sh` is the intended long-running AFK entry point.
- `src/ai-loop.ts` is the current autonomous evidence/report/prompt/agent/post-agent verification loop.
- `AI_LOOP_STATE.md` is the durable handoff and self-feedback file.
- `ai-runs/` is scratch evidence and should remain ignored.

## Initial audit

Before implementing improvements:

1. Run or inspect:

   ```bash
   git status --porcelain
   npm install
   npm run health
   ```

2. Verify that Codex can load the repo-local MCP server config.

3. Inspect `.codex/config.toml`. If needed, make it more robust for repo-local AFK usage. Prefer a config equivalent to:

   ```toml
   [mcp_servers.zork_unlimited]
   command = "npm"
   args = ["run", "mcp"]
   cwd = "."
   startup_timeout_sec = 20
   tool_timeout_sec = 60
   enabled = true
   required = true
   ```

   Only add options that are compatible with the installed Codex CLI/config schema. If an option is unsupported, remove it and document the reason in `AI_LOOP_STATE.md`.

4. Confirm that the MCP server exposes and successfully runs these tools:

   - `list_stories`
   - `validate_story`
   - `start_game`
   - `get_scene`
   - `choose_option`
   - `get_state`
   - `get_transcript`
   - `run_playtest`

5. If MCP fails, diagnose via CLI commands, fix the MCP path/config/server issue, and do not consider the setup complete until MCP play works.

## Primary objective

Upgrade the repo so `CODEX_HOME=$PWD/.codex ./loop.sh` can run as a durable AFK improvement loop.

The loop must be able to:

1. gather evidence,
2. test the game through MCP,
3. critique the playable experience,
4. choose one focused improvement,
5. implement it,
6. validate it,
7. record durable feedback for the next cycle,
8. leave the repo green,
9. commit/push only when safe and configured to do so.

The loop should become more adaptive over time instead of merely replaying one fixed route.

## Required MCP-driven playtesting behavior

The autonomous loop must use the MCP server as a real game-testing interface. Improve `src/ai-loop.ts`, `AI_AGENT_PROMPT.md`, `AGENTS.md`, tests, or MCP server behavior as needed so each meaningful cycle includes:

1. Story discovery:

   - call `list_stories`
   - select the main story, currently `stories/demo.yaml`

2. Story validation:

   - call `validate_story`
   - fail the cycle if validation has hard errors

3. Automated playtest evidence:

   - call `run_playtest` with random strategy
   - call `run_playtest` with coverage strategy
   - record ended/unfinished counts, ending distribution, visited scenes, unvisited scenes, and any suspicious path samples

4. True-ending regression play:

   - call `start_game`
   - repeatedly call `get_scene`
   - choose valid options through `choose_option`
   - reach `true_ending`
   - call `get_transcript`
   - fail post-agent verification if the true-ending route is broken

5. Exploratory play:

   - start a second save
   - choose actions based on visible scene text, objectives, inventory, and prior evidence
   - intentionally test at least one non-happy path, missed clue path, backtracking path, or risky ending path
   - call `get_transcript`
   - summarize what felt confusing, boring, unfair, under-signposted, too easy, or promising

The exploratory route must not be hard-coded forever. It should adapt based on random/coverage summaries, unvisited scenes, unfinished runs, recently changed content, and prior notes in `AI_LOOP_STATE.md`.

## Self-feedback and memory

Make the loop leave useful feedback for future cycles.

Durable feedback belongs in `AI_LOOP_STATE.md`; raw logs belong in ignored `ai-runs/`.

After each meaningful cycle, update `AI_LOOP_STATE.md` with:

- current objective,
- last completed improvement,
- evidence summary,
- MCP playtest notes,
- what improved,
- what still feels weak,
- highest-priority next task,
- risks/blockers,
- any repeated agent mistake that should be avoided next time.

Do not dump huge transcripts into `AI_LOOP_STATE.md`. Summarize them.

If the agent repeatedly makes the same mistake, update `AI_AGENT_PROMPT.md` or `AGENTS.md` with a concise rule that prevents recurrence.

## Adaptive decision policy

Each cycle should pick exactly one focused, high-impact improvement unless the repo is failing health checks.

Use this priority order:

1. If format/lint/tests/validation/MCP are failing, fix those first.
2. If the true-ending MCP route is broken, fix story logic or route discoverability first.
3. If coverage playtests miss scenes, fix graph reachability, conditions, or playtest strategy.
4. If random playtests have many unfinished runs, reduce confusing loops or improve guidance without removing meaningful backtracking.
5. If random playtests rarely find `true_ending` but coverage does, improve normal-player signposting and objective guidance.
6. If transcripts/reports are too weak for self-critique, improve transcript/report detail.
7. If all gates are green and feedback is clear, add one small story, system, UX, or polish improvement.
8. Only expand the story when validation, playtest summaries, and MCP transcripts can still explain coverage and player intent.

## Game-specific current priorities

For `Lantern in the Underpass`, prioritize improvements that preserve the current mystery/horror tone while making the true ending more naturally discoverable.

Important true-ending dependencies:

- the player needs the token,
- the player needs the fuse,
- the player needs Mara’s badge,
- the player needs to learn the release route,
- the player needs to clear Mara in the signal booth,
- then the player can pull the emergency release in the train car.

Improve discoverability through scene text, objectives, choice labels, transcript/report feedback, validation, or playtest strategy rather than by making the true ending trivial.

## Implementation targets to consider

Inspect first, then choose the smallest useful set. Good candidates include:

- improve `.codex/config.toml` for reliable repo-local MCP usage;
- add MCP server instructions or tool descriptions that make Codex’s game-testing workflow clearer;
- make `src/ai-loop.ts` run MCP validation/playtest tools directly, not only CLI equivalents;
- add an adaptive exploratory MCP play route generator;
- improve report structure so the next agent can quickly identify the highest-impact next task;
- improve transcript rendering so choices, objectives, inventory, flags, and endings are easier to critique;
- add tests for transcript/report/playtest behavior when practical;
- add a bounded smoke test for MCP or the AI loop if practical without making tests flaky;
- update `AI_AGENT_PROMPT.md` so future agents continue the loop correctly;
- update `AI_LOOP_STATE.md` with concise durable memory.

## Verification requirements

Before finishing:

Run:

```bash
npm run format:check
npm run lint
npm test
npm run cyoa -- validate stories/demo.yaml --json
npm run cyoa -- playtest stories/demo.yaml --runs 100 --strategy random --summary --json
npm run cyoa -- playtest stories/demo.yaml --runs 100 --strategy coverage --summary --json
npm run health
```

Also perform MCP playtesting:

- validate story through MCP;
- run random and coverage playtests through MCP;
- complete the true-ending route through MCP;
- perform at least one exploratory MCP route;
- read transcripts and write concise playtest feedback.

If direct Codex MCP tool access is unavailable in this session, use the repo’s MCP client/server code or CLI to diagnose, then fix the MCP configuration. Do not count the task complete until the MCP path is functional or the blocker is documented with a concrete next step.

## AFK launch readiness

The setup is complete only when a user can run:

```bash
CODEX_HOME="$PWD/.codex" AI_CODEX_SANDBOX=workspace-write ./loop.sh
```

and expect the loop to:

- install dependencies if missing,
- generate cycle evidence,
- hand the prompt to Codex when available,
- rerun health after agent work,
- perform MCP play verification,
- commit verified dirty changes if enabled,
- push verified commits if enabled,
- refuse unsafe dirty-baseline commits unless explicitly allowed,
- keep useful durable feedback in `AI_LOOP_STATE.md`.

For bounded testing, support:

```bash
CODEX_HOME="$PWD/.codex" AI_LOOP_MAX_CYCLES=1 ./loop.sh --once
```

or the closest equivalent supported by the current scripts.

## Commit behavior

If the environment supports committing and pushing:

- commit only coherent milestones;
- use a clear commit message;
- do not include ignored scratch files;
- do not commit if `npm run health` or MCP true-ending verification fails.

If the outer loop is configured to commit/push after you return, it is acceptable to leave verified changes uncommitted, but only if the tree is green and the final response clearly says what changed and what remains.

## Final response format

End with:

```markdown
## Current Plan

- Main objective:
- Why this matters:
- Tasks completed:
- Risks:

## Work Completed

- Changes made:
- Files/systems touched:
- New content/features added:

## Verification

- Commands run:
- MCP tools/routes tested:
- Result:
- Any failures/blockers:

## Playtest Notes

- What was tested:
- What worked:
- What felt bad/confusing:
- Bugs found:
- Next gameplay/design priority:

## Next Iteration

- Highest-priority next task:
- Reason:
- Planned action:
```

After the initial setup pass, the launch command I would use is:

```bash
CODEX_HOME="$PWD/.codex" AI_CODEX_SANDBOX=workspace-write ./loop.sh
```

For a bounded smoke test before leaving it AFK:

```bash
CODEX_HOME="$PWD/.codex" AI_CODEX_SANDBOX=workspace-write AI_LOOP_MAX_CYCLES=1 ./loop.sh --once
```

This is within realistic scope for current coding agents because the repo is not asking the agent to judge quality in isolation. It gives Codex deterministic gates, an MCP interface for actual game actions, transcript evidence, health checks, and a durable state file. The important limitation is that the loop must stay bounded, evidence-driven, and conservative about commits; otherwise "AFK" becomes unattended drift rather than autonomous improvement.

[1]: https://developers.openai.com/codex/noninteractive "Non-interactive mode - Codex | OpenAI Developers"
[2]: https://developers.openai.com/codex/mcp "Model Context Protocol - Codex | OpenAI Developers"
[3]: https://developers.openai.com/codex/learn/best-practices "Best practices - Codex | OpenAI Developers"
```
