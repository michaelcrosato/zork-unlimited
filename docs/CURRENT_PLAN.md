# Current plan (rolling)

This is the AFK loop's **living plan** — the hand-off document for the
saturation-triggered ultraplan (see [`docs/afk_loop.md`](./afk_loop.md)). When the
deterministic assessor runs dry (`isSaturated`), an ultraplan cycle re-aims the
project, **overwrites this file** with the synthesis + the single chosen next move,
and a fresh implementation subagent reads _only_ this file (plus the files it names)
to do the work.

---

## Synthesis — re-aim cycle #9 (2026-06-04)

The deterministic content assessor is SATURATED again (every structural content lever disarmed;
all 15 packs blind-clean; the assessor's ranked list is fifteen 0.5-floor blind-playtest stubs —
`SATURATION_FLOOR=0.5`, `src/afk/assessor.ts`). Since the LAST ultraplan (re-aim #8 → bug_0218, the
CYOA+parser validator negative corpus), the loop completed every remaining standing structural arc:
- **bug_0218** — validator negative-corpus trilogy COMPLETE (CYOA+parser, joining RPG bug_0182).
- **bug_0219** — the deferred **CYOA generator v2→v3 scene-graph deepen** (generator-deepen trilogy now
  COMPLETE across all three modes: parser bug_0199, RPG bug_0168–0174, CYOA bug_0219).
- **bug_0221/0223/0224** — the absolute ending-RENDER oracle CLOSED across all three modes (parser/RPG
  death + non-death + CYOA).
- **bug_0220/0222/0225/0226** — minor content polish on clean packs (saturation signal).

A bounded ultraplan ran this cycle — **4 repo reviewers** (engine/determinism · content/authoring+generators ·
verification/benchmark · loop/strategy) **+ 2 web researchers** (frontier IF/agentic benchmarks ·
mutation-testing + reward-hacking) **→ 1 synthesis**, each verified against the live repo at HEAD≈bug_0226
(7 agents, 161 tool-uses, 1631 tests / 249 files green).

**Convergent verdict.** The closed arcs are reconfirmed done (do NOT re-propose):
- Load/save/trace untrusted-state integrity incl. the seed/step integer-identity gate
  (bug_0181/0183/0184/0190/0208) — CLOSED on both boundaries.
- Metamorphic identifier-relabel + per-step observation-stream oracles — CLOSED all 3 modes (bug_0209–0215).
- Exhaustive all-endings-reachable + variant-liveness + score-economy solvers — CLOSED all 3 modes.
- Absolute ending-RENDER oracle (death + non-death + CYOA) — CLOSED all 3 modes (bug_0221/0223/0224).
- SoundnessBench-style validator NEGATIVE CORPUS — trilogy COMPLETE across validateRpg/validateCyoa/validateParser
  (bug_0182/0218).
- Generator-deepen v2→v3 — trilogy COMPLETE (parser bug_0199, RPG bug_0168–0174, CYOA scene-graph bug_0219).
- Blocked-exit hint parity across agent/CLI/Web (bug_0201–0207); verifier assertion-gutting / strict→loose-swap /
  guard-self-integrity launders (bug_0129/0133) — CLOSED.

The only TRUE-GOAL lever left is the **keyed real-model author→play→fix→lock run** — the standing keystone,
but OWNER-API-KEY-GATED → out of scope for a key-free cycle ([[ultraplan-true-goal-pivot]]).

The reviews surfaced **four** distinct live-verified key-free OPEN gaps: (1) `canonicalize()`'s non-JSON-safe
value contract is unpinned (`hash.ts`); (2) **the verify-integrity GUARD's OWN error-emission branches have
ZERO rejection-direction witness**; (3) the author revise-loop aborts on a real model's throwing/strict-rejected
response (`adapter.ts:89`, no try/catch; source-change, keystone-coupled); (4) the rng stream has no absolute
known-answer pin. The harm/death scorecard axis is real but ~vacuous key-free AND trips the bug_0194 freshness
pin → deferred.

