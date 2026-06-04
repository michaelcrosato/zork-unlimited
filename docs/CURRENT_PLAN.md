# Current plan (rolling)

This is the AFK loop's **living plan** — the hand-off document for the
saturation-triggered ultraplan (see [`docs/afk_loop.md`](./afk_loop.md)). When the
deterministic assessor runs dry (`isSaturated`), an ultraplan cycle re-aims the
project, **overwrites this file** with the synthesis + the single chosen next move,
and a fresh implementation subagent reads _only_ this file (plus the files it names)
to do the work.

---

## Synthesis — re-aim cycle #10 (2026-06-04)

The deterministic content assessor is SATURATED again (every structural content lever disarmed; all
17 packs blind-clean; the assessor's ranked list is 0.5-floor blind-playtest stubs —
`SATURATION_FLOOR=0.5`, `src/afk/assessor.ts`). Since the LAST ultraplan (re-aim #9 → bug_0227, the
meta-verifier negative corpus) the loop completed every remaining standing key-free structural arc and
several content/blind polishes: the RNG known-answer vector (bug_0228), the canonicalize non-JSON /
±0 value contract (bug_0230/0240), the author + playtester + extractJson off-shape-reply resilience
trilogy (bug_0236/0237/0238) that de-risks the keyed-run path, and the exhaustive-solver `MAX_STATES`
cap-out backstop witness (bug_0243). HEAD is at **bug_0243**.

A bounded ultraplan ran this cycle — **4 repo reviewers** (engine/determinism · content/authoring+
generators · verification/benchmark · loop/strategy) **+ 2 web researchers** (frontier IF/agentic
benchmarks · verification-at-scale + reward-hacking) **→ 1 synthesis**, each verified against the live
repo at HEAD≈bug_0243 (7 agents, 300 tool-uses). The synthesis was then **independently re-verified by
the orchestrator** against source before being committed here.

**Convergent verdict.** The closed arcs are reconfirmed done (do NOT re-propose): the validator
NEGATIVE-CORPUS quartet (bug_0182/0218 content validators + bug_0227 meta-verifier); the
metamorphic-relabel + per-step observation-stream oracles (all 3 modes); the exhaustive
all-endings/variant-liveness/score-economy solvers + the `MAX_STATES` cap-out witness (bug_0243);
the absolute ending-RENDER oracle (all 3 modes); the RNG KAT (bug_0228); the canonicalize value
contract (bug_0230/0240); load/save/trace untrusted-state integrity; the off-shape-reply resilience
trilogy (bug_0236/0237/0238). The standing TRUE-GOAL keystone — the **keyed real-model
author→play→fix→lock run** — remains OWNER-API-KEY-GATED and out of scope for a key-free cycle
([[ultraplan-true-goal-pivot]]).

The strategic frontier is the **open-world "Zork meets Skyrim" pivot** and its named #1 risk:
determinism + **verification-at-scale**. An open world EXCEEDS whole-graph BFS (the 200k state cap
already nears for one small pack), so verification must go MODULAR — per-region / per-quest static
reachability + global invariants composed from local proofs, while staying seeded/deterministic.

**The chosen move (a verified-OPEN, broad coverage ASYMMETRY in a check family the project already
trusts, and the precondition for modular verification).** The static `IMPOSSIBLE_GATE` reachability
family — which proves every flag / item / var gate is *settable* before a choice/exit can require it —
**silently excludes an entire condition kind: `quest_stage`.** `quest_stage` is a first-class shared
DSL condition (`src/core/conditions.ts`) and `set_quest_stage` a first-class effect
(`src/core/effects.ts`), used across **16 of the 17 packs** (≈86 conditions / 67 writes). Yet:

- **CYOA** (`src/validate/cyoa_validator.ts`): `collectWrites` (≈910–928) scans
  `set_flag/add_item/set_var/inc_var/dec_var` only — NO `set_quest_stage`; `collectRequired` (≈946–972)
  walks `has_flag/not_flag/has_item/not_item/var_gte/var_eq/all_of` only — NO `quest_stage`. The
  feasibility loop (≈270–322) has flag/item/var branches but no quest-stage analog.
