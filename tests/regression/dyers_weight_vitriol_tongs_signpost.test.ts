/**
 * Regression for bug_0432 - dyers_weight's optional vitriol clue should
 * signpost the copper tongs before players finish at 40/45 and wonder what
 * they missed.
 */
import { describe, expect, it } from "vitest";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import { parseCommand } from "../../src/parser/command_map.js";
import { enumerateActions, resolveParserAction } from "../../src/parser/legal_actions.js";
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

function lookNarration(s: GameState, target: string): string {
  const res = resolveParserAction(index, s, { type: "LOOK", target });
  const effect = res?.effects[0];
  if (!effect || !("narrate" in effect)) throw new Error(`no look narration for ${target}`);
  return effect.narrate;
}

const FULL_SCORE_ROUTE = [
  "read_order_ledger",
  "take_indigo_cakes",
  "take_copper_tongs",
  "go_east",
  "take_acid_vial",
  "use_copper_tongs_on_vitriol_jar",
  "use_acid_vial_on_chalk_casks",
  "go_west",
  "use_acid_vial_on_dye_vat",
  "go_north",
];

describe("bug_0432 - dyers_weight signposts the vitriol tongs clue", () => {
  it("examining the vitriol jar points to the copper tongs", () => {
    const s = play(initStateForParserPack(index, 7), ["go_east"]);

    expect(lookNarration(s, "vitriol_jar")).toMatch(/copper tongs from the vat/i);
  });

  it("the signposted tongs command is legal and parseable once the tongs are held", () => {
    const s = play(initStateForParserPack(index, 7), ["take_copper_tongs", "go_east"]);

    expect(enumerateActions(index, s).map((o) => o.id)).toContain(
      "use_copper_tongs_on_vitriol_jar",
    );
    expect(parseCommand(index, s, "use tongs on jar")).toEqual({
      ok: true,
      action: { type: "USE", item: "copper_tongs", target: "vitriol_jar" },
    });
  });

  it("the full-score route still uses the optional vitriol clue without changing gates", () => {
    const s = play(initStateForParserPack(index, 7), FULL_SCORE_ROUTE);

    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_seized");
    expect(s.flags["found_vitriol_taint"]).toBe(true);
    expect(buildParserObservation(index, s).score).toBe(pack.meta.max_score);
  });

  it("the pack validates clean", () => {
    const report = validateParser(pack);
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
  });
});
