# Current plan (rolling)

This is the AFK loop's **living plan** — the hand-off document for the
saturation-triggered ultraplan (see [`docs/afk_loop.md`](./afk_loop.md)). When the
deterministic assessor runs dry (`isSaturated`), an ultraplan cycle re-aims the
project, **overwrites this file** with the synthesis + the single chosen next move,
and a fresh implementation subagent reads _only_ this file (plus the files it names)
to do the work.

---

## Synthesis — re-aim cycle #7 (2026-06-03)

The deterministic content assessor is SATURATED (every structural content lever disarmed;
all 15 packs blind-clean; the assessor's whole ranked list is fifteen 0.5-floor blind-playtest
stubs — `SATURATION_FLOOR=0.5`, src/afk/assessor.ts). A bounded ultraplan ran this cycle —
**4 repo reviewers** (engine/determinism · content/authoring+generators · verification/benchmark ·
loop/strategy) **+ 2 web researchers** (frontier IF/agentic benchmarks · autonomous-improvement
reward-hacking) **→ 1 synthesis**, each verified against the live repo at HEAD≈bug_0207.

**Convergent verdict.** The closed arcs are reconfirmed done (do NOT re-propose): the blocked-exit
hint arc across EVERY surface (agent observation + CLI passive hint + CLI on-attempt + UI) for
parser+RPG (bug_0201–0207); the generator-deepen trilogy incl. parser v2→v3 (bug_0199 — the
per-mode scorecard now reads parser curated **16.5%** vs held-out **16.7%** = parity, so a parser
v4 deepen is NOT warranted; CYOA is the only mode carrying a real contamination gap, 68.0%/58.6%);
the load-integrity FINITENESS arc on save+trace (bug_0181–0190); benchmark gap-erosion defused via
the per-mode slice (bug_0198); exhaustive structural solvers across all 3 modes. The engine
reviewer found NO open *exploitable* soundness hole. The keyed real-model author→play→fix→lock run
remains the standing TRUE-GOAL keystone but is OWNER-API-KEY-GATED → out of scope for a key-free
cycle ([[ultraplan-true-goal-pivot]]).

**The chosen move (a verified OPEN boundary-symmetry gap, not a hypothetical).** The
determinism-identity fields `seed`/`step` are gated **inconsistently across the two trust
boundaries**:

- **Entry boundary (MCP):** `src/mcp/server.ts:147` (and `:157`) gate `seed: z.number().int()` —
  a non-integer seed is *rejected* before it can ever enter a `GameState`.
- **Disk/load boundary:** `src/persist/save_load.ts:45-46` gate only `seed: z.number().finite()`
  and `step: z.number().finite()` — a forged/corrupted save carrying a **non-integer** seed/step
  (e.g. `1.5`, `-3.5`, `4294967301.5`) is *accepted*.

