# Current plan (rolling)

This is the AFK loop's **living plan** — the hand-off document for the
saturation-triggered ultraplan (see [`docs/afk_loop.md`](./afk_loop.md)). When the
deterministic assessor runs dry (`isSaturated`), an ultraplan cycle re-aims the
project, **overwrites this file** with the synthesis + the single chosen next move,
and a fresh implementation subagent reads _only_ this file (plus the files it names)
to do the work.

---

## Synthesis — re-aim cycle #8 (2026-06-03/04)

The deterministic content assessor is SATURATED (every structural content lever disarmed;
all 15 packs blind-clean; the assessor's whole ranked list is fifteen 0.5-floor blind-playtest
stubs — `SATURATION_FLOOR=0.5`, `src/afk/assessor.ts`). Since the LAST ultraplan (re-aim #7 →
bug_0208, the seed/step integer-identity load gate), the loop completed the standing deferred
structural lever — the **metamorphic oracle trilogy AND its per-step deepening across all three
modes** (bug_0209–0212 terminal-census + bug_0213–0215 per-step observation-stream) — plus minor
content polish (bug_0210/0216 lamplighters). That lever is now CLOSED on curated packs.

A bounded ultraplan ran this cycle — **4 repo reviewers** (engine/determinism ·
content/authoring+generators · verification/benchmark · loop/strategy) **+ 2 web researchers**
(frontier IF/agentic benchmarks · autonomous-improvement reward-hacking) **→ 1 synthesis**, each
verified against the live repo at HEAD≈bug_0216 (7 agents, 162 tool-uses).

**Convergent verdict.** The closed arcs are reconfirmed done (do NOT re-propose):
- Load/save/trace untrusted-state integrity arc **incl. the seed/step integer-identity gate**
  (bug_0181/0183/0184/0190/0208) — CLOSED on both boundaries.
- Metamorphic identifier-relabel oracle **+ per-step observation-stream oracle** — CLOSED on all
  3 modes on CURATED packs (bug_0209–0215).
- Exhaustive all-endings-reachable + variant-liveness + score-economy solvers — CLOSED all 3 modes.
- Generator-deepen v2 line: parser v2→v3 at PARITY (per-mode scorecard parser 16.5%/16.7% — NO v4),
  RPG guarantee re-tune, CYOA v2 two-axis — closed. *(The CYOA SCENE-GRAPH depth axis remains
  genuinely untouched — a valid FUTURE move, not this cycle: it re-seals the corpus + forces a
  scorecard regen = large blast radius.)*
- Blocked-exit hint parity across agent/CLI/Web for parser+RPG (bug_0201–0207) — CLOSED.
- Verifier assertion-gutting / strict→loose-swap / guard-self-integrity launders — CLOSED.
- **RPG validator negative corpus (bug_0182) — CLOSED for `validateRpg` specifically.** This is the
  hinge: the SAME SoundnessBench-style pattern was NEVER built for `validateCyoa` or `validateParser`.

The engine reviewer found NO open *exploitable* soundness hole. The keyed real-model
author→play→fix→lock run remains the standing TRUE-GOAL keystone but is OWNER-API-KEY-GATED → out
of scope for a key-free cycle ([[ultraplan-true-goal-pivot]]).

**The chosen move (a verified OPEN, named ASYMMETRY — not regression-hardening of correct code).**
`tests/regression/rpg_validator_negative_corpus.test.ts` is the **ONLY** negative corpus in the whole
suite (verified: `ls tests/regression` matches exactly one `*negative*` file). bug_0182 closed the
rejection-DIRECTION witness for `validateRpg` and stated the soundness principle verbatim: *"a checker
is only proven sound if its FAILING branches are exercised on input that SHOULD fail"* (SoundnessBench
arXiv:2412.03154; single-checker blind spot arXiv:2510.14253). The CYOA and parser validators emit many
`error`-severity codes via `err("CODE", msg, where[])` — and a whole-suite audit found a large set of
those error branches have **ZERO rejection-direction witness anywhere** (they are exercised almost
entirely in the ACCEPT direction by the curated + generated clean packs). A future regression that drops
a `findings.push`, inverts a guard, or adds a `??` default swallowing the case would leave **every
existing test GREEN**. This is the exact present-but-untested-checker surface bug_0182 closed for RPG
only — the open two-thirds of the trilogy.

