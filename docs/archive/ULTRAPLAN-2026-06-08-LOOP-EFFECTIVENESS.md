# Ultra-plan — AFK loop effectiveness on Opus 4.8 (2026-06-08)

**Target model:** Claude **Opus 4.8** (`claude-opus-4-8`) · **Platform:** Claude Code CLI (headless `claude -p`).
**Scope:** loop _effectiveness_ — reliability + throughput of useful work. (Cost/token reduction is
covered separately in `docs/TOKEN-REDUCTION-ULTRAPLAN-2026-06-08.md`; this plan is the complement.)

This synthesizes (a) an end-to-end read of how the loop actually runs in source, (b) the
ground-truth behavior in `AI_LOOP_STATE.md` / `AI_LOOP_STATE_ARCHIVE.md` over the last ~50 cycles,
and (c) current (2026-06-08) practice for Opus 4.8 and Claude Code orchestration.

---

## 1. How the loop actually runs (verified in source)

```
loop.sh (bash driver)                         ─ orchestration + the verification bar
 └─ npm run ai:loop  → src/ai-loop.ts          ─ ASSESS + emit the cycle prompt
      └─ src/afk/assessor.ts                    ─ deterministic "what is the next best improvement?"
 └─ run_agent: claude -p --model <m>            ─ the WORK: one improvement + mandatory blind playtest
      └─ Agent-tool blind subagent (MCP-only)   ─ the per-cycle quality signal
 └─ npm run health                              ─ BLOCKING gate (verify:integrity + tsc + eslint +
                                                  prettier + ~2079 tests + validate 17 packs)
 └─ verify:integrity --against <pre-ref>        ─ "don't route around the verifier" drift gate
 └─ require_playtest_record                      ─ no blind-playtest report ⇒ no commit
 └─ commit (+ optional push)                     ─ trust, but verify
```

**Where "decide what to do next" lives:** `src/afk/assessor.ts::assess()`. It is a pure,
deterministic ranker (no clock/RNG/network) over four categories — `content_fix`, `content_new`,
`engine`, `repo` — plus three generator "mint-and-check" levers (CYOA/RPG/parser) that mint fresh
packs each cycle and assert the production validators still hold. It does **not** re-plan; it
re-assesses from scratch every cycle. Strategic re-aiming is delegated to a saturation-triggered
**ultraplan** (a bounded multi-agent `Workflow`) at most once per `ULTRAPLAN_COOLDOWN` (8) cycles.

**Subagent contract (Anthropic's four-part rule: objective · output format · tool guidance ·
boundaries).** The **blind-playtest subagent passes all four** — `docs/blind_playtest_protocol.md`
gives a verbatim locked prompt (objective: play blind; output: 6 structured sections; tools: MCP
only via ToolSearch; boundary: never read content/src/ui/tests). This is a model subagent. The
**ultraplan reviewer agents are the weak point**: they have an objective and a synthesis target but
**no "already ruled out" boundary**, so they re-investigate settled questions (see §3).

**Verification / done / failure.** Verification is real and layered: `npm run health` is blocking;
`verify:integrity` hard-blocks mechanical weakening (deleted/disabled tests, dropped test count,
unaccompanied hash re-pin); the mandatory-playtest record gate blocks a commit with no quality
signal. Failure is resilient: each gate is `|| return 1`, so a bad cycle skips its commit and the
outer loop continues. A hung agent turn is bounded by `timeout` (2400s routine / 3600s ultraplan).
The circuit breaker stops after 5 **consecutive no-progress** cycles.

**AFK reliability is strong.** Hard machine-readable gate ✓, anti-reward-hacking drift gate ✓,
checkpoint-per-cycle via git commits ✓, agent-turn timeout ✓, iteration/failure limits ✓,
externalized durable state (`AI_LOOP_STATE.md`, auto-rotated to keep the log token-small) ✓.

## 2. The dominant operational reality — a polish treadmill

The decisive finding is in the loop's own log, not in any single bug:

