# Current plan (rolling)

This is the AFK loop's **living plan** — the hand-off document for the
saturation-triggered ultraplan (see [`docs/afk_loop.md`](./afk_loop.md)). When the
deterministic assessor runs dry (`isSaturated`), an ultraplan cycle re-aims the
project, **overwrites this file** with the synthesis + the single chosen next move,
and a fresh implementation subagent reads _only_ this file (plus the files it names)
to do the work.

---

# Ultraplan re-aim cycle #14 (HEAD = bug_0277; next free id = bug_0278)

## Synthesis

A bounded ultraplan ran this cycle — **4 repo reviewers** (engine/determinism ·
content/authoring · verification/benchmark · loop/strategy) **+ 2 web researchers**
(frontier IF/agentic benchmarks · verification/reward-hacking) **→ 1 synthesis**,
each grounded against the live repo at HEAD = bug_0277, then the chosen move was
independently re-verified by the orchestrator against source before being committed
here.

**Convergent signal across reviewers.** Three of the six reviewers independently named
the `observation_difficulty` / `hide_graph` API gap (engine/determinism reviewer Gap 3;
verification/benchmark reviewer Gap 1; loop/strategy reviewer, top pick). The engine/
determinism reviewer also named two validator gaps: `unlock_exit` room-ref dangling
(Gap 1) and `add_item`/`remove_item` item-ref dangling (Gap 2). The content/authoring
reviewer named the `alchemists_tower` steadiness inertness and the parser/RPG authoring
mode writer-prompt gap. The web researchers confirmed the benchmark novelty claim and
the importance of out-of-band tamper-resistant verification (already the project's
architecture). The verification/benchmark reviewer named the LLM-judge tamper-detector
second pass (blast radius L) and the real-model scorecard execution gap.

**The orchestrator re-verified all gaps in source at HEAD = bug_0277:**

- `observation_difficulty` / `hide_graph`: the `HIDE_GRAPH` zod shape is defined in
  `src/mcp/server.ts:51-58` and threaded through `new_game`/`start_game` correctly.
  The `buildObsFor` dispatcher at `src/mcp/tools.ts:110` passes `{ hideGraph }` through
  to all three observation builders. Parser observation (`src/parser/observation.ts:129`)
  already omits `exit.to` when `hideGraph`. CYOA observation (`src/cyoa/observation.ts:56-59`)
  already accepts `_opts` as a no-op and is correct by construction (CYOA never exposes
  `choice.next`). **The `hide_graph` feature is FULLY LANDED end-to-end.** The
  loop/strategy reviewer called this the top pick on the basis that `get_observation`
  and `step_action` do not accept `hide_graph` mid-session — but the session's
  `s.hideGraph` flag (set at `new_game`/`start_game` time) persists and is applied on
  every `obsOf(s)` call (`tools.ts:407`). There is no structural gap here, only a
  cosmetic one (naming `hide_graph` vs. a hypothetical `observation_difficulty` enum).
  **This is already done. Not the move.**

- `unlock_exit` room-ref dangling (engine/determinism reviewer Gap 1): confirmed open.
  `collectRoomRefs` at `src/validate/parser_validator.ts:1590-1594` explicitly states
  "the only two room-id-bearing effects" are `goto` and `place_object.room` — and the
  comment is wrong. `unlock_exit: { from, to }` (effects.ts:31) carries two room ids;
  neither `from` nor `to` is in `collectRoomRefs`. A dangling `unlock_exit.from` or `.to`
  silently writes an unreachable exit-flag key (`__exit:X->Y`) that no exit's
  `conditions` check will ever match, making the unlock a **permanent no-op** — a worse
  footgun than the `goto`/`visited` dangle bug_0277 closed, because the unlock APPEARS
  to succeed (the effect fires, the flag is set) but the exit never opens. Five shipped
  packs use `unlock_exit`; all 5 verified clean (orchestrator ran a Python scan). Fix:
  add `unlock_exit.from` and `unlock_exit.to` to `collectRoomRefs`. **Genuinely open.
  This is the move.**

- `add_item`/`remove_item` item-ref dangling (engine/determinism reviewer Gap 2):
  confirmed open as a gap in principle, but orchestrator scan found 0 dangling refs
  across all 17 shipped packs. Also, `allEffects` already collects `add_item` targets
  at `parser_validator.ts:461` for the obtainability fixpoint — a bare `add_item:
  "phantom"` for an unknown item is already partially handled (the item never appears
  in `objById`, so it is treated as unobtainable). The footgun is real but the
  immediate blast exposure is lower than `unlock_exit`'s silent-no-op failure mode.
  Correctly deferred to the cycle after `unlock_exit` is sealed.

