# Current plan (rolling)

This is the AFK loop's **living plan** — the hand-off document for the
saturation-triggered ultraplan (see [`docs/afk_loop.md`](./afk_loop.md)). When the
deterministic assessor runs dry (`isSaturated`), an ultraplan cycle re-aims the
project, **overwrites this file** with the synthesis + the single chosen next move,
and a fresh implementation subagent reads _only_ this file (plus the files it names)
to do the work.

---

## Ultraplan synthesis — 2026-06-03 (re-aim cycle #2)

Produced by a bounded local ultraplan (4 repo reviewers — engine/determinism ·
content/authoring · verification&benchmark · loop/strategy — + 2 web researchers →
1 synthesis), grounded in [`docs/ULTRAPLAN-2026-06-02.md`](./ULTRAPLAN-2026-06-02.md)
and verified against the live tree. It **advances** the strategic layer; it does not
restart it. The prior plan's chosen move (trust-boundary `GUARD_WEAKENED`, bug_0155)
and the entire fresh-pack generator program it named as "next" have **all shipped**
(CYOA core/MCP/assessor = bug_0156/0157/0158; RPG core/MCP/assessor = bug_0159/0160/0162).
This cycle picks the next de-bundled slice.

## Where the project stands

AdventureForge is a deterministic IF engine + MCP server + autonomous AFK loop, positioned to be the first contamination-free benchmark for real-frontier-model game authoring. Verified against the live tree this cycle:

- **Generators are LIVE and pure.** `src/gen/cyoa_generator.ts` and `src/gen/rpg_generator.ts` return fully schema-validated `CyoaPack`/`RpgPack` objects (pure mulberry32, no wall-clock). The assessor mints a disjoint window of `GEN_EVAL_CHECK_COUNT` (=4) packs per mode each cycle and asserts `validateCyoa`/`validateRpg` return zero findings — then **discards every minted pack**. No `writeFileSync`/`mkdir` exists in `src/gen/` or the assessor mint path.
- **Deterministic-proof axes are saturated** across all 3 modes (endings-reachable, variant-liveness, score-economy, softlock-liveness, id-uniqueness). The assessor sits at its 0.5 floor; the generator-drift levers only fire on a *rejection*, which the fixed clean skeleton prevents. So deepening the validator surface cannot move the assessor and produces no publishable artifact.
- **The benchmark scorecard is the last frozen-distribution surface.** `buildScorecard` plays only the curated disk YAML and never touches a generator.
- **Hashing primitives exist:** `hashState(value)` (`src/core/hash.ts:31`) = SHA-256 over a recursively key-sorted canonical form — a wall-clock-free reproducibility seal. `yaml` v2.9 is already a dependency (`parse`/`stringify`).
- **Hard guard to respect:** `tests/regression/all_packs_validated_by_bar.test.ts` asserts (`toEqual`) that discovery over `PACK_DIRS = content/{cyoa,parser,rpg}/pack` returns EXACTLY the 10 curated packs. Generated YAML MUST NOT land in those dirs (would fail this test + add a blind-playtest obligation).
- `ai-runs/` is gitignored loop telemetry, not a committed corpus. A NEW top-level `corpus/` dir is committable and clean (it does not exist yet).

**Why this move wins this cycle.** Both research reports converge: the procedural *generator* is the contamination defense (BALROG/TextWorld/LiveBench), and a *sealed, timestamped, held-out test split* is the credibility anchor that makes any single reported number defensibly uncontaminated (sealed-exam literature; TALES held-out split; the frozen-verifier finding that a small injection of real held-out verification data raises the ceiling). AdventureForge already HAS the generator live in the loop's brain; the one missing piece is **persistence** — converting the throwaway in-memory windows into a committed, content-hash-sealed artifact. The strategy docs name this as the #1 deferred slice (`docs/ULTRAPLAN-2026-06-02.md` Year deliverable; the prior `CURRENT_PLAN.md` "fresh-pack generator + persistence … do it next"), and it is now de-bundled from the finished generator/MCP/assessor work (bug_0156–0162), so it is a small additive single-cycle slice. It is key-free, deterministic, strengthens the bar (adds a standing re-mint-and-verify check), and creates the on-disk substrate the scorecard and the future keyed real-model run both need.

---

## Chosen move: HELD-OUT CORPUS PERSISTENCE

Stand up a committed, content-hash-sealed held-out corpus of generator-minted packs
under a new top-level `corpus/` dir, with a seal CLI and a re-mint-and-verify
regression test wired into `npm run health`, turning the throwaway in-memory mint
windows into the contamination-control artifact the benchmark thesis requires.

### What (numbered concrete steps)

