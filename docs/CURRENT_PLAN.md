# Current plan (rolling)

This is the AFK loop's **living plan** — the hand-off document for the
saturation-triggered ultraplan (see [`docs/afk_loop.md`](./afk_loop.md)). When the
deterministic assessor runs dry (`isSaturated`), an ultraplan cycle re-aims the
project, **overwrites this file** with the synthesis + the single chosen next move,
and a fresh implementation subagent reads _only_ this file (plus the files it names)
to do the work.

---

# Ultraplan re-aim cycle #12 (HEAD = bug_0261; next free id = bug_0262)

## Synthesis

A bounded ultraplan ran this cycle — **4 repo reviewers** (engine/determinism ·
content/authoring+generators · verification/benchmark · loop/strategy) **+ 2 web
researchers** (frontier IF/agentic benchmarks · verification-at-scale + reward-hacking)
**→ 1 synthesis** (7 agents, 244 tool-uses, ~414k subagent tokens), each grounded against
the live repo at HEAD = bug_0261, then the chosen move was **independently re-verified by
the orchestrator against source** before being committed here.

All six reviewers converged on the **object-state local-proof family** as the highest-value
open structural lever. Two reviewer top-picks were already-CLOSED traps and were rejected by
the synthesis: the `__proto__` canonicalize collision (bug_0247) and the convergent
skill-check soundness lock (bug_0252) — both artifacts verified on disk. The static-reachability
family (IMPOSSIBLE_GATE / ITEM_REQUIRED_UNOBTAINABLE / IMPOSSIBLE_QUEST_STAGE / IMPOSSIBLE_OBJECT_STATE)
is condition-kind-COMPLETE on the **feasibility (safety)** edge, but object-state is sealed only
on that one edge.

The chosen move is the smallest, highest-confidence, tightest-fit play that advances the
open-world / verification-at-scale ladder: **add `INERT_OBJECT_STATE` — the LIVENESS dual of
bug_0253's IMPOSSIBLE_OBJECT_STATE.** It is the exact same shape bug_0106 used to add `INERT_FLAG`
(the liveness dual of the flag-feasibility checks), ported to object-state. The assume-guarantee
composition literature (each local boundary must be sealed on BOTH safety _and_ liveness before
it can be a sound exported guarantee predicate at a future world-frame region edge) makes sealing
the liveness edge of object-state a **precondition** for the deferred world-frame manifest — not a
detour. It is the last condition-kind with a feasibility witness but no liveness witness in the
parser validator (flags have INERT_FLAG; object-state has IMPOSSIBLE_OBJECT_STATE but no inert dual).

**Why it is provably green-preserving (orchestrator-verified):** `grep -rn
"open_object\|set_object_locked" content/` returns ONLY `content/engine_contract.yaml` lines 63-64
(the effect-NAME registry, not a pack) — **ZERO shipped packs (parser or RPG) author an `open_object`
or `set_object_locked` effect**. The check keys the write-set strictly on AUTHORED effects, so no
pack can produce the warning today: pure forward-hardening. (`content/parser/pack/alchemists_tower.yaml`
only _reads_ `is_open`/`is_unlocked` on `cellar_door`/`strongbox` via the built-in OPEN/UNLOCK verbs —
it authors no such effect, so the write-keyed INERT check never touches it.)

## Chosen move — WHAT (numbered, concrete)

**Goal:** the parser validator (and via delegation the RPG validator) emits a NEW **warning**
`INERT_OBJECT_STATE` when an AUTHORED `open_object` / `set_object_locked(locked: false)` effect targets
an object whose `is_open` / `is_unlocked` state is NEVER read by any condition pack-wide — dead
bookkeeping, the object-state analogue of `INERT_FLAG`. Zero shipped packs regress (none author these
effects); two synthetic mutants prove the warning fires; one read-added mutant proves non-vacuity.

