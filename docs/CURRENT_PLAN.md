# Current plan (rolling)

This is the AFK loop's **living plan** — the hand-off document for the saturation-triggered ultraplan (see [`docs/afk_loop.md`](./afk_loop.md)). When the deterministic assessor runs dry (`isSaturated`), an ultraplan cycle re-aims the project, **overwrites this file** with the synthesis + the single chosen next move, and a fresh implementation subagent reads _only_ this file (plus the files it names) to do the work.

---

# Ultraplan re-aim cycle #21 (HEAD = bug_0335; next free id = bug_0336)

## Synthesis

Four parallel repo reviewers completed independent analyses. Cross-checking was performed against the confirmed-closed list and the live repo at HEAD = bug_0335.

---

## FALSE ALARMS this cycle

**None.** All four reviewers correctly scoped to open gaps only and did not re-nominate any confirmed-closed item.

Two reviewer findings require framing clarification:

**Reviewer 1 — SKILL_CHECK_PHANTOM_STAT:** Genuine new gap (skill_check.stat not validated against declared vars). S-effort. Noted as new open Gap G — lower priority than Gap A/B, deferred.

**Reviewer 4 — Parser solver blind to skill_check branches:** Already documented in traces/bugs/bug_0334 as a class-level deferred engine gap. L-effort. Not a cycle-choice candidate.

---

## GENUINE GAPS confirmed (with evidence)

### Gap A — NPC dialogue topic conditions excluded from `checkConds`
**File:** `src/validate/parser_validator.ts`
**Evidence:** `checkConds` defined at line 484; called at line 539 (room exit conditions), line 552 (object interaction conditions), line 564 (win_conditions). Never called for `DialogueTopic.conditions` in the NPC/dialogue block (lines 631-697). The `neededWhileHeld` walk at lines 600-603 already iterates `t.conditions` — the infrastructure is fully present, the call is simply absent. A topic gated on `has_flag: "never_set_flag"` or `has_item: "phantom_item"` is silently permanently hidden; no finding is emitted.
**Effort:** S. Three lines in the topic iteration inside the existing NPC loop.
**API key required:** No.
**False-positive risk:** None. `flags_init` already seeded into `settable` (line 435). All 32 current packs are clean.

### Gap B — NPC dialogue topic conditions excluded from `checkUnsatisfiable`
**File:** `src/validate/parser_validator.ts`
**Evidence:** `checkUnsatisfiable` called at lines 856-869 (room variants), 871-886 (object variants/interactions), 892-900 (ending variants), 910 (win_conditions). NOT called for `DialogueTopic.conditions`. Node `variants` shadowing IS checked (line 654-661), but topic condition unsatisfiability is not. An internally contradictory topic gate is permanently hidden with no warning.
**Effort:** S. One `checkUnsatisfiable` call per topic inside the existing loop — same pattern as Gap A.
**API key required:** No.
**False-positive risk:** None.

