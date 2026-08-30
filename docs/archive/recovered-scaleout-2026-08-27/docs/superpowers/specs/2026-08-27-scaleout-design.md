# Scale-out design: parallel agent lanes + cheap persona QA fleet

Date: 2026-08-27. Status: Phase 1 implemented; Phases 2–3 await owner review.

## 1. Problem, with evidence

The improvement loop has stalled. Measured, not felt:

- **Throughput**: 695 commits landed in July 2026; 57 in August, and only two
  landings after Aug 12 (#301, #304).
- **Cost per change**: each AFK cycle spends assess + two `crawl:smoke` runs +
  full `npm run health` (461 files / 4,104 tests) + one xhigh blind playtest +
  integrity drift + a fail-closed seal — to land 100–400-byte prose edits.
  CI `verify` adds ~50 minutes per landing.
- **Stuck metrics**: consecutive pilots fail clarity at 38–40/50 (gate 42),
  enjoyment 40–41/50 (gate 42), and strategy diversity 2-of-4 (gate 3).
- **Steering loss**: `feedback_cycle_selection` froze to `null` in nearly every
  recent cycle — the operating agent overrides the assessor's recommendation
  almost every time, so the feedback loop no longer directs the work.
- **A self-inflicted diversity famine**: the certifier demands behavioral
  diversity (≥3 distinct strategies), while the harness deliberately bans its
  only behavioral-diversity lever — personas — from every live run
  (`run.sh:247-248`, `fleet.mjs:842-856`). Seed is the only variation axis left
  (`fleet.mjs:7-9`), and all runs are pinned to `xhigh` reasoning, making wide
  evidence expensive (10-run Terra pilot ≈ 1.1M useful tokens; 100-run fleet
  ≈ 11.5M and ~2 hours).

Root cause: the loop is **serial by design** — one agent, one change per cycle
(`docs/afk_loop.md:272-273`) — and nothing in the coordination layer is
agent-scoped except `ai-runs/<runId>/`. `ai-runs/latest-cycle.json`,
`AI_LOOP_STATE.md`'s machine-owned markers, `saturation-state.json`, the PID
files, and the feedback acceptance chain are all fixed paths with
last-writer-wins semantics, and three gates (`require_final_ledger_only`,
`verify:integrity --against`, the sidecar's `tracked_worktree_clean` + HEAD
binding) actively require that no other writer touched the tree.

## 2. Options considered

**A. Leave as-is.** Rejected. The stall is measured; the metrics the loop is
graded on cannot improve without behavioral diversity the current harness
forbids, and single-lane serialization caps throughput at ~1 micro-change per
15-minute cycle regardless of available agents.

**B. Improve in place only** (unlock personas, add a cheap model tier, keep the
serial loop). Attacks the evidence economics and the stuck diversity gates —
the cheapest fix — but leaves the throughput ceiling untouched: four agents
would still queue behind one worktree, one ledger, one acceptance chain.

**C. Restructure the improvement layer; keep the product core.** The engine,
content, tests, crawler, health bar, and anti-forgery evidence pipeline are
healthy and unusually strong — rebuilding them would be waste. What needs
restructuring is the *coordination layer around them*: how many hands can work
at once, and how quality evidence is priced and collected.

**Decision: C, executed as a strangler pattern.** Everything added is additive
and lives beside the certified machinery; nothing weakens a gate, a protocol
invariant, or historical evidence. B's testing-economics fix is included as
C's second pillar. Restructure where the system fights itself; improve in
place where it is strong; leave alone what is certified.

## 3. Pillar 1 — parallel agent lanes

Four standing lanes, each an isolated git worktree on a short-lived branch,
each ownable by any agent (a human-driven session, a headless CLI agent, or a
subagent of an orchestrating model):

| Lane | Zone (primary write scope) | Typical work |
|---|---|---|
| `content-a` | `content/rpg/quests/` packs A–L split 1 + their tests/traces | quest-pack fixes from QA findings |
| `content-b` | `content/rpg/quests/` packs split 2 + their tests/traces | quest-pack fixes, new content |
| `engine` | `src/` (except `src/afk`, `src/feedback`), `ui/`, their tests | engine rules, MCP surface, UI |
| `harness` | `blind-tester/`, `scripts/`, `src/afk/`, `src/feedback/`, docs | loop tooling, QA fleet, docs |

Mechanics (full protocol: `docs/parallel_lanes.md`):

- `scripts/lane.mjs` creates/lists/removes lane worktrees under `../zork-lanes/`,
  each branched from `origin/main`, with an optional node_modules junction to
  avoid duplicate installs.
- **Single-writer rule** for global files: `content/world/new_york_overworld.json`,
  `AI_LOOP_STATE.md`, `docs/DECISION_LOG.md`, and `traces/bugs/` sequence numbers
  are assigned to at most one lane at a time by the orchestrator's task brief.
- **Landing**: unchanged — short-lived branch → PR → required `verify` check.
  Lanes rebase on `origin/main` before opening a PR; landings are staggered
  because each burns ~50 runner-minutes.
- **Task briefs** reuse the ultraplan subagent contract (objective · output
  format · tool guidance · boundaries, with `docs/DECISION_LOG.md` "Confirmed
  CLOSED" as a hard boundary).
- The AFK loop (`loop.sh`) keeps its own dedicated worktree and remains
  single-instance there; lanes never run `loop.sh` concurrently with it in the
  same tree. Phase 2 makes loop cycles themselves lane-capable.

Why worktrees instead of surgery on `loop.sh` now: the explorer audit found 24
distinct serialization points. Making the *cycle protocol* concurrent is a
deep change to fail-closed machinery; making *development work* concurrent
needs only isolation plus a merge discipline, which git already provides.
Worktrees deliver 4-agent parallelism immediately at near-zero risk.

## 4. Pillar 2 — two-lane testing (cheap persona QA fleet + unchanged retention lane)

The persona ban exists for a real reason: a persona that prescribes behavior
writes the answer to the retention question the certifier asks
(`fleet.mjs:9-10`). The mistake is that this made personas unusable for
*anything*, when retention is only one of the things being measured. Split the
concerns:

**Retention/certification lane — unchanged.** Neutral-default persona, pinned
models, xhigh, full anti-forgery pipeline. Runs rarely (pilots, certification,
milestone harvests). Its rules, evidence formats, and history stay intact.

**QA lane — new, cheap, persona-varied, advisory.** `blind-tester/qa/qa-fleet.mjs`:

- **Blind by construction**: each run launches the real MCP server with
  `--play-mode pure`, so the server enforces the human-only tool surface
  (`src/mcp/server.ts` `PURE_PLAYER_TOOLS`) regardless of what the prompt says.
  The player starts a fresh overworld session and sees only what a human sees.
- **Cheap by default**: `codex exec` on `gpt-5.3-codex-spark` with
  `model_reasoning_effort="low"` — instant-response tier, ~1–2 min/run.
- **1-in-100 max-think sampling**: a seeded PRNG upgrades ~1% of planned runs
  to `gpt-5.6-terra` at `xhigh` (rate configurable via `--think-rate`,
  deterministic per seed base so a roster is reproducible).
- **Critical-leaning persona roster**: existing `breaker`, `explorer`,
  `speedrunner`, `casual`, `lore-reader` plus new `critic`, `skeptic`,
  `impatient` — weighted so critical/high-standards personas dominate. All
  personas carry the shared anti-sycophancy CALIBRATION block.
- **Advisory evidence, quarantined namespace**: reports go to
  `ai-runs/qa/<label>/`, never `blind-tester/reports/` (which the assessor
  parses for pure attendance) — QA output cannot contaminate retention
  evidence, certification, or the acceptance chain. The driver aggregates a
  `summary.json` + `qa-digest.md` (findings by severity × persona × quest)
  for lane agents and the orchestrator to consume directly.
- Existing per-persona sycophancy analytics (`src/feedback/metrics.ts:117-139`)
  already support persona-tagged interviews when Phase 3 wires QA cohorts into
  the compiler.

This restores the diversity lever exactly where the certifier is starving for
it (strategy spread, clarity phrasing complaints across temperament types)
while spending roughly 1/10th of a pure run per data point.

## 5. Deliberately unchanged

- The pure blind-playtest protocol, its model allowlist, evidence formats, and
  every fail-closed gate (`health`, `crawl`, `verify:integrity`, seal chain).
- `loop.sh` and the AFK cycle contract (Phase 2 territory).
- The landing bar: PR + green `verify`; `npm run health` for anything landing.

## 6. Phasing

- **Phase 1 (this change)**: spec + `docs/parallel_lanes.md` + `scripts/lane.mjs`
  + QA fleet driver, prompt, personas + `npm run qa:fleet` / `qa:fleet:dry` +
  AGENTS.md pointers. Additive only.
- **Phase 2 (needs owner review)**: lane-scoped loop cycles — per-run cycle
  metadata replacing fixed `ai-runs/latest-cycle.json`, timestamped attendance
  parsing replacing positional newest-first, a lease on the acceptance chain
  modeled on the fleet cohort ledger, per-lane ledger shards.
- **Phase 3 (needs owner review + protocol revision)**: admit persona-QA
  cohorts into `feedback:compile` as actionable-but-retention-ineligible
  evidence (persona-tagged, compiled via explicit `--in`), so QA findings flow
  into assessor hotspots without touching retention math; orchestrated
  continuous operation (QA fleet on a schedule feeding all four lanes).

## 7. Risks

- **QA reports are unverified prose** (no anti-forgery sidecar). Mitigated by
  scope: advisory only, quarantined namespace, never landing authority. The
  protocol's own stance applies: reproduce mechanical claims deterministically
  before changing code.
- **Overworld JSON merge conflicts** between content lanes. Mitigated by the
  single-writer rule and small, frequently-rebased PRs.
- **CI runner contention** (4 lanes × ~50-min verify). Mitigated by staggered
  landings; per-ref cancel-in-progress already prevents cross-lane cancels.
- **Codex CLI drift** (`model_reasoning_effort="low"` availability). The QA
  driver surfaces provider errors verbatim and supports `--effort` override.

## 8. Success metrics

- ≥4 concurrent lanes each landing ≥1 PR/week (vs. ~2 landings in late August).
- QA fleet cost ≤ ~1/10 pure-run tokens per report; ≥20 persona reports/day
  affordable.
- Strategy-diversity and clarity gates move within 4 weeks of QA-informed
  fixes (first pilot after: strategies_represented ≥3, clarity ≥42/50).
