# AdventureForge — implementation roadmap (local plan-ultra)

Produced by a 7-agent local planning workflow (6 grounded investigators + 1
adversarial critic that re-read the source to verify every claim). This is the
*corrected* plan — the critic found six verified blocking defects in the first
draft; their fixes are baked into the sequencing and acceptance criteria below.

Guiding invariants (non-negotiable, from the spec): determinism §8.5 · content is
data never code §16 · new engine verbs only via the §14 gate · every fix gets a
regression test + bug artifact §15 · tests run on the mock provider, no keys.

---

## ⚠️ Critic's blocking findings (fix these or the plan breaks)

1. **The `rpg` mode discriminator does not exist yet.** `src/rpg/observation.ts`
   spreads `buildParserObservation` (which hardcodes `mode:'parser'`) and never
   overrides it; `RpgObservation` has no `mode` field. So an RPG observation is
   *indistinguishable from parser* at runtime and in the type system. Every
   multi-mode dispatch decision depends on this. **This ~3-line fix is the
   highest-leverage first item and blocks everything else in Phase 1a.**
2. **`detectMode` must key off property *presence*, not a non-empty array.** An RPG
   pack is a parser pack + `enemies`, and `enemies` defaults to `[]`. Detect via
   `'enemies' in pack`, else `'rooms' in pack` → parser, else cyoa — otherwise an
   `enemies: []` RPG pack silently runs as parser.
3. **The autonomous loop's §14 gate is *already leaky*.** `loop.sh:57` git-adds
   whole dirs including `src/`, `bin/`, `scripts/`, `tests/`, and the deleted
   `AFKGOAL.md`. The loop can already commit engine code. Phase 2 must **first**
   replace that broad git-add with a file-level content/test whitelist.
4. **Phase-3 content edits change content hashes** — "replays to its hash
   unchanged" is impossible for a content edit. Editing `watchtower_road.yaml`
   invalidates the pinned `content_hash` in `traces/bugs/bug_0002_*` (`4188f7de…`)
   and the assertions in `tests/regression/watchtower_blind_fixes.test.ts` and
   `tests/unit/rpg_validator.test.ts`. Every Phase-3 content item must **recompute
   and re-pin** these, not assert stability.
5. **The fixer/`apply_content_patch` only support `cyoa|parser`** (`agents/fixer.ts`
   enum, `server.ts` schema). Routing RPG findings through auto-fix would corrupt
   content (it would `loadParserPackFile` an RPG pack, dropping `enemies`). Phase 2
   must **exclude RPG packs from the auto-fix path** until the fixer is extended.
6. **`content/cyoa/pack/clockwork_heist.yaml` was omitted** from the hash-pinning
   set. "Pin ALL pack hashes" must include it (and any future pack).

Also corrected: `list_stories` is CYOA-only (scans only `content/cyoa/pack`, hardcodes
watchtower) — multi-mode discovery is a Phase-1a item, and Phase 2 depends on it.
`summarizePlaytest` is deeply CYOA-coupled (reads `scenes`/`endings`/`is_ending`/
`next`) → generalizing it is **L**, not M. ESLint/Prettier intro is **L** (lint is
currently just `tsc`). save/load mode change must also update the `save_game`/
`load_game` call sites in `tools.ts`.

---

## Corrected critical path (the spine)

```
1a-0  fix RpgObservation mode:'rpg'         ← BLOCKING, do first (~3 lines)
  └─ 1a-1 types + detectMode(by key)
       └─ 1a-6 observation union
            └─ 1a-2 Session<I,O> generic
                 └─ 1a-3 tool dispatch (+ multi-mode list_stories)
                      └─ 1a-4 playtest mode-aware (L: coverage/ending rewrite)
                           └─ 1a-9 CYOA byte-identical verification
2-safe  loop.sh git-add → file-level whitelist   ← prerequisite safety fix
  └─ 2a generalize discovery/rotation + mode-aware evidence  (needs 1a-3,1a-4)
       └─ 2b blind-subagent handoff
            └─ 2c auto-fix (cyoa|parser ONLY) → patch → re-validate → regression
                 └─ 2d safe commit + hash-pin-drift guard
```

UI (Milestone 5) and most cross-cutting items are independent and can run anytime.

---

## Milestones (sequenced, with the corrections applied)

### Milestone 1 — Multi-mode foundation (Phase 1a) · keystone
Unblocks the autonomous loop *and* the benchmark to operate on parser/RPG, not
just CYOA. Order: **1a-0 → 1a-1 → 1a-6 → 1a-2 → 1a-3(+list_stories) → 1a-4 → 1a-5
→ 1a-7 → 1a-8/1a-9.**
- `1a-0` **(S, blocking)** make `RpgObservation` carry `mode:'rpg'` (override in
  `rpg/observation.ts` + redeclare field in the type).