### Gap C — TARGET_PER_MODE ceiling: content_new re-silenced (structural trap)
**File:** `src/afk/assessor.ts` line 68
**Evidence:** `TARGET_PER_MODE = { cyoa: 12, parser: 10, rpg: 10 }`. Actual pack counts: cyoa=12, parser=10, rpg=10. Gate at line 566: `if (have < target)` — 12>=12, 10>=10, 10>=10 — never fires. Zero content_new candidates generated. Root cause: bug_0335 raised the ceiling to match the exact pack count after falconers_ransom, leaving zero headroom. This is the third occurrence of the same trap (re-aim #19 → bug_0332 first fix; mid-cycle → bug_0335 second fix; now re-aim #21 → bug_0336 third fix). **(CHOSEN MOVE)**
**Effort:** S. Single constant edit.
**API key required:** No.

### Gap D — Stale docstring in verify-integrity.ts
**File:** `scripts/verify-integrity.ts` lines 31-33
**Evidence:** Lines 31-33 still say "a count-preserving swap that keeps a STRONG matcher but makes it vacuous (`expect(true).toBe(true)`) is still not caught." Bug_0308 implemented `detectTautologies()`. Comment is factually wrong.
**Effort:** S. 3-4 line edit. No behavior change.

### Gap E — TAUTOLOGY_REGRESSION inline in runDrift
**File:** `scripts/verify-integrity.ts` lines 656-667
**Evidence:** 12-line TAUTOLOGY_REGRESSION if-block inline in `runDrift`; `detectCountRegressions` handles all other regression codes as a proper standalone function. Cannot be unit-tested in isolation.
**Effort:** S. Move block + 1-2 unit tests.

### Gap F — allGeneratorsClean absent from Assessment
**File:** `src/afk/assessor.ts` lines 52-57
**Evidence:** `Assessment` interface has `{packsByMode, packs, candidates, top}` — no `allGeneratorsClean`. `isSaturated()` (lines 487-489) checks only `a.top === null || a.top.score <= SATURATION_FLOOR`. Cannot distinguish "nothing left to improve" from "scoring collapsed artificially".
**Effort:** S-M.

### New Gap G — SKILL_CHECK_PHANTOM_STAT
**File:** `src/validate/parser_validator.ts`
**Evidence:** `skill_check.stat` references a stat variable (e.g., `tracking`, `physick`, `cunning`) but the validator does not confirm it is declared in `vars`. A stat name typo produces a permanently-impossible skill check with no warning. 8 RPG packs use skill_check stats; all are currently correct, so this is future authoring protection only.
**Effort:** S.
**False-positive risk:** Low.

---

## CHOSEN MOVE

**Gap C: Raise TARGET_PER_MODE ceiling to prevent re-saturation**

**Bug id:** bug_0336

### What

Single-line change in `src/afk/assessor.ts` line 68:

```typescript
// Before:
const TARGET_PER_MODE: Record<string, number> = { cyoa: 12, parser: 10, rpg: 10 };

// After:
const TARGET_PER_MODE: Record<string, number> = { cyoa: 20, parser: 16, rpg: 16 };
```

No other files need changing for the threshold.

### Why this move and not Gap A (NPC topic checkConds)

Scoring:

| Gap | Breaks saturation cycle | No API key | S effort | Deterministic AC | Pillar advance |
|-----|------------------------|-----------|----------|-----------------|---------------|
| A (NPC checkConds) | **No** | Yes | Yes | Yes | Yes |
| B (NPC checkUnsatisfiable) | **No** | Yes | Yes | Yes | Yes |
| C (TARGET_PER_MODE) | **Yes** | Yes | Yes | Yes | Yes |
| D (stale docstring) | No | Yes | Yes | Yes | No |
| E (TAUTOLOGY_REGRESSION) | No | Yes | Yes | Yes | No |
| F (allGeneratorsClean) | No | Yes | S-M | Yes | Marginal |

Gap C is the **only gap that breaks the saturation cycle**. The loop has been at the 0.5 floor again since all three mode targets were met. Without this fix, the loop remains at the 0.5 floor regardless of what else is implemented.

**Why raise to 20/16/16 and not 13/11/11:** The root structural trap is that each re-aim has raised the ceiling to just above the current count (bug_0332 → 10/8/8, bug_0335 → 12/10/10), causing re-saturation after one more authoring run. A ceiling of 20/16/16 provides approximately 8 packs of content_new headroom per mode (based on ~10 packs authored per full content_new cycle). This prevents the fourth occurrence of this same fix.

**Gap A (NPC topic `checkConds`) is the highest-value structural validator gap remaining** — it closes a real silent authoring hole, S-effort, no false-positive risk — and is explicitly "next after bug_0336." But it produces no new content_fix candidates for the current 32 clean packs, so it cannot break saturation alone.

### Acceptance criteria

1. `src/afk/assessor.ts` line 68 reads `{ cyoa: 20, parser: 16, rpg: 16 }` (values strictly above current counts: cyoa > 12, parser > 10, rpg > 10).
2. Running `assess(root)` on the current repo returns at least one candidate with `category: "content_new"` and `score > 0.5`.
3. All three content_new candidates (`new-cyoa`, `new-parser`, `new-rpg`) appear in `candidates`.
4. `isSaturated(assess(root))` returns `false` — the loop is no longer at the 0.5 floor.
5. `npm run health` exits 0.
6. All existing tests continue to pass (no regression).
7. A new bug artifact `traces/bugs/bug_0336_target_per_mode_ceiling.yaml` is created.

### Exact files to read and edit

**Read (to understand context):**
- `src/afk/assessor.ts` lines 59-80 — the constant block
- `src/afk/assessor.ts` lines 560-580 — the content_new candidate generation gate (`if (have < target)`)
- `src/afk/assessor.ts` lines 485-492 — `isSaturated()` to confirm it reads `top.score`
- `docs/DECISION_LOG.md` — to confirm the re-aim #21 entry is appended

**Edit:**
1. `src/afk/assessor.ts` line 68 — raise TARGET_PER_MODE to `{ cyoa: 20, parser: 16, rpg: 16 }`

**Create:**
2. `traces/bugs/bug_0336_target_per_mode_ceiling.yaml` — new bug artifact

### What NOT to change

- No schema changes to any pack format
- No engine changes
- No pack content changes — no YAML edits, no hash re-pins
- Do NOT change `CATEGORY_WEIGHT` values
- Do NOT change `SATURATION_FLOOR`
- Do NOT change `isSaturated()` logic (Gap F — deferred)
- Do NOT add `allGeneratorsClean` to `Assessment` (Gap F — deferred)
- Do NOT implement NPC topic `checkConds` or `checkUnsatisfiable` (Gaps A/B — next after this)
- Do NOT fix the stale docstring in verify-integrity.ts (Gap D — batch with Gap E)
- Do NOT implement SKILL_CHECK_PHANTOM_STAT (Gap G — after Gaps A/B)

---

## Deferred levers (do NOT implement this cycle)

- **Gap A — NPC dialogue topic conditions excluded from `checkConds`:** S-effort, no FP risk, closes the dialogue-side twin of the object/exit feasibility check. Highest-value structural validator gap remaining. **Implement next after bug_0336.**
- **Gap B — NPC dialogue topic conditions excluded from `checkUnsatisfiable`:** S-effort, zero FP risk. Batch with Gap A in the same commit (same loop, adjacent calls).
- **Gap D — Stale docstring in verify-integrity.ts (lines 31-33):** S-effort 4-line edit. Safe to batch with Gap E.
- **Gap E — TAUTOLOGY_REGRESSION not in detectCountRegressions:** S-effort refactor. Batch with Gap D.
- **Gap F — allGeneratorsClean absent from Assessment:** S-M effort. Genuinely useful for isSaturated disambiguation. Deferred: low urgency while saturation cycle is the primary problem.
- **Gap G — SKILL_CHECK_PHANTOM_STAT:** S-effort. After Gaps A/B. All 32 current packs clean.
- **Dialogue root re-greet validator:** Confirmed in 3 packs, S-effort. Deferred until Gaps A/B land (shares NPC iteration loop — implement as third pass in same block).
- **Class-level stale reactive description validator:** Viable as WARN-only, 30-50% FP rate without tuning. Design the suppression strategy first.
- **Parser solver blind to skill_check branches (bug_0334 class):** L-effort engine change. Deferred.
- **Benchmark scorecard / frontier category:** Blocked on API key.
- **Parser generator DAG topology variant:** L-effort, multi-cycle scope.
