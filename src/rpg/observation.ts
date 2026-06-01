/**
 * RPG observation (spec §9.2, §13 Stage 4). The parser observation plus the
 * enemies standing here and the player's vital stats, and an action list that
 * includes ATTACK. No engine internals leak; hidden `__` vars (enemy HP) stay
 * out, exactly as in the parser view.
 */
import type { GameState } from "../core/state.js";
import type { Action } from "../api/types.js";
import { buildParserObservation, type ParserObservation } from "../parser/observation.js";
import { HP_VAR, ATTACK_VAR, DEFENSE_VAR } from "./schema.js";
import { type RpgIndex, enumerateRpgActions } from "./runner.js";
import { enemyHp, enemyAlive } from "./combat.js";

// RPG observation reuses the parser shape but MUST carry its own `mode` so it is
// a real discriminator: an RPG pack is a parser pack + enemies, so without this
// override every consumer would see mode:"parser" and dispatch the wrong runner
// (see docs/ROADMAP.md item 1a-0). Omit the inherited literal and redeclare it.
export type RpgObservation = Omit<ParserObservation, "mode" | "available_actions"> & {
  mode: "rpg";
  enemies_present: { id: string; name: string; hp: number }[];
  stats: { hp: number; attack: number; defense: number };
  available_actions: { id: string; command: string; action: Action }[];
};

export function buildRpgObservation(index: RpgIndex, state: GameState): RpgObservation {
  const base = buildParserObservation(index, state);
  const enemies = (index.enemyByRoom.get(state.current) ?? [])
    .filter((e) => enemyAlive(state, e))
    .map((e) => ({ id: e.id, name: e.name, hp: enemyHp(state, e) }));
  return {
    ...base,
    mode: "rpg",
    enemies_present: enemies,
    stats: {
      hp: state.vars[HP_VAR] ?? 0,
      attack: state.vars[ATTACK_VAR] ?? 0,
      defense: state.vars[DEFENSE_VAR] ?? 0,
    },
    available_actions: enumerateRpgActions(index, state).map((o) => ({
      id: o.id,
      command: o.command,
      action: o.action,
    })),
  };
}
