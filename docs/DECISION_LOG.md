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

### Standard cycle — 2026-06-19 (HEAD = 78298d1; next move = stale reactive audit suppression tuning)

**Confirmed CLOSED since the first stale reactive audit signal:**

- **Audit-only stale reactive-description signal:** closed by `78298d1`.
  The assessor now ranks parser/RPG room prose that names takeable room objects without an
  inventory-state room variant as the top structural candidate.

**Chosen move — suppress already-covered item-removal states**

The first audit pass deliberately used a narrow suppression (`has_item` / `not_item`) and counted
55 sites. Reviewing the current corpus showed five high-confidence non-actionable sites: four rooms
already react to state written by the item's own `take_effects`, and one goal item immediately
satisfies a terminal win condition when taken. This cycle teaches the audit to treat those as covered
without promoting the noisy remainder into validator warnings.

**Next after this:** triage the remaining 50 sites into an even lower-FP validator subset, or fix the
highest-confidence content sites directly.

### Standard cycle — 2026-06-19 (HEAD = 7d7c6ff; next move = direct terminal take suppression)

**Confirmed CLOSED since the first stale reactive audit tuning:**

- **Take-effect / win-condition covered item-removal states:** closed by `7d7c6ff`.
  The audit now suppresses rooms that already react to state written by an item's `take_effects`
  and goal items whose take action immediately satisfies a terminal win condition.

**Chosen move — suppress direct `end_game` take effects**

The remaining audit examples still included items such as `apothecaries_standard`'s bribe purse:
their room base text names a takeable object, but the object's own `take_effects` immediately
`end_game`. A post-take room variant would never be observed in normal play, so counting those sites
keeps the audit noisier without improving player-facing coverage. This cycle treats direct terminal
take effects as the same non-actionable terminal-on-take class as terminal win conditions.

**Next after this:** triage the remaining direct room prose sites, starting with multi-item rooms such
as `apothecaries_standard`'s shop counter where post-take looks remain observable.

### Standard cycle — 2026-06-19 (HEAD = 15c7a27; next move = apothecaries counter stale items)

**Confirmed CLOSED since direct terminal take suppression:**

- **Direct `end_game` take-effect false positives:** closed by `15c7a27`.
  The stale room-item audit no longer asks for unreachable room variants after an item's own
  `take_effects` immediately end the game, dropping the triage count from 50 to 42.

**Chosen move — fix the first real remaining stale room prose site**

The leading remaining audit entries were real player-facing contradictions in
`apothecaries_standard`: the shop counter base text kept saying the suspect vial was set apart near
the till and that the testing drawer held the glass drawstick after the player had taken either or
both objects. This cycle adds ordered room variants for the vial-held, drawstick-held, both-held, and
comparison-complete-with-held-evidence states, plus a regression and bug artifact.

**Next after this:** continue down the remaining 40 high-confidence room/item sites, or promote a
low-FP validator subset once the first audited packs are clean.

### Standard cycle — 2026-06-19 (HEAD = 538171e; next move = assayers mark stale evidence)

**Confirmed CLOSED since apothecaries counter stale items:**

- **`apothecaries_standard` shop-counter taken-item contradictions:** closed by `538171e`.
  The counter now reacts when the suspect vial and/or glass drawstick are held, including the
  comparison-complete state, and the audit dropped those two leading sites.

**Chosen move — fix the next real stale room prose cluster**

The next audit entries were again concrete player-facing contradictions in `assayers_mark`: the
assay hall base text kept placing the silver porringer at the centre of the bench and the aqua fortis
in its wooden stand after either item was taken, and the record room kept saying Fitch's commission
papers were in the open box after the commission paper was held. This cycle adds ordered room
variants for the assay-item held states, the completed-assay-with-held-evidence state, and the
commission-paper held state, plus a regression and bug artifact. `npm run assess` now reports 37
remaining room/item triage sites, with the `assayers_mark` entries gone.

**Next after this:** continue down the remaining high-confidence room/item sites, starting with
`cellarmans_dark`, or promote the low-FP subset once the first audited packs are clean.

### Standard cycle — 2026-06-19 (HEAD = d538f1d; next move = cellarman stale cellar tools)

**Confirmed CLOSED since assayers mark stale evidence:**