- **Parser** (`src/validate/parser_validator.ts`): `checkConds` (≈310–327) runs `flagReqs`→IMPOSSIBLE_GATE
  and `itemReqs`→ITEM_REQUIRED_UNOBTAINABLE, with NO `questStageReqs` counterpart; the settable set
  (≈302–307) is built from `set_flag`/`unlock_exit` only.

So a choice/exit gated on a `quest:stage` pair that **no `set_quest_stage` ever writes** passes static
validation silently — the exact dead-gate class IMPOSSIBLE_GATE/ITEM_UNOBTAINABLE already close for the
other condition kinds. `quest_stage` (Stage-4 DSL) was simply added after those checks and never
backfilled.

**Why this is the move (not the runner-ups).** (1) It is genuinely open + orchestrator-verified.
(2) Tightest fit to the open-world / modular-verification frontier: **quest stages ARE the per-region
progress boundary** compositional verification will key on, so making every stage gate
statically-reachable in O(effects) — with no state-space expansion — is the precondition for lifting
reachability to world scale. (3) Smallest blast radius that still delivers strategic value: it
**extends an existing check family** rather than building a net-new subsystem, with a ready-made
negative-corpus fixture pattern. (4) Clean additive / key-free / no-weaken profile.

**Soundness is even cleaner than the flag case** (orchestrator-verified): `questStage` initializes to
`{}` in `src/core/state.ts` (≈62) and there is **NO `quest_init` / initial-stage declaration anywhere**
— a quest's stage is `undefined` until a `set_quest_stage` fires (e.g. in
`content/parser/pack/alchemists_tower.yaml`, the first stage `cure_known` is established only by a
`set_quest_stage` effect, never by an init). Therefore **every satisfiable `quest_stage` gate must have
a matching `set_quest_stage` write** — no init-set seeding is required (unlike flags, which seed
`flags_init`). Combined with the existing conservative AND-context discipline (descend only top-level +
`all_of`; skip `any_of`/`none_of`), the check is sound with **zero false positives** on healthy content.

**Honest scope (do not over-claim).** This is the additive backfill of one already-trusted static check
to one uncovered condition kind, plus its negative-corpus witnesses and a `bug_0244` artifact. It is
**NOT** a discovered live content defect (all 17 shipped packs DO write every stage they gate on — the
implementer confirms this by `npm run health` staying green) and **NOT** an engine/schema change. If
health *does* flag a real pack, that is a genuine latent dead-gate to REPORT, never to silence.

## Chosen move: `IMPOSSIBLE_QUEST_STAGE` — backfill the CYOA + parser static validators

Add a new finding code `IMPOSSIBLE_QUEST_STAGE` (severity `error`) to both content validators so the
static reachability pass also proves every `quest_stage` gate references a `(quest, stage)` pair that
some `set_quest_stage` effect actually writes — exactly mirroring IMPOSSIBLE_GATE for flags. Plus a
rejection-direction witness in BOTH existing negative-corpus suites and a `bug_0244` artifact. **No
schema change, no effect/engine runtime change, no existing finding code altered, no `MIN_*` /
PROTECTED / HASH_PIN touched, no content pack added, no pack hash / scorecard / corpus seal moved.**

### VERIFIED anchors (confirmed live this cycle at HEAD≈bug_0243 — build against these, but RE-DERIVE from source)

- **Condition / effect shapes** (`src/core/conditions.ts` ≈39/60/78, `src/core/effects.ts` ≈46/241):
  the condition is `{ quest_stage: { quest: string; stage: string } }`; the effect is
  `{ set_quest_stage: { quest: string; stage: string } }`. Use a composite key joining quest+stage with
  a separator that cannot occur in an id (a NUL `"\0"` or `"|"` join) so `(q1,"ab")` and `(q1a,"b")`
  never collide.
- **No initial-stage path** (`src/core/state.ts` ≈34/62): `questStage: {}` at init; there is NO
  `quest_init`/`quests_init`/initial-stage field in either schema or any pack. So the write-set is
  PURELY `set_quest_stage` effects — do NOT seed it from any init list.
