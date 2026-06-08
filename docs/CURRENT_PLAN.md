# Current plan (rolling)

This is the AFK loop's **living plan** — the hand-off document for the
saturation-triggered ultraplan (see [`docs/afk_loop.md`](./afk_loop.md)). When the
deterministic assessor runs dry (`isSaturated`), an ultraplan cycle re-aims the
project, **overwrites this file** with the synthesis + the single chosen next move,
and a fresh implementation subagent reads _only_ this file (plus the files it names)
to do the work.

---

# Ultraplan re-aim cycle #15 (HEAD = bug_0280; next free id = bug_0281)

## Synthesis

A bounded ultraplan ran this cycle — **4 repo reviewers** (engine/validator ·
content/authoring · verification/benchmark · loop/strategy) **+ 2 web researchers**
(frontier IF/agentic benchmarks · reward-hacking/verification) **→ 1 synthesis**,
each grounded against the live repo at HEAD = bug_0280 (watchtower_road content fix),
then the chosen move was independently re-verified by the orchestrator against source.

**Convergent signal across reviewers.** Three of the four repo reviewers independently
named the `add_item`/`remove_item` item-ref validator gap as the highest-value
structural next move:
- The engine/validator reviewer confirmed `collectRoomRefs` has no parallel for item
  ids, and the item-ref gap is the only remaining structural hole in the reference-
  integrity chain.
- The loop/strategy reviewer confirmed the ultraplan #14 CURRENT_PLAN.md explicitly
  sequenced this as "correctly deferred to the cycle after unlock_exit is sealed" —
  and unlock_exit IS now sealed (bug_0278).
- The content/authoring reviewer named an assessor above-floor category (M effort,
  no payoff until API key); the verification reviewer named the benchmark scorecard
  module (M effort, new module creation) — both correctly deferred as M-effort items
  larger than one focused cycle commit and not on the assume-guarantee ladder.
- Both web researchers confirmed: (a) the benchmark whitespace (contamination-free
  author→compile→play→lock) remains unoccupied by any single published system as of
  June 2026; (b) in-context reward hacking is the primary verification blind spot not
  covered by file-edit detection — noted for the deferred verify-integrity hardening
  track.

**The orchestrator re-verified the gap in source at HEAD = bug_0280:**
- `objById = new Map(pack.objects.map((o) => [o.id, o]))` is already built at
  `src/validate/parser_validator.ts:111`.
- `allEffects` already iterates `add_item` targets at line 486 (for the obtainability
  fixpoint) and `remove_item` targets at line 491 — but only into the `granted` /
  `removed` sets; neither is cross-checked against `objById`.
- No `ITEM_REF_MISSING` or equivalent error code exists anywhere in the file.
- A Python scan over all 17 shipped parser+RPG packs found **0 dangling item refs** —
  so landing the check is provably green-preserving on all shipped content.

**Why `ITEM_REF_MISSING` wins on all selection criteria:**

1. **Genuinely open:** Confirmed at source. `allEffects` collects `add_item` /
   `remove_item` targets but never validates them against `objById`.
2. **Structural (not content polish):** Closes the final intra-frame
   reference-integrity rung. Together bug_0277 (room refs in conditions/effects) +
   bug_0278 (unlock_exit room refs) + bug_0281 (item refs in add_item/remove_item)
   seal all three reference families — the formal precondition for the deferred
   world-frame manifest.
3. **Effort S:** One new emit block in `parser_validator.ts`, mirroring the
   `UNRESOLVED_ROOM_REFERENCE` / `UNLOCK_EXIT_ROOM_MISSING` pattern exactly. No
   schema change, no engine change, no pack hash change.
4. **Green-preserving:** 0 dangling item refs across all 17 shipped packs verified.
5. **Produces locked artifacts (§15):** New error code, broken fixture, regression
   test, bug artifact — the standard pattern.

---

## The one chosen move

**Add `ITEM_REF_MISSING` validator check (bug_0281):** Cross-check `add_item` and
`remove_item` effect targets against the pack's declared object IDs using the existing
`objById` map, emitting a new `error`-severity error code for dangling item references.

### What

In `src/validate/parser_validator.ts`, after the `UNLOCK_EXIT_ROOM_MISSING` block (the
`unlock_exit` check from bug_0278), add a new emit block that:

1. Collects all item ids referenced by `add_item` and `remove_item` effects across the
   whole pack (via `allEffects(pack)`).
2. Checks each against `objById` (the `new Map(pack.objects.map((o) => [o.id, o]))`
   already computed at line 111).
3. Emits `err("ITEM_REF_MISSING", ...)` (severity `error`, like
   `UNRESOLVED_ROOM_REFERENCE`) for any item id not in `objById`.
4. Adds `ITEM_REF_MISSING` to the bail-early guard alongside
   `UNLOCK_EXIT_ROOM_MISSING` / `EXIT_TARGET_MISSING` / `START_MISSING` (a dangling
   item id could corrupt the obtainability fixpoint that uses `objById`).

### Why