**The chosen move (a verified OPEN, named ASYMMETRY — the missing leg of a pattern the project already trusts).**
The negative-corpus pattern that closed the validator trilogy (bug_0182/0218) — *"a checker is only proven sound
if its FAILING branches are exercised on input that SHOULD fail"* (SoundnessBench arXiv:2412.03154; single-checker
blind spot arXiv:2510.14253) — was NEVER applied to the **meta-verifier itself**. `scripts/verify-integrity.ts`
is the guard the entire trust-but-verify bar rests on, yet its own `error`-emitting branches —
`PROTECTED_MISSING`, `TEST_COUNT_FLOOR`, `ASSERTION_COUNT_FLOOR`, `STRONG_ASSERTION_FLOOR` (in `runStatic`),
`GIT_DIFF_FAILED` (in `runDrift`) — have **zero rejection-direction coverage**. Verified live: every existing
`runStatic`/`runDrift` call in the suite (`tests/unit/verifier_integrity.test.ts`,
`tests/regression/verifier_assertion_gutting.test.ts`, `verifier_strict_to_loose_swap.test.ts`,
`generator_program_protected.test.ts`, `sealed_corpus_manifest_protected.test.ts`) asserts these codes **ABSENT**
against the healthy `process.cwd()`; `grep GIT_DIFF_FAILED tests/` is empty. A future regression that inverted a
floor comparison, dropped a `findings.push`, or broke the `GIT_DIFF_FAILED` catch would leave **every existing test
GREEN** while silently disarming the guard. This is the exact present-but-untested-checker surface bug_0182/0218
closed for the content validators — applied to the one verification asset that pattern never covered.

**Honest scope (do not over-claim).** This IS one purely-additive regression test pinning the rejection-DIRECTION
firing of the guard's error branches against a synthetic bad root, plus the bug_0227 artifact — bringing the
meta-verifier to soundness-proof PARITY with the content validators. It is **NOT** a discovered live guard defect
and **NOT** a soundness exploit: every audited branch is correctly emitted today; the gap is that the FAILING path
is untested, so a future regression could silently disarm it. Smallest blast radius of all four open candidates
(test-only), strongest free oracle (each branch must FIRE on a bad root and stay SILENT on the healthy root), and it
moves NO source byte / pack hash / scorecard byte / corpus seal.

## Chosen move: a SoundnessBench-style negative corpus for the verify-integrity GUARD's own error branches

One new regression test that drives `runStatic`/`runDrift` against a SYNTHETIC temp-dir root engineered to trip each
guard error branch, asserting the targeted finding `code` fires at `severity: "error"`, plus a differential anchor
proving the real healthy `process.cwd()` raises none of them. Plus a `bug_0227` artifact. **No source/script/schema/
generator/engine/content/corpus/scorecard change.**

### VERIFIED anchors (confirmed live this cycle at HEAD≈bug_0226 — build against these, but RE-DERIVE from source)

- **Exports** (`scripts/verify-integrity.ts`, imported exactly as the existing tests do — copy the import line from
  `tests/unit/verifier_integrity.test.ts:30` or `tests/regression/generator_program_protected.test.ts:26`, an ESM
  specifier with a `.js` suffix that resolves to the `.ts` module):
  `export function runStatic(root: string): { ok: boolean; findings: Finding[] }` (line 186);
  `export function runDrift(root: string, ref: string, env?: NodeJS.ProcessEnv): { ok: boolean; findings: Finding[] }`
  (line 489); `export const PROTECTED_FILES` (line 43, an array of repo-relative paths);
  `export const MIN_TEST_CASES = 120` (93); `MIN_ASSERTIONS = 400` (98); `MIN_STRONG_ASSERTIONS = 400` (103);
  `export function listTestFiles(root)` (147). **Import the constants/array — NEVER hardcode the list or the floor
  numbers; iterate the imported `PROTECTED_FILES` for the set-equality assertion.**
- **Finding shape**: `Finding = { severity: 'error'|'warning', code: string, message: string, where: string }`
  (note `where` is a **string**, not `string[]`, in this guard). `runStatic` returns
  `ok: !findings.some(f => f.severity === 'error')`.
