# blind-tester — subscription-only blind playtesting over MCP

A self-contained harness that has a frontier model **play an AdventureForge game
blind** — through the MCP server, with no access to the source — and write a
ruthless first-time-player critique. It runs on your **Claude Code subscription via
the `claude` CLI**: **no `ANTHROPIC_API_KEY`, no metered/billed API usage.**

## Why no API key

There are two different ways a model touches this project, with different auth:

|                       | Authoring (`adapt_story`)                 | **Blind playing (this harness)**         |
| --------------------- | ----------------------------------------- | ---------------------------------------- |
| Who calls the model   | the repo's own code, in-process           | an **external** agent CLI, as a client   |
| How it reaches Claude | HTTP to `api.anthropic.com` (`x-api-key`) | the `claude` CLI = **your subscription** |
| Needs an API key      | yes (metered)                             | **no**                                   |

This harness is the right-hand column: the model is an external player that reaches
the game **only** through the `mcp__adventureforge__*` MCP tools. That uses your
subscription allowance, which is the best value — exactly per the project goal.

## Two blind modes

- **Overworld mode (the DEFAULT):** the genuine _new-player_ test. The agent
  starts the **core game** — the New York open world — from a fresh start in the
  starting town, orients, discovers local work by scouting/talking/exploring,
  travels a road (resolving encounters), and discovers+plays a quest through the
  overworld→quest bridge, then reports on the _opening experience_. This is "how
  does a first-time player actually experience the game," not a quest snippet.
- **Quest mode (`--quest <id>`, targeted/legacy):** drop the agent straight into
  one shipped quest and have it play that quest to an ending. Kept for testing a
  specific piece of content (this is what the AFK loop runs each cycle on the
  quest it just changed) — it is NOT how a new player meets the game, so it is
  never the default.

## Quickstart

```bash
# 0) Prove the MCP path works — NO LLM, NO tokens (the reliability backbone).
#    The smoke covers BOTH start surfaces: the overworld core game and a quest drop-in.
npm run blind:smoke

# 1) The default blind playtest — the CORE GAME open world from a fresh start:
npm run blind

# 2) Same, watched live:
npm run blind --spectate                  # then `npm run spectate` in another terminal

# 3) Targeted quest mode — blind-test ONE shipped quest (what the AFK loop uses):
npm run blind --quest=sunken_barrow --seed=11

# Custom source/model without npm argument-forwarding warnings:
bash blind-tester/run.sh --smoke --quest sunken_barrow --seed 11
bash blind-tester/run.sh --quest sunken_barrow --seed 11 --model opus
bash blind-tester/run.sh --model opus     # overworld (default), opus player
```

The report is written to `blind-tester/reports/<stamp>_<source>_seed<n>.md`
(`<source>` is `overworld` for the default core-game run, or the quest id)
(and the raw `--output-format json` envelope alongside as `.json`). `reports/` is
gitignored.

## Watching a playthrough live (spectate mode)

To see what the LLM is doing while it plays — and verify it with your own eyes —
run the playtest in spectate mode and tail the feed from a second terminal:

```bash
# terminal 1: the playtest, with a 1.5s pause per tool response so a human can follow
npm run blind -- --spectate --delay-ms 1500

# terminal 2: the live feed (every tool call: args + the scene the agent saw)
npm run spectate
```

The feed (default `ai-runs/spectate.log`, gitignored) is written by the MCP
server itself, so it works for ANY client — not just blind runs. To spectate any
MCP session, start the server with `npm run mcp -- --spectate [path]
--spectate-delay-ms <n>` (or env `AF_SPECTATE=1|<path>`,
`AF_SPECTATE_DELAY_MS=<n>`). The delay paces every tool response; leave it off
for a full-speed feed. Spectate is fully inert when not enabled.

## Platforms

Works natively on Linux, macOS, WSL, and Windows (PowerShell, cmd, or Git Bash —
`npm run blind` resolves Git Bash itself, so the System32 WSL `bash.exe` can
never hijack the run).

**Passing flags from PowerShell:** PowerShell strips a bare `--` (it's PS's own
end-of-options token), after which npm eats `--flags` as npm configs. The
launcher recovers them automatically, but the reliable shapes are the equals
form without `--` — `npm run blind --quest=breaking_weir --spectate
--delay-ms=1500` — or `BLIND_*` env vars. In Git Bash / Linux / macOS,
`npm run blind -- --quest breaking_weir` also works as usual. A bad quest id is
rejected before any tokens are spent. One Windows-specific rule the harness already handles:
the MCP server launch never relies on the client honoring a `cwd` field
(`npm --prefix` self-cds instead), because the Claude CLI on Windows silently
ignores stdio-server `cwd`. Note a checkout `npm install`-ed on Windows cannot
run under WSL's Linux node (native esbuild binary mismatch) — the runner detects
this and says so instead of failing cryptically.

