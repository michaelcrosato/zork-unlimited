/**
 * RPG runner (spec §13 Stage 4, §14) — adapts an RPG pack into the engine's pure
 * `Rules`, layered on the Stage-2 parser runner.
 *
 * It reuses the parser's legal-action generator and resolver for everything the
 * parser already does (move/look/take/open/use/talk…), and adds exactly two
 * mechanics: ATTACK (a seeded combat round, combat.ts) and skill-check USE
 * interactions (a seeded d20 check). The engine stays content-free; all RPG
 * randomness is confined to the resolver and derived from (seed, step), so the
 * determinism contract is preserved (§8.5).
 */
import type { Action } from "../api/types.js";
import type { Effect } from "../core/effects.js";
import type { GameState } from "../core/state.js";
import type { Resolution, Rules } from "../core/engine.js";
import {
  type ParserIndex,
  indexParserPack,
  initStateForParserPack,
  activeDialogue,
} from "../parser/model.js";
import {
  enumerateActions,
  present,
  resolveParserAction,
  useInteraction,
  type ParserActionOption,
} from "../parser/legal_actions.js";
import { evalConditions } from "../core/conditions.js";
import type { GameEvent } from "../core/events.js";
import { winningEnding, scoreChangeNarrations } from "../parser/runner.js";
import { type RpgPack, type Enemy } from "./schema.js";
import { resolveAttack, resolveSkillCheck, enemyAlive } from "./combat.js";
import { rngForStep, type Rng } from "../core/rng.js";

export type RpgIndex = ParserIndex & {
  rpgPack: RpgPack;
  enemies: Map<string, Enemy>;
  enemyByRoom: Map<string, Enemy[]>;
};

export function indexRpgPack(pack: RpgPack): RpgIndex {
  const base = indexParserPack(pack);
  const enemies = new Map(pack.enemies.map((e) => [e.id, e]));
  const enemyByRoom = new Map<string, Enemy[]>();
  for (const e of pack.enemies) {
    const list = enemyByRoom.get(e.room) ?? [];
    list.push(e);
    enemyByRoom.set(e.room, list);
  }
  return { ...base, rpgPack: pack, enemies, enemyByRoom };
}

/** Living enemies standing in the player's current room. */
function enemiesHere(index: RpgIndex, state: GameState): Enemy[] {
  return (index.enemyByRoom.get(state.current) ?? []).filter((e) => enemyAlive(state, e));
}

/**
 * Every legal action: the parser set plus an ATTACK per living enemy in the room
 * (offered only outside conversation). Each carries the stable id/command/action
 * shape the observation and human parser consume.
 */
export function enumerateRpgActions(index: RpgIndex, state: GameState): ParserActionOption[] {
  const out = enumerateActions(index, state);
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
      if (action.type === "ATTACK") {
        const enemy = index.enemies.get(action.enemy);
        if (!enemy || enemy.room !== state.current || !enemyAlive(state, enemy)) return null;
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
      return resolveParserAction(index, state, action);
    },

    onEnter(state: GameState, locationId: string): Effect[] {
      const room = index.rooms.get(locationId);
      const effects: Effect[] = room ? [...room.on_enter] : [];
      const ending = winningEnding(index, state);
      if (ending) effects.push({ end_game: ending });
      return effects;
    },

    // Mirrors the parser runner: a win that turns on a deliberate non-move action
    // (claiming the Barrow-Lord's circlet) fires here, against the post-effects
    // state, rather than on bare room entry. Skipped once the game has ended.
    checkWin(state: GameState): Effect[] {
      const ending = winningEnding(index, state);
      return ending ? [{ end_game: ending }] : [];
    },

    // Same Zork-style score feedback the parser runner emits — RPG packs track score
    // through the conventional `score` var too (§13 Stage 4 awards), so a +N here
    // (e.g. claiming the relic) gets the player-facing "[Your score has gone up…]" line.
    decorateEvents(events: GameEvent[]): GameEvent[] {
      return scoreChangeNarrations(events, index.pack.meta.max_score ?? 0);
    },
  };
}

/** Fresh state for an RPG pack (player stats come from meta.vars_init). */
export function initStateForRpgPack(index: RpgIndex, seed: number): GameState {
  return initStateForParserPack(index, seed);
}