- **CYOA** (`src/validate/cyoa_validator.ts`): `collectWrites` returns a `Writes` type (≈908) and scans
  `scene.on_enter` + each `choice.effects` (≈920–928). `collectRequired` returns a `Required` type
  (≈930–938) and `walk`s conditions, descending only top-level + `all_of` (≈946–972; the documented
  conservative AND-context discipline — KEEP IT: do not analyze inside `any_of`/`none_of`). The
  feasibility loop (≈270–322) iterates `req.reqFlags`/`reqItems`/`varReqs` and pushes
  `err("IMPOSSIBLE_GATE"/"ITEM_UNOBTAINABLE", msg, where)`.
- **Parser** (`src/validate/parser_validator.ts`): the settable-flags block (≈302–307) iterates
  `allEffects(pack)` (≈993). `checkConds(conds, where)` (≈310–327) loops `flagReqs(conds)` and
  `itemReqs(conds)`; `flagReqs`/`itemReqs` (≈1196–1215) each `walk` descending only `has_flag`/`has_item`
  + `all_of`. `checkConds` is called over every exit, interaction, and win condition (see its call sites
  just below it).
- **Negative-corpus pattern** (`tests/regression/cyoa_validator_negative_corpus.test.ts`,
  `tests/regression/parser_validator_negative_corpus.test.ts`): a `GREEN` base from the generator, a
  `CASES: NegativeCase[]` array of `{ code, why, mutate }`, a differential-anchor `it` asserting the
  GREEN base carries none of the targeted codes, and a per-case `it` asserting
  `validate*(mutant).findings.map(f => f.code)` `.toContain(c.code)`. The CYOA/parser generators do NOT
  emit `quest_stage`, so the GREEN base has zero quest-stage gates → the differential anchor is trivially
  clean and a single `mutate` that ADDS one unwritten gate triggers the new code (mirroring the existing
  `ITEM_UNOBTAINABLE` case, which exploits "gen(0) has no items").

### CRITICAL directions (what NOT to get wrong)

1. **Assert the SPECIFIC code, never bare `.ok===false`.** Each negative case must assert the findings
   contain `"IMPOSSIBLE_QUEST_STAGE"` (the bug_0182/0218 discipline) — not merely that validation failed.
2. **Keep the conservative AND-context walk.** Collect required quest-stages ONLY at top-level + inside
   `all_of` (copy the exact `walk` shape of `reqFlags`/`flagReqs`). Do NOT descend `any_of`/`none_of` —
   that is what guarantees zero false positives on healthy packs.
3. **Write-set = `set_quest_stage` only.** Do NOT seed it from any init list (there is none). Scan the
   SAME effect sites the existing write-collector already visits (CYOA: `scene.on_enter` + `choice.effects`
   via `collectWrites`; parser: `allEffects(pack)`).
4. **ADDITIVE only.** Add a NEW finding code + new collector fields + one new feasibility loop in each
   validator; add ONE new `CASES` entry per negative-corpus file. Touch NO existing finding code, NO
   matcher, NO floor, NO PROTECTED/HASH_PIN list. `scripts/verify-integrity.ts` is PROTECTED — do not edit it.
5. **Healthy packs must stay clean.** After the change, `npm run health` validates all 17 shipped packs;
   it MUST stay green (every gated stage is written today). If a real pack trips the new code, STOP and
   report it as a genuine latent dead-gate — do not weaken the check to hide it.
6. **Do NOT write `.js` import-specifier literals into any doc.** (Use the existing test files' import
   lines verbatim in code; this plan deliberately names modules without a `.js` suffix to keep the
   doc-staleness scan green.)

### What — numbered concrete steps

1. **Read first** (READ-ONLY): `src/core/conditions.ts` + `src/core/effects.ts` (confirm the `quest_stage`
   / `set_quest_stage` shapes); `src/validate/cyoa_validator.ts` (`collectWrites` ≈908–928,
   `collectRequired` ≈930–972, feasibility loop ≈270–322); `src/validate/parser_validator.ts`
   (settable block ≈302–307, `checkConds` ≈310–327, `flagReqs`/`itemReqs` ≈1196–1215, `allEffects` ≈993);
   the two negative-corpus tests for the copy-mutate-assert idiom.
