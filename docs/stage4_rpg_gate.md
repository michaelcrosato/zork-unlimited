# Stage 4 — Hero's-Quest RPG: engine-extension record (historical process)

> **Process note (trust, but verify — see `AGENTS.md`).** The §14 _human-approval
> ceremony_ is gone: new mechanics no longer need this six-item bundle reviewed
> before they land. But the _verification_ parts it relied on are still in force —
> unit + scenario tests, determinism, and backward-compat trace replay must stay
> green. So: add mechanics freely; just keep them verified. This doc is kept as a
> record of how the Stage-4 RPG mechanics were built.

This document records the Stage-4 mechanics. (It was originally the §14 gate
record, which required every engine extension to ship with all six items below.)

## 1. Mechanic spec (states, transitions, edge cases)

Two mechanics are added, both built on the existing unified state model (§6) — no
new state shape, only new vars and a new action.

### Character stats

Player stats are plain numeric `vars`, seeded from `meta.vars_init`:
`hp`, `attack`, `defense`, plus any skill vars (e.g. `might`). They are visible in
observations like any other var. No new mechanic — reuses the var DSL (§7.1).

### Turn-based combat (seeded)

- **Action:** `ATTACK { enemy }` (added to the closed Action set via this gate).
- **One ATTACK = one round.** Player strikes first; if the enemy survives, it
  strikes back. Damage = `d6 + attacker.attack − defender.defense`, floored at 1.
- **Randomness:** the d6 rolls come from `rngForStep(state.seed, state.step)`. The
  engine advances `step` after every action, so each round draws an independent,
  reproducible stream. No `Math.random`, no clock — the determinism contract
  (§8.5) holds and a whole fight replays from its trace.
- **Enemy HP** lives in a hidden var `__enemy_hp_<id>` (so it never leaks into the
  player-facing observation, matching the `__` convention used for dialogue).
- **Transitions / edge cases:**
  - enemy HP ≤ 0 → enemy defeated: set `defeat_flag`, fire `on_defeat` effects; no
    counterattack on the killing blow.
  - player HP ≤ 0 → `end_game(enemy.death_ending)` (a declared _death_ ending,
    recoverable via an earlier save, §8.7).
  - a defeated enemy is removed from the legal-action set (no ATTACK offered);
    `ATTACK` on an absent/dead enemy resolves to `null` (illegal).
  - ATTACK is not offered mid-conversation.

### Seeded skill checks

- Attached to an object `USE` interaction via an optional `skill_check`.
- **Resolution:** roll `d20 + vars[skill]` vs `difficulty`; apply `on_success` or
  `on_failure`. Deterministic per `(seed, step)`.
- **Edge cases:** the check is offered only while the player holds the item and the
  interaction's conditions hold; on failure the player may retry (each retry is a
  fresh step → fresh roll). The validator guarantees the check is _passable_.

### Quest stages

- New core effect `set_quest_stage { quest, stage }` and condition `quest_stage`,
  reusing the `questStage` field already in `GameState` (§6). Deterministic.

## 2. Schema update

- `src/core/effects.ts`: `set_quest_stage`. `src/core/conditions.ts`: `quest_stage`.
- `src/api/types.ts`: `ATTACK` action.
- `src/parser/schema.ts`: optional `skill_check` on `InteractionSchema`
  (**optional, no default** ⇒ existing parser packs are byte-identical).
- `src/rpg/schema.ts`: `EnemySchema` + `RpgPackSchema` (parser pack + `enemies`).

## 3. Unit tests for the new mechanic

`tests/unit/rpg.test.ts` — quest-stage DSL purity/semantics; combat determinism
and full-fight reproducibility; skill-check determinism and passability.

## 4. Scenario test in a real pack

`tests/acceptance/stage4_barrow.test.ts` — an AI completes
`content/rpg/pack/sunken_barrow.yaml` via the structured legal-action API
(fight + skill check + quest-stage gate), and a death is shown recoverable from a
save.

## 5. Backward-compatibility check

`tests/unit/rpg_validator.test.ts` asserts the existing parser packs still
validate green and the CYOA pack's **content hash is unchanged**
(`df85b4f…e92fef`). The full property/determinism suite (`tests/property/`) and
every Stage 0–3 test remain green: 158 tests pass.

## 6. Fresh playtest trace using the new mechanic

`traces/rpg/barrow_victory.json` — a recorded victory run exercising combat and
the skill check. `tests/regression/rpg_barrow_trace.test.ts` replays it to its
recorded final hash and runs forever (§15).

## Validator additions (§10, Stage 4)

`src/validate/rpg_validator.ts` runs the full parser validator (feeding it the
flags/items combat and skill checks provide) and then checks: player has
HP/attack/defense (HP > 0); every enemy stands in a real room and names a declared
_death_ ending; every fight is **winnable**; every skill check is **passable**;
RPG-only `end_game` targets are declared. Negative fixture:
`content/broken-fixtures/rpg_unwinnable.yaml` → `COMBAT_UNWINNABLE`.
