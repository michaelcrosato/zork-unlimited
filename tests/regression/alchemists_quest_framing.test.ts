/**
 * Regression for bug_0373 - The Alchemist's Tower's world quest must match its
 * actual final fork.
 *
 * A fresh blind playtest (20260620T072822Z_alchemists_tower_seed7) won the cure
 * route 40/40 but flagged an S2 narrative-integrity issue: the world quest said
 * "brew the antidote and expose the tower", while the implemented spire choice is
 * mutually exclusive. Giving the antidote ends in ending_cured; opening the silver
 * casket exposes/takes the Great Work and ends in ending_betrayal. The old copy
 * promised a both-path and left the win feeling incomplete.
 *
 * Locked here:
 *   (1) the world quest frames a choice, not "brew and expose";
 *   (2) the cure ending acknowledges choosing the maker over the Work and no
 *       longer implies the tower is simply vindicated;
 *   (3) behavior is unchanged: the canonical cure route still wins at full score;
 *   (4) the pack validates clean.
 */
import { describe, expect, it } from "vitest";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  buildParserRules,
  indexParserPack,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { validateParser } from "../../src/validate/parser_validator.js";

const loaded = loadParserPackFile("content/parser/pack/alchemists_tower.yaml");
if (!loaded.ok) throw new Error("alchemists_tower must compile");
const pack = loaded.compiled.pack;
const index = indexParserPack(pack);
const step = makeStep(buildParserRules(index));

function play(s: GameState, ids: string[]): GameState {
  for (const id of ids) {
    const opt = enumerateActions(index, s).find((o) => o.id === id);
    if (!opt) {
      throw new Error(
        `"${id}" not legal in ${s.current}: [${enumerateActions(index, s)
          .map((o) => o.id)
          .join(", ")}]`,
      );
    }
    const r = step(s, opt.action);
    expect(r.ok).toBe(true);
    s = r.state;
  }
  return s;
}

const CURE_ROUTE = [
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
  "unlock_cellar_door",
  "go_down",
  "take_water_vial",
  "go_up",
  "go_north",
  "use_herb_on_cauldron",
  "use_water_vial_on_cauldron",
  "go_up",
  "use_antidote_on_master",
];

describe("bug_0373 - alchemists_tower quest framing matches the final fork", () => {
  it("world quest copy frames a choice instead of promising a both-path objective", () => {
    const quest = pack.meta.world?.quest;
    if (!quest) throw new Error("alchemists_tower must declare a world quest");
    expect(quest).toMatch(/choose between/i);
    expect(quest).toMatch(/curing the alchemist/i);
    expect(quest).toMatch(/Great Work/i);
    expect(quest).not.toMatch(/brew the antidote and expose the tower/i);
  });

  it("the cure ending acknowledges the maker-over-Work choice without vindicating the tower", () => {
    const ending = pack.endings.find((e) => e.id === "ending_cured");
    expect(ending).toBeDefined();
    expect(ending!.text).toMatch(/maker over the Work/i);
    expect(ending!.text).toMatch(/reckoning Charterhaven/i);
    expect(ending!.text).not.toMatch(/light of the tower with her/i);
  });

  it("behavior is unchanged: the canonical cure still wins ending_cured at full score", () => {
    const won = play(initStateForParserPack(index, 1), CURE_ROUTE);
    expect(won.ended).toBe(true);
    expect(won.endingId).toBe("ending_cured");

    const obs = buildParserObservation(index, won);
    expect(obs.score).toBe(pack.meta.max_score);
    expect(obs.ending?.death).toBe(false);
    expect(obs.ending?.text).toMatch(/maker over the Work/i);
  });

  it("the pack validates clean", () => {
    const report = validateParser(pack);
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
  });
});
