# Current plan (rolling)

This is the AFK loop's **living plan** — the hand-off document for the saturation-triggered ultraplan (see [`docs/afk_loop.md`](./afk_loop.md)). When the deterministic assessor runs dry (`isSaturated`), an ultraplan cycle re-aims the project, **overwrites this file** with the synthesis + the single chosen next move, and a fresh implementation subagent reads _only_ this file (plus the files it names) to do the work.

---

# Ultraplan re-aim cycle #18 (HEAD = bug_0307; next free id = bug_0308)

## Synthesis

Four reviewer teams (engine/verify-integrity, content/validator, loop/strategy, verification/benchmark) and two web-research agents (frontier IF benchmarks, agentic/spatial benchmarks) reported findings this cycle. The orchestrator cross-checked every source claim against the live repo at HEAD = bug_0307.

**Two claimed gaps were false alarms confirmed at source.** The content/validator reviewer correctly self-flagged BFS forward-reachability for rooms as `already_done: true` — it is implemented at `src/validate/parser_validator.ts` lines 339-350 (`UNREACHABLE_ROOM` warning). The benchmark reviewer correctly self-flagged `hide_graph` per-call override as `already_done: true` — confirmed present at `src/mcp/server.ts` and `tests/regression/observation_hide_graph_per_call.test.ts` (bug_0299). Both are genuine non-gaps.

**Three gaps converged across multiple reviewers as genuinely open.** (1) The vacuous-assertion static detector: the engine/verify-integrity reviewer and the verification/benchmark reviewer both nominated it; the script's own docstring at lines 31-33 explicitly concedes it; grep confirms no `detectTautologies`, `TAUTOLOGY`, or `VACUOUS_ASSERTION` pattern exists anywhere in the codebase. (2) The `ITEM_UNPLACED` validator check: the content/validator reviewer confirmed no `ITEM_UNPLACED` or `ORPHAN_OBJECT` error code exists in any validator. (3) The assessor's `TARGET_PER_MODE` threshold stagnation: `TARGET_PER_MODE` is `{ cyoa: 2, parser: 2, rpg: 2 }` while the repo has 7 CYOA / 5 parser / 5 RPG packs — all modes permanently above threshold, so the `content_new` lever never fires, and no `frontier` category exists in `CATEGORY_WEIGHT`.

**The vacuous-assertion detector is the correct single move for this cycle.** It is S-effort (one new exported function, one new regex, two wiring calls, and unit + regression tests), requires no API key, is fully deterministic, and directly closes the one mechanical hole the current three-count anti-tamper system admits. The SpecBench paper (arXiv:2605.21384, May 2026) and Hack-Verifiable Environments paper (arXiv:2605.20744, May 2026) both confirm that two-layer deterministic + LLM-judge verification is the strongest available reward-hacking detection approach — but only when the deterministic layer is complete. The existing three-count system guards against: shell deletion (`it()` count), body gutting (`expect()` count), and strict-to-loose swaps (strong-matcher count). The tautology detector adds the fourth layer: count-preserving semantic laundering where a strong matcher is kept but made vacuous (`expect(true).toBe(true)`, `expect(x).toBe(x)`). This is the EvilGenie (arXiv:2511.21654) attack class the ULTRAPLAN explicitly named as "second-place pick" in cycle #17 — and the current cycle has no higher-priority engine gap.

The `ITEM_UNPLACED` validator gap is the strongest runner-up: also S-effort, also genuinely open. It is deferred only because the vacuous-assertion detector has higher research-integrity value (it closes a documented hole in the anti-reward-hacking guard) and the two are independent. The `TARGET_PER_MODE` fix is a one-liner but would only nominate authoring more packs in modes that already have healthy breadth — not the right move while structural integrity gaps remain. The `frontier` category addition is M-effort and partially blocked on the API key path for its scoring signal.

---

## The one chosen move

**Static vacuous-assertion detector in `verify-integrity.ts` (bug_0308):** Add a `detectTautologies()` function that flags count-preserving semantic tautologies (`expect(true).toBe(true)`, `expect(x).toBe(x)`) as a fourth anti-tamper layer, wired into both `runStatic()` and `runDrift()`.

### What

The change is confined to `scripts/verify-integrity.ts`, two test files, and one bug artifact. No pack content changes, no schema changes, no engine changes.

**`scripts/verify-integrity.ts`** — add after the `STRONG_ASSERTION_RE` constant block (around line 123):

