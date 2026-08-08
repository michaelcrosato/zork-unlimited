# The testing pyramid

One always-on Tier 0 development foundation plus a three-tier evidence pyramid:
mechanical structure, blind experience, and a compiler that turns the evidence
into ranked fixes.
`AGENTS.md` and `docs/afk_loop.md` wire this into the loop; this is the canonical
reference for what each tier does, when it runs, and its exact shapes.

## 1. The pyramid

- **Tier 0 — dev tests** (always, inside `npm run health`): the vitest
  unit/property/regression suite, the two validators, exhaustive shipped-pack
  proofs, bug-trace integrity, and the opening-density budget. Proves
  _structure_: tested endings reachable, progress-action liveness, sound
  scoring, valid evidence references, and no test/schema/density regressions.
- **Tier 1 — mechanical crawler** (`src/crawl/`, zero LLM): drives the pure
  engine in-process across every shipped quest plus a full overworld sweep,
  checking nine invariant oracles every step. `crawl:smoke` runs every loop
  cycle (pre- and post-work gate); `crawl:deep` is a longer soak, nightly or
  manual.
- **Tier 2 — pure blind LLM playtests** (`blind-tester/`): a fresh,
  no-repo-access agent starts a brand-new overworld game, receives only the
  human player surface, and follows its versioned current goals, authored story
  choices, and goal/checkpoint continue-or-end choices. Under current contract
  v3, every goal-completion retention event identifies the goal it closed and a
  post-continue authored choice may install the next objective. The harness
  interviews only after a confirmed exit and cross-checks the schema-V2 report
  receipt against server evidence. Evidence-sidecar v2 binds seed, clean tracked
  commit, canonical world id/hash, and quest outcomes. One per normal cycle; the
  loop's commit gate requires that V2 sidecar, verifies its exact receipt, and
  rejects evidence whose build commit is not the current provisional HEAD. The
  milestone/feedback-harvest `fleet` runs 100 seed/model variants of that same
  neutral pure contract. Direct quest, persona-coverage, crawler, smoke, and
  mock paths are explicit structural QA and never pure retention evidence.
- **Tier 3 — feedback compiler** (`src/feedback/`): reads verified Tier-2
  reports plus Tier-1 findings, clusters them, ranks by severity and source
  agreement, and emits `hotspots.{json,md}` plus mode-separated
  `retention.json`. Structural smoke and legacy reports remain useful
  QA/experience inputs; deterministic structural mocks verify the pipeline but
  cannot create product hot spots or experience metrics. Only sidecar-verified
  pure exits enter retention.

```
   Tier 0 (always)              Tier 1: crawl:smoke/deep        Tier 2: pure blind / fleet
   vitest+validators+solver     zero-LLM engine sweep           game-led play + exit receipt
   proves structure                    │ findings.jsonl                │ reports/*.md
                                        ▼                                ▼
                                  Tier 3: feedback:compile  ◄────────────┘
                                        │
                                        ▼
                 ai-runs/feedback/<ts>/{hotspots.json,hotspots.md,retention.json}
                                        │
                                        ▼
                          npm run assess / ai:loop (assessor)
                                        │
                                        ▼
                            ONE ranked next-best fix → loop
```

## 2. When each runs + budgets

