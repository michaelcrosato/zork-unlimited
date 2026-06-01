# The AdventureForge AFK loop

An autonomous improvement loop that **constantly evaluates the next-best
improvement** across the whole project, makes one focused change per cycle, takes
**mandatory LLM-playtest quality feedback every cycle**, and lands it under
**trust-but-verify** (see `AGENTS.md`). It draws on the agent's broad knowledge to
*choose and craft* improvements, and on the deterministic verification suite to
*prove* they're correct.

## One cycle

```
loop.sh  (outer driver — orchestration + the bar)
│
├─ 1. ASSESS        npm run ai:loop → src/afk/assessor.ts
│     Deterministically scans every pack (all modes) + repo signals and ranks
│     improvement candidates across four categories:
│        content_fix · content_new · engine · repo
│     Emits: ai-runs/<id>/assessment.md, prompt.md, and latest-cycle.json
│     (which records the pack to playtest and where the playtest report must go).
│
├─ 2. WORK          the operating agent (claude -p / codex exec / Agent tool)
│     Reads the cycle prompt and:
│       a. MANDATORY LLM PLAYTEST — spawns a fresh, no-context subagent that plays
│          the target pack purely through the mcp__adventureforge__* tools
│          (docs/blind_playtest_protocol.md) and writes a structured report
│          (route, mechanics, clarity 1-5, enjoyment 1-5, findings, verdict) to the
│          path in latest-cycle.json. This is the per-cycle quality signal.
│       b. ONE improvement — content edit / apply_content_patch, or an engine/repo
│          change (full authority; new mechanics need no §14 ceremony, but stay
│          verified). Bugs get a traces/bugs/ artifact + a tests/regression/ test.
│
├─ 3. VERIFY        the bar, all blocking (set -e aborts the cycle on red):
│       npm run health            (verify:integrity + lint + tests + validate + playtest)
│       verify:integrity --against <pre-cycle ref>   (don't route around the verifier:
│                                                      hard-block only on weakening —
│                                                      deleted/disabled tests, dropped
│                                                      test count, or a re-pin with no
│                                                      content change; legit re-pins warn)
│       require_playtest_record    (no blind-playtest report ⇒ no commit)
│
└─ 4. COMMIT/PUSH   git add -A && commit (scope is free — trust; but only after the
       bar passed — verify). Optional push. Durable handoff in AI_LOOP_STATE.md.
```

## Why this shape (grounded in 2025–26 practice)

- **Hard, machine-readable verification gate + "don't route around the verifier"**
  are the two highest-value techniques for unattended loops (Anthropic
  long-running-agents harness; EvilGenie reward-hacking benchmark). We enforce both:
  `npm run health` is the gate, and `scripts/verify-integrity.ts` makes
  test-weakening / silent hash re-pins fail loudly.
- **Evidence-driven work selection** (not a hand-fed TODO list): the assessor turns
  real signals — coverage gaps, unreached endings, validator warnings, thin modes,
  engine TODOs, missing tooling — into a ranked backlog, so the loop always works the
  highest-value thing and a human can see *why*.
- **An LLM playtest is the quality oracle.** Heuristic `run_playtest` measures
  *structure* (coverage, soft-locks); a reasoning agent playing blind measures the
  *experience* (clarity, fun, confusing branches). The loop makes that mandatory
  every cycle — it's the feedback that actually improves the game.
- **Externalized state + one change per cycle**: `AI_LOOP_STATE.md` is the durable
  handoff; `ai-runs/<id>/` holds the (ignored) per-cycle evidence and playtest report.

## Running it

```bash
npm run assess          # just print the ranked next-best-improvement backlog
npm run ai:loop         # one cycle: assess + emit the cycle prompt + artifacts
./loop.sh --once        # full single cycle (assess → agent → verify → commit)
./loop.sh               # continuous (AI_LOOP_MAX_CYCLES, AI_LOOP_DELAY_MS to bound)
```

Key env (see `loop.sh`): `AI_LOOP_COMMIT=1` to commit, `AI_LOOP_PUSH=1` to push,
`AI_AGENT_CMD` to set the agent (defaults to `codex exec` if present),
`AI_LOOP_ALLOW_VERIFIER_EDITS=1` to acknowledge a deliberate verifier change.

## Honest limits
- The mandate is enforced as "a non-empty playtest report exists for the cycle"; it
  can't *prove* an LLM truly played — but combined with the report's structure and
  the verification gate, it keeps the quality step real.
- The verifier-integrity guard catches *mechanical* tampering (skip/delete/empty/
  re-pin), not *semantic* weakening (a future LLM-judge could).
- The loop makes one change per cycle by design; broad multi-step work should be
  several cycles, each verified.
