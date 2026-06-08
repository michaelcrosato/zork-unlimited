# Current plan (rolling)

This is the AFK loop's **living plan** — the hand-off document for the saturation-triggered ultraplan (see [`docs/afk_loop.md`](./afk_loop.md)). When the deterministic assessor runs dry (`isSaturated`), an ultraplan cycle re-aims the project, **overwrites this file** with the synthesis + the single chosen next move, and a fresh implementation subagent reads _only_ this file (plus the files it names) to do the work.

---

# Ultraplan re-aim cycle #20 (HEAD = bug_0331; next free id = bug_0332)

## Synthesis

Four parallel repo reviewers completed independent analyses. Cross-checking was performed against the confirmed-closed list and the live repo at HEAD = bug_0331.

---

## FALSE ALARMS this cycle

**None of the reviewer findings duplicate a confirmed-closed gap.** All four reviewers correctly scoped to open gaps only. However, two findings require reclassification from their original framing:

**Reviewer 3 — "class-level stale reactive description validator":** This is a genuine open gap but correctly categorized by the reviewer as high false-positive risk (30-50% FP rate without tuning). The reviewer's own conclusion ("implement as WARN, every finding still needs human sign-off") accurately describes why it scores below the chosen move. Not a false alarm, but lower value than claimed.

**Reviewer 4 — "stale docstring (Gap 1)":** Confirmed open. The docstring at `scripts/verify-integrity.ts` lines 31-33 still reads "a count-preserving swap that keeps a STRONG matcher but makes it vacuous (`expect(true).toBe(true)`) is still not caught." Bug_0308 closed this. This IS a live false statement in a security-adjacent comment. However, it was already confirmed open in cycle #19 and deliberately deferred then. Reclassification: genuine, open, lowest-cost fix — but it was already the lowest-priority deferred item. Valid to carry forward, not a cycle-choice candidate.

---

## GENUINE GAPS confirmed (with evidence)

### Gap A — NPC dialogue topic conditions excluded from `checkConds` feasibility scan
**File:** `src/validate/parser_validator.ts`
**Evidence:** `checkConds` is defined at line 484 and called at exactly three sites: line 539 (room exit conditions), line 552 (object interaction conditions), line 564 (win_conditions). It is never called for `DialogueTopic.conditions`. The NPC dialogue block (lines 631-697) validates GOTO integrity (DIALOGUE_GOTO_MISSING), termination (DIALOGUE_NONTERMINATING), and node variant shadowing/unsatisfiability — but not topic gate feasibility. A topic gated on `has_flag: "never_set_flag"` or `has_item: "phantom_item"` is silently permanently hidden; no finding is emitted. The `neededWhileHeld` walk at lines 600-603 already iterates `t.conditions` — the infrastructure is fully present, the call is simply absent.
**Effort:** S. Three lines in the topic iteration inside the existing NPC loop.
**API key required:** No.
**False-positive risk:** Low-to-none. `flags_init` is already seeded into `settable` (line 435), so a flag pre-set only via `flags_init` consumed only as a topic gate stays green correctly.

### Gap B — NPC dialogue topic conditions excluded from `checkUnsatisfiable`
**File:** `src/validate/parser_validator.ts`
**Evidence:** `checkUnsatisfiable` is called for room variants (lines 856-869), object variants and interactions (lines 871-886), ending variants (lines 892-900), and win_condition conditions (line 910). It is NOT called for `DialogueTopic.conditions`. An internally contradictory topic gate (e.g., `all_of: [{has_flag: X}, {not_flag: X}]`) is permanently hidden with no warning. Node `variants` shadowing IS checked (line 654-661), but topic condition unsatisfiability is not.
**Effort:** S. One `checkUnsatisfiable` call per topic inside the existing loop — same pattern as Gap A.
**API key required:** No.
**False-positive risk:** None. `checkUnsatisfiable` is already conservative (opaque disjunctions bail).