1. **Add a `generator_version` stamp to each generator.** In `src/gen/cyoa_generator.ts` export `export const CYOA_GENERATOR_VERSION = 1;` and in `src/gen/rpg_generator.ts` export `export const RPG_GENERATOR_VERSION = 1;`. These do NOT change pack output — they are recorded in the manifest only, so a future generator change is a loud, diagnosable manifest mismatch ("generator changed") rather than silent corpus rot.

2. **Create `bin/seal-corpus.ts`** (mirror the style of `bin/benchmark.ts`; `#!/usr/bin/env -S npx tsx`). It must:
   - Mint a FIXED, explicit seed window for each mode (CYOA seeds `[0,1,2,3]`, RPG seeds `[0,1,2,3]` — hard-code these constants in the file; do NOT read `AI_LOOP_STATE.md`, the corpus must be a stable committed snapshot, not a moving window).
   - For each seed: `generateCyoaPack(seed)` / `generateRpgPack(seed)`, then `validateCyoa` (from `src/validate/cyoa_validator.ts`) / `validateRpg` (from `src/validate/rpg_validator.ts`). If any pack has findings, throw (refuse to seal a dirty corpus).
   - Write each pack as YAML via `import { stringify } from "yaml"` to `corpus/cyoa/<pack_id>.yaml` / `corpus/rpg/<pack_id>.yaml` (create dirs with `mkdirSync({recursive:true})`).
   - Write `corpus/manifest.json` with a deterministic, key-sorted array of entries `{ mode, seed, pack_id, generator_version, content_hash }` where `content_hash = hashState(pack)` (from `src/core/hash.ts` — the SAME hash the MCP `generate_pack`/`generate_rpg_pack` tools already emit). Serialize with sorted keys / stable ordering so the committed file is byte-stable.

3. **Run `npx tsx bin/seal-corpus.ts` once** and COMMIT the emitted `corpus/cyoa/*.yaml`, `corpus/rpg/*.yaml`, and `corpus/manifest.json`. This is the first sealed window; the git commit timestamp (post the relevant model cutoffs) supplies the contamination chain-of-custody.