- **`runStatic` error branches** (re-read 186–235): for each `PROTECTED_FILES` entry not `existsSync(join(root, f))`
  → `PROTECTED_MISSING` (`where: f`, the path); `cases < MIN_TEST_CASES` → `TEST_COUNT_FLOOR` (`where: "tests/"`);
  `assertions < MIN_ASSERTIONS` → `ASSERTION_COUNT_FLOOR` (`where: "tests/"`); `strong < MIN_STRONG_ASSERTIONS` →
  `STRONG_ASSERTION_FLOOR` (`where: "tests/"`). The three floor `where`s are the literal `"tests/"`, NOT the code —
  so assert floors by **code + severity** (and exactly-one count), and set-equality of `where` only for
  `PROTECTED_MISSING`.
- **`runDrift` `GIT_DIFF_FAILED`** (re-read 489–520): `runDrift` starts `findings = [...runStatic(root).findings]`,
  then `try { changed = gitChangedFiles(root, ref) } catch (e) { return { ok:false, findings:[...findings,
  {severity:'error', code:'GIT_DIFF_FAILED', message:..., where: ref}] } }`. The catch **returns BEFORE** the
  guard-self `readFileSync(join(root,"scripts/verify-integrity.ts"))` (which is AFTER the try/catch) — confirmed live
  — so a synthetic root that lacks `scripts/verify-integrity.ts` is FINE: a bogus `ref` makes `git diff` throw and
  the function returns `GIT_DIFF_FAILED` (with `where === ref`) before touching the guard-self path. Drive it with a
  deterministically-absent ref (a fixed all-zeros 40-char sha string).

### CRITICAL directions (what NOT to get wrong)

1. **COPY the bug_0182/0218 discipline.** Read `tests/regression/rpg_validator_negative_corpus.test.ts` (or the
   cyoa/parser leg) for the copy-mutate-and-assert-the-specific-code idiom, and `tests/unit/verifier_integrity.test.ts`
   / `tests/regression/generator_program_protected.test.ts` for the **import specifier + the
   `runStatic`-against-a-root + absence-assertion idiom** (these already drive `runStatic(root)` against scaffolded
   temp roots — reuse their helper style for building the synthetic root).
2. **Synthetic bad root via `fs.mkdtempSync(join(tmpdir(), 'vint-'))` in `beforeAll`**; `rmSync(root, {recursive:true,
   force:true})` in `afterAll`. Populate **from string literals only** — no clock, no RNG, no timestamps in any
   asserted content. Under it create a `tests/` subdir with a SINGLE tiny `.test.ts` whose body has FEWER than
   `MIN_TEST_CASES` `it()`/`test()` shells, FEWER than `MIN_ASSERTIONS` `expect()` calls, and FEWER than
   `MIN_STRONG_ASSERTIONS` strong matchers (e.g. one `it()` with one `expect(...).toBe(...)`). Do NOT create any
   `PROTECTED_FILES` path in this root → so all of `PROTECTED_MISSING` + the three floors fire together.
3. **Assert the REJECTION direction — specific code AND `severity==='error'`, never bare `.ok===false` or
   `findings.length>0`.** (a) `runStatic(syntheticRoot)`: for EVERY entry in the imported `PROTECTED_FILES`, assert a
   `PROTECTED_MISSING` finding with `.where === that path`; assert the SET of `PROTECTED_MISSING` `where`s EQUALS the
   `PROTECTED_FILES` set (single-defect attribution). (b) From the same result, assert **exactly one** each of
   `TEST_COUNT_FLOOR`, `ASSERTION_COUNT_FLOOR`, `STRONG_ASSERTION_FLOOR`, each `severity:'error'`, and `res.ok===false`.
   (c) `runDrift(syntheticRoot, '0000000000000000000000000000000000000000')`: assert a `GIT_DIFF_FAILED` finding,
   `severity:'error'`, `.where === that ref`.
