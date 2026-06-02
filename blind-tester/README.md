# blind-tester — subscription-only blind playtesting over MCP

A self-contained harness that has a frontier model **play an AdventureForge game
blind** — through the MCP server, with no access to the source — and write a
ruthless first-time-player critique. It runs on your **Claude Code subscription via
the `claude` CLI**: **no `ANTHROPIC_API_KEY`, no metered/billed API usage.**

## Why no API key

There are two different ways a model touches this project, with different auth:

| | Authoring (`adapt_story`) | **Blind playing (this harness)** |
| --- | --- | --- |
| Who calls the model | the repo's own code, in-process | an **external** agent CLI, as a client |
| How it reaches Claude | HTTP to `api.anthropic.com` (`x-api-key`) | the `claude` CLI = **your subscription** |
| Needs an API key | yes (metered) | **no** |

This harness is the right-hand column: the model is an external player that reaches
the game **only** through the `mcp__adventureforge__*` MCP tools. That uses your
subscription allowance, which is the best value — exactly per the project goal.

## Quickstart

```bash
# 0) Prove the MCP path works — NO LLM, NO tokens (the reliability backbone):
npm run blind:smoke -- --pack content/cyoa/pack/watchtower_road.yaml --seed 7

# 1) Run a real blind playtest on your subscription (default: watchtower, seed 7):
npm run blind                                  # or:
npm run blind -- --pack content/parser/pack/sealed_crypt.yaml --seed 11 --model opus
```

The report is written to `blind-tester/reports/<stamp>_<pack>_seed<n>.md` (and the
raw `--output-format json` envelope alongside as `.json`). `reports/` is gitignored.

## How blindness is enforced (two levels)

1. **No source access (interface-level).** The agent runs from an isolated temp
   directory and is restricted to the `mcp__adventureforge__*` tools; every file,
   shell, and web tool is explicitly disallowed. It cannot read `content/*.yaml`,
   `src/`, or even the repo's `CLAUDE.md`/`AGENTS.md` — only the observations the
   tools return. The MCP server itself is launched with cwd = the game root so packs
   still resolve.
2. **No observation leakage (data-level, optional, future).** The raw observation can
   still expose a little structure (e.g. a parser exit's destination). For *maximal*
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
  `tools/list`, `start_game`, step a few actions, assert. Run this anytime to verify
  the plumbing without spending budget.
- `prompt.md` — the locked-down blind player prompt (`__PACK__` / `__SEED__` filled
  by the runner).
- `reports/` — run outputs (gitignored).

## Options

```
--pack <path>    content pack to test (default: content/cyoa/pack/watchtower_road.yaml)
--seed <n>       deterministic seed (default: 7)
--model <alias>  claude model alias: sonnet (default, best value) | opus
--out <prefix>   report path prefix (default: reports/<stamp>_<pack>_seed<n>)
--smoke          run the no-LLM MCP smoke test instead of a real playtest
```

Environment: `BLIND_MODEL`, `BLIND_TIMEOUT` (seconds, default 900).

## Provider-agnostic — bring another agent (e.g. a local LLM)

The default agent is `claude -p`. To use a different MCP-capable agent CLI, set
`BLIND_AGENT_CMD`: it receives the prompt on **stdin** and these env vars:
`BLIND_MCP_CONFIG` (path to the generated MCP config), `BLIND_PACK`, `BLIND_SEED`.

```bash
BLIND_AGENT_CMD='gemini -p' npm run blind
```

**Future — local LLM.** This game is small and its action space is structured, so a
local model (served via an MCP-capable runner) may be able to play and critique it
for $0 and fully offline. The smoke test + `BLIND_AGENT_CMD` seam are the integration
points; if a local model proves too weak, the subscription path here remains the
reliable default with no loss of effectiveness.
