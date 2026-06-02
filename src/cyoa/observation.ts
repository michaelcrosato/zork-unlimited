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
  available_actions: { id: string; text: string }[];
  ended: boolean;
  ending_id: string | null;
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
          .map((c) => ({ id: c.id, text: c.text }));

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
