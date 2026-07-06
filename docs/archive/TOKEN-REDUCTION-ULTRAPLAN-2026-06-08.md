# Ultra-plan — AFK loop on Opus 4.8, token/cost reduction (2026-06-08)

**Status: ANALYSIS ONLY. No code changes made. The loop is paused (HEAD 201d41f).**

This plan synthesizes (a) an end-to-end read of how the loop actually runs, (b) ground-truth
token telemetry from this session's transcripts, and (c) current (2026-06-08) facts about
Claude Opus 4.8, Claude Code, and the June 15 billing change. It exists to make the loop
runnable on **Opus 4.8 (the target model)** without the cost becoming the bottleneck.

---

## 1. How the system actually runs (verified in source)

**Orchestrator (me) → wrapper → assessor → cycle agent → blind subagent → verify → commit.**

- **Orchestrator**: a Claude Code session drives the loop via `ScheduleWakeup` ticks, watches
  git/log/process state, and on anomaly does pause → diagnose → fix → relaunch → restart.
  Durable orchestrator state lives in `ai-runs/orchestration-state.md` (gitignored).
- **Wrapper** `loop.sh`: `while true`: `npm run ai:loop` (assess) → `run_agent` (`claude -p
--model <m> --dangerously-skip-permissions`, timeout 2400s routine / 3600s ultraplan, prompt
  piped on stdin) → `npm run health` (BLOCKING) → `verify:integrity --against <pre-ref>` →
  `require_playtest_record` → commit → optional push. Circuit breaker = 5 consecutive
  no-progress cycles; 10s inter-cycle delay.
- **Assessor** `src/afk/assessor.ts` (deterministic, no network/clock/RNG): ranks
  content_fix/content_new/engine/repo candidates; rotates the mandatory blind playtest onto the
  least-recently-attended pack (the recency parser is `parseAttendanceOffsets`; bug_0293 fixed
  its 3rd lock-in). When saturated → ULTRAPLAN cycle (multi-agent re-aim, ~8-cycle cooldown).
- **Cycle agent** (`claude -p`): reads the ~2.5–4 KB `ai-runs/<id>/prompt.md`, runs the
  MANDATORY blind playtest, makes ONE verified improvement.
- **Blind subagent**: fresh, no repo access, plays the target pack **only** through
  `mcp__adventureforge__*` tools, writes `ai-runs/<id>/playtest.md` (~5–10 KB). Runs EVERY cycle.
- **MCP surface** `src/mcp/server.ts` + `tools.ts` (**40 KB**, 22 tools): validate/list/load,
  new/start_game, get_observation/get_scene/list_legal_actions/step_action/choose_option,
  get_state/get_transcript, save/load, generate×3, replay/inspect_trace, adapt_story,
  apply_content_patch. Results are **not truncated**.
- **Logs**: `AI_LOOP_STATE.md` (durable, newest-first, trimmed to ~15 entries → archive),
  `ai-runs/<id>/{assessment.md,prompt.md,playtest.md,latest-cycle.json}`, `ai-runs/wrapper.log`.

## 2. Ground-truth token telemetry (this session, last 12h, 48 transcripts)

| Class            | Tokens                     | Notes                                                   |
| ---------------- | -------------------------- | ------------------------------------------------------- |
| cache_read       | **241.1M (94%)**           | re-read of the cached prefix on every assistant message |
| cache_create     | 11.83M                     | fresh `claude -p` per cycle ⇒ cold cache (~268k/cycle)  |
| output           | 3.42M                      | the actual generation                                   |
| input (uncached) | 0.21M                      |                                                         |
| **total**        | **256.6M / 12h (~21M/hr)** | across **3,121 assistant messages**                     |

**The decisive ratio: 256.6M ÷ ~44 cycles ≈ 5.8M tokens/cycle; ~71 assistant messages/cycle
× ~77k cached tokens re-read per message ≈ 5.5M cache-read/cycle.** The cost is _round-trips ×
prefix size_, not prompt size. The per-cycle `prompt.md` (<1k tokens) is even **below Opus 4.8's
4096-token cacheable minimum** — it never caches; the big cached prefix is **system prompt + the
22 MCP tool schemas**, re-read on all 3,121 messages.

## 3. Cost context — why this is urgent (current as of 2026-06-08)

**Same measured 12h token profile, different model rates:**

| Model                        | $/12h    | $/hr    | ~$/day   | ~$/week    |
| ---------------------------- | -------- | ------- | -------- | ---------- |
| Sonnet 4.6 (current default) | $169     | $14     | $337     | $2,361     |
| **Opus 4.8 (target)**        | **$281** | **$23** | **$562** | **$3,935** |
| Haiku 4.5                    | $56      | $5      | $112     | $787       |

- **Opus 4.8 ≈ 1.67× Sonnet 4.6** on the same profile (and likely _more_ — Opus 4.8 counts
  tokens higher and reasons more per step, so output + round-trips rise unless tuned).
- **Opus 4.8 cost shares:** cache*read **43%**, output **30%**, cache_write **26%**, input ~0%.
  (Output is ~1% of \_tokens* but ~30% of _cost_ at $25/M — so output reduction punches above its
  token weight.)
- **June 15, 2026 (7 days out):** headless Claude Code / Agent SDK / Claude Code GitHub Actions
  move OFF subscription limits onto a **separate metered monthly credit at API rates**.
  Interactive terminal sessions are unaffected. **This loop is headless `claude -p`** — after
  June 15 every cycle is real metered spend. Audit usage and enable caching discipline before then.