**Why `unlock_exit` wins on all four selection criteria:**

1. **Genuinely open:** Orchestrator confirmed the gap at source. `collectRoomRefs` ends
   at `place_object.room` — no `unlock_exit.from`/`.to` appears anywhere in the
   reference-integrity family.
2. **Higher impact than the `goto`/`visited` dangle (bug_0277):** a dangling `visited`
   evaluates false silently; a dangling `unlock_exit.from`/`.to` writes an unreachable
   flag that makes the unlock a permanent no-op. The player executes the correct action,
   something appears to happen (the effect fires), and the exit stays locked — the
   hardest class of authoring bug to diagnose from inside the game.
3. **Additive, S blast radius, key-free, offline:** one two-line addition to
   `collectRoomRefs`, one new regression test file, one bug artifact. No schema change,
   no engine change, no pack hash change.
4. **Sequence-correct:** bug_0277 sealed the condition-side and `goto`/`place_object`
   effect-side room-ref integrity. `unlock_exit` is the one remaining effect kind that
   carries room ids. Sealing it completes intra-frame room-reference integrity — the
   same rung on the assume-guarantee ladder the deferred world-frame manifest depends on.

## Chosen move — WHAT (numbered, concrete)

**Goal:** the parser validator emits a NEW **error** `UNLOCK_EXIT_ROOM_MISSING` when
an `unlock_exit` effect's `from` or `to` room id is absent from `pack.rooms`. A
dangling `unlock_exit` writes an unreachable exit-flag key, making the unlock a
permanent no-op that silently survives validation. Zero shipped packs regress (all 5
`unlock_exit` users verified clean). Synthetic tests prove the error fires (both `from`
and `to` kinds) and prove non-vacuity. RPG is covered for free via delegation.

**Bug id:** `bug_0278`

**Error code:** `UNLOCK_EXIT_ROOM_MISSING`

**Severity:** `error` (same class as `EXIT_TARGET_MISSING` / `UNRESOLVED_ROOM_REFERENCE`)

### Implementation steps

1. **Add a dedicated `UNLOCK_EXIT_ROOM_MISSING` emit block** in
   `src/validate/parser_validator.ts`, placed immediately AFTER the
   `UNRESOLVED_ROOM_REFERENCE` emit block (~line 233) and BEFORE the `AMBIGUOUS_ALIAS`
   check (~line 235). Scan `allEffects(pack)` for `unlock_exit` effects and check both
   `from` and `to` against `roomIds`:

   ```typescript
   for (const e of allEffects(pack)) {
     if (!("unlock_exit" in e)) continue;
     for (const [side, id] of [
       ["from", e.unlock_exit.from],
       ["to", e.unlock_exit.to],
     ] as const) {
       if (!roomIds.has(id))
         findings.push(
           err(
             "UNLOCK_EXIT_ROOM_MISSING",
             `unlock_exit "${side}" room "${id}" does not exist — the unlock writes an unreachable exit flag and is a permanent no-op.`,
             [`room:${id}`],
           ),
         );
     }
   }
   ```

   The `allEffects(pack)` enumerator (~line 1223) already yields `unlock_exit` effects
   (it is already used at line ~329 to collect the settable-flags set via
   `exitFlag(e.unlock_exit.from, e.unlock_exit.to)`). The field access pattern
   `e.unlock_exit.from`/`.to` is already established — this is a straight reuse.
   Severity is `error` (the `err()` default), same as `EXIT_TARGET_MISSING`.

2. **Update the `collectRoomRefs` comment** near the effect-side loop (~line 1590).
   Change "the only two room-id-bearing effects" to "goto and place_object.room are
   the room-id-bearing effects collected here; unlock_exit.from/.to are checked in a
   dedicated UNLOCK_EXIT_ROOM_MISSING block in the validator body." This keeps the
   comment accurate and explains why `unlock_exit` is not folded into `collectRoomRefs`.

3. **Add `UNLOCK_EXIT_ROOM_MISSING` to the bail-early guard** at
   `parser_validator.ts:252-258`. The current guard bails before graph analysis if
   `EXIT_TARGET_MISSING` or `START_MISSING` is present. Add `UNLOCK_EXIT_ROOM_MISSING`:

   ```typescript
   if (
     findings.some(
       (f) =>
         f.severity === "error" &&
         ["EXIT_TARGET_MISSING", "START_MISSING", "UNLOCK_EXIT_ROOM_MISSING"].includes(
           f.code,
         ),
     )
   )
   ```

   Rationale: a dangling `unlock_exit` room id corrupts the settable-flags set the graph
   analysis uses (line ~331: `settable.add(exitFlag(e.unlock_exit.from, e.unlock_exit.to))`
   would add an unreachable flag), so bailing before graph analysis is sound — identical
   logic to why `EXIT_TARGET_MISSING` bails.

