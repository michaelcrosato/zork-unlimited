# Current plan (rolling)

This is the AFK loop's **living plan** — the hand-off document for the
saturation-triggered ultraplan (see [`docs/afk_loop.md`](./afk_loop.md)). When the
deterministic assessor runs dry (`isSaturated`), an ultraplan cycle re-aims the
project, **overwrites this file** with the synthesis + the single chosen next move,
and a fresh implementation subagent reads _only_ this file (plus the files it names)
to do the work.

---

## Ultraplan synthesis — 2026-06-03 (re-aim cycle #3)

Produced by a bounded local ultraplan (4 repo reviewers — engine/determinism ·
content/authoring · verification&benchmark · loop/strategy — + 2 web researchers →
1 synthesis), grounded in [`docs/ULTRAPLAN-2026-06-02.md`](./ULTRAPLAN-2026-06-02.md)
and [`docs/ROADMAP.md`](./ROADMAP.md), and verified against the live tree. It
**advances** the strategic layer; it does not restart it.

The prior re-aim cycles' chosen moves have all shipped: held-out corpus persistence
(bug_0163/0165), generator program under the integrity guard (bug_0167), and the
**generator-deepening arc across all three modes** — parser depth-2 chain (bug_0168),
CYOA two-axis 2×2 moral fork (bug_0169), RPG two-fight gauntlet (bug_0171). The
content backlog is blind-saturated (10 packs clean) and the deterministic assessor
sits at its 0.5 floor by construction. This cycle picks the next de-bundled
structural slice.

## Where the project stands (verified this cycle)

- **The RPG combat validator has a known, live soundness blind spot.** `validateRpg`
  (`src/validate/rpg_validator.ts:148-225`) proves combat winnability **per-fight,
  each against the player's FULL reachable HP**: a lower `COMBAT_UNWINNABLE` bound
  (best-case rolls, lines 185-197) and, when a pack opts in with
  `meta.combat_guaranteed`, an upper `COMBAT_NOT_GUARANTEED` bound (worst-case rolls,
  lines 210-224, `maxDamageTaken = maxEnemyDmg * (worstRoundsToKill - 1)`). Neither
  threads HP **cumulatively** across sequential fights. So two fights that each pass
  the upper bound alone can still kill a best-prepared player **jointly**.
- **The just-shipped two-fight gauntlet relies on this blind spot staying open.**
  `src/gen/rpg_generator.ts` (v2, bug_0171) deliberately does **NOT** set
  `meta.combat_guaranteed` — its own docstring (≈lines 38-39, 633-634) says two
  "guaranteed" fights "could still drain a best-prepared player on worst cumulative
  rolls," so it leaves both fights as declared gambles. That is correct today only
  *because* the validator cannot audit a multi-fight guarantee. bug_0171's own
  "next suggested focus" named this exact check: *"make `validateRpg`'s combat bound
  CUMULATIVE across multiple fights … the genuinely next-harder check."*
- **Quantified witness** (against the live `max(1, d6 + atk − def)` math in
  `src/rpg/combat.ts:35`): player hp20/atk6/def4, two sequential gated enemies each
  hp13/atk5/def2. Per fight: worst player dmg `max(1,1+6−2)=5` → `ceil(13/5)=3`
  rounds → enemy retaliates 2× at `max(1,6+5−4)=7` → `maxDamageTaken = 14 < 20`
  (passes per-fight). Cumulative: `14 + 14 = 28 ≥ 20` (the guarantee is false across
  the gauntlet).
- **The held-out-vs-curated DELTA metric (lever a) is information-free this cycle.**
  The only offline agent is the deterministic bot (0% on parser/RPG; byte-identical
  hidden==shown CYOA rows), so a delta would measure generator difficulty, not
  contamination. The benchmark-inflation literature (Retro-Holdouts / 2410.09247,
  LiveBench, AntiLeakBench) is unanimous: a held-out delta is undefined without a
  capable contamination-exposed agent scoring both arms — which is gated on the
  owner API key and out of scope. Deferred, not chosen.