4. **DIFFERENTIAL ANCHOR (non-vacuity).** Assert `runStatic(process.cwd())` (the real healthy repo) raises NONE of
   `PROTECTED_MISSING`/`TEST_COUNT_FLOOR`/`ASSERTION_COUNT_FLOOR`/`STRONG_ASSERTION_FLOOR` — same codes fire on the
   synthetic-bad root, silent on the healthy root (mirror the absence-assertion style already in
   `verifier_integrity.test.ts`).
5. **DO NOT edit `scripts/verify-integrity.ts`** — it is in `PROTECTED_FILES`; any edit self-trips `VERIFIER_TOUCHED`.
   This move needs NO source change. Frame it as adding a missing WITNESS for already-correct guard code, NOT fixing a
   defect.
6. **ADDITIVE only.** The new file ADDS `it()`/`expect()`/strong matchers, so all three guard counts RISE — it can
   never lower a floor or weaken a check. No `MIN_*`/floor lowered, no matcher relaxed, no existing assertion touched.

### What — numbered concrete steps

1. **Read first** (READ-ONLY): `scripts/verify-integrity.ts` (confirm the exports + the `runStatic` 186–235 and
   `runDrift` 489–520 bodies, the `Finding` shape, the five codes + their `where` values); the import specifier +
   temp-root idiom in `tests/unit/verifier_integrity.test.ts` and `tests/regression/generator_program_protected.test.ts`;
   the copy-mutate-assert-specific-code idiom in `tests/regression/rpg_validator_negative_corpus.test.ts`.
2. **Create `tests/regression/verifier_static_rejection_corpus.test.ts`** — `beforeAll` builds the synthetic bad root
   (per CRITICAL direction 2); cases per CRITICAL direction 3 (PROTECTED_MISSING set-equality; one each of the three
   floors; GIT_DIFF_FAILED via `runDrift` + bogus ref); the differential anchor per direction 4. Header docstring names
   bug_0227, the bug_0182/0218 lineage, and states this is the META-VERIFIER leg of the negative-corpus pattern.
3. **Run it** and read the full `findings` arrays to confirm each targeted code is present AND attributable
   (PROTECTED_MISSING set == PROTECTED_FILES set; exactly one of each floor; GIT_DIFF_FAILED on the bogus ref).
4. **NEW artifact** `traces/bugs/bug_0227_verifier_guard_negative_corpus.yaml` mirroring the bug_0218 artifact shape
   (id, title, kind: `verification_oracle`, mode: `meta`/`tooling`, summary, context naming the audited un-witnessed
   guard error-code set + the bug_0182/0218 lineage + the saturation signal, mechanism describing the synthetic-root
   rejection-direction discipline, files_changed = the one new test file, verification = the test command). Record
   explicitly: NO source/hash/scorecard/corpus change.
5. **Verify** (key-free, offline, deterministic): the new test GREEN (every targeted code fires; differential anchor
   passes); **non-vacuity spot-check** — in a LOCAL scratch copy of `verify-integrity.ts` (NOT the repo file; do NOT
   commit) temporarily comment ONE targeted `findings.push` (e.g. `PROTECTED_MISSING`) and confirm exactly that case
   goes RED, then discard the scratch experiment. `npm run health` GREEN (EXIT 0) with test count strictly ABOVE the
   prior count. `npm run verify:integrity` EXIT 0 — NO new VERIFIER_TOUCHED / GUARD_WEAKENED / PROTECTED_DELETED /
   HASH_PIN / TEST/ASSERTION/STRONG count regression (the new file is NOT protected; no `AI_LOOP_ALLOW_VERIFIER_EDITS`
   needed). `git status` shows ONLY the 2 new files (+ AI_LOOP_STATE.md, handled by the orchestrator).

### Exact files

- **READ-ONLY**: `scripts/verify-integrity.ts`, `tests/unit/verifier_integrity.test.ts`,
  `tests/regression/generator_program_protected.test.ts`, `tests/regression/rpg_validator_negative_corpus.test.ts`.
- **NEW**: `tests/regression/verifier_static_rejection_corpus.test.ts`,
  `traces/bugs/bug_0227_verifier_guard_negative_corpus.yaml`.
