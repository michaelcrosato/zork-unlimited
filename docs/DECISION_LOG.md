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
- **`TARGET_PER_MODE` re-enablement** — `{cyoa:2,parser:2,rpg:2}` vs actual 7/5/5 silences
  `content_new`. **Deliberately deferred**: re-enabling authoring nominations while structural gaps
  remain is the wrong priority order. Revisit only with a clear authoring goal.
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