4. **Add a broken fixture** `content/broken-fixtures/parser_unlock_exit_room_missing.yaml`.
   Model it on `content/broken-fixtures/parser_exit_target_missing.yaml`. Minimal
   winnable pack (two declared rooms `a`/`b`, one exit north/south, one win condition
   on `visited: b`) where one object's USE interaction has:
   `unlock_exit: { from: ghost_room, to: b }` — `ghost_room` is NOT declared. Register
   it in `tests/unit/parser_validator.test.ts` at the `VALIDATOR_FIXTURES` array (near
   the `parser_exit_target_missing` entry) as:

   ```typescript
   ["parser_unlock_exit_room_missing", "UNLOCK_EXIT_ROOM_MISSING"],
   ```

5. **Add a negative-corpus CASE** in
   `tests/regression/parser_validator_negative_corpus.test.ts` at the `CASES` array
   (near line ~85). Mutate the `GREEN = generateParserPack(0)` base to inject an
   `unlock_exit` effect with a bogus `from` room on some interaction (e.g., insert an
   interaction effects entry `{ unlock_exit: { from: "phantom_room", to: <any_real_room> } }`
   on a declared object). Assert `codesOf(mutant)` includes `UNLOCK_EXIT_ROOM_MISSING`.
   Because this is `error` severity and `codesOf` is already error-only, no new filter
   is needed. Do NOT weaken any existing `CASES` entry.

6. **Add the dedicated §15 regression test**
   `tests/regression/parser_unlock_exit_room_missing.test.ts`. Model it on
   `tests/regression/parser_unresolved_room_reference.test.ts` (the closest structural
   sibling — reuse its `parserCodes(src)` helper and the `readdirSync` shipped-pack
   iteration idiom). Lock these cases:

   - **(a) Invariant:** ALL shipped parser + RPG packs (`content/parser/pack` +
     `content/rpg/pack`, auto-discovered via `readdirSync`) produce ZERO
     `UNLOCK_EXIT_ROOM_MISSING` findings and stay green. (5 packs use `unlock_exit` —
     lamplighters_round ×2, sealed_crypt ×2, tide_mill ×1 — all must produce zero
     findings.)

   - **(b) Positive (`from` side):** a synthetic pack with
     `unlock_exit: { from: ghost_room, to: b }` where `ghost_room` is not declared →
     assert codes include `UNLOCK_EXIT_ROOM_MISSING` AND that finding's
     `severity === "error"` AND that `message` contains `ghost_room`.

   - **(c) Positive (`to` side):** a synthetic pack with
     `unlock_exit: { from: a, to: ghost_room }` where `ghost_room` is not declared →
     assert `UNLOCK_EXIT_ROOM_MISSING` fires with message containing `ghost_room`.

   - **(d) NON-VACUITY (mandatory):** correct the bogus room id in case (b) to a
     DECLARED room (`a` or `b`) → assert `UNLOCK_EXIT_ROOM_MISSING` is now ABSENT.
     Proves the check keys on the genuine dangling ref, not the mere presence of
     `unlock_exit`.

   - **(e) Both sides dangle:** a synthetic pack with
     `unlock_exit: { from: ghost_a, to: ghost_b }` where BOTH are undeclared → assert
     the findings include at least one `UNLOCK_EXIT_ROOM_MISSING` per dangling side.

7. **Create the SoundnessBench artifact**
   `traces/bugs/bug_0278_parser_unlock_exit_room_missing.yaml`. Mirror the field shape
   of `traces/bugs/bug_0277_parser_unresolved_room_reference.yaml` exactly (fields:
   bug_id, component, class, title, findings[].{id, where, severity, description, fix},
   soundness_argument, failure.{type, description}, regression_test). The soundness
   argument should state:

   - `unlock_exit` carries two room ids (`from` and `to`) that are semantically
     load-bearing: the engine computes the exit-flag key as `__exit:FROM->TO`
     (`src/core/effects.ts`). If either room id is absent from `pack.rooms`, the written
     flag key can never match any exit's `conditions` check (which uses the same
     `exitFlag` formula keyed on DECLARED room ids), making the unlock a permanent
     silent no-op — harder to diagnose than a dead gate because the effect appears to
     fire.
   - Bug_0277 sealed conditions (`visited`/`not_visited`/`in_room`) and the
     `goto`/`place_object.room` effects; bug_0278 seals the `unlock_exit.from`/`.to`
     effect — together these cover every room-id-bearing construct in the pack schema,
     completing intra-frame room-reference integrity.
   - Reference arXiv:2412.03154 (SoundnessBench) consistent with sibling artifacts.

