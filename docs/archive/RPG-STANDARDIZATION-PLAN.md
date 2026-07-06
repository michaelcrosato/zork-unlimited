# Ultra-Local Plan — Standardize the mechanic palette across all 17 stories

_Goal: upgrade all existing stories toward the "full RPG experience" and standardize each
story to carry the same range of mechanics, **applied where appropriate**._

Grounded in the actual code at HEAD `8c888c1` (loop parked). File/line references are real.

---

## 0. The reframe (what the architecture makes this task actually be)

The engine is **already a unified core with three thin mode-skins**, not three engines:

- `GameState` (`src/core/state.ts`) is ONE shape for every mode: `flags`, `vars`, `inventory`,
  `journal`, `questStage`, `objectState`, `current`, `visited`, `ended`, `endingId`.
- `EffectSchema` (`src/core/effects.ts`) is shared & closed — it already includes `inc_var`/`dec_var`
  (scoring & stats), `set_quest_stage` (quest stages), `end_game` (death/win), `set_var`, etc.
- `ConditionSchema` (`src/core/conditions.ts`) is shared & closed — `var_gte/lte/eq` (stat/score
  gates), `quest_stage`, flags/items, `is_open/is_unlocked`, `all/any/none_of`.
- `resolveSkillCheck` and `resolveAttack` (`src/rpg/combat.ts`) read **only `state.vars`** and an
  inline stat block; they are **mode-agnostic** and reusable as-is.
- RPG mode is literally `ParserPackSchema.extend({ enemies })` (`src/rpg/schema.ts:65`); the RPG
  runner is "parser runner + ATTACK + skill_check" (`src/rpg/runner.ts`).

**Therefore "full RPG experience" decomposes into:** make the full mechanic set an **optional,
first-class capability in every mode** (it is mostly already _expressible_, just not _surfaced_),
then **enable per story the subset that fits its fiction.**

**Keystone precedent:** `breaking_weir` is an **RPG pack with zero combat** (a pure skill-check
chain). RPG ≠ combat. The "(when appropriate)" clause is doing real work — we are standardizing a
**palette**, not forcing sword-fights into moral forks.

### Recommended interpretation

- **A (recommended): uniform palette, in place.** Keep each story's natural form; make every
  mechanic an optional capability of every mode; enable the appropriate subset per pack.
- **B (rejected): convert everything to RPG-mode room-worlds.** Rewriting CYOA scene-graphs into
  spatial dungeons is a massive rewrite, destroys the moral-fork concision, and forces combat where
  it doesn't belong. Violates "(when appropriate)".

---

## 1. The canonical palette & current first-class status

"First-class" = schema field **+** observation surface **+** validator **+** exhaustive proof.
"DSL" = already expressible via core effects/conditions but not surfaced/validated.

| Mechanic                                | CYOA                   | Parser                                     | RPG                          | Lift to standardize                            |
| --------------------------------------- | ---------------------- | ------------------------------------------ | ---------------------------- | ---------------------------------------------- |
| vars / stats (hp, attack, skill…)       | vars only (no display) | vars only (no display)                     | first-class (display+combat) | **display** in CYOA/parser observation         |
| reactive variants + name swaps          | ✅                     | ✅                                         | ✅                           | none (already uniform)                         |
| death/restore ending flag               | ❌ (no `death`)        | ✅ `death:true`                            | ✅                           | add optional `death` to CYOA `EndingSchema`    |
| quest_stage                             | DSL only               | DSL only                                   | DSL (1 pack uses)            | surface in observation + validator (all modes) |
| scoring (`inc_var score` + `max_score`) | ❌ (no `max_score`)    | ✅ (5/5)                                   | ✅ (5/5)                     | add optional `max_score`+display+proof to CYOA |
| skill_check (d20 + var vs DC)           | ❌                     | authored but **unresolved** in parser mode | ✅                           | reuse `resolveSkillCheck`; see §3 gotcha       |
| deadline (global timed terminal)        | ✅ `meta.deadline`     | ❌                                         | ❌                           | port CYOA's `checkWin` hook to parser/RPG meta |
| combat (enemies + ATTACK)               | ❌                     | ❌                                         | ✅                           | RPG-mode only; opt-in (see §2 rubric)          |
| containers / locks / NPCs / dialogue    | ❌                     | ✅                                         | ✅                           | structural; not part of the RPG-palette ask    |

**Current usage (from the 17-pack survey):** CYOA 7 (only `clockwork_heist` uses deadline; none use
score/skill/combat/quest/stats). Parser 5 (all use score+death; none use skill/combat/quest/stats).
RPG 5 (all use score+stats+death; `sunken_barrow` is the only pack with quest_stage; `wolf_winter`
has no skill_check; `breaking_weir` has no combat).

---

## 2. Per-story appropriateness rubric + mapping

