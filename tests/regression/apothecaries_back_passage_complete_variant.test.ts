/**
 * Regression for bug_0426 - apothecaries_standard must not call a complete
 * evidence chain incomplete when the player withdraws through the back passage.
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

const loaded = loadParserPackFile("content/parser/pack/apothecaries_standard.yaml");
if (!loaded.ok) throw new Error("apothecaries_standard must compile");
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

const PROVE_CASE = [
  "read_dispensatory",
  "take_glass_drawstick",
  "use_glass_drawstick_on_suspect_vial",
  "use_glass_drawstick_on_dispensatory",
  "go_east",
  "read_dispensing_ledger",
  "take_sample_vials",
  "go_west",
];

describe("bug_0426 - apothecaries_standard back passage distinguishes complete evidence", () => {
  it("after full evidence, back passage withdrawal no longer says the chain was incomplete", () => {
    const s = play(initStateForParserPack(index, 7), [...PROVE_CASE, "go_south"]);
    const obs = buildParserObservation(index, s);

    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_withdrawn");
    expect(obs.score).toBe(pack.meta.max_score);
    expect(obs.ending?.text).toContain("sealed sample vials");
    expect(obs.ending?.text).toMatch(/comparison complete/i);
    expect(obs.ending?.text).toMatch(/case withdrawn/i);
    expect(obs.ending?.text).not.toMatch(/not assembled the complete chain/i);
    expect(obs.ending?.text).not.toMatch(/search incomplete/i);
  });

  it("before evidence, back passage withdrawal still renders the incomplete-search text", () => {
    const s = play(initStateForParserPack(index, 7), ["go_south"]);
    const obs = buildParserObservation(index, s);

    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_withdrawn");
    expect(obs.ending?.text).toMatch(/not assembled the complete chain/i);
    expect(obs.ending?.text).toMatch(/search incomplete/i);
  });

  it("normal north presentation remains the complete finding", () => {
    const s = play(initStateForParserPack(index, 7), [...PROVE_CASE, "go_north"]);

    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_presented");
    expect(buildParserObservation(index, s).score).toBe(pack.meta.max_score);
  });

  it("the pack validates clean", () => {
    const report = validateParser(pack);
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
  });
});
