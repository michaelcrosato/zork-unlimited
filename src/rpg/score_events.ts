import type { GameEvent } from "../core/events.js";
import { scoreChangeNarrations } from "../core/score_chrome.js";
import { SCORE_VAR } from "./schema.js";

export function decorateRpgScoreEvents(
  events: GameEvent[],
  maxScore: number | undefined,
): GameEvent[] {
  return scoreChangeNarrations(events, SCORE_VAR, maxScore ?? 0);
}
