# Current plan (rolling)

This is the AFK loop's **living plan** — the hand-off document for the
saturation-triggered ultraplan (see [`docs/afk_loop.md`](./afk_loop.md)). When the
deterministic assessor runs dry (`isSaturated`), an ultraplan cycle re-aims the
project, **overwrites this file** with the synthesis + the single chosen next move,
and a fresh implementation subagent reads _only_ this file (plus the files it names)
to do the work.

---

## Synthesis — re-aim cycle #6 (2026-06-03)

The deterministic content assessor is SATURATED (every structural content lever disarmed;
blind passes return the flat 0.5 floor — `SATURATION_FLOOR=0.5`, src/afk/assessor.ts) and
all 14 packs are blind-clean. A bounded ultraplan ran this cycle — **4 repo reviewers**
(engine/determinism · content/authoring+generators · verification/benchmark · loop/strategy)
**+ 2 web researchers** (frontier IF/agentic benchmarks · autonomous-improvement reward-hacking)
**→ 1 synthesis**, each verified against the live repo at HEAD≈bug_0198.

**Convergent verdict.** The CLOSED arcs are confirmed done (load-integrity on save+trace
bug_0181–0190; negative-corpus oracle bug_0182; MCP authoring/generation symmetry bug_0192/0193;
scorecard freshness-pin bug_0194; benchmark gap-erosion defused via the per-mode slice bug_0198;
exhaustive structural solvers across all 3 modes; the **RPG generator deepen arc** bug_0168–0174).
The engine reviewer found **NO open soundness/determinism hole** (defense-in-depth at every
untrusted-input boundary). The one **genuinely-open, in-scope, measured, key-free STRUCTURAL
lever** is the **last un-deepened generator**: the PARSER generator.

**The measured defect (this is the witness, not a guess).** bug_0198's mode-matched benchmark
found the parser **curated→held-out gap is INVERTED (−0.058)**: the procedural parser GENERATOR
mints packs the coverage bot finds *easier* (held-out 22.2%) than the hand-authored parser packs
(curated 16.4%). That is the textbook "environment too easy / spec too weak" reward-hacking signal
(EvilGenie, arXiv:2511.21654). The RPG generator already went v1→v3 with a full deepen +
validator-soundness + independent-cross-check arc; the **parser generator got a single v2 tier
(bug_0168) and stopped** — `PARSER_GENERATOR_VERSION = 2` (src/gen/parser_generator.ts:59), fixed
rooms `entrance/hub/goal` (lines ~469–509), assembled invariantly (line ~636).

## Chosen move: deepen the PARSER generator v2→v3 + ship its validator-INDEPENDENT depth oracle

Mirror the CLOSED RPG generator-deepen arc (bug_0168–0174), step-for-step, on the parser
generator: grow the emitted shape by **one lock tier and one gated room on the win path**
(depth-2 → depth-3 obtainability chain), and co-ship a **validator-independent depth oracle +
known-shallow negative corpus** that REJECT any pack below the depth bar — locked by a
`PARSER_GENERATOR_VERSION` 2→3 bump, a corpus re-seal, and a scorecard rebuild.

This is chosen because it (1) closes a **named, measured** defect (not a hypothetical), (2) is
key-free / offline / deterministic and **additive** (new floor + new independent oracle, no check
weakened), (3) has the **strongest rejection-direction oracle available for free** — the
tier-knockout technique `parser_generator_two_tier_chain.test.ts` already pioneered, recomputed
from emitted content (never a generator-stamped field), and (4) **completes the generator trilogy**
on a precedented path the RPG arc already paid in full.

### CRITICAL directions (what NOT to get wrong)

1. **The oracle must be VALIDATOR-INDEPENDENT and recomputed from emitted content.** The DGM
   lesson (arXiv:2505.22954): any depth the generator *stamps* and a checker *reads back* is
   gameable (paper-deep, practice-easy). Compute depth by the **tier-knockout** method — remove
   each enabling `TAKE` via the solver's `explore` action filter and assert the win becomes
   unreachable — proving each tier is load-bearing. NEVER assert a `depth: N` field the generator wrote.
2. **Pin BOTH directions** (setter-solver feasibility, the EvilGenie requirement): harder
   (≥3 load-bearing tiers; held-out bot score drops) AND still solvable (every declared ending
   reachable via the bug_0121/0122 exhaustive solver, `cappedOut=false`). Difficulty must NOT be
   bought by making packs unsolvable.
