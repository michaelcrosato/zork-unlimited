/**
 * Regression for bug_0431 - dyers_weight's north gate hint must not claim the
 * player already has evidence they have not taken.
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

function northGateMessage(s: GameState): string {
  const north = buildParserObservation(index, s).blocked_exits.find((e) => e.direction === "north");
  if (!north) throw new Error("north gate was not blocked");
  return north.message;
}

const PROOF_WITHOUT_CAKES = [
  "go_east",
  "take_acid_vial",
  "use_acid_vial_on_chalk_casks",
  "go_west",
  "use_acid_vial_on_dye_vat",
];

describe("bug_0431 - dyers_weight north gate hint stays state-truthful", () => {
  it("does not say the player has a cake at the opening", () => {
    const msg = northGateMessage(initStateForParserPack(index, 7));

    expect(msg).toMatch(/both a cake from the rack and the second acid test/i);
    expect(msg).toMatch(/secure the cakes/i);
    expect(msg).not.toMatch(/you have a cake/i);
  });

  it("still names the missing cakes after the vat proof is complete", () => {
    const s = play(initStateForParserPack(index, 7), PROOF_WITHOUT_CAKES);
    const msg = northGateMessage(s);

    expect(s.flags["proved_adulteration"]).toBe(true);
    expect(s.inventory).not.toContain("indigo_cakes");
    expect(msg).toMatch(/both a cake from the rack and the second acid test/i);
    expect(msg).toMatch(/secure the cakes/i);
    expect(msg).not.toMatch(/you have a cake/i);
  });

  it("the pack validates clean", () => {
    const report = validateParser(pack);
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
  });
});
