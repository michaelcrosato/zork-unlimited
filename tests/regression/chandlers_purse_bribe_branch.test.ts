/**
 * Regression for bug_0429 - chandlers_lot's bribe purse branch must be an
 * explicit moral action, not an ordinary TAKE that looks like inventory pickup.
 */
import { describe, expect, it } from "vitest";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import { parseCommand } from "../../src/parser/command_map.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  buildParserRules,
  indexParserPack,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { validateParser } from "../../src/validate/parser_validator.js";

const loaded = loadParserPackFile("content/parser/pack/chandlers_lot.yaml");
if (!loaded.ok) throw new Error("chandlers_lot must compile");
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

const TO_WAX_LOFT = ["go_east", "go_up"];
const PROVE_FRAUD = [
  "read_lamp_contract",
  "take_inspector_lantern",
  "go_east",
  "take_wick_gauge",
  "take_snuffing_shears",
  "use_wick_gauge_on_false_candles",
  "use_snuffing_shears_on_proof_candle",
  "go_up",
  "take_adulteration_book",
  "use_adulteration_book_on_tallow_ledger",
  "use_inspector_lantern_on_adulteration_book",
  "go_down",
  "go_west",
  "go_north",
];

describe("bug_0429 - chandlers_lot bribe purse is an explicit branch", () => {
  it("offers pocketing the purse, not taking it, in the wax loft", () => {
    const s = play(initStateForParserPack(index, 7), TO_WAX_LOFT);
    const actions = enumerateActions(index, s);

    expect(actions.some((a) => a.id === "take_sealed_purse")).toBe(false);
    expect(actions.some((a) => a.command === "take sealed purse")).toBe(false);

    const pocket = actions.find((a) => a.id === "use_sealed_purse");
    expect(pocket).toBeDefined();
    expect(pocket?.command).toBe("pocket sealed purse");
    expect(pocket?.action).toEqual({ type: "USE", target: "sealed_purse" });
  });

  it("parses and executes the natural pocket command as the bought ending", () => {
    const s = play(initStateForParserPack(index, 7), TO_WAX_LOFT);
    const parsed = parseCommand(index, s, "pocket purse");
    expect(parsed).toEqual({ ok: true, action: { type: "USE", target: "sealed_purse" } });

    const result = step(s, parsed.ok ? parsed.action : { type: "LOOK" });
    expect(result.ok).toBe(true);
    expect(result.state.ended).toBe(true);
    expect(result.state.endingId).toBe("ending_bought");
    expect(result.state.inventory).not.toContain("sealed_purse");
    expect(buildParserObservation(index, result.state).ending?.text).toMatch(/bought/i);
  });

  it("canonical full-score registration remains unchanged", () => {
    const s = play(initStateForParserPack(index, 7), PROVE_FRAUD);

    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_registered");
    expect(buildParserObservation(index, s).score).toBe(pack.meta.max_score);
  });

  it("the pack validates clean", () => {
    const report = validateParser(pack);
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
  });
});
