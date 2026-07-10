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
- **Tier 2 — blind LLM playtests** (`blind-tester/`): a fresh, no-repo-access
  agent plays through the `mcp__adventureforge__*` tools only and files a
  structured report ending in a JSON exit interview. One per normal cycle;
  `fleet` runs N of them (persona/model/seed/target diversity) for milestone
  or feedback-harvest cycles; `fleet:mock` is a zero-token deterministic
  stand-in for CI.
- **Tier 3 — feedback compiler** (`src/feedback/`): reads verified Tier-2
  reports plus Tier-1 findings, clusters them, ranks by severity and source
  agreement, and emits `hotspots.{json,md}` — the assessor's primary ranking
  input.

```
   Tier 0 (always)              Tier 1: crawl:smoke/deep        Tier 2: blind / fleet / fleet:mock
   vitest+validators+solver     zero-LLM engine sweep           LLM playtest + exit interview
   proves structure                    │ findings.jsonl                │ reports/*.md
                                        ▼                                ▼
                                  Tier 3: feedback:compile  ◄────────────┘
                                        │
                                        ▼
                        ai-runs/feedback/<ts>/hotspots.{json,md}
                                        │
                                        ▼
                          npm run assess / ai:loop (assessor)
                                        │
                                        ▼
                            ONE ranked next-best fix → loop
```

## 2. When each runs + budgets

| Lane                 | Trigger                                             | Budget                                                        | Cost                     |
| --------------------- | ---------------------------------------------------- | -------------------------------------------------------------- | ------------------------ |
| `crawl:smoke`        | every loop cycle (pre- and post-work gate)          | ~10s deterministic (single-worker smoke config, ~3660 steps/s) | free                     |
| `crawl:deep`         | nightly / manual                                    | ≥2min soak (multi-worker; measured 352k steps @ ~1935 steps/s incl. 20k-state solver) | free                     |
| `blind` (single)     | every normal cycle                                  | one playthrough, minutes                                       | $ (one LLM playtest)     |
| `fleet -- --count N` | milestone / feedback-harvest cycles (~every 10, or when the ledger's open questions outgrow single reports) | N runs at `--concurrency C`                                     | $ × N (real LLM tokens)  |
| `fleet:mock`         | every CI run (rides `npm test`)                     | small acceptance e2e (4+2 runs); standalone 20-run lane verified 20/20 in ~18s | zero tokens              |
| `feedback:compile`   | whenever ≥3 new verified reports exist since the last compile | seconds (deterministic clustering)                              | free                     |

## 3. Exact commands

```bash
# Tier 1 — mechanical crawler
npm run crawl:smoke                                # loop gate: all quests + overworld sweep, exit 1 on any non-ORPHAN finding
npm run crawl:deep                                 # nightly/manual soak (multi-worker)
npm run crawl -- --workers 4 --seed 7              # custom invocation (flags in bin/crawl.ts)

# Tier 2 — blind playtests
npm run blind                                      # single blind playtest, core-game overworld
npm run blind -- --quest sunken_barrow --seed 7    # targeted quest mode
npm run blind:smoke                                # MCP-plumbing check, no LLM, no tokens
npm run fleet -- --count 20 --concurrency 4 --model mix --personas mixed --target overworld --seed-base 1000
npm run fleet:mock -- --count 2                    # zero-token, CI-safe fleet (mock agent)

# Tier 3 — feedback compiler
npm run feedback:compile                           # defaults: --in blind-tester/reports + newest crawl findings
npm run feedback:compile -- --in <dir|jsonl> --out <dir> --top 10 --prev <dir> --llm-labels

# Consuming the pyramid
npm run assess                                     # preview the ranked next-best-improvement backlog
npm run ai:loop                                    # one cycle: assess + emit prompt/artifacts
```

`crawl:deep` and a live (non-mock) `fleet` run spend real time/tokens — run
them nightly or manually, never inside an automated smoke check. Live `fleet`
runs must be launched from a plain shell, not from inside a Claude Code
session (nested CLI auth returns 401).

## 4. Schemas

**Crawl finding** (`src/crawl/findings.ts`, zod `.strict()`), one JSONL row:
`{ code, severity, seed, policy, step, location: {region,node,questId,sceneId},
action, message, stateHash, commit, repro: {kind,trace,minimized} }`. Nine
finding codes: `CRASH · INTEGRITY · DESYNC · PERSIST · LEGALITY · SOFTLOCK ·
RENDER · WORLD · ORPHAN`, each with a fixed severity (`CODE_SEVERITY`);
`findingFingerprint` (code + canonical location + normalized message) dedupes
repeats, and `repro` holds a ddmin-minimized, replayable trace.

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