**Honest scope (do not over-claim).** This IS two purely-additive regression tests pinning the
rejection-DIRECTION firing of CYOA + parser validator error branches that have no negative witness
today, plus the bug_0218 artifact — bringing the CYOA/parser validators to soundness-proof PARITY with
RPG (bug_0182). It is **NOT** a discovered live validator defect and **NOT** a soundness exploit: every
audited branch is correctly emitted today; the gap is that the FAILING path is untested, so a future
regression could silently disarm it. Smallest blast radius (test-only), strongest free oracle (each
branch must FIRE), and it moves NO pack hash / scorecard byte / corpus seal.

## Chosen move: add a SoundnessBench-style negative corpus for `validateCyoa` + `validateParser`

Two new regression tests that, per validator, take the canonical clean pack `generate{Cyoa,Parser}Pack(0)`
as the GREEN base and — using the bug_0182 copy-mutate discipline — introduce EXACTLY ONE defect per case,
asserting the targeted `error` code fires. Plus a `bug_0218` artifact. **No source/validator/schema/
generator/engine/content/corpus/scorecard change.**

### VERIFIED anchors (confirmed live this cycle — build against these, but RE-DERIVE from source)

- **Finding shape** (`src/validate/report.ts`): `Finding = { severity: 'error'|'warning', code: string,
  message: string, where: string[] }`. `makeReport` sets `ok = !findings.some(f => f.severity==='error')`.
  → The negative corpus targets **`error`-severity codes ONLY**. `warn(...)` codes (e.g. CYOA
  `UNREACHABLE_SCENE`) are advisory and MUST NOT be targeted.
- **Generators** (both validate CLEAN at seed 0 — confirmed): `generateCyoaPack(seed: number): CyoaPack`
  (`src/gen/cyoa_generator.ts:376`); `generateParserPack(seed: number): ParserPack`
  (`src/gen/parser_generator.ts:536`).
- **Validators return `ValidationReport`**: `validateCyoa(pack: CyoaPack)` (`src/validate/cyoa_validator.ts`);
  `validateParser(pack: ParserPack)` (`src/validate/parser_validator.ts`).
- **`err(...)` calls are frequently MULTI-LINE** (the code string sits on its own line, e.g. CYOA
  `ITEM_UNOBTAINABLE` at `cyoa_validator.ts:273`). A single-line `grep 'err("CODE"'` will MISS these — the
  subagent MUST read the emit sites directly (`Read`/`sed`/`awk`), not a line-anchored grep, and note that
  the host `grep` mis-detects these validator files as binary (sed/awk read them fine).
- **CYOA `error` codes** (confirmed emit sites): `START_MISSING` (:54), `START_NOT_SCENE` (:61),
  `DUPLICATE_ID` (:38), `ENDING_UNREACHABLE` (:188), `SOFTLOCK` (:203), `DEAD_END` (:215),
  `ITEM_UNOBTAINABLE` (:273, multi-line), `IMPOSSIBLE_GATE`, and more at the multi-line `err(` calls
  (lines ~60/89/97/178). `UNREACHABLE_SCENE` (:167) is a **warning**, not a target.
- **Parser `error` codes** (confirmed emit sites): `START_MISSING` (:123), `ROOM_OBJECT_MISSING` (:133),
  `CONTAINER_CONTENT_MISSING` (~:155), `LOCKED_NO_KEY` (:170), `NPC_ROOM_MISSING` (~:180),
  `KEY_UNOBTAINABLE` (:313), `DIALOGUE_ROOT_MISSING` (~:405), `DIALOGUE_GOTO_MISSING` (:423),
  plus `KEY_MISSING`, `AMBIGUOUS_ALIAS`, `IMPOSSIBLE_GATE`, `SOFTLOCK`, `DUPLICATE_ID`.

### CRITICAL directions (what NOT to get wrong)

1. **COPY the bug_0182 discipline EXACTLY.** Read
   `tests/regression/rpg_validator_negative_corpus.test.ts` in full first. Mirror it precisely:
   - a single GREEN base = `generate{Cyoa,Parser}Pack(0)`;
   - a `codesOf(pack)` helper = `validate{Cyoa,Parser}(pack).findings.filter(f => f.severity === 'error').map(f => f.code)`;
   - a `CASES` array where each case = `{ code, why, mutate: (p) => void }`;
   - per case: `structuredClone(GREEN)` → apply **EXACTLY ONE** mutation → assert
     `codesOf(twin)` **`.includes(EXPECTED_CODE)`**;
   - a **differential anchor** test asserting `codesOf(GREEN)` includes NONE of the targeted codes
     (so every firing is attributable to the single mutation).