- **`assayers_mark` assay-hall / record-room taken-evidence contradictions:** closed by `d538f1d`.
  The assay hall now reacts when the silver plate and/or aqua fortis are held, and the record room
  reacts when the commission paper is held. The stale room/item audit dropped to 37 sites.

**Chosen move — fix the next real stale room prose cluster**

The next audit entries were concrete contradictions in `cellarmans_dark`: the ale cellar base text
kept saying the oil-lamp hung from the pillar bracket and the tinderbox sat on the ledge after those
tools were taken; the old lit-cellar variant also kept saying the tinderbox was on its ledge after
the player had to hold it to light the lamp. In the wine vault, the base text kept saying the
deed-box stood beside the cash-box after the deed-box had been taken, during the live pre-win return
state. This cycle adds ordered, reachable variants for the held-tool and lit-tool states, plus a
deed-box-held wine-vault variant, regression, and bug artifact. `npm run assess` now reports 34
remaining room/item triage sites, with the `cellarmans_dark` entries gone.

**Next after this:** continue down the remaining high-confidence room/item sites, starting with
`chandlers_lot`, or promote the low-FP subset once the first audited packs are clean.

### Standard cycle — 2026-06-19 (HEAD = 503426e; next move = chandler stale inspection tools)

**Confirmed CLOSED since cellarman stale cellar tools:**

- **`cellarmans_dark` ale-cellar / wine-vault taken-item contradictions:** closed by `503426e`.
  The cellar now reacts when the lamp and/or tinderbox are held or lit, and the wine vault reacts
  when the deed-box is held. The stale room/item audit dropped to 34 sites.

**Chosen move — fix the next real stale room prose cluster**

The next audit entries were concrete contradictions in `chandlers_lot`: the counting room kept
saying the inspector's lantern hung from its peg after it was taken; the dipping floor kept saying
the wick gauge hung from its nail and the snuffing shears rested by the trough after either tool was
held; and the wax loft kept placing the adulteration book on the chest after the player had taken
it, including the proof-stamped state. This cycle adds ordered room variants for those held-tool
states, plus a regression and bug artifact. `npm run assess` now reports 30 remaining room/item
triage sites, with the `chandlers_lot` entries gone.

**Next after this:** continue down the remaining high-confidence room/item sites, starting with
`coroners_errand`, or promote the low-FP subset once the first audited packs are clean.

### Standard cycle — 2026-06-19 (HEAD = 90ebe15; next move = coroner stale legal evidence)

**Confirmed CLOSED since chandler stale inspection tools:**

- **`chandlers_lot` counting-room / dipping-floor / wax-loft taken-item contradictions:** closed
  by `90ebe15`. The pack now reacts when the inspector's lantern, wick gauge, snuffing shears,
  and adulteration book are held. The stale room/item audit dropped to 30 sites.

**Chosen move — fix the next real stale room prose cluster**

The next audit entries were concrete contradictions in `coroners_errand`: the front hall kept
saying the coroner's letter of commission was on the side table after the commission was taken, and
the study kept placing Rendell's sealed letter beside Calloway's hand after the player held it. This
cycle adds ordered room variants for the held commission, held sealed letter, and examined-body with
held-letter states, plus a regression and bug artifact. `npm run assess` now reports 28 remaining
room/item triage sites, with the `coroners_errand` entries gone.

**Next after this:** continue down the remaining high-confidence room/item sites, starting with
`dyers_weight`, or promote the low-FP subset once the first audited packs are clean.

### Standard cycle — 2026-06-19 (HEAD = 953323e; next move = dyer stale dye-house tools)

**Confirmed CLOSED since coroner stale legal evidence:**

- **`coroners_errand` front-hall / study taken-evidence contradictions:** closed by `953323e`.
  The front hall now reacts when the commission is held, and the study reacts when Rendell's
  sealed letter is held. The stale room/item audit dropped to 28 sites.

**Chosen move — fix the next real stale room prose cluster**

The next audit entries were concrete contradictions in `dyers_weight`: the dye house kept saying the
finished indigo cakes sat on the curing rack after they were taken, and kept saying the long copper
tongs hung by the vat after they were held. The old proved-adulteration variant also placed the
indigo cakes on the rack even when the player could be holding the seized evidence. This cycle adds
ordered room variants for held cakes, held tongs, both-held, and the corresponding
proved-adulteration states, plus a regression and bug artifact. `npm run assess` now reports 26
remaining room/item triage sites, with the `dyers_weight` entries gone.

