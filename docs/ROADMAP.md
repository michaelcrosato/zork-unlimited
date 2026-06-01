# AdventureForge — implementation roadmap (local plan-ultra)

Guiding invariants (non-negotiable, from the spec): determinism §8.5 · content is
data never code §16 · new engine verbs only via the §14 gate · every fix gets a
regression test + bug artifact §15 · tests run on the mock provider, no keys.

---

# Roadmap v2 — post-Milestone-1 (current)

Milestone 1 (multi-mode MCP) is **done and on `main`**. This v2 plan was produced
by a second 7-agent local workflow that *verified the post-M1 code* first; the
adversarial critic then caught a false core assumption and a silent determinism
hole. Corrections are baked in below. (The original pre-M1 plan is preserved
verbatim further down for provenance.)

## ✅ Confirmed done by Milestone 1 — do NOT redo
Multi-mode MCP dispatch (`indexFor/rulesFor/initStateFor/buildObsFor`), `list_stories`
across all three pack dirs, mode-aware `run_playtest` (parser/RPG walk the room
graph), `Session` carrying `mode`+`AnyIndex`, `RpgObservation.mode:'rpg'`, mode-bound
save/load. Also already present from Stage 4: `quest_stage` condition +
`set_quest_stage` effect. And `runActions()` already returns per-step `hashes[]`
and `ReplayResult.divergedAtStep` is already a reserved field — so Trace v2 (1c) is
mostly *persisting* what already exists.

## ⚠️ v2 blocking corrections (the critic's verified findings)
1. **SAFE-0 must be a single canonical item, merged first.** The loop.sh §14
   git-add leak was triplicated across 2b/M3/4b with *conflicting* whitelists. Make
   it ONE item that whitelists only `content/**/pack/*.yaml`, `tests/regression/*`,
   `tests/unit/*hashes*`, `traces/bugs/*`, `AI_LOOP_STATE.md` — and **excludes
   `src/`, `bin/`, `scripts/`, `loop.sh` itself, and the deleted `AFKGOAL.md`**, and
   refuses to commit if any `src/` file changed. **Every** autonomous-editing item
   (2a-4, 2b-4, M3a, M3b-fixer-rpg, 4b-2) depends on SAFE-0. It's the highest-leverage
   next item (effort S) and the biggest open hole now that M1 is merged.
2. **The CYOA route is NOT reusable on parser/RPG (false assumption).** Parser/RPG
   `available_actions` ids are enumerated verb-object ids (`go_north`, `take_rope`),
   not the watchtower `TRUE_ROUTE` choice ids. `playRoute` would throw on every
   parser/RPG pack. Correct scope: a **per-pack route registry** + **exits-driven
   exploration** for parser/RPG. Action *selection* is by `.id` for all modes (the
   `.text` vs `.command` split only matters for human-readable heuristics). This
   makes the loop-generalize item **L, not M**.
3. **Re-pin the RIGHT file.** The live watchtower content-hash pin is in
   `tests/unit/rpg_validator.test.ts` (line ~58), **not** `watchtower_blind_fixes.test.ts`
   (which asserts determinism, not a pinned content hash). Any content edit (M3a)
   must re-pin `rpg_validator.test.ts` **and** `traces/bugs/bug_0002_*.yaml` — missing
   this is a silent determinism-regression hole.
4. **Hash-pin drift = refuse-and-surface, never loop auto-repin.** A loop that
   auto-rewrites a regression test's expected hash and commits can launder a behavior
   change into a "fix" (§14/§15 hazard). The loop must **refuse and surface** drift
   for human re-pin. (Drops 2b-5 from M to S.)