3. **Re-seal + rebuild via the SANCTIONED CLIs only — never hand-edit.** `corpus/manifest.json`
   and `src/gen/parser_generator.ts` are PROTECTED; editing them surfaces a **non-blocking
   VERIFIER_TOUCHED warning** (scripts/verify-integrity.ts:269–283) behind the version bump —
   this is exactly the path the RPG v2→v3 arc used (bug_0167/0176), NOT a hard error and NO
   `AI_LOOP_ALLOW_VERIFIER_EDITS` needed. `traces/benchmark/scorecard.{json,md}` are NOT
   hash-pinned (bug_0194 used the freshness *test* instead) — regenerate them and the freshness
   test re-passes against the new bytes. A DELETED protected file or an UNACCOMPANIED hash-pin
   re-pin would be hard errors — do neither.
4. **Never weaken a check.** No lowering `MIN_*` floors / `GEN_EVAL_CHECK_COUNT` /
   `SATURATION_FLOOR`, no relaxing matchers, no skipped/deleted tests, no shrinking
   PROTECTED_FILES/HASH_PIN_FILES. The change is purely ADDITIVE: deeper generator output + a new
   floor + a new independent oracle. Every minted seed must still pass `validateParser` with ZERO
   findings.
5. **Keep blast radius minimal.** The load-bearing depth increase is the **3rd lock tier**; the
   extra room exists only to host it. Keep the new room's object set minimal and the non-win rooms
   strongly connected (no `SOFTLOCK_QUEST_ITEM`); verify `cappedOut=false` so the added tier does
   not blow the solver's `MAX_STATES` cap. Lean on the RPG template
   (`tests/regression/rpg_generator_cumulative_survival.test.ts`) and the existing
   `parser_generator_two_tier_chain.test.ts` for the exact patterns.

### What — numbered concrete steps

1. **Read first** (READ-ONLY):
   - `src/gen/parser_generator.ts` in full — themes (~lines 69–436), the version stamp (line 59),
     the room defs (~469–509), and the assembly (~453–649). Learn the exact emitted shape: 3 rooms
     (entrance/hub/goal), 7 objects (clue, coffer, lesserKey, strongbox, key, gate, hazard), the
     depth-2 chain (lesser key in unlocked entrance coffer → opens LOCKED hub strongbox → holds the
     GREAT key → opens goal gate AND a telegraphed death hazard), 2 endings, 15-pt economy (5+5+5).
   - `tests/regression/parser_generator_two_tier_chain.test.ts` — the version assertion (line ~32),
     and the tier-knockout "load-bearing" block (~lines 91–115) you will extend to the 3rd tier.
   - `tests/unit/parser_generator.test.ts` — the per-seed validateParser-clean + economy bar.
   - `tests/regression/rpg_generator_cumulative_survival.test.ts` — the **template** for a
     validator-INDEPENDENT, multi-seed, both-directions deep-oracle test.
   - `tests/regression/support/exhaustive_endings.ts` — `exhaustiveEndings` returns `reached`
     (endings) + `states` (solver work) + supports `explore` action filters (the knockout lever);
     `cappedOut` tells you if `MAX_STATES` was hit.
   - `src/validate/parser_validator.ts` — the obtainability fixpoint / soft-lock / dialogue / score
     bar every mint must still clear with ZERO findings (DO NOT EDIT — it is PROTECTED and the bar).
   - `src/parser/model.*` + `src/parser/runner.*` — `indexParserPack` / `initStateForParserPack` /
     `buildParserRules` (how to build rules for the solver).
   - `bin/seal-corpus.ts` + `tests/regression/held_out_corpus_sealed.test.ts` — how the corpus
     re-mints and how version match is checked.

2. **Deepen the generator ADDITIVELY** (`src/gen/parser_generator.ts`): grow the spine from
   `entrance→hub→goal` to `entrance→hub→inner→goal` (add ONE gated room), keeping the non-win
   pair strongly connected so no quest-critical item can be stranded. Add a **THIRD lock tier**:
   `lesser_key` (entrance coffer, unlocked) → opens `strongbox` (hub, locked) holding a **MIDDLE
   key** → opens a new `inner_chest`/`inner_door` (inner room, locked) holding the **GREAT key** →
   opens the goal gate AND the telegraphed death hazard. This lifts the obtainability fixpoint to
   **depth-3 across ≥3 rooms**. Add the matching per-theme fields (one new container + one new key
   noun per theme entry) keeping every `*Name`/`*Alias` mutually distinct (no `AMBIGUOUS_ALIAS`).
   Extend the score economy with one new one-shot milestone (e.g. +5 on the new unlock → max_score
   15→20); keep EVERY award one-shot / non-farmable exactly as the existing strongbox/gate awards
   (gated `set_flag` / unlock-intrinsic). Keep the function PURE (no `Date`/`Math.random`) and keep
   the trailing `ParserPackSchema.parse(...)` self-check.

