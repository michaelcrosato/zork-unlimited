# Current plan (rolling)

This is the AFK loop's **living plan** — the hand-off document for the
saturation-triggered ultraplan (see [`docs/afk_loop.md`](./afk_loop.md)). When the
deterministic assessor runs dry (`isSaturated`), an ultraplan cycle re-aims the
project, **overwrites this file** with the synthesis + the single chosen next move,
and a fresh implementation subagent reads _only_ this file (plus the files it names)
to do the work.

---

# Ultraplan re-aim cycle #11 (HEAD = bug_0251; bug_0252 artifact landed)

## Synthesis

A bounded ultraplan ran this cycle — **4 repo reviewers** (engine/determinism ·
content/authoring+generators · verification/benchmark · loop/strategy) **+ 2 web
researchers** (frontier IF/agentic benchmarks · verification-at-scale + reward-hacking)
**→ 1 synthesis** (7 agents, 218 tool-uses), each grounded against the live repo at
HEAD≈bug_0251/0252, then the chosen move was **independently re-verified by the
orchestrator against source** before being committed here.

Six reviewers converged on three families: (a) net-new open-world subsystems (world-frame
manifest + modular cross-region reachability, progress-measure oracle), (b) generator/
authoring breadth, (c) finishing the IMPOSSIBLE/UNOBTAINABLE static-reachability family.
Two reviewers' top picks (`__proto__` canonicalize collision; convergent skill-check
soundness) are ALREADY CLOSED at HEAD — bug_0247 sealed the `__proto__` key collision and
bug_0252 sealed convergent skill-check single-rules-BFS soundness; re-proposing either is a
trap (verified: `traces/bugs/bug_0247_canonicalize_proto_key_collision.yaml` and
`traces/bugs/bug_0252_cyoa_convergent_skill_check_unlocked.yaml` both exist).

The chosen move is the smallest, highest-confidence, tightest-fit play: **backfill the
parser validator's static-feasibility loop to cover `is_open` / `is_unlocked` object-state
conditions, emitting a new `IMPOSSIBLE_OBJECT_STATE` error.** It is the EXACT same shape
bug_0244 used to add `IMPOSSIBLE_QUEST_STAGE` (and bug_0218 for the earlier corpus).
Object-state (`is_open` once a container is opened; `is_unlocked` once a lock is sprung) is
a RUNTIME-readable per-object progress boundary — structurally the same kind of local-region
progress marker as quest_stage — so sealing its reachability now is a direct precondition for
lifting intra-pack proofs to world scale (the open-world frontier's #1 named risk:
verification-at-scale). It is the last major condition-kind with NO rejection-direction
witness in the parser feasibility loop: flags have IMPOSSIBLE_GATE, items have
ITEM_REQUIRED_UNOBTAINABLE, quest-stages have IMPOSSIBLE_QUEST_STAGE, but `is_open`/
`is_unlocked` gates are silently skipped by `checkConds` (verified: `src/validate/parser_validator.ts`
lines 329-358 have flag/item/questStage branches and NO object-state branch). Blast radius is
small, key-free, offline, deterministic, purely additive, and it extends an already-trusted
check family rather than introducing a net-new subsystem.

## Chosen move — WHAT (numbered, concrete)

**Goal:** the parser validator emits a NEW error `IMPOSSIBLE_OBJECT_STATE` when a reachable
exit / interaction / win condition requires an `is_open` or `is_unlocked` object-state that NO
path (authored effect OR built-in verb) can ever establish. Zero shipped packs regress (all
today are settable); two synthetic negative-corpus mutants prove the rejection direction.

1. **Add the helper `objectStateReqs(conds)`** near the existing `questStageReqs` (in
   `src/validate/parser_validator.ts`, around lines 1269-1277). Mirror `flagReqs`/`itemReqs`/
   `questStageReqs` EXACTLY: walk top-level conditions and descend ONLY `all_of` (the
   conservative AND-context — do NOT descend `any_of`/`none_of`, guaranteeing zero false
   positives). Return a list of tagged atoms distinguishing the two predicate kinds, e.g.
   `{ kind: "open" | "unlocked"; id: string }[]`:
   ```
   function objectStateReqs(conds: Condition[]): { kind: "open" | "unlocked"; id: string }[] {
     const out: { kind: "open" | "unlocked"; id: string }[] = [];
     const walk = (c: Condition): void => {
       if ("is_open" in c) out.push({ kind: "open", id: c.is_open });
       else if ("is_unlocked" in c) out.push({ kind: "unlocked", id: c.is_unlocked });
       else if ("all_of" in c) c.all_of.forEach(walk);
     };
     conds.forEach(walk);
     return out;
   }
   ```

