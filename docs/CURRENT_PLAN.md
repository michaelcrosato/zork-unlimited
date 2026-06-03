# Current plan (rolling)

This is the AFK loop's **living plan** — the hand-off document for the
saturation-triggered ultraplan (see [`docs/afk_loop.md`](./afk_loop.md)). When the
deterministic assessor runs dry (`isSaturated`), an ultraplan cycle re-aims the
project, **overwrites this file** with the synthesis + the single chosen next move,
and a fresh implementation subagent reads _only_ this file (plus the files it names)
to do the work.

---

## Ultraplan synthesis — 2026-06-03 (re-aim cycle #4)

Produced by a bounded local ultraplan (4 repo reviewers — engine/determinism ·
content/authoring · verification&benchmark · loop/strategy — + 2 web researchers →
1 synthesis), grounded in [`docs/ULTRAPLAN-2026-06-02.md`](./ULTRAPLAN-2026-06-02.md)
and verified against the **live tree** (not the stale doc layer). It **advances** the
strategic layer; it does not restart it.

The prior re-aim cycles' chosen moves have all shipped: the cumulative-HP combat
soundness bound (bug_0172), generator guarantee re-tune + corpus re-seal (bug_0173),
the validator-independent worst-roll cumulative-survival cross-check (bug_0174), the
sealed held-out corpus manifest brought under the verifier-integrity guard (bug_0176),
and the benchmark headline-score work with its no-regression band (bug_0177/0178). The
content backlog is blind-saturated (10 packs clean), the deterministic assessor sits at
its 0.5 floor by construction, and the loop has visibly **drifted into one-pack churn**:
bug_0179 (`cold_forge` plate) and bug_0180 (`sunken_barrow` ward) are both single-pack
"curated combat load-bearing" pins — the exact frozen-verifier+frozen-content churn the
ULTRAPLAN warns about. bug_0180's own "next focus" concedes "that curated-combat slice is
closed." This cycle de-bundles cleanly off that churn onto the **last genuinely-open
soundness hole** in the engine.

## Where the project stands (verified this cycle)

- **`load()` casts an untrusted save payload straight into the engine with NO
  structural or finiteness validation of `bundle.state`.** `src/persist/save_load.ts:55`
  does `const bundle = parsed as SaveBundle;` and (after checking only `version`,
  `contentHash`, `mode` at lines 56–69) `return bundle;` at line 70. The state shape is
  never validated. This is the §16 "integrity at load" promise stated in the file's own
  header (lines 5–7) but only **half** kept — the contentHash check guards *which pack*,
  nothing guards *whether the state is well-formed*.
- **A forged/poisoned save bypasses every existing finite-guard.** The effects-layer
  guard (`src/core/effects.ts:77–87` `guardFinite`, plus the schema literal-check at
  `effects.ts:17–18`) only fires on **effect application** during play. It never runs on
  a load-injected value. `JSON.parse('{"...":1e999}')` yields `Infinity`; `"x"` for a
  numeric var, a missing `current`, a non-boolean `flags` value, etc. all parse through
  untouched.
- **A non-finite var then silently corrupts gate logic.** `src/core/conditions.ts:75–77`:
  `var_gte` is `(state.vars[name] ?? 0) >= value` — with `Infinity` it is **always true**
  (a forged save unlocks every `var_gte`-gated route, ending, win); with `NaN` every
  `var_gte`/`var_lte`/`var_eq` is **always false** (silently locks the game). `VarCmp`
  (`conditions.ts:12`) is a plain `z.number()` on the *content* side and never sees the
  *loaded* operand.
- **The MCP surface a real frontier model drives is exactly where this lands.**
  `load_game` (`src/mcp/tools.ts:842–854`) takes an arbitrary `args.save` string and
  feeds `bundle.state` straight into `startSession(mode, compiled, bundle.state)` →
  engine. This is the load→replay→play path the contamination-free benchmark's
  credibility rests on (ULTRAPLAN §16). A hand-forged save is the single unguarded entry
  point into the otherwise-pure deterministic engine.
- **Coverage is happy-path only.** The property tests
  (`tests/property/determinism.test.ts`, `parser_determinism.test.ts`) only round-trip
  **engine-produced** states; `tests/unit/save_trace.test.ts:21–39` covers version,
  hash-mismatch, and a clean round-trip. **No adversarial/forged-save test exists** — the
  rejection direction (the SoundnessBench lesson below) is entirely untested.
- **`src/persist/save_load.ts` is already in `PROTECTED_FILES`** (`scripts/verify-integrity.ts:53`),
  so the edit surfaces an **expected, non-blocking `VERIFIER_TOUCHED`** warning — a
  strengthening, never a `GUARD_WEAKENED` (same as the bug_0176 manifest edit).
