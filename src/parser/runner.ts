/**
 * Parser runner (spec §8.4, §9.2) — adapts a validated parser pack into the
 * engine's `Rules` resolver. The engine stays content-free (§3): it asks this
 * resolver for the legal-action set and for what an action means, and fires
 * `onEnter` on room transitions.
 *
 * Win conditions are evaluated in two complementary places against the same
 * `winningEnding` predicate, so a pack can trigger its ending on whichever beat is
 * dramatically right:
 *   - `onEnter` — on room entry, the common "reach room / visited X" trigger
 *     (e.g. §7.3's `{ visited: catacombs }`).
 *   - `checkWin` — after ANY action's effects, even with no move, for a win that
 *     turns on a deliberate non-move action: taking the goal item, administering a
 *     cure. A pack expresses this by adding the act's post-condition to the win
 *     (e.g. `{ has_item: circlet }` alongside `{ visited: relic_chamber }`), so the
 *     ending fires on the climactic TAKE instead of on bare room entry. The engine
 *     skips `checkWin` once the game has ended, so the two paths never double-fire.
 */
import { evalConditions } from "../core/conditions.js";
import type { Effect } from "../core/effects.js";
import type { Action } from "../api/types.js";
import type { GameState } from "../core/state.js";
import type { GameEvent } from "../core/events.js";
import type { Resolution, Rules } from "../core/engine.js";
import { rngForStep, type Rng } from "../core/rng.js";
import { type ParserIndex } from "./model.js";
import { enumerateActions, present, resolveParserAction, useInteraction } from "./legal_actions.js";
import { resolveSkillCheck } from "../rpg/combat.js";
import { SCORE_VAR } from "./schema.js";

export { indexParserPack, initStateForParserPack, type ParserIndex } from "./model.js";

/** First win condition satisfied in `state`, if any (§7.3 win_conditions). */
export function winningEnding(index: ParserIndex, state: GameState): string | null {
  for (const wc of index.pack.win_conditions) {
    if (evalConditions(wc.conditions, state)) return wc.ending;
  }
  return null;
}

/**
 * Zork-style score feedback (§13 Stage 3) — the player-facing narrator for a score
 * change. bug_0060 added a signed `delta` to `score` inc_var/dec_var events *so that*
 * a narrator could surface "points just earned"; this is that narrator. For each
 * score-var change in a step's events it emits one narration line — the classic
 * "[Your score has gone up by N points; it is now M of T.]" — so a first-time player
 * SEES the award land instead of watching the HUD number jump unexplained (the lone
 * concrete finding of the sealed_crypt blind playtest, ai-runs/2026-06-02T09-21-43-791Z).
 *
 * Engine chrome, not content: it is derived generically from the conventional `score`
 * var and `meta.max_score`, so every parser/rpg pack that tracks score gets the feedback
 * with no per-pack authoring (the same pattern as observation.ts's "Final score: X of Y."
 * ending closure). Packs that don't track score (max_score 0 — e.g. CYOA) get nothing.
 * Authored `narrate` text on the same effect is untouched; the score line is appended
 * after it, mirroring how Zork prints the score note at the end of the turn.
 */
export function scoreChangeNarrations(events: GameEvent[], maxScore: number): GameEvent[] {
  if (maxScore <= 0) return [];
  const out: GameEvent[] = [];
  for (const e of events) {
    if (e.type !== "state_change") continue;
    const ev = e as Record<string, unknown>;
    if ((ev.effect !== "inc_var" && ev.effect !== "dec_var") || ev.name !== SCORE_VAR) continue;
    const delta = ev.delta;
    // delta is 0 when a non-finite result was rejected (the guardFinite path) — no
    // real change happened, so say nothing rather than narrate a phantom "+0 points".
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

export function buildParserRules(
  index: ParserIndex,
  rngFor: (state: GameState) => Rng = (s) => rngForStep(s.seed, s.step),
): Rules {
  const maxScore = index.pack.meta.max_score ?? 0;
  return {
    legalActions(state: GameState): Action[] {
      return enumerateActions(index, state).map((o) => o.action);
    },

    resolve(state: GameState, action: Action): Resolution | null {
      // A USE interaction may carry a seeded skill check (the Stage-4 mechanic, now available in
      // PARSER mode too — palette standardization, so a puzzle pack can roll a lockpick/might/nerve
      // check without becoming an RPG). Resolved here exactly as the RPG runner does: offer-legality
      // still requires holding the item AND meeting the interaction's own conditions, so a one-shot
      // check can't be re-fired by a forced/stale step and re-roll a contradictory result. `rngFor`
      // is the verification seam — default is the step-keyed PRNG, so production play is
      // byte-identical and replayable (§8.5); proofs pass a forced best/worst roll.
      if (action.type === "USE") {
        const it = useInteraction(index, action.target, action.item);
        if (it?.skill_check) {
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

    checkWin(state: GameState): Effect[] {
      const ending = winningEnding(index, state);
      return ending ? [{ end_game: ending }] : [];
    },

    decorateEvents(events: GameEvent[]): GameEvent[] {
      return scoreChangeNarrations(events, maxScore);
    },
  };
}
