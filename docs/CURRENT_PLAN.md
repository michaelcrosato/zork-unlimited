# Current plan (rolling)

This is the AFK loop's **living plan** — the hand-off document for the saturation-triggered ultraplan (see [`docs/afk_loop.md`](./afk_loop.md)). When the deterministic assessor runs dry (`isSaturated`), an ultraplan cycle re-aims the project, **overwrites this file** with the synthesis + the single chosen next move, and a fresh implementation subagent reads _only_ this file (plus the files it names) to do the work.

---

# Ultraplan re-aim cycle #19 (HEAD = bug_0316; next free id = bug_0317)

## Synthesis

Six reviewer teams (engine/validator, content/assessor, loop/strategy, verification/security, and two web researchers) and the orchestrator cross-checked every source claim against the live repo at HEAD = bug_0316.

**Six claimed gaps were confirmed as false alarms.** (1) BFS AG(EF goal) forward-reachability validator — `UNREACHABLE_ROOM` (parser_validator.ts lines 339-350) and `SOFTLOCK` (lines 353-400) together implement both forward and reverse structural reachability; the loop/strategy and engine/validator reviewers both confirmed this. (2) MockAuthorProvider keystone swap — tools.ts line 788 already calls `resolveProvider({ mock: new MockAuthorProvider() })`; the project is one API key away from the first real-LLM proof artifact, not one code change away. (3) bug_0308 vacuous-assertion tautology detector — fully implemented (TAUTOLOGY_RE, MAX_TAUTOLOGY_ASSERTIONS, detectTautologies(), countTautologyAssertions(), TAUTOLOGY_ASSERTION/TAUTOLOGY_FLOOR/TAUTOLOGY_REGRESSION, GuardConstants); the stale docstring at lines 31-33 is a documentation lag, not an open gap. (4) NaN/Infinity guard in effects.ts — guardFinite() already wired. (5) divergedAtStep/replay_trace — already implemented in src/trace/replay.ts. (6) LRU rotation correctness — three regression tests confirm correct behavior; no lock-in path.