2. **DERIVE the real targeted set from SOURCE — do not trust a hardcoded list.** For each validator,
   read the actual `err(...)` emit sites, build the set of `error` codes, cross-reference which have NO
   existing rejection-direction witness in `tests/` (the audit list above is the starting point, not
   gospel — confirm each code EXISTS and is an `error`, and that the GREEN base does NOT already raise it).
   Target the codes that are (a) `error`-severity, (b) currently un-witnessed, and (c) cleanly
   mutate-reachable from `gen(0)`.
3. **One defect per case; assert the SPECIFIC code, never just `.ok===false`.** A vacuous test asserting
   only `report.ok===false` or `findings.length>0` would pass even if the WRONG branch fired or a schema
   parse threw. Always `codesOf(twin).includes(EXACT_CODE)`. Where a minimal mutation unavoidably trips a
   companion code, use `.includes(expected)` (NOT exact-set-equals) plus the GREEN differential anchor —
   exactly as the RPG test does.
4. **If a code is NOT cleanly mutate-reachable from `gen(0)` alone, DOCUMENT WHY in a comment and SKIP
   it** — do not force a contrived multi-defect base or silently drop it. (Honest coverage > inflated count.)
5. **ADDITIVE only.** Do NOT touch any validator / schema / generator / engine source, any pack YAML, the
   corpus manifest, or any scorecard byte. No `findings.push` removed, no guard inverted, no `MIN_*`/floor
   lowered, no existing assertion relaxed. The validators are exercised **exactly as shipped**.
6. **No side-effecting imports.** The tests only CALL `generate{Cyoa,Parser}Pack(0)` in-memory (pure, no
   disk writes) and `validate*`. Confirm `git status` shows NO scorecard/`corpus/manifest.json` churn
   before finishing.

### What — numbered concrete steps

1. **Read first** (READ-ONLY): `tests/regression/rpg_validator_negative_corpus.test.ts` (the discipline to
   copy), `src/validate/report.ts` (Finding shape), `src/validate/cyoa_validator.ts` (all `err(...)` emit
   sites — multi-line aware), `src/validate/parser_validator.ts` (same), `src/gen/cyoa_generator.ts:376`
   and `src/gen/parser_generator.ts:536` (gen(0) shape — what structure exists to mutate).

2. **Create `tests/regression/cyoa_validator_negative_corpus.test.ts`** — GREEN base
   `generateCyoaPack(0)`; one case per targeted CYOA `error` code that has no existing witness and is
   mutate-reachable from gen(0). Confirmed-good candidates (verify live, add any other un-witnessed `error`
   codes you find, skip any not cleanly reachable with a documented comment):
   - `DEAD_END` — set a reachable non-ending scene's `choices` to `[]`.
   - `START_MISSING` — set `meta.start` to a non-existent node id.
   - `ITEM_UNOBTAINABLE` — add a condition to a choice positively requiring an item that nothing grants
     (gen(0) may have no `add_item` effects, so add the require-item condition such that the item is
     never obtainable).
   Header docstring names bug_0218, the bug_0182 lineage, and states this is the CYOA leg of the
   negative-corpus trilogy. Differential anchor included.

3. **Create `tests/regression/parser_validator_negative_corpus.test.ts`** — GREEN base
   `generateParserPack(0)`; one case per targeted parser `error` code that has no existing witness and is
   mutate-reachable from gen(0). Confirmed-good candidate set (verify each emit condition at its line and
   craft the minimal single mutation; skip-with-comment any not cleanly reachable):
   `ROOM_OBJECT_MISSING`, `CONTAINER_CONTENT_MISSING`, `LOCKED_NO_KEY` (drop `key_id` + any unlock path
   on a locked object), `NPC_ROOM_MISSING` (point an npc at a non-existent room), `KEY_UNOBTAINABLE`,
   `DIALOGUE_ROOT_MISSING`, `DIALOGUE_GOTO_MISSING`, `START_MISSING` (non-room `meta.start_room`).
   Differential anchor included.

4. **For BOTH tests**, run them and read each twin's full `findings` to confirm the expected code is
   present AND attributable to the single mutation; tune mutations so each case is a clean single-defect
   attribution.

5. **NEW artifact** `traces/bugs/bug_0218_cyoa_parser_validator_negative_corpus.yaml` mirroring the
   bug_0182/bug_0215 artifact shape (id, title, kind: `verification_oracle`, mode: `cyoa+parser`, summary,
   context naming the audited un-witnessed `error`-code sets + the bug_0182 lineage + the saturation
   signal, mechanism describing the copy-mutate discipline, files_changed = the two new test files,
   verification = the test command). Record explicitly: NO source/hash/scorecard/corpus change.

