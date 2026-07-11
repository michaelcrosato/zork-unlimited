/**
 * RPG runner (spec §13 Stage 4, §14) — adapts an RPG pack into the engine's pure
 * `Rules`.
 *
 * RPG owns its pack schema, indexing, fresh-state setup, command mapping, combat,
 * and skill-check resolution while preserving deterministic seeded randomness.
 */
import type { RpgAction } from "../api/types.js";
import type { Effect } from "../core/effects.js";
import type { GameState } from "../core/state.js";
import type { Resolution, Rules } from "../core/engine.js";
import {
  type RpgModelIndex,
  indexRpgModel,
  initStateForRpgModel,
  activeDialogue,
} from "./model.js";
import {
  enumerateRpgBaseActions,
  present,
  resolveRpgAction,
  useInteraction,
  type RpgActionOption,
} from "./legal_actions.js";
import { evalConditions, type Condition } from "../core/conditions.js";
import type { GameEvent } from "../core/events.js";
import { type RpgPack, type Enemy, type EnemyManeuver } from "./schema.js";
import { resolveAttack, enemyAlive } from "./combat.js";
import { resolveSkillCheck } from "../core/skill_check.js";
import { rngForRuntimeState, type RuntimeRngFor } from "./runtime_rng.js";
import { decorateRpgScoreEvents } from "./score_events.js";
import { endGameEffects } from "./terminal_effects.js";
import { maneuverActionId } from "./action_ids.js";

export type RpgIndex = RpgModelIndex & {
  enemies: Map<string, Enemy>;
  enemyByRoom: Map<string, Enemy[]>;
};

export function indexRpgPack(pack: RpgPack): RpgIndex {
  const base = indexRpgModel(pack);
  const enemies = new Map(pack.enemies.map((e) => [e.id, e]));
  const enemyByRoom = new Map<string, Enemy[]>();
  for (const e of pack.enemies) {
    const list = enemyByRoom.get(e.room) ?? [];
    list.push(e);
    enemyByRoom.set(e.room, list);
  }
  return { ...base, enemies, enemyByRoom };
}

/** A foe that is alive and whose authored state gate, if any, currently holds. */
export function enemyActive(state: GameState, enemy: Enemy): boolean {
  return enemyAlive(state, enemy) && evalConditions(enemy.conditions ?? [], state);
}

/** Active enemies standing in the player's current room. */
function enemiesHere(index: RpgIndex, state: GameState): Enemy[] {
  return (index.enemyByRoom.get(state.current) ?? []).filter((e) => enemyActive(state, e));
}

function maneuverCommitted(state: GameState, enemy: Enemy): boolean {
  return (enemy.maneuvers ?? []).some((maneuver) => state.flags[maneuver.result_flag] === true);
}

function maneuverAvailable(state: GameState, enemy: Enemy, maneuver: EnemyManeuver): boolean {
  return !maneuverCommitted(state, enemy) && evalConditions(maneuver.conditions, state);
}

function maneuverRetirementConditions(enemy: Enemy): Condition[] {
  return (enemy.maneuvers ?? []).map((maneuver) => ({ not_flag: maneuver.result_flag }));
}

function enemyManeuver(enemy: Enemy, maneuverId: string): EnemyManeuver | undefined {
  return enemy.maneuvers?.find((maneuver) => maneuver.id === maneuverId);
}

export function winningRpgEnding(index: RpgIndex, state: GameState): string | null {
  for (const wc of index.pack.win_conditions) {
    if (evalConditions(wc.conditions, state)) return wc.ending;
  }
  return null;
}

/**
 * Every legal action: the base command set plus an ATTACK per living enemy in the room
 * (offered only outside conversation). Each carries the stable id/command/action
 * shape the observation and human clients consume.
 */
export function enumerateRpgActions(index: RpgIndex, state: GameState): RpgActionOption[] {
  const out = enumerateRpgBaseActions(index, state);
  if (state.ended || activeDialogue(index, state)) return out;
  for (const enemy of enemiesHere(index, state)) {
    const maneuvers = (enemy.maneuvers ?? []).filter((maneuver) =>
      maneuverAvailable(state, enemy, maneuver),
    );
    for (const maneuver of maneuvers) {
      out.push({
        id: maneuverActionId(enemy.id, maneuver.id),
        command: maneuver.command,
        action: { type: "MANEUVER", enemy: enemy.id, maneuver: maneuver.id },
        combat: {
          attack_bonus: maneuver.attack_bonus,
          defense_bonus: maneuver.defense_bonus,
          one_shot: true,
        },
      });
    }
    // Maneuvers are opening CHOICES, not free supplementary buffs: while at
    // least one is currently available, the ordinary strike is suppressed.
    // Committing any maneuver sets its result flag, retires every opening for
    // that enemy, and restores ATTACK on the following round. If no maneuver's
    // authored conditions hold, combat remains possible through ATTACK.
    if (maneuvers.length > 0) continue;
    out.push({
      id: `attack_${enemy.id}`,
      command: `attack ${enemy.name}`,
      action: { type: "ATTACK", enemy: enemy.id },
    });
  }
  return out;
}

