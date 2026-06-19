# Ultraplan decision log (append-only)

This is the AFK loop's **durable memory of settled questions** — the boundary the saturation-triggered
ultraplan reviewers were missing. `docs/CURRENT_PLAN.md` is **overwritten** every ultraplan, so it
cannot remember what was already ruled out; this file is **append-only** and never overwritten.

**Contract for an ultraplan cycle (see `src/ai-loop.ts::buildUltraplanPrompt`, `docs/afk_loop.md`):**

- **Reviewers read this file FIRST.** Do **not** re-nominate any gap listed under "Confirmed closed"
  below — it is already implemented, with the file:line proof recorded. Re-investigating it is the
  exact redundant fan-out this log exists to stop (re-aim #19 alone confirmed *six* such false alarms).
- **The synthesis APPENDS** a dated entry recording the gaps it confirmed closed this cycle (with
  proof) and the one move it chose. Append only; never edit or delete prior entries.
- If a "confirmed closed" entry is genuinely wrong (the feature regressed or never existed), say so
  in a new appended entry with evidence — do not silently delete the old line.

---

## Confirmed CLOSED — do not re-nominate (with proof)

Seeded 2026-06-08 from `docs/CURRENT_PLAN.md` re-aim #19 (and #17/#18) "false alarm" findings:

- **BFS forward-reachability validator** — implemented. `UNREACHABLE_ROOM` and `SOFTLOCK` in
  `src/validate/parser_validator.ts` (≈lines 339–400) cover both forward and reverse structural
  reachability. (re-aim #17, #19)
- **Real-LLM author keystone** — wired. `src/mcp/tools.ts` already calls
  `resolveProvider({ mock: new MockAuthorProvider() })`; the project is one API key away from the
  first real-LLM artifact, not one code change. (re-aim #19)
- **Vacuous-assertion / tautology detector** — implemented (bug_0308). `scripts/verify-integrity.ts`
  has `TAUTOLOGY_RE`, `MAX_TAUTOLOGY_ASSERTIONS`, `detectTautologies()`, `countTautologyAssertions()`,
  and the `TAUTOLOGY_ASSERTION` / `TAUTOLOGY_FLOOR` / `TAUTOLOGY_REGRESSION` codes. (re-aim #19)
- **NaN/Infinity guard in effects** — `guardFinite()` already wired in `src/core/effects.ts`. (re-aim #19)
- **`divergedAtStep` / replay divergence** — implemented in `src/trace/replay.ts`. (re-aim #19)
- **LRU blind-pass rotation correctness** — three regression tests confirm correct recency rotation;
  no lock-in path (`tests/regression/assessor_blind_pass_rotation.test.ts`, bug_0128/0235/0293). (re-aim #19)
- **`DIALOGUE_GOTO_MISSING`** — already implemented. (re-aim #17)
- **Per-call `hide_graph` override** — landed (bug_0299); spread into the 5 observation tools in
  `src/mcp/server.ts`. (re-aim #17, #18)
- **`ITEM_UNPLACED` orphan-object validator** — landed (bug_0317) in `src/validate/parser_validator.ts`;
  regression `tests/regression/parser_validator_item_unplaced.test.ts`. (chosen by re-aim #19)

## Known OPEN / deliberately deferred (not "closed" — fair game, but note the deferral reason)

- **Stale docstring in `scripts/verify-integrity.ts`** (lines ~31–33 still say the tautology gap "is
  not caught" after bug_0308 closed it) — S-effort doc fix; deferred, blocks no detection.
- **Multi-line tautology** — `TAUTOLOGY_RE` has no dotall flag; split-line `expect(foo)\n.toBe(foo)`
  escapes. S-effort; deferred (real test code writes tautologies single-line; narrow risk).
- **🚫 ANTI-PATTERN — do NOT keep raising `TARGET_PER_MODE` (orchestrator ruling 2026-06-09).**
  Re-aims #19→bug_0332, mid-cycle→bug_0335, #21→bug_0336 each raised `TARGET_PER_MODE`
  (`src/afk/assessor.ts:68`) to *current counts + a little headroom*. Each raise is consumed by a
  burst of `content_new` authoring, which re-saturates, which makes the NEXT ultraplan raise it
  again — a self-perpetuating loop the re-aims themselves flagged as a "structural trap" yet kept
  feeding. **The ceiling is now intentionally FIXED at `{cyoa:20, parser:16, rpg:16}` (the bug_0336
  value). Future ultraplans MUST NOT choose "raise TARGET_PER_MODE" as their move.** Pack COUNT is
  not the objective — depth, quality, and the blind-playtest oracle are. When `content_new` disarms
  at this ceiling (have ≥ target ⇒ assessor returns to the 0.5 floor ⇒ saturation), pick a REAL
  structural lever instead — Gaps A/B (NPC topic `checkConds`/`checkUnsatisfiable`), Gap F
  (`allGeneratorsClean`), or Gap G (SKILL_CHECK_PHANTOM_STAT) below are all open, S-effort, zero-FP.
  Revisit the ceiling only on an explicit human authoring goal, never as an automatic saturation cure.
- **Class-level "stale reactive description" check** — the bug_0282–0325 family (a room/dialogue
  names an item/state after the player changed it). High value, but a naive heuristic risks
  false-positive churn across 17 clean packs; **measure FP rate before adding to `health`.** Until
  then it is surfaced by agent judgment via the standard-cycle "catch the class" nudge.
- **Playtest-trend "groove detector"** — feed the assessor an above-floor signal when the blind
  playtest keeps returning the same finding class. Deferred; design first.
- **Assessor `frontier` category / benchmark scorecard** — meaningful only with a live API-key path.

---

## Appended re-aim entries

(Each ultraplan synthesis appends below. Newest at the bottom.)

### Re-aim #20 — 2026-06-08 (HEAD = bug_0331; next free id = bug_0332)

**False alarms this cycle:** None. All four reviewers correctly scoped to open gaps only.

**Gaps confirmed OPEN (with proof):**

- **Gap A — NPC topic conditions excluded from `checkConds`:** `src/validate/parser_validator.ts` — `checkConds` called at lines 539 (exits), 552 (object interactions), 564 (win_conditions); never in the NPC/dialogue block (lines 631-697). Topic gates on undefined flags/items silently always-hidden.
- **Gap B — NPC topic conditions excluded from `checkUnsatisfiable`:** Same NPC block; node variant shadowing checked (line 654), topic condition unsatisfiability not.
- **Gap C — TARGET_PER_MODE threshold silences content_new:** `src/afk/assessor.ts:68` = `{cyoa:2,parser:2,rpg:2}` vs actual 7/5/5; gate at line 566 (`if (have < target)`) never fires; zero content_new candidates generated. **(CHOSEN MOVE)**
- **Gap D — Stale docstring in verify-integrity.ts lines 31-33:** Still says tautology "is still not caught" after bug_0308. Deferred again.
- **Gap E — TAUTOLOGY_REGRESSION inline in runDrift (lines 656-667), not in detectCountRegressions:** Structurally inconsistent, functionally safe. Deferred.
- **Gap F — allGeneratorsClean absent from Assessment type (lines 52-57):** Deferred.

**Chosen move — bug_0332: raise TARGET_PER_MODE to break saturation cycle**

The single deferral condition from cycle #19 ("revisit after bug_0317 is locked") is now satisfied — ITEM_UNPLACED landed as bug_0317. Raising `TARGET_PER_MODE` from `{cyoa:2,parser:2,rpg:2}` to `{cyoa:10,parser:8,rpg:8}` at `src/afk/assessor.ts:68` produces `content_new` candidates scored at ~1.417, immediately above the 0.5 floor, redirecting the loop to net-new pack authoring. Regression artifact: `traces/bugs/bug_0332_target_per_mode_threshold.yaml`.

**Next after bug_0332:** Gaps A+B (NPC topic `checkConds` + `checkUnsatisfiable`) — S-effort, zero false-positive risk, batch in one commit. Then Gap F (`allGeneratorsClean` in Assessment).

### Re-aim #21 — 2026-06-09 (HEAD = bug_0335; next free id = bug_0336)

**False alarms this cycle:** None. All four reviewers correctly scoped to open gaps only and did not re-nominate any confirmed-closed item.

**Gaps confirmed OPEN (with proof):**

- **Gap A — NPC topic conditions excluded from `checkConds`:** `src/validate/parser_validator.ts` — `checkConds` called at lines 539, 552, 564; never for `DialogueTopic.conditions` in NPC block (lines 631-697). Infrastructure present (`neededWhileHeld` at lines 600-603 iterates `t.conditions`) — call simply absent. All 32 current packs clean (no retroactive error; future authoring protection only).
- **Gap B — NPC topic conditions excluded from `checkUnsatisfiable`:** Same NPC block; node variant shadowing checked (line 654); topic condition unsatisfiability not checked. `checkUnsatisfiable` called at lines 856-869, 871-886, 892-900, 910 — never in NPC block.
- **Gap C — TARGET_PER_MODE ceiling re-saturation (structural trap):** `src/afk/assessor.ts:68` = `{cyoa:12,parser:10,rpg:10}` (raised to exact current counts by bug_0335); gate at line 566 (`if (have < target)`) never fires; zero content_new candidates. Third occurrence of same root cause (re-aim #19 → bug_0332, mid-cycle → bug_0335, now re-aim #21 → bug_0336). **(CHOSEN MOVE)**
- **Gap D — Stale docstring in verify-integrity.ts lines 31-33:** Still says tautology "is still not caught" after bug_0308. Deferred again.
- **Gap E — TAUTOLOGY_REGRESSION inline in runDrift (lines 656-667):** Structurally inconsistent, functionally safe. Deferred.
- **Gap F — allGeneratorsClean absent from Assessment type (lines 52-57):** Deferred.
- **NEW Gap G — SKILL_CHECK_PHANTOM_STAT:** `skill_check.stat` references a stat variable not validated against declared `vars` in `src/validate/parser_validator.ts`. S-effort. Deferred until Gaps A/B land.

**Chosen move — bug_0336: raise TARGET_PER_MODE ceiling to {cyoa:20, parser:16, rpg:16}**

Root cause confirmed: ceiling was raised to match exact pack count (bug_0335 set {cyoa:12,parser:10,rpg:10} = actual counts), leaving zero headroom. Raising to {cyoa:20,parser:16,rpg:16} provides ~8 packs of content_new headroom per mode (based on ~10 packs authored per full content_new run in re-aim #20), preventing re-saturation for multiple cycles. Regression artifact: `traces/bugs/bug_0336_target_per_mode_ceiling.yaml`.

**Next after bug_0336:** Gaps A+B (NPC topic `checkConds` + `checkUnsatisfiable`) — S-effort, zero FP risk, batch in one commit. Then Gap E+D batch. Then Gap F. Then Gap G (SKILL_CHECK_PHANTOM_STAT). Then dialogue root re-greet validator (shares NPC loop with A/B).

### Standard cycle — 2026-06-19 (HEAD = a9585f2; next move = Gap E+D)

**Confirmed CLOSED since re-aim #21:**

- **Gap A — NPC topic conditions excluded from `checkConds`:** closed by `a9585f2`.
  `src/validate/parser_validator.ts:568` now calls `checkConds(t.conditions ?? [], ...)` for every
  NPC dialogue topic, and
  `tests/regression/parser_dialogue_topic_gate_validation.test.ts` rejects a topic gate requiring an
  unsettable flag.
- **Gap B — NPC topic conditions excluded from `checkUnsatisfiable`:** closed by `a9585f2`.
  `src/validate/parser_validator.ts:672` now passes every topic guard to `checkUnsatisfiable(...)`,
  and the same regression test warns on an internally contradictory topic guard.

**Chosen move — Gap E+D: verify-integrity tautology cleanup**

The verifier already counted tautologies in `TestArtifactCounts`, but `TAUTOLOGY_REGRESSION` lived as
an inline `runDrift` special case while `detectCountRegressions()` handled all other count regressions.
This cycle moves that comparison into `detectCountRegressions()` and adds synthetic unit coverage, while
also updating the stale top-level comment that still said count-preserving tautologies were not caught
after bug_0308.

**Next after Gap E+D:** Gap F (`allGeneratorsClean` in `Assessment` / saturation disambiguation), then
Gap G (`SKILL_CHECK_PHANTOM_STAT`). Keep the `TARGET_PER_MODE` anti-pattern ruling in force.

### Standard cycle — 2026-06-19 (HEAD = 7382a58; next move = Gap F)

**Confirmed CLOSED since re-aim #21:**

- **Gap D — stale tautology docstring in `scripts/verify-integrity.ts`:** closed by `7382a58`.
  The top-level verifier comment now correctly names the deterministic tautology scanner and
  tautology-regression guard instead of saying count-preserving tautologies are not caught.
- **Gap E — `TAUTOLOGY_REGRESSION` inline in `runDrift`:** closed by `7382a58`.
  `scripts/verify-integrity.ts` now emits `TAUTOLOGY_REGRESSION` from `detectCountRegressions()`,
  and `tests/unit/verifier_integrity.test.ts` pins that pure-detector branch directly.

**Chosen move — Gap F: assessor generator-clean saturation signal**

`Assessment` now carries `allGeneratorsClean`, computed from the fresh generated CYOA/RPG/parser
mint-and-check windows. `formatAssessment()` renders the generator status, and `isSaturated()` now
requires `allGeneratorsClean === true` before treating a floor-level top candidate as true saturation.
This preserves the current healthy output (`Generator mint-and-check: clean`) while making generator
drift distinguishable from routine blind-playtest saturation.

**Next after Gap F:** Gap G (`SKILL_CHECK_PHANTOM_STAT`) — validate that every `skill_check.stat`
references a declared variable/stat before future RPG/CYOA authoring can typo an impossible check.

### Standard cycle — 2026-06-19 (HEAD = 9b83c7d; next move = Gap G)

**Confirmed CLOSED since re-aim #21:**

- **Gap F — `allGeneratorsClean` absent from `Assessment`:** closed by `9b83c7d`.
  `Assessment` now carries generator clean/dirty state, the formatted assessment prints it, and
  saturation detection only treats floor-level candidates as routine saturation when generated packs
  are clean.

**Chosen move — Gap G: `SKILL_CHECK_PHANTOM_STAT`**

Parser and CYOA skill checks rolled `skill_check.skill` as a plain var lookup; an undeclared typo fell
through as d20 + 0. This cycle makes `validateParser()` and `validateCyoa()` reject a skill check whose
skill is absent from `meta.vars_init`, and the RPG wrapper gets the same protection through its parser
validation pass. Regression coverage plants the same phantom stat in parser, CYOA, and RPG packs.

**Next after Gap G:** audit skill-check branch-effect scanning in parser/CYOA validators, then dialogue
root re-greet validation and the stale reactive-description strategy.

### Standard cycle — 2026-06-19 (HEAD = fc35e89; next move = skill-check branch effects)

**Confirmed CLOSED since re-aim #21:**

- **Gap G — `SKILL_CHECK_PHANTOM_STAT`:** closed by `fc35e89`.
  Parser and CYOA validators now reject skill checks whose rolled skill is absent from
  `meta.vars_init`, and the RPG wrapper inherits the guard through parser validation.

**Chosen move — skill-check branch-effect validation**

Parser and CYOA skill checks can set flags, grant state, award score, route, and end the game from
`on_success` / `on_failure`, but several validator helper scans still looked only at direct
interaction/choice effects. This cycle makes branch effects first-class inputs to parser `allEffects`
/ `effectLists` / obtainability / quest-item scans and to CYOA write/falsifier/deadline scans. RPG now
passes only enemy combat branches as parser extras so skill-check effects are not double-counted.

**Next after this:** dialogue root re-greet validation, then stale reactive-description strategy.

### Standard cycle — 2026-06-19 (HEAD = a7069ca; next move = stale reactive-description audit signal)

**Confirmed CLOSED since the skill-check branch-effect audit:**

- **Dialogue root re-greet validation:** closed by `a7069ca`.
  `validateParser()` now emits `DIALOGUE_ROOT_REGREET_MISSING` when a one-shot root topic retires on
  a flag set by its target node but the root has no `has_flag` re-greet variant. Affected shipped
  parser/RPG packs and the RPG generator were updated and validate clean.

**Chosen move — stale reactive-description audit signal**

The class-level stale-prose validator is still too noisy to promote directly: a first-pass room/item
heuristic finds dozens of triage sites. This cycle adds an audit-only suppression-aware signal for
the narrowest structural slice: parser/RPG room base prose naming a takeable object placed in that
room, with no room variant reading that item's `has_item` / `not_item` state. The assessor now ranks
that above blind-playtest floor work, creating a concrete next step to tune suppressions or promote a
proven subset into validation without turning every shipped pack warning-red at once.

**Next after this:** tune the stale reactive-description audit into a low-FP validator subset, or fix
the highest-confidence audited content sites if the subset is already clear.