1. **Add a complete read-set walker `collectObjectStateReads(pack)`** directly after `collectFlagReads`
   (`src/validate/parser_validator.ts`, the helper at ~line 1356). Return
   `{ open: Set<string>; unlocked: Set<string> }`. Mirror `collectFlagReads` EXACTLY — the same `walkAll`
   over rooms+variant-`when`s+exit conditions, objects+variant-`when`s+interaction conditions,
   win_conditions, and NPC dialogue nodes+variant-`when`s+topic conditions — but collect `is_open`→`open`
   and `is_unlocked`→`unlocked`, **descending `all_of`/`any_of`/`none_of`** (a read inside ANY connective,
   even a disjunction, counts as consumed). **Do NOT reuse the existing `objectStateReqs` helper**
   (`src/validate/parser_validator.ts` ~line 1339): it deliberately descends only `all_of` for the
   conservative AND-context feasibility check and would UNDER-count reads, producing false-positive INERT
   warnings on disjunction-guarded reads. (`collectFlagReads` is the correct template — it descends all
   three connectives.)

2. **Build the AUTHORED-WRITE sets** in the validator body, immediately AFTER the INERT_FLAG block
   (`src/validate/parser_validator.ts` ~lines 797-809). Iterate `allEffects(pack)` (the same enumeration
   INERT_FLAG uses at ~line 796 — it already covers room `on_enter`, interaction `effects`, `unlock_effects`,
   `take_effects`, and dialogue-node `effects`):
   - `writtenOpen` = the id from every `open_object` effect.
   - `writtenUnlocked` = the `id` from every `set_object_locked` effect whose `locked === false`.
   - **CRITICAL SOUNDNESS BOUNDARY:** key the write-set ONLY on these authored effects. Do **NOT** fold in
     the over-approximating `openableObjects` / `unlockableObjects` sets (`src/validate/parser_validator.ts`
     ~lines 348-359), which include the built-in OPEN/UNLOCK verb settability (`openable===true`, keyed
     unlock) — folding those in would false-warn on every openable scenery object. This mirrors INERT_FLAG,
     which keys on the authored `set_flag`/`flags_init` write, never on a hypothetical reachability source.
     This is the precise dual of the bug_0253 subtlety (feasibility OVER-approximates settability; liveness
     keys on the AUTHORED write).

3. **Emit the warning.** For each id in `writtenOpen` not in `reads.open`, push
   `warn("INERT_OBJECT_STATE", <message naming is_open>, ["object:" + id])`; symmetrically for each id in
   `writtenUnlocked` not in `reads.unlocked` with an `is_unlocked`-worded message. ONE code
   `INERT_OBJECT_STATE` (the open-vs-unlocked distinction lives in the message string only). Use the
   3-arg `warn(code, msg, breadcrumbs)` helper exactly as the INERT_FLAG block does
   (`src/validate/parser_validator.ts` ~lines 799-806). **Severity MUST be `warning`, never `error`** — an
   inert open/unlock is a no-op, not a soft-lock (the INERT_FLAG contract). Suggested message shape (match
   the INERT_FLAG wording register): `` `object "${id}" is opened by an effect but no condition ever reads
   its open state — a no-op write (dead bookkeeping). Gate something on \`is_open: ${id}\`, or remove the
   effect.` `` and the `is_unlocked` twin.