2. **CYOA** (`src/validate/cyoa_validator.ts`): (a) add `setQuestStages: Set<string>` to the `Writes`
   type and, in the `collectWrites` scan, `else if ("set_quest_stage" in e) setQuestStages.add(key(e.set_quest_stage))`
   where `key({quest,stage}) = `${quest}\0${stage}``. (b) add `reqQuestStages: Set<string>` to the
   `Required` type and, in the `collectRequired` `walk` (top-level + `all_of` only), `else if ("quest_stage"
   in cond) out.reqQuestStages.add(key(cond.quest_stage))`. (c) in the feasibility loop (after the var
   branch), `for (const qs of req.reqQuestStages) if (!writes.setQuestStages.has(qs)) { const [quest,stage]
   = qs.split("\0"); findings.push(err("IMPOSSIBLE_QUEST_STAGE", `choice requires quest "${quest}" at
   stage "${stage}" that no effect ever sets.`, where)); }`.
3. **Parser** (`src/validate/parser_validator.ts`): (a) build `settableQuestStages: Set<string>` next to
   the settable-flags block by iterating `allEffects(pack)` and adding `key(e.set_quest_stage)` for each
   `set_quest_stage`. (b) add a `questStageReqs(conds): string[]` helper mirroring `flagReqs` (walk
   top-level + `all_of`, push `key(c.quest_stage)`). (c) in `checkConds`, add a third loop:
   `for (const qs of questStageReqs(conds)) if (!settableQuestStages.has(qs)) { const [quest,stage] =
   qs.split("\0"); findings.push(err("IMPOSSIBLE_QUEST_STAGE", `condition requires quest "${quest}" at
   stage "${stage}" that no effect ever sets.`, where)); }`.
4. **Negative corpus**: in `tests/regression/cyoa_validator_negative_corpus.test.ts` AND
   `tests/regression/parser_validator_negative_corpus.test.ts`, add ONE `CASES` entry
   `{ code: "IMPOSSIBLE_QUEST_STAGE", why: "...", mutate }` that pushes a `quest_stage` gate referencing a
   `(quest, stage)` pair that NO `set_quest_stage` writes onto a REACHABLE choice/exit of the GREEN base
   (mirror the existing `ITEM_UNOBTAINABLE`/`KEY_UNOBTAINABLE` case). The existing differential-anchor and
   non-degeneracy `it`s pick the new case up automatically.
5. **NEW artifact** `traces/bugs/bug_0244_impossible_quest_stage_validator.yaml` mirroring the bug_0218
   artifact shape (id, title, `kind: verification_oracle`, mode: `meta`/`tooling`, summary, context naming
   the IMPOSSIBLE_GATE family's quest_stage coverage gap + the bug_0182/0218/0227 SoundnessBench lineage +
   the open-world modular-verification motivation, mechanism = static settable-stage reachability mirroring
   IMPOSSIBLE_GATE, files_changed, verification = the commands below). Record explicitly: NO
   source-engine/schema/hash/scorecard/corpus change.
6. **Verify** (key-free, offline, deterministic): the two new negative cases GREEN; **non-vacuity teeth**
   (in a LOCAL scratch copy, NOT committed): (i) in the negative fixture, ADD the matching `set_quest_stage`
   write → the new case must go RED (finding disappears), proving the check keys on the actual write, not
   the mere presence of a gate; (ii) temporarily rename a stage in one `set_quest_stage` in a REAL pack
   (e.g. `content/cyoa/pack/clockwork_heist.yaml`) so its gate no longer matches → `npm run health` must
   turn RED with `IMPOSSIBLE_QUEST_STAGE`, proving the check runs over real content; then DISCARD both
   experiments. `npm run health` GREEN (EXIT 0), test count strictly ABOVE the prior count.
   `npm run verify:integrity` EXIT 0 — NO VERIFIER_TOUCHED / GUARD_WEAKENED / PROTECTED_DELETED /
   count regression. `git status` shows ONLY the changed files below (+ AI_LOOP_STATE.md, handled by the
   orchestrator).

