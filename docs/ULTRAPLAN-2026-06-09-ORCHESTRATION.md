# Ultra-plan — AFK loop orchestration & reliability on Opus 4.8 / Claude Code CLI (2026-06-09)

**Target model:** Claude **Opus 4.8** (`claude-opus-4-8`). **Platform:** Claude Code CLI (headless `claude -p`).
**Status:** analysis + the single best safe change implemented this pass (content_new playtest redirect).
Loop paused at HEAD `8ffb3cd` (verified 0 procs) while this was written.

Synthesizes the full repo reality (verified in source) with June-2026 research and the **failure modes
observed live** across this session's runs. Companion docs: `ULTRAPLAN-2026-06-08-LOOP-EFFECTIVENESS.md`
(planning layer), `TOKEN-REDUCTION-ULTRAPLAN-2026-06-09.md` (token diagnostics).

---

## 1. How the loop actually runs today (verified)

- **Orchestrator** = a Claude Code session (me). It does NOT plan up front; it **re-assesses from scratch
  every cycle** and delegates strategic re-aiming to a saturation-triggered ultraplan. It launches
  `./loop.sh` via background Bash, watches git/log/proc state on a staged cadence, and on anomaly
  pauses→diagnoses→fixes→relaunches. Durable state: `ai-runs/orchestration-state.md`.
- **"Decide what to do next"** lives in `src/afk/assessor.ts::assess()` — a pure deterministic ranker
  over content_fix/content_new/engine/repo + 3 generator mint-and-check levers. Saturated → ultraplan.
- **Wrapper** `loop.sh`: `while true`: `npm run ai:loop` (assess + emit prompt) → `run_agent`
  (`claude -p --model sonnet --dangerously-skip-permissions`, prompt on stdin, `timeout` 2400s routine /
  3600s ultraplan / **3600s content_new**) → `npm run health` (BLOCKING) → `verify:integrity --against
  <pre-ref>` → `require_playtest_record` → commit → push. Circuit breaker = 5 consecutive no-progress.
- **Subagents:** (a) the **blind-playtest subagent** — a strong contract (objective: play blind; output:
  6 structured sections; tools: MCP-only via ToolSearch; boundary: never read content/src/ui/tests; stop:
  ending reached / report written). (b) the **ultraplan reviewers** — fan out ONLY when saturated; now
  bounded by the append-only `docs/DECISION_LOG.md` (the "already-settled" boundary they were missing).
  No subagent runs without objective/output/tools/boundary today.
- **One cycle (observe→plan→act→verify→iterate):** assess (observe+plan) → agent makes ONE change +
  mandatory blind playtest (act) → health + integrity + playtest-record gates (verify) → commit/push →
  next cycle (iterate). **Done/exit:** there is no global "done" — it runs until the circuit breaker (5
  consecutive no-progress) or an external stop. **On failure:** each gate is `|| return 1`, so a bad
  cycle skips its commit and the loop continues; a hung turn is bounded by `timeout`.
- **Verification gates:** `npm run health` (verify:integrity + tsc + eslint + prettier + ~2357 tests +
  validate all packs) is blocking; `verify:integrity --against <ref>` hard-blocks mechanical weakening;
  `require_playtest_record` blocks a commit with no quality signal. Strong, layered, anti-reward-hacking.
- **Logs / token tracking:** `AI_LOOP_STATE.md` (durable, rotated), `ai-runs/<id>/*`, `ai-runs/wrapper.log`,
  `ai-runs/orchestration-state.md`. **No in-repo token tracking** — cost is visible only via Claude Code
  transcript `usage` fields (orchestrator-aggregated: ~197M tokens/12h, 92.9% cache_read).

## 2. Failure modes OBSERVED this session (not theoretical)

1. **Polish treadmill** (assessor permanently saturated → ~30 one-instance content_fix cycles of the same
   "stale reactive description" class). **Addressed:** catch-the-class prompt nudge + the loop's own
   ultraplan raised `TARGET_PER_MODE` (bug_0332) → pivoted to authoring ~16 new packs.
2. **Ultraplan re-derived settled questions** (re-aim #19: SIX false alarms — already-implemented features
   re-confirmed by 6–8 agents). **Addressed:** append-only `docs/DECISION_LOG.md` boundary; re-aims #20/#21
   then recorded "False alarms: None."
3. **`TARGET_PER_MODE` self-raising trap** (ultraplan raised it 3× to current+, re-saturating each time).
   **Addressed:** anti-pattern recorded in DECISION_LOG.md; ceiling fixed at {cyoa:20,parser:16,rpg:16}.
4. **content_new authoring cycles hit the 2400s timeout** (twice) and were terminated mid-author.
   **Addressed:** content_new now gets the 3600s budget via the existing per-cycle override.
5. **Orphaned-agent / incomplete kill (CRITICAL, this session):** killing `loop.sh` + the `timeout … bash -c`
   wrapper does NOT kill the real worker `claude.exe -p --model sonnet`; it orphaned (parent=1), kept
   authoring, and would have self-committed/pushed past a pause boundary. **Addressed at the orchestrator
   layer** (corrected kill+rescan procedure in memory `[[afk-loop-orchestration]]`); a loop.sh code fix is
   ranked backlog #1 (needs careful, tested process-group work — risky to do blind on Windows MSYS).
