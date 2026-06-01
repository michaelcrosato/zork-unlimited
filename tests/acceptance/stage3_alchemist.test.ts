/**
 * Stage 3 acceptance (§13 Stage 3) — The Alchemist's Tower.
 *
 *   - the pack passes the (score- and death-aware) parser validator;
 *   - the AI completes it via the structured legal-action API at FULL score;
 *   - a DEATH ending is reachable and is recoverable via save/load: save, drink
 *     the black phial (die), load, and go on to win — the §13 Stage 3 guarantee
 *     that death states are always recoverable.
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import { indexParserPack, buildParserRules, initStateForParserPack } from "../../src/parser/runner.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { validateParser } from "../../src/validate/parser_validator.js";
import { makeStep } from "../../src/core/engine.js";
import { save, load } from "../../src/persist/save_load.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadParserPackFile("content/parser/pack/alchemists_tower.yaml");
if (!loaded.ok) throw new Error("alchemists_tower must compile");
const pack = loaded.compiled.pack;
const index = indexParserPack(pack);
const rules = buildParserRules(index);
const step = makeStep(rules);

function play(s: GameState, ids: string[]): GameState {
  for (const id of ids) {
    const opt = enumerateActions(index, s).find((o) => o.id === id);
    if (!opt) throw new Error(`"${id}" not legal in ${s.current}: [${enumerateActions(index, s).map((o) => o.id).join(", ")}]`);
    const r = step(s, opt.action);
    expect(r.ok).toBe(true);
    s = r.state;
  }
  return s;
}

// Brew the antidote and stand in the laboratory (one step short of the spire).
const BREW = [
  "go_west", "read_spellbook", "go_east", "go_east", "take_herb", "take_brass_key",
  "go_west", "go_north", "go_up", "unlock_strongbox", "open_strongbox", "take_iron_key",
  "go_down", "use_iron_key_on_cellar_door", "go_down", "take_water_vial", "go_up",
  "go_north", "use_herb_on_cauldron", "use_water_vial_on_cauldron",
];

describe("Stage 3 — The Alchemist's Tower", () => {
  it("validates green (score- and death-aware)", () => {
    const report = validateParser(pack);
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
  });

  it("the AI completes the game via the legal-action API at full score", () => {
    const state = play(initStateForParserPack(index, 1), [...BREW, "go_up"]);
    const obs = buildParserObservation(index, state);
    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_cured");
    expect(obs.score).toBe(pack.meta.max_score); // 35/35 — score target is reachable
    expect(obs.ending?.death).toBe(false);
  });

  it("a death ending is reachable and recoverable via save/load (§13 Stage 3)", () => {
    const atLab = play(initStateForParserPack(index, 1), [...BREW, "take_black_phial"]);
    // Save before the fatal action.
    const saved = save(atLab, pack.meta.id, loaded.compiled.contentHash);

    // Drink the black phial → a death ending. The self-targeted USE reads as the
    // legible `use_black_phial` (not the old nonsensical `use_black_phial_on_black_phial`).
    const dead = play(atLab, ["use_black_phial"]);
    expect(dead.ended).toBe(true);
    expect(dead.endingId).toBe("ending_poisoned");
    expect(buildParserObservation(index, dead).ending?.death).toBe(true);

    // Restore the pre-death save and go on to win — the death was recoverable.
    const restored = load(saved, loaded.compiled.contentHash).state;
    expect(restored.ended).toBe(false);
    const won = play(restored, ["go_up"]);
    expect(won.ended).toBe(true);
    expect(won.endingId).toBe("ending_cured");
  });
});