### Gap C — TARGET_PER_MODE threshold: content_new permanently silenced
**File:** `src/afk/assessor.ts` line 68
**Evidence:** `TARGET_PER_MODE = { cyoa: 2, parser: 2, rpg: 2 }`. Actual pack counts: cyoa=7 (clockwork_heist, dead_reckoning, midnight_edition, tithe_barn, watchtower_road, white_stag, wreckers_light), parser=5 (alchemists_tower, friars_postern, lamplighters_round, sealed_crypt, tide_mill), rpg=5 (breaking_weir, cold_forge, dawn_beacon, sunken_barrow, wolf_winter). Gate at line 566: `if (have < target)` — 7>=2, 5>=2, 5>=2 — never fires. Zero content_new candidates are generated. Every cycle at the 0.5 floor is a blind-pass content_fix stub. Deferral reason from cycle #19 DECISION_LOG: "re-enabling authoring nominations while structural validator gaps remain is the wrong priority order. Revisit after bug_0317 is locked." Bug_0317 (ITEM_UNPLACED) is now locked. Deferral condition is satisfied.
**Effort:** S. Single constant edit at assessor.ts line 68. No tests pin the exact numbers.
**API key required:** No.
**Saturation impact:** Raising to `{cyoa:10, parser:8, rpg:8}` would score content_new candidates at `score(5, "L", "content_new")` = `(5/3)*0.85` ≈ 1.417 — well above the 0.5 saturation floor, immediately redirecting the loop to net-new authoring.

### Gap D — Stale docstring in verify-integrity.ts
**File:** `scripts/verify-integrity.ts` lines 31-33
**Evidence:** Text still says the tautology case "is still not caught." Bug_0308 implemented `detectTautologies()`, `TAUTOLOGY_RE`, `MAX_TAUTOLOGY_ASSERTIONS`. Confirmed by reading line 147-148 (TAUTOLOGY_RE present) and lines 153-169 (detectTautologies implemented). Open since cycle #19.
**Effort:** S. 4-line edit. No behavior change, no tests needed.

### Gap E — TAUTOLOGY_REGRESSION inline in runDrift, not in detectCountRegressions
**File:** `scripts/verify-integrity.ts` lines 656-667
**Evidence:** `detectCountRegressions` (not read in full but described by Reviewer 4 as handling TEST_COUNT_REGRESSION, ASSERTION_COUNT_REGRESSION, STRONG_ASSERTION_REGRESSION only). TAUTOLOGY_REGRESSION lives as an inline if-block in `runDrift` (lines 656-667), confirmed by direct read. Structurally inconsistent — the tautology branch cannot be unit-tested against `detectCountRegressions` in isolation.
**Effort:** S. Move block into `detectCountRegressions`, add 1-2 unit tests.

### Gap F — allGeneratorsClean absent from Assessment type
**File:** `src/afk/assessor.ts` lines 52-57
**Evidence:** `Assessment` type confirmed as `{ packsByMode, packs, candidates, top }` — no `allGeneratorsClean` field. `isSaturated()` (line 487-488) uses only `a.top === null || a.top.score <= SATURATION_FLOOR`. A loop saturated because all generators are clean is indistinguishable from one saturated because scoring collapsed.
**Effort:** S-M. Thread a boolean through `assess()`, update `isSaturated` or add helper, 2-3 unit tests.

---

## CHOSEN MOVE

**Gap C: Raise TARGET_PER_MODE to break the saturation cycle**

**Bug id:** bug_0332

### What

Single-line change in `src/afk/assessor.ts` line 68:

```typescript
// Before:
const TARGET_PER_MODE: Record<string, number> = { cyoa: 2, parser: 2, rpg: 2 };

// After:
const TARGET_PER_MODE: Record<string, number> = { cyoa: 10, parser: 8, rpg: 8 };
```

No other files need changing for the threshold. However, the deferral condition in `docs/DECISION_LOG.md` must be updated to note this gap is now closed.

### Why this move and not Gap A (NPC topic checkConds)

Scoring:

| Gap | Breaks saturation cycle | No API key | S effort | Deterministic AC | Pillar advance |
|-----|------------------------|-----------|----------|-----------------|---------------|
| A (NPC checkConds) | No | Yes | Yes | Yes | Yes |
| B (NPC checkUnsatisfiable) | No | Yes | Yes | Yes | Yes |
| C (TARGET_PER_MODE) | **Yes** | Yes | Yes | Yes | Yes |
| D (stale docstring) | No | Yes | Yes | Yes | No |
| E (TAUTOLOGY_REGRESSION) | No | Yes | Yes | Yes | No |
| F (allGeneratorsClean) | No | Yes | S-M | Yes | Marginal |

Gap C is the **only gap that breaks the saturation cycle**. The loop has been stuck at the 0.5 floor for 50 consecutive cycles (bugs 0282-0331) producing reactive-description-blindness content_fix findings. Every structural validator gap that justified deferring TARGET_PER_MODE is now closed (ITEM_UNPLACED landed as bug_0317). The deferral condition is gone.

