/**
 * Regression (§15) for bug_0300 — Laboratory room still read "a black phial sits
 * apart on the bench" after the player took the phial, in all three brew states
 * (base, herb_added, antidote_brewed). Same reactive-description-blindness class
 * as bug_0012/0282/0283/0287/0288/0292/0298.
 *
 * Fix: each brew-state variant gains a has_item:black_phial companion (first-match-
 * wins, listed above its plain counterpart) that omits the phial line; the base
 * description gains a standalone has_item:black_phial variant. Pure content; no
 * flag/score/exit/gating/ending change.
 *
 * Locked:
 *  (1) base state, phial taken → no "black phial" in lab description
 *  (2) herb_added state, phial taken → cauldron green / no "black phial"
 *  (3) antidote_brewed state, phial taken → cauldron drained / no "black phial"
 *  (4) base state, phial on bench → "black phial" present (sanity / non-regression)
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  indexParserPack,
  buildParserRules,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";
import { buildParserObservation } from "../../src/parser/observation.js";
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

const desc = (s: GameState): string => buildParserObservation(index, s).description;

// Route to great_hall holding herb, iron key (no water yet)
const TO_GREAT_HALL = [
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
];

// Full route to lab with herb and water ready to brew
const TO_LAB_READY = [
  ...TO_GREAT_HALL,
  "unlock_cellar_door",
  "go_down",
  "take_water_vial",
  "go_up",
  "go_north",
];

describe("bug_0300 — Laboratory description reacts to phial being taken", () => {
  it("base state, phial taken → 'black phial' absent from lab description", () => {
    // Reach lab without brewing; take the phial.
    let s = play(initStateForParserPack(index, 7), [...TO_GREAT_HALL, "go_north"]);
    expect(s.current).toBe("laboratory");

    // Phial still on bench — present in description.
    expect(desc(s)).toContain("black phial");

    // Take the phial.
    s = play(s, ["take_black_phial"]);
    expect(s.inventory).toContain("black_phial");

    // Now the description must not mention the bench phial.
    expect(desc(s)).not.toContain("black phial");
  });

  it("herb_added state, phial taken → cauldron green text present, 'black phial' absent", () => {
    let s = play(initStateForParserPack(index, 7), TO_LAB_READY);
    expect(s.current).toBe("laboratory");

    // Steep herb (sets herb_added).
    s = play(s, ["use_herb_on_cauldron"]);
    expect(s.flags["herb_added"]).toBe(true);

    // Take phial.
    s = play(s, ["take_black_phial"]);
    expect(s.inventory).toContain("black_phial");

    const d = desc(s);
    expect(d).toContain("deep herbal green");
    expect(d).toContain("waiting for clear water");
    expect(d).not.toContain("black phial");
  });

  it("antidote_brewed state, phial taken → cauldron drained text present, 'black phial' absent", () => {
    let s = play(initStateForParserPack(index, 7), TO_LAB_READY);
    expect(s.current).toBe("laboratory");

    // Brew antidote fully.
    s = play(s, ["use_herb_on_cauldron", "use_water_vial_on_cauldron"]);
    expect(s.flags["antidote_brewed"]).toBe(true);

    // Take phial.
    s = play(s, ["take_black_phial"]);
    expect(s.inventory).toContain("black_phial");

    const d = desc(s);
    expect(d).toContain("drained of the antidote");
    expect(d).not.toContain("black phial");
  });

  it("base state, phial on bench → 'black phial' present (non-regression)", () => {
    const s = play(initStateForParserPack(index, 7), [...TO_GREAT_HALL, "go_north"]);
    expect(s.current).toBe("laboratory");
    expect(s.inventory).not.toContain("black_phial");
    expect(desc(s)).toContain("black phial");
  });
});