```typescript
/** A MAX count of tautological (vacuous) assertions per test suite.
 *  A tautology keeps a STRONG matcher (so STRONG_ASSERTION_RE fires) but makes it
 *  vacuous: the actual value is a literal and equals the expected literal, or both
 *  sides are the same identifier. Set to 0 for the real repo floor; the drift
 *  guard fires on any INCREASE across a cycle. */
export const MAX_TAUTOLOGY_ASSERTIONS = 0;

/** Matches vacuous assertion patterns the three-count system cannot catch:
 *  (a) literal-bool:   expect(true).toBe(true)  / expect(false).toBe(false)
 *  (b) literal-null:   expect(null).toBe(null)  / expect(undefined).toBe(undefined)
 *  (c) numeric/string literal: expect(42).toBe(42) / expect("x").toBe("x")
 *  (d) identical identifier: expect(foo).toBe(foo) / expect(bar).toEqual(bar)
 *
 *  Uses a backreference (\1) so false positives (expect(true).toBe(false)) are
 *  not matched — the actual and expected must be IDENTICAL. */
const TAUTOLOGY_RE =
  /\bexpect\s*\(\s*(true|false|null|undefined|\d[\d.]*|"[^"]*"|'[^']*'|`[^`]*`|[A-Za-z_$][A-Za-z0-9_$.]*)\s*\)\s*\.\s*(?:toBe|toEqual|toStrictEqual)\s*\(\s*\1\s*\)/g;

/** Detect count-preserving semantic tautologies: assertions that keep a STRONG
 *  matcher (so the strong-matcher count is unchanged) but make it vacuous by
 *  comparing a value to itself. Pure over the given texts. */
export function detectTautologies(files: { path: string; text: string }[]): Finding[] {
  const findings: Finding[] = [];
  for (const f of files) {
    let m: RegExpExecArray | null;
    const re = new RegExp(TAUTOLOGY_RE.source, TAUTOLOGY_RE.flags);
    while ((m = re.exec(f.text)) !== null) {
      const lineNo = f.text.slice(0, m.index).split("\n").length;
      findings.push({
        severity: "error",
        code: "TAUTOLOGY_ASSERTION",
        message: `vacuous tautology assertion: ${m[0].trim().slice(0, 80)} — actual and expected are identical; this assertion always passes and pins nothing`,
        where: `${f.path}:${lineNo}`,
      });
    }
  }
  return findings;
}

