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
import { enumerateActions, resolveParserAction, useInteraction, type ParserActionOption } from "../parser/legal_actions.js";
import { winningEnding } from "../parser/runner.js";
import { type RpgPack, type Enemy } from "./schema.js";
import { resolveAttack, resolveSkillCheck, enemyAlive } from "./combat.js";

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
    out.push({ id: `attack_${enemy.id}`, command: `attack ${enemy.name}`, action: { type: "ATTACK", enemy: enemy.id } });
  }
  return out;
}

export function buildRpgRules(index: RpgIndex): Rules {
  return {
    legalActions(state: GameState): Action[] {
      return enumerateRpgActions(index, state).map((o) => o.action);
    },

    resolve(state: GameState, action: Action): Resolution | null {
      if (action.type === "ATTACK") {
        const enemy = index.enemies.get(action.enemy);
        if (!enemy || enemy.room !== state.current || !enemyAlive(state, enemy)) return null;
        return resolveAttack(state, enemy);
      }
      if (action.type === "USE") {
        const it = useInteraction(index, action.target, action.item);
        if (it?.skill_check) {
          // Offer-legality still requires holding the item and meeting conditions.
          if (!state.inventory.includes(action.item)) return null;
          return resolveSkillCheck(state, it.skill_check);
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
  };
}

/** Fresh state for an RPG pack (player stats come from meta.vars_init). */
export function initStateForRpgPack(index: RpgIndex, seed: number): GameState {
  return initStateForParserPack(index, seed);
}