- **All other engine/determinism gaps the reviewers probed are SHIPPED** (do not re-do):
  per-step divergence localization (`src/trace/replay.ts:44–83`, MCP-surfaced, locked by
  `tests/regression/inspect_trace_divergence.test.ts`); `hideGraph` hidden-graph mode end
  to end; effect-layer non-finite guards; recursive canonicalization
  (`src/core/hash.ts:13–28`); seeded pure RNG.

**Why this move wins this cycle.** The reward-hacking / self-improvement literature this
repo already cites is unanimous on the shape of the credible move. **SoundnessBench**
(arXiv:2412.03154, TMLR Dec 2025) shows a verifier is only credibly sound if it
**rejects instances that are known-bad by construction** — not merely accepts the ones it
is fed; it caught real soundness bugs in three established verifiers precisely by planting
hidden counterexamples. The repo today tests only the *acceptance* direction at the load
boundary; the *rejection* direction is the open hole. **ASL** (arXiv:2510.14253, cited in
bug_0176) names a *present-but-incomplete checker* fed only well-behaved input as the
canonical exploit surface — `load()` is exactly that. **EvilGenie** (arXiv:2511.21654)
confirms held-out/happy-path coverage is a *necessary-but-weak* filter that needs a
structural ground-truth oracle alongside it; the offline, key-free analogue of its
LLM-judge is a **construction-based negative test** (forged saves that load() MUST
hard-error). Closing a live load-integrity soundness hole is strictly higher-credibility,
offline, than another reporting metric with no signal yet, and it is the only **engine**
soundness gap left open. The fix is purely **additive** (every valid engine-produced state
still round-trips byte-identically — validation runs *before* hashing, so no hash moves),
**strengthens** the bar (adds a rejection oracle; lowers no `MIN_*`/`GEN_EVAL_CHECK_COUNT`
floor, relaxes no matcher), is **S/M-effort** and surgical, **key-free/deterministic**,
and regresses zero curated content.

---

## Chosen move: STRUCTURAL + FINITENESS VALIDATION GATE AT `load()`

Add a strict structural+finiteness validation of `bundle.state` inside
`load()` (`src/persist/save_load.ts`), throwing `SaveIntegrityError` for any malformed or
non-finite save **before** the bundle is returned to the engine. This turns *"a loaded
save MUST be a well-formed, finite GameState"* into a declared, audited, **sound**
load-integrity property (§16), closing the one unguarded entry point into the pure engine.

### CRITICAL direction (do not get this wrong)

- The gate must **REJECT** (throw `SaveIntegrityError`), never coerce/clamp/repair. A
  poisoned save is an integrity failure, not a value to fix up — coercing it would launder
  garbage into a "valid" state and defeat the soundness claim.
- The validator must mirror `GameState` (`src/core/state.ts:17–39`) **exactly**, so it
  must accept **every** state any valid engine run can produce, or a legitimate save is
  wrongly rejected. Use the existing property-test state-walk as the green-side proof that
  every reachable state still loads.
- Keep the existing `version` → `contentHash` → `mode` checks **first and byte-unchanged**
  (their error messages are pinned by `save_trace.test.ts:30–33`); the new state-shape
  check runs **last**, after those, **before** `return bundle`.
- Numeric vars and `seed`/`step` must require `Number.isFinite` (rejects `Infinity`/`-Infinity`/`NaN`).
  This is the load-side complement to the effects-layer `guardFinite` (`effects.ts:77–87`),
  which never sees load-injected values.
- This is a **load gate**, not a condition-layer change. Do **NOT** edit
  `src/core/conditions.ts` this cycle (that belt-and-suspenders read-site fix is a rejected
  alternative below — it masks rather than rejects, and addresses the symptom not the root).

### What (numbered concrete steps)

1. **Read first** `src/persist/save_load.ts:44–71` (the `load()` body and the three
   existing integrity checks), `src/core/state.ts:9–39` (the exact `GameState` +
   `ObjectRuntime` shape the validator must mirror), and `src/core/conditions.ts:75–77`
   (the `var_gte`/`var_lte`/`var_eq` read sites that an `Infinity`/`NaN` var corrupts —
   the threat being closed). Confirm `import { z } from "zod";` is the idiomatic schema
   tool (used in `conditions.ts:9`, `effects.ts`).
