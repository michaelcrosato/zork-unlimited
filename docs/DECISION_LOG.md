# Ultraplan decision log (append-only)

This is the AFK loop's **durable memory of settled questions** — the boundary the saturation-triggered
ultraplan reviewers were missing. `docs/CURRENT_PLAN.md` is **overwritten** every ultraplan, so it
cannot remember what was already ruled out; this file is **append-only** and never overwritten.

**Contract for an ultraplan cycle (see `src/ai-loop.ts::buildUltraplanPrompt`, `docs/afk_loop.md`):**

- **Reviewers read this file FIRST.** Do **not** re-nominate any gap listed under "Confirmed closed"
  below — it is already implemented, with the file:line proof recorded. Re-investigating it is the
  exact redundant fan-out this log exists to stop (re-aim #19 alone confirmed _six_ such false alarms).
- **The synthesis APPENDS** a dated entry recording the gaps it confirmed closed this cycle (with
  proof) and the one move it chose. Append only; never edit or delete prior entries.
- If a "confirmed closed" entry is genuinely wrong (the feature regressed or never existed), say so
  in a new appended entry with evidence — do not silently delete the old line.

---

## Confirmed CLOSED — do not re-nominate (with proof)

_(Seeded 2026-06-08. The gaps below remain CLOSED, but several proof paths were
renamed by the 2026-07-06 RPG-only consolidation — see the "Post-consolidation
re-baseline" entry at the bottom for the current path mapping before treating a
dead path as a regression.)_

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
- **Per-call `hide_graph` override** — landed (bug_0299); applies to observation-returning RPG
  tools in `src/mcp/server.ts`, not action-menu reads. (re-aim #17, #18)
- **`ITEM_UNPLACED` orphan-object validator** — landed (bug_0317) in `src/validate/parser_validator.ts`;
  regression `tests/regression/parser_validator_item_unplaced.test.ts`. (chosen by re-aim #19)

## Known OPEN / deliberately deferred (not "closed" — fair game, but note the deferral reason)

_(As of 2026-06-09 — superseded. The current OPEN/retired status of every bullet
below is restated in the 2026-07-06 re-baseline entry at the bottom; read that
first.)_

- **Stale docstring in `scripts/verify-integrity.ts`** (lines ~31–33 still say the tautology gap "is
  not caught" after bug_0308 closed it) — S-effort doc fix; deferred, blocks no detection.
- **Multi-line tautology** — `TAUTOLOGY_RE` has no dotall flag; split-line `expect(foo)\n.toBe(foo)`
  escapes. S-effort; deferred (real test code writes tautologies single-line; narrow risk).
- **🚫 ANTI-PATTERN — do NOT keep raising `TARGET_PER_MODE` (orchestrator ruling 2026-06-09).**
  Re-aims #19→bug*0332, mid-cycle→bug_0335, #21→bug_0336 each raised `TARGET_PER_MODE`
  (`src/afk/assessor.ts:68`) to \_current counts + a little headroom*. Each raise is consumed by a
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

### Standard cycle — 2026-06-19 (HEAD = bc063ad; next move = quarry survey-chain prose)

**Confirmed CLOSED since printer stale lantern and schedule:**

- **`printers_night` taken lantern/schedule contradictions:** closed by `bc063ad`.
  The shop floor and composing room now react after those items are first picked up,
  including after later drops, and the audit dropped to 5 remaining room/item sites.

**Chosen move — fix the next real stale room prose site**

The next audit entry was a concrete contradiction in `quarrymens_fault`: the quarry
yard kept saying the survey chain lay coiled on a stone block after it was taken.
This cycle gives the TAKE action a durable `survey_chain_taken` flag and adds a
quarry-yard variant that keeps the stone block empty after first pickup, including
after a later drop. It also adds a regression and bug artifact. `npm run assess`
now reports 4 remaining room/item triage sites, with the `quarrymens_fault` entry
gone and the remaining audit work in `tanners_fever` and `wolf_winter`.

**Next after this:** continue down the remaining high-confidence room/item sites, starting with
`tanners_fever`, or promote the low-FP subset once the remaining false positives are
tuned out.

### Standard cycle — 2026-06-19 (HEAD = f5bf06a; next move = tanner notes and meadowsweet prose)

**Confirmed CLOSED since quarry survey-chain prose:**

- **`quarrymens_fault` taken survey-chain contradiction:** closed by `f5bf06a`.
  The quarry yard now reacts after the survey chain is first picked up, including
  after a later drop, and the audit dropped to 4 remaining room/item sites.

**Chosen move — fix the next real stale room prose cluster**

The next audit entries were concrete contradictions in `tanners_fever`: the
apothecary's store kept saying Godwin's open ledger lay on the workbench after the
case notes were taken, and the herb store kept saying the meadowsweet bundle hung
among the drying herbs after it was taken. This cycle gives both TAKE actions
durable pickup flags, adds apothecary-store / herb-store variants that keep the
workbench and herb hook empty after first pickup, and rewrites the notes-read store
variant so it no longer claims the notes remain in hand after a later drop. It also
adds a regression and bug artifact. `npm run assess` now reports 2 remaining
room/item triage sites, with both `tanners_fever` entries gone and the remaining
audit work in `wolf_winter`.

**Next after this:** continue down the remaining high-confidence room/item sites, starting with
`wolf_winter`, or promote the low-FP subset once the remaining false positives are
tuned out.

### Ultraplan cycle — 2026-06-25 (HEAD = token-efficiency branch; next move = parser skill-check roll-complete proofs)

**Confirmed this cycle:**

- `aleconners_seal` blind playtest passed mechanically and found polish, not a blocker:
  `check_empty_finding` reads as a no-op, partial finding feedback is generic, and the
  retest ending can contradict a full-evidence journal.
- Parser skill checks are live in shipped packs, while several parser structural proofs
  still used one deterministic rule set. That could miss success-only or failure-only
  branches in reachability, score, variant, menu, render, relabel, and soft-lock proofs.

**Chosen move — make parser structural proofs roll-complete**

Added `tests/regression/support/parser_rolls.ts` with forced best/worst parser d20
rule sets and moved parser structural exhaustive callers to `exhaustiveEndingsMulti`
where branch coverage matters. The parser all-endings suite now includes a synthetic
pack where success and failure route to different endings, proving the bracket is
load-bearing.

**Next after this:** fix the Aleconner playtest polish or add per-cycle token/cost
telemetry so future token-efficiency work is measured directly.

### Standard cycle — 2026-06-19 (HEAD = 6aef3d6; next move = wolf winter prep-item prose)

**Confirmed CLOSED since tanner notes and meadowsweet prose:**

- **`tanners_fever` taken notes/meadowsweet contradictions:** closed by `6aef3d6`.
  The apothecary's store and herb store now react after those items are first picked
  up, including after later drops, and the audit dropped to 2 remaining room/item sites.

**Chosen move — fix the last visible stale room prose cluster**

The next audit entries were concrete contradictions in `wolf_winter`: the store kept
saying the padded byre-jerkin hung on its peg after it was taken, and the broken paling
kept saying the fallen rail lay in the snow at the player's feet after it was taken.
This cycle gives both TAKE actions durable pickup flags and adds store / broken-paling
variants that keep the peg and trampled snow empty after first pickup, including after
later drops. It also adds a regression and bug artifact. `npm run assess` no longer
reports the stale room/item audit; the next ranked item is a blind playtest.
The assessor unit now proves stale-audit candidate surfacing with a temporary fixture
instead of requiring the live content corpus to keep a known stale site around.

**Next after this:** if the stale room/item audit is empty, promote the low-FP subset
into validation or move to the next ranked assessment item.

### Consolidation decision — 2026-07-06 (recorded during PR #12 remediation; merge HEAD = 3914c4ef + remediation series)

**Decision: the repo is normalized around ONE live game engine — the RPG
foundation — inside one persistent world (Charter Marches hub + the New York
overworld).** The CYOA and parser runtimes are retired; their validator lives
on wholesale as `src/validate/rpg_foundation_validator.ts` (all ~40 finding
codes preserved), and their best mechanics (skill checks, USE puzzles,
dialogue trees, containers, scoring) are first-class in the RPG layer. This
records — belatedly, which was itself a process failure — the product
decision embodied in the 670-commit `codex/token-efficiency-cleanup` branch
(PR #12). An append-only log entry MUST land in the same change as any future
decision of this size.

**Story retirement + recovery:** 36 of 52 shipped stories (all CYOA + parser
packs) were retired with the runtimes, each carrying blind-playtest-driven
fixes worth preserving. The last full 52-story tree is tagged
`stories-52-pre-rpg-consolidation` (= the pre-merge develop/main heads).
Porting retired stories to RPG quests one at a time — reusing their tested
prose, puzzle chains, and endings — is standing flywheel work: each port is a
well-scoped cycle (adapt → validate → blind-playtest → gate).

**Remediation required before merge (all landed with the merge):**

1. Rejection-direction coverage restored: the deleted parser negative
   fixtures were converted to RPG-foundation format with a data-driven
   corpus test, so ~36 foundation finding codes regain witnesses
   (SoundnessBench discipline, bug_0182).
2. Validator/runner parity fixes ported from develop 60bf106a: skill_check
   interactions no longer drop their base effects; INSPECT/OPEN/CLOSE
   interaction verbs are runtime-reachable (new additive `close_object`
   core effect; `is_open` win-stability now tracks close falsifiers).
3. The compact MCP interface was made self-describing for blind agents:
   one-sentence tool descriptions and a session-start `legend` documenting
   every positional field of the compact context, co-located with the
   encoder so they cannot drift.

**Why merge rather than reject:** the compact-observation engine is the
difference between an AI-playable overworld (762 B/observation) and an
unplayable one (94-110 KB/observation measured on develop); the integrity
verifier got strictly stronger (FORBIDDEN\_\* guards, protected→forbidden
migration enforcement); CI is green on the full bar; and the one-engine
consolidation matches the project's stated direction — a single deep world
under TTRPG-style rules, evolved by the dev↔playtest↔feedback flywheel.

### Post-consolidation re-baseline — 2026-07-06 (docs/branches cleanup session)

**Why this entry exists:** the 2026-07-06 consolidation renamed or deleted
several paths recorded as PROOF in the standing "Confirmed CLOSED" section, and
a reviewer verifying those proofs today would be steered into declaring false
regressions — the exact churn this log exists to stop. Per the header contract,
this appends the correction instead of editing history. **Standing norm
(extends the 2026-07-06 consolidation entry's rule): any repo-wide rename or
consolidation that invalidates a recorded proof path MUST append a re-baseline
entry like this one in the same change.**

**Proof-path remapping (all still CLOSED — these are renames, not regressions):**

- `src/validate/parser_validator.ts` no longer exists. Its checks live on
  wholesale in `src/validate/rpg_foundation_validator.ts`: `ITEM_UNPLACED`
  (~line 219), `UNREACHABLE_ROOM` (~385), `SOFTLOCK` (~433),
  `DIALOGUE_GOTO_MISSING` (~697).
- `tests/regression/parser_validator_item_unplaced.test.ts` was deleted; its
  witness lives in the data-driven negative-fixture corpus test over
  `content/broken-fixtures/`.
- `tests/regression/support/parser_rolls.ts` (cited by the out-of-sequence
  2026-06-25 entry) was removed with the parser runtime.
- Still valid as recorded: `resolveProvider`/`MockAuthorProvider` in
  `src/mcp/tools.ts`; `TAUTOLOGY_RE` in `scripts/verify-integrity.ts`;
  `guardFinite` in `src/core/effects.ts`; `divergedAtStep` in
  `src/trace/replay.ts`; `tests/regression/assessor_blind_pass_rotation.test.ts`;
  per-call `hide_graph` in `src/mcp/server.ts`.

**Ruling retired as moot:** the 🚫 TARGET_PER_MODE anti-pattern ruling
(2026-06-09). The constant was deleted with the CYOA/parser runtimes and the
"Gaps A/B/F/G are open" escape hatch is long-closed (A/B, F, and G were each
confirmed closed in later entries). **The ruling's spirit stands against the
successor lever: never cure assessor saturation by inflating the world-graph
breadth target in `src/afk/assessor.ts` — pack count is not the objective.**
Revisit breadth only on an explicit human authoring goal.

**Current boundary snapshot (supersedes the seeded top sections):**

- OPEN: multi-line tautology (`TAUTOLOGY_RE` still has no dotall handling);
  playtest-trend "groove detector" (design first); assessor frontier/benchmark
  scorecard (meaningful only with a live API-key path).
- CLOSED since the seeded list: the verify-integrity stale docstring (7382a58);
  the class-level stale-reactive-description check (implemented as the
  suppression-tuned audit in `src/afk/stale_reactive_audit.ts` and driven
  across the corpus in the 2026-06-19 entries).
- Ordering correction: the "Ultraplan cycle — 2026-06-25" entry was inserted
  out of sequence (it sits before the 2026-06-19 wolf_winter entry);
  chronologically it belongs between that entry and the 2026-07-06
  consolidation entry. Recorded here rather than reordered.

### Removed the real LLM API-key backends — 2026-07-06 (public-repo hygiene)

**Decision: this public repo carries NO third-party LLM API-key surface.** The
`OpenAIProvider` / `AnthropicProvider` / `GoogleProvider` adapters and the
`resolveProvider` env-key selector (spec §12.7, `agents/llm/providers.ts`,
`tests/unit/llm_providers.test.ts`) were deleted. The engine is pure and has no
runtime LLM; the authoring writer/adapter now run only against the deterministic,
keyless `MockAuthorProvider` (`bin/author.ts` and `src/mcp/tools.ts` construct it
directly). `.gitignore` now blocks `.env`/`*.pem`/`*.key`/secret files. No secret
was ever committed — this removes the _surface_, not a leak.

**Supersedes prior recorded facts:** the "still valid: `resolveProvider` in
`src/mcp/tools.ts`" note above is now stale (that call site uses
`new MockAuthorProvider()`), and the frontier/benchmark scorecard lever — recorded
as "meaningful only with a live API-key path" — is **retired as moot**: a public,
key-free repo has no such path. The pure JSON extractor `extractJson` was NOT
key-related and is retained, moved to `agents/llm/extract_json.ts` (regression
`tests/regression/extract_json_resilience.test.ts`, bug_0238).

### Single-world consolidation: the New York overworld is the whole game — 2026-07-07

**Decision: there is now exactly ONE world, the New York overworld. The legacy
"Charter Marches" world (id `charter_marches`, hub "Charterhaven") is removed
entirely — as a manifest, a graph, a set of MCP tools, a per-quest binding, and
an identity that ever surfaces to a player.** This supersedes the 2026-07-06
consolidation entry's framing of "one persistent world (Charter Marches hub + the
New York overworld)": that was still TWO stacked worlds (the overworld sat on top
of the Charter Marches quest graph). The game is now a single seamless open world
(Skyrim/Cyberpunk-style): a player enters via `start_overworld`, travels New York,
and discovers every quest in-world from a town's local notice board.

**Removed:**

- `content/world/charter_marches.yaml` (the world manifest + hub-and-route graph).
- `CANONICAL_WORLD_ID` / `CANONICAL_WORLD_NAME` / `CANONICAL_HUB_CITY`,
  `WorldManifestSchema`, `WorldGraph*` (from `src/world/schema.ts`), and
  `src/world/graph.ts` wholesale (its one survivor, `normalizeSourcePath`, moved to
  `src/world/overworld.ts`).
- MCP tools `list_world` and `world_path` (the Charter-Marches quest catalog + route
  tracer). The overworld's `list_overworld` is the single world/quest catalog.
- The per-pack `meta.world` Charter-Marches binding: stripped from all 11 surviving
  packs, so no "You have come from Charterhaven …" world-intro ever renders. The
  generic optional `WorldBinding` schema + `openingWorldText` are KEPT as dormant,
  content-agnostic scaffolding (no shipped pack carries `meta.world`).
- The 5 quests reachable only via the old world graph, never from the overworld:
  `bellfounders_alarm`, `bridgewrights_proof`, `lockkeepers_toll`,
  `powder_mill_surety`, `quarrymens_fault` — with their dedicated regression tests
  and `traces/bugs/` artifacts (legitimate deletion of tests for deleted content,
  not verification-weakening; the corpus stays far above the `MIN_TEST_CASES` /
  `MIN_ASSERTIONS` floors).

**New model:** the overworld manifest (`content/world/new_york_overworld.json`) is
the sole quest registry — its `quests[]` map each `world_quest_id` to a
`content/rpg/quests/*.yaml` source. `assertOverworldQuestSourceCoverage`
(`src/world/source.ts`) enforces a **bijection** between overworld quests and shipped
packs: no orphan pack, no dangling quest source. `RpgSourceRuntime` resolves quest
id → source through the overworld (`overworldQuestById`), never a world graph;
`loadWorldManifest` is gone. `WORLD_QUEST_TARGET` in `src/afk/assessor.ts` was
LOWERED 16 → 11 to the actual shipped count (this is matching reality after removing
5 orphans, NOT the DECISION_LOG anti-pattern of inflating breadth to force
`content_new`).

**`start_world_quest` kept, de-branded.** It remains a registered MCP tool but is
now a dev/QA entry point into the RPG runtime (start a shipped quest by id), exactly
parallel to `new_game` for generated packs — it surfaces zero Charter-Marches
content and is not a second world. The player-facing path to a shipped quest is
in-world via `start_overworld_session_quest`. Its `include_world_context` option
(which depended on the deleted world graph/route) was removed.

**Content-hash ripple (recorded so a future reviewer doesn't read it as a launder):**
stripping `meta.world` changed every pack's `contentHash`. The load-bearing trace
fixtures that pin `sunken_barrow`'s hash — `traces/rpg/barrow_victory.json`,
`traces/bug_cli_phantom_current.json`, `traces/bug_cli_missing_mode.json` — and the
`tests/regression/trace_cli_integrity.test.ts` pin were updated
`1400a6d4… → 27ef2e9a…`. State/`expected_final_hash` values are unchanged
(`meta.world` never affected runtime state), so no gameplay regression is masked.

**Proof-path remapping (per the standing re-baseline norm):** `loadWorldManifest`,
`fallbackWorldManifest`, `assertWorldGraphIntegrity`,
`assertWorldQuestSourceCoverage`, `assertOverworldQuestSourceBindings`,
`worldRouteFromHub`/`worldQuestNodeById`/`worldMap*`/`publicWorldGraph` no longer
exist. The `RpgWorldQuestPlayableSource`/`…ReportSource` shape dropped its
`{world, node}` for `{questId, title}`.

**Verified:** `npm run health` green (verifier integrity, typecheck, lint, format,
1673 tests, UI typecheck, pack validation), plus a blind overworld playtest.

### External-review remediation — 2026-08-05 (branch `review/external-remediation`, base 589eb8db)

**Why this entry exists:** an independent external reviewer audited the repo at
`5bb7947b` and `43d69416` and filed 17 findings with a four-phase plan. This
records what was executed, the judgement calls made inside it, and — per the
append-only contract — what was deliberately NOT done and why, so a later
reviewer does not read the gaps as oversights.

**Landed (20 commits, Phase 1 through Phase 3 minus the content restructures):**

- `N1` — numeric gates were never checked for feasibility. `checkConds` audited
  every symbolic gate for unsatisfiability and never looked at `var_gte` /
  `var_lte` / `var_eq`, so an unwinnable quest validated with zero findings.
  Added `varReachableRange`, a deliberate OVER-approximation (one positive `inc`
  makes the maximum unbounded), plus `PHANTOM_VAR` for a gate naming a var that
  is neither declared nor written, and widened the win-room harvest to `in_room`.
- `N2` — free-text TALK returned the first substring match in pack order, so any
  abbreviation of a Wolf-Winter June resolved to a June who was absent on that
  branch. Routed through `resolveVisibleNpc`; added `AMBIGUOUS_NPC_NAME`.
- `N3` — compact `roads` quoted the shortest ROUTE to a destination, which for
  eight ordered road pairs is a two-hop detour, not the road. Compact view v44.
- `N4` — the crawler RENDER oracle checked three observation fields; it now walks
  every player-visible one.
- `N5`, `N7`, `D1`–`D4`, `D6`, `D7`, `D9`, and the §3.2/§3.4 test and solver items.

**Judgement calls worth recording:**

1. `AMBIGUOUS_NPC_NAME` ships as a WARNING, not an error. The four same-named
   Junes are provably mutually exclusive, so erroring would make a healthy pack
   unplayable. It surfaces the duplicates honestly and should be promoted to an
   error once they are gone — at which point it also proves that work complete.
2. `D3` was resolved by WIDENING the RNG rather than narrowing the accepted seed
   domain, because narrowing would reverse `bug_0208` and red four documented
   OVER-RESTRICTION guards. `Math.floor`, not `Math.trunc`, so negative seeds stop
   aliasing onto their unsigned twins; every sub-2^32 stream is byte-identical.
3. `D9`'s `unlock_exit` was DELETED rather than wired into MOVE. Wiring it would
   mean the engine scanning pack-wide effects at runtime to decide which exits are
   flag-gated, when `exit.conditions` already expresses exactly that.
4. `D2` raised the static floors to ~80% of the measured corpus AND made the two
   silently-skipped drift guards hard errors. Wiring `--against` into a shallow CI
   checkout without that change would have bought nothing while looking like
   protection.
5. `N7` inverted three assertions that pinned the defect as intended. Called out
   explicitly rather than quietly: they now pin that a snapshot taken after a
   reveal restores with the gate satisfied.

**NOT done, and why — these are open, not closed:**

- **Review items 15 + 16 (NPC `variants[]` with `when:`, and moving the four Junes
  onto it).** Landing the engine affordance alone would add schema surface with no
  consumer, which is the accretion the review's own closing section names as the
  root problem. Landing the content half changes NPC ids on the flagship quest,
  and therefore action ids across traces, tests and the ending census, and is
  player-facing — which under `AGENTS.md` needs a blind playtest per landed cycle.
  The `AMBIGUOUS_NPC_NAME` warning is the standing signal until it is done.
- **Review item 17 (`N6`, reclaiming `src/rpg/dialogue_presentation.ts` prose into
  content).** Larger than the review's description: the module is a whole
  presentation overlay for one quest, keyed on exact authored prose, with ~60 lines
  of shipped player text and a set of `replaceAll` rewrites. The fix is a ~20-site
  prose migration inside a 4,000-line YAML quest that changes its `content_hash`;
  exact-match fragile, player-facing, and gated on item 15. Left open.
- **Phase 0 and Phase 4 in their entirety** — the density counter-metric, the
  cross-family blind tester, the non-player evidence channel, the go/no-go on
  deleting the save-migration ladder, the assessor's fate, and the README claims.
  The review assigns every one of them to the repository owner as a human decision.
  `AI_LOOP_ALLOW_VERIFIER_EDITS` was never set.

### Repository closeout supersession — 2026-08-05

**Ultraplan handoff contract corrected.** Older entries above describe
`docs/CURRENT_PLAN.md` as an overwritten rolling handoff. That is historical
behavior, not current guidance. The tracked file is now a durable router. Each
ultraplan writes its sole fresh-agent handoff to ignored
`ai-runs/<cycle>/current-plan.md`, and `ai-runs/latest-cycle.json` records it as
`currentPlanRecord`. This prevents an unattended cycle from turning transient
planning into unrelated tracked churn.

**Pure evidence now names an exact revision.** In commit-enabled cycles, focused
checks and a local provisional commit precede the pure blind run; the tree must
be exactly clean and the provisional revision is never pushed. Post-play, only
`AI_LOOP_STATE.md` may differ before the outer crawl, health, integrity-drift,
and playtest-record gates. Evidence-only cycles instead play the clean baseline
before editing and must not claim that report validates their uncommitted work.

**External-remediation review corrections.** A second independent pass found
five integration defects in the immediately preceding remediation sequence and
closed them with one explicit additive projection change: nested story-reveal
receipts are deep-cloned; full story inspection hashes the post-reveal state;
direct full-view roads carry detached exact estimates so compact v45 preserves
their own event fatigue across clone and serialization; signed/wide seeds use an
injective 64-bit stream while the historical unsigned-32-bit stream remains
byte-identical; and RPG save v2 identifies that RNG boundary. Version-1 narrow
seeds migrate because their continuation is unchanged, while signed/wide v1
seeds fail explicitly instead of resuming on different rolls. Strict legacy
loading strips the retired `ObjectRuntime.contents` field, and own-entry
validation preserves and type-checks every schema-valid state-record key before
current-schema validation. Frozen regressions cover each boundary.

### RPG save v3 consistency boundary — 2026-08-06

RPG save v3 adds `stateHash`, the canonical SHA-256 produced by
`hashState(parsedState)`. It detects a state whose bytes and recorded digest disagree;
it is deliberately not an authenticator. Local saves remain user-editable, and an
intentional edit can be resumed after recomputing the public deterministic hash. The
load boundary now uses strict, version-specific top-level schemas and returns only
schema-parsed data. Unknown envelope keys fail instead of being retained.

Historical compatibility is explicit: genuine v1 and v2 envelopes have no
`stateHash`; v1 first receives its existing object-runtime/RNG migration, v2 uses the
current state shape, and both are normalized in memory to v3 with a computed digest.
A v3 envelope missing or disagreeing with its digest is invalid.

Pack-aware load validation also gives player `hp`, `attack`, and `defense` conservative
authored ceilings. The ceiling starts at the greatest initialized, authored `set_var`,
or recorded campaign-import value, then budgets the sum of every positive authored
delta for the initial room effects and every accepted step. This intentionally loose
over-approximation admits impossible-but-bounded combinations rather than rejecting a
reachable save, while still rejecting arbitrary stat inflation.

### External-review architecture supersession — 2026-08-07

This entry supersedes the 2026-08-05 remediation entry's “NOT done” ruling for
Phase 0, items 15–17, and Phase 4. The owner directed the review to be completed,
including the structural work and deletion. The requirement/evidence index is
`docs/EXTERNAL_REVIEW_COMPLETION.md`; this log records the design choices that
future changes must preserve.

**NPC/dialogue variants and content ownership.** NPCs and dialogue nodes now
have authored `variants[]` selected by closed-DSL `when` conditions. Wolf-Winter
uses one stable `june_pike` identity whose room and dialogue root react to state,
and the engine-side Wolf-Winter prose overlay is deleted. Player prose lives in
the pack and is covered by its content hash. `AMBIGUOUS_NPC_NAME` is now an error:
mutual exclusion should be expressed through one identity's variants, not through
several indistinguishable people.

**Reveal authority is durable session state.** `inspectedStoryReveals` belongs to
`OverworldSession`, is cloned into the snapshot, is authenticated against the
currently inspectable authored reveal during restore, and is cleared when the
choice is consumed. MCP, terminal, and UI presentation call the same session
accessors. A restored session therefore has exactly the same hidden-option
legality as the exported state; transport-local receipts are prohibited.

**D10 save-migration ladder deletion.** The exact-content migration ladder is
retired under explicit owner authority. Overworld compatibility is governed by
`OVERWORLD_WORLD_SCHEMA_VERSION = 11`; version 10 is the sole supported structural
predecessor and upgrades without rewriting authored content. `worldHash` remains
provenance. A mismatch produces `OVERWORLD_CONTENT_HASH_MISMATCH_WARNING` —
“This save was created from different authored world content; its prior journal
is preserved, and current authored content governs future play.” — and restores
against current content, while world id, current-manifest references, journey
causality, resources, journal chronology, campaign effects, and local scene
proofs remain strict.

This is the copy-independent schema contract: a prose edit never earns a hash-keyed
normalizer, frozen copy blob, legacy shim, or predecessor fixture. A genuinely
incompatible state-shape change must bump the structural version and provide one
explicit upgrade or reject the old shape. The obsolete content-hash branches,
legacy modules, and migration-only tests are removed together. The integrity
ratchet recognizes that retirement only through a one-time sentinel, the exact
reviewed deletion set, and the measured count delta; the exception cannot be reused
after this record exists in the comparison base. Aggregate counts are supporting
evidence for the reviewed retirement, not proof that every unrelated assertion or
source change is absent.

**Assessor truthfulness.** Compiled verified hotspots remain the assessor's
evidence-backed strategic input. When all real levers disarm and only 0.5 rotation
rows remain, output says “Maintenance rotation only — no strategic
recommendation.” Alphabetical tie order is deterministic scheduling, not evidence
that the first quest is the next-best improvement. If compiled-hotspot input fails
to remain live across two milestone compiles, the remaining ranker should be
deleted rather than cosmetically resuscitated.

**Non-player evidence and density cost.** The player lane remains authority for
experience. A separate nightly/manual zero-token lane runs deep crawl, bug-trace
integrity, opening-density measurement, ending proof, and standard-suite coverage.
The canonical compact opening is capped at 732 measured word tokens and 12
immediately actionable options. Reductions need no re-pin; an increase is an owner
decision. A clean player report cannot overrule a red structural audit.

**Capture-profile boundary.** Existing exact Codex capture profiles are frozen as
historical readers. No point release automatically earns another byte-for-byte
private rollout profile. Structural validation may replace that ladder only after
an authenticated future rollout supplies a stable envelope and the new validator
preserves tool allowlist, model/CLI authority, cwd/filesystem binding, terminal
lifecycle, and artifact hashes. Without that evidence, broadening the accepted
shape is a security regression, so no speculative implementation ships here.

**External dependency retained honestly.** The cross-family experiment is approved
but not repository-complete: the public repo has no non-Codex provider or
credentials. Before claiming model-family-independent clarity, the owner must select
and authorize a provider, implement an equally fail-closed receipt adapter, and run
at least ten fresh pure journeys on the same clean revision under the neutral player
contract. That cohort remains separate from retention authority until provenance is
equivalent.

This entry records architecture, not a green landing claim. Crawl, health,
integrity drift, exact-revision blind evidence, PR `verify`, and merge status are
filled from fresh output in the completion record's final checklist.

### Ultraplan re-aim — 2026-08-11 (HEAD = 44689272; next move = RPG terminal-state coherence)

**Confirmed CLOSED boundaries — do not re-nominate:**

- **Replay divergence reporting remains complete.** `src/trace/replay.ts` already
  reports `divergedAtStep`; the original closed entry above remains authoritative.
  The programmatic getter/TOCTOU probe is a different, lower-impact API hardening
  candidate, not evidence that divergence reporting regressed.
- **Runtime terminal writes are already atomic.** `src/core/state.ts:98-111`
  initializes `ended:false` with `endingId:null`, and
  `src/core/effects.ts:269-273` is the sole gameplay writer and sets
  `ended:true` with the authored ending id in one state update. No reducer,
  ending, or content change is needed.
- **Save v3's consistency boundary remains settled.** The 2026-08-06 entry above
  keeps `stateHash` as a public deterministic consistency check rather than an
  authenticator, preserves v1/v2 normalization, and reserves version bumps for
  state-shape incompatibility. This cycle adds no envelope field, migration,
  authentication claim, or save-version change.
- **The one-runtime/one-world consolidation remains closed.**
  `docs/ROADMAP.md:11-20` fixes RPG as the runtime and New York as the single
  shipped world. The chosen repair is shared state integrity, not another mode,
  world, or start path.
- **The starting-slice content boundary and nineteen causal forks remain
  frozen.** `docs/ROADMAP.md:64-95` keeps Albany -> Wolf-Winter as the bounded
  milestone and freezes new towns and unrelated prose branches. No pack,
  authored predicate, causal-matrix row, or certification rule changes here.

**Open findings triaged:**

- The starting-slice proof-ledger helper can false-pass a missing file on an
  uncounted `proof_status:"proven"` row; this is the next-best verifier repair,
  but every current proof file exists and exploiting it first requires changing
  the ledger.
- Authored-event predicate parity and timed event lifecycles lack a current
  non-speculative consumer without expanding frozen Albany content. Predictable
  evidence temp files, refined MCP schema publication, shallow event-decoration
  snapshots, and programmatic trace getters are real hardening candidates but
  rank below an already reachable public gameplay-state contradiction.

**Chosen move — reject incoherent RPG terminal state at every untrusted state boundary.**

`src/persist/save_load.ts:109-138` currently validates `ended` and `endingId`
independently. A locally editable save with a recomputed public hash therefore
loads with either `ended:true` / `endingId:null` (no rendered ending and no legal
actions) or `ended:false` / a declared ending id (the ending is hidden and play
continues while stale terminal identity remains). Require exactly
`ended === (endingId !== null)` in the reusable well-formed-state assertion and
route normalized v1/v2/v3 load state through that assertion before hashing.
`tests/regression/save_load_referential_integrity.test.ts` must reject both
hostile directions while retaining active and legitimately ended round trips;
`traces/bugs/bug_0570_rpg_terminal_state_coherence.yaml` records the boundary.
This is a rejection-only integrity strengthening: no valid engine-produced state,
content hash, save envelope, action, ending, or observation changes.

### Ultraplan re-aim — 2026-08-11 (HEAD = 1fde4cdc; next move = proven proof-file integrity)

**Confirmed CLOSED or rejected boundaries — do not re-nominate as this move:**

- **RPG terminal-state coherence remains closed.**
  `src/persist/save_load.ts:191-195` requires
  `state.ended === (state.endingId !== null)`, and
  `tests/regression/save_load_referential_integrity.test.ts:250-267` retains the
  hostile two-direction import proof. No save envelope, version, hash, ending,
  or gameplay change belongs in this cycle.
- **Starting-slice breadth and authored causal rows remain frozen.**
  `docs/ROADMAP.md:64-95` keeps Albany -> Wolf-Winter as the bounded milestone,
  while `docs/STARTING_SLICE.md:187-232` records all nineteen existing forks as
  structurally proven but does not certify the wider quality target. This cycle
  changes no row, town, scene, predicate, count threshold, or certification
  status.
- **Post-quest contact freshness is not an established scene contract.**
  `src/world/session_event_resolution.ts:159-185` and
  `src/world/session_local_actions.ts:354-377` require a contact presentation,
  while `src/world/session_snapshot_restore.ts:857-880` explicitly orders the
  investigation—not the contact presentation—after required quest completion.
  Requiring a new post-quest conversation would reinterpret several authored
  scenes and existing saves, so it is rejected without an explicit schema and
  content decision.
- **Event-decoration object cloning and evidence-publication link hardening remain
  lower-priority open hardening.** `src/core/engine.ts:139-149` protects the event
  array but only shallow-copies its records, and `src/mcp/server.ts:199-219` uses a
  predictable sibling temporary evidence path. Both require a misbehaving local
  extension or adversarial filesystem setup; neither outranks the current proof
  ledger's executable false claim.

**Chosen move — every row marked proven must resolve its counterfactual proof file.**

`docs/STARTING_SLICE.md:1052-1065` defines the causal matrix as the proof ledger
and records paired deterministic counterfactual evidence on each row. The live
`SS-F19-witnessed-wound-care` row is implemented and
`proof_status:"proven"` but intentionally does not count toward the certification
floor. `src/starting_slice/causal_matrix.ts:140-151` currently checks file
existence only for counted rows, so a cloned SS-F19 that names a nonexistent test
still passes `assertCountedStartingSliceProofsExist`.

Rename that helper around the actual proof claim and require an existing
`counterfactual_test` for every `proof_status:"proven"` row, independent of
`counts_toward_contract`. Add a hostile SS-F19 missing-file regression plus a
non-proven control, and record the boundary in
`traces/bugs/bug_0575_starting_slice_proven_proof_integrity.yaml`. The live matrix
must remain 19 rows, 12 counted, `active_unproven`, with SS-F19 still uncounted;
this is a rejection-only verifier repair with no content, mechanics, fleet,
threshold, or certification-result change. The clean 19:37 pure report predates
the uncommitted repair and is baseline evidence only, not causal validation.

### Ultraplan re-aim — 2026-08-14 (HEAD = ceadd735; next move = pilot-backed opening clarity)

**Confirmed CLOSED or rejected boundaries — do not re-nominate as this move:**

- **Starting-slice structure and strategy plurality are not the current failure.** The authenticated
  ten-player Terra pilot at `ceadd735` completed Wolf-Winter 10/10, continued 10/10, represented
  HUNT/LURE/FORTIFY at 2/4/4, and had no stuck run. DRIVE remained legal; its sole matching-ground
  player compared it and deliberately chose FORTIFY. No mechanics, seed selector, outcome, route,
  or certification threshold changes belong in this cycle.
- **Progressive Station support remains a deliberate bounded contract.** The compact board keeps
  optional support behind its existing read-only detail affordance; inlining another 458 characters
  would increase the density the cohort reported. This cycle does not change Station schema/version,
  support authority, availability, or action handles.
- **Post-Wolf checkpoint and Gallowmere continuity findings remain follow-up work.** They occur only
  after the initial goal's authenticated Continue and do not explain the unanimous pre-field Albany
  density report. They are retained as evidence rather than bundled into this starting-slice repair.
- **The HUNT review action is intentionally nonmutating.** Its `end:true` topology and zero effects
  preserve the north-crossing/June-release commitment boundary. The defect is the word PREPARE on a
  no-change exit, not a missing buff or receipt; adding state would be a mechanics regression.

**Chosen move — pilot-backed summary-first Albany handoff and truthful HUNT closure.**

The valid pilot missed only clarity and enjoyment (40/50 each versus 42/50), while every one of its
ten reports named Albany role/duty/evidence/dispatch density. Deduplicate the first registration and
matched quick-setup projections without deleting any option or exact inspected term: option labels own
role identity, commitments own experience, tradeoffs own obligations, and the prompt owns shared
no-fee/no-plan language. Compress the read-only four-plan compass into parallel outcome/cost/later
lines while retaining every irreversible boundary. In the same presentation-only handoff, rename the
zero-effect HUNT exit as leaving the review with no change and ensure no-June firm-ground prose never
instructs the player to ask an absent June. Preserve all ids, conditions, effects, resources, decisions,
progressive reveal authority, plan legality, outcomes, and save/runtime shape. A fresh exact-build pilot,
not these deterministic checks, decides whether the 4.2 quality gates improve.

### Ultraplan re-aim — 2026-08-14 (HEAD = 39e2e0ee; next move = Station board V4)

**The prior V3-collapse decision is superseded by fresher authenticated evidence.** The valid,
no-retry Terra pilot `cert-pilot-albany-wolf-return-20260814T055626Z` bound exact clean commit
`39e2e0ee845e593f4da05caf445fd677e86293d8` and world hash `ef907fe6…`; its manifest SHA-256 is
`824e8d3a…` and pilot-result SHA-256 is `ff775c3d…`. It completed Wolf-Winter 10/10 with no stuck
run, but reached only 38/50 clarity, 40/50 enjoyment, and 6/10 continuation. Five players made the
extra `include_station_dispatch_support` context read; the direct seed-2026081700 witness (report
`d6fc12e3…`, evidence `ff4b1885…`) explicitly called the default board indirect because open rows
had neither stakes nor handles. The earlier estimate that safe inlining necessarily added 458
characters counted verbose detail rather than a short row purpose and therefore no longer governs.

**Chosen move — authenticated, stale-safe V4 projection.** Compact v46 introduced board V4; compact v47 preserves its
five-field tuple while giving only each current `open_optional` support row one short purpose and
its already-authenticated inspect/talk tuple. Role, duty, evidence, selected support, blocked support,
and any null-action state remain null/null. Guidance stops repeating all three purposes. The board is
817 JSON characters and board plus legend is 1,231, close to V3's 648 + 515 = 1,163; when support is
wanted, the one 844-character V4 board object replaces the 1,161-character V3 board-plus-detail
objects and eliminates a repeated full-context hop. The legacy detail flag and response stay available
unchanged. This is presentation and projection only: ids, mechanics, costs, roads, choices, outcomes,
checkpoints, saves, hashes, decision counts, and support authority do not change. The failed pilot is
diagnostic evidence, not certification; a fresh exact-build cohort must judge whether V4 helps.

### Ultraplan re-aim — 2026-08-20 (HEAD = 85a8bcf1; next move = compact Station V5)

**Chosen move — one durable compact-MCP support review.** The valid but
non-certified pilot `starting-slice-terra-pilot-85a8bcf1-20260820-c` reported a
broad Albany/setup/compact-density cluster in 10/10 reports, with 9/10 explicitly
naming Station or dispatch density; its two in-scope S1 findings were Jamie's
narrow Relief Protocol trigger and June Pike's situational payoff. Compact v48
therefore moves board V5's three open optional-support rows behind one exact
read-only reveal receipt, restores their existing actions unchanged after review,
and adds narrowly keyed no-effect/trigger boundaries only to exact Jamie and June
option inspection. It also emits the complete shared dispatch briefing once while
preserving every route-specific fact. Human UI and CLI behavior, ids, costs,
mechanics, gameplay state/effects, save version, decisions, and outcomes remain
unchanged; only the additive read receipt changes snapshot bytes/hash until support
seals, launch, or End. The
failed pilot identifies this correction target; it does not validate the
replacement, certify authority, or support any unrelated content or metric claim.

### Ultraplan re-aim — 2026-08-21 (HEAD = 766bad57; next move = compact Station V6)

**Chosen move — make the optional-support reveal relevance-first.** The valid but
non-certified no-retry Terra pilot `station-v5-sealed-pilot-766bad57` completed
Wolf-Winter 10/10 but missed clarity at 40/50 and enjoyment at 41/50. All ten
players opened the Station support reveal, nine inspected the field-kit comparison,
and six Road-Warden players made that comparison even though their Fieldcraft
background matched none of the three kit checks (Repair, Streetwise, Mediation).
Those authenticated calls support a bounded information-scent correction, not a
claim that the existing actions or mechanics failed.

Compact v49 / board V6 keeps V5's exact reveal id, durable receipt, hidden pre-review
rows, and byte-identical post-review purposes/actions, but replaces the generic
choice count with one dynamic overview naming only the still-open kit, relief-wagon,
and second-rider categories. The all-open copy names the three kit skill domains so
an uninterested or unmatched player can depart without drilling into support. The
pure prompt makes review conditional and removes V2/V3 history; the compatible
explicit-detail flag and runtime responses remain available. IDs, support order,
costs, timing, checks, gameplay effects, roads, strategies, outcomes, saves apart
from the existing read receipt, accepted decisions, Continue/End, full UI, and CLI
remain unchanged. The failed pilot diagnoses this target; only a fresh exact-build
pilot can show whether clarity or enjoyment improves.

### Ultraplan re-aim — 2026-08-21 (HEAD = 06144d52; next move = pure Station reveal V1)

**V6 worked at its chosen boundary; do not reopen its board or mechanics.** The
valid ten-player, single-attempt Terra pilot `station-v6-sealed-pilot-06144d52`
bound exact clean `06144d52f333b217230dd23f1bc02393b9102fbc`. It completed
Wolf-Winter 10/10 with no stuck run, p50 22 accepted decisions, 8/10 initial-goal
continuation, and three represented strategies, but failed clarity at 40/50 and
enjoyment at 41/50. Road-Warden preparation inspection fell from 6/7 under V5
to 2/7 under V6, and total preparation inspection fell from 9/10 to 5/10. That
is bounded evidence to preserve V6's relevance-first kit/wagon/rider overview,
not a causal quality-lift claim.

All ten authenticated raw rollouts made exactly one Station reveal. The old
response repeated `journey` and a 4,257–4,361-byte context even though every
pre/post context field except `station_dispatch_board` was byte-identical; total
responses were 5,314–5,418 bytes (53,841 combined) and boards only 788–802.
Each next call was one support action (four inspect, six talk), so the repeated
journey/routes were unused on that next turn. Re-serializing the ten exact boards
inside the chosen V1 envelope, with each actual 24-character retained base hash,
yields 1,020–1,034 bytes (10,315 combined), 43,526 bytes / 80.84% less. This is
structural amplification correlated with density
reports, not proof that repetition caused the two failed ratings.

**Chosen move — a base-bound, versioned pure delta.** Only a reveal-only pure
`get_overworld_session_context` call specializes. It requires the latest
`if_snapshot_hash`, captures the manager's immediately prior hash before the
canonical receipt mutation, and returns outer `ok`, new `snapshot_hash`, and
`overworld_session_id` plus
`station_dispatch_reveal:{version:1,base_snapshot_hash,station_dispatch_board}`.
The delta omits `journey` and `context`; the player keeps the prior context,
`quests`, and `quest_starts`, replaces only its board when the base matches, and
uses the outer hash. Missing/stale bases fail before mutation. Exact repeats are
hash-idempotent. Either explicit detail-expansion flag preserves the full
canonical response and legacy hash behavior; unexpected post-mutation board
shape also keeps the full success. Full/non-pure refresh, manager, export, UI,
CLI, compact v49, board V6, receipt lifecycle, ids, actions, costs, mechanics,
strategies, outcomes, accepted decisions, and Continue/End remain unchanged.
The pilot remains non-certified AI evidence, not human validation or support for
Gallowmere, June-mechanic, retention-metric, or certification claims.

### Ultraplan re-aim — 2026-08-21 (HEAD = 3da05f64; next move = pure June modal V1)

**V6 relevance and the reveal V1 remain closed.** The valid, clean, no-retry
ten-player Terra pilot
`starting-slice-terra-pilot-3da05f64-20260821T110413Z` bound exact commit
`3da05f6481aece49d088b9132271ae79d97fae15`, official npm-shim Codex 0.146.0,
and world hash `ef907fe6e3f81af9fed7c36a2dfe528fc6999481323ce4ade064f1ec66dd4017`.
Its manifest, summary, pilot-result, and authority-proof SHA-256 values are
`7ff590a0a0741a724f6c09ae58c2f54467e1ddb29aa59d0c88ff79f492189cb0`,
`265ba0f3bf12f2369752b565753ce18985cb8b01f41c1c47b231dc629bea2362`,
`efa0a0471b8c8b223b9805186a5f8011863fa40b33a05f8241ee2f9a3d964e07`, and
`5098ddb038251676586387614a3cf29f61cc0b9ebe5e088278f2e463f38f0078`.
All ten report and rollout hashes matched their manifest rows. The cohort had no
stuck player, p50 23 accepted decisions, 8/10 initial-goal continuation, and all
four Wolf-Winter strategies (HUNT 1, LURE 4, DRIVE 3, FORTIFY 2), but failed
clarity at 39/50 and enjoyment at 40/50. It carried four S1 report findings and
no repeated blocking cluster. These are valid technical and diagnostic results,
not a quality pass or authority certification.

Nine players used the existing reveal V1 at 1,032–1,034 bytes and one used the
canonical exact-detail path. That supports preserving board V6's relevance-first
overview and reveal V1's narrow board delta. Eight players then took the revealed
June action. Its canonical full compact responses were seven 8,873-byte members
and one 9,080-byte member: 71,191 bytes total. Every one was immediately followed
by the mandatory ally choice. Reconstructing the eight exact responses as the
chosen complete-legend V1 modal envelope yields 3,908 bytes each, 31,264 total,
for 39,927 bytes / 56.08% less. This is structural repetition evidence correlated
with the cohort's density reports, not proof that transport size caused either
failed rating. Seven of those players chose June immediately after the reveal;
seed `821110413000` chose relief first, then June. The focused regression takes
preparation first. These cover three observed order shapes, not every permutation.

**Chosen move — authenticate and narrow only the exact pure June modal handoff.**
After an exact persisted Station reveal receipt and matching public snapshot, a
non-consuming full observation must show board V6, exactly one open `field_team`
row whose action talks to June, and no current story modal. Only that member
requires `expected_snapshot_hash` before mutation. Its versioned response carries
outer `overworld_session_id`, a distinct new `snapshot_hash`, the complete compact
`journey` and ally `storyChoice`, `journeyDecision`, compact `result`, the complete
canonical `legend_delta` when present, and
`station_dispatch_modal:{version:1,base_snapshot_hash}`; it omits raw `session_id`
and repeated `context`. The new story modal supersedes retained board actions.
Read-only story inspection keeps the hash unchanged, and the mandatory exact ally
choice remains full and re-synchronizes context. Missing/stale bases fail before
mutation; an ineligible contact or post-shape mismatch retains canonical behavior.

The broader support-commit idea is rejected for this move. Nine players selected
support, but order-neutral play produced thirteen separate mutations (eight ally,
four wagon, one preparation), with 6,268–6,746-byte responses and 85,882 bytes
total. A partial state patch would need stronger merge proof for time, character,
services, journal, discovery, and selected support. Those commits therefore stay
full, as do generic/non-pure contacts. Board V6, reveal V1, all ids, content,
costs, checks, mechanics, effects, outcomes, decisions, strategies, Continue/End,
and Gallowmere remain unchanged. This ten-player AI pilot does not establish a
quality lift, human validation, retention improvement, or certification.

### Ultraplan re-aim — 2026-08-21 (HEAD = bfccce6a; next move = narrative-first Road-Warden receipt)

**The Station transport contracts remain closed.** The valid, single-attempt
ten-player Terra pilot
`starting-slice-terra-pilot-bfccce6a-20260821T141909Z` bound exact clean
`bfccce6a58414a99806edf2cfdcd12d263d24e14`, official npm-shim Codex 0.146.0,
and the unchanged world hash
`ef907fe6e3f81af9fed7c36a2dfe528fc6999481323ce4ade064f1ec66dd4017`.
It completed Wolf-Winter 10/10 with no stuck run, p50 24 accepted decisions,
four strategies, clarity 40/50, enjoyment 40/50, and 5/10 initial-goal
continuation. It therefore failed three quality gates while remaining valid
technical evidence. Nine players used reveal V1, eight used June modal V1, all
gameplay calls succeeded, and those surfaces are counter-signals against
reopening board V6, either V1 envelope, or support breadth.

Every player independently chose Road-Warden, then the ready-made Aid-Only and
Hayden dispatch. The shared chronology was start at decision 0, scout at 1,
talk to Rowan at 2, choose Road-Warden at 3, and use one 9,196-byte dispatch
selection call to record the oath and report at decisions 4 and 5. All ten
reports described dense or front-loaded Albany terminology. Seed
`821141909005` specifically named `DEF`, `LURE`, `HUNT`, `DRIVE`, and `FORTIFY`
before the quest introduced the plans in player language; seed
`821141909009` recorded an in-scope S1 on the relief-registration choice chain.
This locates one universal selected-receipt correction before Station rather
than another June-only or support-flow change.

**Chosen move — explain the Road-Warden result before its plan aliases.** Rewrite
only the Road-Warden registration consequence and the matched Aid-Only/Hayden
doctrine trigger, preview, and consequence. Say that Fieldcraft starts Wolf-Winter at defense
4 instead of 3; describe the later bait-and-redirect and hold-the-ground
benefits before attaching their `LURE` and `HUNT` names; retain the exact clean
first-cast/fouled-cast boundary and Hayden's ordinary split, unbound rail,
fallen-yearling, bare-spear, and Works/skipping/binding exclusions. Mirror the
exact trigger literal in the known-doctrine presentation guard so ordinary
fallback remains honest if content diverges. IDs, numbers, predicates, effects,
costs, actions, decisions, Station V6, reveal V1, June modal V1, support, roads,
strategies, outcomes, Continue/End, Gallowmere, and quality thresholds do not
change. This failed AI pilot diagnoses the copy target; deterministic tests do
not prove a rating, continuation, certification, or human-quality lift.
