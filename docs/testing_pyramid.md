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
  human player surface, and plays until the game presents a goal/checkpoint
  continue-or-end choice. The harness interviews only after a confirmed exit
  and cross-checks the V2 report receipt against server evidence. One per normal
  cycle; the milestone/feedback-harvest `fleet` runs 100 seed/model variants of
  that same neutral pure contract. Direct quest, persona-coverage, crawler,
  smoke, and mock paths are explicit structural QA and never pure retention
  evidence.
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

| Lane                   | Trigger                                                                                                     | Budget                                                                                                                                                                                                                                                                                                                      | Cost                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `crawl:smoke`          | every loop cycle (pre- and post-work gate)                                                                  | ~10s deterministic (single-worker smoke config, ~3660 steps/s)                                                                                                                                                                                                                                                              | free                      |
| `crawl:deep`           | nightly / manual                                                                                            | ≥2min soak (multi-worker; measured 352k steps @ ~1935 steps/s incl. 20k-state solver; findings are byte-identical across `--workers` only absent `--seconds` truncation — per-worker deadlines mean WHICH items truncate can vary with worker count once the soak budget bites, always loud via `truncated`/`skippedItems`) | free                      |
| `blind` (single)       | every normal cycle                                                                                          | one pure journey; game-native goal/checkpoints govern exit                                                                                                                                                                                                                                                                  | $ (one LLM playtest)      |
| `fleet -- --count 100` | milestone / feedback-harvest cycles (~every 10, or when the ledger's open questions outgrow single reports) | 100 pure fresh-overworld runs at `--concurrency C`                                                                                                                                                                                                                                                                          | $ × 100 (real LLM tokens) |
| `fleet:mock`           | every CI run (rides `npm test`)                                                                             | explicit structural acceptance e2e; never retention evidence                                                                                                                                                                                                                                                               | zero tokens               |
| `feedback:compile`     | whenever ≥3 new verified reports exist since the last compile                                               | seconds (deterministic clustering)                                                                                                                                                                                                                                                                                          | free                      |

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
npm run fleet -- --count 100 --concurrency 4 --model mix --seed-base 1000
npm run fleet:mock -- --count 2                    # structural, zero-token, CI-safe

# Tier 3 — feedback compiler
npm run feedback:compile                           # defaults: --in blind-tester/reports + newest crawl findings
npm run feedback:compile -- --in <dir|jsonl> --out <dir> --top 10 --prev <dir> --llm-labels

# Consuming the pyramid
npm run assess                                     # preview the ranked next-best-improvement backlog
npm run ai:loop                                    # one cycle: assess + emit prompt/artifacts
```

`crawl:deep` and a live (non-mock) `fleet` run spend real time/tokens — run
them nightly or manually, never inside an automated smoke check. Live fleets
enforce `play_mode: pure`, `start_surface: fresh_overworld`, and the neutral
default persona; a legacy/structural report cannot resume a member. The
15-minute member timeout is a technical failure/failsafe, not the intended
endpoint. Launch live fleets from a plain shell, not from inside a Claude Code
session (nested CLI auth returns 401). Targeted quest starts remain available
only to non-LLM smoke/mock lanes and the mechanical crawler.

## 4. Schemas

**Crawl finding** (`src/crawl/findings.ts`, zod `.strict()`), one JSONL row:
`{ code, severity, seed, policy, step, location: {region,node,questId,sceneId},
action, message, stateHash, commit, repro: {kind,trace,minimized} }`. Nine
finding codes: `CRASH · INTEGRITY · DESYNC · PERSIST · LEGALITY · SOFTLOCK ·
RENDER · WORLD · ORPHAN`, each with a fixed severity (`CODE_SEVERITY`);
`findingFingerprint` (code + canonical location + normalized message) dedupes
repeats, and `repro` holds a ddmin-minimized, replayable trace.

**Pure exit evidence** (`src/blind/exit_interview.ts` plus the server-authored
run JSONL): V2 reports declare `play_mode: pure`,
`start_surface: fresh_overworld`, `retention_eligible: true`, and carry the exact
journey receipt returned on exit. The receipt records the versioned game
contract, accepted-decision proof/count, goal state, all continue/end choices,
and the exit reason. An independently verified `.run.json` sidecar and fleet
manifest preserve that metadata; structural and legacy outputs are explicitly
retention-ineligible.

**Retention compile** (`src/feedback/evidence_summary.ts`) writes
`retention.json`: verified report counts split by pure/structural/legacy-guided,
plus pure-only accepted-decision statistics and actual continue/end choices by
trigger/checkpoint. `would_replay` remains a separate post-exit attitude metric.

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