3. **Bump the version**: `PARSER_GENERATOR_VERSION` 2→3 (line 59) and rewrite the header doc
   (~lines 17–58) to describe the depth-3 chain, the inner room, and the new economy.

4. **Confirm every minted seed still validates clean & solvable**: run the unit suite
   (`npx vitest run tests/unit/parser_generator.test.ts`) — every seed must pass `validateParser`
   with ZERO findings and stay exhaustively solvable. Fix the emitted shape until green WITHOUT
   relaxing any validator check.

5. **NEW `tests/regression/parser_generator_depth_floor.test.ts`** — the validator-INDEPENDENT
   depth oracle, modeled on `rpg_generator_cumulative_survival.test.ts`. Over a fixed ≥12-seed
   window, for each seed build rules via `buildParserRules(indexParserPack(pack))` and assert:
   - **(POSITIVE / liveness)** `exhaustiveEndings` reaches BOTH `ending_win` AND `ending_doom`,
     `cappedOut=false` (still fully solvable — the bug_0121/0122 solver).
   - **(DEPTH FLOOR, independently recomputed)** ≥3 DISTINCT mandatory ordered state-flips on the
     win path, proven by tier-knockout: removing the `lesser_key` TAKE ⇒ neither ending reachable;
     removing the MIDDLE key TAKE ⇒ win unreachable; removing the GREAT key TAKE ⇒ win unreachable.
     Each tier proven load-bearing from emitted content, never a generator field.
   - **(SOLVER-WORK floor, secondary)** the deepened mint's `states` count exceeds a constant
     lower bound captured once from a v3 run (a pinned numeric floor).

6. **Same file — KNOWN-SHALLOW NEGATIVE CORPUS** (SoundnessBench / bug_0182 pattern): build 2–3
   in-memory `ParserPack`s crafted to LOOK deep but be shallow (e.g. extra keys/locks that do NOT
   chain — every key freely takeable so true obtainability depth is 1; or a strongbox whose
   `key_id` points at a freely-takeable key, bypassing the tier). Assert the depth oracle's
   tier-knockout **REJECTS** them (removing a tier's key still leaves the win reachable ⇒ depth <
   floor ⇒ the helper flags it). This proves the oracle is adversarial, not a naive
   #keys×#locks or a self-reported count (the DGM trap). Each negative case MUST be red against a
   naive metric and correctly rejected by the knockout oracle — a genuine witness, not vacuous green.

7. **Update the existing shape locks**: in `parser_generator_two_tier_chain.test.ts` change the
   version assertion to `=== 3`, add assertions for the new middle key / inner room / 3rd
   container, and extend the load-bearing block to prove the MIDDLE tier load-bearing too. In
   `tests/unit/parser_generator.test.ts` update the economy assertion to the new `max_score`.

8. **Re-seal the held-out parser corpus** via the sanctioned CLI ONLY: `npm run corpus:seal`
   (re-mints `corpus/parser/*.yaml` and re-stamps `corpus/manifest.json` to generator_version 3).
   `held_out_corpus_sealed.test.ts` then verifies re-mint determinism + version match. Do NOT
   hand-edit the manifest or the corpus yaml.

9. **Rebuild the benchmark scorecard** at the committed runs (50):
   `npm run benchmark -- --runs 50 --out traces/benchmark/scorecard` so
   `benchmark_scorecard_fresh.test.ts`'s byte-pin re-passes. Confirm the per-mode **parser
   held-out** score has DROPPED toward/below curated (the inverted gap closing on the SAME
   coverage bot). Only ADD an assertion to `benchmark_mode_matched_contamination.test.ts` if the
   parser cell now genuinely supports it — never weaken the CYOA assertions.

