/**
 * Regression for bug_0377 - chandlers_lot must name the required book clearly.
 *
 * The blind playtest 20260620T114448Z_chandlers_lot_seed7 flagged the guildhall
 * blocker's "chandler's own book" wording as ambiguous because both the public
 * tallow ledger and the private adulteration book are the chandler's books. Only
 * the private adulteration book is portable and required at the guildhall.
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
];

describe("bug_0377 - chandlers_lot guildhall names the private adulteration book", () => {
  it("the locked guildhall hint asks for the private adulteration book, not an ambiguous chandler's book", () => {
    const s = initStateForParserPack(index, 7);
    const obs = buildParserObservation(index, s);
    const north = obs.blocked_exits.find((e) => e.direction === "north");

    expect(north?.message).toMatch(/private adulteration book/i);
    expect(north?.message).not.toMatch(/chandler's own book/i);
    expect(enumerateActions(index, s).map((o) => o.id)).not.toContain("take_tallow_ledger");
  });

  it("after proof is stamped, the counting-room text keeps naming the private book", () => {
    const s = play(initStateForParserPack(index, 7), [...PROVE_FRAUD, "go_down", "go_west"]);
    const obs = buildParserObservation(index, s);

    expect(s.current).toBe("counting_room");
    expect(obs.description).toMatch(/private adulteration book/i);
    expect(obs.description).not.toMatch(/chandler's own book/i);
  });

  it("canonical completion is unchanged", () => {
    const won = play(initStateForParserPack(index, 7), [
      ...PROVE_FRAUD,
      "go_down",
      "go_west",
      "go_north",
    ]);

    expect(won.ended).toBe(true);
    expect(won.endingId).toBe("ending_registered");
    expect(buildParserObservation(index, won).score).toBe(pack.meta.max_score);
  });

  it("the pack validates clean", () => {
    const report = validateParser(pack);
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
  });
});
