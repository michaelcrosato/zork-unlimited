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
│     Deterministically scans every pack + repo signals and ranks
│     improvement candidates across four categories:
│        content_fix · content_new · engine · repo
│     Compiled feedback hot spots (docs/testing_pyramid.md), when present, are
│     a primary input to the ranking.
│     Emits: ai-runs/<id>/{assessment.md, prompt.md} plus latest-cycle.json at
│     the ai-runs/ root (which records the improvement source, fresh-overworld
│     playtest contract, report path, and ultraplan handoff path when applicable).
│
├─ 2. CRAWL GATE (pre)   npm run crawl:smoke — Tier 1 of the testing pyramid.
│     Must be green before the agent touches anything; red here means the
│     world was already broken, so the cycle halts and reverts (loop.sh).
│
├─ 3. WORK          the operating agent (installed Codex CLI / explicit agent command)
│     Reads the cycle prompt and:
│       a. ONE improvement — content edit / apply_content_patch, or an engine/repo
│          change (full authority; new mechanics need no §14 ceremony, but stay
│          verified). Bugs get a traces/bugs/ artifact + a tests/regression/ test.
│       b. FOCUSED CHECKS + LOCAL PROVISIONAL COMMIT — freezes every tracked
│          implementation change without pushing, then requires an exactly clean
│          `git status --porcelain`. This is the revision the player will exercise.
│       c. MANDATORY PURE LLM PLAYTEST — spawns a fresh, no-context player in a
│          brand-new CORE GAME overworld session, with only the human tutorial,
│          goal, state, legal choices, decision/checkpoint status, and consequences
│          exposed through player MCP tools. The harness supplies transport syntax
│          but no route, coverage target, solution, or test-only stopping rule.
│          The game itself offers continue/end at goal completion and fixed
│          decision checkpoints; the harness interviews only after confirmed end.
│          Server evidence and the V2 receipt are independently cross-checked
│          (docs/blind_playtest_protocol.md). Direct quest starts and crawler/
│          smoke/mock modes are structural QA, never pure retention evidence.
│          Milestone/harvest cycles run `npm run fleet -- --count 100` instead of
│          a single pure player (docs/testing_pyramid.md).
│       d. FEEDBACK + LEDGER — count actual actionable reports since the newest
│          successful compile. Verified pure, legacy-guided, and structural-smoke
│          artifacts count; deterministic structural mocks do not. Run
│          `npm run feedback:compile` iff there are ≥3; never invent a count. This
│          is a prompted-agent action, not a loop.sh helper or gate. Complete
│          AI_LOOP_STATE.md after play; it must be the only tracked change left
│          outside the provisional commit.
│
├─ 4. CRAWL GATE (post)  npm run crawl:smoke again — a new finding here is a
│     regression the cycle itself just introduced; the cycle halts and reverts.
│
├─ 5. VERIFY        the bar, all blocking (a red gate reverts the cycle's scratch
│                    to the pre-cycle ref, skips the commit, and the outer loop
│                    continues under circuit breakers — see Failure handling):
│       npm run health            (verify:integrity + typecheck + lint +
│                                  format:check + tests + ui:typecheck + validate)
│       verify:integrity --against <pre-cycle ref>   (don't route around the verifier:
│                                                      hard-block only on weakening —
│                                                      deleted/disabled tests, dropped
│                                                      test count, or a re-pin with no
│                                                      content change; legit re-pins warn)
│       require_playtest_record    (pure V2 report + raw server evidence + sidecar
│                                    must reproduce one another and bind the current
│                                    world/build to exact provisional HEAD)
│       require_final_ledger_only  (only AI_LOOP_STATE.md may differ after play)
│
└─ 6. FINALIZE/PUSH   commit only the completed AI_LOOP_STATE.md entry after the
       outer bar passes. AI_LOOP_COMMIT=1 enables both the provisional implementation
       commit and this final ledger commit; AI_LOOP_PUSH=1 may push only afterward.
       Note: a bare push of fresh commits to protected
       main is always rejected (the required 'verify' check can't have run yet) —
       land loop commits via a scratch branch/PR and leave AI_LOOP_PUSH=0.
```

**Failure handling.** loop.sh refuses to start on a dirty tree (AI_LOOP_ALLOW_DIRTY=1
overrides commit-mode startup only, accepting the risk below). Each cycle snapshots
its exact non-ignored untracked paths. A red gate fails explicitly (`|| return 1`, not
`set -e`): tracked work and the provisional commit reset to the pre-cycle ref, and
only untracked paths absent from that snapshot are cleaned, across the whole repo.
Preexisting untracked paths are not intentionally deleted. Under the dirty override,
however, reset still destroys tracked edits and no cleanup can restore a preexisting
untracked file that the agent staged/committed, edited, moved, or removed. A
nonzero or timed-out agent turn is itself a failed cycle; partial output does not
fall through to the gates. Every failure is classified and appended atomically to
the bounded ignored `ai-runs/failure-ledger.json` history (100 entries by default),
which `npm run loop:status` displays even when no wrapper log was captured. The
outer loop continues until its circuit breakers stop it (5 consecutive / 15 total
failures by default).

**Feedback-compile ownership.** The cycle prompt tells the operating agent to
count actionable verified artifacts (never deterministic structural mocks) and
invoke `npm run feedback:compile` at the threshold.
The no-flags compiler discovers both the local `blind-tester/reports` ledger
and pure V2 `ai-runs/<cycle>/playtest.*` publication candidates, plus the newest
crawl findings; existing report/receipt/provider gates still decide admission,
and copied pure runs are counted once after full verification. Discovery does
not imply current-HEAD freshness or define a new feedback cohort.
`loop.sh` itself does not perform that count or call the compiler; it enforces the
subsequent crawl, health, integrity, playtest, and ledger-only gates. This makes
the current implementation boundary explicit rather than presenting the protocol
step as a shell-driver guarantee.

**Evidence-only mode.** With `AI_LOOP_COMMIT=0`, `npm run ai:loop` does not rotate or
append to the tracked loop ledger before the agent starts. The prompt requires an
exact-clean baseline pure play before any uncommitted edit. The later work can be
checked locally, but its baseline report must not be represented as evidence for that
uncommitted revision. The driver enforces a clean start again at every cycle boundary;
`AI_LOOP_ALLOW_DIRTY=1` cannot bypass that provenance gate. If a successful
evidence-only cycle leaves work uncommitted, continuous mode stops before launching
another baseline and tells the operator to commit, stash, or discard the pending work.

## Saturation-triggered ultraplan

The deterministic assessor is cheap and good at routine work, but it has no
strategic imagination: once every high-value lever has disarmed (content clean,
world quests at the breadth target, no engine/repo/frontier candidate), every remaining
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
   2. Writes the sole fresh-agent handoff to ignored
      ai-runs/<cycle>/current-plan.md; latest-cycle.json records it as
      currentPlanRecord. docs/CURRENT_PLAN.md remains a durable short router and is
      never overwritten by the loop.
   3. A FRESH implementation subagent reads ONLY that per-cycle handoff + the files
      it names (clean context, not the whole repo) and makes the one change.
   4. Same provisional-commit → exact-clean blind playtest → outer green bar →
      final ledger-commit sequence as every commit-enabled cycle.
```

**Cost control.** An ultraplan is multi-agent (≈4-6 agents) / multi-minute work, so it must not fire
every ~15-min cycle while saturation persists. A **cooldown** (`ai-runs/
saturation-state.json`, default 8 cycles, `AI_LOOP_ULTRAPLAN_COOLDOWN`) bounds it to
at most once per N cycles. Ultraplan cycles also get a larger agent budget
(`AI_LOOP_ULTRAPLAN_TIMEOUT_SECONDS`, default 3600s) via the per-cycle
`agentTimeoutSeconds` that `ai-loop.ts` writes into `latest-cycle.json`.

The fresh-context-per-phase shape is free here: each cycle's automatic agent is a new
`codex exec` process, and Step 3's implementer is a fresh subagent — so the plan is
handed off as a _document_, not a context window.

### The decision log (durable memory of settled questions)

The ignored per-cycle handoff is intentionally disposable, so it cannot remember what
was already ruled out across re-aims. `docs/DECISION_LOG.md` supplies that durable
memory: it is an **append-only** ledger of settled questions.
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
- **An LLM playtest is the quality oracle, one of three tiers, one oracle chain —
  see docs/testing_pyramid.md.** Dev tests (validators + exhaustive solver) prove
  _structure_ (every ending reachable, no soft-locks, sound scoring); the mechanical
  crawler (`crawl:smoke`/`crawl:deep`) sweeps every quest and the overworld for
  mechanical defects with zero LLM cost; a reasoning agent playing the same
  game-native contract as a human measures the _experience_, including its real
  continue/end retention choice, and the feedback compiler
  turns both crawler findings and blind reports into ranked hot spots. The loop
  makes the blind playtest mandatory every cycle and the crawl gate mandatory
  around every change — together they're the feedback that actually improves the
  game.
- **Externalized state + one change per cycle**: `AI_LOOP_STATE.md` is the durable
  history; `ai-runs/<id>/` holds ignored per-cycle evidence, playtest report, and any
  ultraplan fresh-agent handoff.

## Running it

```bash
npm run assess          # just print the ranked next-best-improvement backlog
npm run ai:loop         # one cycle: assess + emit the cycle prompt + artifacts
./loop.sh --once        # full cycle (pre-crawl → change/provisional/play → outer gates → ledger commit)
./loop.sh               # continuous (AI_LOOP_MAX_CYCLES, AI_LOOP_DELAY_SECONDS to bound)
npm run loop:status     # project-scoped status + durable latest failure; optional
npm run loop:stop       #   velocity telemetry uses: ./loop.sh 2>&1 | tee ai-runs/wrapper.log

npm run crawl:smoke               # the crawl gate itself, run standalone (docs/testing_pyramid.md)
npm run blind                     # canonical pure player, fresh overworld
npm run fleet -- --count 100      # milestone/harvest pure fleet (real tokens)
npm run fleet:mock -- --count 2   # explicit structural, zero-token dry run
npm run feedback:compile          # compile ledger + cycle evidence + crawl hot spots/retention
```

`loop.sh` installs missing root and UI dependencies before starting cycles because
`npm run health` includes `ui:typecheck`.

The scheduled deep audit wraps the isolated `ending-render-proof` and standard
coverage suite with non-blocking performance warnings at 420 s and 4,200 s. It
caches the last five green durations per proof and also warns above 1.5× their
rolling median. These warnings never change the commands' exit status, hard job
timeouts, state caps, or proof completeness. The instrumented standard suite has
a coverage-command-only 300-second per-test ceiling for full-suite V8 worker
contention; ordinary standard tests retain their 60-second fail-fast ceiling.

Key env (loop.sh's header comment is the authoritative reference): `AI_LOOP_COMMIT=1`
to enable the local provisional and final-ledger commits, `AI_LOOP_PUSH=1` to push
(rejected against protected main — see the cycle
diagram), `AI_LOOP_DELAY_SECONDS` between cycles (default 10), `AI_AGENT_CMD` to set
an explicit agent command — otherwise the default is the installed `codex exec` CLI;
the outer loop does not inspect local credential files or choose a fallback provider —
`AI_AGENT_TIMEOUT_SECONDS` (default 2400)
to hang-kill a stuck turn, `AI_LOOP_MAX_CONSECUTIVE_FAILURES` / `AI_LOOP_MAX_TOTAL_FAILURES`
for the circuit breakers, and `AI_LOOP_ALLOW_VERIFIER_EDITS=1` to acknowledge a
deliberate verifier change. `AI_LOOP_FAILURE_LEDGER_MAX_ENTRIES` bounds retained
failure records (default 100).

## Honest limits

- loop.sh requires the pure runner's sidecar-last publication, a schema-valid V2
  interview, an exact game receipt match, `tracked_worktree_clean: true`, and a
  build commit equal to provisional HEAD. This rejects empty, fabricated-shape,
  interrupted, dirty-build, and stale-revision artifacts. It still cannot prove
  the model's private motivation, but it does prove the recorded session followed
  the enforced player surface and ended through the game contract.
- The verifier-integrity guard catches _mechanical_ tampering (skip/delete/empty/
  re-pin), not _semantic_ weakening (a future LLM-judge could).
- The loop makes one change per cycle by design; broad multi-step work should be
  several cycles, each verified.