**Next after this:** continue down the remaining high-confidence room/item sites, starting with
`friars_postern`, or promote the low-FP subset once the first audited packs are clean.

### Standard cycle — 2026-06-19 (HEAD = f67db73; next move = friar stale key-ring)

**Confirmed CLOSED since dyer stale dye-house tools:**

- **`dyers_weight` dye-house taken-evidence/tool contradictions:** closed by `f67db73`.
  The dye house now reacts when the indigo cakes and/or copper tongs are held, including
  the proved-adulteration state. The stale room/item audit dropped to 26 sites.

**Chosen move — fix the next real stale room prose cluster**

The next audit entry was a concrete contradiction in `friars_postern`: the turnkey's lodge
kept saying a peg behind the turnkey held his key-ring after the player had taken it. This
cycle gives the key-ring TAKE a durable `key_ring_taken` flag and adds a lodge variant keyed
to that flag, so the peg stays bare even if the player later drops the ring elsewhere. It
also adds a regression and bug artifact. `npm run assess` now reports 25 remaining room/item
triage sites, with the `friars_postern` entry gone.

**Next after this:** continue down the remaining high-confidence room/item sites, starting with
`gaugers_register`, or promote the low-FP subset once the first audited packs are clean.

### Standard cycle — 2026-06-19 (HEAD = 61c9fd7; next move = gauger stale weighing-room tools)

**Confirmed CLOSED since friar stale key-ring:**

- **`friars_postern` lodge taken-key-ring contradiction:** closed by `61c9fd7`.
  The lodge now reacts after the turnkey's key-ring has been taken, including after a later
  drop. The stale room/item audit dropped to 25 sites.

**Chosen move — fix the next real stale room prose cluster**

The next audit entries were concrete contradictions in `gaugers_register`: the weighing room
kept saying the crowbar leaned against the south wall and the marked stave hung on its peg
after the player could take either tool. This cycle gives both TAKE actions durable pickup
flags and adds ordered weighing-room variants for stave-only, crowbar-only, and both-taken
states, plus a regression and bug artifact. `npm run assess` now reports 23 remaining
room/item triage sites, with the `gaugers_register` entries gone.

**Next after this:** continue down the remaining high-confidence room/item sites, starting with
`ropewalkers_twist`, or promote the low-FP subset once the first audited packs are clean.

### Standard cycle — 2026-06-19 (HEAD = cfa2b3b; next move = ropewalker stale inspection items)

**Confirmed CLOSED since gauger stale weighing-room tools:**

- **`gaugers_register` weighing-room taken-tool contradictions:** closed by `cfa2b3b`.
  The weighing room now reacts after the marked stave and/or crowbar have been taken,
  including after later drops. The stale room/item audit dropped to 23 sites.

**Chosen move — fix the next real stale room prose cluster**

The next audit entries were concrete contradictions in `ropewalkers_twist`: the rope office
kept saying the inspector's token lay beside the quay contract after it was taken, and the
covered ropewalk kept placing the twist gauge on its nail and the marking knife on its block
after the player could take either tool. This cycle gives those TAKE actions durable pickup
flags and adds ordered room variants for token-taken, gauge-only, knife-only, and both-tool
states, plus a regression and bug artifact. `npm run assess` now reports 20 remaining
room/item triage sites, with the `ropewalkers_twist` entries gone.

**Next after this:** continue down the remaining high-confidence room/item sites, starting with
`scriveners_proof`, or promote the low-FP subset once the first audited packs are clean.

### Standard cycle — 2026-06-19 (HEAD = dc4ef44; next move = scrivener stale evidence tools)

**Confirmed CLOSED since ropewalker stale inspection items:**

- **`ropewalkers_twist` office / rope-shed taken-item contradictions:** closed by `dc4ef44`.
  The rope office and covered ropewalk now react after the inspector's token, twist gauge,
  and/or marking knife have been taken, including after later drops. The stale room/item
  audit dropped to 20 sites.

**Chosen move — fix the next real stale room prose cluster**

The next audit entries were concrete contradictions in `scriveners_proof`: the front office
kept saying the disputed deed lay in the deed box and the penknife rested at the inkwell after
the player could take them, and the private study kept saying the writing case held the
magnifier after it was taken. This cycle gives those TAKE actions durable pickup flags and
adds ordered room variants for deed-only, penknife-only, both-front-office, and magnifier
states, plus a regression and bug artifact. `npm run assess` now reports 17 remaining
room/item triage sites, with the `scriveners_proof` entries gone.

