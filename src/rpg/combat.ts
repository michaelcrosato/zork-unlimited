/**
 * Deterministic combat + skill-check resolution (spec §13 Stage 4, §14).
 *
 * These produce ordinary core effects from SEEDED rolls, so the engine's pure
 * reducer applies them unchanged and the determinism contract (§8.5) holds: the
 * PRNG is derived from (state.seed, state.step), and the engine advances `step`
 * after each action, so successive rounds draw independent, replayable streams.
 * No `Math.random`, no clock. A whole fight is reproducible from its trace.
 *
 * Combat is one ATTACK = one round: the player strikes; if the enemy survives it
 * strikes back. Damage = d6 + attacker.attack − defender.defense (min 1). A
 * defeated enemy fires its `on_defeat` effects; a fallen player hits `end_game`
 * on the enemy's death ending (recoverable via an earlier save, §8.7).
 */
import { rngForStep } from "../core/rng.js";
import type { Effect } from "../core/effects.js";
import type { GameState } from "../core/state.js";
import type { Resolution } from "../core/engine.js";
import { HP_VAR, ATTACK_VAR, DEFENSE_VAR, enemyHpVar, type Enemy } from "./schema.js";

const dmg = (roll: number, atk: number, def: number): number => Math.max(1, roll + atk - def);

/** Current HP of an enemy (its full HP until combat writes the hidden var). */
export function enemyHp(state: GameState, enemy: Enemy): number {
  return state.vars[enemyHpVar(enemy.id)] ?? enemy.hp;
}

/** Is the enemy still standing? */
export function enemyAlive(state: GameState, enemy: Enemy): boolean {
  return enemyHp(state, enemy) > 0;
}

/**
 * Resolve one combat round into concrete effects. Pure: same (state, enemy) ⇒
 * same effects, because the only randomness is the (seed, step)-derived PRNG.
 */
export function resolveAttack(state: GameState, enemy: Enemy): Resolution {
  const rng = rngForStep(state.seed, state.step);
  const hpVar = enemyHpVar(enemy.id);
  const curEnemyHp = enemyHp(state, enemy);
  const playerHp = state.vars[HP_VAR] ?? 0;
  const playerAtk = state.vars[ATTACK_VAR] ?? 0;
  const playerDef = state.vars[DEFENSE_VAR] ?? 0;

  const toEnemy = dmg(rng.int(1, 6), playerAtk, enemy.defense);
  const newEnemyHp = curEnemyHp - toEnemy;
  const effects: Effect[] = [
    { set_var: { name: hpVar, value: Math.max(0, newEnemyHp) } },
    {
      narrate: `You strike ${enemy.name} for ${toEnemy} (it has ${Math.max(0, newEnemyHp)} HP left).`,
    },
  ];

  if (newEnemyHp <= 0) {
    effects.push({ narrate: `${enemy.name} falls.` });
    if (enemy.defeat_flag) effects.push({ set_flag: enemy.defeat_flag });
    effects.push(...enemy.on_defeat);
    return { conditions: [], effects };
  }

  // Enemy counterattacks (it drew the next value from the same stream → ordered).
  const toPlayer = dmg(rng.int(1, 6), enemy.attack, playerDef);
  const newPlayerHp = playerHp - toPlayer;
  effects.push(
    { set_var: { name: HP_VAR, value: Math.max(0, newPlayerHp) } },
    {
      narrate: `${enemy.name} hits you for ${toPlayer} (you have ${Math.max(0, newPlayerHp)} HP left).`,
    },
  );
  if (newPlayerHp <= 0) {
    effects.push(
      { narrate: "Your strength fails and the world goes dark." },
      { end_game: enemy.death_ending },
    );
  }
  return { conditions: [], effects };
}

/**
 * Resolve a skill check: roll d20 + the named skill var against `difficulty`.
 * Deterministic per (seed, step). Returns the success or failure effects, with a
 * narration of the roll so the player understands the outcome (§17.4, §17.8).
 */
export function resolveSkillCheck(
  state: GameState,
  check: { skill: string; difficulty: number; on_success: Effect[]; on_failure: Effect[] },
): Resolution {
  const rng = rngForStep(state.seed, state.step);
  const roll = rng.int(1, 20);
  const total = roll + (state.vars[check.skill] ?? 0);
  const success = total >= check.difficulty;
  const lead: Effect = {
    narrate: `${check.skill} check: rolled ${roll} + ${state.vars[check.skill] ?? 0} = ${total} vs ${check.difficulty} — ${success ? "success" : "failure"}.`,
  };
  return { conditions: [], effects: [lead, ...(success ? check.on_success : check.on_failure)] };
}
