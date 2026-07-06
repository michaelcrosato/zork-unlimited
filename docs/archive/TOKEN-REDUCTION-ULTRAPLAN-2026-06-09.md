# Ultra-plan — AFK loop token reduction on Opus 4.8 / Claude Code CLI (2026-06-09)

**Target model:** Claude **Opus 4.8** (`claude-opus-4-8`). **Platform:** Claude Code CLI (headless `claude -p`).
**Status: ANALYSIS ONLY — no code changes. Loop paused at HEAD `8ffb3cd` (0 procs).**

Supersedes/updates `docs/TOKEN-REDUCTION-ULTRAPLAN-2026-06-08.md` with (a) fresh **measured** telemetry
from the last 12h run, (b) verified repo facts, and (c) June-2026 primary-source web findings that
materially refine the prior plan's #1 and #2 levers.

---

## 1. How the system runs (verified in source, this session)

- **Orchestrator** (a Claude Code session = me): launches `./loop.sh` via **background Bash** (survives
  turns, auto-notifies on wrapper death), watches git/log/proc state on a staged cadence, and on
  anomaly pauses → diagnoses → fixes → relaunches. Durable state: `ai-runs/orchestration-state.md`.
- **Wrapper** `loop.sh`: `while true`: `npm run ai:loop` (assess) → `run_agent` (`claude -p --model
<sonnet> --dangerously-skip-permissions`, prompt on stdin, `timeout` 2400s routine / 3600s ultraplan
  **and now 3600s for content_new authoring**) → `npm run health` (BLOCKING) → `verify:integrity
--against <pre-ref>` → `require_playtest_record` → commit → push. Circuit breaker = 5 consecutive
  no-progress; 10s inter-cycle delay.
- **Assessor** `src/afk/assessor.ts` (deterministic): ranks content_fix/content_new/engine/repo
  candidates + 3 generator mint-and-check levers; saturated → ULTRAPLAN cycle (multi-agent re-aim,
  now reads the append-only `docs/DECISION_LOG.md` first to avoid re-deriving settled gaps).