8. **Mandated blind pass — `content/parser/pack/friars_postern.yaml`.** The mandated
   blind pass this cycle is `friars_postern.yaml`. Run the blind pass (parser mode,
   fresh MCP-only subagent with no content/src/tests access, seeds 7/13/3) and append
   the report to `AI_LOOP_STATE.md` using the same format as prior blind passes. The
   blind pass is independent of the validator change and should complete regardless of
   test results. Key facts for verification: `friars_postern.yaml` uses `remove_item:
   clay_pipe` (verified clean — `clay_pipe` is a declared object). No `unlock_exit` in
   this pack.

## WHY this, not the runner-ups

- **vs. `observation_difficulty` enum (loop/strategy reviewer's top pick):** the feature
  is ALREADY FULLY LANDED. `hide_graph` is wired end-to-end from `new_game`/`start_game`
  through `s.hideGraph` through `obsOf(s)` through all three observation builders. The
  CYOA builder is correct by construction (never exposes `choice.next`). The parser
  builder correctly omits `exit.to` when `hideGraph`. The only remaining gap is
  cosmetic: a named enum (`easy`/`hard`) vs. a boolean. That is a doc/naming polish,
  not a structural move. **NOT THE MOVE — already done.**

- **vs. `add_item`/`remove_item` dangling item-ref check (engine/determinism reviewer
  Gap 2):** real gap, but: (a) 0 dangling refs in 17 shipped packs (verified by
  orchestrator scan); (b) `add_item` targets already flow through the obtainability
  fixpoint (`parser_validator.ts:461`), so a phantom item is partially handled; (c) the
  `unlock_exit` gap is semantically worse (the unlock APPEARS to succeed, confusing
  authors). Correctly sequenced AFTER `unlock_exit` closes the room-ref family.
  **DEFERRED.**

- **vs. LLM-judge tamper-detector second pass (verification/benchmark reviewer Gap 2):**
  blast radius L; requires a keyed/model-driven run (LLM diff-pass); explicitly out of
  scope for an offline key-free cycle. The existing `verify-integrity.ts` semantic floor
  guards (ASSERTION_COUNT_REGRESSION, strong-matcher floor) and the SoundnessBench
  discipline (non-vacuity tests) already address the vacuous-strong-matcher hole
  mechanically. **DEFERRED.**

- **vs. `alchemists_tower` steadiness content fix (content/authoring reviewer):** S
  blast radius, viable, but content polish — not structural. Carried forward from
  cycle #13. **DEFERRED.**

- **vs. parser/RPG writer-prompt mode-aware beat guidance (content/authoring reviewer):**
  M blast radius, correct structural direction, but the writer-prompt gap requires more
  calibration data from the authoring pipeline before a mode-aware prompt improvement is
  grounded. **DEFERRED.**

- **vs. forward-reachability BFS validator / world-frame manifest:** same deferred
  rationale as cycle #13 — L blast radius, multi-cycle, correctly sequenced after
  intra-frame reference integrity is complete (this move closes the last room-ref gap).
  **DEFERRED.**

## VERIFIED anchors (orchestrator opened + confirmed in source at HEAD — re-derive, do not trust line numbers blindly)

- `src/validate/parser_validator.ts` — `collectRoomRefs` function near line 1564; the
  effect-side loop (~1590-1594) collects `goto` and `place_object.room` but NOT
  `unlock_exit.from`/`.to`. The comment says "the only two room-id-bearing effects" —
  this is the gap.

- `src/validate/parser_validator.ts:329-331` — `unlock_exit` IS already enumerated in
  `allEffects` for the settable-flags set:
  `settable.add(exitFlag(e.unlock_exit.from, e.unlock_exit.to))`. The field access
  pattern `e.unlock_exit.from`/`.to` is already established — copy it exactly.

- `src/validate/parser_validator.ts:110` — `const roomIds = new Set(pack.rooms.map((r) => r.id))`.
  Use unchanged.

- `src/validate/parser_validator.ts:31` — `err(code, message, where)` helper. Defaults
  to `error` severity. Use `err("UNLOCK_EXIT_ROOM_MISSING", ..., ["room:" + id])`.

- `src/validate/parser_validator.ts:252-258` — the bail-early guard. Add
  `UNLOCK_EXIT_ROOM_MISSING` to the bail list.

- `src/validate/parser_validator.ts:1223` — `allEffects(pack)` enumerator. Already
  yields `unlock_exit` effects.

- `src/core/effects.ts:31` — `unlock_exit: z.object({ from: z.string().min(1), to: z.string().min(1) })`.
  Both are room ids.

- `src/validate/rpg_validator.ts:102` — delegates to `validateParser`. RPG is covered
  for free. No `rpg_validator.ts` edit needed.

- Shipped `unlock_exit` packs (all 5 verified clean by orchestrator Python scan):
  `content/parser/pack/lamplighters_round.yaml` (lamp_walk→excise_store,
  harbour_head→the_strand), `content/parser/pack/sealed_crypt.yaml`
  (old_well→well_bottom, crypt→catacombs), `content/parser/pack/tide_mill.yaml`
  (wheel_room→the_staith).

- `content/broken-fixtures/parser_exit_target_missing.yaml` — fixture template.
- `tests/unit/parser_validator.test.ts` — `VALIDATOR_FIXTURES` registry near line 29.
- `tests/regression/parser_validator_negative_corpus.test.ts` — `CASES` near line 85;
  `codesOf` (error-only) near line 67.
- `tests/regression/parser_unresolved_room_reference.test.ts` — dedicated-test template.
- `traces/bugs/bug_0277_parser_unresolved_room_reference.yaml` — bug artifact template.

## Files

**DO-NOT-EDIT (protected):**
- `scripts/verify-integrity.ts` — PROTECTED. Never edit. Do not lower any
  MIN_*/SATURATION_FLOOR/GEN_EVAL_CHECK_COUNT/PROTECTED/HASH_PIN, do not relax any
  matcher. Test count only RISES, strengthening its TEST_COUNT guard.

**READ-ONLY (confirm anchors, do not change):**
- `src/core/effects.ts` — `unlock_exit: { from, to }` shape (~line 31).
- `src/validate/rpg_validator.ts` — confirms `validateParser` delegation (~line 102).
- `content/broken-fixtures/parser_exit_target_missing.yaml` — fixture template.
- `tests/regression/parser_unresolved_room_reference.test.ts` — dedicated-test template.
- `traces/bugs/bug_0277_parser_unresolved_room_reference.yaml` — artifact template.
- `content/parser/pack/lamplighters_round.yaml`, `sealed_crypt.yaml`, `tide_mill.yaml`
  — confirm the 5 shipped `unlock_exit` uses stay GREEN after the change.

**EDIT:**
- `src/validate/parser_validator.ts` — (a) add `UNLOCK_EXIT_ROOM_MISSING` emit block
  after the `UNRESOLVED_ROOM_REFERENCE` block; (b) update the `collectRoomRefs` comment;
  (c) add `UNLOCK_EXIT_ROOM_MISSING` to the bail-early guard.
- `tests/unit/parser_validator.test.ts` — register `parser_unlock_exit_room_missing`
  fixture in `VALIDATOR_FIXTURES`.
- `tests/regression/parser_validator_negative_corpus.test.ts` — add the `unlock_exit`
  bogus-room CASE to `CASES`.

**NEW:**
- `content/broken-fixtures/parser_unlock_exit_room_missing.yaml` — the broken fixture.
- `tests/regression/parser_unlock_exit_room_missing.test.ts` — dedicated test (cases
  a-e).
- `traces/bugs/bug_0278_parser_unlock_exit_room_missing.yaml` — the SoundnessBench-
  lineage bug artifact.

## Acceptance check (concrete, verifiable)

1. `npx vitest run tests/regression/parser_unlock_exit_room_missing.test.ts` — GREEN:
   cases (b) and (c) fire `UNLOCK_EXIT_ROOM_MISSING` at severity `error`; case (d)
   non-vacuity clears it; case (e) fires for both dangling sides; case (a) shows all 5
   `unlock_exit` packs produce zero `UNLOCK_EXIT_ROOM_MISSING`.

2. `npx vitest run tests/unit/parser_validator.test.ts` — GREEN: the new fixture
   `parser_unlock_exit_room_missing` validates with code `UNLOCK_EXIT_ROOM_MISSING`.

3. `npm run health` — EXIT 0. All 17 packs validate clean with ZERO
   `UNLOCK_EXIT_ROOM_MISSING` findings. The 5 `unlock_exit` packs (lamplighters_round,
   sealed_crypt, tide_mill) specifically produce zero findings.

4. `npm run verify:integrity` — EXIT 0, no GUARD_WEAKENED / VERIFIER_TOUCHED / count
   regression; test count strictly ABOVE the prior 1841.

5. `traces/bugs/bug_0278_parser_unlock_exit_room_missing.yaml` exists and parses as YAML.

6. Mandated blind pass report for `friars_postern.yaml` is appended to `AI_LOOP_STATE.md`.

## Hard constraints

- ONE focused, key-free, OFFLINE, deterministic, ADDITIVE/strengthening STRUCTURAL
  change. No content polish, no new curated pack, no keyed run.
- No floor lowered, no matcher relaxed, no PROTECTED/HASH_PIN shrunk,
  `scripts/verify-integrity.ts` untouched.
- No engine/schema/effects/conditions runtime change; no pack hash / scorecard /
  corpus-seal movement; no generator-version bump; no RPG-validator edit.
- Game stays playable; `npm run health` stays green.
- Error code is exactly `UNLOCK_EXIT_ROOM_MISSING` — one code for both `from` and `to`
  sides (the side distinction lives in the message only).

## Reward-hacking guardrails (baked in)

- The check is ADDITIVE (a new error code), so it cannot weaken any existing assertion;
  verify:integrity's count/floor guards remain the bar and must stay green.
- The dedicated test proves the check FIRES on both dangling `from` and dangling `to`
  (cases b, c), fires for both dangling simultaneously (case e), and proves NON-VACUITY
  (case d: correct id clears it) — the same SoundnessBench discipline (arXiv:2412.03154)
  as bug_0277 / INERT_OBJECT_STATE.
- The shipped-packs-stay-green invariant (auto-discover + iterate every parser + RPG
  pack, assert zero `UNLOCK_EXIT_ROOM_MISSING`) pins that no real pack emits the new
  code (verified: 5 `unlock_exit` uses, 0 dangling), preventing a vacuous always-fire
  implementation.

## Rejected alternatives and deferred to next cycle

- **DEFERRED — `add_item`/`remove_item` dangling item-ref check:** the item-id analogue
  of `UNRESOLVED_ROOM_REFERENCE`. Real gap, but zero dangling refs in 17 shipped packs;
  `add_item` targets partially handled by the obtainability fixpoint. Next in sequence
  after `unlock_exit` closes the room-ref family.
- **DEFERRED — `observation_difficulty` enum naming:** the `hide_graph` boolean is
  already fully wired end-to-end. A named enum is a doc/naming cosmetic, not a
  structural move.
- **DEFERRED — LLM-judge tamper-detector second pass:** blast radius L; requires a
  keyed model run; out of scope for an offline cycle.
- **DEFERRED — parser/RPG writer-prompt mode-aware beat guidance:** M blast radius;
  correct structural direction; needs more calibration data.
- **DEFERRED — forward-reachability BFS validator / world-frame manifest:** L blast
  radius, multi-cycle. Correctly sequenced after intra-frame reference integrity is
  complete (this move closes the last room-ref gap).
- **NOTED (blind-pass finding, NOT this cycle's move) — alchemists_tower `grip iron
  key` steadiness check is legible (bug_0274) but mechanically INERT:** carried forward
  from cycle #13. Candidate content/quest fix for a future cycle.

---

# Ultraplan re-aim cycle #14 (HEAD = bug_0277; next free id = bug_0278)

## Synthesis

A bounded ultraplan ran this cycle — **4 repo reviewers** (engine/determinism ·
content/authoring · verification/benchmark · loop/strategy) **+ 2 web researchers**
(frontier IF/agentic benchmarks · verification-at-scale/reward-hacking) **→ 1 synthesis**
— grounded against the live repo at HEAD = bug_0277, then **independently re-verified by
the orchestrator against source** before being committed here.

The synthesis agent's initial pick was `observation_difficulty` mode. **The orchestrator
re-verified this against source and found it largely already implemented:**
- `HIDE_GRAPH` constant in `src/mcp/server.ts:51-57` — accepted by `new_game`/`start_game`.
- `src/parser/observation.ts:129` already suppresses `exit.to` when `hideGraph`.
- `src/cyoa/observation.ts:52-59` accepts `_opts` as no-op; CYOA choices do not expose
  `choice.next` by construction ("hidden by construction").
- The gap is narrow: no `observation_difficulty` *named enum* parameter exists, only the
  boolean `hide_graph`. This is a naming/ergonomics gap, not a functional one.

**The orchestrator then applied the engine reviewer's finding**, which identified a
genuinely open structural gap in `collectRoomRefs` — the function bug_0277 just added.
That finding is the chosen move for cycle #14.

## Chosen move — `UNLOCK_EXIT_ROOM_REFERENCE` (bug_0278)

**Goal:** `collectRoomRefs` in `src/validate/parser_validator.ts` (the read-walker added
by bug_0277) collects room IDs from condition sites (`visited`/`not_visited`/`in_room`)
and effect sites (`goto`, `place_object.room`). The comment at line 1590 says these are
"the only room-id-bearing effects" — **this is wrong.** `unlock_exit: { from, to }`
(defined at `src/core/effects.ts:31`) carries two room IDs, and neither `from` nor `to`
is added to `collectRoomRefs`'s set. A typo'd `unlock_exit.from` or `.to` silently
writes an unreachable exit-flag key (`__exit:phantom->real` instead of
`__exit:real->real`), making the exit permanently un-lockable — no existing oracle catches
this. This is a direct bug_0277 follow-on: same function, same error code
(`UNRESOLVED_ROOM_REFERENCE`), blast radius S.

**Verification that shipped packs stay green:** 5 `unlock_exit` uses exist across 3
shipped packs (tide_mill: 1, lamplighters_round: 2, sealed_crypt: 2). All use valid,
declared room IDs — the check fires ZERO times on shipped content.

## Implementation (numbered, concrete)

1. **Edit `src/validate/parser_validator.ts` — the `collectRoomRefs` effect loop**
   (currently at ~lines 1590–1594). Change the loop and its preceding comment from:
   ```typescript
   // Effect-side room refs: goto + place_object.room (the only room-id-bearing effects).
   for (const e of allEffects(pack)) {
     if ("goto" in e) refs.add(e.goto);
     else if ("place_object" in e) refs.add(e.place_object.room);
   }
   ```
   To:
   ```typescript
   // Effect-side room refs: goto, place_object.room, and unlock_exit.from/.to.
   for (const e of allEffects(pack)) {
     if ("goto" in e) refs.add(e.goto);
     else if ("place_object" in e) refs.add(e.place_object.room);
     else if ("unlock_exit" in e) {
       refs.add(e.unlock_exit.from);
       refs.add(e.unlock_exit.to);
     }
   }
   ```
   No other change to `parser_validator.ts`. The emit loop at ~lines 224–230 already
   calls `err("UNRESOLVED_ROOM_REFERENCE", …)` for every ref not in `roomIds` — no
   change needed there.

2. **Edit `tests/regression/parser_unresolved_room_reference.test.ts`** — add new cases
   inside the existing `describe("bug_0277 …")` block. The existing `pack()` helper
   (line 52-76) supports `opts.effects` as inline YAML for an interaction on `lever`.
   Add:

   - **Case (e):** `pack({ effects: "{ unlock_exit: { from: phantom_room, to: b } }" })`
     → assert `codes.includes("UNRESOLVED_ROOM_REFERENCE")` and `severity === "error"`;
     assert `message.includes("phantom_room")`.

   - **Case (e'):** `pack({ effects: "{ unlock_exit: { from: a, to: phantom_room } }" })`
     → same assertions for the `to` dangling ref; assert `message.includes("phantom_room")`.

   - **Case (e-nonvacuity):** `pack({ effects: "{ unlock_exit: { from: a, to: b } }" })`
     → assert `codes` does NOT contain `"UNRESOLVED_ROOM_REFERENCE"` (both `a` and `b`
     are declared rooms — proves the check keys on genuine dangling refs, not the mere
     presence of `unlock_exit`).

   Also update the file's header comment to mention `unlock_exit.from/.to` as a covered
   effect kind alongside `goto` and `place_object.room`.

3. **Create `traces/bugs/bug_0278_unlock_exit_room_reference.yaml`** — mirror the field
   shape of `traces/bugs/bug_0277_parser_unresolved_room_reference.yaml`. Fields: id
   (bug_0278), title, class (soundness/validator), summary, the_gap (unlock_exit.from/.to
   not collected by collectRoomRefs; comment literally wrong), the_fix (else-if branch in
   the effect loop), soundness_argument (same as bug_0277: seals intra-frame
   room-reference integrity, now including all room-id-bearing effect kinds), and the
   regression-lock filename. Reference arXiv:2412.03154 (SoundnessBench) consistent with
   bug_0277.

## VERIFIED anchors (re-derive; do not trust line numbers blindly)

- `src/validate/parser_validator.ts` — `collectRoomRefs` function, its `allEffects`
  loop. Search for `"the only room-id-bearing effects"` to locate the comment to fix.
- `src/core/effects.ts:31` — `unlock_exit: z.object({ from: z.string().min(1), to:
  z.string().min(1) })` — confirms `from` and `to` are room-id strings.
- `src/validate/parser_validator.ts:224-230` — the emit loop that calls
  `err("UNRESOLVED_ROOM_REFERENCE", …)` for every ref not in `roomIds` — needs no change.
- `tests/regression/parser_unresolved_room_reference.test.ts` — the existing test file;
  read it in full before adding cases to understand the `pack()` helper and the describe block.
- `traces/bugs/bug_0277_parser_unresolved_room_reference.yaml` — copy field shape.

## WHY this, not the runner-ups

- **vs. `observation_difficulty` naming/enum (synthesis's pick):** `hide_graph` is already
  implemented end-to-end for the functional cases (parser observation suppresses `exit.to`,
  CYOA is hidden by construction, MCP tools expose the boolean). The gap is ergonomic/naming.
  The `unlock_exit` gap is a real structural validator hole the comment in source incorrectly
  denies. Blast radius S vs M.
- **vs. forward-reachability BFS validator (AG(EF goal)):** deferred again — blast radius L,
  health time-budget risk, largely duplicative of bug_0150's dynamic certification.
- **vs. world-frame manifest / cross-region static reachability:** the right open-world lever
  but multi-cycle; its precondition (intra-frame reference integrity sealed by bug_0277) now
  also includes this fix (bug_0278: all room-id-bearing effects validated).
- **vs. alchemists_tower inert steadiness check (content fix):** viable but not structural;
  deferred to a future content cycle.

## Files

**DO-NOT-EDIT (protected):**
- `scripts/verify-integrity.ts` — PROTECTED. Never edit.

**READ-ONLY (confirm anchors):**
- `src/core/effects.ts` — `unlock_exit` shape.
- `traces/bugs/bug_0277_parser_unresolved_room_reference.yaml` — artifact template.
- `tests/regression/parser_unresolved_room_reference.test.ts` — read in full first.

**EDIT:**
- `src/validate/parser_validator.ts` — `collectRoomRefs` effect loop + comment.
- `tests/regression/parser_unresolved_room_reference.test.ts` — add (e)/(e')/(e-nonvacuity).

**NEW:**
- `traces/bugs/bug_0278_unlock_exit_room_reference.yaml`

## Acceptance check (concrete, verifiable)

1. `npx vitest run tests/regression/parser_unresolved_room_reference.test.ts` — GREEN: all
   existing cases (a/b/b'/c/c'/d) still pass; new cases (e)/(e')/(e-nonvacuity) also GREEN.
2. `npm run health` — EXIT 0; all 17 packs produce 0 `UNRESOLVED_ROOM_REFERENCE` findings
   (including tide_mill / lamplighters_round / sealed_crypt with their `unlock_exit` effects).
3. `npm run verify:integrity` — EXIT 0; no GUARD_WEAKENED/VERIFIER_TOUCHED; test count strictly
   above 1841.
4. `traces/bugs/bug_0278_unlock_exit_room_reference.yaml` exists and parses as YAML.

## Hard constraints

- ONE focused, key-free, offline, additive/strengthening structural change.
- No content polish, no new pack, no keyed run.
- No floor lowered, no matcher relaxed, `scripts/verify-integrity.ts` untouched.
- No engine/schema/effects/conditions runtime change; no pack hash / scorecard / corpus-seal.
- Game stays playable; `npm run health` stays green.

## Deferred to next cycle

- `observation_difficulty` enum naming — the functional hide_graph is already done; a named
  enum is ergonomic polish deferred.
- Forward-reachability BFS validator (AG(EF goal)) — blast radius L, deferred.
- World-frame manifest — multi-cycle, unblocked after this fix seals all room-id-bearing effects.
- Alchemists_tower inert steadiness check — content fix, deferred.
- Per-step RLVR/Gaia2 trajectory verifier — needs keyed run, deferred.

## Mandated blind playtest (this cycle)

Per the harness directive and the blind-pass rotation, the mandated blind pass runs this
cycle on **`content/parser/pack/friars_postern.yaml`** (the rotation's next nominee).
Report: `ai-runs/2026-06-08T01-10-02-147Z/playtest.md`.