**Six genuine gaps confirmed.** (1) `ITEM_UNPLACED` validator: grep for `ITEM_UNPLACED` and `ORPHAN_OBJECT` across all of `src/` returns zero results. The `homeRoom`/`containerOf` maps are built inside `computeObtainable()` (parser_validator.ts lines 1116-1119) for the obtainability fixpoint only — no loop ever asks whether a non-held object appears in at least one room.objects list or container.contents list. An object defined in pack.objects but absent from every room.objects and every container.contents (and not held:true) has no spawn location, is permanently inaccessible, and produces no warning. Confirmed open across two consecutive ultraplan cycles by three independent reviewer teams. (2) Stale docstring in verify-integrity.ts (lines 31-33 still say the tautology gap "is still not caught" after bug_0308 closed it). (3) Multi-line tautology not covered by TAUTOLOGY_RE (no `s`/dotall flag; split-line `expect(foo)\n  .toBe(foo)` escapes detection). (4) TAUTOLOGY_REGRESSION inline in runDrift but not in detectCountRegressions (structural inconsistency, functionally safe). (5) TARGET_PER_MODE threshold stagnation (`{cyoa:2, parser:2, rpg:2}` vs actual 7/5/5; content_new permanently silenced — deliberate deferral per cycle #18 policy). (6) isSaturated() clean-stasis branch (allGeneratorsClean field absent from Assessment).

**ITEM_UNPLACED is the correct single move for this cycle.** It is S-effort, requires no API key, is purely deterministic, and closes the one structural authoring defect class that no existing validator check covers: objects with no spawn location that are silently inaccessible to the player. The web research confirms the strategic value: AdventureForge's four-pillar claim (AI authoring → deterministic engine → independent structured-API play → regression-lock) depends on the validator being structurally complete. A benchmark substrate that silently accepts orphan objects undermines the "complete deterministic validator" guarantee. The verify-integrity.ts gaps (stale docstring, multi-line tautology, TAUTOLOGY_REGRESSION structural consistency) are valid but secondary — they improve documentation and structural consistency without closing any new class of authoring defect.

The benchmark landscape remains favorable: TALES (arXiv 2504.14128), RPGBench (arXiv 2502.00595), BALROG (arXiv 2411.13543), and FictionalQA (arXiv 2506.05639) each address isolated pillars but no system combines all four. The keystone (resolveProvider at tools.ts:788) is already wired — only the API key itself remains as the gating dependency for real-LLM benchmark scores.

---

## The one chosen move

**ITEM_UNPLACED validator check in `parser_validator.ts` (bug_0317):** Add a single validation loop after the existing object-level checks (around line 208) to detect objects defined in `pack.objects` that are not placed in any room, not inside any container, and not held — objects the player can never find or acquire.

### What

The change is confined to `src/validate/parser_validator.ts`, one test file, and one bug artifact. No pack content changes, no schema changes, no engine changes.

**`src/validate/parser_validator.ts`** — add after the existing object-loop that checks HELD_ALSO_PLACED (ends around line 208), before the NPC loop:

```typescript
  // ── ITEM_UNPLACED: objects not reachable by any spawn path ───────────────────
  // Build placement maps from room.objects and container.contents.
  // Held objects (held: true) start in the player's inventory — no room/container
  // placement is needed or expected.  Any other object that appears in neither map
  // has no spawn location and can never be found or picked up by the player.
  {
    const placedInRoom = new Set<string>();
    for (const r of pack.rooms) for (const oid of r.objects) placedInRoom.add(oid);
    const placedInContainer = new Set<string>();
    for (const o of pack.objects) for (const cid of o.contents) placedInContainer.add(cid);

    for (const o of pack.objects) {
      if (o.held) continue; // inventory start — no placement needed
      if (!placedInRoom.has(o.id) && !placedInContainer.has(o.id)) {
        findings.push(
          warn(
            "ITEM_UNPLACED",
            `object "${o.id}" is not placed in any room or container and is not held — it can never be found by the player.`,
            [`object:${o.id}`],
          ),
        );
      }
    }
  }
```

Note: this loop builds its own placement maps local to the top-level validation function. It does NOT reuse the `homeRoom`/`containerOf` maps inside `computeObtainable()` — those are scoped to a different function and built at a later stage. The new maps here are deliberately local to keep the check self-contained and independent of the obtainability fixpoint.

**`tests/unit/parser_validator.test.ts`** (or a new `tests/regression/parser_validator_item_unplaced.test.ts`) — add a describe block:

```typescript
describe("ITEM_UNPLACED — objects with no spawn location", () => {
  it("emits ITEM_UNPLACED warn for an object not in any room and not in any container and not held", () => {
    // build a minimal valid parser pack with one orphan object
    // expect validateParserPack to return a finding with code "ITEM_UNPLACED"
  });
  it("does NOT emit ITEM_UNPLACED for an object listed in room.objects", () => {
    // object placed in a room → no finding
  });
  it("does NOT emit ITEM_UNPLACED for an object listed in a container's contents", () => {
    // object inside a container → no finding
  });
  it("does NOT emit ITEM_UNPLACED for a held:true object with no room or container placement", () => {
    // held object starts in inventory → no finding
  });
  it("all 17 real packs produce zero ITEM_UNPLACED findings", () => {
    // load each pack and validate — no pack should have orphan objects
  });
});
```

**`traces/bugs/bug_0317_item_unplaced_validator.yaml`** (new file):

```yaml
id: bug_0317
title: "parser_validator: ITEM_UNPLACED — objects not placed in any room or container and not held"
pack: null
class: validator-structural
severity: structural
found_by: ultraplan_cycle_19
playtest_report: null

symptom: >
  A parser pack could define an object in pack.objects without listing it in any
  room.objects array, any container.contents array, or marking it held:true. The object
  had no spawn location — it was permanently inaccessible to the player — but the
  validator produced no warning or error. The homeRoom and containerOf maps were already
  built inside computeObtainable() but were scoped to the obtainability fixpoint only;
  no top-level validation loop checked orphan placement.

root_cause: >
  The parser validator checked ROOM_OBJECT_MISSING (room references an undefined object),
  HELD_ALSO_PLACED (held object also listed in a room/container), and
  CONTAINER_CONTENT_MISSING (container references an undefined object) — but had no
  inverse check: an object defined in pack.objects but absent from every room.objects
  and container.contents list (and not held) was silently accepted.

fix: >
  Added ITEM_UNPLACED warn() after the HELD_ALSO_PLACED loop in the top-level validation
  function (around line 208). Builds two local sets (placedInRoom, placedInContainer)
  from room.objects and container.contents, then iterates pack.objects: any non-held
  object absent from both sets emits ITEM_UNPLACED. All 17 real packs produce zero
  ITEM_UNPLACED findings (confirming the floor is non-vacuous).

regression_test: tests/unit/parser_validator.test.ts (ITEM_UNPLACED describe block)
```

### Why

The `homeRoom` and `containerOf` maps are already built inside `computeObtainable()` (parser_validator.ts lines 1116-1119) but those maps are used only for the obtainability fixpoint and are not accessible at the top-level validation scope. grep for `ITEM_UNPLACED` and `ORPHAN_OBJECT` across all of `src/` returns zero results — confirmed by three independent reviewer teams over two consecutive ultraplan cycles. This is the only remaining structural placement gap in the parser validator.

The web research confirms the strategic value: the four-pillar benchmark positioning (AI authoring → deterministic engine → structured-API play → regression-lock) depends on the validator being structurally complete. TALES (arXiv 2504.14128), the nearest prior work, uses static games with no validation layer — AdventureForge's deterministic validator is a core differentiator. Silently accepting orphan objects is a class of authoring defect that would survive schema validation, exhaustive solving, and blind playtesting (since the orphan object never appears), making the validator the only place it can be caught.

The fix is purely additive, S-effort, no API key, and has clear deterministic acceptance criteria. All 17 real packs should produce zero ITEM_UNPLACED findings, confirming the gate is non-vacuous (there are real packs to check) and that current content is already clean.

### Exact files to read and edit

**Read (to understand existing patterns):**
- `src/validate/parser_validator.ts` lines 160-225 — the existing object-loop (CONTAINER_CONTENT_MISSING, KEY_MISSING, LOCKED_NO_KEY, HELD_ALSO_PLACED): the exact style and `warn()`/`err()` call pattern the new loop should follow
- `src/validate/parser_validator.ts` lines 1111-1165 — `computeObtainable()`: understand why homeRoom/containerOf are scoped there and NOT reused in the new check (different function scope; the new check builds its own local sets)
- `tests/unit/parser_validator.test.ts` lines 1-60 — existing test structure: describe block conventions, minimal pack construction helpers

**Create / edit:**
1. `src/validate/parser_validator.ts` — add ITEM_UNPLACED warn loop after the HELD_ALSO_PLACED block (around line 208), before the NPC loop. Use a scoped block `{ ... }` to keep the local sets from polluting the outer scope.
2. `tests/unit/parser_validator.test.ts` (or new `tests/regression/parser_validator_item_unplaced.test.ts`) — add describe block with 5 cases (orphan object fires / room-placed does not fire / container-placed does not fire / held does not fire / all 17 real packs clean)
3. `traces/bugs/bug_0317_item_unplaced_validator.yaml` — new bug artifact

### Acceptance check

`npm run health` must exit 0. Specific criteria:

1. `validateParserPack()` returns a finding with `code: "ITEM_UNPLACED"` and `severity: "warn"` for a pack containing an object that is not in any `room.objects`, not in any `container.contents`, and has `held !== true`.
2. No `ITEM_UNPLACED` finding is emitted for an object listed in `room.objects`.
3. No `ITEM_UNPLACED` finding is emitted for an object listed in a container's `contents` array.
4. No `ITEM_UNPLACED` finding is emitted for an object with `held: true` that is absent from all rooms and containers.
5. All 17 real packs validate with 0 `ITEM_UNPLACED` findings (confirming the gate is non-vacuous and current content is already clean).
6. `verify:integrity` reports 0 errors, 0 warnings on the working tree.
7. Test count increases by the number of new `it()` cases added.
8. All existing tests continue to pass (no regression).

### What NOT to change

- No schema change to any pack format (`ParserPackSchema`, `ConditionSchema`, `EffectSchema`)
- No engine change (`makeStep`, `applyEffects`, `evalConditions`)
- No pack content change — no YAML edits, no hash re-pin
- No change to `TARGET_PER_MODE` or `CATEGORY_WEIGHT` in `src/afk/assessor.ts` (deferred)
- No change to the `frontier` category addition (deferred)
- No change to `isSaturated()` or `Assessment` type (deferred)
- No change to `scripts/verify-integrity.ts` (stale docstring and multi-line tautology deferred)
- The existing `computeObtainable()` function and its internal `homeRoom`/`containerOf` maps must remain untouched — the new validation loop builds independent local sets

---

## Deferred levers (do NOT implement this cycle)

- **Stale docstring in `verify-integrity.ts`:** Lines 31-33 still say the tautology gap "is still not caught" after bug_0308 closed it. S-effort one-paragraph edit. Deferred: does not block any detection coverage; can be bundled with multi-line tautology fix in a fast-follow commit.
- **Multi-line tautology not covered by `TAUTOLOGY_RE`:** The regex has no `s`/dotall flag; `expect(foo)\n  .toBe(foo)` split across lines escapes detection. S-effort regex flag addition or second-pass scanner plus one new unit test. Deferred: real-world test code overwhelmingly writes tautologies on a single line; the risk is narrow.
- **`TAUTOLOGY_REGRESSION` not in `detectCountRegressions`:** Tautology drift comparison is inline in `runDrift`, not in the exported pure `detectCountRegressions` function. Structurally inconsistent but functionally safe. S-effort refactor. Deferred.
- **`TARGET_PER_MODE` threshold update:** `{cyoa:2, parser:2, rpg:2}` vs actual 7/5/5; `content_new` permanently silenced. S-effort one-liner. Deliberate deferral: re-enabling authoring nominations while structural validator gaps remain is the wrong priority order. Revisit after bug_0317 is locked.
- **Assessor `isSaturated()` clean-stasis branch:** Adding `allGeneratorsClean: boolean` to `Assessment` is S-effort and genuinely useful for ultraplan prompt quality. Deferred as secondary to structural integrity work.
- **Assessor `frontier` category:** No `frontier` entry in `Category` union or `CATEGORY_WEIGHT`. M-effort. The scoring signal that makes it meaningful above the 0.5 floor requires a live API key path; a detection stub alone would produce a candidate that fires unconditionally.
- **Parser generator DAG topology variant:** L-effort. Linear 4-room spine only; a DAG variant with parallel sub-puzzles is the right next generator evolution but requires multi-cycle scope.
- **Benchmark scorecard module:** No standalone value without real-model rows. Unblock after the keyed real-model run.
- **Assessor `content_new` above-floor category (API-key path):** Wired in `adapter.ts` but scoring signal blocked on API key.
