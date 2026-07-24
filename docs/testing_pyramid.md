# The testing pyramid

Three tiers, one oracle chain: mechanical structure, blind experience, and a
compiler that turns both into ranked fixes. `AGENTS.md` and `docs/afk_loop.md`
wire this into the loop; this is the canonical reference for what each tier
does, when it runs, and its exact shapes.

## 1. The pyramid

- **Tier 0 — dev tests** (always, inside `npm run health`): the vitest
  unit/property/regression suite, the two validators, and the exhaustive
  solver. Proves _structure_: every ending reachable, no soft-locks, sound
  scoring, no test/schema regressions.
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
  milestone/feedback-harvest `fleet` runs 100 seed/model variants of that same
  neutral pure contract. Direct quest, persona-coverage, crawler, smoke, and
  mock paths are explicit structural QA and never pure retention evidence.
- **Tier 3 — feedback compiler** (`src/feedback/`): reads verified Tier-2
  reports plus Tier-1 findings, clusters them, ranks by severity and source
  agreement, and emits `hotspots.{json,md}` plus mode-separated
  `retention.json`. Structural/legacy reports remain useful QA/experience
  inputs; only sidecar-verified pure exits enter retention.

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

| Lane                     | Trigger                                                                                                     | Budget                                                                                                                                                                                                                                                                                                                      | Cost                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `crawl:smoke`            | every loop cycle (pre- and post-work gate)                                                                  | ~10s deterministic (single-worker smoke config, ~3660 steps/s)                                                                                                                                                                                                                                                              | free                      |
| `crawl:deep`             | nightly / manual                                                                                            | ≥2min soak (multi-worker; measured 352k steps @ ~1935 steps/s incl. 20k-state solver; findings are byte-identical across `--workers` only absent `--seconds` truncation — per-worker deadlines mean WHICH items truncate can vary with worker count once the soak budget bites, always loud via `truncated`/`skippedItems`) | free                      |
| `blind` (single)         | every normal cycle                                                                                          | one pure journey; game-native goal/checkpoints govern exit                                                                                                                                                                                                                                                                  | $ (one LLM playtest)      |
| `fleet -- --count 100`   | milestone / feedback-harvest cycles (~every 10, or when the ledger's open questions outgrow single reports) | 100 pure fresh-overworld runs at `--concurrency C`                                                                                                                                                                                                                                                                          | $ × 100 (real LLM tokens) |
| `starting-slice:pilot`   | after authority/model tooling changes and before an authoritative spend                                     | reverify one exact fresh 10-member homogeneous-provider/model no-retry cohort as a go/no-go pilot; never certification                                                                                                                                                                                                      | free                      |
| `starting-slice:certify` | after an authoritative starting-slice fleet closes                                                          | reverify the exact 100-report authenticated bundle and evaluate the milestone gates                                                                                                                                                                                                                                         | free                      |
| `fleet:mock`             | every CI run (rides `npm test`)                                                                             | explicit structural acceptance e2e; never retention evidence                                                                                                                                                                                                                                                                | zero tokens               |
| `feedback:compile`       | whenever ≥3 new verified reports exist since the last compile                                               | seconds (deterministic clustering)                                                                                                                                                                                                                                                                                          | free                      |

## 3. Exact commands

```bash
# Tier 1 — mechanical crawler
npm run crawl:smoke                                # loop gate: all quests + overworld sweep, exit 1 on any non-ORPHAN finding
npm run crawl:deep                                 # nightly/manual soak (multi-worker)
npm run crawl -- --workers 4 --seed 7              # custom invocation (flags in bin/crawl.ts)

# Tier 2 — blind playtests
npm run blind                                      # canonical pure player, fresh overworld
npm run blind:smoke                                # explicit structural MCP check, no LLM/tokens
bash blind-tester/run.sh --smoke --quest sunken_barrow --seed 7 # targeted structural check, no LLM
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

`crawl:deep` and a live (non-mock) `fleet` run spend real time/tokens — run them
nightly or manually, never inside an automated smoke check. Before launching a
live member, fleet preflight freezes the full clean tracked Git commit,
canonical world id/hash, contiguous seeds, and run/model plan. Dirty state or a
Git/provenance error fails before token spend; untracked notes do not dirty the
check. A live fleet label must be fresh and names one closed cohort, so an
existing label is rejected rather than appended to or mixed with stale rows.

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
Resume is a diagnostic
convenience and requires a
reverified evidence-sidecar-v2 report with the current journey contract and
exact planned seed/build/world. Generic readers retain historical sidecar-v1
readability, but v1, legacy, and structural reports cannot enter the cohort. The
20-minute member timeout is a technical failure/failsafe, not the intended
endpoint. Failed artifacts are digest-indexed in a per-attempt bundle archive
before retry; the closed manifest and summary count every attempt, so an eventual
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
remains forbidden. Codex v6 is the current contract: it additionally
authenticates strict capture v3, the model-specific code-mode prelude, and every
canonical pragma/awaited-forward wrapper. Current resume and certification require
v6; v3/v5 (including strict v1) and v4 are historical-readable only. Codex
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
when current v6 attestation, original provider bytes, binding metadata, raw evidence,
and the reproduced final report all agree; manifests and summaries count them
separately from report recovery.
Malformed evidence exits 2, a threshold miss exits 1, and a pass exits 0. Exact
quality gates, outcome mapping, and the conservative fleet-local issue-scope rule
live in [`STARTING_SLICE.md`](STARTING_SLICE.md); `would_replay` is not
continuation, and global feedback history never certifies the slice.

**Hotspots file** (`src/feedback/schema.ts`, zod `.strict()`),
`hotspots.json` top level: `{ version, generated_at, commit, inputs, metrics,
sycophancy, hotspots, recommended_next_fix }`. Each `Hotspot`: `{ id, title,
location, severity_band, max_severity, count, sources, personas, score,
fix_layer, evidence, trend, prev_score }`. `score = count × severity_weight ×
source_diversity` (§ `src/feedback/rank.ts`: `S0=1 … S4=16`; both sources
agreeing doubles the score). `sycophancy` carries zero-negative rates and
1–5 histograms, overall and per-persona.

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