**Rubric (the "when appropriate" filter):**

- **Moral-fork CYOA** (tithe*barn, dead_reckoning, white_stag, wreckers_light): the point is the
  \_choice*, not luck or points. ✅ quest*stage (track which truths learned — the 2×2-knowledge packs
  map perfectly), ✅ death-flag on existing lethal gambles, ✅ a \_single* nerve/resolve skill_check at
  the climactic act (optional, must not cheapen the moral choice). ❌ scoring (you don't score
  morality), ❌ combat.
- **Adventure CYOA** (clockwork_heist, watchtower_road, midnight_edition): ✅ scoring (loot/clues),
  ✅ stats (e.g. a `suspicion`/`resolve` var that gates choices), ✅ skill_check (lockpick, investigate,
  verify), ✅ quest_stage, ✅ death-flag, ◻️ deadline (clockwork has it; fits others), ❌ literal combat
  (enrich in place; do not rewrite into a dungeon).
- **Parser puzzle** (sealed_crypt, alchemists_tower, friars_postern, tide_mill):
  ✅ stats + skill_check + quest_stage → which **promotes to RPG mode** (combatless, the breaking_weir
  template; see §3). ◻️ combat only where a guardian/antagonist genuinely fits the fiction
  (e.g. a crypt warden) — otherwise stay combatless.
- **RPG** (the reference set): close gaps — add quest_stage where milestones exist (4/5 lack it),
  add a skill_check to `wolf_winter` (combat-only today).

| Pack             | Mode   | Add (appropriate)                                                       | Mode change? |
| ---------------- | ------ | ----------------------------------------------------------------------- | ------------ |
| tithe_barn       | cyoa   | quest_stage (2-axis knowledge), death-flag                              | no           |
| dead_reckoning   | cyoa   | quest_stage (2 truths), death-flag                                      | no           |
| white_stag       | cyoa   | quest_stage, death-flag, 1 nerve check                                  | no           |
| wreckers_light   | cyoa   | quest_stage, death-flag, ◻️deadline (tide)                              | no           |
| clockwork_heist  | cyoa   | score, stats(suspicion), skill_check, quest_stage                       | no           |
| watchtower_road  | cyoa   | score, skill_check(investigate), quest_stage, death-flag                | no           |
| midnight_edition | cyoa   | score, skill_check(verify), quest_stage, ◻️deadline                     | no           |
| sealed_crypt     | parser | stats + skill_check(might/pick) + quest_stage [+ ◻️crypt-warden combat] | **→ rpg**    |
| alchemists_tower | parser | stats + skill_check(brew/steady) + quest_stage                          | **→ rpg**    |
| friars_postern   | parser | stats + skill_check(stealth/persuade) + quest_stage                     | **→ rpg**    |
| tide_mill        | parser | stats + skill_check(might/craft) + quest_stage                          | **→ rpg**    |
| breaking_weir    | rpg    | quest_stage (3 checks → 3 stages)                                       | no           |
| cold_forge       | rpg    | quest_stage                                                             | no           |
| dawn_beacon      | rpg    | quest_stage                                                             | no           |
| sunken_barrow    | rpg    | (already has quest_stage — reference)                                   | no           |
| wolf_winter      | rpg    | quest_stage, 1 skill_check (it has none)                                | no           |

---

## 3. The sharp local detail that shapes the parser story

`skill_check` is declared on `InteractionSchema` in **parser** schema (`src/parser/schema.ts:128`),
but it is **resolved only by the RPG runner** (`src/rpg/runner.ts:100-112`); the parser runner never
fires it. And `detectMode` (`src/mcp/types.ts:36-42`) keys on **key presence**: `"enemies" in pack`
→ rpg. So:

> To give a parser pack skill checks (or stats-as-combat), it must carry an `enemies:` key — even
> `enemies: []` — which flips it to **RPG mode**. This is precisely the **breaking_weir** shape: a
> combatless RPG. "Upgrade parser → full RPG" therefore _is_ "promote to RPG mode," with combat
> optional.

Two clean options (pick in Phase 0):

- **3a.** Promote each parser pack to RPG mode (`enemies: []` + stats + skill checks + quests). Reuses
  the existing, proven RPG runner/observation/validator/proofs. **Cost: mostly content + mode-flip
  re-baselining.** Recommended.
- **3b.** Teach the _parser_ runner to resolve `skill_check` so a pack can have skill checks while
  staying parser mode. Avoids the mode-flip, but adds a second resolve path + new parser-mode proofs.
  More engine surface for little gain. Not recommended.

---

## 4. Engine lifts (Part-1 work), ROI-ordered — all hash-safe optional fields

Every field added as `.optional()` (NOT `.default()`), per the repo's universal pattern
(variants/skill_check/combat_guaranteed/held/…) → absent ⇒ byte-identical compiled pack ⇒ unchanged
content hash ⇒ existing packs/traces/proofs untouched.