**Next after this:** continue down the remaining high-confidence room/item sites, starting with
`tide_mill`, or promote the low-FP subset once the first audited packs are clean.

### Standard cycle — 2026-06-19 (HEAD = ba1b0c1; next move = tide-mill stale tools)

**Confirmed CLOSED since scrivener stale evidence tools:**

- **`scriveners_proof` front-office / study taken-item contradictions:** closed by `ba1b0c1`.
  The front office and private study now react after the disputed deed, penknife, and/or
  magnifier have been taken, including after later drops. The stale room/item audit dropped
  to 17 sites.

**Chosen move — fix the next real stale room prose cluster**

The next audit entries were concrete contradictions in `tide_mill`: the wheel-room kept saying
the crank-handle hung on its peg after it was taken, including in single-fault puzzle states,
and the tool-shed kept placing the billhook in its corner and the crow-bar on its nails after
the player could take either tool. This cycle gives those TAKE actions durable pickup flags and
adds ordered wheel-room variants for handle-taken base/single-fault states plus tool-shed
variants for billhook-only, crow-bar-only, and both-tool states. It also adds a regression and
bug artifact. `npm run assess` now reports 14 remaining room/item triage sites, with the
`tide_mill` entries gone.

**Next after this:** continue down the remaining high-confidence room/item sites, starting with
`weighmasters_round`, or promote the low-FP subset once the first audited packs are clean.

### Standard cycle — 2026-06-19 (HEAD = a9e0b69; next move = weighmaster stale evidence)

**Confirmed CLOSED since tide-mill stale tools:**

- **`tide_mill` wheel-room / tool-shed taken-tool contradictions:** closed by `a9e0b69`.
  The wheel-room and tool-shed now react after the crank-handle, billhook, and/or crow-bar
  have been taken, including after later drops. The stale room/item audit dropped to 14
  sites.

**Chosen move — fix the next real stale room prose cluster**

The next audit entries were concrete contradictions in `weighmasters_round`: the
counting-house kept saying the deputy's receipt form lay on the desk after it was taken,
and the warehouse floor had no durable reactive state for the measured grain sample's
starting spot. This cycle gives both TAKE actions durable pickup flags and adds
counting-house / warehouse-floor variants that keep those starting spots empty after first
pickup, including after later drops. It also adds a regression and bug artifact. `npm run
assess` now reports 12 remaining room/item triage sites, with the `weighmasters_round`
entries gone.

**Next after this:** continue down the remaining high-confidence room/item sites, starting with
`advocates_case`, or promote the low-FP subset once the first audited packs are clean.

### Standard cycle — 2026-06-19 (HEAD = 7960343; next move = advocate stale documents)

**Confirmed CLOSED since weighmaster stale evidence:**

- **`weighmasters_round` counting-house / warehouse-floor taken-evidence contradictions:**
  closed by `7960343`. The counting-house and warehouse floor now react after the deputy's
  receipt and/or grain sample have been taken, including after later drops. The stale
  room/item audit dropped to 12 sites.

**Chosen move — fix the next real stale room prose cluster**

The next audit entries were concrete contradictions in `advocates_case`: Marta's stall kept
saying the charter roll lay on the near table after it was taken, and the charter office
could still place the town register on the counter after it was taken but before it was read.
Its read-state variant also assumed the register remained in hand after a later drop. This
cycle gives both TAKE actions durable pickup flags, adds stall / charter-office variants for
the taken-document states, and rewrites the register-read room variant so it records the
consulted entry rather than inventory. It also adds a regression and bug artifact. `npm run
assess` now reports 10 remaining room/item triage sites, with the `advocates_case` entries
gone.

**Next after this:** continue down the remaining high-confidence room/item sites, starting with
`bellfounders_alarm`, or promote the low-FP subset once the first audited packs are clean.

### Standard cycle — 2026-06-19 (HEAD = 026e6e9; next move = bellfounder stale hammer)

**Confirmed CLOSED since advocate stale documents:**

- **`advocates_case` stall / charter-office taken-document contradictions:** closed by
  `026e6e9`. Marta's stall and the charter office now react after the charter roll and/or
  town register have been taken, including after later drops. The stale room/item audit
  dropped to 10 sites.