/**
 * `rngFor` supplies the PRNG a combat round / skill check draws from. It defaults to
 * the shared step-keyed runtime stream, so production callers pass nothing and play is
 * byte-identical. The parameter is a verification seam ONLY: the exhaustive RPG
 * ending-reachability proof builds two rule sets — one whose rng forces the player's
 * BEST rolls, one their WORST — and steps every action under both, so combat and
 * skill-check outcomes (the engine's only randomness) become enumerable rather than a
 * single seeded draw (tests/regression/rpg_all_endings_reachable.test.ts).
 */
export function buildRpgRules(
  index: RpgIndex,
  rngFor: RuntimeRngFor = rngForRuntimeState,
): Rules<RpgAction> {
  return {
    legalActions(state: GameState): RpgAction[] {
      return enumerateRpgActions(index, state).map((o) => o.action);
    },

    resolve(state: GameState, action: RpgAction): Resolution | null {
      if (action.type === "MANEUVER") {
        const enemy = index.enemies.get(action.enemy);
        const maneuver = enemy ? enemyManeuver(enemy, action.maneuver) : undefined;
        if (
          !enemy ||
          !maneuver ||
          enemy.room !== state.current ||
          !enemyActive(state, enemy) ||
          !maneuverAvailable(state, enemy, maneuver)
        ) {
          return null;
        }
        const round = resolveAttack(state, enemy, rngFor(state), {
          attackBonus: maneuver.attack_bonus,
          defenseBonus: maneuver.defense_bonus,
        });
        return {
          // Mirror maneuverAvailable's enemy-wide retirement gate in the
          // declarative resolution too: committing any sibling retires all
          // openings for this enemy.
          conditions: [...maneuver.conditions, ...maneuverRetirementConditions(enemy)],
          effects: [
            { set_flag: maneuver.result_flag },
            { narrate: maneuver.narration },
            ...round.effects,
          ],
        };
      }
      if (action.type === "ATTACK") {
        const enemy = index.enemies.get(action.enemy);
        if (!enemy || enemy.room !== state.current || !enemyActive(state, enemy)) return null;
        return resolveAttack(state, enemy, rngFor(state));
      }
      if (action.type === "USE") {
        const it = useInteraction(index, action.target, action.item, state);
        if (it?.skill_check) {
          // Offer-legality still requires holding the item AND meeting the
          // interaction's own conditions. Enforcing the conditions here — not
          // just hiding the action during enumeration — means a gate that
          // retires the check after success (e.g. a one-shot lever) cannot be
          // re-fired by a forced/stale step, so it can never re-roll and
          // narrate a contradictory failure on an already-resolved puzzle.
          if (!present(index, state, action.target)) return null;
          if (action.item !== undefined && !state.inventory.includes(action.item)) return null;
          if (!evalConditions(it.conditions, state)) return null;
          // Base `effects` fire BEFORE the roll's outcome effects — the CYOA
          // ordering (choice.effects, then on_success/on_failure), and what
          // the validator's interactionEffects has always counted as firable.
          // Dropping them made a pack whose only win gate lived in those base
          // effects validate green yet be unwinnable at runtime (regression:
          // rpg_skill_check_base_effects.test.ts).
          const roll = resolveSkillCheck(state, it.skill_check, rngFor(state));
          return { conditions: roll.conditions, effects: [...it.effects, ...roll.effects] };
        }
      }
      return resolveRpgAction(index, state, action);
    },

    onEnter(state: GameState, locationId: string): Effect[] {
      const room = index.rooms.get(locationId);
      const effects: Effect[] = room ? [...room.on_enter] : [];
      const ending = winningRpgEnding(index, state);
      if (ending) effects.push(...endGameEffects(ending));
      return effects;
    },

    // A win that turns on a deliberate non-move action (claiming the Barrow-Lord's
    // circlet) fires here, against the post-effects state, rather than on bare room
    // entry. Skipped once the game has ended.
    checkWin(state: GameState): Effect[] {
      const ending = winningRpgEnding(index, state);
      return ending ? endGameEffects(ending) : [];
    },

    // Zork-style score feedback derived from the RPG `score` var.
    decorateEvents(events: GameEvent[]): GameEvent[] {
      return decorateRpgScoreEvents(events, index.pack.meta.max_score);
    },
  };
}

/** Fresh state for an RPG pack (player stats come from meta.vars_init). */
export function initStateForRpgPack(index: RpgIndex, seed: number): GameState {
  return initStateForRpgModel(index, seed);
}
