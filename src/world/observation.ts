import type { GameState } from "../core/state.js";
import type { WorldBinding } from "./schema.js";

export function openingWorldText(
  world: WorldBinding | undefined,
  state: GameState,
  text: string,
): string {
  if (!world || state.step !== 0 || state.ended) return text;
  const assignment = [
    `You have come from ${world.hub} to ${world.district} in the role of ${world.role}.`,
    world.connection,
    `Your charge is to ${world.quest}.`,
  ].join(" ");
  return `${assignment}\n\n${text}`;
}
