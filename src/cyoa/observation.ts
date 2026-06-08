/**
 * AI-/human-facing CYOA observation (spec §9.1).
 *
 * The only view a player gets: current text + the enumerated legal choices. No
 * engine internals leak. Internal bookkeeping flags (the `__exit:` convention)
 * are hidden from the surfaced flag list.
 */
import { evalConditions } from "../core/conditions.js";
import type { GameState } from "../core/state.js";
import { type CyoaIndex, endingText, sceneText } from "./runner.js";

export type CyoaObservation = {
  mode: "cyoa";
  scene_id: string;
  title: string;
  text: string;
  state: {
    flags: string[];
    vars: Record<string, number>;
    inventory: string[];
    journal: string[];
  };
  // A skill-checked choice (`choice.skill_check`) carries a `skill_check` annotation:
  // the var rolled and the difficulty it is rolled against, so a client (and a player)
  // can SEE that a stat is in play — without it a declared skill var reads as vestigial
  // (a blind playtester flagged exactly this for `guile`, bug_0269). `die` names the
  // die type ("d20") so that stat+difficulty reads as "d20 + nerve(3) vs 12" rather
  // than a flat "3 vs 12" comparison that looks impossible (bug_0311; mirrors the
  // post-roll d20 label added for sunken_barrow in bug_0141). Only `skill`/`difficulty`/
  // `die` are surfaced — never the check's `on_success`/`on_failure` effects, which
  // carry the branch's `goto`/`end_game` routing: the destination graph stays hidden by
  // construction, exactly as a plain choice never exposes `choice.next`. The field is
  // OMITTED on a plain (non-skill) choice, so the observation is byte-identical to the
  // legacy shape for every existing pack's non-skill choices.
  available_actions: {
    id: string;
    text: string;
    skill_check?: { skill: string; difficulty: number; die: string };
  }[];
  ended: boolean;
  ending_id: string | null;
  // null while playing; once ended, whether the reached terminal is a declared
  // death/failure ending (`death: true`). Lets a client distinguish a "you lost"
  // terminal from a win/neutral one uniformly with parser/RPG. An `is_ending` scene
  // (not in the endings list) carries no death flag ⇒ false.
  ending_death: boolean | null;
};

function visibleFlags(state: GameState): string[] {
  return Object.keys(state.flags)
    .filter((f) => state.flags[f] === true && !f.startsWith("__"))
    .sort();
}

// `_opts` (e.g. hideGraph) is accepted for a uniform cross-mode dispatcher
// signature but is a no-op here: a CYOA observation already surfaces only choice
// `text`/`id`, never the destination scene (`choice.next`), so the branch graph
// is hidden by construction.
export function buildObservation(
  index: CyoaIndex,
  state: GameState,
  _opts: { hideGraph?: boolean } = {},
): CyoaObservation {
  const nodeText = textFor(index, state.current, state);
  const scene = index.scenes.get(state.current);

  const available =
    state.ended || !scene || scene.is_ending
      ? []
      : scene.choices
          .filter((c) => evalConditions(c.conditions, state))
          .map((c) => ({
            id: c.id,
            text: c.text,
            // Surface the rolled skill, difficulty, and die type (never branch effects,
            // which would leak destination scenes — see the type comment). `die: "d20"`
            // surfaces the ceiling so a player reading "nerve(3) vs 12" knows it is
            // "d20+3 vs 12" (passable on a 9+), not an impossible flat comparison
            // (bug_0311). Omit entirely on a plain choice so the legacy shape is exact.
            ...(c.skill_check
              ? {
                  skill_check: {
                    skill: c.skill_check.skill,
                    difficulty: c.skill_check.difficulty,
                    die: "d20",
                  },
                }
              : {}),
          }));

  return {
    mode: "cyoa",
    scene_id: state.current,
    title: nodeText.title,
    text: nodeText.text,
    state: {
      flags: visibleFlags(state),
      vars: { ...state.vars },
      inventory: [...state.inventory],
      journal: [...state.journal],
    },
    available_actions: available,
    ended: state.ended,
    ending_id: state.endingId,
    ending_death: state.ended
      ? (index.pack.endings.find((e) => e.id === (state.endingId ?? state.current))?.death ?? false)
      : null,
  };
}

/** Resolve the title/text for any node id (scene OR ending). Both a scene's text
 *  and an ending's epilogue are state-reactive (first matching `variant`, else
 *  base text). */
function textFor(index: CyoaIndex, id: string, state: GameState): { title: string; text: string } {
  const scene = index.scenes.get(id);
  if (scene) return { title: scene.title, text: sceneText(scene, state) };
  const ending = index.pack.endings.find((e) => e.id === id);
  if (ending) return { title: ending.title, text: endingText(ending, state) };
  return { title: id, text: "" };
}