`src/core/state.ts:19-20` documents both as integers (`step` = "monotonically increasing action
counter"). `src/core/rng.ts:44` (`rngForStep`) consumes them as `seed >>> 0` / `step >>> 0`, which
silently truncates any non-integer to a *different* value than the save's content hash committed to
(`src/core/hash.ts` `canonicalize` stringifies the raw `1.5`). So the load boundary admits a
type-confused determinism identity the entry boundary would never accept — the one **un-gated
sub-case** of the otherwise-closed "integrity at load" arc, which gated *finiteness* (bug_0181:
Infinity/NaN → `var_gte`) but never *integer-ness*.

**Honest scope (do not over-claim).** This is **boundary-symmetry / type-confusion hardening**,
NOT an unlock-exploit like bug_0181's Infinity→`var_gte`→every-gate-true. A non-integer seed is
self-consistent within a single save (it loads to the same value and runs the same deterministic
stream). The value is completing the entry↔disk symmetry on the determinism-identity fields so a
malformed save is rejected at *both* boundaries, with an adversarial rejection witness — the
smallest-blast-radius, strongest-free-oracle structural move available this cycle.

## Chosen move: tighten the load-integrity gate so `seed`/`step` are INTEGERS (entry↔disk symmetry)

In `src/persist/save_load.ts` change `seed`/`step` from bare `z.number().finite()` to an **integer**
gate matching the entry boundary, and add adversarial REJECTION witnesses (non-integer seed/step)
plus a GREEN over-restriction witness (a legitimate **negative** integer seed must still
round-trip), mirroring the existing `seed = Infinity` case.

### CRITICAL directions (what NOT to get wrong)

1. **Use `.int()`, NOT `.gte(0).lte(0xffffffff)`.** The entry boundary `src/mcp/server.ts:147`
   allows ANY integer seed including **negative** (`mulberry32` does `seed >>> 0`, which is defined
   for negatives; default is 1 but the API permits negatives). A `gte(0)`/`lte(2^32-1)` gate would
   **false-reject a legitimate negative-seed save** — a real regression. The gate must match the
   entry boundary EXACTLY: `seed: z.number().int()`. `step` is a counter from 0
   (`src/core/state.ts:20`), so `step: z.number().int().nonnegative()` is correct and tighter
   (a save can never legitimately carry a negative step).
2. **ADDITIVE only — the gate NARROWS the accepted set.** It rejects strictly more (non-integers)
   and accepts everything it accepted before EXCEPT non-integers (which were never legitimate).
   No floor lowered, no matcher relaxed, no `.finite()` weakened (integer ⊂ finite). The two
   existing GREEN round-trip tests (seed:7/step:12, and the rich state) MUST still pass byte- and
   hash-identically — proving no hash moved and no false rejection.
3. **Prove non-vacuity in BOTH directions.** The new rejection cases MUST fail (no throw) against
   the OLD `.finite()` schema and pass against the tightened one (a genuine witness, like the
   `seed = Infinity` case). The new GREEN negative-seed case MUST pass under the new gate (proving
   `.int()` did not over-restrict to `gte(0)`).
4. **`save_load.ts` is PROTECTED — expect ONE non-blocking warning, no hard error.**
   `scripts/verify-integrity.ts:53` lists `src/persist/save_load.ts` in `PROTECTED_FILES`; editing
   a PROTECTED file that still EXISTS surfaces a **non-blocking VERIFIER_TOUCHED warning**
   (verify-integrity.ts:269-283) — the precedented bug_0167/0176 path, NOT a hard error, NO
   `AI_LOOP_ALLOW_VERIFIER_EDITS` needed. A DELETED protected file or a removed PROTECTED/HASH_PIN
   entry is a hard error — do neither. The test file is not protected.
5. **DO NOT touch `src/core/rng.ts`, `scripts/verify-integrity.ts`, the scorecard, the corpus, or
   any generator.** No re-seal, no benchmark rebuild — this change does not move any pack hash,
   scorecard byte, or corpus seal. Keep blast radius to the one schema file + its adversarial test.

### What — numbered concrete steps

1. **Read first** (READ-ONLY): `src/core/rng.ts` (confirm `seed >>> 0` / `step >>> 0` at line 44),
   `src/core/state.ts:17-39` (seed/step are integers), `src/core/hash.ts` (`canonicalize` stringifies
   the raw value), `src/mcp/server.ts:147,157` (the entry `.int()` gate this restores symmetry with),
   and `scripts/verify-integrity.ts:43-53` (confirm `save_load.ts` is PROTECTED → warning path).

2. **Tighten the gate** (`src/persist/save_load.ts`, the `GameStateSchema`, lines 45-46):
   - `seed: z.number().finite(),` → `seed: z.number().int(),`
   - `step: z.number().finite(),` → `step: z.number().int().nonnegative(),`
   Update the schema doc comment (the lines 22-27 region) to note that seed/step are now gated to
   the INTEGER domain `rngForStep` consumes (`>>> 0`), restoring entry↔disk symmetry with the
   `server.ts:147` `.int()` gate (the finiteness gate on `vars` stays exactly as-is — it is the
   bug_0181 hole and is unrelated). Do NOT add sign/range bounds to seed (see CRITICAL #1).

3. **Add adversarial REJECTION witnesses** in
   `tests/regression/save_integrity_adversarial.test.ts`, inside the first `describe` block, after
   the `seed = Infinity` case (line 86), reusing the existing `forgeWithToken` helper:
   - `seed = 1.5` (fractional; `1.5 >>> 0 === 1` — would truncate to a different stream than its
     hash committed to): forge with token `"1.5"`, sanity-assert
     `JSON.parse(forged).state.seed === 1.5`, then `expect(() => load(forged, MICRO_CONTENT_HASH)).toThrow(SaveIntegrityError)`.
   - `seed = 4294967301` (> 2^32-1; `>>> 0 === 5`): token `"4294967301"`, same sanity + throw pattern.
   - `step = 1.5` (fractional): forge `{ ...microInitState(), step: s }` with token `"1.5"`, same
     sanity (`JSON.parse(forged).state.step === 1.5`) + throw pattern.
   (Use real numeric tokens valid in JSON — `1.5`, `4294967301` — NOT the `1e999` Infinity trick;
   these parse to finite non-integers, exactly the gap the new gate closes.)

4. **Add a GREEN over-restriction witness** in the second (`GREEN round-trip`) `describe` block:
   a state with a **negative integer seed** (e.g. `seed: -3, step: 0`, otherwise the micro/rich
   shape) MUST `load()` without throwing AND `hashState(loaded.state) === hashState(original)` —
   proving the new `.int()` gate accepts the full legitimate integer domain (incl. negatives the
   entry allows) and did NOT over-restrict to `gte(0)`. (`mulberry32(-3 >>> 0)` is well-defined.)

5. **NEW artifact** `traces/bugs/bug_0208_save_load_integer_identity_gate.yaml` in the
   bug_0207 format (id, title, kind: `engine_integrity` / `load_integrity`, mode: n/a, summary,
   root_cause, fix, out_of_band_teeth, regression_test, verification). Root cause: the disk/load
   boundary gated `seed`/`step` finiteness only (`z.number().finite()`) while the MCP entry boundary
   gates `.int()` (server.ts:147) — a forged save could inject a NON-INTEGER determinism identity
   the entry never accepts, which `rngForStep`'s `>>> 0` then truncates to a value diverging from the
   save's content hash. Fix: tighten the load gate to `seed: z.number().int()` /
   `step: z.number().int().nonnegative()`, restoring entry↔disk symmetry. out_of_band_teeth: the new
   rejection cases (`seed=1.5`, `seed=4294967301`, `step=1.5`) are RED against the pre-change
   `.finite()` schema (no throw) and the negative-seed GREEN case proves no over-restriction.
   regression_test: `tests/regression/save_integrity_adversarial.test.ts`.

6. **Verify** (key-free, offline, deterministic): `npx tsc --noEmit` clean; the updated test green
   (both new rejection cases throw, the new negative-seed case round-trips hash-identically, all
   pre-existing cases still pass); `npm run health` GREEN (EXIT 0); `npm run verify:integrity`
   reports only the **one expected non-blocking VERIFIER_TOUCHED** warning for
   `src/persist/save_load.ts` (PROTECTED-but-present) and NO GUARD_WEAKENED / PROTECTED_DELETED /
   HASH_PIN_UNACCOMPANIED / TEST/ASSERTION/STRONG count regression. Sanity that the witnesses are
   genuine: temporarily revert `save_load.ts:45-46` to `.finite()` locally → the 3 new rejection
   cases FAIL (no throw); restore — do NOT commit that experiment.

### Exact files

- **READ-ONLY**: `src/core/rng.ts`, `src/core/state.ts`, `src/core/hash.ts`, `src/mcp/server.ts`,
  `scripts/verify-integrity.ts`.
- **EDIT**: `src/persist/save_load.ts` (the `seed`/`step` gate + doc comment);
  `tests/regression/save_integrity_adversarial.test.ts` (3 rejection cases + 1 GREEN negative-seed
  case).
- **NEW**: `traces/bugs/bug_0208_save_load_integer_identity_gate.yaml`.
- **DO NOT EDIT / DO NOT REGENERATE**: `src/core/rng.ts`, `scripts/verify-integrity.ts` (and its
  PROTECTED_FILES / HASH_PIN_FILES / MIN_* sets), the scorecard, the corpus, any generator. No
  re-seal, no benchmark rebuild (no pack hash / scorecard byte / corpus seal moves).

### Acceptance check (concrete / verifiable)

- `src/persist/save_load.ts` gates `seed: z.number().int()` and `step: z.number().int().nonnegative()`;
  the `vars`/`flags`/`objectState` gates are UNCHANGED.
- `tests/regression/save_integrity_adversarial.test.ts`: the 3 new rejection cases (`seed=1.5`,
  `seed=4294967301`, `step=1.5`) throw `SaveIntegrityError` and FAIL (no throw) against the
  pre-change `.finite()` schema (genuine witness); the new GREEN negative-seed (`seed:-3`) case
  round-trips with `hashState` unchanged; all pre-existing cases still pass.
- `npm run health` GREEN (EXIT 0); `npm run verify:integrity` EXIT 0 with exactly ONE non-blocking
  VERIFIER_TOUCHED warning (`src/persist/save_load.ts`) — NO GUARD_WEAKENED / PROTECTED_DELETED /
  HASH_PIN_UNACCOMPANIED / count regression. No floor lowered, no matcher relaxed, no test
  skipped/deleted. No `AI_LOOP_ALLOW_VERIFIER_EDITS` needed.
- `traces/bugs/bug_0208_save_load_integer_identity_gate.yaml` exists in the bug_0207 format.
- No pack hash, scorecard byte, or corpus seal moved (the change touches one schema file + its test).

## Hard constraints (every cycle)

- Key-free / offline / deterministic: no outbound model calls, no wall-clock, no RNG.
- ONE focused STRUCTURAL change (not content polish); additive/strengthening only; NEVER weaken a
  check (no lowering `MIN_*` / `GEN_EVAL_CHECK_COUNT` / `SATURATION_FLOOR`, no relaxing matchers, no
  `GUARD_WEAKENED`, no shrinking PROTECTED/HASH_PIN lists).
- Keep the game playable and `npm run health` green.

## Reward-hacking guardrails (from the web research — bake these in)

- **PITFALL: over-claiming a soundness exploit (Goodhart / inflated severity).** GUARD: framed
  honestly as boundary-symmetry / type-confusion hardening, NOT an unlock-exploit; the witness is
  the entry↔disk asymmetry (server.ts:147 `.int()` vs save_load.ts:45 `.finite()`), not a
  reachable always-true gate.
- **PITFALL: difficulty/strictness bought by breaking legitimate inputs** (setter-solver
  feasibility, EvilGenie arXiv:2511.21654). GUARD: the GREEN negative-seed round-trip witness pins
  the legitimate domain stays accepted — the gate matches the entry boundary EXACTLY (`.int()`, no
  sign/range bound), so no real save is false-rejected.
- **PITFALL: a present-but-incomplete checker fed only well-behaved input** (ASL arXiv:2510.14253;
  SoundnessBench arXiv:2412.03154). GUARD: adversarial REJECTION-direction witnesses (forged
  non-integer seed/step) that are RED against the old gate — the same oracle the existing
  `seed=Infinity` / forged-save suite uses.
- **PITFALL: re-seal / scorecard blast radius.** GUARD: this change moves NO pack hash, scorecard
  byte, or corpus seal — `save_load.ts` + its test only; no `corpus:seal`, no benchmark rebuild.

## Rejected alternatives (this cycle)

- **`seed` gate `gte(0).lte(0xffffffff)`** (the raw synthesis proposal) — WRONG: would false-reject
  legitimate negative-seed saves the entry boundary (`server.ts:147` bare `.int()`) allows. Use
  `.int()` to match the entry exactly.
- **TextQuests dual-metric "harm" axis on the scorecard** — valuable but MEDIUM effort, requires a
  `run_playtest` return-field change AND a scorecard rebuild (bug_0194 freshness pin) = much larger
  blast radius; and the coverage bot floors out on the puzzle modes, so a harm metric would be thin.
- **Metamorphic isomorphic-relabel / IPT oracle over packs** — a strong research-class idea but
  MEDIUM effort with new oracle infrastructure (a `relabelPack` bijection across exits/conditions/
  effects); not a named live defect. Defer to a future cycle.
- **`validateParser` known-shallow negative corpus** — additive and precedented (bug_0182) but it
  hardens an already-correct validator (test-only value); weaker than closing a real boundary gap.
- **MCP path-confinement fuzz of `safeResolve`** — `safeResolve` is empirically already sound;
  regression-hardening of a correct boundary, not a live-defect fix.
- **Keyed real-model author→play→fix→lock run** — OWNER-API-KEY-GATED; out of scope for a key-free
  cycle. Remains the standing true-goal keystone ([[ultraplan-true-goal-pivot]]).
- **More breadth/content packs / parser v4 deepen** — content (saturated, all 15 blind-clean) or
  unwarranted (the per-mode scorecard shows parser at parity 16.5%/16.7%, not re-inverted).

## Deferred to next cycle

1. The keyed real-model author→play→fix→lock run (owner-API-key-gated) — the standing keystone.
2. The TextQuests harm axis on the scorecard (needs a run_playtest field + scorecard rebuild).
3. The metamorphic relabel/IPT oracle (a key-free contamination/robustness oracle, medium effort).

## Mandated blind playtest (this cycle)

Per the dedicated-pass rotation ([[assessor-blind-pass-rotation]]), the orchestrator runs the
mandated blind pass on the most-overdue dedicated target, deliberately deviating from the harness's
recency-blind nominee (`lamplighters_round`, blind-played clean LAST cycle bug_0206) so the rotation
does not re-freeze. Reading the dedicated-pass log newest→oldest, the most-overdue is
**watchtower_road** (CYOA, last dedicated pass bug_0182) — a branch-walk-legibility target where the
blocked-exit hint is a no-op (CYOA has no exits), exercising a different surface than the recent
RPG/parser passes. Report to `ai-runs/2026-06-03T21-51-53-950Z/playtest.md` (the loop.sh-required
path). Record "Mandated blind pass ran on watchtower_road" in the AI_LOOP_STATE.md cycle entry
(newest-first). Handled by the orchestrator, not the implementation subagent.