10. **NEW artifact `traces/bugs/bug_0199_parser_generator_depth_deepen.yaml`** in the
    bug_0196/bug_0198 format (id, title, kind: generator_deepen, mode: parser, summary, root_cause,
    fix, out_of_band_teeth, regression_test, verification). Root cause: bug_0198's mode-matched
    benchmark found the parser held-out split bot-EASIER than curated (gap inverted −0.058); the
    parser generator stopped at the single v2 tier while RPG went to v3 — generated parser packs
    were structurally shallower than authored. Fix: deepen to depth-3 (3rd lock tier + inner room),
    bump `PARSER_GENERATOR_VERSION` 2→3, re-seal corpus + rebuild scorecard, lock with the
    validator-INDEPENDENT tier-knockout depth oracle + known-shallow negative corpus.
    `out_of_band_teeth`: the new test rejects 2–3 known-shallow forged packs (must be red pre-fix /
    against a naive metric) AND pins liveness both-ways; the rebuilt scorecard shows the parser
    held-out score dropping. `regression_test: tests/regression/parser_generator_depth_floor.test.ts`.

11. **Verify** (key-free, offline, deterministic): `npx tsc --noEmit` clean; the new + updated
    tests green; `npm run health` GREEN (EXIT 0); `npm run verify:integrity` reports only the
    expected non-blocking VERIFIER_TOUCHED warnings for the PROTECTED generator + manifest re-seal
    (NO GUARD_WEAKENED / PROTECTED_DELETED / HASH_PIN_UNACCOMPANIED / count regression). Sanity that
    the depth oracle's witnesses are genuine: against the PRE-CHANGE v2 generator the ≥3-tier
    assertion FAILS (v2 has only 2 load-bearing tiers) — confirm, then restore; do NOT commit that
    experiment.

### Exact files

- **READ-ONLY**: `src/validate/parser_validator.ts`, `src/parser/model.*`, `src/parser/runner.*`,
  `tests/regression/support/exhaustive_endings.ts`,
  `tests/regression/rpg_generator_cumulative_survival.test.ts`,
  `tests/regression/held_out_corpus_sealed.test.ts`, `bin/seal-corpus.ts`.
- **EDIT**: `src/gen/parser_generator.ts` (deepen + version 2→3 + header doc);
  `tests/regression/parser_generator_two_tier_chain.test.ts` (version + new-tier assertions);
  `tests/unit/parser_generator.test.ts` (economy/max_score).
- **NEW**: `tests/regression/parser_generator_depth_floor.test.ts`;
  `traces/bugs/bug_0199_parser_generator_depth_deepen.yaml`.
- **REGENERATE via CLI only (do NOT hand-edit)**: `corpus/manifest.json` + `corpus/parser/*.yaml`
  (`npm run corpus:seal`); `traces/benchmark/scorecard.{json,md}`
  (`npm run benchmark -- --runs 50 --out traces/benchmark/scorecard`).
- **DO NOT EDIT**: `scripts/verify-integrity.ts` and its PROTECTED_FILES / HASH_PIN_FILES /
  MIN_* sets.

### Acceptance check (concrete / verifiable)

- `PARSER_GENERATOR_VERSION === 3` everywhere it is asserted; the generator emits a depth-3 chain
  (3 load-bearing lock tiers across ≥3 rooms) and every minted seed returns ZERO `validateParser`
  findings and every declared ending reachable via `exhaustiveEndings` (`cappedOut=false`).
- `tests/regression/parser_generator_depth_floor.test.ts` passes: liveness both-ways pinned; the
  ≥3-tier knockout floor holds on v3 mints AND **fails on the pre-change v2 generator** (genuine
  witness); the known-shallow negative corpus is REJECTED by the oracle.
- `corpus/manifest.json` parser entries stamp generator_version 3 and re-mint byte-identically
  (`held_out_corpus_sealed.test.ts` green); `traces/benchmark/scorecard.{json,md}` are the
  byte-identical runs=50 rebuild (`benchmark_scorecard_fresh.test.ts` green) and the per-mode
  parser held-out score has dropped toward/below curated (inverted gap closing).
- `npm run health` GREEN (EXIT 0); `npm run verify:integrity` EXIT 0 with only the expected
  non-blocking VERIFIER_TOUCHED warnings (PROTECTED generator + manifest re-seal behind the version
  bump) — NO GUARD_WEAKENED / PROTECTED_DELETED / HASH_PIN_UNACCOMPANIED / TEST/ASSERTION/STRONG
  count regression. No floor lowered, no matcher relaxed, no test skipped/deleted. No
  `AI_LOOP_ALLOW_VERIFIER_EDITS` needed.
- `traces/bugs/bug_0199_parser_generator_depth_deepen.yaml` exists in the bug_0198 format.