A typo'd `add_item: "lantren"` silently inserts a phantom string into inventory that:
- Has no object description (can't be examined)
- Can never be interacted with (no interaction entries)
- Appears in the player's inventory with a nonsense label
- Is never flagged by any existing check (the `ITEM_REQUIRED_UNOBTAINABLE` liveness
  check only fires on `has_item` gates whose item cannot be obtained — it does NOT
  check that the item is a declared object id)

A typo'd `remove_item: "lantren"` silently no-ops — the item is never removed, the
puzzle state is wrong, and no error is reported.

This is the item-ref analogue of `EXIT_TARGET_MISSING` (a room you can navigate to
that doesn't exist) and `UNRESOLVED_ROOM_REFERENCE` (a condition that evaluates
permanently false because the room id was typo'd).

### Exact files to read and edit

**Read (to understand the existing patterns):**
- `src/validate/parser_validator.ts` lines 100-115 (objById construction, bail-early
  guard)
- `src/validate/parser_validator.ts` lines 1625-1680 (UNLOCK_EXIT_ROOM_MISSING block
  — the exact template to mirror)
- `src/validate/parser_validator.ts` lines 480-495 (where `allEffects` is already
  used to collect add_item/remove_item targets — the context for placement)
- `content/broken-fixtures/parser_unlock_exit_room_missing.yaml` (fixture template)
- `tests/regression/parser_unlock_exit_room_missing.test.ts` (test template)
- `tests/unit/parser_validator.test.ts` lines 1-40 (VALIDATOR_FIXTURES registration)
- `tests/regression/parser_validator_negative_corpus.test.ts` (corpus registration)
- `traces/bugs/bug_0278_parser_unlock_exit_room_missing.yaml` (artifact template)

**Create / edit:**
1. `src/validate/parser_validator.ts` — add ITEM_REF_MISSING emit block + bail-early
   guard entry
2. `content/broken-fixtures/parser_item_ref_missing.yaml` — minimal broken fixture
   with a dangling add_item target; must be a valid-except-for-item-ref pack
3. `tests/regression/parser_item_ref_missing.test.ts` — 5 cases (see acceptance
   check below)
4. `tests/unit/parser_validator.test.ts` — register the new fixture in
   `VALIDATOR_FIXTURES`
5. `tests/regression/parser_validator_negative_corpus.test.ts` — add one
   `ITEM_REF_MISSING` case at `severity === "error"` to the negative corpus
6. `traces/bugs/bug_0281_parser_item_ref_missing.yaml` — bug artifact

### Acceptance check

`npm run health` must exit 0. The specific acceptance criteria:

1. **All 17 shipped parser+RPG packs produce zero `ITEM_REF_MISSING` findings** (the
   new check must not regress any existing pack — verified: 0 dangling item refs in
   shipped content).
2. **A pack with `add_item` targeting an undeclared object id IS flagged** at
   `severity === "error"` with `code === "ITEM_REF_MISSING"` and the phantom id in
   the message.
3. **A pack with `remove_item` targeting an undeclared object id IS flagged** at
   `severity === "error"` with `code === "ITEM_REF_MISSING"`.
4. **NON-VACUITY:** Correcting the bogus id to a declared object id clears the
   finding (the check must be sensitive to the fix).
5. **Both `add_item` AND `remove_item` dangling in the same pack each independently
   fire `ITEM_REF_MISSING`** (the check covers both effect kinds).

Test file: `tests/regression/parser_item_ref_missing.test.ts`
Bug artifact: `traces/bugs/bug_0281_parser_item_ref_missing.yaml`

### What NOT to change

- No schema change (`EffectSchema`, `ConditionSchema`, `ParserPackSchema` — untouched)
- No engine change (`applyEffect`, `applyEffects` — untouched)
- No pack content change (no YAML edits to any shipped pack)
- No content hash re-pin (no shipped pack content changes)
- No scorecard regen (no pack added/removed)
- The `ITEM_REQUIRED_UNOBTAINABLE` logic is SEPARATE from this check and must not be
  modified — it handles liveness (can this item be obtained at all?), while
  `ITEM_REF_MISSING` handles reference integrity (does this item id exist as a
  declared object?)

---

## Deferred levers (do NOT implement this cycle)

- **Benchmark scorecard module** (new module: a benchmark harness under src/afk/ and
  bin/, with a traces/benchmark/ data dir) — M effort; advance after this validator rung.
- **Assessor above-floor category** — no payoff until real-model API key exists.
- **BFS AG(EF goal) forward-reachability validator** — L blast-radius, health
  time-budget risk, explicitly deferred.
- **World-frame manifest schema** — multi-cycle; formally blocked until
  add_item/remove_item item-ref integrity (this cycle's move) is sealed.
- **verify-integrity hardening against in-context reward hacking** — web research
  confirms cryptographic decision logging + held-out blind suite are the frontier
  mitigation pattern; noted for a future dedicated cycle.
- **Assessor parser/RPG above-floor nomination** — wired in adapter.ts but no
  detection lever in assessor.ts yet; deferred until API key path is live.