- The assessor is **permanently saturated**. With 17 structurally-clean packs, every `content_fix`
  candidate collapses to the **0.5 playtest-stub floor**; the generators are clean so their drift
  levers never fire; `content_new` is silenced (actual 7/5/5 ≥ `TARGET_PER_MODE` 2/2/2); engine
  TODO/marker scan is at zero; the repo levers (eslint coverage, doc staleness) are disarmed. So
  `isSaturated()` is **true essentially every cycle**.
- Consequently **every routine cycle is a 0.5-floor blind-playtest rotation**, and the ultraplan
  (every 8th saturated cycle) is the _only_ source of structural direction.
- The blind playtest is genuinely productive — it finds **one real bug per cycle** — but it has
  found **the same class ~30+ cycles running**: "stale reactive description" (a room or dialogue
  node names an item/state in its base text after the player has already taken the item or changed
  the state). bugs **0282 → 0325** are nearly all this single family.

This is not a malfunction — each fix is real, verified, and locked with a regression test. It is a
**throughput ceiling**: the loop fixes _instances_ one per cycle and never the _class_. ~30 cycles
of one-prose-fix-each is the symptom of a planning layer that has no above-floor signal to point at
anything bigger.

## 3. Confirmed waste in the multi-agent layer

`docs/CURRENT_PLAN.md` (ultraplan re-aim **#19**) is the smoking gun. Its own synthesis says **"Six
claimed gaps were confirmed as false alarms"** — features that were _already implemented_
(BFS forward-reachability, `resolveProvider` keystone, the bug*0308 tautology detector, the
`guardFinite` NaN guard, `divergedAtStep`, LRU rotation). Re-aim #17 likewise records "three
nominated candidates already closed"; #18 the same. **Each ultraplan spends ~6–8 agents partly
re-litigating settled questions**, because `docs/CURRENT_PLAN.md` is \_overwritten* every ultraplan —
the only durable memory of "what's already been ruled out" is the prose "Deferred levers" tail,
which reviewers don't treat as authoritative. This is the clearest case in the whole system of
**genuinely independent fan-out spent on redundant work** — exactly the failure the subagent-contract
research attributes to a missing _boundary_ ("miss any of the four and the subagent drifts").

## 4. Current (2026-06-08) practice that bears on the design

- **Opus 4.8 is the right loop model and changes the calculus.** It is _~4× less likely to allow
  flaws in its own code to pass unremarked_ and "catches its own mistakes" — which makes an explicit
  **evaluator-optimizer self-critique step within a single cycle** cheap and effective (the model can
  reliably grade its own change against clear criteria before committing). Default effort = high;
  `xhigh`/`max` for hard async work; tool-calling is "meaningfully more efficient, fewer steps."
- **Dynamic Workflows** (Opus 4.8 / Claude Code research preview): plan, then run many parallel
  subagents in one session, **verified against the test suite before reporting**. This is precisely
  the shape of this repo's `Workflow`-based ultraplan — the design is already aligned with where the
  platform is going; the gap is the _memory_ the reviewers lack, not the orchestration shape.
- **Fan-out vs stay-single (Anthropic agent-teams guidance):** subagents for _focused tasks where
  only the result matters_ (cheap, summarized back); agent teams for _adversarial/collaborative_
  work (expensive — every inter-agent message is a round-trip); **single session for sequential,
  same-file, dependency-heavy work.** The loop already places this boundary correctly: tightly-
  coupled content/engine edits run single-agent (correct); the ultraplan fans out only for genuinely
  independent _review_ (correct). **The bias to keep is: do NOT fan out tightly-coupled coding.**

## 5. The plan — concrete improvements end to end

### Planning / orchestration layer

1. **Give the ultraplan a durable decision ledger** (`docs/DECISION_LOG.md`, append-only) so it stops
   re-deriving false alarms. Every ultraplan reviewer reads it FIRST and may not re-nominate a gap
   listed as confirmed-closed (with its file:line proof); every ultraplan appends the gaps it
   confirmed closed this cycle. This is the missing _boundary_ in the reviewer subagent contract.
2. **Break the polish treadmill at the prompt layer first (low risk), engine second (deferred).**
   The standard cycle prompt should (a) tell the agent that when the blind playtest keeps surfacing
   the _same class_ of finding, the higher-value move is to propose a **class-level check** (a
   validator/lint rule) rather than another one-off instance fix; and (b) add an Opus-4.8
   evaluator-optimizer **self-critique gate** — before committing, the agent grades its own change
   against clear criteria (did this raise player-facing quality, or is it busywork? is there a
   higher-value structural move I am avoiding?) and records the verdict.

### When to fan out vs stay single

3. Keep the current boundary. Fan out (ultraplan `Workflow`) only for the saturated re-aim, where the
   review dimensions are independent. Never fan out a single tightly-coupled content/engine fix —
   that is correctly single-agent today. (No change needed; documented here so it is not eroded.)

### Verification gates

4. The gates are strong; the one _throughput_ gap is that the circuit breaker only catches
   _no-progress_, not _low-value progress_ (the treadmill). The self-critique verdict (item 2b) is
   the lightweight, in-cycle answer; a future heuristic could trend the playtest enjoyment/finding
   class to detect a groove. (Self-critique now; trend detector deferred.)

### AFK reliability

5. No reliability regressions to fix. The deferred-but-valuable item is a **class-level "stale
   reactive description" check** so the bug*0282–0325 family is caught structurally and cannot recur.
   This is **left to the agent's judgment via item 2a rather than hard-coded now**, because a naive
   heuristic risks false-positive churn across 17 clean packs and would need its FP rate measured
   before it can join `health`. Opus 4.8's judgment is the right place to decide \_when* the class is
   worth a structural check.

## 6. What is being implemented this pass (vs deferred)

**Implemented now** (pure prompt/doc; `npm run health` stays green; no engine/schema/validator
change; `verify:integrity` untouched):

- `docs/DECISION_LOG.md` seeded with re-aim #19's confirmed-closed gaps + deferred levers.
- `src/ai-loop.ts::buildUltraplanPrompt` — require reviewers to read the ledger first and append to it.
- `src/ai-loop.ts::buildPrompt` — add the catch-the-class nudge + the evaluator-optimizer
  self-critique gate + Opus-4.8 alignment (effort high, terse, self-correction reminder).
- `docs/afk_loop.md` — document the decision ledger.

**Deferred (agent-driven or multi-cycle):**

- A deterministic class-level "stale reactive description" validator/lint (FP-rate must be measured
  first; let item 2a surface it when the agent judges the class worth closing structurally).
- Re-enabling `content_new` by raising `TARGET_PER_MODE` (CURRENT_PLAN.md defers it deliberately
  until structural validator gaps close — respected here).
- A playtest-trend "groove detector" feeding the assessor an above-floor signal.

## 7. Top 3 improvements to loop effectiveness

1. **Catch the bug _class_, not the instance.** ~30 cycles (bugs 0282–0325) fixed one prose
   instance per cycle. A class-level check (and the prompt nudge that triggers it) collapses that
   into one structural fix and prevents recurrence. _Impact: largest throughput multiplier; gives
   the saturated assessor a real signal. Effort: prompt-nudge S (now) / validator M (deferred).
   Risk: validator has FP-churn risk — hence agent-judged, not hard-coded._
2. **Durable ultraplan decision ledger.** Stops the multi-agent re-aim from re-confirming
   already-closed gaps (six false alarms in #19 alone). _Impact: removes the clearest redundant
   multi-agent spend; sharpens every future re-aim. Effort: S (doc + one prompt change). Risk: very
   low — additive doc + prompt text, health trivially green._
3. **In-cycle evaluator-optimizer self-critique (Opus 4.8).** Before committing, the agent grades
   its own change against explicit value criteria — leveraging Opus 4.8's 4× self-correction — so
   the loop notices when it is polishing rather than improving. *Impact: reliability of *useful*
   progress; the lightweight cure for the treadmill the circuit breaker can't see. Effort: S
   (prompt). Risk: low.*