| Lane                          | Trigger                                                                                                     | Budget                                                                                                                                                                                                               | Cost                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `crawl:smoke`                 | every loop cycle (pre- and post-work gate)                                                                  | fixed two-seed, 250-step-per-quest single-worker sweep; runtime is machine-dependent                                                                                                                                 | free                      |
| `crawl:deep`                  | nightly (`deep-audit.yml`) / manual dispatch                                                                | 64 seeds, 2,000 steps per quest, 20,000-state solver budget, and eight workers with 900s soft cutoffs; runtime is machine-dependent, and any cutoff is loud via `truncated` / `skippedItems`                         | free                      |
| `verify:bug-traces`           | every health/CI run; repeated nightly                                                                       | parse all `traces/bugs/*.yaml`; validate mapping/ID/narrative essentials and current-or-historical concrete path references                                                                                          | free                      |
| `verify:opening-density`      | every health/CI run                                                                                         | canonical compact start: at most 732 word tokens and 12 immediately actionable options before the first player action; reductions do not require a re-pin                                                            | free                      |
| `test:coverage`               | nightly / manual non-player audit                                                                           | V8 statement/branch/function/line report for root `src`, `bin`, `scripts`, and `agents` exercised by Vitest's standard project; coverage-only 300 s per-test ceiling; JSON summary + browsable HTML retained 30 days | free, long-running        |
| `blind` (single)              | every normal cycle                                                                                          | one pure journey; game-native goal/checkpoints govern exit                                                                                                                                                           | $ (one LLM playtest)      |
| `fleet -- --admission-canary` | before expanding Spark spend or a Spark transport change                                                    | three planned serial fresh Spark pure runs; first failure suppresses unlaunched slots; isolated transport go/no-go, never certification                                                                              | up to $ × 3               |
| `fleet -- --count 100`        | milestone / feedback-harvest cycles (~every 10, or when the ledger's open questions outgrow single reports) | 100 pure fresh-overworld runs at `--concurrency C`                                                                                                                                                                   | $ × 100 (real LLM tokens) |
| `starting-slice:pilot`        | after authority/model tooling changes and before an authoritative spend                                     | reverify one exact fresh 10-member homogeneous-provider/model no-retry cohort as a go/no-go pilot; never certification                                                                                               | free                      |
| `starting-slice:certify`      | after an authoritative starting-slice fleet closes                                                          | reverify the exact 100-report authenticated bundle and evaluate the milestone gates                                                                                                                                  | free                      |
| `fleet:mock`                  | every CI run (rides `npm test`)                                                                             | explicit structural acceptance e2e; never retention evidence                                                                                                                                                         | zero tokens               |
| `feedback:compile`            | whenever ≥3 new actionable reports exist since the last compile (structural mocks excluded)                 | seconds (deterministic clustering)                                                                                                                                                                                   | free                      |

## 3. Exact commands

```bash
# Tier 1 — mechanical crawler
npm run crawl:smoke                                # loop gate: all quests + overworld sweep, exit 1 on any non-ORPHAN finding
npm run crawl:deep                                 # nightly/manual soak (multi-worker)
npm run crawl -- --workers 4 --seeds 7             # custom invocation (flags in bin/crawl.ts)

# Non-player integrity and measurement
npm run verify:bug-traces                          # strict YAML/identity/current-or-historical path gate
npm run verify:opening-density                     # real compact opening against 732-token / 12-option ceilings
npm run test:coverage                              # standard-project V8 report in coverage/
npm run audit:non-player                           # all three checks above

# Tier 2 — blind playtests
npm run blind                                      # canonical pure player, fresh overworld
npm run blind:smoke                                # explicit structural MCP check, no LLM/tokens
bash blind-tester/run.sh --smoke --quest sunken_barrow --seed 7 # targeted structural check, no LLM
npm run fleet -- --admission-canary --label <fresh-spark-admission-label> --out <separate-report-dir> --seed-base <fresh-spark-seed-base>
npm run fleet -- --provider codex --model gpt-5.3-codex-spark --count <n-greater-than-3> --admission-receipt ai-runs/fleet/<fresh-spark-admission-label>/admission.json --seed-base <fresh-seed-base> --label <fresh-label> --no-resume --max-retries 0
npm run fleet -- --provider codex --model gpt-5.6-terra --count 10 --concurrency 4 --seed-base <fresh-pilot-seed-base> --label <fresh-pilot-label> --no-resume --max-retries 0
npm run starting-slice:pilot -- --fleet ai-runs/fleet/<fresh-pilot-label>
npm run fleet -- --provider codex --model gpt-5.6-terra --count 100 --concurrency 4 --seed-base <fresh-seed-base> --label <fresh-label> --no-resume --max-retries 0
npm run fleet:mock -- --count 2                    # structural, zero-token, CI-safe
npm run starting-slice:certify -- --fleet ai-runs/fleet/<label>

# Tier 3 — feedback compiler
npm run feedback:compile                           # defaults: --in blind-tester/reports + newest crawl findings
npm run feedback:compile -- --in <dir|jsonl> --out <dir> --top 10 --prev <dir> --llm-labels

# Consuming the pyramid
npm run assess                                     # preview the ranked next-best-improvement backlog
npm run ai:loop                                    # one cycle: assess + emit prompt/artifacts
```

`crawl:deep` and a live (non-mock) `fleet` run spend real time/tokens. The
zero-token deep crawl runs nightly or by manual workflow dispatch, never inside
the PR smoke gate; live fleets remain deliberate operator launches. Before launching a
live member, fleet preflight freezes the full clean tracked Git commit,
canonical world id/hash, contiguous seeds, and run/model plan. Dirty state or a
Git/provenance error fails before token spend; untracked notes do not dirty the
check. A live fleet label must be fresh and names one closed cohort, so an
existing label is rejected rather than appended to or mixed with stale rows.
Live pure starts also share a fail-closed Git-common cohort ledger across linked
worktrees: an active lease blocks every concurrent launch, while immutable
intent records reject exact or overlapping member plans unless an operator
supplies the current exact cohort fingerprint for a persisted exact duplicate.
The runner never performs PID-based stale-lock recovery; after confirming no
runner remains, an operator may remove only the active lease manually. See the
fleet section of `docs/blind_playtest_protocol.md` for the record and recovery
limits.

The opening-density budget measures the actual default `start_overworld`
payload before the player's first action. Its word total includes tutorial,
goal/guidance, the compact legend, and compact context; its option total includes
immediately available roads, areas, points of interest, contacts, events, and
available services. The 2026-08-05 baseline is 732 word tokens and 12 actionable
options. Either number may fall without changing the ceiling; exceeding either
fails health and CI. This counter-metric prevents a wording or schema change from
silently paying for clarity by adding still more opening material.

Bug artifacts are historical evidence, so their concrete file references may
resolve in the current tree or in reachable Git history. CI checks out full
history for this reason. Ignored ad-hoc recorder output is generated evidence,
not a source-file reference.
The scheduled coverage report is deliberately separate from `npm run health`:
it makes standard-suite reach measurable without running the already long suite
twice on every pull request or turning an uncalibrated percentage into a gate.
V8 instrumentation plus full-suite worker contention pushes the largest standard
restore properties and counterfactual matrices past the ordinary 60-second
fail-fast ceiling, so `test:coverage` alone allows 300 seconds per test. The
normal standard suite keeps its 60-second ceiling, and the coverage audit keeps
its separate 4,200-second soft budget.

Live fleets enforce `play_mode: pure`, `start_surface: fresh_overworld`, and the
neutral default persona. The live fleet defaults to Codex
`gpt-5.3-codex-spark` for ordinary feedback harvests and
accepts only exact homogeneous `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`,
or `gpt-5.3-codex-spark` plans. The canonical pilot and authority commands pin
Terra explicitly so both cohorts use the same model. Before the 100-player
spend, `starting-slice:pilot` must pass one fresh ten-member homogeneous cohort
with 10/10 primary
unrecovered members, unique game and provider sessions, one exact actual
model id, at least three recognized Wolf-Winter strategies, and no strategy
above 7/10. The pilot has a distinct result kind and cannot certify the slice.
Exact Spark uses audited `spark-direct-mcp-v1`: the pure AdventureForge tools are
preloaded through a tracked game-only player catalog and the first native call is
`start_overworld({})`. The catalog disables coding tools, Spark-only runner flags
disable optional context injectors, and the clean build commit binds both.
Subsequent calls must stay in the
attested pure set while the game server enforces current legality. Sol, Terra,
and Luna retain
`strict-code-mode-v2` wrappers. Lifecycle ids are validated within each stream;
ordered tools, arguments, results, and visible outputs must cross-bind between
public and private streams under the selected transport;
tool/resource discovery, cross-server calls, or a transport
mismatch reject the run. Before larger Spark spend, `--admission-canary` must
pass its three serial fresh pure runs. Its separate `admission.json` is marked
noncertifying and does not count as pilot or authority evidence. A live Spark
fleet larger than three must supply it through `--admission-receipt`; the exact
clean build/world, transport fingerprint, model, client authority/version, and
gate configuration must still match or the fleet fails before player launch.
Every current Codex model also rejects opaque CLI compaction from pure evidence,
including a second world or turn context; `auto_compact_token_limit: null`
preserves default headroom but is not a proof that compaction is disabled.
Resume is a diagnostic
convenience and requires a
reverified evidence-sidecar-v2 report with the current journey contract and
exact planned seed/build/world. Generic readers retain historical sidecar-v1
readability, but v1, legacy, and structural reports cannot enter the cohort. The
20-minute member timeout is a technical failure/failsafe, not the intended
endpoint. Failed artifacts are digest-indexed in a per-attempt bundle archive
before retry; strict-stream exit 43 is terminal, publishes no playtest, and is
never retried. The closed manifest and summary count every attempt, so an eventual
success cannot erase a prior timeout or verification/launcher failure. Any such
label exits nonzero and cannot certify. A resume-enabled fleet or skipped slot
is also non-certifying: an authoritative fresh label must use
`--no-resume --max-retries 0` and launch exactly one successful attempt for each
of its 100 slots. The current Codex launcher has no model-recovery turn. A
historical recovered report remains readable only with a complete, byte-bound
`.initial-report.txt` / `.repair.meta.json` / `.repair.json` set, never another
discoverable Markdown report, and remains diagnostic-only because its
subjective interview was generated after the primary report. Targeted quest
starts remain available only to non-LLM smoke/mock lanes and the mechanical
crawler.

## 4. Schemas

**Crawl finding** (`src/crawl/findings.ts`, zod `.strict()`), one JSONL row:
`{ code, severity, seed, policy, step, location: {region,node,questId,sceneId},
action, message, stateHash, commit, repro: {kind,trace,minimized} }`. Nine
finding codes: `CRASH · INTEGRITY · DESYNC · PERSIST · LEGALITY · SOFTLOCK ·
RENDER · WORLD · ORPHAN`, each with a fixed severity (`CODE_SEVERITY`);
`findingFingerprint` (code + canonical location + normalized message) dedupes
repeats, and `repro` holds a ddmin-minimized, replayable trace.

**Pure exit evidence** (`src/blind/exit_interview.ts` plus the server-authored
run JSONL): report-schema V2 reports declare `play_mode: pure`,
`start_surface: fresh_overworld`, `retention_eligible: true`, and carry the exact
journey receipt returned on exit. The receipt records the versioned game
contract, meaningful-decision proof/count, current goal, ordered completed-goal
history, every goal-bound or checkpoint continue/end choice, and the exit
reason. Report schema V2 and journey contract v3 are independent version axes.
Follow-up objective routing is also game-owned: UI and MCP receive the same
Goal Passage choice and aggregate consequence forecast. Passage applies each
real road leg but yields at authored choices, objective arrival, and resource
boundaries; intermediate route and future-event knowledge remain hidden before
travel, while the pure harness remains route-blind and non-prescriptive.
An independently verified evidence-sidecar v2 and fleet manifest preserve that
metadata plus the private run seed, full Git commit, tracked-worktree-clean bit,
canonical world id/hash, and sorted quest outcomes. Fresh-start and exit events
must carry identical provenance. Historical sidecar v1 remains readable by the
generic evidence parser but is ineligible for current fleet resume or
certification; structural and legacy outputs are explicitly
retention-ineligible.
Each live member's runner-owned attestation binds its planned provider/model,
exact singleton provider-evidence model provenance, unique provider session, completed clean
primary envelope, game session, and artifact hashes. Historical Claude v2
attestations remain compatible. Codex v3 also binds actual provider, effort,
turn id, working directory, public events, exactly one copied rollout, and its
strict canonical-cwd/filesystem-identity capture receipt. The receipt and rollout
are independently rehashed; `task_complete` must be the last row and abort/error
lifecycle history is forbidden. Historical Codex v4 additionally distinguishes
deterministic receipt binding: the provider's original report and strict
`.receipt-bind.json` metadata are hashed, the final report must reproduce by
replacing only the existing receipt value from raw server evidence, and the
unchanged report verifier must pass. This zero-model transformation preserves
all subjective evidence, so it is certifiable; model-assisted report recovery
remains forbidden. Codex v8 is the current contract: it authenticates the exact
selected model-specific transport, Spark capture schema v4 or strict capture
schema v3 as applicable, public/private cross-binding, and the fleet-wide frozen
effective client authority plus exact CLI version. That authority binds the original
canonical Unix npm symlink when present, the exact package/entrypoint/native
closure, and a native-only final execution target; unsupported script launchers
cannot downgrade to one-file authority. Current resume and certification require
v8; receipt schemas v1-v3 and Codex v3-v7 are historical-readable only. Codex
`turn_context.model` is a CLI-recorded selected-model value, not a provider-signed
remote-backend identity. Resume and certification reparse these retained facts.
The cwd receipt is a trusted capture-time runner assertion: after cleanup they
cannot re-stat the deleted temporary directory or defend against a privileged
actor coherently rewriting the entire artifact bundle.

**Retention compile** (`src/feedback/evidence_summary.ts`) writes
`retention.json`: verified report counts split by pure/structural/legacy-guided,
plus pure-only decision statistics and actual continue/end choices by
trigger/checkpoint within each journey-contract version. Historical v1 and
v2 curves and current v3 curves remain independently verifiable but are never
pooled.
`would_replay` remains a separate post-exit attitude metric.

**Starting-slice pilot/certification** reparses every report and sidecar in one
closed fleet bundle. Both require unique contiguous planned seeds, no
failed/missing/resumed/recovered slots, exactly one verified attempt per slot,
one clean build/world, unique game and provider sessions, one exact authenticated
actual model id, and a homogeneous supported provider/model under the current
pure fresh-overworld/default-player contract. The pilot fixes the count to ten and requires 10/10 completion plus
its 7/10 strategy cap; its distinct artifact is readiness evidence only. The
authority checker does not automatically discover or link that artifact, so
retaining and reviewing a fresh same-model pilot is an operational prerequisite
before the 100-player spend.
Certification fixes the count to 100 and is the only authority result. Report
basenames must carry the cohort's current stamp, preventing historical reports
from being relabeled as fresh. Receipt-bound Codex members remain eligible only
when current v8 attestation, original provider bytes, binding metadata, raw evidence,
and the reproduced final report all agree; manifests and summaries count them
separately from report recovery.
Malformed evidence exits 2, a threshold miss exits 1, and a pass exits 0. Exact
quality gates, outcome mapping, and the conservative fleet-local issue-scope rule
live in [`STARTING_SLICE.md`](STARTING_SLICE.md); `would_replay` is not
continuation, and global feedback history never certifies the slice.

**Hotspots file v2** (`src/feedback/schema.ts`, zod `.strict()`),
`hotspots.json` top level: `{ version, generated_at, commit, inputs, metrics,
sycophancy, hotspots, recommended_next_fix }`. Each `Hotspot`: `{ id, title,
location, severity_band, max_severity, count, sources, personas, score,
fix_layer, evidence, trend, prev_score }`. `score = count × severity_weight ×
source_diversity` (§ `src/feedback/rank.ts`: `S0=1 … S4=16`; both sources
agreeing doubles the score). `inputs` reconciles `verified_reports` as
`actionable_reports + excluded_mock_reports`; `sycophancy` carries zero-negative
rates and 1–5 histograms over actionable reports, overall and per-persona.

**Severity polarity**: S0 = cosmetic, S4 = blocking.

**Fix-layer taxonomy**: `content | hint_text | quest_structure | engine_rule |
validator | test`.

## 5. How findings become fixes

- **Crawler → fix**: a finding's repro is ddmin-minimized to the shortest
  reproducing action sequence, written as a `traces/bugs/` artifact plus a
  regression test that fails if the defect returns. First real catch:
  `bug_0496` (`traces/bugs/bug_0496_overworld_renown_restore.yaml`).
- **Fleet → fix**: exit interviews accumulate in `blind-tester/reports/`;
  `feedback:compile` clusters and ranks them into hot spots; the assessor
  (`npm run assess` / `ai:loop`) takes the top few as candidates — never
  outranking an unplayable-quest fix — and the loop makes ONE fix per cycle.
- **Proving movement**: the next `feedback:compile` diffs against the
  previous run (`--prev`) and tags each hotspot `improved | regressed | new |
flat` — the trend line is the evidence a fix actually worked.