6. **Verify** (key-free, offline, deterministic): the two new tests GREEN (every targeted case fires its
   code; differential anchor passes); **non-vacuity spot-check** — temporarily comment ONE targeted
   `err(...)` emit in the validator locally → exactly that case goes RED; restore (do NOT commit the
   experiment). `npm run health` GREEN (EXIT 0). `npm run verify:integrity` EXIT 0 — NO new
   VERIFIER_TOUCHED / GUARD_WEAKENED / PROTECTED_DELETED / HASH_PIN / TEST/ASSERTION/STRONG count
   regression (validator/test files are NOT protected; no `AI_LOOP_ALLOW_VERIFIER_EDITS` needed).
   `git status` shows ONLY the 3 new files.

### Exact files

- **READ-ONLY**: `tests/regression/rpg_validator_negative_corpus.test.ts`, `src/validate/report.ts`,
  `src/validate/cyoa_validator.ts`, `src/validate/parser_validator.ts`, `src/gen/cyoa_generator.ts`,
  `src/gen/parser_generator.ts`.
- **NEW**: `tests/regression/cyoa_validator_negative_corpus.test.ts`,
  `tests/regression/parser_validator_negative_corpus.test.ts`,
  `traces/bugs/bug_0218_cyoa_parser_validator_negative_corpus.yaml`.
- **DO NOT EDIT / DO NOT REGENERATE**: any validator/schema/generator/engine source, any pack YAML,
  `corpus/manifest.json`, the scorecard, `scripts/verify-integrity.ts`. No re-seal, no benchmark rebuild
  (no pack hash / scorecard byte / corpus seal moves).

### Acceptance check (concrete / verifiable)

- Two NEW regression files exist, each following the bug_0182 copy-mutate discipline (single GREEN base
  from `generate{Cyoa,Parser}Pack(0)`, `structuredClone` per case, one defect per case, `codesOf` filters
  `severity==='error'`).
- Each CYOA case asserts `validateCyoa(twin)` emits its targeted code; each parser case asserts
  `validateParser(twin)` emits its targeted code. Any `error` code legitimately not mutate-reachable from
  gen(0) is explicitly commented, not silently dropped.
- A differential-anchor assertion in each file proves the GREEN base raises NONE of the targeted codes.
- Each test is NON-VACUOUS: it goes RED if the corresponding `err(...)` emit is removed or its guard
  inverted (confirmable by temporarily commenting one emit site and seeing exactly that case fail).
- `npm run health` GREEN (EXIT 0); `npm run verify:integrity` EXIT 0 with NO GUARD_WEAKENED /
  PROTECTED_DELETED / HASH_PIN_UNACCOMPANIED / count regression. No floor lowered, no matcher relaxed,
  no test skipped/deleted (a documented-skip of an unreachable code is fine), no source touched.
- `traces/bugs/bug_0218_cyoa_parser_validator_negative_corpus.yaml` exists in the bug_0215 format.
- `git status` shows ONLY the 3 new files. No pack hash, scorecard byte, or corpus seal moved.

## Hard constraints (every cycle)

- Key-free / offline / deterministic: no outbound model calls, no wall-clock, no RNG.
- ONE focused STRUCTURAL change (not content polish); additive/strengthening only; NEVER weaken a check
  (no lowering `MIN_*` / `GEN_EVAL_CHECK_COUNT` / `SATURATION_FLOOR`, no relaxing matchers, no
  `GUARD_WEAKENED`, no shrinking PROTECTED/HASH_PIN lists).
- Keep the game playable and `npm run health` green.

## Reward-hacking guardrails (from the web research — bake these in)

- **PITFALL: a vacuous negative test asserting merely `report.ok===false`** (any failure) instead of the
  SPECIFIC code — it would pass even if the wrong branch fired or a schema parse threw. GUARD:
  `codesOf(twin).includes(EXACT_CODE)`, never just `.ok` or `.length>0`.
- **PITFALL: a mutation tripping MULTIPLE codes, making attribution ambiguous** (ASL arXiv:2510.14253;
  SoundnessBench arXiv:2412.03154). GUARD: minimal single-defect mutation; where a companion code is
  unavoidable use `.includes(expected)` PLUS the GREEN differential anchor — do NOT exact-equals the
  whole code set.
- **PITFALL: mutating the shared GREEN base in place** so later cases inherit prior defects. GUARD:
  `structuredClone(GREEN)` at the top of every case, exactly as bug_0182.
