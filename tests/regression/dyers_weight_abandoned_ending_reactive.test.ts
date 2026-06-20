/**
 * Regression for bug_0379 - dyers_weight's back-passage ending must not claim
 * the second acid test was missing after the player has already completed it.
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

const loaded = loadParserPackFile("content/parser/pack/dyers_weight.yaml");
if (!loaded.ok) throw new Error("dyers_weight must compile");
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
    const result = step(s, opt.action);
    expect(result.ok).toBe(true);
    s = result.state;
  }
  return s;
}

const PROVE_ADULTERATION = [
  "take_indigo_cakes",
  "go_east",
  "take_acid_vial",
  "use_acid_vial_on_chalk_casks",
  "go_west",
  "use_acid_vial_on_dye_vat",
];

describe("bug_0379 - dyers_weight abandonment ending reacts to completed proof", () => {
  it("keeps the incomplete-proof abandonment text before the vat test", () => {
    const abandoned = play(initStateForParserPack(index, 7), ["go_south"]);
    const obs = buildParserObservation(index, abandoned);

    expect(abandoned.ended).toBe(true);
    expect(abandoned.endingId).toBe("ending_abandoned");
    expect(obs.description).toMatch(/without the second acid test complete/i);
    expect(obs.description).toMatch(/The proof was not completed/i);
  });

  it("does not contradict a completed second acid test", () => {
    const abandoned = play(initStateForParserPack(index, 7), [...PROVE_ADULTERATION, "go_south"]);
    const obs = buildParserObservation(index, abandoned);

    expect(abandoned.ended).toBe(true);
    expect(abandoned.endingId).toBe("ending_abandoned");
    expect(abandoned.flags["proved_adulteration"]).toBe(true);
    expect(obs.description).toMatch(/second acid test was complete/i);
    expect(obs.description).toMatch(/proof was completed, then abandoned/i);
    expect(obs.description).not.toMatch(/without the second acid test complete/i);
    expect(obs.score).toBe(35);
    expect(obs.max_score).toBe(pack.meta.max_score);
  });

  it("the pack validates clean", () => {
    const report = validateParser(pack);
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
  });
});
