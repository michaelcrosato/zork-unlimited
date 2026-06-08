# Current plan (rolling)

This is the AFK loop's **living plan** — the hand-off document for the
saturation-triggered ultraplan (see [`docs/afk_loop.md`](./afk_loop.md)). When the
deterministic assessor runs dry (`isSaturated`), an ultraplan cycle re-aims the
project, **overwrites this file** with the synthesis + the single chosen next move,
and a fresh implementation subagent reads _only_ this file (plus the files it names)
to do the work.

---

# Ultraplan re-aim cycle #16 (HEAD = bug_0290; next free id = bug_0291)

## Synthesis

A bounded ultraplan ran this cycle — **4 repo reviewers** (engine-trace ·
validator-reference · observation-api · loop/strategy) **+ 2 web researchers**
(contamination-free IF benchmarks · in-context reward hacking) **→ 1 synthesis**,
each grounded against the live repo at HEAD = bug_0289 (clockwork dumbwaiter
narration fix), then independently re-verified by the orchestrator against source.

**Two claimed candidates were already closed in source.** The engine-trace reviewer
and the loop-strategy reviewer each named a candidate that is fully implemented:

- _divergedAtStep population_ — the ULTRAPLAN doc (lines 54-55) describes
  `divergedAtStep` as "reserved-but-unpopulated", but the engine-trace reviewer
  confirmed this is stale: `record.ts:77` already persists `per_step_hashes` into the
  returned `Trace`, and `replay.ts:49-53` already computes and populates
  `divergedAtStep` with the index of the first divergent step. No work remaining.
- _Dialogue node goto-ref integrity_ — the loop-strategy reviewer nominated
  "dangling `next` edges between dialogue nodes" as Candidate B, confirming the gap
  by grep searching for `next.*node`/`node.*next`/`DIALOGUE_NODE_REF`. However, the
  field is named `goto`, not `next`, and `parser_validator.ts:607-615` already
  implements `DIALOGUE_GOTO_MISSING`, cross-checking every `t.goto` against the
  declared `nodeIds` set. Closed.

**The validator-reference reviewer found the one genuinely open gap.** Three effect
types carry an object id that is never cross-checked against the declared `objById`
map: `open_object` (the string value IS the object id), `set_object_locked.id`, and
`place_object.id`. The reviewer confirmed by grep that no `open_object.*objById`,
`set_object_locked.*objById`, or `place_object.*objById` check exists anywhere in
`src/validate/`. Key evidence:

- `src/validate/parser_validator.ts:415-418` — harvests `open_object` and
  `set_object_locked.id` into `openableObjects`/`unlockableObjects` with no prior
  existence check against `objById`.
- `src/validate/parser_validator.ts:916-920` — harvests these same ids into
  `writtenOpen`/`writtenUnlocked`/`writtenLocked` for `INERT_OBJECT_STATE` with no
  existence check.
- `src/validate/parser_validator.ts:1641-1646` — `collectRoomRefs` checks
  `place_object.room` but never `place_object.id`.
- `src/core/effects.ts:33-41` — all three effect types carry a `.id` field that the
  schema validates only as `z.string().min(1)`, never as a declared object id.
- No shipped parser or RPG pack uses `open_object`, `set_object_locked`, or
  `place_object` (grep confirms only `content/engine_contract.yaml` names them, as
  vocabulary declarations), so the new check is provably green-preserving.

This is the fourth reference family after room id conditions (bug_0277), unlock_exit
room ids (bug_0278), and inventory item refs (bug_0281). The orchestrator re-verified
all three deferred items are genuinely closed; this is the only open structural gap.

The observation-api reviewer confirmed `observation_difficulty` is a genuine open item
(M-effort, Week-horizon) and deferred correctly. Both web researchers confirmed the
four-pillar benchmark whitespace remains unoccupied and reward-hacking mitigations are
noted for a future cycle.

---

## The one chosen move

**Add `OBJECT_STATE_REF_MISSING` validator check (bug_0291):** Cross-check the
`open_object`, `set_object_locked.id`, and `place_object.id` effect fields against
the pack's declared object IDs using the existing `objById` map, emitting a new
`error`-severity finding code for dangling object-state effect references.

### What

In `src/validate/parser_validator.ts`, after the `ITEM_REF_MISSING` block (lines
262-272), add a new emit block that:

1. Iterates all effects via `allEffects(pack)`.
2. Extracts the object id from any `open_object` effect (the string value itself),
   `set_object_locked` effect (`e.set_object_locked.id`), and `place_object` effect
   (`e.place_object.id`).