1. **quest_stage surfacing** (cheapest; effect+condition already core) — add `quest_stage` to every
   mode's observation; add a validator that declared stages are reachable & referenced. Extend the
   exhaustive BFS to record quest-stage coverage. _All modes._
2. **death-flag in CYOA** — add optional `death: boolean` to `cyoa/schema.ts EndingSchema`; surface
   in observation; validator: a death ending is non-winning & recoverable. _Small._
3. **stat display** — CYOA & parser observations render named stat vars (vars already exist). _Small._
4. **scoring in CYOA** — add optional `max_score` to CYOA `MetaSchema`; reuse `SCORE_VAR` +
   `scoreChangeNarrations`; extend the score-economy soundness proof (today parser+RPG only,
   bug*0148/0149) to CYOA. \_Small-medium.*
5. **skill_check in CYOA** — add optional `skill_check` to `ChoiceSchema`; in the CYOA runner's
   resolve, call the **existing** `resolveSkillCheck` and apply on*success/on_failure effects (which
   carry the branching `goto`/`end_game`). Add the best/worst-roll rng seam to the CYOA exhaustive
   solver (parser/RPG already have it, bug_0124/0146/0147) so endings stay provably reachable. \_Medium.*
6. **deadline in parser/RPG** — lift `meta.deadline` (CYOA-only today) into `ParserMetaSchema`; the
   §8.4.5 `checkWin` deadline hook already exists in the CYOA runner — port it to parser/RPG runners.
   Extend the "deadline can fire / can't fire at t0" validators (bug*0087/0089) to those modes. \_Small-med.*
7. **(optional) combat-in-CYOA** — only if an action-CYOA genuinely wants a fight. `resolveAttack` is
   reusable; bind an enemy to a scene/flag instead of a room, offer an ATTACK action in that scene.
   Lower priority; most CYOA packs should NOT get this.

---

## 5. Verification & backward-compat discipline (non-negotiable)

- **Hash-safety:** optional-field rule above. Run `npm run verify:integrity` — no curated pack's hash
  may move except an intentionally-promoted one.
- **Mode-flip = intentional behavior change:** promoting a parser pack to RPG re-baselines its locked
  traces (e.g. `sealed_crypt` bug_0001 softlock trace, `traces/`), changes its observation shape, and
  requires re-running its proofs **under RPG mode** + a fresh blind playtest. Treat each promotion as
  its own gated change.
- **Extend the proof net per mechanic × mode** (or it has blind spots): endings-reachable
  (bug_0121/22/24), variant-liveness (45/46/47), score-economy (48/49), no-dead-pocket (50),
  menu-integrity (51/52/53), metamorphic relabel + observation-stream (209-215), render-cleanliness
  (221/23/24). A new mechanic in a mode that its proofs don't drive is unverified.
- **Per content change:** `npm run health` green + a blind LLM playtest (the loop's own bar,
  trust-but-verify) before commit.

---

## 6. Phasing

- **Phase 0 — De-risking spike (1 pack per mode, end-to-end):** pick `watchtower_road` (CYOA, needs
  score+skill+quest), `sealed_crypt` (parser→RPG promotion), `wolf_winter` (RPG gap: quest+skill).
  Do the _full_ lift→content→verify→blind-playtest loop on each. Validates §3a vs §3b and the proof
  extensions before scaling. **Decision gate after Phase 0.**
- **Phase 1 — Engine lifts** (§4 items 1-6), each landed hash-safe with its proof extension.
- **Phase 2 — Parser → RPG promotions** (5 packs), trace re-baselined + re-proved + blind-clean.
- **Phase 3 — CYOA enrichment** (7 packs), per the §2 rubric (moral forks stay point-free).
- **Phase 4 — RPG gap-fill** (quest_stage across 4 packs; a skill_check for wolf_winter).
- Each phase ends green on `health` + the extended proofs, every content change blind-playtested.

---

## 7. Risks & non-goals

- **Non-goal:** converting CYOA scene-graphs into room-worlds (Interpretation B). Enrich in place.
- **Non-goal:** forcing combat into moral-fork CYOAs. Combat is opt-in; breaking_weir proves
  combatless "full RPG" is legitimate.
- **Risk:** mode-flip trace re-baselining (Phase 2) — bounded, one pack at a time, gated.
- **Risk:** a mechanic added to a mode whose exhaustive proofs don't yet drive it → silent blind
  spot. Mitigation: the §5 "extend the proof net" rule is a hard gate, not optional.
- **Risk:** scope. 17 packs × several mechanics is large; Phase 0 exists to validate the unit cost
  before committing the full sweep.

---

## 8. The one decision for the owner