## Hard constraints (every cycle)

- Key-free / offline / deterministic: no outbound model calls, no wall-clock, no RNG.
- ONE focused STRUCTURAL change (not content polish); additive/strengthening only; NEVER weaken a
  check (no lowering `MIN_*` / `GEN_EVAL_CHECK_COUNT` / `SATURATION_FLOOR`, no relaxing matchers, no
  `GUARD_WEAKENED`, no shrinking PROTECTED/HASH_PIN lists).
- Keep the game playable and `npm run health` green.
- Bump `PARSER_GENERATOR_VERSION` and re-seal/rebuild via the sanctioned CLIs ONLY — never
  hand-edit `corpus/manifest.json` or the scorecard (this is the precedented RPG-arc deepen path).

## Reward-hacking guardrails (from the web research — bake these in)

- **PITFALL: paper-deep / practice-easy generator drift** (frozen-verifier trap, arXiv:2510.14253;
  DGM test-log faking, arXiv:2505.22954). GUARD: the oracle recomputes depth from emitted content
  via tier-knockout — NEVER a generator-stamped field — plus the known-shallow negative corpus
  (SoundnessBench / bug_0182), so the bar is adversarial-by-construction and cannot be cleared by
  superficial correlates (more nominal keys, longer prose — Goodhart degeneracy).
- **PITFALL: difficulty bought by unsolvability** (setter-solver feasibility, EvilGenie
  arXiv:2511.21654). GUARD: pin BOTH directions — liveness (every ending still reachable via the
  exhaustive solver) AND harder (held-out bot score drops; ≥3 load-bearing tiers).
- **PITFALL: re-seal blast radius.** GUARD: bump the version and regenerate via `corpus:seal` /
  the benchmark CLI only; a hand-edit or an unbumped version trips verify:integrity.
- **PITFALL: SOFTLOCK from the new room.** GUARD: keep the non-win rooms strongly connected; the
  validator's SOFTLOCK check + the all-endings solver catch a stranded quest-critical key loudly.
- **PITFALL: BFS state explosion** (`MAX_STATES`). GUARD: keep the new room's object set minimal;
  assert `cappedOut=false` in the depth test.

## Rejected alternatives (this cycle)

- **ratio() zero-denominator guard (src/afk/benchmark.ts)** — real but NON-triggerable (no shipped
  or minted pack has zero declared endings/scenes; `benchmark_held_out_split.test.ts` already
  asserts `scenes_total>0`). Closes no measured defect. Fold in later as a 1-line `den>0 ? r/d : 0`
  if desired; not the highest-value move.
- **Bare `MIN_CHAIN_DEPTH` in validateParser / a generator-self-reported depth field** — the DGM
  trap: any depth the generator stamps and the validator reads back is gameable. The oracle MUST
  independently recompute depth. Rejected in favor of the tier-knockout oracle.
- **Cross-mode `MIN_SPLIT_GAP` composition-robustness check** — already defused by the per-mode
  slice (bug_0198); redundant.
- **Keyed real-model author→play→fix→lock run** — OWNER-API-KEY-GATED; out of scope for a key-free
  cycle. Remains the standing true-goal keystone ([[ultraplan-true-goal-pivot]]).
- **More breadth/content packs** — content, not structural; the assessor is saturated and all 14
  packs are blind-clean.

## Deferred to next cycle

1. The keyed real-model author→play→fix→lock run (owner-API-key-gated) — the standing keystone.
2. ratio() zero-denominator hardening in src/afk/benchmark.ts (defensive; non-triggerable today).
3. If parser v3 still reads bot-easier than authored after the rebuild, a v4 deepen (variable
   room topology / side rooms) is the follow-on — but only if the rebuilt scorecard still shows an
   inverted parser gap.

## Mandated blind playtest (this cycle)

The orchestrator runs the mandated blind pass this cycle on **cold_forge** (RPG) — the
least-recently blind-played pack per the dedicated-pass rotation ([[assessor-blind-pass-rotation]];
last dedicated pass bug_0179), deliberately deviating from the harness/assessor recency-blind rank-1
(`breaking_weir`, just blind-played bug_0197) so the rotation does not re-freeze. Report to
`ai-runs/2026-06-03T19-22-13-643Z/playtest.md`. Record "Mandated blind pass ran on cold_forge" in
the AI_LOOP_STATE.md cycle entry (newest-first). Handled by the orchestrator, not the implementation
subagent.