export function countTautologyAssertions(files: { text: string }[]): number {
  return files.reduce((n, f) => {
    const re = new RegExp(TAUTOLOGY_RE.source, TAUTOLOGY_RE.flags);
    return n + (f.text.match(re)?.length ?? 0);
  }, 0);
}
```

**`runStatic()` in `scripts/verify-integrity.ts`** (around line 197, after `detectDisabledTests`):

Add after the `findings.push(...detectDisabledTests(testFiles));` line:

```typescript
findings.push(...detectTautologies(testFiles));
const tautologies = countTautologyAssertions(testFiles);
if (tautologies > MAX_TAUTOLOGY_ASSERTIONS) {
  findings.push({
    severity: "error",
    code: "TAUTOLOGY_FLOOR",
    message: `${tautologies} tautological assertion(s) found; floor is ${MAX_TAUTOLOGY_ASSERTIONS} (vacuous expect(x).toBe(x) patterns keep the strong-matcher count but assert nothing)`,
    where: "tests/",
  });
}
```

**`runDrift()` in `scripts/verify-integrity.ts`** — add a tautology-count regression check after the existing `detectCountRegressions` call. Extend `TestArtifactCounts` with `tautologies?: number`, update `countTestArtifactsAtRef` to count tautologies in the same batch loop, and emit `TAUTOLOGY_REGRESSION` when the count increases:

```typescript
if (before.tautologies !== undefined && now.tautologies !== undefined &&
    now.tautologies > before.tautologies) {
  findings.push({
    severity: "error",
    code: "TAUTOLOGY_REGRESSION",
    message: `tautological assertions increased from ${before.tautologies} to ${now.tautologies} this cycle — a vacuous expect(x).toBe(x) was introduced`,
    where: "tests/",
  });
}
```

Also add `MAX_TAUTOLOGY_ASSERTIONS` to the `GuardConstants` type and `parseGuardConstants` parser (so `detectGuardWeakening` covers raising the floor).

**`tests/unit/verifier_integrity.test.ts`** — add a new `describe("detectTautologies", ...)` block:

```typescript
describe("detectTautologies — catches vacuous semantic tautologies the strong-matcher count misses", () => {
  it("flags literal-bool tautology: expect(true).toBe(true)", () => {
    const text = "it('x', () => { expect(true).toBe(true); });";
    const findings = detectTautologies([{ path: "t.test.ts", text }]);
    expect(findings.length).toBe(1);
    expect(findings[0]!.code).toBe("TAUTOLOGY_ASSERTION");
  });
  it("flags literal-false tautology: expect(false).toBe(false)", () => {
    const findings = detectTautologies([{ path: "t.test.ts", text: "expect(false).toBe(false);" }]);
    expect(findings.length).toBe(1);
  });
  it("flags identical-identifier self-comparison: expect(foo).toBe(foo)", () => {
    const findings = detectTautologies([{ path: "t.test.ts", text: "expect(foo).toBe(foo);" }]);
    expect(findings.length).toBe(1);
    expect(findings[0]!.code).toBe("TAUTOLOGY_ASSERTION");
  });
  it("flags numeric-literal tautology: expect(42).toBe(42)", () => {
    const findings = detectTautologies([{ path: "t.test.ts", text: "expect(42).toBe(42);" }]);
    expect(findings.length).toBe(1);
  });
  it("does NOT flag a genuine assertion: expect(a).toBe(1)", () => {
    const findings = detectTautologies([{ path: "t.test.ts", text: "expect(a).toBe(1);" }]);
    expect(findings.length).toBe(0);
  });
  it("does NOT flag expect(true).toBe(false) — different literal values", () => {
    const findings = detectTautologies([{ path: "t.test.ts", text: "expect(true).toBe(false);" }]);
    expect(findings.length).toBe(0);
  });
  it("does NOT flag expect(a).toBe(b) — different identifiers", () => {
    const findings = detectTautologies([{ path: "t.test.ts", text: "expect(a).toBe(b);" }]);
    expect(findings.length).toBe(0);
  });
  it("the real repo has zero tautological assertions", () => {
    const res = runStatic(process.cwd());
    expect(res.findings.filter((f) => f.code === "TAUTOLOGY_ASSERTION")).toEqual([]);
    expect(res.findings.filter((f) => f.code === "TAUTOLOGY_FLOOR")).toEqual([]);
  });
});
```

**`tests/regression/verifier_strict_to_loose_swap.test.ts`** — add a new describe block at the end:

```typescript
describe("bug_0308 — a count-preserving semantic tautology (expect(true).toBe(true)) is caught even when the strong-matcher count holds", () => {
  it("detectTautologies fires on expect(true).toBe(true) while the strong-matcher count sees it as a valid assertion", () => {
    const vacuous = "it('x', () => { expect(true).toBe(true); });";
    // The strong-matcher count DOES see this — toBe is a strong matcher — but detectTautologies
    // catches it regardless, closing the gap the three-count system admits at lines 31-33 of
    // scripts/verify-integrity.ts.
    expect(countStrongAssertions([{ text: vacuous }])).toBe(1); // strong count is UNCHANGED — the launder passes the three-count test
    const findings = detectTautologies([{ path: "t.test.ts", text: vacuous }]);
    expect(findings.length).toBe(1);
    expect(findings[0]!.code).toBe("TAUTOLOGY_ASSERTION");
  });
  it("detectTautologies does NOT fire on a genuine pinning assertion", () => {
    const genuine = "it('x', () => { expect(result).toBe(42); });";
    expect(detectTautologies([{ path: "t.test.ts", text: genuine }])).toEqual([]);
  });
  it("the real repo carries zero tautological assertions (regression lock)", () => {
    const res = runStatic(process.cwd());
    expect(res.findings.filter((f) => f.code === "TAUTOLOGY_ASSERTION")).toHaveLength(0);
  });
});
```

Update the imports in `verifier_strict_to_loose_swap.test.ts` to add `detectTautologies` to the import list.

**`traces/bugs/bug_0308_vacuous_assertion_detector.yaml`** (new file):

```yaml
id: bug_0308
title: "verify-integrity: static vacuous-assertion (tautology) detector"
pack: null
class: reward-hacking-defense
severity: structural
found_by: ultraplan_cycle_18
playtest_report: null

symptom: >
  The three-count anti-tamper system (test-case count, expect() count, strong-matcher
  count) has one admitted gap documented in scripts/verify-integrity.ts lines 31-33:
  a count-preserving swap that keeps a STRONG matcher but makes it vacuous
  (expect(true).toBe(true)) is not caught. An autonomous agent could introduce
  expect(true).toBe(true) while the strong-matcher count stays constant — the three
  guards all stay silent, and the test is green but pins nothing.