3. Checks each against `objById` (the `new Map(pack.objects.map((o) => [o.id, o]))`
   already computed at line 111).
4. Emits `err("OBJECT_STATE_REF_MISSING", ...)` at severity `error` for any object
   id not found in `objById`.
5. Adds `"OBJECT_STATE_REF_MISSING"` to the bail-early guard array (lines 299-304)
   alongside `ITEM_REF_MISSING` — a dangling `open_object` id silently populates
   `openableObjects` with a phantom string, which could produce false
   `IMPOSSIBLE_OBJECT_STATE` findings downstream when the phantom id accidentally
   matches a condition-side id.

Supporting artifacts:

- `content/broken-fixtures/parser_object_state_ref_missing.yaml` — minimal broken
  fixture with a dangling `open_object` target; must compile cleanly through
  `compileParserPack` (schema-valid) but fail only at the validator layer.
- `tests/regression/parser_object_state_ref_missing.test.ts` — 5 locked cases
  (see acceptance check).
- `tests/unit/parser_validator.test.ts` — register the new fixture in
  `VALIDATOR_FIXTURES`.
- `tests/regression/parser_validator_negative_corpus.test.ts` — add one
  `OBJECT_STATE_REF_MISSING` case at `severity === "error"` to the negative corpus.
- `traces/bugs/bug_0291_parser_object_state_ref_missing.yaml` — bug artifact.

### Why

A typo'd `open_object: "chst"` (instead of `"chest"`) silently populates
`openableObjects` with the phantom string `"chst"`. At runtime the engine's
`applyEffect` calls `patchObject(state, "chst", { open: true })`, which writes into
`objectState["chst"]` — a key with no corresponding declared object. No description,
no interactions, no rendering path. The phantom state entry persists invisibly. The
effect is a structural no-op with a silent state leak.

A typo'd `set_object_locked: { id: "chst", locked: false }` silently writes
`objectState["chst"].locked = false` — the keyed UNLOCK verb guards on the real
object `"chest"` (which remains locked), the puzzle cannot be completed, and no error
is reported.

A typo'd `place_object: { id: "chst", room: "vault" }` silently places a nonexistent
object into the vault room. The object is never rendered, the puzzle-design intent is
defeated, and validation currently says nothing.

None of these cases is caught by any existing check:

- `INERT_OBJECT_STATE` — fires only as a _warning_ when the written state is never
  read by a condition; it never checks whether the id is a declared object.
- `IMPOSSIBLE_OBJECT_STATE` — checks `is_open`/`is_unlocked` conditions; a phantom
  `open_object` write _creates_ a false entry in `openableObjects`, so a paired
  `is_open: "chst"` condition passes the feasibility check vacuously.
- `ITEM_REF_MISSING` (bug_0281) — covers `add_item`/`remove_item` only.

### Exact files to read and edit

**Read (to understand existing patterns):**

- `src/validate/parser_validator.ts` lines 100-115 (`objById` construction)
- `src/validate/parser_validator.ts` lines 256-308 (`ITEM_REF_MISSING` block and
  bail-early guard — the exact template to mirror)
- `src/validate/parser_validator.ts` lines 413-424 (`openableObjects`/`unlockableObjects`
  harvest — where the phantom id currently enters unchecked)
- `src/validate/parser_validator.ts` lines 912-922 (`INERT_OBJECT_STATE` harvest —
  same unchecked ids, for placement context)
- `src/validate/parser_validator.ts` lines 1641-1647 (`collectRoomRefs` `place_object`
  handling — confirms `.room` is checked but `.id` is not)
- `src/core/effects.ts` lines 33-41 (`open_object`, `set_object_locked`,
  `place_object` effect shapes)
- `content/broken-fixtures/parser_item_ref_missing.yaml` (fixture template)
- `tests/regression/parser_item_ref_missing.test.ts` (5-case test template)
- `tests/unit/parser_validator.test.ts` lines 29-55 (`VALIDATOR_FIXTURES` pattern)
- `tests/regression/parser_validator_negative_corpus.test.ts` lines 245-260
  (`ITEM_REF_MISSING` corpus entry — template for the new entry)
- `traces/bugs/bug_0281_parser_item_ref_missing.yaml` (artifact template)

**Create / edit:**

1. `src/validate/parser_validator.ts` — add `OBJECT_STATE_REF_MISSING` emit block
   after the `ITEM_REF_MISSING` block; add `"OBJECT_STATE_REF_MISSING"` to the
   bail-early guard array
2. `content/broken-fixtures/parser_object_state_ref_missing.yaml` — minimal broken
   fixture with a dangling `open_object` target; schema-valid, fails only at validator