- **DO NOT EDIT / DO NOT REGENERATE**: `scripts/verify-integrity.ts` (PROTECTED — self-trips VERIFIER_TOUCHED), any
  validator/schema/generator/engine source, any pack YAML, `corpus/manifest.json`, the scorecard. No re-seal, no
  benchmark rebuild (no pack hash / scorecard byte / corpus seal moves).

### Acceptance check (concrete / verifiable)

- One NEW regression file exists following the bug_0182/0218 copy-mutate discipline applied to the meta-verifier
  (synthetic temp root from string literals; imported `PROTECTED_FILES`/`MIN_*`, not hardcoded).
- Against the synthetic-bad root, `runStatic` emits `PROTECTED_MISSING` for EVERY live `PROTECTED_FILES` entry (set
  equality) plus exactly one each of `TEST_COUNT_FLOOR`/`ASSERTION_COUNT_FLOOR`/`STRONG_ASSERTION_FLOOR`, all
  `severity:'error'`, and `res.ok===false`; `runDrift` against the bogus all-zeros ref emits `GIT_DIFF_FAILED`
  `severity:'error'` with `where === that ref`.
- The differential anchor asserts `runStatic(process.cwd())` raises NONE of those four codes.
- The test is NON-VACUOUS: it goes RED if a targeted `findings.push` is removed or a floor comparison inverted
  (confirmable in a local scratch copy; not committed).
- `npm run health` GREEN (EXIT 0), test count strictly above the prior HEAD count; `npm run verify:integrity` EXIT 0
  with NO GUARD_WEAKENED / PROTECTED_DELETED / VERIFIER_TOUCHED / count regression. No floor lowered, no matcher
  relaxed, no test skipped/deleted, no source touched.
- `traces/bugs/bug_0227_verifier_guard_negative_corpus.yaml` exists in the bug_0218 format.
- `git status` shows ONLY the 2 new files (the orchestrator separately updates AI_LOOP_STATE.md). No pack hash,
  scorecard byte, or corpus seal moved.

## Hard constraints (every cycle)

- Key-free / offline / deterministic: no outbound model calls, no wall-clock, no RNG.
- ONE focused STRUCTURAL change (not content polish); additive/strengthening only; NEVER weaken a check (no lowering
  `MIN_*` / `GEN_EVAL_CHECK_COUNT` / `SATURATION_FLOOR`, no relaxing matchers, no `GUARD_WEAKENED`, no shrinking
  PROTECTED/HASH_PIN lists).
- Keep the game playable and `npm run health` green.

## Reward-hacking guardrails (from the web research — bake these in)

- **PITFALL: a vacuous test asserting merely `res.ok===false`** (any failure) instead of the SPECIFIC code — it would
  pass even if the wrong branch fired. GUARD: assert the EXACT code + `severity==='error'` (+ `where` for
  PROTECTED_MISSING), never just `.ok` or `.length>0`.
- **PITFALL: a synthetic root that trips MULTIPLE codes ambiguously.** GUARD: assert the `PROTECTED_MISSING` where-set
  EQUALS `PROTECTED_FILES`, and exactly-one count for each floor — over/under-emission is caught, not masked. (The
  bad root is DESIGNED to trip all four `runStatic` codes at once; that is fine because each is pinned by code +
  count, and the differential anchor proves the healthy root raises none.)
- **PITFALL: hardcoding `PROTECTED_FILES` / the floor numbers.** GUARD: import the live exports and iterate the array
  — a future re-pin of the protected list or a floor change must not silently desync the test.
- **PITFALL: editing the guard to "make it testable" → VERIFIER_TOUCHED.** GUARD: the move needs NO source change;
  `runStatic`/`runDrift` are already fully root-parameterized.
- **PITFALL: over-claiming a discovered guard defect (Goodhart / EvilGenie arXiv:2511.21654).** GUARD: the artifact +
  test docstrings frame this as adding the missing rejection-direction WITNESS for already-correct branches (parity
  with bug_0182/0218), NOT a fixed live defect.
- **PITFALL: non-determinism from the temp dir / git.** GUARD: synthetic content from string literals only; bogus ref
  is a fixed all-zeros sha; `mkdtemp` dir cleaned in `afterAll`; no asserted value depends on the temp path.