- **Curated packs are single-enemy.** `cold_forge` and `sunken_barrow` each have one
  enemy, so the cumulative sum equals the existing single term — they are provably
  **unaffected** (no hash re-pin). The committed corpus generator does **not** set
  `combat_guaranteed`, so no minted pack's verdict changes (no `generator_version`
  bump, no re-seal).

**Why this move wins this cycle.** Both web researchers and all four reviewers
converge on lever (b) and reject lever (a). For *this* benchmark class the
literature (BALROG ICLR'25, TALES, SoundnessBench) treats **verifier soundness** —
procedurally-fresh instances *paired with a soundness-proving verifier* — as the
load-bearing, most-citable property; the reward-hacking literature (arXiv 2510.14253
which this repo already cites, EvilGenie 2511.21654) names a *present-but-incomplete
checker* as the canonical exploit surface and a deepening-generator + frozen-verifier
config as the reward-hacking trigger — exactly this repo's state. Closing a live
verifier soundness hole is strictly higher-credibility, offline, than adding a
reporting metric that has no signal yet. The fix is purely **additive**, **strengthens**
the bar (lowers no `MIN_*`/`GEN_EVAL_CHECK_COUNT` floor, relaxes no matcher), is
S-effort and surgical, key-free/deterministic, and regresses zero curated content.

---

## Chosen move: CUMULATIVE-HP-AWARE RPG COMBAT GUARANTEE

Make `validateRpg`'s **opt-in** `combat_guaranteed` (upper) bound cumulative-HP-aware
across a multi-fight gauntlet: sum each enemy's existing worst-case `maxDamageTaken`
across all enemies and fire a new `COMBAT_GAUNTLET_NOT_GUARANTEED` error when the
running total `>= playerHp`, even when every individual fight clears the per-fight
bound. This turns *"every guaranteed-fair RPG must prove its fights JOINTLY
survivable, not just individually"* into a declared, audited, **sound** property.

### CRITICAL direction (do not get this wrong)

Make the **UPPER / guarantee** bound cumulative, **NOT** the lower
`COMBAT_UNWINNABLE` bound. The lower bound is a route-**existence** proof (*some*
roll sequence wins); summing it across fights would be **unsound** — it would forbid
a legitimate gamble gauntlet that a lucky player CAN clear, over-flagging deliberate
design. Only the opt-in safety **promise** legitimately must hold across the whole
sequence. The cumulative sum is an order-independent over-approximation (sums every
enemy's worst case, ignoring fight order and optional/mutually-exclusive enemies):
correct-conservative for a SAFETY promise because it can only **refuse** an unsafe
guarantee, never falsely grant one. It must NOT be "tightened" into the lower bound.

### What (numbered concrete steps)

1. **Read first** `src/validate/rpg_validator.ts:144-225` and `src/rpg/combat.ts:35-107`
   to confirm the combat math (player strikes first; damage `= max(1, d6 + atk − def)`;
   enemy retaliates only on rounds it survives, i.e. `roundsToKill − 1`).
2. In `validateRpg`, **before** the `for (const enemy of pack.enemies)` loop (≈line
   149), declare `let cumulativeWorstDamage = 0;` (only meaningful when
   `pack.meta.combat_guaranteed`).
3. **Inside** the existing `if (pack.meta.combat_guaranteed)` block (lines 210-224),
   after `maxDamageTaken` is computed (line 214), add
   `cumulativeWorstDamage += maxDamageTaken;`. **Leave the existing per-fight
   `COMBAT_NOT_GUARANTEED` finding (215-223) UNCHANGED.**
4. **After** the per-enemy loop closes (after line 225), add:
   `if (pack.meta.combat_guaranteed && cumulativeWorstDamage >= playerHp)` →
   `findings.push(err("COMBAT_GAUNTLET_NOT_GUARANTEED", <message naming
   cumulativeWorstDamage vs playerHp and stating the promise is broken across the
   gauntlet even though each fight passes alone>, ["meta:combat_guaranteed"]));`.
   Add a code comment stating it is an order-independent, guarantee-direction-only
   over-approximation that can only refuse an unsafe guarantee — and must NOT be
   moved/tightened into the lower bound or it becomes unsound.
5. **Do NOT** modify the `COMBAT_UNWINNABLE` lower bound (185-197), **do NOT** add a
   cumulative term to it, **do NOT** touch `combat.ts`, and **do NOT** lower any
   `MIN_*` floor, `GEN_EVAL_CHECK_COUNT`, `PROTECTED_FILES`/`HASH_PIN_FILES` entry,
   or relax any matcher.
6. Add regression cases to `tests/regression/rpg_combat_guaranteed_optin.test.ts`
   (a new `describe` block; keep ALL existing tests unchanged and passing). Follow
   the worked-arithmetic style of the existing bug_0114 comments (≈lines 88-119) and
   **recompute every expected number against the live `max(1, d6 ± …)` math.** Pin:
   - **WITNESS:** a two-enemy `combat_guaranteed` pack (player hp20/atk6/def4, two
     enemies each hp13/atk5/def2) does NOT trip the per-fight `COMBAT_NOT_GUARANTEED`
     (each fight 14<20) but DOES trip the new `COMBAT_GAUNTLET_NOT_GUARANTEED`
     (28≥20).
   - **Fair gauntlet:** a genuinely-fair two-fight `combat_guaranteed` gauntlet (e.g.
     high player def so each fight's worst `maxDamageTaken` is tiny and the sum stays
     `< HP`) trips NEITHER code.
   - **Single-fight monotonicity:** for any single-enemy pack, the new code fires
     **iff** the per-fight `COMBAT_NOT_GUARANTEED` fires (cumulative == single term) —
     pin both a single-fight pack that trips both, and a single-fight fair pack that
     trips neither (so curated cold_forge/sunken_barrow are unaffected).
   - **`>=` boundary:** cumulative sum `== playerHp` fires; `== playerHp − 1` is clean
     (mirror bug_0114's boundary discipline).
7. Write `traces/bugs/bug_0172_rpg_cumulative_combat_winnability.yaml` in the
   bug_0171 artifact format (id, title, kind: engine, mode/meta, severity:
   enhancement, layer: validator, `artifact.source: src/validate/rpg_validator.ts`,
   `artifact.test: tests/regression/rpg_combat_guaranteed_optin.test.ts`, summary +
   root_cause + fix + regression). Cite the witness and that it is the
   genuinely-next-harder VALIDATOR-deepening check bug_0171 named; note curated packs
   are single-enemy so unaffected; note the protected-file `VERIFIER_TOUCHED` is
   expected and this is a strengthening, not a `GUARD_WEAKENED`.
8. Verify: `npx vitest run tests/regression/rpg_combat_guaranteed_optin.test.ts
   tests/unit/rpg_validator.test.ts` green, then `npm run health` fully green.

### Exact files

- `src/validate/rpg_validator.ts` — ADD the cumulative accumulator + the new
  post-loop `COMBAT_GAUNTLET_NOT_GUARANTEED` finding + the do-not-tighten comment.
  Per-fight lower and upper bounds stay byte-for-byte as-is. (This file is in
  `PROTECTED_FILES` — the edit surfaces an expected, non-blocking `VERIFIER_TOUCHED`
  warning; that is allowed. A `GUARD_WEAKENED` is forbidden.)
- `tests/regression/rpg_combat_guaranteed_optin.test.ts` — ADD the cumulative-gauntlet
  `describe` block (witness, fair gauntlet, single-fight monotonicity, `>=` boundary).
- `traces/bugs/bug_0172_rpg_cumulative_combat_winnability.yaml` — NEW artifact.

### Acceptance check (concrete, verifiable)

- `npm run health` is fully GREEN; the only `verify:integrity` output is a
  non-blocking `VERIFIER_TOUCHED` for `src/validate/rpg_validator.ts` — **NO
  `GUARD_WEAKENED`**, no floor/matcher change, and **no change to
  `tests/unit/rpg_validator.test.ts` pinned content hashes** (curated packs are
  single-enemy and survive cumulatively).
- The new regression proves the WITNESS (two-fight guaranteed pack passes per-fight
  14<20 but trips `COMBAT_GAUNTLET_NOT_GUARANTEED` at 28≥20) and that a genuinely-fair
  two-fight guaranteed gauntlet trips NEITHER.
- Single-fight monotonicity is pinned (new code fires iff the per-fight code fires for
  single-enemy packs), so curated `cold_forge`/`sunken_barrow` and all single-enemy
  fixtures are unaffected.
- The `>=` boundary is pinned (sum `== playerHp` fires; `== playerHp − 1` clean).
- The committed held-out corpus and the generator are UNTOUCHED — no
  `generator_version` bump, no re-seal; `held_out_corpus_sealed.test.ts` stays green.
- Net test-case count RISES (new tests), so the guard's count-regression checks stay
  satisfied.
- `traces/bugs/bug_0172_rpg_cumulative_combat_winnability.yaml` exists in the
  bug_0171 format.

---

## Hard constraints (every cycle)

- **Never weaken a check.** No edits to any `PROTECTED_FILES` semantics that lower a
  gate, no lowering of `MIN_*` floors or `GEN_EVAL_CHECK_COUNT`, no relaxing of
  matchers. This cycle only ADDS a stronger error code.
- **One focused change.** The validator soundness fix only. Do NOT re-tune the
  generator, do NOT bump `generator_version`, do NOT re-seal the corpus, do NOT touch
  the scorecard or `combat.ts` this cycle.
- **Key-free / offline / deterministic.** No outbound model calls; no wall-clock; no
  nondeterministic RNG.
- **Do NOT commit** `ai-runs/`, `node_modules/`, `dist/`, `coverage/`, or
  `saves/*.json`.

---

## Rejected alternatives (this cycle)

- **(a) Held-out-vs-curated DELTA metric in `renderMarkdown`** — information-free
  key-free: the only offline agent is the deterministic bot (0% parser/RPG,
  byte-identical hidden==shown CYOA rows), so the delta measures generator difficulty,
  not contamination; the literature (2410.09247, LiveBench, AntiLeakBench) says a
  held-out delta is undefined without a capable contamination-exposed agent scoring
  both arms — gated on the owner API key. Shipping it now risks a misleading all-floor
  metric. Defer to the post-keyed-run cycle.
- **Make the `COMBAT_UNWINNABLE` LOWER bound cumulative** — UNSOUND. It is a
  route-existence proof; summing it would forbid a legitimate gamble gauntlet a lucky
  player can clear. Only the opt-in upper/guarantee bound legitimately holds across
  the sequence (confirmed by the generator's own docstring).
- **Re-tune the RPG generator so the gauntlet SOUNDLY sets `combat_guaranteed`** —
  real value and the right NEXT cycle, but it couples a validator deepening with a
  distribution change (touches a PROTECTED generator, forces a `generator_version`
  bump + corpus re-seal, risks over-tuning fights to triviality). Larger blast radius;
  violates one-focused-change. Sequence AFTER this lands.
- **Refresh + freshness-pin the committed scorecard** (`traces/benchmark/scorecard.*`,
  stale since bug_0165) — a clean, low-risk win, but reporting hygiene, not a
  bar-strengthening structural move. Strong candidate for a NEXT cycle.
- **Corpus growth / route MockAuthor through generators** — pure breadth or negative
  value (the mock exists to exercise the revise loop; generators emit validator-clean
  packs by construction, destroying that coverage).
- **Guard `corpus/manifest.json` against silent deletion** — a legitimate low-effort
  tightening but does not strengthen a correctness oracle against the harder
  distribution. Park as an optional small follow-up.
- **The keyed real-model author→play→fix→lock run** — highest-value overall, but
  GATED on owner API-key authorization; out of scope for an autonomous, key-free cycle.

---

## Deferred to next cycle (explicit)

After the cumulative bound lands: **re-tune the RPG generator so its two-fight
gauntlet SOUNDLY sets `meta.combat_guaranteed: true`** (behind a `generator_version`
bump + corpus re-seal), making every RPG mint exercise the new cumulative upper bound
as a *green* case — turning the validator's hardest check into a per-mint obligation
rather than a frozen target (optionally paired with a validator-independent exhaustive
cumulative-survival cross-check in `tests/regression/support/exhaustive_endings.ts`).
Then: the DELTA metric + scorecard refresh (load-bearing once a keyed agent row
exists); the keyed real-model run (gated on API key); optional trust tightening
(add `corpus/manifest.json` to `PROTECTED_FILES`).
