# Current plan (rolling)

This is the AFK loop's **living plan** — the hand-off document for the
saturation-triggered ultraplan (see [`docs/afk_loop.md`](./afk_loop.md)). When the
deterministic assessor runs dry (`isSaturated`), an ultraplan cycle re-aims the
project, **overwrites this file** with the synthesis + the single chosen next move,
and a fresh implementation subagent reads _only_ this file (plus the files it names)
to do the work.

---

# Ultraplan re-aim cycle #13 (HEAD = bug_0276; next free id = bug_0277)

## Synthesis

A bounded ultraplan ran this cycle — **4 repo reviewers** (engine/determinism ·
content/authoring+generators · verification/benchmark · loop/strategy) **+ 2 web
researchers** (frontier IF/agentic benchmarks · verification-at-scale + reward-hacking)
**→ 1 synthesis** (7 agents, 144 tool-uses, ~331k subagent tokens), each grounded against
the live repo at HEAD = bug_0276, then the chosen move was **independently re-verified by
the orchestrator against source** before being committed here.

**All four reviewers independently converged on the same top pick**, and the prior cycle's
two heaviest deferred levers were correctly re-deferred again (see "WHY this, not the
runner-ups"). The cycle-#12 chosen move (INERT_OBJECT_STATE, bug_0262) and its deferred
safety sibling (WIN_FIRES_AT_START object-state, bug_0270) BOTH landed since, so the
object-state local boundary is now sealed on feasibility + liveness + relock + win-stability.
The next genuinely-open rung on the same assume-guarantee ladder toward the deferred
world-frame manifest is **intra-frame reference integrity** for room ids.

The chosen move is **`UNRESOLVED_ROOM_REFERENCE` — a static room-reference-integrity check**
in the parser validator (and via delegation the RPG validator) that errs every room id named
by a `visited` / `not_visited` / `in_room` condition or a `goto` / `place_object.room` effect
when that id is absent from `pack.rooms`. It is the verbatim cycle-#12 deferred lever
("UNRESOLVED_ROOM_REFERENCE … ABSENT in src/validate/"), genuinely open, and it exactly
mirrors the existing `EXIT_TARGET_MISSING` / `NPC_ROOM_MISSING` reference checks.

**Why it is a real latent footgun no existing oracle catches (orchestrator-verified in source):**
`roomIds` (`src/validate/parser_validator.ts:110`) is consulted ONLY at `start_room` (:131),
`exit.to` (:150), and `npc.room` (:210) — **never** on a condition's room id nor on
`goto`/`place_object.room` effect targets. The room-naming conditions are bare strings in the
schema (`src/core/conditions.ts:20-29`, all `z.string().min(1)`), and a typo'd room id silently
evaluates **false forever** (`src/core/conditions.ts:80-82`: `visited` reads
`state.visited[id]`→`undefined`→`false`; `in_room` compares `state.current`) — a permanently-dead
gate that:
- the static SOFTLOCK pass treats as a deliberate stable-false gate,
- the exhaustive-BFS solver just sees as an unreachable atom, and
- the metamorphic relabel oracle is bijectively blind to (the twin keeps the same typo).

**Why it is provably green-preserving (orchestrator-verified):** a standalone YAML scan over
all shipped parser+RPG packs (walking the exact sites `collectRoomRefs` will walk, descending
`all_of`/`any_of`/`none_of`, plus `goto`/`place_object.room` effects) found **14 room refs, 0
dangling** — every shipped ref resolves to a declared room, and no shipped pack authors a
`goto`/`place_object` room effect. So the new error code fires ZERO times on every shipped pack;
`npm run health` stays exit-0 by construction. (The two "apparent" dangling refs another reviewer
flagged at `breaking_weir.yaml`/`wolf_winter.yaml` are inside YAML `#` comments and never parse
into conditions — confirmed 0 dangling after a real YAML parse.) CYOA packs are scene-graph
(no rooms) and untouched.

## Chosen move — WHAT (numbered, concrete)

**Goal:** the parser validator emits a NEW **error** `UNRESOLVED_ROOM_REFERENCE` when a
`visited`/`not_visited`/`in_room` condition or a `goto`/`place_object.room` effect names a room id
absent from `pack.rooms` — the room-id analogue of the existing `EXIT_TARGET_MISSING`. Zero shipped
packs regress (all 10 parser+RPG packs verified clean); synthetic mutants prove the error fires;
a corrected-id variant proves non-vacuity. RPG is covered for free via delegation.

1. **Add a read-walker `collectRoomRefs(pack)`** in `src/validate/parser_validator.ts`, placed
   IMMEDIATELY after `collectObjectStateReads` (the helper at ~`:1509`). Copy the `walk`/`walkAll`
   structure of `collectFlagReads` (~`:1471`) **EXACTLY** — it is the correct template because it
   descends ALL THREE connectives (`all_of`/`any_of`/`none_of`). Do **NOT** reuse `objectStateReqs`
   (all_of-only — it would under-count refs inside a disjunction). The `walk` arm collects room ids:
   `if ('visited' in c) refs.add(c.visited); else if ('not_visited' in c) refs.add(c.not_visited);
   else if ('in_room' in c) refs.add(c.in_room); else if ('all_of' in c) c.all_of.forEach(walk);
   else if ('any_of' …) …; else if ('none_of' …) …`. Walk the SAME sites `collectFlagReads` walks:
   room variants `v.when` + `exit.conditions`; object variants + `interaction.conditions`;
   `win_conditions`; ending variants `v.when`; NPC dialogue node variants + `topic.conditions`.
   Return a `Set<string>`.

2. **Collect EFFECT-side room refs.** Iterate `allEffects(pack)` (the enumerator at `:1208`, already
   used at `:314`/`:324`/`:350`/`:805`/`:851`) and add `e.goto` (when `'goto' in e`) and
   `e.place_object.room` (when `'place_object' in e`). `src/core/effects.ts:29` (goto) and `:40`
   (place_object) confirm these are the only two room-id-bearing effects. Fold these into the same
   set returned by step 1 (or a parallel set — your choice; one shared emit loop is simplest).

3. **Emit the findings** in the main `validate` body, in the same region as the existing
   `roomIds.has(...)` reference checks (near `:131`/`:150`/`:210`). For each collected ref NOT in
   `roomIds` (the set built at `:110`), push
   `err("UNRESOLVED_ROOM_REFERENCE", \`condition/effect references room "${id}" that does not exist.\`, [<breadcrumb>])`.
   Use the `err(code, message, where)` helper (`:31`) — it defaults to **error** severity, the same
   as `EXIT_TARGET_MISSING`. A dangling room ref is a structural bug, NOT a deliberate transient — so
   error severity is sound here (this is unlike the unordered-string quest-stage caveat at `:1187-1202`,
   which you must NOT touch). ONE code `UNRESOLVED_ROOM_REFERENCE` for all four ref kinds (the
   condition-vs-effect / which-room distinction lives in the message + breadcrumb only).

4. **RPG is covered for free** — `src/validate/rpg_validator.ts:102` calls `validateParser`. No
   `rpg_validator.ts` edit needed (confirm at `:32` import + `:102` delegation).

5. **Add a broken fixture** `content/broken-fixtures/parser_unresolved_room_reference.yaml`, modelled
   on `content/broken-fixtures/parser_exit_target_missing.yaml`: a tiny 2-room (a/b) winnable parser
   pack, but with a `win_condition` or an exit `conditions` entry `{ visited: nowhere_room }` naming a
   room that is NOT declared. Register it in `tests/unit/parser_validator.test.ts` `VALIDATOR_FIXTURES`
   (the `[string,string][]` at `:29`, next to `["parser_exit_target_missing","EXIT_TARGET_MISSING"]`)
   as `["parser_unresolved_room_reference","UNRESOLVED_ROOM_REFERENCE"]`.

6. **Add negative-corpus CASES** in `tests/regression/parser_validator_negative_corpus.test.ts` (the
   `CASES` array at `:85`), mutating the `GREEN = generateParserPack(0)` base (`:65`). Because
   `UNRESOLVED_ROOM_REFERENCE` is **error**-severity, the file's existing error-only `codesOf` (`:67`)
   already surfaces it — NO parallel warning filter needed (this is simpler than the INERT_OBJECT_STATE
   case which needed one). Add one case mutating a `win_condition`/exit `visited` to a bogus room id
   (assert `codesOf(mutant)` includes `UNRESOLVED_ROOM_REFERENCE`), and — only if convenient on the
   generated base — one mutating a `goto`/`place_object.room` target; otherwise leave effect coverage to
   the dedicated test in step 7. Do not weaken the existing `codesOf`/`CASES` discipline.

7. **Add the dedicated §15 regression test** `tests/regression/parser_unresolved_room_reference.test.ts`,
   modelled on `tests/regression/parser_inert_object_state.test.ts` (reuse its `parserCodes(src)` helper
   `:50` and the `readdirSync` shipped-pack iteration idiom `:83`). Lock these cases:
   - **(a) Invariant:** ALL shipped parser + RPG packs (`content/parser/pack` + `content/rpg/pack`,
     auto-discovered via `readdirSync`) produce ZERO `UNRESOLVED_ROOM_REFERENCE` findings and stay green.
   - **(b) Positive (condition):** a synthetic pack with a `visited`/`in_room` condition naming an
     undeclared room → assert the codes include `UNRESOLVED_ROOM_REFERENCE` AND that finding's
     `severity === "error"`.
   - **(c) Positive (effect):** a synthetic pack with a `goto` and/or `place_object: { room: <typo> }`
     effect naming an undeclared room → assert `UNRESOLVED_ROOM_REFERENCE` fires.
   - **(d) Non-vacuity (mandatory):** correct the bogus id in the case-(b)/(c) mutant to a DECLARED room
     → assert `UNRESOLVED_ROOM_REFERENCE` is now ABSENT. Proves the check keys on the genuine dangling
     ref, not the mere presence of the condition/effect.

8. **Create the SoundnessBench artifact** `traces/bugs/bug_0277_parser_unresolved_room_reference.yaml`
   (mirror the field shape of `traces/bugs/bug_0262_parser_inert_object_state.yaml` — read it for the
   exact fields: id, title, class, summary, the gap, the fix, the soundness argument, and the
   regression-lock filename). State the soundness argument: this seals **intra-frame room-reference
   integrity**, the next rung on the assume-guarantee ladder toward the deferred world-frame manifest
   (a region cannot soundly EXPORT a reachability guarantee at a cross-region edge if its own
   `visited`/`in_room`/`goto`/`place_object` room refs may dangle). Reference arXiv:2412.03154
   (SoundnessBench) consistent with the negative-corpus file header.

## WHY this, not the runner-ups

- **vs. promoting the test-only forward-reachability / no-dead-pocket BFS
  (`tests/regression/support/exhaustive_endings.ts`, bug_0150) into a validator-integrated AG(EF goal)
  pass:** blast radius **L** — moving an ~80k-state per-pack BFS into the `validate` path that
  `npm run health` runs on ALL packs materially raises validate-time cost and reintroduces the
  health-load-flake timeout surface (per the health-load-flake note + the 60s per-pack ceiling in
  `no_dead_pocket.test.ts`). It is also largely duplicative — bug_0150 already dynamically certifies
  every shipped pack has no reachable soft-lock pocket with negative controls. Correctly sequenced
  AFTER this cheap reference-integrity rung. **DEFERRED.**
- **vs. World-frame manifest schema + modular cross-region static reachability (assume-guarantee
  composition):** the right open-world lever, but blast radius **L** and multi-cycle (schema + manifest
  + per-region validators + cross-region composition) — not shippable in one clean offline cycle. Its
  OWN precondition is that a region seal intra-frame reference integrity before it can soundly export a
  reachability guarantee at a region edge — which is exactly why `UNRESOLVED_ROOM_REFERENCE` lands
  first as the next rung. **DEFERRED (this move is its precondition).**
- **vs. a per-step oracle/RLVR trajectory verifier or a differential-model monotonicity validator
  (Gaia2/AutoEnv-style, from web research):** high long-term leverage, but the RLVR per-step verifier
  needs a new agent-scoring subsystem (not a small additive validator pass), and the monotonicity
  validator requires running two policies of differing strength — effectively a keyed/model-driven run,
  explicitly out of scope this cycle. **DEFERRED.**

This move wins on all four selection criteria: genuinely open (orchestrator re-verified the gap in
source — no room-ref check exists), tightest frontier fit (cross-region room references are exactly what
an assemble-from-packs open world produces; this is the intra-frame precondition), smallest blast radius
that still delivers (one new error code keyed on a fresh read-walker, ~100% scaffolding reuse, all 10
packs already clean), clean additive/key-free/no-weaken/green-preserving profile.

## VERIFIED anchors (orchestrator opened + confirmed in source at HEAD — re-derive, do not trust line numbers blindly)

- `src/validate/parser_validator.ts:110` — `roomIds = new Set(pack.rooms.map(r => r.id))`.
- `src/validate/parser_validator.ts:131 / :150 / :210` — the ONLY existing `roomIds.has(...)` checks
  (`start_room`, `exit.to`, `npc.room`). No condition-room-id or effect-room-id check exists.
- `src/validate/parser_validator.ts:31` — `err(code, message, where)` helper, defaults to **error**.
- `src/validate/parser_validator.ts:1471` — `collectFlagReads` (the correct read-walker template;
  descends all_of/any_of/none_of over rooms+exits, objects+interactions, win_conditions, ending
  variants, NPC dialogue). MIRROR this.
- `src/validate/parser_validator.ts:1509` — `collectObjectStateReads` (place `collectRoomRefs` right
  after it). Do NOT reuse `objectStateReqs` (all_of-only, would under-count).
- `src/validate/parser_validator.ts:1208` — `allEffects(pack)` enumerates every authored effect (the
  goto/place_object source).
- `src/core/conditions.ts:20-29` — `visited`/`not_visited`/`in_room` are bare `z.string().min(1)`.
- `src/core/conditions.ts:80-82` — a typo'd id silently evaluates false forever (the latent footgun).
- `src/core/effects.ts:29` (`goto`) + `:40` (`place_object: { id, room }`) — the only room-id effects.
- `src/validate/rpg_validator.ts:32` (import) + `:102` (`validateParser` delegation) — RPG covered free.
- `content/broken-fixtures/parser_exit_target_missing.yaml` — the fixture template.
- `tests/unit/parser_validator.test.ts:29` — `VALIDATOR_FIXTURES` registry.
- `tests/regression/parser_validator_negative_corpus.test.ts:65` (`GREEN`), `:67` (`codesOf`,
  error-only), `:85` (`CASES`).
- `tests/regression/parser_inert_object_state.test.ts:50` (`parserCodes`), `:83` (`readdirSync`
  shipped-pack iteration) — the dedicated-test template.
- `traces/bugs/bug_0262_parser_inert_object_state.yaml` — copy the artifact field shape for bug_0277.

## CRITICAL directions / what NOT to get wrong

1. **Use a FRESH `collectFlagReads`-style read walker** that descends `all_of`/`any_of`/`none_of`. Do
   NOT reuse `objectStateReqs` (all_of-only) — a disjunction-guarded room ref would be missed.
2. **Severity MUST be `error`** (the `err()` default) — assert it in test case (b). A dangling room ref
   is a structural defect like a missing exit target, not a transient.
3. **Non-vacuity case (7d) is mandatory** — the corrected-id variant must clear the warning, proving the
   check keys on the genuine dangling ref, not the condition/effect's mere presence.
4. **New code name is exactly `UNRESOLVED_ROOM_REFERENCE`**, ONE code for all four ref kinds. Additive —
   weakens no existing matcher.
5. **Do NOT edit** the schema, engine, effects/conditions runtime, generators, RPG validator, corpus
   seal, scorecard, any pack hash, or `scripts/verify-integrity.ts` (PROTECTED). The metamorphic relabel
   oracles need NO edit (room ids already pass through the relabel bijection — the twin's finding-code
   census stays isomorphic).
6. **No content pack edit.** All 10 shipped parser+RPG packs are already clean (14 refs, 0 dangling) —
   if any pack appears to warn, STOP: that is a real latent bug to surface, not a reason to weaken the
   check (but the scan says none do).

## Files

**DO-NOT-EDIT (protected):**
- `scripts/verify-integrity.ts` — PROTECTED. Never edit. Do not lower any
  MIN_*/SATURATION_FLOOR/GEN_EVAL_CHECK_COUNT/PROTECTED/HASH_PIN, do not relax any matcher. (Test count
  only RISES, strengthening its TEST_COUNT guard.)

**READ-ONLY (confirm anchors, do not change):**
- `src/core/conditions.ts` — `visited`/`not_visited`/`in_room` read predicates.
- `src/core/effects.ts` — `goto` / `place_object.room` effect shapes.
- `src/validate/rpg_validator.ts` — confirms `validateParser` delegation (RPG covered free).
- `content/broken-fixtures/parser_exit_target_missing.yaml` — fixture template.
- `tests/regression/parser_inert_object_state.test.ts` — dedicated-test template.
- `traces/bugs/bug_0262_parser_inert_object_state.yaml` — artifact field-shape template.

**EDIT:**
- `src/validate/parser_validator.ts` — add `collectRoomRefs` (after `collectObjectStateReads`, ~`:1509`),
  collect goto/place_object refs from `allEffects`, emit `UNRESOLVED_ROOM_REFERENCE` near the existing
  `roomIds.has` checks.
- `tests/unit/parser_validator.test.ts` — register the new fixture in `VALIDATOR_FIXTURES` (`:29`).
- `tests/regression/parser_validator_negative_corpus.test.ts` — add the dangling-room-ref CASE(s)
  (`:85`); leave the existing `codesOf`/`CASES` discipline untouched.

**NEW:**
- `content/broken-fixtures/parser_unresolved_room_reference.yaml` — the broken fixture.
- `tests/regression/parser_unresolved_room_reference.test.ts` — the dedicated reference-integrity test
  (cases a-d).
- `traces/bugs/bug_0277_parser_unresolved_room_reference.yaml` — the SoundnessBench-lineage bug artifact.

## Acceptance check (concrete, verifiable)

1. `npx vitest run tests/regression/parser_unresolved_room_reference.test.ts` — GREEN: the condition and
   effect mutants both fire `UNRESOLVED_ROOM_REFERENCE` at severity `error`; the corrected-id variant
   clears it (non-vacuity); all shipped parser + RPG packs emit zero `UNRESOLVED_ROOM_REFERENCE`.
2. `npx vitest run tests/unit/parser_validator.test.ts` — GREEN: the new fixture
   `parser_unresolved_room_reference` validates with code `UNRESOLVED_ROOM_REFERENCE`.
3. `npm run health` — EXIT 0, all 17 packs validate clean with ZERO `UNRESOLVED_ROOM_REFERENCE`
   findings. Verify the EXIT CODE under load per the health-load-flake note
   (`taskset -c 0-3 npm run health` if available), not one fast run.
4. `npm run verify:integrity` — EXIT 0, no GUARD_WEAKENED / VERIFIER_TOUCHED / count regression; test
   count strictly ABOVE the prior 1833.
5. `traces/bugs/bug_0277_parser_unresolved_room_reference.yaml` exists and parses as YAML.

## Hard constraints

- ONE focused, key-free, OFFLINE, deterministic, ADDITIVE/strengthening STRUCTURAL change. No content
  polish, no new curated pack, no keyed run.
- No floor lowered, no matcher relaxed, no PROTECTED/HASH_PIN shrunk, `scripts/verify-integrity.ts`
  untouched.
- No engine/schema/effects/conditions runtime change; no pack hash / scorecard / corpus-seal movement; no
  generator-version bump; no RPG-validator edit.
- Game stays playable; `npm run health` stays green.

## Reward-hacking guardrails (baked in)

- The check is ADDITIVE (a new error code), so it cannot weaken any existing assertion; verify:integrity's
  count/floor guards remain the bar and must stay green.
- The dedicated test proves the check FIRES on a dangling ref (both condition and effect kinds) AND
  non-vacuity (a corrected id clears it) — the same SoundnessBench discipline (arXiv:2412.03154) the
  INERT_OBJECT_STATE / negative corpora use.
- The shipped-packs-stay-green invariant pins that no real pack emits the new code (verified: 14 refs, 0
  dangling), preventing a vacuous always-fire implementation; keying strictly on `roomIds` membership keeps
  it from false-positiving and tempting a weakening of a real pack to silence it.

## Rejected alternatives & deferred to next cycle

- **DEFERRED — validator-integrated forward-reachability (AG(EF goal)) BFS:** promote the test-only
  `support/exhaustive_endings.ts` BFS into a per-pack validator pass. Blast radius L; risks the health
  time budget; largely duplicative of bug_0150's dynamic no-dead-pocket certification. Sequence after this.
- **DEFERRED — World-frame manifest schema + modular cross-region static reachability:** the open-world
  lever; multi-cycle; unblocked once intra-frame reference integrity (THIS move) is sealed.
- **DEFERRED — Goal-2 dev/blind-test loop split:** process/infra; independent track; ships no
  SoundnessBench-sense witness this cycle.
- **DEFERRED — per-step RLVR/Gaia2 trajectory verifier · differential-model monotonicity validator:** new
  subsystem and/or keyed/model-driven; out of scope this offline cycle.
- **NOTED (blind-pass finding, NOT this cycle's move) — alchemists_tower `grip iron key` steadiness check
  is legible (bug_0274) but mechanically INERT:** the cellar unlocks without it, the `steadiness` flag has
  no observed downstream effect, and the action lingers after it is useful. This is the recurring
  vestigial-self-USE skill_check family (see [[affordance-signpost-class]]); a candidate content/quest fix
  for a FUTURE cycle (telegraph-then-room-gate or give the check a real consequence), not this structural
  cycle. Recorded in the playtest report below.

## Mandated blind playtest (this cycle — DONE)

Per the harness directive and the dedicated-pass rotation, the mandated blind pass ran this cycle on
**`content/parser/pack/alchemists_tower.yaml`** (parser, the longest-overdue rank-2 nominee; seeds 7/13/3;
fresh MCP-only general-purpose subagent, no content/src/ui/tests access). Report:
`ai-runs/2026-06-05T07-29-21-465Z/playtest.md`. Result: **STRONG — clarity 5/5, enjoyment 4/5**, all three
declared endings reached (`ending_cured` 40/40 win · `ending_poisoned` death · `ending_betrayal` 30/40),
**mechanically flawless** (zero rejected actions, zero broken state, no loops; reactive prose + lock/key +
score economy all verified), **ZERO mechanical bugs**. Sole §5 note: the `grip iron key` steadiness check
is legible but inert (see "NOTED" above). Recorded for AI_LOOP_STATE.md as "Mandated blind pass ran on
alchemists_tower".