2. **Build two SOUND (over-approximating) settability sets** in the validator body, alongside
   the existing `settable` (flags) and `settableQuestStages` sets (around
   `src/validate/parser_validator.ts` lines 312-326). CRITICAL — settability for object-state has
   TWO sources, because the engine's built-in OPEN and UNLOCK verbs produce the effects themselves
   (verified `src/parser/legal_actions.ts` lines 135-166):
   - **`openableObjects` (is_open settable set):** an object id is open-settable if EITHER (a) some
     `open_object: id` effect exists anywhere in the pack (`allEffects(pack)`), OR (b) the object is
     defined and `openable === true` (the built-in OPEN verb emits `{ open_object: id }` for any
     present, unlocked, openable object — `src/parser/legal_actions.ts` lines 137-145). Over-approximate
     deliberately: do NOT also require the object be reachable/openable-in-practice — that would risk
     false positives. The only impossible case we flag is a genuinely unsettable one.
   - **`unlockableObjects` (is_unlocked settable set):** an object id is unlock-settable if EITHER (a)
     some `set_object_locked: { id, locked: false }` effect exists anywhere in the pack, OR (b) the
     object is defined, statically `locked === true`, has a defined `key_id`, AND that key is in the
     `obtainable` set (the built-in UNLOCK verb emits `{ set_object_locked: { id, locked: false } }` —
     `src/parser/legal_actions.ts` lines 147-166; it requires the player hold the matching key). NOTE:
     `obtainable` is already computed earlier in the function (`computeObtainable`, used by the item/key
     checks at `src/validate/parser_validator.ts` lines 309,364) — reuse it; do not recompute.
   - Iterate `allEffects(pack)` once (same loop style as the `settable`/`settableQuestStages` loops) to
     collect the effect-based ids; derive the schema-based ids from `objById` / `pack.objects`.

3. **Add the feasibility branch inside `checkConds`** (after the `questStageReqs` block,
   `src/validate/parser_validator.ts` lines 346-357). For each `objectStateReqs(conds)` atom:
   - if `kind === "open"` and `!openableObjects.has(id)` → push `err("IMPOSSIBLE_OBJECT_STATE",
     ` + "`condition requires object \"${id}\" to be open, but no effect or openable verb can ever open it.`" + `, where)`.
   - if `kind === "unlocked"` and `!unlockableObjects.has(id)` → push `err("IMPOSSIBLE_OBJECT_STATE",
     ` + "`condition requires object \"${id}\" to be unlocked, but no effect or keyed unlock can ever unlock it.`" + `, where)`.
   Both messages MUST also fire when the id is not a defined object at all (an undefined id can be in
   neither settable set, so the existing `!...has(id)` test already covers "object not defined" — confirm
   by NOT pre-checking `objById.has(id)`; let the settable-set miss carry it). The `where` breadcrumb is
   already threaded by the three existing call sites (exits line 361, interactions line 374, win_conditions
   line 386).

4. **Do NOT touch** the `winStaysTrueForever` monotonicity proof (`src/validate/parser_validator.ts`
   lines 1004-1031), which currently bails to `stable = false` on `is_open`/`is_unlocked` (line 1031
   comment "not analysed"). That conservative bail is already SOUND (it over-approximates instability,
   never claiming a fragile win is stable). Extending it is the explicitly-deferred runner-up below — out
   of scope this cycle to keep blast radius minimal.

