/**
 * Shared score-change narration chrome.
 *
 * This is derived from state-change events, not authored content: runtimes pass
 * the conventional score var they own plus the pack's maximum score, and the
 * helper emits the player-facing turn note when a real score delta occurred.
 */
import type { GameEvent } from "./events.js";

export function scoreChangeNarrations(
  events: GameEvent[],
  scoreVar: string,
  maxScore: number,
): GameEvent[] {
  if (maxScore <= 0) return [];
  const out: GameEvent[] = [];
  for (const e of events) {
    if (e.type !== "state_change") continue;
    const ev = e as Record<string, unknown>;
    if ((ev.effect !== "inc_var" && ev.effect !== "dec_var") || ev.name !== scoreVar) continue;
    const delta = ev.delta;
    // delta is 0 when a non-finite result was rejected; no real change happened.
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