6. **content_new packs never get the quality oracle at authoring time** — the playtest targets the
   regression baseline (watchtower_road), so ~16 authored packs shipped structurally-valid but
   experience-unchecked ("done but not really validated"). **FIXED THIS PASS** (see §5).
7. **Token waste (diagnostic):** 92.9% cache_read = round-trips × prefix; the blind playtest's sequential
   MCP calls dominate round-trips. Not a correctness failure; see the token-reduction doc for levers.

No stalls, context-loss/compaction, or unnecessary-subagent-spawns observed beyond the above.

## 3. Research synthesis (June 2026, primary sources)

- **Opus 4.8:** default effort high (xhigh/max for hard async); **~4× less likely to let its own code flaws
  pass** (→ in-cycle self-critique is cheap+effective); tool calling "fewer steps"; Dynamic Workflows
  (plan + many parallel subagents, verified against the test suite). 1M context, 14.5h task horizon.
- **Single vs multi-agent (Anthropic):** multi-agent uses **3–10× tokens**; "improved prompting on a single
  agent can achieve equivalent results"; coordination cost usually exceeds benefit; fan out ONLY genuinely
  independent subtasks; ~10 subagent cap. **→ the repo's boundary is correct: single-agent cycles for
  tightly-coupled coding; fan out only for the saturated ultraplan review. Keep it.**
- **Evaluator-optimizer / verifier loops:** `/goal` (Claude Code v2.1.139, May 2026) evaluates each turn
  with a fast model reading the transcript. Patterns: retry / reflection (critique before next pass) /
  memory (store a lesson). **→ self-critique gate = reflection loop ✓; decision ledger = memory loop ✓;**
  the deterministic health gate + blind playtest = the verifier.
- **Subagent contract = objective · output format · tool guidance · boundaries** ("miss any and it drifts").

## 4. The plan across the four layers

**Planning/orchestration:** keep deterministic-assessor + saturation-ultraplan. Done this session:
decision-ledger boundary, catch-the-class nudge, self-critique gate, fixed TARGET_PER_MODE ceiling. Keep
re-assess-each-cycle (no up-front master plan) — it suits a 1-improvement-per-cycle loop.

**Subagent spawning:** unchanged boundary (single-agent cycles; fan out only the independent ultraplan
review). Blind-playtest contract is strong. The one fix: point the content_new playtest at the new pack (§5).

**Verification gates:** strong already. Future: an LLM-judge "semantic weakening" evaluator to complement
verify:integrity's mechanical detection (backlog — bigger build). The content_new playtest redirect closes
the "valid-but-unplayed new pack" gate gap now.

**AFK reliability:** strong gates + breaker + timeout. The real hole is **clean shutdown** (orphaned worker).
Owned at the orchestrator layer now; a loop.sh process-group/trap fix is backlog #1.

## 5. Implemented this pass (best safe change now)

**content_new cycles blind-playtest the NEWLY AUTHORED pack, not the baseline** (`src/ai-loop.ts::buildPrompt`).
For content_new the pack doesn't exist at assess time, so `target` was just the regression baseline and the
quality oracle was spent re-playing watchtower_road. The prompt now flips the order for content_new: author
the pack → validate green → blind-playtest THAT pack → final polish → commit. Every new pack now ships
experience-tested. Pure prompt-layer change (no engine/schema/validator/hash touched); `npm run health` green.

*Not implemented now (deliberately):* the orphaned-agent loop.sh fix (risky/unverifiable blind — orchestrator
procedure covers it); LLM-judge evaluator (bigger build); token-reduction levers (separate doc, not the goal).

## 6. Ranked backlog (future)

1. **loop.sh clean shutdown / process-group kill** — run the agent in its own group (or PID-file + trap) so a
   single stop kills the `claude.exe` worker too. Highest reliability value; needs tested Windows-MSYS work.
2. **Per-cycle token instrumentation** → `ai-runs/<id>/cost.json` (RT, cache_read, output, est $). Makes the
   loop cost-observable; would catch caching-bug inflation. Low risk, diagnostic.
3. **LLM-judge semantic-weakening evaluator** — complements verify:integrity (which catches only mechanical
   tampering). Medium build; the documented honest-limit of the current bar.
4. **Programmatic-tool-calling for the FIXED regression playthrough only** — collapse its sequential MCP
   round-trips to ~1; keep the exploratory blind route reasoned (per-step reasoning is the oracle).
5. **Structural levers the loop's own ultraplan should pick** (NPC topic checkConds/checkUnsatisfiable,
   allGeneratorsClean, SKILL_CHECK_PHANTOM_STAT) — leave to the loop; tracked in DECISION_LOG.md.
6. **Fewer blind seeds on structurally-clean packs** — 1–2 suffice; gate on verdict trend.

**Not worth pursuing:** fanning out tightly-coupled content/engine edits to multiple agents (3–10× tokens,
no gain — research + repo agree); a global "done" state (an open-ended improvement loop has none by design —
the circuit breaker + saturation→ultraplan is the right "spinning?" detector); agent-teams for cycle work
(coordination cost ≫ benefit for single-file-per-cycle changes).