Gap A (NPC topic `checkConds`) is the highest-value structural validator gap — it closes a real silent authoring hole, it is S-effort, it has no false-positive risk, and it should be the next move AFTER the saturation cycle is broken. But it does not move the 0.5 needle: it adds a new class of validator warning to parser packs, and only packs that actually have impossible topic gates would generate a new finding. All 17 shipped packs are structurally clean (that is why they are at 0.5). Gap A produces no new content_fix candidates above 0.5 for currently-clean packs; it only prevents future authoring defects from slipping through silently.

Gap C produces three `content_new` candidates scored at ~1.417, immediately above the 0.5 floor, redirecting every subsequent cycle to net-new pack authoring. This is the structural re-aim the loop needs.

### Acceptance criteria

1. `src/afk/assessor.ts` line 68 reads `{ cyoa: 10, parser: 8, rpg: 8 }` (or any values strictly above current counts: cyoa > 7, parser > 5, rpg > 5).
2. Running `assess(root)` on the current repo returns at least one candidate with `category: "content_new"` and `score > 0.5`.
3. All three content_new candidates (`new-cyoa`, `new-parser`, `new-rpg`) appear in `candidates`.
4. `isSaturated(assess(root))` returns `false` — the loop is no longer at the 0.5 floor.
5. `npm run health` exits 0.
6. All existing tests continue to pass (no regression).
7. A new bug artifact `traces/bugs/bug_0332_target_per_mode_threshold.yaml` is created.

### Exact files to read and edit

**Read (to understand context):**
- `src/afk/assessor.ts` lines 59-80 — the constant block, `score()` function, `EFFORT_COST`, `CATEGORY_WEIGHT`
- `src/afk/assessor.ts` lines 563-579 — the content_new candidate generation block (the `if (have < target)` gate)
- `src/afk/assessor.ts` lines 487-489 — `isSaturated()` to confirm it reads `top.score`
- `docs/DECISION_LOG.md` — to find and update the TARGET_PER_MODE deferral entry

**Edit:**
1. `src/afk/assessor.ts` line 68 — raise TARGET_PER_MODE constants
2. `docs/DECISION_LOG.md` — mark TARGET_PER_MODE deferral as resolved (bug_0317 is now closed; the deferral condition is satisfied)

**Create:**
3. `traces/bugs/bug_0332_target_per_mode_threshold.yaml` — new bug artifact

### What NOT to change

- No schema changes to any pack format
- No engine changes
- No pack content changes — no YAML edits, no hash re-pins
- Do NOT change `CATEGORY_WEIGHT` values
- Do NOT change `SATURATION_FLOOR`
- Do NOT change `isSaturated()` logic (Gap F — deferred)
- Do NOT add `allGeneratorsClean` to `Assessment` (Gap F — deferred)
- Do NOT implement NPC topic `checkConds` or `checkUnsatisfiable` (Gaps A/B — next after this)
- Do NOT fix the stale docstring in verify-integrity.ts (Gap D — can batch with Gap E)

---

## Deferred levers (do NOT implement this cycle)

- **Gap A — NPC dialogue topic conditions excluded from `checkConds`:** S-effort, no false-positive risk, closes the dialogue-side twin of the object/exit feasibility check. Highest-value structural validator gap remaining. Implement next after bug_0332.
- **Gap B — NPC dialogue topic conditions excluded from `checkUnsatisfiable`:** S-effort, zero false-positive risk. Batch with Gap A in the same commit (same loop, adjacent calls).
- **Gap D — Stale docstring in verify-integrity.ts (lines 31-33):** S-effort 4-line edit. Deferred again: zero detection coverage change, safe to batch with Gap E.
- **Gap E — TAUTOLOGY_REGRESSION not in detectCountRegressions:** S-effort refactor. Structurally inconsistent but functionally safe. Batch with Gap D.
- **Gap F — allGeneratorsClean absent from Assessment:** S-M effort. Genuinely useful for isSaturated disambiguation. Deferred: low urgency while saturation cycle is the primary problem.
- **Class-level stale reactive description validator (Reviewer 3):** Viable as WARN-only advisory, estimated 30-50% FP rate without tuning. Requires suppression list maintenance across 17 packs. Deferred: design the suppression strategy first.
- **Dialogue root re-greet validator (Reviewer 3 "next most common bug class"):** Confirmed in 3 packs. Low FP risk (pattern is structurally tight: heard_* flag set by child, not read by parent). S-effort. Deferred until Gaps A/B are landed (they are the closer structural analogue and come first).
- **Parser generator DAG topology variant:** L-effort, multi-cycle scope.
- **Benchmark scorecard / frontier category:** Blocked on API key.