### Exact files

- **READ-ONLY**: `src/core/conditions.ts`, `src/core/effects.ts`, `src/core/state.ts`.
- **EDIT (additive)**: `src/validate/cyoa_validator.ts`, `src/validate/parser_validator.ts`,
  `tests/regression/cyoa_validator_negative_corpus.test.ts`,
  `tests/regression/parser_validator_negative_corpus.test.ts`.
- **NEW**: `traces/bugs/bug_0244_impossible_quest_stage_validator.yaml`.
- **DO NOT EDIT / DO NOT REGENERATE**: `scripts/verify-integrity.ts` (PROTECTED — self-trips
  VERIFIER_TOUCHED), the condition/effect/state schema, any pack YAML, `corpus/manifest.json`, the
  scorecard. No re-seal, no benchmark rebuild.

### Acceptance check (concrete / verifiable)

- Both content validators emit a NEW `IMPOSSIBLE_QUEST_STAGE` (severity `error`) when a reachable
  choice/exit requires a `quest_stage` `(quest, stage)` pair that no `set_quest_stage` ever writes, via an
  additive collector + feasibility loop mirroring IMPOSSIBLE_GATE; the conservative AND-context walk is
  preserved (no `any_of`/`none_of` descent).
- The two negative-corpus suites each carry ONE new case asserting `IMPOSSIBLE_QUEST_STAGE` fires on the
  synthetic mutant and is ABSENT on the GREEN base (differential anchor).
- The test is NON-VACUOUS: it goes RED if the matching `set_quest_stage` write is added to the fixture, and
  `npm run health` goes RED if a real pack's gated stage is unwritten (both confirmable in scratch copies;
  neither committed).
- `npm run health` GREEN (EXIT 0), test count strictly above the prior HEAD count, all 17 packs still
  validate clean; `npm run verify:integrity` EXIT 0 with NO GUARD_WEAKENED / PROTECTED_DELETED /
  VERIFIER_TOUCHED / count regression. No floor lowered, no matcher relaxed, no test skipped/deleted, no
  engine/schema source touched.
- `traces/bugs/bug_0244_impossible_quest_stage_validator.yaml` exists in the bug_0218 format.
- `git status` shows ONLY the four edited files + the one new artifact (the orchestrator separately updates
  AI_LOOP_STATE.md). No pack hash, scorecard byte, or corpus seal moved.

## Hard constraints (every cycle)

- Key-free / offline / deterministic: no outbound model calls, no wall-clock, no RNG.
- ONE focused STRUCTURAL change (not content polish); additive/strengthening only; NEVER weaken a check (no
  lowering `MIN_*` / `GEN_EVAL_CHECK_COUNT` / `SATURATION_FLOOR`, no relaxing matchers, no `GUARD_WEAKENED`,
  no shrinking PROTECTED/HASH_PIN lists).
- Keep the game playable and `npm run health` green.

## Reward-hacking guardrails (from the web research — bake these in)

- **PITFALL: a vacuous test asserting merely `.ok===false`.** GUARD: assert the EXACT code
  `IMPOSSIBLE_QUEST_STAGE` + severity `error`, never just `.ok` or `.length>0`.
- **PITFALL: a non-sound check that false-positives on healthy packs** (e.g. seeding the write-set wrong or
  descending disjunctions). GUARD: write-set is `set_quest_stage` only (no init path exists); AND-context
  walk only; `npm run health` proves all 17 packs stay clean.
- **PITFALL: editing the engine/schema to "make it checkable."** GUARD: this is pure static analysis over
  already-parsed packs — NO runtime/schema change, NO `scripts/verify-integrity.ts` edit.
- **PITFALL: over-claiming a discovered content defect (Goodhart / EvilGenie arXiv:2511.21654).** GUARD: the
  artifact + test docstrings frame this as adding the missing rejection-direction WITNESS + reachability
  coverage for a condition kind the family never covered (parity with bug_0182/0218/0227), NOT a fixed live
  defect.