4. **Add a regression test `tests/regression/held_out_corpus_sealed.test.ts`** (mirror `tests/regression/all_packs_validated_by_bar.test.ts`'s discovery/zero-error pattern; note the generator tests in `tests/unit/cyoa_generator.test.ts` / `tests/unit/rpg_generator.test.ts` show the `validateCyoa`/`validateRpg` → `report.findings` usage and validator import paths). For each `corpus/manifest.json` entry it must assert ALL of:
   - **Re-mint determinism:** re-mint from the recorded `seed` via the same generator and assert `hashState(remint) === entry.content_hash` (tamper/determinism evidence, no wall-clock).
   - **Generator version match:** `entry.generator_version === CYOA_GENERATOR_VERSION` / `RPG_GENERATOR_VERSION`.
   - **YAML round-trip stability:** `parse` the committed `corpus/<mode>/<pack_id>.yaml`, re-`hashState` it, and assert it equals `entry.content_hash` (the on-disk YAML is byte-faithful to the minted pack).
   - **Production-bar clean:** `validateCyoa`/`validateRpg` on the re-mint returns zero findings (the corpus still clears the SAME bar the curated packs do — strengthens, never weakens).
   - Assert the manifest entry count equals the seeded window size (no silent drop/add).

5. **Wire a `corpus:seal` script into `package.json`** (`"corpus:seal": "npx tsx bin/seal-corpus.ts"`). The *verify* is the regression test itself, which already runs under `npm test` (the `tests/regression/` glob) and therefore under `npm run health` — confirm it is picked up; do not add a redundant health step.

### Why

- This is slice (a) done concretely and additively. It makes the contamination-free held-out set REAL (committed, content-hash-sealed, deterministically reproducible) WITHOUT a wall-clock — the `hashState` seal IS the reproducibility proof, sidestepping the engine's wall-clock ban.
- It keeps generated YAML OUT of `content/{cyoa,parser,rpg}/pack`, so `all_packs_validated_by_bar.test.ts` stays green and no blind-playtest obligation is added.
- The verify test STRENGTHENS the bar (a standing tamper/determinism + zero-findings check tied to the production validators), matching the "never weaken a check" constraint.
- `generator_version` makes future deepening (the right NEXT cycle) honest: a hash mismatch becomes diagnosable as "generator changed" vs "corpus tampered."

### Exact files

- `src/gen/cyoa_generator.ts` — add `CYOA_GENERATOR_VERSION` export ONLY; do NOT alter emitted pack shape/bytes.
- `src/gen/rpg_generator.ts` — add `RPG_GENERATOR_VERSION` export ONLY.
- `bin/seal-corpus.ts` — NEW; uses `generateCyoaPack`/`generateRpgPack`, `validateCyoa`/`validateRpg`, `hashState` from `src/core/hash.ts`, `stringify` from `yaml`.
- `corpus/manifest.json` — NEW, committed.
- `corpus/cyoa/*.yaml`, `corpus/rpg/*.yaml` — NEW, committed; emitted by the CLI.
- `tests/regression/held_out_corpus_sealed.test.ts` — NEW; mirrors `tests/regression/all_packs_validated_by_bar.test.ts`.
- `package.json` — add `corpus:seal` script.
- `traces/bugs/bug_0163_held_out_corpus_persistence.yaml` — NEW artifact (`type: invariant_lock`, `layer: test`; record the closed gap: generator output was minted-and-discarded, now sealed + re-mint-verified; cite the contamination-control thesis and `docs/ULTRAPLAN-2026-06-02.md`). Follow the bug_0162 artifact shape (bug_id, type, layer, evidence, root_cause, fix, regression).

### Acceptance check (concrete, verifiable)

- `npm run health` is GREEN (verify:integrity, typecheck, lint, format:check, test, all curated validate steps, playtest) — the prior ~1150 tests PLUS the new corpus test passing.
- `npm run verify:integrity` is GREEN with NO `GUARD_WEAKENED` / protected-deletion finding (no protected file altered; the generators get an additive export only — `src/gen/*` are NOT in `PROTECTED_FILES`, so editing them does not trip the guard).
- The new `tests/regression/held_out_corpus_sealed.test.ts` PASSES: every `corpus/manifest.json` entry re-mints to a byte-identical `content_hash`, its committed YAML round-trips to the same hash, its `generator_version` matches, and `validateCyoa`/`validateRpg` returns zero findings.
- `tests/regression/all_packs_validated_by_bar.test.ts` STILL PASSES (discovery still returns EXACTLY the 10 curated packs — proof `corpus/` did not pollute `content/*/pack`).
- Running `npm run corpus:seal` a SECOND time produces a byte-identical `corpus/` tree and `manifest.json` (`git diff` empty) — proves determinism end-to-end.
- Net test-case count RISES (new test), so the guard's own count-regression checks stay satisfied.

---

## Hard constraints (every cycle)

- **Never weaken a check.** No edits to any `PROTECTED_FILES` entry, no lowering of `MIN_*` floors or `GEN_EVAL_CHECK_COUNT`, no relaxing of matchers. The corpus test only ADDS a stronger gate.
- **One focused change.** Persistence only. Do NOT deepen generators, do NOT add a parser generator, do NOT touch the scorecard or the assessor mint loop this cycle.
- **Key-free / offline.** No outbound model calls; generators are pure mulberry32. No wall-clock, no nondeterministic RNG — the seal is `hashState`, the timestamp is the git commit.
- **Corpus YAML MUST live under the new `corpus/` dir, NEVER under `content/{cyoa,parser,rpg}/pack`.**
- **Do NOT commit** `ai-runs/`, `node_modules/`, `dist/`, `coverage/`, or `saves/*.json`. DO commit `corpus/` (it is the deliverable).
- Generator edits are additive exports ONLY — the emitted pack bytes must not change, or every existing seed-pinned test and the new corpus hashes shift.

---

## Rejected alternatives (this cycle)

- **(b) Deepen the generators** (deadline/vars/multi-axis CYOA; combat_guaranteed/varied-enemy/deeper-map RPG) — real value and the right NEXT cycle, but the validator surface is already saturated/green by construction and the generator-drift lever only fires on a rejection the skeleton prevents, so it cannot move the assessor off 0.5 and produces no publishable artifact. Worse: deepening BEFORE persistence means depth lands in a discarded in-memory window. Deepen the thing you are now persisting — do it after (a); `generator_version` (added here) makes that safe.
- **(c) Parser-only generator** — lowest strategic leverage: no strategy doc names it next, parser validators are largely a subset of the RPG surface the RPG generator already drives, and it still yields only a discarded in-memory window with no benchmark artifact. Defer until after the held-out corpus exists.
- **Wire the corpus into the benchmark scorecard** — the true thesis bridge, but meaningless until a corpus is persisted; it is the natural FOLLOW-UP once `corpus/` exists, and bundling it here would exceed one focused single-cycle change.
- **Route `adapt_story`'s mock fallback through the generator** — improves the key-free authoring path but carries high behavioral coupling (the `MockAuthorProvider` revise-loop contract and several pinned authoring tests). Sequence after persistence.
- **Add generators to `PROTECTED_FILES` / guard `GEN_EVAL_CHECK_COUNT`** — worthwhile hardening, but a separate trust-boundary cycle; combining it with persistence violates the one-focused-change constraint. Note for a future cycle.
- **The keyed real-model author→play→fix→lock run** — highest-value move overall, but GATED on owner API-key authorization; out of scope for an autonomous, key-free cycle.