root_cause: >
  The STRONG_ASSERTION_RE regex matches .toBe( as a strong matcher (correct) but does
  not inspect whether the actual argument and expected argument are the same value.
  A tautology passes the strong-matcher count because it still uses a strong matcher.

fix: >
  Added detectTautologies() to scripts/verify-integrity.ts: a TAUTOLOGY_RE regex
  with a backreference (\1) that matches only when the actual and expected are the
  same captured group (literal-bool, literal-null, numeric/string literal, or
  identical identifier). Wired into runStatic() (TAUTOLOGY_ASSERTION + TAUTOLOGY_FLOOR)
  and runDrift() (TAUTOLOGY_REGRESSION on count increase). Added MAX_TAUTOLOGY_ASSERTIONS
  constant (0) to PROTECTED_FILES enforcement via GuardConstants.

regression_test: tests/regression/verifier_strict_to_loose_swap.test.ts
```

### Why

The `scripts/verify-integrity.ts` docstring at lines 31-33 explicitly names this as the one remaining gap in the anti-tamper system: "a count-preserving swap that keeps a STRONG matcher but makes it vacuous (`expect(true).toBe(true)`) is still not caught." The ULTRAPLAN (docs/ULTRAPLAN-2026-06-02.md) names the EvilGenie tautology scenario (arXiv:2511.21654) as the cycle #17 "second-place pick" — it is now the highest-value open structural gap.

The web research confirms why this matters for the benchmark thesis: SpecBench (arXiv:2605.21384, May 2026) empirically validates that deterministic + LLM-judge two-layer verification is the strongest reward-hacking detection strategy, but only when the deterministic layer is complete. AdventureForge's deterministic layer has a documented hole. Closing it strengthens the "hack-verifiable substrate" claim (Hack-Verifiable Environments, arXiv:2605.20744, May 2026) that the project's structured API provides.

The fix is purely static (no LLM, no clock, no network), S-effort, and has clear, deterministic acceptance criteria. The real repo has zero tautological assertions at HEAD (confirming the floor of 0 is achievable and the gate is not vacuous).

### Exact files to read and edit

**Read (to understand existing patterns):**
- `scripts/verify-integrity.ts` lines 105-180 — `STRONG_ASSERTION_RE`, `Finding` type, `detectDisabledTests`, `countStrongAssertions`: the exact pattern `detectTautologies` should follow (same function signature, same `files: { path: string; text: string }[]` input, same `Finding[]` output)
- `scripts/verify-integrity.ts` lines 185-227 — `runStatic()` body: the three existing static checks; add the fourth (detectTautologies + TAUTOLOGY_FLOOR) here in the same style
- `scripts/verify-integrity.ts` lines 306-349 — `TestArtifactCounts` type, `detectCountRegressions()`: extend `TestArtifactCounts` with `tautologies?: number` and add the optional fourth comparison
- `scripts/verify-integrity.ts` lines 360-401 — `GuardConstants` type and `parseGuardConstants()`: add `maxTautologyAssertions` field and its `num("MAX_TAUTOLOGY_ASSERTIONS")` parse
- `scripts/verify-integrity.ts` lines 403-439 — `detectGuardWeakening()`: add `if (now.maxTautologyAssertions > before.maxTautologyAssertions)` check (raising the floor is weakening)
- `scripts/verify-integrity.ts` lines 441-493 — `countTestArtifactsAtRef()` inner loop: add tautology counting in the batch loop
- `scripts/verify-integrity.ts` lines 516-590 — `runDrift()` body: where to add the TAUTOLOGY_REGRESSION check, after the existing detectCountRegressions block
- `tests/unit/verifier_integrity.test.ts` lines 1-30 — import list: add `detectTautologies`, `countTautologyAssertions`, `MAX_TAUTOLOGY_ASSERTIONS` to imports
- `tests/regression/verifier_strict_to_loose_swap.test.ts` lines 1-30 — import list: add `detectTautologies` to imports; confirm `runStatic` is already imported
- `traces/bugs/bug_0307_friars_postern_gallery_stale_pipe_text.yaml` — bug artifact template for the new bug_0308 artifact

**Create / edit:**
1. `scripts/verify-integrity.ts` — add `TAUTOLOGY_RE`, `MAX_TAUTOLOGY_ASSERTIONS`, `detectTautologies()`, `countTautologyAssertions()`; update `TestArtifactCounts`, `GuardConstants`, `parseGuardConstants`, `detectGuardWeakening`, `countTestArtifactsAtRef`, `runStatic`, `runDrift`
2. `tests/unit/verifier_integrity.test.ts` — add `describe("detectTautologies", ...)` block with 8 cases (flag/no-flag patterns + real-repo static check)
3. `tests/regression/verifier_strict_to_loose_swap.test.ts` — add `describe("bug_0308 — ...")` block with 3 cases; update import list
4. `traces/bugs/bug_0308_vacuous_assertion_detector.yaml` — new bug artifact

### Acceptance check

`npm run health` must exit 0. Specific criteria:

1. `detectTautologies()` is exported from `scripts/verify-integrity.ts` and returns `Finding[]` with `code: "TAUTOLOGY_ASSERTION"` for each vacuous pattern (`expect(true).toBe(true)`, `expect(x).toBe(x)`, `expect(42).toBe(42)`).
2. `runStatic()` includes `TAUTOLOGY_ASSERTION` and `TAUTOLOGY_FLOOR` findings in its output for a repo containing tautological assertions; returns clean for the real repo (zero tautologies at HEAD).
3. The new unit tests in `verifier_integrity.test.ts` all pass, including the real-repo static check confirming zero tautologies.
4. The new regression cases in `verifier_strict_to_loose_swap.test.ts` all pass, including: (a) strong-matcher count is 1 for `expect(true).toBe(true)` (the launder the three-count system misses), and (b) `detectTautologies` fires on that same input.
5. `MAX_TAUTOLOGY_ASSERTIONS` is in `GuardConstants` and `parseGuardConstants` parses it; `detectGuardWeakening` fires if the floor is raised.
6. All 17 packs validate 0/0 (no pack content changes).
7. `verify:integrity` reports 0 errors, 0 warnings on the working tree.
8. Test count increases by the number of new `it()` cases added.

### What NOT to change

- No schema change to any pack format (`ParserPackSchema`, `ConditionSchema`, `EffectSchema`)
- No engine change (`makeStep`, `applyEffects`, `evalConditions`)
- No pack content change — no YAML edits, no hash re-pin
- No change to `TARGET_PER_MODE` or `CATEGORY_WEIGHT` in `assessor.ts` (deferred)
- No addition of `frontier` category to `assessor.ts` (deferred)
- No change to `ITEM_UNPLACED` validator (deferred to next cycle)
- The existing `detectDisabledTests`, `countTestCases`, `countAssertions`, `countStrongAssertions`, `detectCountRegressions`, `classifyDrift`, `detectGuardWeakening` functions must remain structurally identical — this is a purely additive change

---

## Deferred levers (do NOT implement this cycle)

- **`ITEM_UNPLACED` validator check:** Confirmed genuinely open (no `ITEM_UNPLACED` or `ORPHAN_OBJECT` code in any validator). S-effort, impact 4. Best next cycle after bug_0308 — the fix is a single loop after `homeRoom`/`containerOf` maps are built in `parser_validator.ts` around line 208.
- **`TARGET_PER_MODE` threshold update:** Loop/strategy reviewer confirmed all three modes (7/5/5) are above the `{ cyoa: 2, parser: 2, rpg: 2 }` thresholds, permanently silencing `content_new`. S-effort one-liner, but re-enabling authoring nominations when structural integrity gaps remain is the wrong priority order.
- **Assessor `frontier` category:** Loop/strategy reviewer confirmed no `frontier` entry exists in `Category` union or `CATEGORY_WEIGHT`. M-effort. The scoring signal that makes it meaningful above 0.5 requires a live API key path; the detection stub alone would produce a candidate that fires regardless of whether a key is actually present.
- **Assessor `isSaturated()` clean-stasis branch:** Adding `allGeneratorsClean: boolean` to `Assessment` is S-effort and genuinely useful for the ultraplan prompt. Deferred as secondary to structural integrity work.
- **Parser generator DAG topology variant:** L-effort. The generator emits only a linear 4-room spine. A DAG variant with parallel sub-puzzles is the right next generator evolution but requires multi-cycle scope.
- **BFS AG(EF goal) forward-reachability validator:** L blast-radius, deferred four consecutive ultraplans. Still the right long-term structural move; still too large for one focused cycle.
- **Benchmark scorecard module:** No standalone value without real-model rows to populate. The ULTRAPLAN-2026-06-02.md notes this was built and removed once already. Unblock after the keyed real-model run.
- **Assessor `content_new` above-floor category (API-key path):** Wired in `adapter.ts` but no detection lever in `assessor.ts`. Blocked on API key for the scoring signal that makes it meaningful.