## Telemetry — measured, not guessed

Every completed run appends one JSONL row (turns, duration, token usage, the
run's NOMINAL API cost — the subscription covers it; it's an efficiency signal,
not a bill) to the gitignored `ai-runs/blind-telemetry.jsonl`:

```bash
npm run blind:telemetry     # per-source summary: runs, mean turns/minutes, tokens, nominal $
```

Recording is best-effort (a telemetry failure never fails the run) and only
happens on the built-in `claude` path — a `BLIND_AGENT_CMD` override produces
no claude envelope to measure.

## How blindness is enforced (two levels)

1. **No source access (interface-level).** The agent runs from an isolated temp
   directory and is restricted to the `mcp__adventureforge__*` tools; every file,
   shell, and web tool is explicitly disallowed. It cannot read `content/*.yaml`,
   `src/`, or even the repo's `CLAUDE.md`/`AGENTS.md` — only the observations the
   tools return. The MCP server itself is launched with cwd = the game root so packs
   still resolve.
2. **No observation leakage (data-level, optional, future).** The raw observation can
   still expose a little structure (e.g. world route metadata). For _maximal_
   blindness, mask it — this is exactly the `blind-facade` approach the sibling repo
   `zork-unlimited-3` built. Level 1 alone is already a legitimate blind playtest;
   level 2 is the tightening, tracked as future work.

This mirrors the canonical procedure in [`docs/blind_playtest_protocol.md`](../docs/blind_playtest_protocol.md);
the prompt in [`prompt.md`](./prompt.md) reuses its report format (clarity/enjoyment
1-5, severity-tagged findings) so reports are comparable to the AFK loop's.

## Files

- `run.sh` — the runner: builds the MCP config (server at game-root cwd), fills the
  prompt, runs `claude -p` from an isolated dir, saves the report. `--smoke` skips
  the LLM.
- `smoke.mjs` — token-free MCP smoke test via the MCP SDK client: spawn server,
  `tools/list`, `start_world_quest`, step a few actions, assert. Run
  this anytime to verify the plumbing without spending budget.
- `prompt.md` — the locked-down blind player prompt (start instruction / seed filled
  by the runner).
- `reports/` — run outputs (gitignored).

## Options

```
--quest <id>     targeted quest mode: blind-test ONE shipped quest by id (a dev/QA drop-in)
                 (without it, the run plays the CORE GAME open world — the default)
--seed <n>       deterministic seed (default: 7)
--model <alias>  claude model alias: sonnet (default, best value) | opus
--out <prefix>   report path prefix (default: reports/<stamp>_<source>_seed<n>)
--smoke          run the no-LLM MCP smoke test instead of a real playtest
--overworld      explicit form of the default core-game mode (rejects a --quest mix)
--spectate       write the human-watchable feed (watch with: npm run spectate)
--delay-ms <n>   pace every tool response by n ms (implies --spectate)
```

Environment: `BLIND_QUEST_ID`, `BLIND_MODEL`, `BLIND_TIMEOUT` (seconds, default 900),
`BLIND_SPECTATE=1`, `BLIND_SPECTATE_DELAY_MS`, `BLIND_BASH` (Windows: path to Git
Bash if auto-detection fails).

## Provider-agnostic — bring another agent (e.g. Codex or a local LLM)

The default agent is `claude -p`. To use a different MCP-capable agent CLI, set
`BLIND_AGENT_CMD`: it receives the prompt on **stdin** and these env vars:
`BLIND_MCP_CONFIG` (path to the generated MCP config), `BLIND_QUEST_ID`,
`BLIND_SEED`.

```bash
BLIND_AGENT_CMD='codex exec --ignore-user-config --ephemeral --skip-git-repo-check --sandbox read-only -' npm run blind --quest=tide_mill --seed=137
BLIND_AGENT_CMD='gemini -p' npm run blind
```

When `BLIND_AGENT_CMD` invokes `codex`, the runner temporarily shadows `codex` on
`PATH` and injects the AdventureForge MCP server with Codex `-c` overrides. No
user-level `codex mcp add` or project trust is required for blind runs.

**Future — local LLM.** This game is small and its action space is structured, so a
local model (served via an MCP-capable runner) may be able to play and critique it
for $0 and fully offline. The smoke test + `BLIND_AGENT_CMD` seam are the integration
points; if a local model proves too weak, the subscription path here remains the
reliable default with no loss of effectiveness.
