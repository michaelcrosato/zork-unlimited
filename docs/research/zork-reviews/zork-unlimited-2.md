# Salvage Review: zork-unlimited-2 ("AdventureForge")

| | |
|---|---|
| **Source repo** | `zork-unlimited-2` (DELETED from local disk 2026-06-09; reviewed via detached worktree of the snapshot tag) |
| **GitHub remote** | https://github.com/michaelcrosato/zork-unlimited-2 |
| **Snapshot tag** | `pre-purge-20260609` (= `23026f0`, final experiment commit 2026-06-09 19:45) — local bundle backup in `C:\dev\_purge-backup\` |
| **Review date** | 2026-06-09 |
| **Driving model/harness** | **Google Antigravity CLI (`agy`, Gemini-powered) in YOLO mode** inside a custom bash while-loop (`bin/ai-autonomous-dev`); **Google Jules** for 3 UI/a11y branch commits; Gemini 1.5 Flash / GPT-4o-mini configured for playtester agents (mock LLM used in practice) |
| **Span / volume** | 2026-05-31 → 2026-06-09 (10 days), **546 commits**, ~410+ recorded autonomous cycles |

## Verdict

This was the orchestration-heaviest of the four experiments: a Gemini/Antigravity agent ran a self-committing AFK loop at ~5-minute cadence (409 commits on June 3-4 alone) on top of a genuinely solid deterministic engine it built in the first 2 hours. The determinism/replay/playtest architecture is real and spec-compliant — pure `step()`, seeded Mulberry32, canonical-JSON SHA-256 state hashes, trace replay, an MCP game server, and an excellent parallel blind-playtest→feedback-digest→dev-loop pipeline. But with no externally controlled backlog, the loop pathologically self-assigned work: ~52 cycles invented gossip protocols, CRDTs, mesh routing, and CDS/CDO sovereign-debt derivatives inside a text adventure (sync.ts: 54K lines), then ~325 consecutive cycles generated gibberish parser synonyms ("mastocytoclastopoiesis" → MOVE; 222K lines, 79% of all 4,984 tests). The harness engineering (verification gates, auto-revert, circuit breakers, file-based agent memory) is the most valuable salvage; the failure mode — task selection, not capability — is the central lesson for the controlled experiment.

## 1. Origin & Mission

- **Spec**: `AdventureForge_final_build_spec-c.md` (1,001 lines, "Compiled: 2026-05-31", committed in the first commit). Goal: "Prove, end to end, that an AI can author a text adventure, compile it into a schema-valid game, run it on a deterministic headless engine, play it through a structured action API, test it, record its experience, find design/logic flaws, fix them, and lock the fix with a regression test."
- Spec is model-agnostic ("Intended reader: a frontier coding agent... plus its human supervisor"), prescribes: 3-layer architecture (Story→Game-Design-data→Engine, "the LLM is never the game engine"), TypeScript+Zod primary / Python+Pydantic alternative, stage ladder CYOA→Zork-parser→Sierra-Quest→Hero's-Quest-RPG→UI, non-negotiable determinism contract (§8.5), engine-extension gate (§14), bug-artifact+regression format (§15), 8-persona playtest roster (§12.8), and an evidence base citing RPGBench, TALES, Jericho, TextWorld, TextQuests, ZorkGPT. The "-c" filename suggests a variant of the spec used by zork-unlimited #1 — content here looks like the generic full spec.
- **Timeline**: First commit 2026-05-31 13:53. By **15:23 the same day** (5 commits, ~90 min) the agent claimed Stages 0-3 complete plus "RPG mechanics, turn-based combat engine, premium web UI". By 15:53 it had built its own AFK loop harness and targeted "the official Antigravity agy binary" (commit `0a2f1c1`). Everything after day 1 was loop output.
- **Harness evidence**: `bin/ai-autonomous-dev` runs `agy --dangerously-skip-permissions --print "$PROMPT"`; DEVLOG.md header: "Author: Antigravity agent session `4f0dd58c`"; `.gitignore` excludes `.antigravitycli/` and `.gemini/`; learnings.md references `~/.gemini/antigravity-cli/scratch`; `.Jules/palette.md` + 3 `google-labs-jules[bot]` commits + `palette-*` branch names = Jules. Original host was a Linux box (`/home/michael_crosato/projects/zork-unlimited-2` hardcoded early, later fixed).
- **Authorship**: 474 commits as `michael.crosato@example.com` (the agent's misconfigured git identity), 69 as the real gmail (manual overhaul + orchestrator sessions), 3 Jules bot.
- **Commit cadence**: 05-31: 10 | 06-03: 204 | 06-04: 205 | 06-05: 55 | 06-06: 26 | 06-07: 34 | 06-08: 3 | 06-09: 9. June 1-2 work (cycles 1-53) was batch-committed 06-03 09:19. Loop cycles ran ~5-7 min apart. DEVLOG claims "~2100 autonomous AI development cycles"; max recorded cycle is **#410** (IMPROVEMENT_LOG, 06-04) — treat 2100 as unverified/inflated (loop counters reset on every restart).

## 2. Engine Design (claims verified)

- **Deterministic core: REAL.** `src/core/rng.ts` (38 lines) is a pure *static* Mulberry32 — `PureRand.next(seed) → {value, nextSeed}` — seed threaded through state, no instance state, no `Math.random`. `src/core/hash.ts` (54 lines): recursive key-sorted canonical JSON → SHA-256 (excludes `stateHistory`/`journal`/`cooperativeSyncLog` from the hash). `tests/determinism.test.ts` asserts "byte-identical hashes step-by-step" (example-based; **the spec-mandated fast-check property tests were never added** — no fast-check dependency exists).
- **Replay: REAL.** `traces/*.json` (9 files) carry `pack_id`, `content_hash`, `seed`, action list, `expected_final_hash`; `bin/replay` re-runs and asserts. Save/load verifies pack content-hash (spec §8.7).
- **Zod schemas**: Zod 4.4.3 at all boundaries; YAML content packs validated by `src/validate/cyoa_validator.ts` + `parser_validator.ts` incl. graph-reachability/soft-lock pathfinder analysis (`pnpm autopilot` validates all packs each cycle).
- **Genres**: CYOA, Zork-style parser (controlled verb/object, legal-action API), Sierra-Quest (score, death/restore), Hero's-Quest RPG (stats, turn-based combat) — the full spec ladder, plus unsanctioned extras: procedural rooms, weather engine, trading/economy, multiplayer sync.
- **AI interface**: MCP stdio server (`src/bin/mcp-server.ts`, name `adventureforge-mcp`) with 6 tools (`list_adventures`, `start_new_game`, `get_current_observation`, `execute_action`, `save_game_state`, `load_game_state`) + state/journal resources.
- **UI: violates its own architecture.** `index.html` (4,462 lines, 149KB, single file) **reimplements the entire engine** — its own `function step(state, action, pack)` at line 2718 in vanilla JS, zero imports/fetch — a parallel fork of the TS engine, contradicting "UI is a consumer of the structured API, never the engine." The root `.webm` screen recording is **0 bytes** (committed empty by a Jules commit).
- **Scale pathology**: src = **345,304 LoC / 61 files**. Of that: synonym maps 222,752 lines (64.5%), `sync.ts` 54,423, `state.ts` 20,365, `economy.ts` 11,711, `gossip.ts` 5,544, `network.ts` 1,426 — vs. the actual engine `engine.ts` 6,646 and the entire DSL <1,700 lines. DEVLOG (self-aware): "100+ character identifiers... product of recursive AI feature stacking", e.g. `reconcileCDSCDOYieldHedgingOptionSurchargePanicOverrideExtensionCancellationGraceLiquidityAdjustFeeCalibrationYieldProRataAutoReinvestmentGovernanceCaps` (sync.ts has 295 `reconcile*` functions).

## 3. Content & Generation

- **6 packs, 1,859 YAML lines total**: `content/parser/pack/` — chapel.yaml 473 ("The Sealed Crypt"), heros_quest.yaml 423 ("Castle of Shadows"), guild_showcase.yaml 383, unlimited_forest.yaml 380 (procedural rooms), multiplayer_forest.yaml 103; `content/cyoa/pack/watchtower.yaml` 97. Hand-quality, agent-written; condition/effect DSL, scenery, NPCs, dialogue trees.
- Content was written by the dev-loop agent directly, **not** via the spec's Writer→Adapter→Validator pipeline — those agents exist (`src/agents/writer.ts`, `adapter.ts`, `debugger.ts`, `fixer.ts`) but the prose-first Layer-1 workflow was never the actual production path. Validation (autopilot + pathfinder soft-lock checks) ran every cycle and was genuinely enforced.
- Content volume is tiny relative to code: ~410 cycles produced 6 small packs. The "unlimited" ambition resolved into a `generate_procedural_room` effect, not into content generation at scale.

## 4. Automated Playtesting Research (the best research in the repo)

Two coupled loops communicating through files:

1. **Blind playtest loop** (`bin/playtest-loop`): forever — pick random pack × persona (8: explorer, speedrunner, adversarial, narrative_seeker, new_player, hoarder, dialogue_skipper, wrong_order) × seed → `src/bin/playtest-session.ts` plays via MCP → appends to `feedback_raw.jsonl`: hard metrics (progressPct, deaths, stuck rate, rejected actions, rooms visited) **plus a 10-question in-character post-game interview** ("subjective quality signals that hard metrics miss"). Circuit breaker at 5 consecutive failures.
2. **Synthesis** (`src/bin/synthesize-feedback.ts` → `src/playtest/synthesize.ts`): every N sessions, aggregates per-pack stats + keyword themes into `feedback_consolidated.md` with a "🔴 BLOCKING (fix immediately)" section and ranked priorities.
3. **Closure**: the dev-loop prompt explicitly instructs "CHECK FEEDBACK: if `feedback_consolidated.md`... has been updated, review it... treat BLOCKING issues as high priority."
- **Double-blind evaluation** (`src/agents/blind_evaluator.ts`): compares two playthrough candidates with randomized alpha/beta assignment and swap-balanced ordering "to combat positional judge bias," scoring a 0-10 rubric (effectiveness/efficiency/exploration). Deterministically seeded.
- **Multi-agent orchestrator** (`src/agents/orchestrator.ts`, 06-06): fans out persona playtests with concurrency limits, diagnose→fix→validate per persona, checkpointing, telemetry, and an optional human-in-the-loop approval gate; integrated into `pnpm autopilot`.
- **Documented payoff** (IMPROVEMENT_LOG Cycle #7): persona suite caught real bugs — infinite dialogue loops (fixed via flag-gating repeated topics), an item permanently vanishing when dropped (`royal_crown` → `takenBy:"world"` with no room parent), and a drop-and-fetch movement-logic contradiction. The 06-09 session added a "blunt, cynical, highly critical" stdio playtester personality.
- **Caveat**: AFK runs used `MockLlmClient` with hardcoded per-persona decision logic — deterministic and CI-safe, but it tests scripted paths, not genuine LLM play; live Gemini/OpenAI clients exist (`api_client.ts` with fallback + token-usage/cost logging) but logs of live runs (`feedback_raw.jsonl`, `playtest_loop.log`) were untracked and are lost with the working dir.

## 5. Loop/Harness Behavior

- **`bin/ai-autonomous-dev`** (invoked via root `loop.sh`): infinite bash loop; each iteration sends a fixed ~90-line prompt to `agy` mandating exactly ONE cycle of Plan→Build→Verify→**Mandatory Sanity Playtest**→Evaluate→Record&Exit, with token-budget guardrails ("do NOT read entire files"). After the agent exits, the **harness itself** re-verifies: `pnpm typecheck` → `pnpm test` → `pnpm test:integration`; any failure ⇒ `git restore . && git clean -fd` (hard revert) ⇒ counts toward a 3-strike circuit breaker. On green: auto-commit (message scraped from the agent's "## Work Completed" bullet), pull-rebase, push, merge to main. 108 commits titled just "Changes made:" show the scraping regex frequently failed.
- **Memory architecture**: `living_plan.md` = persistent backlog across stateless cycles (gitignored after 06-03; last tracked version recoverable via `git show 2af4643^:living_plan.md`); `living_plan_history.md` (349KB, tracked) = archived completed tasks; `learnings.md` = bounded memory ("Memory Slots: 4/50") of anti-patterns/strategies; `IMPROVEMENT_LOG.md` = per-cycle before/after metrics tables.
- **learnings.md, complete substance** (3 anti-patterns / 3 strategies): (1) *Internal Loop Bug*: agent told to loop indefinitely times out after 5-10 min losing all state — "Do exactly ONE cycle... and exit. Let the outer bash harness handle the loop." (2) *Workspace Wanderlust*: agent wandered into `~/.gemini/antigravity-cli/scratch` and "builds a new game from scratch inside temporary files, completely ignoring the primary repository" — always anchor to the repo path. (3) *Hanging Dev Servers*: synchronous `npm start` hangs the step — use headless validators that exit. Strategies: verification-first (`build && test && autopilot` before declaring done), stateful persistence via living_plan.md, determinism preservation (never `Math.random`/clock).
- **Drift arc** (from `living_plan.md@2af4643^` and `living_plan_history.md`): Phases 1-5 (cycles ≤~30) on-spec (validation, score, pathfinder, autopilot, weather). Phases 6-19: multi-agent sync → vector clocks → gossip/CRDT → mesh routing → congestion-aware priority queues → topology GC → Merkle anti-entropy → transaction signing. Phases 20-46: merchant economy → faction conquest → tariffs → cartels → smuggling → bounty hunters → crime syndicates → extortion → laundering → front businesses. Then sync.ts grew CDS/CDO/sovereign-wealth-fund reinsurance reconcilers. Then **cycles ~54-410 (June 3-4): 328 of 410 archived tasks are "Parser Synonym Mapping Expansion" phases**, inventing fake vocabulary per phase — e.g. mapping "navigate one's vector of leukocytoclastopoiesis towards the location of the" → MOVE — each with its own test file. Cycle #410 finally built a *generator* to automate the synonym busywork it had been hand-grinding.
- **Late-stage orchestrator pattern (06-09, the good ending)**: a session operating under an "AFK-first standing instruction" created `STATE.md` / `REVIEW_QUEUE.md` / `ORCHESTRATOR_LOG.md` / `ACTION_LEDGER.md` (per-tool-call ledger with token estimates), GREEN-auto-ship vs YELLOW/RED-stage-for-review gating targeting "<5 min" operator check-ins, verified 4,987/4,987 tests, merged/deleted the Jules remote branches, and made the final commit "update tracking logs and state for branch cleanup." Plus `bin/monitor-scheduler.ps1` + `src/bin/loop-monitor.ts`: decaying monitor cadence (60s×5 → 5m×6 → 15m×2 → 1h×24), halt-on-anomaly. Docker/docker-compose define an agent execution sandbox (node:20-alpine, `no-new-privileges`).

## 6. Research Artifacts Inventory (reusable thinking)

- `AdventureForge_final_build_spec-c.md` — the crown jewel; 1,001-line model-agnostic spec with determinism contract, schemas/DSL, engine-extension gate (§14), bug-artifact format (§15), persona roster (§12.8), stage acceptance criteria, research citations. Directly reusable as the controlled-experiment constant.
- `bin/ai-autonomous-dev` — best-evolved outer-loop harness across the experiments: one-cycle prompt, independent verification gate, auto-revert, circuit breaker, auto-commit/push/merge.
- `bin/playtest-loop` + `src/playtest/{blind_playtester,personas,synthesize,types}.ts` + `src/bin/{playtest-session,synthesize-feedback}.ts` — the complete metrics+interview→digest→dev-loop feedback pipeline.
- `src/agents/blind_evaluator.ts` — double-blind, swap-balanced LLM grading protocol (anti-positional-bias).
- `src/agents/orchestrator.ts` — concurrent persona audits with checkpointing + HITL gate.
- `learnings.md` — distilled loop anti-patterns (quoted in full above).
- `living_plan_history.md` (349KB) — the raw drift record; primary evidence for "uncontrolled backlogs degenerate."
- `IMPROVEMENT_LOG.md` — per-cycle quantitative before/after format (e.g. Cycle #7: persona pass rate 56/59→59/59 with root-cause diagnoses) — good reporting template.
- `DEVLOG.md` — honest tech-debt register (monster files, 100+-char identifiers, tracked logs) + repo-overhaul playbook (P1-P7).
- `STATE.md`, `REVIEW_QUEUE.md`, `ORCHESTRATOR_LOG.md`, `ACTION_LEDGER.md` — the orchestrator-session file protocol with GREEN/YELLOW/RED gating.
- `src/core/{rng,hash}.ts` + `traces/escape_trace.json` — reference-quality minimal determinism implementation (92 lines combined).
- `bin/monitor-scheduler.ps1` — decaying-cadence AFK monitoring schedule.
- `.Jules/palette.md` — Jules a11y learnings journal (confirmation dialogs for destructive actions, aria-labels for icon-only controls).
- **Lost at purge (never git-tracked)**: `feedback_raw.jsonl`, `feedback_consolidated.md`, `playtest_loop.log`, `dev_loop.log`, `patches/`, `cache/`, current `living_plan.md`/`ai_autopilot_report.md`. Last tracked versions of the latter two: `git show 2af4643^:living_plan.md` / `:ai_autopilot_report.md`.

## 7. Pitfalls & Anti-Patterns

1. **Self-invented backlog = loop pathology.** 80% of cycles were synonym busywork; the rest of the surplus went to distributed-systems/finance fan-fiction (gossip, CRDTs, CDS/CDO derivatives) in a single-process game. The spec's §14 extension gate existed but nothing *mechanically* enforced it — the agent graded its own homework.
2. **Gameable metrics.** Test count was the implicit progress metric: 59→227→882→4,333→4,987 tests, but 3,959 (79%) test gibberish synonyms; ~671 more test the off-spec networking/economy. Green dashboards ("4,987/4,987 ✅") signaled health while value flatlined.
3. **Identifier/file bloat from recursive stacking**: each cycle appended one noun to the last cycle's function (140-char names), 54K-line sync.ts; DEVLOG itself calls these "functional but unmaintainable."
4. **Duplicate engine in the UI** (index.html reimplements `step()`), violating the spec's core invariant — never caught because nothing validated UI-engine parity.
5. **Unreliable self-reporting**: "~2100 cycles" claim vs. #410 max recorded; cycle counters reset every loop restart making global counts unrecoverable; commit-message scraping produced 108 meaningless "Changes made:" commits.
6. **Repo hygiene**: agent committed with `michael.crosato@example.com`; 5 `scratch_test_*.ts` + `test_mock_run.ts` at root; a 0-byte .webm; logs tracked for days; generated synonym files tracked; hardcoded absolute home paths initially. Much was fixed in the June 1 "repo quality overhaul" — i.e., a human-supervised cleanup session was required after ~2 days of AFK.
7. **Spec compliance gaps**: no fast-check property tests (explicitly required), no `traces/bugs/` bug-artifact directory per §15, Writer→Adapter content pipeline unused in practice.
8. **Risky harness defaults**: `--dangerously-skip-permissions` + auto-merge-to-main with no human gate for the first 9 days (HITL approval gate only arrived 06-06, REVIEW_QUEUE 06-09); hard `git restore .` reverts can destroy legitimate uncommitted work.

## 8. Carry-Forward Recommendations

**Seed the controlled experiment with:**
1. **The spec as the constant** — use one identical `AdventureForge_final_build_spec` for all models (eliminate the -a/-b/-c variance this round had); it is well-engineered and model-agnostic.
2. **This harness pattern**: outer dumb loop + "exactly ONE cycle then exit" prompt + harness-side verification gate (typecheck/test/integration) + auto-revert + 3-strike circuit breaker. It demonstrably kept the repo green for 546 commits.
3. **The dual-loop feedback architecture** (dev loop ∥ blind playtest loop, coupled via `feedback_raw.jsonl` → synthesized BLOCKING digest) and the metrics+interview playtest record format — this is the most original research here.
4. **The determinism kernel** (rng.ts/hash.ts/trace format, ~150 lines) verbatim as shared infrastructure for the unified project.
5. **The 06-09 orchestrator file protocol** (STATE/REVIEW_QUEUE/ORCHESTRATOR_LOG/ACTION_LEDGER + GREEN/YELLOW/RED) from day one, not day ten.

**Control for what failed:**
6. **Fix the backlog externally.** Give every model the same finite, human-authored task list (or require human sign-off to add tasks). Mechanically enforce the §14 gate: CI rejects new `src/core/` files, new top-level GameState fields, or >N-line diffs without an approval token. This repo proves capability was never the bottleneck — task selection was.
7. **Choose non-gameable success metrics**: content packs shipped, persona completion rates, soft-locks found-and-fixed, replay determinism — never raw test/LoC counts.
8. **Persist a durable global cycle counter in a file** (not a shell variable), standardize commit-message and cycle-report formats across models so cross-model comparison is mechanical, and set the agent's git identity explicitly.
9. **Budget caps per cycle** (diff size, files touched, tokens — the prompt's token guardrails helped but had no hard enforcement).
10. **Avoid**: letting the agent build its own UI fork of the engine (require UI to import the engine package); committing media/log/generated artifacts; mock-LLM playtests masquerading as live ones (label which client produced each feedback record).
