/**
 * Regression for bug_0483 -- chandlers_lot's back-lane exit should read as an
 * abandonment branch, not as unused exploratory scenery.
 *
 * A fresh blind pass (blind-tester/reports/20260623T004316Z_chandlers_lot_seed7.md)
 * flagged the south exit as a false affordance: it was visible from the counting
 * room, never needed by the good route, and had no up-front signal that it ends
 * the case. Once proof is stamped, it also risked converting a full-score proof
 * state into the unregistered ending.
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
  "go_down",
  "go_west",
];

const actionIds = (s: GameState): string[] => enumerateActions(index, s).map((a) => a.id);

describe("bug_0483 -- chandlers_lot makes the back lane an explicit abandonment branch", () => {
  it("the starting room warns that south abandons the unregistered inspection", () => {
    const obs = buildParserObservation(index, initStateForParserPack(index, 7));

    expect(obs.description).toMatch(/back lane\s+south is no shortcut/i);
    expect(obs.description).toMatch(/abandon the inspection unregistered/i);
    expect(actionIds(initStateForParserPack(index, 7))).toContain("go_south");
  });

  it("taking the south exit before proof reaches the unproved ending below perfect score", () => {
    const abandoned = play(initStateForParserPack(index, 7), ["go_south"]);
    const obs = buildParserObservation(index, abandoned);

    expect(abandoned.ended).toBe(true);
    expect(abandoned.endingId).toBe("ending_unproved");
    expect(obs.score).toBeLessThan(pack.meta.max_score);
    expect(obs.description).toMatch(/choice the lane\s+offered/i);
    expect(obs.description).toMatch(/Final score: 0 of 40/i);
  });

  it("after stamped proof, south is blocked and points the player to guildhall registration", () => {
    const proved = play(initStateForParserPack(index, 7), PROVE_FRAUD);
    const obs = buildParserObservation(index, proved);
    const south = obs.blocked_exits.find((exit) => exit.direction === "south");

    expect(proved.flags["fraud_proved"]).toBe(true);
    expect(obs.score).toBe(pack.meta.max_score);
    expect(actionIds(proved)).not.toContain("go_south");
    expect(south?.message).toMatch(/fraud stamped/i);
    expect(south?.message).toMatch(/register it at guildhall/i);
    expect(obs.description).toMatch(/back-lane door/i);
    expect(obs.description).toMatch(/squander stamped proof/i);
  });

  it("the full-score route still registers the proof at guildhall", () => {
    const won = play(initStateForParserPack(index, 7), [...PROVE_FRAUD, "go_north"]);

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
