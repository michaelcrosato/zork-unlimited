/**
 * Regression (§15) for bug_0104 — in The Alchemist's Tower the perfect score now
 * coincides with the WIN, not one action before it.
 *
 * A fresh blind MCP playtester (ai-runs/2026-06-02T07-40-46-287Z, seed 89) won the
 * tower (ending_cured), rated it clarity 5/5 / enjoyment 4/5 with ZERO functional
 * bugs, and flagged ONE concrete design nit — twice (report §4 and §5):
 *
 *   "The score hits the maximum 35/35 when you brew the antidote — one full step
 *    before the game actually ends (giving it to the master). A perfect-score-yet-
 *    unfinished state is slightly odd. Consider awarding the final points on
 *    administering the cure so score and victory coincide."
 *
 * Root cause: the score chain awarded 5 (read recipe) + 10 (steep herb) + 20 (decant
 * antidote) = 35 = the old max_score, all BEFORE the spire. The bug_0057 climax — the
 * deliberate USE-antidote-on-master cure, the literal point of the pack and the act
 * the win turns on — awarded nothing, so a score-watching player maxed out one move
 * early.
 *
 * The fix (content only): the cure interaction now carries the final +5, and
 * max_score is raised 35 → 40. So the brew tops out at 35/40 and the perfect 40/40 is
 * reached only on the cure. Every prior award is unchanged.
 *
 * Locked here:
 *   (1) max_score is 40;
 *   (2) standing at the spire with the antidote (one step short of the cure) the score
 *       is 35 — strictly BELOW max (this is the regression: it used to equal max);
 *   (3) administering the cure awards the final +5, landing the win at exactly 40/40;
 *   (4) the cure interaction carries inc_var score by 5;
 *   (5) the pack still validates green.
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
import { validateParser } from "../../src/validate/parser_validator.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const alch = loadParserPackFile("content/parser/pack/alchemists_tower.yaml");
if (!alch.ok) throw new Error("alchemists_tower must compile");
const pack = alch.compiled.pack;
const index = indexParserPack(pack);
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

// Brew the antidote and stand in the laboratory, one step short of the spire.
const BREW = [
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
];

describe("bug_0104 — the Alchemist's Tower perfect score coincides with the win", () => {
  it("max_score is 40 (the +5 cure capstone raised it from 35)", () => {
    expect(pack.meta.max_score).toBe(40);
  });

  it("standing at the spire with the antidote, the score is 35 — strictly BELOW max", () => {
    let s = play(initStateForParserPack(index, 1), BREW);
    expect(s.inventory).toContain("antidote");
    s = play(s, ["go_up"]);
    expect(s.current).toBe("spire");
    expect(s.ended).toBe(false);
    const score = buildParserObservation(index, s).score;
    expect(score).toBe(35); // 5 recipe + 10 steep + 20 decant
    expect(score).toBeLessThan(pack.meta.max_score); // the regression: it used to EQUAL max here
  });

  it("administering the cure awards the final +5 and lands the win at exactly 40/40", () => {
    const beforeCure = play(initStateForParserPack(index, 1), [...BREW, "go_up"]);
    const before = buildParserObservation(index, beforeCure).score;

    const won = play(beforeCure, ["use_antidote_on_master"]);
    expect(won.ended).toBe(true);
    expect(won.endingId).toBe("ending_cured");
    const after = buildParserObservation(index, won).score;

    expect(after - before).toBe(5); // the cure carries the final award
    expect(after).toBe(pack.meta.max_score);
    expect(after).toBe(40);
  });

  it("the cure interaction carries the +5 score award (inc_var score by 5)", () => {
    const master = pack.objects.find((o) => o.id === "master")!;
    const give = master.interactions.find((it) => it.verb === "USE" && it.item === "antidote")!;
    expect(give.effects).toContainEqual({ inc_var: { name: "score", by: 5 } });
  });

  it("the pack still validates green", () => {
    const report = validateParser(pack);
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
  });
});