- **PITFALL: non-determinism.** GUARD: synthetic fixtures from the deterministic generator base + string
  literals only; composite keys via a fixed NUL/`|` separator.

## Rejected alternatives & runner-ups (this cycle)

**Strong runner-ups (valid FUTURE moves, best first):**
- **`__proto__`/prototype-named state-key collapse in `canonicalize`/`hashState`** (`src/core/hash.ts`):
  verified live that `canonicalize({flags:{a:true,__proto__:true}})` collapses + `hashState` collides two
  distinct states; fix = own-property write in `sortDeep` + a `__proto__` key-contract leg in
  `canonicalize_nonjson_value_contract.test.ts`. Real determinism-keystone soundness hole,
  source-touching-small; NARROWER trigger surface (needs a forged/authored `__proto__` key) than the
  quest_stage gap. **Lead next cycle if a determinism-keystone source de-risk is wanted.**
- **World-frame manifest schema + modular cross-region static reachability validator**: the smallest
  net-new open-world enabling primitive (typed region graph + O(edges) reachability lifting the parser
  validator's intra-pack BFS to world scale). The right NEXT structural step ONCE quest-stage reachability
  is sound (this cycle is its precondition); larger blast radius / net-new subsystem.
- **Compositional progress-measure (monotone-cut) oracle over all 17 packs**: elegant local-composes-to-
  global precondition; higher-effort/more-abstract than this concrete backfill.
- **Quest-stage monotonicity property harness**: a directional-safety invariant of real value, but broader;
  best landed AFTER `IMPOSSIBLE_QUEST_STAGE` makes stage reachability sound first.

**Rejected this cycle:**
- Relax adapter output schemas `.strict()→.passthrough()` — leans into the owner-gated keyed path; the
  off-shape-reply resilience arc (bug_0236/0237/0238) is the relevant closed family; thin standalone value.
- `spatial_summary` / scorecard aggregate — benchmark presentation polish, not a structural gap.
- Extract `health:dev` + `AI_LOOP_BLIND` env, blind-feedback bucket schema + aggregator (Goal-2 loop-split):
  real pillars but net-new orchestration subsystems with no live data path yet + behavior-gating risk;
  larger than one focused structural change. Sequence AFTER a bucket schema exists.
- Cap-pressure / BFS state-budget telemetry pins; UTF-16 key-sort witness — low strategic value /
  speculative / pins arbitrary thresholds.

## Deferred to next cycle

1. The keyed real-model author→play→fix→lock run (owner-API-key-gated) — the standing keystone
   ([[ultraplan-true-goal-pivot]]).
2. `__proto__`/prototype-named state-key collapse in `canonicalize`/`hashState` (the strong source-touching
   runner-up; best determinism-keystone de-risk).
3. The world-frame manifest schema + modular cross-region static reachability validator (the open-world
   net-new primitive, unblocked once quest-stage reachability is sound — i.e. by THIS cycle).
4. The Goal-2 loop-split: extract blind/persona testing out of `npm run health` into a separate target +
   a structured-feedback bucket schema/aggregator feeding next dev goals.
5. The TextQuests harm/death scorecard axis (needs a `run_playtest`-fed column + scorecard rebuild; land
   WITH the keyed run).

## Mandated blind playtest (this cycle)

Per the dedicated-pass rotation ([[assessor-blind-pass-rotation]]) and this cycle's harness directive, the
orchestrator ran the mandated blind pass on **`content/parser/pack/alchemists_tower.yaml`** (parser; all 4
endings reached, all rooms visited, 0 warnings per `docs/blind_playtest_protocol.md`). Report at
`ai-runs/2026-06-04T17-44-43-365Z/playtest.md`. Result: content clean (clarity 5/5, enjoyment 4/5, 0
mechanical bugs); one design note (the optional "grip iron key" steadiness check has no observable payoff
on the win route) — a content-experience finding for the future blind-testing-loop bucket, NOT this cycle's
structural lever (new packs paused, [[no-new-content-packs]]). Record "Mandated blind pass ran on
alchemists_tower" in the AI_LOOP_STATE.md cycle entry (newest-first).
