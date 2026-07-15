# AdventureForge Roadmap

This roadmap is current operational guidance. Historical multi-mode plans live in
`docs/archive/` (the convention for superseded planning docs) and git history,
not in the active roadmap.

AdventureForge is converging on one product: a deterministic, text-based,
open-world RPG engine whose shipped content is placed through a contiguous world
graph.

## North Star

- One runtime mode: `rpg`.
- One world AND quest registry: the New York overworld (`list_overworld`); every
  shipped quest is anchored to a town and discovered from its local notice board.
- One shipped-content source key: `world_quest_id`.
- One shipped quest start path: from the overworld via `start_overworld_session_quest`.
- One autonomous loop: inspect, change one aligned surface, verify, commit.
- One world model: a single seamless open world (like Skyrim/Cyberpunk) where every
  quest is reached in-world — no second world or game mode.

## Current Anchors

- `AGENTS.md` is the trust-but-verify charter.
- `ADVENTUREFORGE_BUILD_SPEC.md` is the standing architecture contract.
- `docs/VISION.md` is the why; `docs/DECISION_LOG.md` is the append-only memory
  of settled questions.
- `content/world/new_york_overworld.json` is the single world: the large contiguous
  overworld data source AND the shipped RPG quest registry (each quest maps a
  `world_quest_id` to its `content/rpg/quests/*.yaml` source).
- `src/world/session.ts` is the primary stateful overworld runtime.
- `src/mcp/tools.ts` is the tested ToolApi source of truth.
- `src/validate/rpg_foundation_validator.ts` carries high-depth RPG foundation
  checks.
- `docs/STARTING_SLICE.md` is the active durable product milestone and
  `docs/starting_slice_causal_matrix.json` is its machine-readable proof ledger.
- `docs/CURRENT_PLAN.md` is the rolling plan (overwritten each ultraplan; the
  implementation subagent's sole hand-off), while `AI_LOOP_STATE.md` is the
  rotating per-cycle result log (machine-parsed). Superseded planning docs move
  to `docs/archive/`; detail not worth keeping goes to git history.

## Priority Order

1. Engine stability: harden reducer invariants, event lifecycle state, restore
   validation, and trace replay.
2. Gameplay depth: mature combat formulas, stat tables, scaling progression,
   environmental flags, quest stages, and stateful NPC/event consequences.
3. Token efficiency: keep MCP/ToolApi payloads compact by default; add hash-only
   reads, stale-write guards, capped arrays, and id-first layouts.
4. Open-world consolidation: flatten package-era shortcuts into world graph
   identity and move toward coordinate or matrix navigation where it improves
   play.
5. Content expansion: add or polish quest content only after the relevant engine,
   gameplay, and token surfaces are mature enough to support it.

## Near-Term Work Queue

(Refreshed 2026-07-12. Landed since the 2026-07-07 refresh: the three-tier
**testing pyramid** — mechanical crawler, blind fleet + mock, feedback compiler
(`docs/testing_pyramid.md`, PR #79); the `tide_mill` quest, bringing the shipped
registry to 12 (PR #80); the versioned **journey contract** (v1 → v3) with
pure-blind retention cohorts feeding `docs/BLIND_FEEDBACK_LEDGER.md`; and the
**Goal Passage** — the current objective's road as one interruptible,
game-native travel decision shared by UI and MCP. The earlier one-off 50-run
soak measurements are superseded by the continuous pure-blind fleet and the
compiled feedback ledger.)

The active product milestone is now the bounded Albany → Wolf-Winter → truthful
Albany-return starting slice. New towns and unrelated quest ports are frozen
until its contract in `docs/STARTING_SLICE.md` is proven.

- **Keep the pure-blind cohorts flowing**: fresh fleet seeds per cycle, with
  the feedback compiler's three-report threshold deciding when a new hotspot
  is actionable; vary start town / seed so the other 11 quests beyond
  `wolf_winter` stay exercised before drawing content-quality conclusions.
- Build the starting slice's reusable campaign-character and data-driven
  consequence boundary before adding more Wolf-specific branches.
- Replace the visible Albany slice's generic discovery/jobs/events with authored
  scenes only after that persistent state can be consumed across phases.
- Deepen Wolf-Winter into combat, fully noncombat, and hybrid resolution
  families with deterministic counterfactual and failure-forward proofs.
- Tighten the remaining restore-time sequencing proofs beyond discovery prefixes.
- Extend token/cost telemetry to the loop's agent work turns (blind-run
  telemetry landed 2026-07-06: `blind-tester/telemetry.mjs` records every run
  to the ignored `ai-runs/blind-telemetry.jsonl`; `npm run blind:telemetry`
  summarizes) so the whole cycle's efficiency is measured, not guessed.
- Shrink low-level debug helpers that still leak raw pack paths in diagnostics.
- Keep active docs short and current; move superseded planning docs to
  `docs/archive/`.

## Verification

Every cycle that changes source, docs, tests, content, schemas, or tooling must
finish with `npm run health` — the bar already chains `npm run validate` and
`npm test` (plus integrity, typecheck, lint, format, and UI typecheck), so do not
re-run them on top of it.

Focused tests should run first when a change has a clear local guard. Do not
weaken validators, protected assets, or `scripts/verify-integrity.ts` to make a
change pass.

## Completion Checks

The consolidation-era checks were all met as of 2026-07-06 and are now standing
invariants (regressions are bugs): world-graph identity everywhere (raw package
paths rejected at every public boundary), no active docs or prompts directing
work at retired variants, restore paths rejecting malformed/forged/stale/
cross-source snapshots, compact loop surfaces bounded enough for long blind
sessions, and a green bar (`npm run validate` and `npm test` via health).

The roadmap's open horizon is Priority 2 (gameplay depth) and Priority 5
(content expansion through story ports) — the Near-Term Work Queue above is the
live frontier.