5. **Extending the fixer to RPG must also touch `src/mcp/server.ts`** (its
   `apply_content_patch` schema mirrors the fixer's `cyoa|parser` enum) and ride the
   §14 gate. Until then, RPG packs are **playtested but never auto-fixed**.
6. Don't regenerate committed v1 traces when Trace v2 lands (the "committed trace
   replays forever" invariant, §8.5); migrate legacy `ai-runs` evidence to `mode:'cyoa'`.
   Fix Milestone-5 file paths (the agent emitted a `zork-undefined` templating typo).

## Critical path (corrected, ordered)
```
SAFE-0  loop.sh §14 whitelist (excl src/bin/scripts/loop.sh/AFKGOAL.md, refuse on src change)  ← FIRST, gates all auto-editing
  └─ M3-hashpin   pin all 5 pack hashes in ONE place + fix the real pin (rpg_validator.test.ts)
       └─ M3-ci   CI asserts pinned hashes (drift fails loudly)
2a-1  ai-loop.ts → AnyObservation union           (unblocks non-CYOA play)
  └─ 2a-2/2a-3 (L)  per-pack routes + exits-driven exploration; select by .id
       └─ 2a-4  pack discovery + deterministic rotation
            └─ 2b-2  blind-playtest handoff (emit locked prompt, parse report)
                 └─ 2b-3  gate RPG out of apply_content_patch (fixer + server.ts)
                      └─ 2b-4  auto-apply patch → re-validate → bug artifact + regression (cyoa|parser)
                           └─ 2b-5  hash-drift = refuse-and-surface (NOT auto-repin)
M3a  fix 5 watchtower findings + re-pin rpg_validator.test.ts + bug_0002      (after SAFE-0+hashpin)
```
Independent / parallel after SAFE-0: **1c (Trace v2)** → M5 replay viewer; **1b
adapter→parser/RPG** → M3 fresh content + M4 fresh-pack benchmark; cross-cutting
(ESLint/Prettier **must** depend on SAFE-0; coverage; §16 path-fuzz; CONTRIBUTING/LICENSE).

## Milestones (refreshed)
- **M2 — autonomous content engine** *(next; needs SAFE-0 first)*: generalize
  `ai-loop.ts` to rotate packs across modes (per-pack routes + exits exploration),
  emit the blind-playtest handoff, auto-fix cyoa|parser via `apply_content_patch`
  with refuse-and-surface drift handling, one-PR-per-cycle, budget caps.
- **M3 — content/mechanics/gate**: 5 watchtower findings (re-pin correctly);
  consumables via §14 (new `consume_item` effect + `has_consumed` condition, full
  gate bundle incl backward-compat replay over ALL committed traces) — *decoupled
  from the narrative fixes*; multi-enemy/XP/quest-stage RPG depth; 2nd RPG pack;
  larger Sierra pack; **1b adapter→parser/RPG**; gate-as-CI pinning *every* pack
  incl `clockwork_heist`.
- **M4 — benchmark**: objective scorecard from mode-tagged `run_playtest` +
  persona/blind reports; optional LLM-judge (cost-gated, offline by default);
  fresh-pack flow depends on 1b. Optional Jericho/TALES adapter.
- **M5 — UI + Trace v2**: 1c first (additive `per_step_hashes`, populate
  `divergedAtStep`, backward-compatible with committed traces) → browser save/load,
  trace replay viewer (needs 1c), validation panel, `adapt_story` playground, then
  a scene/map renderer over identical structured state.
- **Cross-cutting**: ESLint+Prettier (L; **after SAFE-0**), coverage in CI,
  CONTRIBUTING/LICENSE/SECURITY, §16 MCP hardening (sandbox + path-confinement fuzz
  of `src/mcp/paths.ts`) — required before any networked deployment.

## Recommendation
**Do SAFE-0 next** — one small, high-leverage commit that closes the §14 leak and
unblocks the entire autonomous-content-fix loop safely. Then `M3-hashpin`/`M3-ci`
to establish drift detection, then the `2a → 2b` chain for Milestone 2.

---

# Roadmap v1 — pre-Milestone-1 (preserved for provenance)

Produced by the first 7-agent workflow. Milestone 1 (Phase 1a) below is now done;
the rest still applies as refined by v2 above.

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