2. In `src/persist/save_load.ts`, add a module-level `GameStateSchema` (a `z.object`,
   `.strict()` where the shape is closed) that mirrors `GameState` **field-for-field**:
   - `seed: z.number().finite()`, `step: z.number().finite()` (and integer if you confirm
     the engine only ever emits integers — verify against `initState`/`engine.ts` before
     adding `.int()`; if unsure, finite-only is the safe conservative gate).
   - `current: z.string()`, `endingId: z.string().nullable()`, `ended: z.boolean()`.
   - `visited: z.record(z.boolean())`, `flags: z.record(z.boolean())`.
   - `vars: z.record(z.number().finite())` — **this is the load-bearing finiteness gate.**
   - `inventory: z.array(z.string())`, `journal: z.array(z.string())`,
     `questStage: z.record(z.string())`.
   - `objectState: z.record(z.object({ open: z.boolean().optional(), locked:
     z.boolean().optional(), contents: z.array(z.string()).optional(), takenBy:
     z.enum(["player","world"]).optional(), room: z.string().optional() }).strict())`
     mirroring `ObjectRuntime` (`state.ts:9–15`).
3. Inside `load()`, **after** the `mode` check (line 69) and **before** `return bundle`
   (line 70), add:
   `const parsedState = GameStateSchema.safeParse((bundle as { state?: unknown }).state);`
   then `if (!parsedState.success) throw new SaveIntegrityError(\`Save state is malformed
   or non-finite: ${parsedState.error.message}\`);`. Return `bundle` unchanged afterward
   (do not substitute `parsedState.data` — the gate validates, it does not transform, so a
   valid state's bytes/hash stay identical).
4. **Do NOT** edit `src/core/conditions.ts`, `src/core/effects.ts`, `src/core/state.ts`,
   any matcher, any `MIN_*` floor, `GEN_EVAL_CHECK_COUNT`, or any
   `PROTECTED_FILES`/`HASH_PIN_FILES` entry. **Do NOT** touch the generator, the corpus,
   or the scorecard. The only source edit is the new schema + the one guard in `load()`.
5. Add a new adversarial regression suite
   `tests/regression/save_integrity_adversarial.test.ts` (a fresh file; do NOT modify the
   existing `tests/unit/save_trace.test.ts` cases). Build each forged save by
   `JSON.stringify`-ing a valid bundle (use `microInitState()` + `MICRO_PACK_ID` +
   `MICRO_CONTENT_HASH` from `src/demo/micro.ts` (imported via its `.js` ESM specifier),
   the pattern in `save_trace.test.ts:7–12`),
   then poisoning **one** field, and assert `expect(() => load(bytes, MICRO_CONTENT_HASH))
   .toThrow(SaveIntegrityError)`. Pin at minimum:
   - **WITNESS (the headline hole):** `state.vars.hp` set to the literal token `1e999` in
     the JSON string (parses to `Infinity`) → MUST throw. Add a sibling that, **without the
     gate**, would have made `evalCondition({var_gte:{name:"hp",value:N}}, state)` return
     `true` for arbitrarily large `N` (a comment citing `conditions.ts:75` is enough — the
     test asserts the throw).
   - **NaN var:** `state.vars.x` = `NaN` (write `"NaN"`→ no; force it via a numeric
     `0/0`-equivalent literal the JSON encodes, or post-process the parsed object then
     re-stringify so the byte carries a non-finite — assert throw).
   - **Wrong-type flag:** `state.flags.lever` = `"yes"` (string, not boolean) → throw.
   - **Missing required field:** delete `state.current` → throw.
   - **Malformed `objectState`:** `state.objectState.box = { open: "true" }` (string) → throw.
   - **GREEN side (regression guard, the false-rejection check):** a clean
     `save(microInitState(), …)` round-trips: `load(bytes, MICRO_CONTENT_HASH)` does **not**
     throw and `hashState(loaded.state)` equals `hashState(microInitState())` (mirrors
     `save_trace.test.ts:22–28`). Add a second green case round-tripping a state with
     **populated** vars/flags/inventory/objectState (e.g. play a few `microRules` actions
     forward via `recordTrace`/the engine, or hand-build a finite-but-rich state) to prove
     the gate accepts non-trivial valid states, not just `initState`.
6. Write `traces/bugs/bug_0181_save_load_integrity_gate.yaml` in the **bug_0176/bug_0180
   artifact format** (id, title, kind: engine, mode: meta, severity: enhancement, layer:
   persistence/load-integrity, `artifact.source: src/persist/save_load.ts`,
   `artifact.test: tests/regression/save_integrity_adversarial.test.ts`, plus
   `summary`/`what`/`why`/`verification` prose blocks). Cite: the §16 load-integrity
   promise was only half-kept (contentHash guarded *which pack*, nothing guarded state
   well-formedness); the `Infinity` witness flowing into `conditions.ts:75` `var_gte` (always
   true); that this is the SoundnessBench rejection-direction oracle (arXiv:2412.03154) and
   the ASL incomplete-checker surface (arXiv:2510.14253); that `save_load.ts` is a PROTECTED
   file so a `VERIFIER_TOUCHED` warning is **expected** and this is a strengthening, **NOT**
   a `GUARD_WEAKENED`; that every valid engine state still round-trips (no hash re-pin, no
   curated content touched). Include the cycle's mandated blind-playtest entry (rotate onto
   the least-recently-played pack per `[[assessor-blind-pass-rotation]]`; record "Mandated
   blind pass ran on `<pack>`" so the LRU rotation does not re-freeze).
7. Verify: `npx vitest run tests/regression/save_integrity_adversarial.test.ts
   tests/unit/save_trace.test.ts tests/property/determinism.test.ts` all green, then
   `npm run health` fully green.

### Exact files

- `src/persist/save_load.ts` — ADD the module-level `GameStateSchema` (mirrors
  `GameState`) + the single `safeParse`/throw guard in `load()` after the mode check,
  before `return bundle`. The version/contentHash/mode checks stay byte-for-byte as-is.
  (This file is in `PROTECTED_FILES`, `scripts/verify-integrity.ts:53` — the edit surfaces
  an expected, non-blocking `VERIFIER_TOUCHED`; a `GUARD_WEAKENED` is forbidden.)
- `tests/regression/save_integrity_adversarial.test.ts` — NEW. Forged-save rejection
  cases (Infinity var WITNESS, NaN var, wrong-type flag, missing `current`, malformed
  `objectState`) + the two green round-trip regression cases.
- `traces/bugs/bug_0181_save_load_integrity_gate.yaml` — NEW artifact (bug_0176 format).
- `src/core/state.ts` — **READ ONLY** (mirror its shape; do NOT edit).
- `src/core/conditions.ts` — **READ ONLY** (cite `var_gte` at :75 as the threat; do NOT edit).

### Acceptance check (concrete, verifiable)

- `npm run health` is fully GREEN; the only `verify:integrity` drift output is a
  non-blocking `VERIFIER_TOUCHED` for `src/persist/save_load.ts` — **NO `GUARD_WEAKENED`**,
  no `PROTECTED_DELETED`, no floor/matcher change, net test-case count **RISES**.
- The new regression proves the **WITNESS**: a save carrying `vars.hp: 1e999` (→`Infinity`)
  is now a hard `SaveIntegrityError` at `load()`, instead of flowing into `conditions.ts:75`
  and satisfying every `var_gte` gate.
- The NaN-var, wrong-type-flag, missing-`current`, and malformed-`objectState` forged saves
  each hard-error.
- **No false rejections:** the clean micro round-trip AND a rich finite state both load
  without throwing, and `hashState(loaded.state)` is **unchanged** (validation runs before
  hashing; valid-state bytes/hash are byte-identical, so no `HASH_PIN`/curated re-pin).
- `tests/unit/save_trace.test.ts` (existing version/hash-mismatch/round-trip cases) and
  the determinism property tests stay green unchanged.
- The committed held-out corpus, the generator, and the scorecard are **UNTOUCHED** — no
  `generator_version` bump, no re-seal; `held_out_corpus_sealed.test.ts` stays green.
- `traces/bugs/bug_0181_save_load_integrity_gate.yaml` exists in the bug_0176 format and
  records the mandated blind-pass pack.

---

## Hard constraints (every cycle)

- **Never weaken a check.** No edits to any `PROTECTED_FILES` semantics that lower a gate,
  no lowering of `MIN_*` floors or `GEN_EVAL_CHECK_COUNT`, no relaxing of matchers. This
  cycle only ADDS a stronger rejection gate.
- **One focused change.** The `load()` validation gate only. Do NOT edit `conditions.ts`,
  `effects.ts`, the generator, the corpus, or the scorecard; do NOT bump
  `generator_version` or re-seal.
- **Key-free / offline / deterministic.** No outbound model calls; no wall-clock; no
  nondeterministic RNG. (The gate is a pure synchronous `zod` parse.)
- **Reject, don't repair.** A malformed/non-finite save throws `SaveIntegrityError`; never
  coerce or clamp.
- **Do NOT commit** `ai-runs/`, `node_modules/`, `dist/`, `coverage/`, or `saves/*.json`.
- **Rotate + record the mandated blind playtest** onto the least-recently-played pack and
  write "Mandated blind pass ran on `<pack>`" in this cycle's `AI_LOOP_STATE.md` entry, or
  the LRU rotation re-freezes (`[[assessor-blind-pass-rotation]]`).

---

## Rejected alternatives (this cycle)

- **Belt-and-suspenders: make `VarCmp`/comparison helpers in `conditions.ts` reject
  non-finite operands** — weaker, narrower fix. It addresses the *symptom* at one read site
  and could **mask** rather than reject a poisoned save (the rest of the malformed state
  still flows into the engine). The load gate is the root fix; this read-site defense is
  redundant once `load()` rejects the save outright. Do not do it this cycle.
- **Freshness-pin / `PROTECTED_FILES`-pin the committed `traces/benchmark/scorecard.*`** —
  a clean, low-risk verification-hygiene win (the scorecard is the last unguarded committed
  benchmark artifact; verified byte-identical to a runs=50 rebuild today). But it is a
  **reporting-artifact** guard, not an **engine soundness** close: it catches stale-drift of
  a published number whose discriminative signal is itself unproven until a real model plays.
  The load-integrity gate closes a live correctness hole in the pure engine — strictly
  higher-credibility. Strong candidate for the NEXT cycle (see Deferred).
- **ABC-style no-op / discriminative-separation guard on the benchmark headline** (assert
  the `coverage` PRIMARY_CELL score is separated from the `random` no-op floor by a pinned
  margin) — genuinely well-grounded (ABC's #1 pitfall; Benchmark Health Index "separation").
  But the only offline agent is the deterministic bot (0% on parser/RPG, byte-identical
  hidden==shown CYOA), so today the separation it would assert measures bot/generator
  difficulty, not capability — **little signal until a capable (key-gated) agent populates
  rows**. Defer to the post-keyed-run cycle when it carries real discriminative meaning.
- **Curated-vs-held-out contamination DELTA metric in the scorecard** — **information-free
  today**: the bot scores a flat floor on both arms, so the delta carries no contamination
  signal until a contamination-exposed real model scores both arms. Exactly the
  reporting-metric-without-signal the brief deprioritizes. Defer.
- **SoundnessBench-style negative corpus of deliberately-UNSOUND minted RPG packs the
  validator must reject** — a strong same-family move (the *generator/validator* analogue of
  this cycle's *load* gate), and the right NEXT structural slice. But it touches the
  generator/validator/corpus surface (larger blast radius, risks a `generator_version`
  obligation) and overlaps the just-shipped bug_0174 cross-check. The `load()` gate is the
  smaller, fully-isolated engine close. Sequence AFTER this lands.
- **Expose the parser generator / route `adapt_story` through parser+RPG at the MCP surface**
  — real thesis value (the real-model author surface authors CYOA-only today), and a good
  successor, but it is a *capability-surface* widening, not a *soundness* close; it is the
  authoring-symmetry track, not the engine-integrity hole. Defer.
- **Another one-pack curated load-bearing pin** (the bug_0179/0180 pattern) — content-polish
  saturated, no soundness signal; this is the churn the cycle must escape.
- **Semantic vacuous-but-strong assertion detector in `verify-integrity.ts`** — needs a
  semantic (LLM) judge per its own docstring → key-gated, forfeits pure determinism. Out of
  scope.
- **The keyed real-model author→play→fix→lock run** — highest-value overall (the one verb
  never exercised; TextQuests/TALES headroom makes it genuinely worth gating for), but GATED
  on owner API-key authorization and outbound model calls; out of scope for an autonomous,
  key-free cycle. Named, not chosen — the successor once a key is available.

---

## Deferred to next cycle (explicit)

After the load-integrity gate lands, in rough priority order:
1. **Freshness-pin the committed `traces/benchmark/scorecard.{md,json}`** against a live
   runs=50 rebuild (verified byte-identical today) — close the last unguarded committed
   benchmark artifact, mirroring bug_0176's manifest guard.
2. **SoundnessBench-style negative corpus** — a deterministic mutator that mints RPG packs
   violating a declared property by construction (e.g. a gauntlet whose cumulative worst-roll
   damage exceeds reachable HP while falsely setting `combat_guaranteed: true`), asserting
   `validateRpg` REJECTS every one (the rejection-direction oracle this cycle adds at the
   load boundary, extended to the generator boundary).
3. **MCP authoring/generation symmetry** — a `mode` param on `adapt_story` routing to
   `runParserAdapter`/`runRpgAdapter`, and a `generate_parser_pack` tool + parser seed play
   path (parser is the only generator absent from `src/mcp/tools.ts`).
4. **ABC no-op-separation guard** + the **contamination DELTA metric** — load-bearing once a
   capable keyed agent row exists.
5. **The keyed real-model author→play→fix→lock run** — gated on owner API key.