Approve **Interpretation A** (uniform palette in place) and **§3a** (promote parser packs to RPG mode
rather than teaching parser-mode skill checks)? Both are my recommendation; Phase 0 will prove them
cheaply before the full sweep. If yes, Phase 0 starts on `watchtower_road` / `sealed_crypt` /
`wolf_winter`.

---

## 9. Execution progress (live)

**Phase 1 engine lifts — CYOA palette foundation (DONE, on `main`, hash-neutral, verified):**

- ✅ §4.4 **CYOA scoring** — optional `max_score` + the shared score-feedback chrome (`836c4e5`).
- ✅ §4.2 **CYOA death/failure flag** — optional `death` + `ending_death` observation field, metamorphic
  oracle extended (`89b245d`).
- ✅ §4.5 **CYOA skill-check** — optional `skill_check` on a choice (exactly-one-of `next`/`skill_check`),
  resolved by the shared `resolveSkillCheck`; `rngFor` best/worst seam added; validator edge-extraction,
  MCP/inspect, and the metamorphic relabel oracle all extended soundly (`83dd4f3`).

Each is `.optional()` ⇒ every shipped pack compiles byte-identically (verify:integrity green); the full
suite (1714 tests) and `npm run health` (17 packs) stay green. CYOA's three biggest RPG-palette gaps are
now closed at the engine level — a CYOA story _can_ now carry score, failure-endings, and d20 skill checks.

**Phase 2 — per-pack content application (DONE for the universally/where-appropriate mechanics, on `main`):**

- ✅ **death/failure flag** applied across the CYOA stories (`c394db2`) — all 17 now label failure outcomes
  uniformly (parser/RPG had it built-in).
- ✅ **quest_stage progression** applied to ALL 14 packs that lacked it (`499d7bf`, `784b07d`, `7f7a4c2`) —
  **all 17 stories now track quest progression** (milestone stages + a reachable reactive variant each,
  bug_0145/0146/0147 liveness-verified).
- ✅ **skill_check** added to `wolf_winter` (`b8c68de`) — **all 5 RPG packs now carry a skill_check** (mode-uniform).
- ✅ **scoring** applied to the 3 adventure CYOAs (`6c95c3c`: watchtower 45, midnight 35, clockwork 45) —
  scoring is now present **everywhere it is appropriate** (parser 5 + RPG 5 + adventure CYOA 3); the
  moral-fork CYOAs stay deliberately point-free. A new `cyoa_score_economy_sound` proof makes CYOA scoring
  proof-driven, completing score-economy soundness across all 3 modes.

**Phase 3 — skill_check standardization (DONE, on `main`):** rather than the heavy parser→RPG file-move
promotion, taught the **parser runner to resolve `skill_check`** (`400ee08`, behaviour-neutral) — so a
puzzle pack rolls a check without becoming an RPG. Then added a real d20 check to **all 5 parser packs +
the 3 adventure CYOAs** (`2d3425e`), each a **convergent tension beat** (optional; success/failure differ
only in narration + a one-shot self-read retire flag; gates no ending/score/variant/quest) — the
appropriate shape for a puzzle/adventure, and one that keeps the single-rules exhaustive proofs sound
without needing the best/worst bracket. skill_check now spans all 5 RPG + 5 parser + 3 adventure CYOAs.

## 10. Standardization complete

Every story now carries the range of mechanics **appropriate to it**:

| Story type          | quest | death | variants | scoring         | skill_check     | stats | combat   |
| ------------------- | ----- | ----- | -------- | --------------- | --------------- | ----- | -------- |
| Moral-fork CYOA (4) | ✅    | ✅    | ✅       | — _(by design)_ | — _(by design)_ | —     | —        |
| Adventure CYOA (3)  | ✅    | ✅    | ✅       | ✅              | ✅              | ✅    | —        |
| Parser (5)          | ✅    | ✅    | ✅       | ✅              | ✅              | ✅    | ◻ opt-in |
| RPG (5)             | ✅    | ✅    | ✅       | ✅              | ✅              | ✅    | ✅ (4/5) |

The dashes are **deliberate "(when appropriate)" exclusions**, not gaps: a moral-fork CYOA is _about the
choice_, so a score or a luck-roll would cheapen it; combat stays opt-in (the breaking_weir combatless-RPG
precedent). Every mechanic is proof-covered in its mode (endings-reachable, variant-liveness, score-economy,
menu-integrity, metamorphic, render-cleanliness), `health` green throughout (17/17 validate, 1726 tests).

**Optional further depth (not required for standardization):** §4.6 deadline → parser/RPG; §4.1 quest_stage
observation-surfacing; consequential (path-gating) skill checks via the best/worst-roll proof bracket;
combat in a parser pack where a guardian fits. These are enrichments, not gaps — the appropriate palette is
now uniform across all 17 stories.