- `1a-1` **(S)** `src/mcp/types.ts`: `PackMode`, `Index`/`Observation` unions,
  `detectMode` (by key presence, finding #2).
- `1a-6` **(S)** Observation union; one normalized API response shape.
- `1a-2` **(M)** `Session<I,O>` generic in `sessions.ts` (no store API break).
- `1a-3` **(M)** dispatch layer in `tools.ts` (`loadAndCompilePack` /
  `validatePackByMode` / `startSessionByMode` / `buildObservationByMode`) **+
  multi-mode `list_stories`** scanning all three pack dirs.
- `1a-4` **(L, was M)** mode-aware `run_playtest`: generalize visited-tracking
  (rooms vs scenes), ending detection, and coverage heuristics; enumerate legal
  actions for parser/RPG instead of always `CHOOSE`.
- `1a-5` **(M)** persist pack mode in saves + verify on load; **update the
  `save_game`/`load_game` handlers** (the `save()` call sites) too.
- `1a-7` **(S)** server tool schemas accept any pack mode.
- `1a-8` **(L)** parser + RPG MCP integration tests; `1a-9` **(M)** assert CYOA
  state hashes are byte-identical to the current baseline.
**Acceptance:** an external agent plays a CYOA, parser, and RPG pack end-to-end
over MCP; all existing CYOA tests + hashes unchanged.

### Milestone 2 — Authoring + trace depth (Phases 1b, 1c) · parallel with M1 tail
- **1b (adapter→parser/RPG):** thread a `target_mode` through writer/adapter;
  deterministic canned parser/RPG packs in `MockAuthorProvider` (with a
  self-correcting first-attempt defect, mirroring CYOA); `bin/author --mode`;
  iterate against the right validator. CYOA authoring unchanged.
- **1c (Trace v2):** additive optional `per_step_hashes`; populate
  `replay.divergedAtStep`; surface first divergent step in `inspect_trace` and
  `bin/replay`. **Backward-compatible with committed v1 traces** (regression test).

### Milestone 3 — Autonomous content engine (Phase 2) · depends on M1
- **2-safe (do first):** replace `loop.sh`'s broad dir git-add with a file-level
  content/test whitelist; stop staging `src/`, `bin/`, `scripts/`, `AFKGOAL.md`
  (finding #3).
- **2a:** generalize pack discovery/rotation across modes; mode-aware evidence
  (depends `1a-3`,`1a-4`); fix `ai-loop.ts`'s hardcoded CYOA `Observation` type.
- **2b:** blind-playtest handoff — the loop *emits* the locked-down prompt for an
  operating agent to spawn the no-context subagent (the loop can't call the Agent
  tool itself); parse the structured report.
- **2c:** auto-fix **for cyoa|parser only** (finding #5) → `ContentPatchProposal`
  → `apply_content_patch` → re-validate → regression test + bug artifact.
- **2d:** safe commit with **hash-pin-drift detection** (a content patch that
  changes a pinned hash must regen pins or be refused); budget caps;
  no-silent-truncation logging; one PR per cycle; engine/schema stay human-gated.

### Milestone 4 — Content, mechanics, gate (Phase 3)
- **3a (watchtower 5 findings):** the logged narrative items (reveal-evidence
  payoff, letter/ledger clarity, drop the dangling "broken seal" — **1 occurrence,
  not 2**, finding in critique, hermit hook, stale re-entry options). **Each must
  recompute + re-pin** `bug_0002`, `watchtower_blind_fixes.test.ts`, and the
  `rpg_validator.test.ts` snapshot (finding #4).
- **3b (richer RPG, §14-gated):** consumables (**a real core change** — new
  `consume_item` effect + `has_consumed` condition, full gate bundle *including a
  backward-compat replay over ALL committed traces*), multi-enemy rooms,
  XP/leveling, multi-room quest stages. Randomness through the seeded PRNG.
- **3c:** a 2nd RPG pack + a larger Sierra-Quest pack.
- **3d (gate-as-CI):** pin **every** shipped pack hash — **including
  clockwork_heist** (finding #6) — in CI; assert any new effect/condition/action
  ships the §14 six-item bundle.

### Milestone 5 — Benchmark, UI, DevEx (Phases 4, 5, cross-cutting) · mostly independent
- **4 benchmark:** objective scorecard from `run_playtest` (depends `1a-4` for
  multi-mode metrics) + optional LLM-as-judge subjective scoring (RPGBench split,
  §2); generate a fresh pack → N personas play via MCP → score. Optional
  Jericho/TALES adapter.
- **5 UI:** browser save/load → trace replay viewer (depends 1c) → validation
  panel → in-browser `adapt_story` playground → scene/map renderer over identical
  structured state.
- **Cross-cutting:** ESLint + Prettier **(L)** without breaking the `lint`/`health`
  typecheck gate; coverage in CI; CONTRIBUTING/LICENSE; **§16 MCP hardening**
  (sandbox, path-confinement fuzzing) — required before any networked deployment.

---

## Recommendation
Execute **Milestone 1**, starting with the blocking `1a-0` discriminator fix, then
the dispatch chain. It's the keystone, it's a contained refactor of code that
already exists in all three modes, and it has direct unit tests + a byte-identical
CYOA guard. Milestones 2 and 5-cross-cutting can run in parallel once M1's tail
lands.