4. **Add the dedicated regression test** `tests/regression/parser_inert_object_state.test.ts`, modelled on
   `tests/regression/parser_inert_flag.test.ts` (reuse its `parserCodes(src)` / `rpgCodes(src)` helpers and
   the minimal-YAML-`pack(...)` builder idiom; objects need an `objects:` block with `openable: true` and/or
   `locked: true` + `key_id` as appropriate so the mutant effect is well-typed). Lock these cases:
   - **(a) Invariant:** ALL shipped parser + RPG packs produce ZERO `INERT_OBJECT_STATE` findings and stay
     green (they author no `open_object`/`set_object_locked` effects — a structural invariant, mirror
     `parser_inert_flag.test.ts` case (1) which auto-discovers + iterates the shipped packs).
   - **(b) Positive (open):** take a minimal/`generateParserPack(0)` GREEN pack, add an `open_object: <id>`
     effect (e.g. a room `on_enter` or an interaction `effects`) with NO `is_open` gate anywhere → assert
     the codes include `INERT_OBJECT_STATE` AND that finding's `severity === "warning"`.
   - **(c) Positive (unlock):** add a `set_object_locked: { id: <id>, locked: false }` effect with NO
     `is_unlocked` gate → assert `INERT_OBJECT_STATE` fires.
   - **(d) Non-vacuity (mandatory):** to the case-(b) mutant ALSO add an exit/interaction/win condition
     `{ is_open: <id> }` → assert `INERT_OBJECT_STATE` is now ABSENT. This proves the warning keys on the
     genuine write/read SLACK, not the mere presence of the effect (without this the check could be a
     tautology).
   - **(e) Negative (built-in-verb shape):** a pack with an `is_open`/`is_unlocked` READ on an object that
     no authored effect writes (the `alchemists_tower` shape) does NOT warn — proving the dual stays on the
     write side and never collides with the bug_0253 feasibility check.

5. **(Optional, thin anchor)** the corpus `tests/regression/parser_validator_negative_corpus.test.ts`'s
   `codesOf` filters `severity === "error"` (line ~69), so a warning-severity finding will NOT appear there.
   Do NOT alter the existing error-only `codesOf` or `CASES` array. If you want a second witness location,
   add a small parallel `warningCodesOf` (filtering `severity === "warning"`) + ONE open_object-without-reader
   row asserting `INERT_OBJECT_STATE` fires and is ABSENT on the GREEN base. Otherwise SKIP this step — the
   dedicated file in step 4 carries the full discipline (the `parser_inert_flag.test.ts` precedent keeps its
   teeth in its own file, not the corpus).

6. **Create the SoundnessBench artifact** `traces/bugs/bug_0262_parser_inert_object_state.yaml` (mirror the
   field shape of `traces/bugs/bug_0253_parser_impossible_object_state.yaml` — read it for the exact fields:
   id, title, class, summary, the gap, the fix, the soundness argument, and the regression-lock filename).
   State the soundness argument: this seals the object-state local boundary on BOTH edges (feasibility
   bug_0253 + liveness bug_0262), a precondition for a future sound exported guarantee predicate at a
   world-frame region edge. Reference arXiv:2412.03154 (SoundnessBench) consistent with the negative-corpus
   file header.

## WHY this, not the runner-ups

- **vs. WIN_FIRES_AT_START object-state stability (the SAFETY sibling):** also forward-hardening, but it
  touches the live `winStaysTrueForever` monotonicity proof (`src/validate/parser_validator.ts` ~lines
  1060-1091, the `stable = false` bail on `is_open`/`is_unlocked` at ~line 1087) — a sharper
  soundness-regression surface. The liveness dual is smaller and provably green-preserving; the
  monotone-progress argument says land liveness first. **DEFERRED to next cycle.**
- **vs. a general no-reachable-dead-end / AG(EF goal) reachability oracle (the web-research headline):** the
  strongest LONG-TERM move, but its substrate (`support/exhaustive_endings.ts`) is a TEST-ONLY BFS helper
  NOT wired into any validator; promoting it to a per-pack validator-integrated forward-reachability proof is
  medium-to-large blast radius, must deconflict with the closed SOFTLOCK_QUEST_ITEM / one-way arcs and the
  existing dead-pocket test — scope-collapse risk, too big for one clean cycle. **DEFERRED.**
