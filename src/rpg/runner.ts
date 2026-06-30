/**
 * RPG runner (spec §13 Stage 4, §14) — adapts an RPG pack into the engine's pure
 * `Rules`.
 *
 * RPG owns its pack schema, indexing, fresh-state setup, command mapping, combat,
 * and skill-check resolution while preserving deterministic seeded randomness.
 */
import { isRpgAction, type Action } from "../api/types.js";
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
import { evalConditions } from "../core/conditions.js";
import type { GameEvent } from "../core/events.js";
import { type RpgPack, type Enemy, SCORE_VAR } from "./schema.js";
import { resolveAttack, resolveSkillCheck, enemyAlive } from "./combat.js";
import { rngForStep, type Rng } from "../core/rng.js";

export type RpgIndex = RpgModelIndex & {
  rpgPack: RpgPack;
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
  return { ...base, rpgPack: pack, enemies, enemyByRoom };
}

/** A foe that is alive and whose authored state gate, if any, currently holds. */
export function enemyActive(state: GameState, enemy: Enemy): boolean {
  return enemyAlive(state, enemy) && evalConditions(enemy.conditions ?? [], state);
}

/** Active enemies standing in the player's current room. */
function enemiesHere(index: RpgIndex, state: GameState): Enemy[] {
  return (index.enemyByRoom.get(state.current) ?? []).filter((e) => enemyActive(state, e));
}

function winningRpgEnding(index: RpgIndex, state: GameState): string | null {
  for (const wc of index.pack.win_conditions) {
    if (evalConditions(wc.conditions, state)) return wc.ending;
  }
  return null;
}

function rpgScoreChangeNarrations(events: GameEvent[], maxScore: number): GameEvent[] {
  if (maxScore <= 0) return [];
  const out: GameEvent[] = [];
  for (const e of events) {
    if (e.type !== "state_change") continue;
    const ev = e as Record<string, unknown>;
    if ((ev.effect !== "inc_var" && ev.effect !== "dec_var") || ev.name !== SCORE_VAR) continue;
    const delta = ev.delta;
    if (typeof delta !== "number" || delta === 0) continue;
    const total = typeof ev.value === "number" ? ev.value : 0;
    const mag = Math.abs(delta);
    const dir = delta > 0 ? "gone up" : "gone down";
    const pts = mag === 1 ? "point" : "points";
    out.push({
      type: "narration",
      text: `[Your score has ${dir} by ${mag} ${pts}; it is now ${total} of ${maxScore}.]`,
    });
  }
  return out;
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
 * the step-keyed stream (core/rng.ts), so production callers pass nothing and play is
 * byte-identical. The parameter is a verification seam ONLY: the exhaustive RPG
 * ending-reachability proof builds two rule sets — one whose rng forces the player's
 * BEST rolls, one their WORST — and steps every action under both, so combat and
 * skill-check outcomes (the engine's only randomness) become enumerable rather than a
 * single seeded draw (tests/regression/rpg_all_endings_reachable.test.ts).
 */
export function buildRpgRules(
  index: RpgIndex,
  rngFor: (state: GameState) => Rng = (s) => rngForStep(s.seed, s.step),
): Rules {
  return {
    legalActions(state: GameState): Action[] {
      return enumerateRpgActions(index, state).map((o) => o.action);
    },

    resolve(state: GameState, action: Action): Resolution | null {
      if (!isRpgAction(action)) return null;
      if (action.type === "ATTACK") {
        const enemy = index.enemies.get(action.enemy);
        if (!enemy || enemy.room !== state.current || !enemyActive(state, enemy)) return null;
        return resolveAttack(state, enemy, rngFor(state));
      }
      if (action.type === "USE") {
        const it = useInteraction(index, action.target, action.item);
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
          return resolveSkillCheck(state, it.skill_check, rngFor(state));
        }
      }
      return resolveRpgAction(index, state, action);
    },

    onEnter(state: GameState, locationId: string): Effect[] {
      const room = index.rooms.get(locationId);
      const effects: Effect[] = room ? [...room.on_enter] : [];
      const ending = winningRpgEnding(index, state);
      if (ending) effects.push({ end_game: ending });
      return effects;
    },

    // A win that turns on a deliberate non-move action (claiming the Barrow-Lord's
    // circlet) fires here, against the post-effects state, rather than on bare room
    // entry. Skipped once the game has ended.
    checkWin(state: GameState): Effect[] {
      const ending = winningRpgEnding(index, state);
      return ending ? [{ end_game: ending }] : [];
    },

    // Zork-style score feedback derived from the RPG `score` var.
    decorateEvents(events: GameEvent[]): GameEvent[] {
      return rpgScoreChangeNarrations(events, index.pack.meta.max_score ?? 0);
    },
  };
}

/** Fresh state for an RPG pack (player stats come from meta.vars_init). */
export function initStateForRpgPack(index: RpgIndex, seed: number): GameState {
  return initStateForRpgModel(index, seed);
}
