# The AdventureForge AFK loop

An autonomous improvement loop that **constantly evaluates the next-best
improvement** across the whole project, makes one focused change per cycle, takes
**mandatory LLM-playtest quality feedback every cycle**, and lands it under
**trust-but-verify** (see `AGENTS.md`). It draws on the agent's broad knowledge to
_choose and craft_ improvements, and on the deterministic verification suite to
_prove_ they're correct.

## One cycle

```
loop.sh  (outer driver — orchestration + the bar)
│
├─ 1. ASSESS        npm run ai:loop → src/ai-loop.ts (uses src/afk/assessor.ts)
│     Deterministically scans every pack (all modes) + repo signals and ranks
│     improvement candidates across four categories:
│        content_fix · content_new · engine · repo
│     Emits: ai-runs/<id>/{assessment.md, prompt.md} plus latest-cycle.json at
│     the ai-runs/ root (which records the quest/source to playtest and where
│     the playtest report must go).
│
├─ 2. WORK          the operating agent (claude -p / codex exec / Agent tool)
│     Reads the cycle prompt and:
│       a. MANDATORY LLM PLAYTEST — spawns a fresh, no-context subagent that plays
│          the cycle's target — the CORE GAME (overworld fresh start; the baseline
│          for engine/repo cycles and the default `npm run blind`) or one targeted
│          quest — purely through the mcp__adventureforge__* tools
│          (docs/blind_playtest_protocol.md) and writes a structured report
│          (route, mechanics, clarity 1-5, enjoyment 1-5, findings, verdict, and
│          the mandatory fenced json exit-interview block — reports without a
│          schema-valid block are rejected by src/blind/report_verifier.ts) to
│          the path in latest-cycle.json. This is the per-cycle quality signal.
│       b. ONE improvement — content edit / apply_content_patch, or an engine/repo
│          change (full authority; new mechanics need no §14 ceremony, but stay
│          verified). Bugs get a traces/bugs/ artifact + a tests/regression/ test.
│
├─ 3. VERIFY        the bar, all blocking (a red gate reverts the cycle's scratch
│                    to the pre-cycle ref, skips the commit, and the outer loop
│                    continues under circuit breakers — see Failure handling):
│       npm run health            (verify:integrity + typecheck + lint +
│                                  format:check + tests + ui:typecheck + validate)
│       verify:integrity --against <pre-cycle ref>   (don't route around the verifier:
│                                                      hard-block only on weakening —
│                                                      deleted/disabled tests, dropped
│                                                      test count, or a re-pin with no
│                                                      content change; legit re-pins warn)
│       require_playtest_record    (no blind-playtest report ⇒ no commit)
│
└─ 4. COMMIT/PUSH   git add -A && commit (scope is free — trust; but only after the
       bar passed — verify). Both are env-gated: AI_LOOP_COMMIT=1 to commit,
       AI_LOOP_PUSH=1 to push. Note: a bare push of a fresh commit to protected
       main is always rejected (the required 'verify' check can't have run yet) —
       land loop commits via a scratch branch/PR and leave AI_LOOP_PUSH=0.
       Durable handoff in AI_LOOP_STATE.md.
```

**Failure handling.** loop.sh refuses to start on a dirty tree (AI_LOOP_ALLOW_DIRTY=1
overrides, accepting the risk below). Each red gate fails the cycle explicitly
(`|| return 1`, not `set -e`): the cycle's scratch is hard-reset to the pre-cycle
ref (`git reset --hard` + `git clean` of content/traces/tests — this is why a dirty
start is refused), the commit is skipped, and the outer loop continues until the
circuit breakers stop it (5 consecutive / 15 total failed cycles by default).

## Saturation-triggered ultraplan

The deterministic assessor is cheap and good at routine work, but it has no
strategic imagination: once every high-value lever has disarmed (content clean,
modes at their breadth target, no engine/repo/frontier candidate), every remaining
candidate collapses to the **0.5 routine-blind-pass floor** — `isSaturated(a)` in
`src/afk/assessor.ts`. That is the diminishing-returns state that once pinned the
loop to clockwork-polish.

When the loop hits it, a cycle **re-aims with a bounded multi-agent ultraplan**
instead of spending another pass on polish:

```
ASSESS → isSaturated?  ── no ──▶ standard cycle (as above)
                       └─ yes, and off cooldown ──▶ ULTRAPLAN cycle:
   1. Workflow ultraplan (≈4-6 agents: LOCAL repo reviewers + synthesis — NO web
      researchers; web tools force an interactive approval prompt that stalls the
      unattended loop) picks the single highest-value STRUCTURAL move, grounded in
      docs/archive/ULTRAPLAN-*.md and docs/ROADMAP.md (advance them, don't restart).
   2. Writes the plan to docs/CURRENT_PLAN.md  ← the rolling plan + hand-off doc.
   3. A FRESH implementation subagent reads ONLY docs/CURRENT_PLAN.md + the files it
      names (clean context, not the whole repo) and makes the one change.
   4. Same mandatory blind playtest + green bar as every cycle.
```