- **Cycle agent** (`claude -p`): reads `ai-runs/<id>/prompt.md` (**measured 4.9 KB ≈ 1.2k tokens —
  BELOW Opus 4.8's 4096-token cache minimum, so it never caches**), runs the mandatory blind playtest,
  makes ONE verified change.
- **Blind subagent**: fresh, no repo access, plays the target pack **only** through
  `mcp__adventureforge__*` tools, writes `ai-runs/<id>/playtest.md`. EVERY cycle.
- **MCP surface** `src/mcp/tools.ts` (**924 lines ≈ 40 KB**) + `server.ts` (302) = **22 tools**.
- **Logs:** `AI_LOOP_STATE.md` (durable, newest-first, rotated to ~15 entries → gitignored archive);
  `ai-runs/<id>/{assessment,prompt,playtest}.md` + `latest-cycle.json`; `ai-runs/wrapper.log`.
- **Token tracking:** **NONE in-repo.** Cost is observable ONLY via the Claude Code transcript JSONL
  `usage` fields (`~/.claude/projects/C--dev-zork-unlimited/*.jsonl`). The loop is cost-blind.

## 2. Measured telemetry (this run, last 12h, 31 transcripts)

| Class        | Tokens     | Share                               |
| ------------ | ---------- | ----------------------------------- |
| cache_read   | **183.1M** | **92.9%**                           |
| cache_create | 9.9M       | 5.0%                                |
| output       | 4.1M       | 2.1%                                |
| input        | 0.1M       | 0.1%                                |
| **total**    | **197.1M** | across **2,128 assistant messages** |

**The governing equation: `cache_read ≈ messages × cached-prefix-size`.** 183.1M ÷ 2,128 ≈ **~86k cached
tokens re-read per message**. Token cost is **round-trips × prefix**, and round-trips alone multiply
**92.9%** of all tokens. Output is 2.1% of tokens but (on Opus rates) ~30% of _cost_. cache_create
(9.9M) is the per-cycle **cold start** — every cycle is a fresh `claude -p`.

**Shift since 2026-06-08:** the loop pivoted from one-line content*fix to authoring whole packs
(content_new). Authoring cycles are output-heavier and longer (output share rose 1.3% → 2.1%; one hour
hit 535k output) and run ~40 min with many round-trips — so round-trip and output levers matter \_more*
now than in the prior plan.

## 3. June-2026 web findings that refine the plan (primary sources)

- **Programmatic Tool Calling (PTC)** — Anthropic: **37%** token cut on complex research (43.6k→27.3k).
  Wins on "**multi-step workflows with 3+ dependent tool calls**", parallel ops, and "**tasks where
  intermediate data shouldn't influence reasoning**" (only the aggregate returns). **Does NOT help**
  "simple single-tool invocations" or "tasks where Claude should reason about all intermediate
  results"; τ²-bench (one tool call/turn) was unchanged and **+8% cost**. Production: 10–49-tool arrays
  see **20–40%** savings.
- **Tool Search Tool (TST)** — Anthropic: **85%** tool-schema reduction (58 tools 55K→8.7K; ~500 tokens
  for the search tool + ~3K per loaded tool). Use when tool defs >10K tokens / 10+ tools / multi-server
  MCP. **Caveat for this repo:** Claude Code CLI (June 2026) **already defers MCP tool schemas** — in
  this very session `mcp__adventureforge__*` arrived as _deferred_ tools fetched on demand. So the prior
  plan's assumption ("22 schemas re-read on every message") is **likely already mitigated** and must be
  re-measured, not assumed.
- **MCP cache hygiene** — connecting/disconnecting an MCP server mid-session **wipes the entire prompt
  cache**; each server adds ~10–20K schema tokens. (Moot per-cycle here — each cycle is a fresh
  `claude -p` — but a reason to keep the prefix byte-identical and never toggle MCP mid-cycle.)
- **Opus 4.8** — tool calling "meaningfully more efficient, fewer steps"; `effort` low→max (default high)
  trades tokens for depth; 3× cheaper fast mode; context editing / compaction available.

## 4. Ranked token-reduction levers (analysis; estimates directional)

**#1 — Cut round-trips; script ONLY the non-reasoning portions (code-exec/PTC).** Round-trips multiply
92.9% of tokens; the densest source is the blind playtest's 15–30 sequential MCP calls/seed. Refinement
forced by the PTC evidence: the **known-good regression route is a FIXED action list** → 3+ dependent
calls, no per-step reasoning → PTC's sweet spot → run it as ONE scripted replay. The **exploratory route
must stay reasoned round-trips** — its per-step LLM judgment _is_ the quality oracle; scripting it is the
exact "Claude should reason about all intermediate results" anti-case (and τ²-bench shows no benefit).
Net: ~halve blind-playtest round-trips with zero quality loss. Effort M; risk low (additive; the
exploratory oracle is untouched).

**#2 — MEASURE the ~86k/msg prefix, THEN cut it (don't assume).** Prior plan blamed the 22 MCP schemas;
but CLI already defers them. So FIRST inspect a cycle transcript's cached content: (a) if schemas are
loaded upfront → mark them `defer_loading` / lean on TST (85% schema cut); (b) if already deferred →
the prefix is system prompt + CLAUDE.md + **conversation growth**, so trim CLAUDE.md/system context and
apply **context editing** to clear consumed MCP observations mid-cycle. Either way it multiplies across
2,128 messages. Effort S (measure) then M (act); risk low.

**#3 — Right-size model per role + cut output + warm the cross-cycle cache.** (a) Blind playtest is
mechanical → **Haiku 4.5 / Opus fast mode** (runs every cycle, ~40% of RT); keep the improvement agent
on **Opus 4.8**. (b) Output is ~30% of Opus _cost_ → terse-default + `effort high` (not max); the
self-critique/terseness prompt nudges already added help. (c) Each cycle is a cold `claude -p` (9.9M
cache_create/12h) → keep the system+tools prefix byte-identical and use a **1-h cache TTL / pre-warm** so
consecutive cycles (10s apart) reuse a warm cache. Effort S–M; risk low–medium (spot-check Haiku verdict
quality before trusting).

**#4 — Add token instrumentation (enabling lever).** No in-repo tracking today. A post-cycle step that
parses the cycle transcript's `usage` → `ai-runs/<id>/cost.json` (RT, cache*read, output, est $) makes
every lever above measurable and catches regressions (e.g., the March-2026 caching bug that silently
inflated tokens 10–20×). Effort S; risk none. \_Do this first — it is the measurement substrate.*

**#5 — Fewer blind seeds on clean packs.** Validator + exhaustive solver already prove structure; 1–2
seeds suffice for the experience read on a structurally-clean pack. Effort S; gate on verdict-trend.

**#6 — Don't pipe verify/test noise to the agent.** Already clean (health is a gate, not agent context).
Keep it that way.

## 5. Honest caveats

- The decisive unknown is **what actually composes the ~86k/msg prefix** under CLI's current deferred-
  tools behavior. Lever #2 is measurement-gated for exactly this reason; #4 unblocks it.
- Scripting the exploratory blind route would cut tokens but **destroy the quality oracle** — explicitly
  out of scope. PTC is applied only to the non-reasoning regression replay.
- Haiku for the blind playtest must keep producing discerning structured reports — spot-check before trusting.

## 6. Top 3 (reported to the user)

1. **Cut round-trips by scripting only the fixed regression route (PTC), keeping the exploratory blind
   route reasoned.** Attacks the 92.9% cache_read line at its densest source; ~halves blind-playtest RT
   with zero quality loss.
2. **Measure-then-shrink the ~86k/message cached prefix (Tool Search / context editing).** Biggest
   multiplicative cut, but CLI may already defer MCP schemas — measure the prefix first (lever #4).
3. **Right-size model per role + terse output + warm cross-cycle cache.** Blind playtest on Haiku/fast
   mode; Opus 4.8 + terse/effort-high for the improvement agent; 1-h cache TTL across the 10s-apart cycles.