**Chosen move — fix the next real stale room prose cluster**

The next audit entry was a concrete contradiction in `bellfounders_alarm`: the casting floor
kept saying a tuning hammer lay on the sanded bench after the player could take it. This
cycle gives the TAKE action a durable pickup flag and adds a casting-floor variant that keeps
the bench bare after first pickup, including after later drops. It also adds a regression and
bug artifact. `npm run assess` now reports 9 remaining room/item triage sites, with the
`bellfounders_alarm` entry gone.

**Next after this:** continue down the remaining high-confidence room/item sites, starting with
`cold_forge`, or promote the low-FP subset once the first audited packs are clean.

### Standard cycle — 2026-06-19 (HEAD = e1eedff; next move = stale audit terminal-room suppression)

**Confirmed CLOSED since bellfounder stale hammer:**

- **`bellfounders_alarm` casting-floor taken-hammer contradiction:** closed by `e1eedff`.
  The casting floor now reacts after the tuning hammer has been taken, including after
  later drops. The stale room/item audit dropped to 9 sites.

**Chosen move — tune the stale room/item audit**

The next audit entry, `cold_forge`'s `ember_chamber` / `ember_heart`, was a false
positive: entering the Ember Chamber immediately satisfies the pack's `visited:
ember_chamber` win condition, so the player never gets a live room observation where
taking the Ember-Heart can make the room prose stale. This cycle teaches the audit to
suppress non-start rooms whose entry state already guarantees a declared terminal,
while keeping start-room cases reportable. It also adds unit coverage for the
terminal-on-entry suppression. `npm run assess` now reports 8 remaining room/item
triage sites, with the `cold_forge` terminal pickup gone.

**Next after this:** continue down the remaining high-confidence room/item sites, starting with
`falconers_ransom`, or promote the low-FP subset once the remaining false positives are
tuned out.

### Standard cycle — 2026-06-19 (HEAD = 888d9ee; next move = falconer stale bill)

**Confirmed CLOSED since stale audit terminal-room suppression:**

- **`cold_forge` terminal Ember-Heart false positive:** closed by `888d9ee`.
  The stale room/item audit now suppresses non-start rooms whose entry state already
  guarantees a declared terminal, so the Ember Chamber no longer distracts from live
  stale-prose states. The audit dropped to 8 sites.

**Chosen move — fix the next real stale room prose site**

The next audit entry was a concrete contradiction in `falconers_ransom`: the guest
chambers kept saying a folded document lay half-under the riding gloves at the
satchel's lip after the hidden bill could be taken. The existing `bill_read` variant
also said the needed document was in the player's hands, which became false after a
later drop. This cycle gives the TAKE action a durable `hidden_bill_taken` flag, adds
a taken-bill guest-chambers variant, and rewrites the read-state variant to record
that the forged seal's tell is known without claiming inventory possession. It also
adds a regression and bug artifact. `npm run assess` now reports 7 remaining
room/item triage sites, with the `falconers_ransom` entry gone.

**Next after this:** continue down the remaining high-confidence room/item sites, starting with
`printers_night`, or promote the low-FP subset once the remaining false positives are
tuned out.

### Standard cycle — 2026-06-19 (HEAD = 03d3508; next move = printer stale lantern and schedule)

**Confirmed CLOSED since falconer stale bill:**

- **`falconers_ransom` guest-chambers taken-bill contradiction:** closed by `03d3508`.
  The guest chambers now react after the hidden bill has been taken, including after
  later drops, and the read-state prose no longer claims the bill remains in hand.
  The stale room/item audit dropped to 7 sites.

**Chosen move — fix the next real stale room prose cluster**

The next audit entries were concrete contradictions in `printers_night`: the shop floor
kept saying the dark lantern sat on the counter after it was taken, and the composing
room kept saying Fen's schedule was pinned above the bench after it was taken. This
cycle gives both TAKE actions durable pickup flags, adds shop-floor / composing-room
variants that keep the counter and schedule board empty after first pickup, and trims
the mission-done shop-floor prose so it no longer says the counter is exactly as found.
It also adds a regression and bug artifact. `npm run assess` now reports 5 remaining
room/item triage sites, with the `printers_night` entries gone.

**Next after this:** continue down the remaining high-confidence room/item sites, starting with
`quarrymens_fault`, or promote the low-FP subset once the remaining false positives are
tuned out.