- **Opus 4.8 specifics that matter here:** model id `claude-opus-4-8`; 1M context, 128K output,
  no long-context premium; adaptive thinking only (`budget_tokens`/`temperature`/`top_p`/`top_k`
  all 400); `effort` low|medium|high|xhigh|max (Claude Code default high) — lower effort ⇒
  **fewer, more-consolidated tool calls + less preamble** (directly attacks round-trips AND
  output); cache read ≈ 0.1× input ($0.50/M), cache write 1.25× 5-min / 2× 1-h; min cacheable
  prefix 4096 tokens; Tool Search appends schemas (cache-preserving); context editing + compaction
  available; Opus 4.8 narrates MORE by default (add a silence-default), under-reaches for
  subagents/memory/custom-tools (state when to use them), asks more on small decisions.

## 4. Ranked token-reduction levers (analysis; estimates are directional)

> Estimates assume the run moves to Opus 4.8. "RT" = LLM round-trips (assistant messages).
> Saving cache_read scales with RT × prefix size; saving output scales at the $25/M rate.

**#1 — Cut round-trips per cycle (attacks the 43%-of-cost cache_read line head-on).**
~71 RT/cycle is the multiplier on 94% of all tokens. Sub-levers, highest first:

- **Programmatic Tool Calling (PTC) for the blind playthrough.** The blind subagent fires
  15–30 sequential `step_action`/`get_observation` calls per seed — each a round-trip that
  re-reads the whole prefix. Run the playthrough as ONE script in the code-execution container:
  intermediate observations stay in the script, only the final structured report returns to
  context. Collapses ~20–60 RT into ~1. Biggest structural win; needs the play loop expressed
  as code against the MCP tools.
- **`effort: high` (not xhigh/max) on the main agent**, `low`/`medium` on routine content
  cycles. Lower effort = fewer, consolidated tool calls by construction.
- **Fewer blind seeds/probes.** Protocol runs up to 3 seeds; the validator + exhaustive solver
  already prove structure, so 1–2 seeds suffice for the experience read on clean packs.
  Rough impact: cutting RT ~40–60% cuts ~40–60% of total tokens.

**#2 — Shrink the per-message cached prefix (Tool Search + trim MCP schemas).**
Every one of ~3,121 messages re-reads system prompt + all 22 MCP schemas (`tools.ts` = 40 KB).
The blind subagent uses ~9 of 22 tools; the cycle agent a different subset. Load only the needed
tools via **Tool Search** (schemas appended on demand, preserving the cached prefix), and trim the
verbose tool descriptions. Smaller base × thousands of messages = large multiplicative cut on the
cache_read line. Structural, low behavioral risk.

**#3 — Right-size model per role + cut output.**

- **Blind playtest on Haiku 4.5** (≈5× cheaper than Opus on every class). It's a mechanical
  play-through, not a reasoning task, and runs EVERY cycle (~40% of RT). Keep the main
  improvement agent on Opus 4.8. This is the Anthropic-recommended cheaper-subagent pattern.
- **Terser output.** Output is ~30% of Opus cost. Add a silence-default to the agent prompt
  (Opus 4.8 narrates more than 4.7 by default) and keep `effort` at `high`.

**#4 — Cache hygiene across cycles.** Each cycle is a cold `claude -p` (11.8M cache_create/12h).
Ensure the system+tools prefix is byte-identical cycle-to-cycle (no clock/UUID/unsorted-JSON
invalidators), and consider pre-warming / 1-h TTL so consecutive cycles (10s apart) reuse a warm
cache. Caveat: fresh-context-per-cycle is an intentional clean-handoff design — verify a shared
prefix doesn't leak state.

**#5 — Context editing / compaction within long (ultraplan) cycles.** Clear stale MCP
observations/tool-results once consumed so the prefix stops growing mid-cycle.

**#6 — Don't pipe verify/test noise into the agent.** Already clean (health is a gate, not agent
context). Keep it that way; never let 1,900-test output reach the model.

**#7 — Trim what the agent reads.** Enforce ranged file reads; avoid re-reading large packs;
don't surface full `get_transcript`/generated-pack payloads when a summary suffices.

## 5. Implementation roadmap (phased; each phase health-gated, trust-but-verify)

All work stays inside the loop's existing discipline: one change, `npm run health` green,
`verify:integrity` not weakened, mandatory playtest preserved, commit + push.

- **Phase 0 (do first, before June 15):** switch the cycle model to `claude-opus-4-8` with
  `effort: high`; put the blind subagent on `claude-haiku-4-5`. Measure one cycle's usage via the
  transcript telemetry method in this doc. (Lever #3 — biggest immediate $/cycle drop, lowest risk.)
- **Phase 1:** Tool Search for both agents; trim MCP tool descriptions in `tools.ts`. (Lever #2.)
- **Phase 2:** PTC blind playthrough — express the seed playthrough as a code-execution script.
  (Lever #1, biggest structural win; most engineering.)
- **Phase 3:** cache-prefix hygiene audit + pre-warm/1-h TTL; context editing in ultraplan cycles.
  (Levers #4, #5.)
- After each phase: re-run the 12h telemetry aggregation and compare $/cycle and RT/cycle.

## 6. Risks / guardrails

- Lowering `effort` or seeds could reduce bug-finding — gate on the playtest verdict trend and the
  per-cycle fix rate; revert if quality drops.
- Tool Search / PTC must not change game behavior or weaken the verifier — additive only;
  `verify:integrity` stays the bar.
- Haiku for the blind playtest: confirm it still produces structured, discerning reports (spot-check
  verdict quality for several cycles before trusting).
- Cache-sharing across cycles must not leak prior-cycle state into a "fresh" blind player.

## 7. Open data the orchestrator can't see from here

- Real Opus 4.8 per-cycle token counts (Opus counts higher than Sonnet) — measure in Phase 0.
- Whether the org is on subscription vs API credits today, and the post-June-15 credit budget.
