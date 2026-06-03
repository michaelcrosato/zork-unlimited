# Current plan (rolling)

This is the AFK loop's **living plan** — the hand-off document for the
saturation-triggered ultraplan (see [`docs/afk_loop.md`](./afk_loop.md)). When the
deterministic assessor runs dry (`isSaturated`), an ultraplan cycle re-aims the
project, **overwrites this file** with the synthesis + the single chosen next move,
and a fresh implementation subagent reads _only_ this file (plus the files it names)
to do the work.

---

## Synthesis — re-aim cycle #5 (2026-06-03)

The deterministic content assessor is SATURATED (every structural lever disarmed; blind
passes return the flat 0.5 floor — `SATURATION_FLOOR=0.5`, src/afk/assessor.ts:485), and
the loop has drifted into content/pack churn (bug_0185–0189 were hand packs + two small
engine fixes). This is a re-aim: pick the single highest-value STRUCTURAL move that is
key-free / offline / deterministic, additive/strengthening only, never weakens a check.

Six structured reviews were synthesized (4 repo reviewers + 2 web researchers). Three
reviewers converged on the scorecard freshness-pin (deferred #1); ONE reviewer surfaced a
genuinely-open hole that is NOT on any deferred list and beats #1 on every decision
criterion: **the trace-load boundary feeds an untrusted on-disk GameState into the engine
with NO finiteness / structural / referential gate** — the exact mirror of the SAVE hole
the bug_0181–0184 arc closed. It is chosen because it (1) closes a verified-open structural
hole, (2) REUSES two already-proven gates (smallest blast radius), (3) has the cleanest
known-bad-by-construction REJECTION oracle (the SoundnessBench lesson the repo cites and the
briefing names as the tiebreaker), and (4) needs NO verifier-file edit and NO corpus re-seal.

## Where the project stands (verified this cycle)

- HEAD is `1669e9f` (bug_0189). 13 packs (6 CYOA / 3 parser / 4 RPG), ~1379 tests, `npm run
  health` green, `verify:integrity` green.
- **SAVE boundary is HARDENED (do not redo):**
  - Finiteness/structural gate = `GameStateSchema` (private) + the `load()` guard at
    src/persist/save_load.ts:42-63 and :121-130 (bug_0181). It `safeParse`s WITHOUT
    substituting `parsedState.data`, so a valid state's bytes/hash stay byte-identical
    (save_load.ts:123-130). `vars: z.record(z.number().finite())` (line 53) is the
    load-bearing Infinity/NaN gate that otherwise flows into `conditions.ts:75 var_gte`.
  - Pack-aware referential gate = `assertLoadedStateRefs(mode, index, state)` at
    src/mcp/tools.ts:165-192, covering `current` (179-183), `endingId` (184-186), and
    `inventory` (187-191), folding CYOA `terminalIds` into the valid-location set
    (tools.ts:171) and the provably-complete item set (collectAddItemTargets, tools.ts:153-163
    + declared objects, tools.ts:177). It is wired ONLY into `startSession` for a PROVIDED
    (loaded) state (tools.ts:326), never the trace path.
  - Save rejection oracle exists: tests/regression/save_integrity_adversarial.test.ts (forge
    one field → `load()` throws `SaveIntegrityError`, plus GREEN round-trip guards) and
    tests/regression/save_load_referential_integrity.test.ts:98-167 (GREEN false-rejection
    guards: clean mid-game CYOA save, parser save holding a TAKEN item, ended CYOA save with
    `current` = terminal id). Both green now.
- **TRACE boundary is OPEN (the hole this cycle closes):**
  - `replay_trace` (src/mcp/tools.ts:955-971) and `inspect_trace` (tools.ts:973-1019) each
    `JSON.parse(readFileSync(traceAbs))` an UNTRUSTED trace file (tools.ts:957, :980) and feed
    `trace.initial_state` RAW into the engine: replay_trace → `replayTrace` → src/trace/
    replay.ts:45 `runActions(rules, trace.initial_state, ...)`; inspect_trace runs its OWN
    per-step loop from `let state = trace.initial_state` (tools.ts:990) AND calls
    `diagnose(rules, trace.initial_state, ...)` (tools.ts:1012).
  - There is NO TraceSchema / Zod anywhere: `Trace` is a bare TS type with
    `initial_state: GameState` (src/trace/record.ts:15-31, field at :20). The content-hash
    check at tools.ts:959 and :982 guards WHICH pack the trace was recorded against — NOT
    whether the state is well-formed — so a forged trace with the CORRECT `content_hash` and a
    poisoned `initial_state` passes. The same three sub-holes the save arc named are reachable:
    (a) finiteness (`1e999` → Infinity → always-true `var_gte`); (b) structural (no `.strict()`,
    unknown/wrong-typed fields reach the engine); (c) referential (a phantom `current` renders
    the game from a nonexistent room — the bug_0183 hole).
- **Already shipped — do NOT re-attempt (deferred list is stale on these):**
  - Negative-corpus rejection oracle for `validateRpg` = tests/regression/
    rpg_validator_negative_corpus.test.ts (bug_0182, verified on disk; 6 single-defect
    rejection witnesses).
  - The recording recipe to forge a trace already exists in tests/regression/
    inspect_trace_divergence.test.ts:23-60: `recordTrace(rules, initStateForPack(index, 1),
    ACTIONS, {...})` over the CYOA pack `content/cyoa/pack/watchtower_road.yaml` with
    `ACTIONS = ["go_west","ford_brook","cross_north","slip_into_woods","slip_away"]` mapped to
    `{type:"CHOOSE", choiceId}`. Reuse this exact recipe.
- The two call sites already have everything in scope: inside `createToolApi` (tools.ts:228),
  `assertLoadedStateRefs` (tools.ts:165), `indexFor` (tools.ts:86), and `requirePlayable`
  (tools.ts:259, returns `{mode, compiled}`) are all module-local. Only the well-formedness
  helper must be lifted out of save_load.ts (today `GameStateSchema` is private).

## Chosen move: Trace-load integrity gate (REUSE the two shipped save gates)

### CRITICAL direction (what NOT to get wrong)

1. **Gate ONLY at the two untrusted-FILE read sites** (replay_trace tools.ts:957 and
   inspect_trace tools.ts:980), AFTER the content-hash check passes and AFTER `requirePlayable`
   has compiled the pack (so the index exists). Do NOT put the gate inside `replayTrace` /
   `runActions` / `diagnose` — those legitimately replay TRUSTED in-memory freshly-recorded
   traces (src/trace/record.ts callers, tests/acceptance/*, the GREEN guard below). Putting it
   there would break trusted callers and is out of scope.
2. **REUSE, do not reinvent.** The well-formedness check must be the SAME `safeParse`-without-
   substitution path `load()` already uses (save_load.ts:125-130), so a clean recorded trace's
   `initial_state` passes byte-identically. The referential check must be the EXISTING
   `assertLoadedStateRefs` (tools.ts:165) — already pack-aware, already proven non-false-
   rejecting on saves. Order: well-formed FIRST (cheap, structural), then referential (needs
   the index).
3. **Lifting `GameStateSchema` must not change `load()`'s behavior.** Export a thin
   `assertWellFormedState(state): GameState` from save_load.ts that runs the SAME
   `GameStateSchema.safeParse` and throws `SaveIntegrityError` on failure; have `load()` keep
   calling its own existing inline check unchanged (or route it through the new helper without
   altering the no-substitution semantics). A valid save's bytes/hash must stay identical, so
   the existing save tests stay green untouched.
4. **No floor / matcher / guard touched. No `generator_version` bump. No corpus re-seal.** This
   move needs none of those — it is purely two call-site additions + one exported helper + one
   test + one bug yaml.
5. **A trace's `initial_state` is normally a FRESH init state** (current = start room, empty
   inventory), so the referential gate is trivially satisfied for clean traces — that is exactly
   why the GREEN guard (a clean recorded trace still replays/inspects) must pass.

### What — numbered concrete steps

1. **Read first** (READ-ONLY):
   - src/persist/save_load.ts:13-132 (the schema, `SaveIntegrityError`, the `load()` guard at
     :121-130 — the exact `safeParse`-without-substitution pattern to mirror).
   - src/mcp/tools.ts:153-192 (collectAddItemTargets + `assertLoadedStateRefs`), :228-265
     (`createToolApi` open, `requirePlayable`), :314-326 (the `startSession` call to
     `assertLoadedStateRefs`), :955-1019 (both trace handlers).
   - src/trace/record.ts:15-31 (`Trace` type) and src/trace/replay.ts:44-45 (how
     `initial_state` flows into `runActions`).
   - tests/regression/inspect_trace_divergence.test.ts:1-60 (the recordTrace recipe to reuse)
     and tests/regression/save_integrity_adversarial.test.ts:1-40 + save_load_referential_
     integrity.test.ts:98-167 (the forge + GREEN-guard patterns to mirror).

2. **EDIT src/persist/save_load.ts** — lift the private schema into a tiny exported helper.
   After the `GameStateSchema` definition (line 63), add:
   ```ts
   /**
    * Assert a (possibly untrusted) GameState is well-formed + FINITE per §16
    * "integrity at load". REUSED at every untrusted-state-from-disk boundary: the
    * save load() guard below AND the trace-load gate in src/mcp/tools.ts
    * (replay_trace/inspect_trace). Same safeParse-without-substitution path as
    * load() — a valid state's bytes/hash stay identical. Throws (never coerces).
    */
   export function assertWellFormedState(state: unknown): GameState {
     const parsed = GameStateSchema.safeParse(state);
     if (!parsed.success) {
       throw new SaveIntegrityError(
         `State is malformed or non-finite: ${parsed.error.message}`,
       );
     }
     return state as GameState;
   }
   ```
   Leave `load()` UNCHANGED (its inline check at :125-130 still works) — do not risk altering
   the no-substitution semantics the byte-identity guarantee depends on. (Optionally, `load()`
   MAY call `assertWellFormedState((bundle as {state?:unknown}).state)` in place of its inline
   block — only if the existing save tests stay green; if in any doubt, leave `load()` as-is.)

3. **EDIT src/mcp/tools.ts** — wire the gate into BOTH trace handlers, at the FILE boundary only.
   - Import `assertWellFormedState` from `../persist/save_load.js` (a `SaveIntegrityError`
     import path likely already exists; add the helper to it).
   - In `replay_trace`, after the content-hash check passes (after tools.ts:964) and before
     `const rules = rulesFor(...)` (tools.ts:965):
     ```ts
     assertWellFormedState(trace.initial_state);
     assertLoadedStateRefs(mode, indexFor(mode, compiled.pack), trace.initial_state as GameState);
     ```
   - In `inspect_trace`, after its content-hash check passes (after tools.ts:986) and before
     `const rules = rulesFor(...)` (tools.ts:988), add the SAME two lines. (`mode` and
     `compiled` are already in scope from `requirePlayable` at tools.ts:981.)
   - Both handlers already compute `indexFor(mode, compiled.pack)` for `rulesFor` immediately
     after; reuse one `const index = indexFor(...)` if cleaner, but do not change the existing
     `rulesFor` call's behavior.

4. **NEW test: tests/regression/trace_load_integrity.test.ts** — the SoundnessBench-style
   rejection-direction oracle for the trace boundary, mirroring save_integrity_adversarial.test.ts.
   - Header docstring: state this is the REJECTION-DIRECTION oracle for the trace-load boundary,
     extending bug_0181–0184 from the save load to the trace load; cite that the content-hash
     check guards WHICH pack, not WHETHER the state is well-formed.
   - Setup: record a clean trace exactly per inspect_trace_divergence.test.ts:48-60 (watchtower_road
     CYOA, the 5-action `ending_escape` route, `initStateForPack(index, 1)`), write it to a temp
     fixture under `traces/` via `writeFileSync(JSON.stringify(trace))`, and resolve the pack path
     `content/cyoa/pack/watchtower_road.yaml`. Use `api = () => createToolApi({ root: process.cwd() })`.
   - **WITNESS cases (must throw / hard-error pre-change — each is the SaveIntegrityError path):**
     (a) finiteness: forge the fixture's `initial_state.vars` to carry `1e999` (splice the literal
     token into the serialized JSON so it parses back to `Infinity`, per the
     save_integrity_adversarial `forgeWithToken` pattern) → assert `replay_trace` AND `inspect_trace`
     throw `SaveIntegrityError` (or, if the handler returns a `{ok:false}` shape rather than
     throwing for the hash branch, assert it THROWS — the gate is placed to throw, mirroring
     `load()`).
     (b) referential `current`: set `initial_state.current = "no_such_room"` → both throw, message
     matches `/unknown scene/`.
     (c) referential `endingId`: set `initial_state.endingId = "ending_phantom"` → both throw,
     message matches `/unknown ending/`.
     Each WITNESS MUST FAIL on the pre-change tree (no gate → the poisoned state reaches the engine
     and replay/inspect returns without throwing). Add a comment asserting this is a genuine
     witness, not a vacuous green.
   - **GREEN false-rejection / regression guard:** the clean recorded trace still `replay_trace`s
     (returns `ok:true` / the expected final-hash result) AND `inspect_trace`s (returns `ok:true`
     with the expected `steps`/`diverged_at_step`) byte-for-byte as before the change — proving the
     gate never false-rejects a legitimate fresh-init trace.
   - A second GREEN guard: feed a trace whose `initial_state` is a legitimately mid-game CYOA state
     (current = a real scene reached by stepping, endingId null) and assert it still replays — proves
     the gate accepts any state a real recording could carry, not only the init state.

5. **NEW artifact: traces/bugs/bug_0190_trace_load_integrity.yaml** — in the bug_0188/bug_0189
   format (id, title, kind: engine_fix, mode, summary, root_cause, fix, out_of_band_teeth,
   regression_test, verification). Key fields:
   - `title`: "Trace-load integrity gate — replay_trace/inspect_trace fed an untrusted on-disk
     GameState with no finiteness/structural/referential gate (the trace twin of bug_0181–0184)".
   - `root_cause`: the content-hash check guards WHICH pack, not WHETHER `initial_state` is
     well-formed; `Trace.initial_state` is a bare `GameState` with no schema; both handlers feed it
     raw to the engine (replay.ts:45, tools.ts:990/1012).
   - `fix`: lift `GameStateSchema` into exported `assertWellFormedState` (save_load.ts) and call it
     + the existing pack-aware `assertLoadedStateRefs` at the two FILE-read sites (tools.ts:957,980)
     before any engine call; REUSE of two shipped gates, no new schema, no check weakened.
   - `out_of_band_teeth`: the new test plants three known-bad-by-construction forged traces the gate
     MUST reject (vars→Infinity, phantom current, phantom endingId), each failing pre-change, plus
     GREEN guards that a clean / legitimately-mid-game trace still replays + inspects unchanged.
   - `regression_test: tests/regression/trace_load_integrity.test.ts`.
   - Note (mirroring bug_0188's note): no committed content_hash pin is forced — no pack changes,
     so nothing re-pins; `verify:integrity` stays green with no `AI_LOOP_ALLOW_VERIFIER_EDITS`.

6. **Verify (key-free, offline, deterministic):**
   - `npx vitest run tests/regression/trace_load_integrity.test.ts` (new oracle green).
   - `npx vitest run tests/regression/save_integrity_adversarial.test.ts
     tests/regression/save_load_referential_integrity.test.ts tests/unit/save_trace.test.ts
     tests/regression/inspect_trace_divergence.test.ts tests/regression/rpg_barrow_trace.test.ts`
     (the save + trace neighborhood stays green — proves the lift and the gate broke nothing).
   - `npx tsc --noEmit` clean.
   - `npm run health` fully green (verify:integrity + lint + tests + validate + playtest).
   - Sanity that the WITNESSES are genuine: `git stash` the tools.ts gate (or temporarily comment
     the two-line insertion) and confirm the three WITNESS cases FAIL, then restore — do NOT commit
     this experiment.

### Exact files

- READ-ONLY: src/trace/record.ts, src/trace/replay.ts, src/mcp/paths.ts,
  tests/regression/inspect_trace_divergence.test.ts, tests/regression/
  save_integrity_adversarial.test.ts, tests/regression/save_load_referential_integrity.test.ts,
  tests/unit/save_trace.test.ts, src/core/state.ts, src/core/conditions.ts.
- EDIT: src/persist/save_load.ts (export `assertWellFormedState`); src/mcp/tools.ts (import it;
  add the two-line gate to `replay_trace` after :964 and to `inspect_trace` after :986).
- NEW: tests/regression/trace_load_integrity.test.ts; traces/bugs/bug_0190_trace_load_integrity.yaml.

### Acceptance check (concrete / verifiable)

- `tests/regression/trace_load_integrity.test.ts` passes: 3 WITNESS forged traces (vars→Infinity,
  phantom `current`, phantom `endingId`) make BOTH `replay_trace` and `inspect_trace` throw
  `SaveIntegrityError`; and ≥2 GREEN guards (a clean fresh-init recorded trace, and a legitimately
  mid-game CYOA trace) still replay + inspect unchanged.
- Reverting the tools.ts two-line gate makes every WITNESS case fail (proving they are genuine
  witnesses, not vacuous greens).
- All pre-existing save + trace tests stay green; `npx tsc --noEmit` clean; `npm run health` green;
  `verify:integrity` green with NO `AI_LOOP_ALLOW_VERIFIER_EDITS` (no protected/hash-pinned file
  changed, no floor lowered, no matcher relaxed).
- traces/bugs/bug_0190_trace_load_integrity.yaml exists in the bug_0189 format.

## Hard constraints (every cycle)

- Key-free / offline / deterministic: no outbound model calls, no wall-clock, no RNG.
- ONE focused change; additive/strengthening only; NEVER weaken a check (no lowering
  `MIN_*` floors or `GEN_EVAL_CHECK_COUNT`, no relaxing matchers, no `GUARD_WEAKENED`).
- Keep the game playable and `npm run health` green.
- Do NOT bump `generator_version` or re-seal the corpus (this move needs neither).
- Gate at the untrusted-FILE boundary ONLY (tools.ts:957, :980); never inside
  replayTrace/runActions/diagnose.

## Rejected alternatives (this cycle)

- **Scorecard freshness-pin (deferred #1)** — genuinely open and recommended by 3 of 6
  reviewers, but it requires EDITING the verifier (`scripts/verify-integrity.ts` HASH_PIN_FILES),
  so every future legitimate re-benchmark trips `HASH_PIN_REPINNED`/`HASH_PIN_UNACCOMPANIED` and
  may need `AI_LOOP_ALLOW_VERIFIER_EDITS=1`; its first act may be a regenerate-then-re-pin if the
  committed runs=50 artifact is even slightly platform-float-sensitive. Larger blast radius,
  touches the guard surface, and its oracle is a byte-equality pin (weaker rejection-direction)
  versus the trace gate's known-bad-by-construction corpus. Deferred to next cycle.
- **RPG-validator NEGATIVE-corpus mutator (deferred #2)** — ALREADY SHIPPED as bug_0182
  (tests/regression/rpg_validator_negative_corpus.test.ts verified on disk). Re-doing it is churn.
- **MCP authoring/generation SYMMETRY — generate_parser_pack + adapt_story `mode` param
  (deferred #3)** — real and open, but a feature-completeness move, not a verifier-soundness move;
  under the key-free MockAuthorProvider it only mints canned mock packs with no negative oracle this
  cycle. Payoff is realized only when a keyed model authors through it — sequence it immediately
  BEFORE the keyed run.
- **ABC no-op-separation guard + contamination DELTA metric (deferred #4)** — has no signal until a
  capable keyed agent populates benchmark rows; the offline bot scores the flat 0.5 floor. Gated on
  the keyed run.
- **Keyed real-model author→play→fix→lock run (deferred #5)** — OUT OF SCOPE for a key-free cycle.
- **A `flags` referential gate at the trace boundary** — rejected as false-rejection-prone: `flags`
  is an OPEN namespace (content `set_flag` any string, plus `__exit:` runtime flags), so there is no
  provably-complete legitimate set; the bug_0184 inventory gate is sound precisely because its set IS
  provably complete. The current/endingId/inventory gate is strictly better and already proven.

## Deferred to next cycle

1. Scorecard freshness-pin (deferred #1) — pin `traces/benchmark/scorecard.{json,md}` byte-identical
   to a live `runs=50` rebuild and add both to HASH_PIN_FILES; regenerate-then-pin first.
2. MCP authoring/generation symmetry (deferred #3) — `generate_parser_pack` MCP tool + `new_game`
   `generate_parser_seed` branch (twins of the CYOA/RPG pair, tools.ts:276-312), then a `mode` param
   on `adapt_story` routing to `runParserAdapter`/`runRpgAdapter` (separate commits) — sequence
   immediately before the keyed run.
3. ABC no-op-separation guard + contamination DELTA metric (deferred #4) — once keyed rows exist.
4. The keyed real-model author→play→fix→lock run (deferred #5) — gated on owner API key.
5. **From this cycle's blind playtest of wolf_winter (content_fix, NEXT cycle):** the day-book + Cade
   promise a *spear* as a hard requirement ("speared right AND padded, both, mind") but no spear item
   exists — the +2 attack actually comes from asking Cade. Reword so "speared right" maps to learning
   the wolf-rush, removing the phantom-item implication; also drop the "the way Cade said" attribution
   from the yearling-kill journal on the no-dialogue route (reactive-variant, bug_0188 class). Report:
   ai-runs/2026-06-03T16-58-54-600Z/playtest.md.

## Mandated blind playtest (this cycle)

The orchestrator ran the mandated blind playtest on **wolf_winter** this cycle (the curated
combat_guaranteed THREE-fight gauntlet shipped bug_0189) — report at
ai-runs/2026-06-03T16-58-54-600Z/playtest.md. Record "Mandated blind pass ran on wolf_winter" in
the AI_LOOP_STATE.md cycle entry so the recency rotation does not re-freeze (AI_LOOP_STATE.md is
NEWEST-FIRST). It is handled by the orchestrator, not the implementation subagent.
