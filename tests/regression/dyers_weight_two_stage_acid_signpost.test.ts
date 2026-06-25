/**
 * Regression for bug_0433 - dyers_weight's vat action is intentionally gated by
 * the raw-cask acid test, so the player-facing hints must name that prerequisite.
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

function northGateMessage(s: GameState): string {
  const north = buildParserObservation(index, s).blocked_exits.find((e) => e.direction === "north");
  if (!north) throw new Error("north gate was not blocked");
  return north.message;
}

const ACID_AT_VAT_BEFORE_CASK_TEST = ["go_east", "take_acid_vial", "go_west"];

describe("bug_0433 - dyers_weight signposts the raw-cask acid prerequisite", () => {
  it("explains why the vat cannot be tested before the white casks", () => {
    const s = play(initStateForParserPack(index, 7), ACID_AT_VAT_BEFORE_CASK_TEST);
    const actions = enumerateActions(index, s).map((o) => o.id);

    expect(actions).not.toContain("use_acid_vial_on_dye_vat");
    expect(lookNarration(s, "dye_vat")).toMatch(/test the casks in the store room east first/i);
    expect(northGateMessage(s)).toMatch(/test the white casks there first/i);
  });

  it("offers and parses the vat pour after the cask test", () => {
    const s = play(initStateForParserPack(index, 7), [
      "go_east",
      "take_acid_vial",
      "use_acid_vial_on_chalk_casks",
      "go_west",
    ]);

    expect(enumerateActions(index, s).map((o) => o.id)).toContain("use_acid_vial_on_dye_vat");
    expect(parseCommand(index, s, "pour vial on vat")).toEqual({
      ok: true,
      action: { type: "USE", item: "acid_vial", target: "dye_vat" },
    });
  });

  it("does not call the north door clear after the vat proof while cakes remain on the rack", () => {
    const s = play(initStateForParserPack(index, 7), [
      "go_east",
      "take_acid_vial",
      "use_acid_vial_on_chalk_casks",
      "go_west",
      "use_acid_vial_on_dye_vat",
    ]);
    const obs = buildParserObservation(index, s);

    expect(s.flags["proved_adulteration"]).toBe(true);
    expect(s.inventory).not.toContain("indigo_cakes");
    expect(obs.description).toMatch(/take the cakes from the rack/i);
    expect(obs.description).not.toMatch(/north door is clear/i);
    expect(obs.blocked_exits.find((e) => e.direction === "north")?.message).toMatch(
      /both a cake from the rack and the two-stage acid proof/i,
    );
  });

  it("the canonical full-score route still reaches the seized ending", () => {
    const s = play(initStateForParserPack(index, 7), [
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
    ]);

    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_seized");
    expect(buildParserObservation(index, s).score).toBe(pack.meta.max_score);
  });

  it("the pack validates clean", () => {
    const report = validateParser(pack);
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
  });
});