- **PITFALL: over-claiming a discovered validator defect (Goodhart / inflated severity, EvilGenie
  arXiv:2511.21654).** GUARD: the artifact + test docstrings frame this as adding the missing
  rejection-direction WITNESS for already-correct branches (parity with bug_0182), NOT a fixed live defect.
- **PITFALL: re-seal / scorecard blast radius.** GUARD: tests only CALL the generators in-memory (pure,
  no disk writes); confirm `git status` shows no scorecard / `corpus/manifest.json` churn before finishing.

## Rejected alternatives (this cycle)

- **Deepen the CYOA generator v2→v3 to multi-stage SCENE-GRAPH topology** (close the 0.68/0.586
  curated/held-out gap) — genuinely a live distribution defect and highest-ceiling, but MEDIUM effort with
  the LARGEST blast radius: bumps `CYOA_GENERATOR_VERSION`, re-seals all 4 CYOA corpus entries (new
  `content_hash`es in `corpus/manifest.json`), and forces a runs=50 scorecard regen to keep
  `benchmark_scorecard_fresh.test.ts` green — moving corpus seal + scorecard bytes, exactly what the brief
  avoids unless that IS the whole point. **Deferred to a future cycle** once a low-risk strengthening lands.
- **TextQuests death/harm axis on the scorecard** — real and open, but trips the bug_0194 freshness pin
  (row-shape change forces same-cycle runs=50 scorecard regen, moving scorecard bytes) and the
  deterministic baseline bot floors at 0% on parser/RPG so the column is thin until a keyed real-model row
  lands (owner-API-key-gated). Larger blast radius for equal-or-lower immediate signal.
- **Extend the metamorphic relabel/observation-stream oracle to the GENERATED/held-out corpus** —
  strategically appealing (the contamination claim rests on held-out packs, yet the id-invariance oracle
  only runs on curated), but it is regression-hardening of an already-proven property (same engine + relabel
  path, proven sound on curated) and the metamorphic trilogy is marked CLOSED. Lower marginal soundness than
  wiring up a rejection-direction witness that today does not exist at all for the un-witnessed validator codes.
- **Mutation-kill harness for vacuous-but-strong asserts** — named open gap and high-value, but LARGE
  effort (a new mutation-kill harness script under `scripts/` cataloguing mutants + per-mutant suite runs as a hard bar) with flake/runtime
  risk, and a new oracle CLASS rather than a named live asymmetry. The negative corpus closes a concrete
  present-but-untested-checker surface at a fraction of the effort/blast radius. **Strong future cycle.**
- **Gate the trace top-level envelope (`actions`/`content_hash`/`seed`) with a `TraceSchema` before replay**
  — the reviewer itself flags `is_live_defect:false`: a malformed envelope cannot corrupt state or yield a
  wrong-but-accepted hash; boundary-symmetry cosmetics, strictly weaker than adding missing soundness
  witnesses.
- **Keyed real-model author→play→fix→lock run** — OWNER-API-KEY-GATED; out of scope for a key-free cycle.
  Remains the standing true-goal keystone ([[ultraplan-true-goal-pivot]]).

## Deferred to next cycle

1. The keyed real-model author→play→fix→lock run (owner-API-key-gated) — the standing keystone.
2. The CYOA generator v2→v3 SCENE-GRAPH-depth deepen (closes the real CYOA contamination gap; accepts the
   corpus re-seal + scorecard-regen blast radius as the whole point of that cycle).
3. The TextQuests harm axis on the scorecard (needs a `run_playtest` field + scorecard rebuild).
4. The mutation-kill harness (a key-free vacuous-assert oracle CLASS, large effort).

## Mandated blind playtest (this cycle)

Per the dedicated-pass rotation ([[assessor-blind-pass-rotation]]), the orchestrator runs the mandated
blind pass on the most-overdue dedicated target, deliberately deviating from the harness's recency-blind
nominee (`lamplighters_round`, blind-played clean LAST cycle bug_0216 and bug_0210) so the rotation does
not re-freeze. Reading the dedicated-pass log newest→oldest, the most-overdue is **`wreckers_light`**
(CYOA, last dedicated pass bug_0196 — older than every other pack; named the most-overdue target in
bug_0215's own next-focus). It is also thematically apt — this cycle's move hardens the CYOA validator, and
`wreckers_light` is a CYOA branch-walk pack. Report to `ai-runs/2026-06-04T00-10-24-722Z/playtest.md` (the
loop.sh-required path). Record "Mandated blind pass ran on wreckers_light" in the AI_LOOP_STATE.md cycle
entry (newest-first). Handled by the orchestrator, not the implementation subagent.