**Cost control.** An ultraplan is multi-agent (≈4-6 agents) / multi-minute work, so it must not fire
every ~15-min cycle while saturation persists. A **cooldown** (`ai-runs/
saturation-state.json`, default 8 cycles, `AI_LOOP_ULTRAPLAN_COOLDOWN`) bounds it to
at most once per N cycles. Ultraplan cycles also get a larger agent budget
(`AI_LOOP_ULTRAPLAN_TIMEOUT_SECONDS`, default 3600s) via the per-cycle
`agentTimeoutSeconds` that `ai-loop.ts` writes into `latest-cycle.json`.

The fresh-context-per-phase shape is free here: each cycle's agent is already a new
`claude -p`, and Step 3's implementer is a fresh `Agent`-tool subagent — so the plan
is handed off as a _document_, not a context window.

### The decision log (durable memory of settled questions)

`docs/CURRENT_PLAN.md` is **overwritten** each ultraplan, so it cannot remember what was
already ruled out — which is why successive re-aims kept re-confirming the same
already-implemented features as "gaps" (re-aim #19 alone re-confirmed six false alarms).
`docs/DECISION_LOG.md` fixes this: it is an **append-only** ledger of settled questions.
Each ultraplan reads it first and treats its "Confirmed CLOSED" list as a hard boundary for
every reviewer subagent (do not re-nominate or re-investigate a closed gap — the file:line
proof is recorded), then appends the gaps it confirmed closed this cycle. This is the missing
fourth piece of the reviewer subagent contract — _objective · output format · tool guidance ·
**boundaries**_ — and the cure for redundant fan-out across re-aims.

## Why this shape (grounded in 2025–26 practice)

- **Hard, machine-readable verification gate + "don't route around the verifier"**
  are the two highest-value techniques for unattended loops (Anthropic
  long-running-agents harness; EvilGenie reward-hacking benchmark). We enforce both:
  `npm run health` is the gate, and `scripts/verify-integrity.ts` makes
  test-weakening / silent hash re-pins fail loudly.
- **Evidence-driven work selection** (not a hand-fed TODO list): the assessor turns
  real signals — validator warnings, thin modes, engine TODOs, missing tooling,
  generated-pack drift — into a ranked backlog, so the loop always works the
  highest-value thing and a human can see _why_.
- **An LLM playtest is the quality oracle.** The validators + exhaustive solver prove
  _structure_ (every ending reachable, no soft-locks, sound scoring) as dev tests; a
  reasoning agent playing blind measures the _experience_ (clarity, fun, confusing
  branches). The loop makes that blind playtest mandatory every cycle — it's the
  feedback that actually improves the game. These are the only two testing modes.
- **Externalized state + one change per cycle**: `AI_LOOP_STATE.md` is the durable
  handoff; `ai-runs/<id>/` holds the (ignored) per-cycle evidence and playtest report.

## Running it

```bash
npm run assess          # just print the ranked next-best-improvement backlog
npm run ai:loop         # one cycle: assess + emit the cycle prompt + artifacts
./loop.sh --once        # full single cycle (assess → agent → verify → commit)
./loop.sh               # continuous (AI_LOOP_MAX_CYCLES, AI_LOOP_DELAY_SECONDS to bound)
npm run loop:status     # project-scoped status (breaker/velocity telemetry needs
npm run loop:stop       #   a wrapper log: ./loop.sh 2>&1 | tee ai-runs/wrapper.log)
```

Key env (loop.sh's header comment is the authoritative reference): `AI_LOOP_COMMIT=1`
to commit, `AI_LOOP_PUSH=1` to push (rejected against protected main — see the cycle
diagram), `AI_LOOP_DELAY_SECONDS` between cycles (default 10), `AI_AGENT_CMD` to set
the agent — the default prefers `claude -p` (model `sonnet`; override with
`AI_LOOP_MODEL`, plus optional `AI_LOOP_EFFORT` / `AI_LOOP_BUDGET_USD`) and falls back
to `codex exec` when only that is installed — `AI_AGENT_TIMEOUT_SECONDS` (default 2400)
to hang-kill a stuck turn, `AI_LOOP_MAX_CONSECUTIVE_FAILURES` / `AI_LOOP_MAX_TOTAL_FAILURES`
for the circuit breakers, and `AI_LOOP_ALLOW_VERIFIER_EDITS=1` to acknowledge a
deliberate verifier change.

## Honest limits

- loop.sh's own gate enforces "a non-empty playtest report exists for the cycle"; it
  can't _prove_ an LLM truly played — but the report verifier
  (src/blind/report_verifier.ts, run by the blind harness) rejects reports without a
  schema-valid exit interview or MCP evidence, and combined with the verification
  gate that keeps the quality step real.
- The verifier-integrity guard catches _mechanical_ tampering (skip/delete/empty/
  re-pin), not _semantic_ weakening (a future LLM-judge could).
- The loop makes one change per cycle by design; broad multi-step work should be
  several cycles, each verified.