3. `tests/regression/parser_object_state_ref_missing.test.ts` — 5-case regression
4. `tests/unit/parser_validator.test.ts` — add
   `["parser_object_state_ref_missing", "OBJECT_STATE_REF_MISSING"]` to
   `VALIDATOR_FIXTURES`
5. `tests/regression/parser_validator_negative_corpus.test.ts` — add one
   `OBJECT_STATE_REF_MISSING` case at `severity === "error"` to the negative corpus
6. `traces/bugs/bug_0291_parser_object_state_ref_missing.yaml` — bug artifact

### Acceptance check

`npm run health` must exit 0. Specific criteria:

1. **All shipped parser + RPG packs produce zero `OBJECT_STATE_REF_MISSING` findings**
   (the new check must not regress any existing pack — verified: no shipped pack uses
   `open_object`, `set_object_locked`, or `place_object`).
2. **A pack with `open_object` targeting an undeclared object id IS flagged** at
   `severity === "error"` with `code === "OBJECT_STATE_REF_MISSING"` and the phantom
   id in the message.
3. **A pack with `set_object_locked: { id: "phantom", locked: false }` IS flagged** at
   `severity === "error"` with `code === "OBJECT_STATE_REF_MISSING"`.
4. **NON-VACUITY (mandatory):** Correcting the bogus id to a declared object id clears
   the `OBJECT_STATE_REF_MISSING` finding — the check keys on the genuine dangling
   ref, not the mere presence of an `open_object`/`set_object_locked`/`place_object`
   effect.
5. **All three effect kinds covered:** A pack with `open_object`, `set_object_locked`,
   AND `place_object.id` each dangling independently each fires
   `OBJECT_STATE_REF_MISSING` (the check covers all three effect kinds, not just the
   one in the broken fixture).

Test file: `tests/regression/parser_object_state_ref_missing.test.ts`
Bug artifact: `traces/bugs/bug_0291_parser_object_state_ref_missing.yaml`

### What NOT to change

- No schema change (`EffectSchema`, `ConditionSchema`, `ParserPackSchema` — untouched)
- No engine change (`applyEffect`, `applyEffects` — untouched)
- No pack content change (no YAML edits to any shipped pack)
- No content hash re-pin (no shipped pack content changes)
- The `INERT_OBJECT_STATE` warning logic is SEPARATE — it handles dead-bookkeeping
  (a state write no condition ever reads); `OBJECT_STATE_REF_MISSING` handles
  reference integrity (does this object id exist as a declared object?). Both checks
  can fire independently on the same effect; neither replaces the other.
- The `IMPOSSIBLE_OBJECT_STATE` feasibility check is SEPARATE — it checks whether an
  `is_open`/`is_unlocked` condition can ever become true; the new check is on the
  effect side (writes), not the condition side (reads).
- `rpg_validator.ts` requires no edit — it delegates to `validateParser` and inherits
  the new check for free.

---

## Deferred levers (do NOT implement this cycle)

- **divergedAtStep / Trace v2**: already implemented end-to-end. `record.ts:77`
  persists `per_step_hashes`; `replay.ts:49-53` computes and returns `divergedAtStep`.
  The ULTRAPLAN doc was stale on this point. No work remaining.
- **Dialogue goto-ref integrity**: already implemented. `DIALOGUE_GOTO_MISSING` at
  `parser_validator.ts:607-615` cross-checks every `t.goto` against `nodeIds`. The
  loop-strategy reviewer's Candidate B searched for a `next` field that does not
  exist; the field is `goto` and is already validated.
- **`observation_difficulty` / `hide_destinations` per-call parameter**: Week-horizon,
  M effort. `hide_graph` is wired at session-creation time only; adding it to
  `get_observation`, `list_legal_actions`, `step_action` is ~50-60 lines across
  4-5 files. Advance after this validator rung.
- **World-frame manifest schema**: multi-cycle; formally unblocked after bug_0281
  sealed item-ref integrity, but too large for one focused cycle.
- **Benchmark scorecard module**: M effort; no standalone value without a real-model
  API key to produce benchmark rows.
- **Assessor above-floor category** for `content_new` / real-author nominations:
  blocked on API key; wired in adapter.ts but no detection lever in assessor.ts yet.
- **BFS AG(EF goal) forward-reachability validator**: L blast-radius, health
  time-budget risk, explicitly deferred.
- **verify-integrity hardening against in-context reward hacking**: probe-based blind
  judge pattern (EvilGenie arXiv:2511.21654) noted for a future dedicated cycle;
  `verify-integrity.ts` self-documents the semantic-judge gap at lines 33-35.