5. **Add TWO cases to the parser negative corpus** (`tests/regression/parser_validator_negative_corpus.test.ts`,
   append to the `CASES` array, following the existing single-defect copy-mutate discipline on the
   `generateParserPack(0)` GREEN base):
   - **Case A (is_open impossible):** clone GREEN, take a non-openable defined object (e.g. `hazard` or any
     object with `openable` falsy — VERIFY in the base pack which objects exist by reading the generator
     output; `coffer`/`strongbox`/`hazard`/`lesser_key` are present per the corpus file's own `objById(p,...)`
     calls), set its `openable = false` to be safe, and add a NEW gate `{ is_open: <that id> }` to an exit or
     win_condition that has no `open_object` effect for it. Assert `codesOf(mutant).includes("IMPOSSIBLE_OBJECT_STATE")`.
   - **Case B (is_unlocked impossible):** clone GREEN, add a gate `{ is_unlocked: <id> }` referencing an object
     that is NOT statically locked-with-obtainable-key AND has no `set_object_locked(locked:false)` effect —
     simplest: reference a brand-new undefined id like `phantom_vault`, OR take an existing un-locked object and
     gate on its `is_unlocked`. Assert `codesOf(mutant).includes("IMPOSSIBLE_OBJECT_STATE")`.
   - **GREEN differential anchor:** assert `codesOf(GREEN)` does NOT include `IMPOSSIBLE_OBJECT_STATE` (the base
     is clean). Use `.includes(...)` not exact-set-equality, exactly as the existing KEY_UNOBTAINABLE case
     documents (a single object-state defect may strand a companion code).

6. **Create the bug artifact** `traces/bugs/bug_0253_parser_impossible_object_state.yaml` in the SoundnessBench
   lineage (mirror the structure of `traces/bugs/bug_0247_canonicalize_proto_key_collision.yaml` or a recent
   `bug_025x` artifact — read one for the exact field shape: id, title, class, summary, the gap, the fix, the
   soundness argument citing the built-in-verb settability subtlety, and the regression-lock filename). Reference
   arXiv:2412.03154 (SoundnessBench, the missing-rejection-direction-witness motivation) consistent with the
   negative-corpus file header.

## WHY this, not the runner-ups

