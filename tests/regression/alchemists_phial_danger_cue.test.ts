/**
 * Regression (§15) for bug_0052 — *The Alchemist's Tower*'s lethal black phial gave
 * a library-skipping player no fair, in-place warning, and its base examine text even
 * referenced a recipe that player had never read.
 *
 * A fresh, MCP-only blind playtester (ai-runs/2026-06-01T14-47-28-763Z/playtest.md —
 * the rotated target this cycle, alchemists_tower seed 67; the mandated clockwork_heist
 * pass came back pristine) reached ending_poisoned in a run that SKIPPED the optional
 * Library, and judged the death "arbitrary": the sole caution lived in a room they
 * never entered (report §4/§5). The old base description, "A black glass phial of oily
 * liquid. The recipe warned against it.", was also a quiet contradiction for that
 * player — it cited a recipe they had not read.
 *
 * The fix is pure CONTENT, using the existing reactive object `variants` feature
 * (bug_0023/0033/0039/0044): the base description now carries an INTRINSIC sensory
 * dread (the oily liquid drinks the light; an acrid reek stings the throat; "never
 * brewed to be drunk") that warns everyone without assuming the recipe, and ONE variant
 * gated on `read_recipe` (the flag the spellbook READ sets) restores the sharper, named
 * recipe callback for a reader. Examine-only: no flag/item/score/exit/interaction/
 * gating change — the drink interaction and ending_poisoned are untouched, so the death
 * stays exactly as reachable as before.
 *
 * Locked here:
 *   (1) a library-skipper (read_recipe unset) examining the phial gets the intrinsic
 *       danger cue and NEVER the word "recipe" — the warning no longer cites an unread
 *       page, and the death is now telegraphed in place;
 *   (2) a recipe reader (read_recipe set) examining the phial gets the named recipe
 *       callback ("no medicine but death — do not drink it");
 *   (3) the cue is examine-only: drinking the phial still reaches ending_poisoned even
 *       on a route that never touched the Library — the fix WARNS, it does not GATE;
 *   (4) the canonical brew route still reaches ending_cured at full score (text-only).
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  indexParserPack,
  buildParserRules,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { enumerateActions, resolveParserAction } from "../../src/parser/legal_actions.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { objectDescription } from "../../src/parser/model.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const alch = loadParserPackFile("content/parser/pack/alchemists_tower.yaml");
if (!alch.ok) throw new Error("alchemists_tower must compile");
const index = indexParserPack(alch.compiled.pack);
const step = makeStep(buildParserRules(index));

function play(s: GameState, ids: string[]): GameState {
  for (const id of ids) {
    const opt = enumerateActions(index, s).find((o) => o.id === id);
    if (!opt)
      throw new Error(
        `"${id}" not legal in ${s.current}: [${enumerateActions(index, s)
          .map((o) => o.id)
          .join(", ")}]`,
      );
    const r = step(s, opt.action);
    expect(r.ok).toBe(true);
    s = r.state;
  }
  return s;
}

/** The narrate text an `examine <target>` (LOOK target) emits in this state. */
function examineNarration(s: GameState, target: string): string {
  const res = resolveParserAction(index, s, { type: "LOOK", target });
  const eff = res?.effects.find((e) => "narrate" in e) as { narrate: string } | undefined;
  if (!eff) throw new Error(`no examine narration for ${target} in ${s.current}`);
  return eff.narrate;
}

// Straight to the laboratory, never entering the Library: courtyard -N-> great_hall
// -N-> laboratory. read_recipe stays unset.
const SKIP_LIBRARY_TO_LAB = ["go_north", "go_north"];
// Read the recipe first, then to the laboratory: courtyard -W-> library [read] -E->
// courtyard -N-> great_hall -N-> laboratory.
const READ_THEN_LAB = ["go_west", "read_spellbook", "go_east", "go_north", "go_north"];

describe("bug_0052 — the black phial telegraphs its own danger, recipe-read or not", () => {
  it("a library-skipper sees an intrinsic danger cue and no reference to an unread recipe", () => {
    const s = play(initStateForParserPack(index, 67), SKIP_LIBRARY_TO_LAB);
    expect(s.current).toBe("laboratory");
    expect(s.flags["read_recipe"]).toBeFalsy(); // never entered the Library

    const examined = examineNarration(s, "black_phial");
    expect(examined.toLowerCase()).not.toContain("recipe"); // no longer cites an unread page
    expect(examined).toMatch(/drink the light|never brewed to be drunk|acrid reek/i);
    // Same text via the pure object resolver (the byte the observation renders).
    expect(objectDescription(index.objects.get("black_phial")!, s)).toBe(examined);
  });

  it("a recipe reader gets the sharper, named recipe callback on examine", () => {
    const s = play(initStateForParserPack(index, 67), READ_THEN_LAB);
    expect(s.current).toBe("laboratory");
    expect(s.flags["read_recipe"]).toBe(true);

    const examined = examineNarration(s, "black_phial");
    expect(examined.toLowerCase()).toContain("recipe");
    expect(examined).toMatch(/no medicine but death|do not drink/i);
  });

  it("the cue WARNS but does not GATE: the death is still reachable with the Library skipped", () => {
    const dead = play(initStateForParserPack(index, 67), [
      ...SKIP_LIBRARY_TO_LAB,
      "take_black_phial",
      "use_black_phial",
    ]);
    expect(dead.flags["read_recipe"]).toBeFalsy();
    expect(dead.ended).toBe(true);
    expect(dead.endingId).toBe("ending_poisoned");
  });

  it("reachability unchanged: the canonical brew route still reaches ending_cured at full score", () => {
    const won = play(initStateForParserPack(index, 1), [
      "go_west",
      "read_spellbook",
      "go_east",
      "go_east",
      "take_herb",
      "take_brass_key",
      "go_west",
      "go_north",
      "go_up",
      "unlock_strongbox",
      "open_strongbox",
      "take_iron_key",
      "go_down",
      "use_iron_key_on_cellar_door",
      "go_down",
      "take_water_vial",
      "go_up",
      "go_north",
      "use_herb_on_cauldron",
      "use_water_vial_on_cauldron",
      "go_up",
    ]);
    expect(won.ended).toBe(true);
    expect(won.endingId).toBe("ending_cured");
    expect(buildParserObservation(index, won).score).toBe(alch.compiled.pack.meta.max_score);
  });
});
