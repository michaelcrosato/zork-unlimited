import type { GameState } from "../core/state.js";
import type { WorldBinding } from "./schema.js";

export function openingWorldText(
  world: WorldBinding | undefined,
  state: GameState,
  text: string,
): string {
  if (!world || state.step !== 0 || state.ended) return text;
  const assignment = [
    `From ${world.hub}: ${world.connection}`,
    `You enter ${world.district} as ${world.role}; your charge is to ${world.quest}.`,
  ].join("\n");
  return `${assignment}\n\n${text}`;
}