- **vs. World-frame manifest + modular cross-region reachability (3 reviewers' top pick):** the right
  architectural lever for open-world, but a NET-NEW subsystem (new schema, new validator entry point, cross-pack
  link DSL) — medium blast radius, and it composes LOCAL per-region reachability proofs. Object-state is one of
  those local proofs (a per-object progress boundary exactly like quest_stage). Sealing object-state feasibility
  is a PRECONDITION for that composition; shipping the manifest before the local proofs are complete builds on an
  incomplete base. Do the small sound primitive first; defer the subsystem.
- **vs. `__proto__` canonicalize collision / convergent skill-check (two reviewers' HIGH picks):** BOTH ALREADY
  CLOSED (bug_0247, bug_0252 — artifacts verified on disk). Re-proposing is a regression of attention; explicitly
  forbidden.
- **vs. generator condition/spatial-depth breadth (parser dead-ends, CYOA item gates):** valid additive deepening
  but it widens the EVAL distribution, not the VERIFICATION soundness floor. The frontier risk is
  verification-at-scale, not eval breadth this cycle. Lower strategic fit.
- **vs. observation_difficulty / post-cutoff timestamping (web reviewers):** benchmark-credibility moves, but
  observation_difficulty touches the agent-facing API surface across all 3 modes (broader blast radius), and
  post-cutoff timestamping is entangled with the owner-key-gated keyed run (out of scope). Neither is a
  sound-additive verification primitive.
- **vs. multi-detector verifier guard (LLM-judge ensemble):** requires an LLM judge (key-gated) and edits the AFK
  loop / would touch the PROTECTED `scripts/verify-integrity.ts`. Out of scope and forbidden.

This move wins on all four selection criteria: genuinely open (verified the gap in source), tightest frontier fit
(local progress-boundary soundness the modular pivot composes on), smallest blast radius that still delivers (one
new error in an existing trusted loop), clean additive/key-free/no-weaken profile.

## VERIFIED anchors (opened and confirmed in source at HEAD — re-derive, do not trust line numbers blindly)

- `src/core/conditions.ts` lines 31-32,55-56,73-74 — `is_open`/`is_unlocked` are first-class conditions; `is_open`
  ⇒ `state.objectState[id]?.open === true`, `is_unlocked` ⇒ `state.objectState[id]?.locked === false`. Both
  DEFAULT FALSE when no objectState entry exists (objectState inits to `{}`, `src/core/state.ts` line 60).
- `src/core/effects.ts` lines 33,202-207 (`open_object` ⇒ sets `open:true`) and 34-38,208-223 (`set_object_locked`
  ⇒ sets `locked` to the given boolean). These are the authored settability sources.
- `src/parser/legal_actions.ts` lines 135-145 — built-in OPEN verb emits `{ open_object: target }` for any present,
  unlocked, `openable===true` object. lines 147-166 — built-in UNLOCK emits `{ set_object_locked: { id, locked: false } }`
  for a present, locked object whose `key_id` matches a held key. THIS is why settability has a non-effect path; the
  check MUST account for it or it false-positives. (Orchestrator-confirmed by reading both blocks.)
- `src/validate/parser_validator.ts` lines 312-326 — existing `settable` (flags) and `settableQuestStages` build
  loops over `allEffects(pack)` (the pattern to mirror). lines 328-358 — `checkConds` has flag (IMPOSSIBLE_GATE),
  item (ITEM_REQUIRED_UNOBTAINABLE), questStage (IMPOSSIBLE_QUEST_STAGE) branches and NO object-state branch (the
  gap). line 309 — `obtainable` already computed (reuse for the keyed-unlock test). line 111 — `objById` map
  available. lines 1269-1277 — `questStageReqs` helper (the template for `objectStateReqs`).
  (Orchestrator-confirmed: lines 329-358 carry exactly the three branches and no object-state branch.)
- `src/validate/parser_validator.ts` line 1031 — `winStaysTrueForever` already bails `stable=false` on
  `is_open`/`is_unlocked` (sound; leave as-is).
- `src/parser/schema.ts` lines 266-268 — `openable` / `locked` / `key_id` object fields exist.
- `tests/regression/parser_validator_negative_corpus.test.ts` lines 60-75 — GREEN base = `generateParserPack(0)`,
  `codesOf` filters error-severity codes, `objById(p,id)` helper, single-defect `CASES` discipline with
  `.includes(...)` assertions. Objects available to mutate: `coffer`, `strongbox`, `hazard`, `lesser_key`,
  `iron_key` chain.
- `content/parser/pack/alchemists_tower.yaml` lines 157,316-318,421 — the ONLY shipped pack gating on object-state;
  gates `is_unlocked: cellar_door` (exit) and `is_open`/`is_unlocked: strongbox` (interaction). VERIFIED both
  objects are `locked:true` + `key_id: iron_key` with an obtainable key, so the built-in-UNLOCK settability path
  keeps them GREEN. (The strongbox `is_open` variant `when`s are variant prose, NOT in checkConds scope — only
  exits/interactions/win_conditions are checked.)
- `traces/bugs/bug_0247_canonicalize_proto_key_collision.yaml` and
  `traces/bugs/bug_0252_cyoa_convergent_skill_check_unlocked.yaml` EXIST — confirming the two reviewer runner-ups
  are already closed (traps avoided).

## CRITICAL directions / what NOT to get wrong

1. **Settability MUST include the built-in-verb path, not just authored effects.** If you only collect
   `open_object`/`set_object_locked` effects, you WILL false-positive on `alchemists_tower` (whose
   `cellar_door`/`strongbox` are opened/unlocked via the engine's built-in OPEN/UNLOCK verbs, not authored
   effects) and turn `npm run health` RED. The `openable===true` clause (for is_open) and the
   `locked && key_id ∈ obtainable` clause (for is_unlocked) are LOAD-BEARING.
2. **Descend ONLY `all_of`** (the AND-context). Do NOT descend `any_of`/`none_of` — a disjunctive branch is
   escapable, so flagging it would be a false positive. This exactly mirrors `questStageReqs`/`itemReqs`/`flagReqs`.
3. **`is_unlocked` does NOT read the static `locked` fallback.** The CONDITION (`src/core/conditions.ts` line 74)
   reads `objectState[id]?.locked === false` directly — it does NOT use `src/parser/model.ts`'s `isLocked` static
   fallback. So an object that starts `locked:false` statically with NO unlock path does NOT satisfy `is_unlocked`
   at runtime. Settability for is_unlocked is genuinely ONLY: an explicit `set_object_locked(locked:false)` effect
   OR a built-in keyed UNLOCK (which requires the object START locked). An always-unlocked object can NEVER make
   `is_unlocked` true — but flagging that is a FORWARD hardening (no shipped pack does it). Keep the rule as
   stated; do not add a spurious "starts unlocked ⇒ settable" clause (it would be UNSOUND — the condition would
   never fire).
4. **Reuse `obtainable`**, do not recompute it; it is already in scope where you add the settable sets (compute the
   unlock set AFTER `obtainable` is built, line 309).
5. **New error code name is exactly `IMPOSSIBLE_OBJECT_STATE`** (one code for both predicate kinds; distinguish
   kind in the message string). Adding a new error CODE is additive and does not weaken any matcher.
6. **Do not edit the schema, engine, effects/conditions runtime, generators, corpus seal, scorecard, or any pack
   hash.** The validator is called as shipped; the generator is called in-memory (pure, no disk write) by the test.

## Files

**DO-NOT-EDIT (protected):**
- `scripts/verify-integrity.ts` — PROTECTED. Never edit. Do not lower any
  MIN_*/SATURATION_FLOOR/GEN_EVAL_CHECK_COUNT/PROTECTED/HASH_PIN, do not relax any matcher.

**READ-ONLY (confirm anchors, do not change):**
- `src/core/conditions.ts` — predicate semantics (is_open/is_unlocked default-false).
- `src/core/effects.ts` — open_object / set_object_locked effect shapes.
- `src/parser/legal_actions.ts` — built-in OPEN/UNLOCK settability paths (the soundness subtlety).
- `src/parser/schema.ts` — `openable` / `locked` / `key_id` object fields (lines 266-268).
- `src/parser/model.ts` — `isLocked` static fallback (the trap in CRITICAL #3; do NOT mirror it for is_unlocked).
- `content/parser/pack/alchemists_tower.yaml` — the live object-state pack; confirm it stays GREEN.
- `traces/bugs/bug_0247_canonicalize_proto_key_collision.yaml` (or another recent bug_025x artifact) — copy the
  artifact field shape.

**EDIT:**
- `src/validate/parser_validator.ts` — add `objectStateReqs` helper (near line 1269), build
  `openableObjects`/`unlockableObjects` settable sets (near lines 312-326), add the IMPOSSIBLE_OBJECT_STATE branch
  in `checkConds` (after lines 346-357).
- `tests/regression/parser_validator_negative_corpus.test.ts` — append two CASES + the GREEN differential anchor;
  extend the file header's enumerated-codes comment to list IMPOSSIBLE_OBJECT_STATE.

**NEW:**
- `traces/bugs/bug_0253_parser_impossible_object_state.yaml` — the SoundnessBench-lineage bug artifact.

## Acceptance check (concrete, verifiable)

1. `npx vitest run tests/regression/parser_validator_negative_corpus.test.ts` — GREEN; the two new cases assert
   `IMPOSSIBLE_OBJECT_STATE` fires on the synthetic mutants and is ABSENT on the GREEN base.
2. `npm run health` — EXIT 0, all 17 packs validate clean (alchemists_tower in particular MUST stay clean — the
   built-in-verb settability clause is what keeps it green). Verify the EXIT CODE under load per the
   health-load-flake note (`taskset -c 0-3 npm run health` if available), not just one fast run.
3. `npm run verify:integrity` — EXIT 0, no GUARD_WEAKENED / VERIFIER_TOUCHED / count regression; test count
   strictly ABOVE the prior 1795.
4. Confirm `traces/bugs/bug_0253_parser_impossible_object_state.yaml` exists and parses as YAML.
5. **Non-vacuity teeth** (in a LOCAL scratch copy, NOT committed): adding the matching `open_object` / keyed-unlock
   settability source to a negative-corpus mutant makes that case go RED (finding disappears), proving the check
   keys on the actual settability path, not the mere presence of a gate; then DISCARD the experiment.

## Hard constraints

- ONE focused, key-free, OFFLINE, deterministic, ADDITIVE/strengthening STRUCTURAL change. No content polish, no
  new curated pack, no keyed run.
- No floor lowered, no matcher relaxed, no PROTECTED/HASH_PIN shrunk, `scripts/verify-integrity.ts` untouched.
- No engine/schema/effects/conditions runtime change; no pack hash / scorecard / corpus-seal movement; no
  generator-version bump.
- Game stays playable; `npm run health` stays green.

## Reward-hacking guardrails (baked in)

- The check is ADDITIVE (a new error code), so it cannot weaken any existing assertion; verify:integrity's
  count/floor guards remain the bar and must stay green.
- The negative corpus proves the REJECTION direction (mutants must be REJECTED), so a future regression that guts
  the branch turns the test RED — the same SoundnessBench discipline (arXiv:2412.03154) that bug_0182/0218/0244 use.
- The GREEN differential anchor pins that the clean base does NOT emit the new code, preventing a vacuous
  always-fire implementation.
- The soundness rule is CONSERVATIVE (over-approximates settability via the built-in-verb clauses), so it cannot
  produce a false positive that would tempt weakening a real pack to silence it.

## Rejected alternatives & deferred to next cycle

- **DEFERRED — INERT_OBJECT_STATE (liveness dual):** warn on `open_object`/`set_object_locked` effects whose object
  is never read by any `is_open`/`is_unlocked` gate (the INERT_FLAG analogue). Sound and tiny, but it is the
  LIVENESS dual; land the FEASIBILITY error (this cycle) first, then the liveness warning next cycle so each lands
  with its own corpus/witness.
- **DEFERRED — WIN_FIRES_AT_START object-state stability:** extend `winStaysTrueForever`
  (`src/validate/parser_validator.ts` lines 1004-1031) to mark a win UNSTABLE when it gates on `is_open`/`is_unlocked`
  AND a close/relock effect exists. The current bail-to-unstable is already sound; this is forward hardening,
  separable, next cycle.
- **DEFERRED — World-frame manifest + modular cross-region reachability:** the open-world subsystem. Now
  better-founded once object-state feasibility joins quest_stage as a sealed local proof. Net-new schema + validator
  entry point; sequence after the local-proof family is complete.
- **DEFERRED — Compositional progress-measure (monotone-cut) oracle over all 17 packs:** elegant
  local-composes-to-global precondition; more abstract, requires a per-pack progress-field discipline. After modular
  reachability is proven on a small fixture.
- **DEFERRED — generator condition/spatial-depth breadth (CYOA item gates, parser dead-ends):** eval-distribution
  breadth, fair game but not the verification-soundness frontier this cycle.
- **REJECTED — `__proto__` canonicalize fix, convergent skill-check hardening:** ALREADY CLOSED (bug_0247,
  bug_0252). Do not re-attempt.
- **REJECTED — multi-detector LLM-judge guard, observation_difficulty, post-cutoff timestamping, keyed real-model
  run:** key-gated and/or PROTECTED-touching and/or out-of-scope this cycle.

## Deferred to next cycle (standing keystone + open-world ladder)

1. The keyed real-model author→play→fix→lock run (owner-API-key-gated) — the standing TRUE-GOAL keystone.
2. INERT_OBJECT_STATE liveness dual + WIN_FIRES_AT_START object-state stability (the two local follow-ons above).
3. World-frame manifest schema + modular cross-region static reachability validator (the open-world net-new
   primitive, now better-founded once object-state joins quest_stage as a sealed local proof).
4. The Goal-2 loop-split: extract blind/persona testing out of `npm run health` into a separate target + a
   structured-feedback bucket schema/aggregator feeding next dev goals.

## Mandated blind playtest (this cycle)

Per the harness directive and the dedicated-pass rotation, the orchestrator runs the mandated blind pass this cycle
on **`content/cyoa/pack/white_stag.yaml`** (CYOA; expect 2/4 endings reached on a single honest run, 0 unvisited, 0
warnings per `docs/blind_playtest_protocol.md`). Report at `ai-runs/2026-06-04T21-09-37-930Z/playtest.md`. Record
"Mandated blind pass ran on white_stag" in the AI_LOOP_STATE.md cycle entry (newest-first).
