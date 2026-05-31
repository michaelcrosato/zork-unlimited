/**
 * AI-/human-facing CYOA observation (spec §9.1).
 *
 * The only view a player gets: current text + the enumerated legal choices. No
 * engine internals leak. Internal bookkeeping flags (the `__exit:` convention)
 * are hidden from the surfaced flag list.
 */
import { evalConditions } from "../core/conditions.js";
import type { GameState } from "../core/state.js";
import type { CyoaIndex } from "./runner.js";

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

export function buildObservation(index: CyoaIndex, state: GameState): CyoaObservation {
  const sceneText = textFor(index, state.current);
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
    title: sceneText.title,
    text: sceneText.text,
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

/** Resolve the title/text for any node id (scene OR ending). */
function textFor(index: CyoaIndex, id: string): { title: string; text: string } {
  const scene = index.scenes.get(id);
  if (scene) return { title: scene.title, text: scene.text };
  const ending = index.pack.endings.find((e) => e.id === id);
  if (ending) return { title: ending.title, text: ending.text };
  return { title: id, text: "" };
}