- **vs. World-frame manifest + modular cross-region reachability (3 reviewers' architectural top pick):** the
  right open-world lever, but explicitly PREMATURE until BOTH local object-state edges are sealed; this move
  seals one of the two remaining edges and is its precondition. Net-new schema + validator entry point.
  **DEFERRED.**
- **vs. the Goal-2 dev/blind-test loop split:** a process/infra lever that advances the benchmark path but
  not the verification-at-scale soundness ladder, and ships no SoundnessBench-sense witness. Lower structural
  value this cycle. **DEFERRED (independent track).**
- **vs. `__proto__` canonicalize / convergent skill-check (two reviewers' HIGH picks):** BOTH ALREADY CLOSED
  (bug_0247, bug_0252 — artifacts verified on disk). Re-proposing is forbidden.

This move wins on all four selection criteria: genuinely open (verified the liveness gap in source —
feasibility witness exists, liveness witness does not), tightest frontier fit (seals the second of two local
object-state edges the modular pivot composes on), smallest blast radius that still delivers (one new warning
keyed on authored writes, ~100% scaffolding reuse), clean additive/key-free/no-weaken/green-preserving profile.

## VERIFIED anchors (orchestrator opened + confirmed in source at HEAD — re-derive, do not trust line numbers blindly)

- `src/validate/parser_validator.ts` ~line 791-809 — the INERT_FLAG block: `collectFlagReads(pack)`, the
  `writtenFlags` set built from `flags_init` + `allEffects(pack)` `set_flag` effects, and the
  `warn("INERT_FLAG", …, ["flag:"+f])` emit. THIS is the structural template to mirror.
- `src/validate/parser_validator.ts` ~line 1356 — `collectFlagReads` walks `has_flag`/`not_flag` descending
  `all_of`/`any_of`/`none_of` over rooms (variant `when` + exits), objects (variant `when` + interactions),
  win_conditions, and NPC dialogue (node variant `when` + topics). The correct read-walker template (descends
  all three connectives).
- `src/validate/parser_validator.ts` ~line 1339 — `objectStateReqs` walks `is_open`/`is_unlocked` but descends
  ONLY `all_of` (conservative AND-context for the feasibility check). Do NOT reuse it for the read-set.
- `src/validate/parser_validator.ts` ~lines 348-359 — `openableObjects`/`unlockableObjects` OVER-approximating
  settable sets (fold in built-in-verb settability). Do NOT key the write-set on these.
- `src/validate/parser_validator.ts` ~lines 391-414 — the existing IMPOSSIBLE_OBJECT_STATE feasibility branch
  (bug_0253), this move's safety counterpart.
- `src/validate/parser_validator.ts` ~line 1093 — `allEffects(pack)` enumerates room `on_enter`, interaction
  `effects`, `unlock_effects`, `take_effects`, dialogue-node `effects` — the complete authored-write source.
- `src/core/effects.ts` — `open_object` (sets `open:true`) / `set_object_locked` (sets `locked` to the given
  boolean) effect shapes.
- `src/core/conditions.ts` — `is_open` ⇒ `objectState[id].open===true`, `is_unlocked` ⇒
  `objectState[id].locked===false` (the read predicates).
- `tests/regression/parser_inert_flag.test.ts` — the test template (`parserCodes`/`rpgCodes` helpers, minimal
  `pack(...)` YAML builder, shipped-packs-stay-green invariant via auto-discovery, positive + not-flagged-reader
  + disjunction cases). `validateRpg` delegates to the parser body, so the new check covers RPG packs too.
- `tests/regression/parser_validator_negative_corpus.test.ts` ~line 69 — `codesOf` filters
  `severity === "error"` (so the warning needs a parallel filter if step 5 is taken).
- `content/engine_contract.yaml` lines 63-64 — `open_object`/`set_object_locked` appear ONLY as the effect-name
  registry; **no content pack authors these effects** (green-preservation proof: `grep -rn
  "open_object\|set_object_locked" content/` hits only this file).
- `content/parser/pack/alchemists_tower.yaml` — the only pack that READS `is_open`/`is_unlocked`; it authors no
  `open_object`/`set_object_locked` effect (opens/unlocks via built-in verbs), so the write-keyed INERT check
  never warns on it (the case-(e) negative).
- `traces/bugs/bug_0253_parser_impossible_object_state.yaml` — the feasibility sibling; copy its artifact field
  shape for bug_0262.

## CRITICAL directions / what NOT to get wrong

1. **Key the write-set on AUTHORED effects ONLY** (`allEffects` `open_object` / `set_object_locked(locked:false)`).
   Do NOT fold in `openableObjects`/`unlockableObjects` (the built-in-verb over-approximation) or every openable
   scenery object false-warns. This is the load-bearing soundness boundary.
2. **Use a FRESH `collectFlagReads`-style read walker** that descends `all_of`/`any_of`/`none_of`. Do NOT reuse
   `objectStateReqs` (all_of-only) — a disjunction-guarded read would be miscounted as inert (false positive).
3. **Severity MUST be `warning`** — assert it in the test. An error here would be unsound (an inert write is a
   no-op, not a soft-lock) and could falsely red a future legitimate pack.
4. **Non-vacuity case (4d) is mandatory** — the read-added variant must clear the warning, proving the check
   keys on genuine write/read slack, not the effect's mere presence.
5. **New error CODE name is exactly `INERT_OBJECT_STATE`** (one code, open-vs-unlocked distinguished in the
   message). Adding a new code is additive and weakens no matcher.
6. **Do NOT edit** the schema, engine, effects/conditions runtime, generators, corpus seal, scorecard, any pack
   hash, or `scripts/verify-integrity.ts` (PROTECTED). The validator is exercised as shipped; the test builds
   packs in-memory.

## Files

**DO-NOT-EDIT (protected):**
- `scripts/verify-integrity.ts` — PROTECTED. Never edit. Do not lower any
  MIN_*/SATURATION_FLOOR/GEN_EVAL_CHECK_COUNT/PROTECTED/HASH_PIN, do not relax any matcher.

**READ-ONLY (confirm anchors, do not change):**
- `src/core/conditions.ts` — `is_open`/`is_unlocked` read predicates.
- `src/core/effects.ts` — `open_object` / `set_object_locked` effect shapes.
- `tests/regression/parser_inert_flag.test.ts` — the test template.
- `tests/regression/cyoa_inert_flag.test.ts` — the original CYOA INERT_FLAG sibling (secondary reference).
- `content/parser/pack/alchemists_tower.yaml` — the only object-state-reading pack; confirm it stays clean.
- `content/engine_contract.yaml` — confirms no pack authors `open_object`/`set_object_locked` (lines 63-64).
- `traces/bugs/bug_0253_parser_impossible_object_state.yaml` — copy the artifact field shape.

**EDIT:**
- `src/validate/parser_validator.ts` — add `collectObjectStateReads` (near `collectFlagReads`, ~line 1356),
  build `writtenOpen`/`writtenUnlocked` from `allEffects` (after the INERT_FLAG block, ~lines 797-809), emit
  the `INERT_OBJECT_STATE` warning.
- `tests/regression/parser_validator_negative_corpus.test.ts` — ONLY if step 5 is taken (optional warning anchor;
  leave the error-only `codesOf`/`CASES` untouched).

**NEW:**
- `tests/regression/parser_inert_object_state.test.ts` — the dedicated liveness test (cases a-e).
- `traces/bugs/bug_0262_parser_inert_object_state.yaml` — the SoundnessBench-lineage bug artifact.

## Acceptance check (concrete, verifiable)

1. `npx vitest run tests/regression/parser_inert_object_state.test.ts` — GREEN: the open_object-without-reader
   and set_object_locked(false)-without-reader mutants both fire `INERT_OBJECT_STATE` at severity `warning`; the
   read-added variant clears it (non-vacuity); the built-in-verb (alchemists_tower) shape does NOT warn; all
   shipped parser + RPG packs emit zero `INERT_OBJECT_STATE`.
2. `npm run health` — EXIT 0, all 17 packs validate clean with ZERO `INERT_OBJECT_STATE` warnings. Verify the
   EXIT CODE under load per the health-load-flake note (`taskset -c 0-3 npm run health` if available), not one
   fast run.
3. `npm run verify:integrity` — EXIT 0, no GUARD_WEAKENED / VERIFIER_TOUCHED / count regression; test count
   strictly ABOVE the prior 1824.
4. `traces/bugs/bug_0262_parser_inert_object_state.yaml` exists and parses as YAML.
5. **Non-vacuity teeth** (already encoded as test case 4d): the read-added mutant clears the warning, proving
   the check keys on the actual write/read slack, not the mere presence of an effect.

## Hard constraints

- ONE focused, key-free, OFFLINE, deterministic, ADDITIVE/strengthening STRUCTURAL change. No content polish, no
  new curated pack, no keyed run.
- No floor lowered, no matcher relaxed, no PROTECTED/HASH_PIN shrunk, `scripts/verify-integrity.ts` untouched.
- No engine/schema/effects/conditions runtime change; no pack hash / scorecard / corpus-seal movement; no
  generator-version bump.
- Game stays playable; `npm run health` stays green.

## Reward-hacking guardrails (baked in)

- The check is ADDITIVE (a new warning code), so it cannot weaken any existing assertion; verify:integrity's
  count/floor guards remain the bar and must stay green.
- The dedicated test proves the LIVENESS direction (an inert authored write MUST warn) AND non-vacuity (a read
  clears it) — the same SoundnessBench discipline (arXiv:2412.03154) INERT_FLAG and the negative corpora use.
- The shipped-packs-stay-green invariant pins that no real pack emits the new code, preventing a vacuous
  always-fire implementation; the soundness boundary (authored writes only) keeps it from false-positiving and
  tempting a weakening of a real pack to silence it.

## Rejected alternatives & deferred to next cycle

- **DEFERRED — WIN_FIRES_AT_START object-state stability (the safety sibling):** extend `winStaysTrueForever`
  (`src/validate/parser_validator.ts` ~lines 1060-1091, the `stable=false` bail at ~line 1087) to mark a win
  UNSTABLE when it gates on `is_open`/`is_unlocked` AND a close/relock (`set_object_locked locked:true`) effect
  exists. Land next cycle now the liveness edge is sealed.
- **DEFERRED — UNRESOLVED_ROOM_REFERENCE for `in_room`/`visited` (bug_0258):** a small reference-integrity check,
  separable.
- **DEFERRED — general no-reachable-dead-end (AG(EF goal)) reachability oracle:** the headline frontier move,
  but requires promoting the test-only `support/exhaustive_endings.ts` BFS into a validator-integrated
  forward-reachability pass — medium/large, sequence after both local object-state edges are sealed.
- **DEFERRED — World-frame manifest schema + modular cross-region static reachability (assume-guarantee
  composition):** unblocked only after object-state is sealed on both edges; net-new schema + validator entry
  point.
- **DEFERRED — Goal-2 dev/blind-test loop split:** extract persona testing into a separate target + a
  structured-feedback bucket schema/aggregator; process/infra, independent track.
- **REJECTED — `__proto__` canonicalize fix, convergent skill-check hardening:** ALREADY CLOSED (bug_0247,
  bug_0252). Do not re-attempt.
- **REJECTED — multi-detector LLM-judge guard, observation_difficulty, post-cutoff timestamping, keyed real-model
  run:** key-gated and/or PROTECTED-touching and/or out-of-scope this cycle.

## Mandated blind playtest (this cycle)

Per the harness directive and the dedicated-pass rotation, the orchestrator runs the mandated blind pass this
cycle on **`content/parser/pack/friars_postern.yaml`** (parser; expect 0/3 endings reached on a single honest
run, 4 unvisited, 0 warnings per `docs/blind_playtest_protocol.md`). Report at
`ai-runs/2026-06-05T00-19-47-051Z/playtest.md`. NOTE for that pass: friars_postern's optional `heft` nerve beat
(bug_0245 heft telegraph) is gated only by `not_flag: weighed_the_iron` (NOT room-gated) — check whether it is
also room-gateable, since the telegraph-then-room-gate pair (bug_0241 + bug_0258/0261) is now the standard
resolution for the recurring "vestigial self-USE skill_check" finding-family. Record "Mandated blind pass ran on
friars_postern" in the AI_LOOP_STATE.md cycle entry (newest-first).