## Rejected alternatives (this cycle)

- **Author revise-loop resilience to malformed/strict-rejected provider responses** (`adapter.ts:89` no try/catch;
  `schemas.ts` AdapterOutput/Parser/Rpg all `.strict()`) — a GENUINE open gap and the highest-value KEYSTONE PREP, but
  REJECTED THIS CYCLE for blast radius: it is a SOURCE change that mutates the keystone runtime path and relaxes
  `.strict()→.passthrough()` on the adapter output schemas; the chosen move is test-only and standalone-valuable.
  **STRONG runner-up — lead next cycle if a source-touching keyed-run de-risk is wanted** (wrap `completeJson` in
  try/catch so a throw becomes a revisable `prior_error`; relax the ADAPTER OUTPUT schemas ONLY, never the downstream
  `validate{Cyoa,Parser,Rpg}` game-content gate).
- **Pin `canonicalize()`'s non-JSON-safe value contract** (`hash.ts` `sortDeep` passes primitives straight to
  `JSON.stringify`; `hash_rng.test.ts` has no undefined/NaN/Infinity/-0 case) — a real unpinned surface, but a
  golden-string CHARACTERIZATION-class test, and the LOAD boundary that depended on it is already CLOSED
  (`GameStateSchema` gates finite vars). Lower-value witness for already-correct code. Cheap test-only follow-up.
- **rng absolute known-answer vector + curated in-process mutation-kill micro-slice** — a real under-pin (no absolute
  mulberry32 stream pin live), test-only and tractable — viable STANDALONE follow-up, but the guard self-coverage gap
  is the documented-open hole the negative-corpus pattern most directly completes.
- **Death/harm scorecard axis (TextQuests vocabulary)** — trips the bug_0194 freshness pin (row-shape change forces a
  same-cycle runs=50 scorecard regen) AND is ~vacuous key-free (CYOA has no `death` flag; the deterministic bot floors
  near 0% on parser/RPG). **Defer to land WITH the keyed run** so real completions make the column non-vacuous.
- **Full source-mutation-kill framework / Stryker** — flagged LARGE-effort + flake/runtime risk; a vacuous-assert
  oracle CLASS hardening already-correct code. Only the rng pure-fn micro-slice is tractable key-free.
- **Extend metamorphic/render/reachability oracles to the GENERATED/held-out corpus** — regression-hardening of an
  already-proven property (generated packs pass by construction at mint); lower marginal value than a missing-witness
  on an UNCOVERED checker.
- **Keyed real-model author→play→fix→lock run** — OWNER-API-KEY-GATED; out of scope for a key-free cycle. Remains the
  standing true-goal keystone ([[ultraplan-true-goal-pivot]]).

## Deferred to next cycle

1. The keyed real-model author→play→fix→lock run (owner-API-key-gated) — the standing keystone.
2. **Author revise-loop resilience** (the strong runner-up; best source-touching keystone de-risk) — wrap
   `completeJson` in try/catch, relax the ADAPTER OUTPUT schemas only. Land WITH the keyed run.
3. The TextQuests harm/death axis on the scorecard (needs a `run_playtest`-fed column + scorecard rebuild; land WITH
   the keyed run).
4. rng absolute known-answer vector + curated in-process mutation-kill micro-slice (test-only standalone follow-up).
5. `canonicalize()` non-JSON-safe value contract pin (cheap test-only hardening).

## Mandated blind playtest (this cycle)

Per the dedicated-pass rotation ([[assessor-blind-pass-rotation]]) and this cycle's harness directive, the
orchestrator runs the mandated blind pass on **`content/parser/pack/lamplighters_round.yaml`** (parser; expected
endings 0/3 reached, unvisited 3, 0 warnings per `docs/blind_playtest_protocol.md`). Report to
`ai-runs/2026-06-04T03-00-00-306Z/playtest.md` (the loop.sh-required path). Record "Mandated blind pass ran on
lamplighters_round" in the AI_LOOP_STATE.md cycle entry (newest-first). Handled by the orchestrator, not the
implementation subagent.
