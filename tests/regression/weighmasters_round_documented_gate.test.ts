/**
 * Regression for bug_0441 — The Weighmaster's documented ending must not fire
 * from ledger-only proof.
 *
 * The seed-7 blind pass spotted a likely state-truth gap: after taking Cope's
 * ledger, fraud_proved opened the north exit even if the player had skipped the
 * false/true weighing sequence, while ending_documented claimed "two figures on
 * the receipt". The exit now requires the ledger and both recorded figures.
 */
import { describe, expect, it } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  buildParserRules,
  indexParserPack,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadParserPackFile("content/parser/pack/weighmasters_round.yaml");
if (!loaded.ok) throw new Error("weighmasters_round must compile");
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

const actionIds = (s: GameState): string[] => enumerateActions(index, s).map((o) => o.id);

describe("bug_0441 — Weighmaster's documented ending requires both receipt figures", () => {
  it("ledger-only proof cannot leave north into an ending that claims two figures", () => {
    const ledgerOnly = play(initStateForParserPack(index, 7), [
      "read_merchant_accounts",
      "take_deputy_receipt",
      "go_east",
      "take_grain_sample",
      "go_north",
      "take_hidden_ledger",
      "go_south",
      "go_west",
    ]);

    expect(ledgerOnly.current).toBe("counting_house");
    expect(ledgerOnly.flags["fraud_proved"]).toBe(true);
    expect(ledgerOnly.flags["weighed_false"]).toBeFalsy();
    expect(ledgerOnly.flags["weighed_true"]).toBeFalsy();
    expect(ledgerOnly.vars.score).toBe(25);
    expect(actionIds(ledgerOnly)).not.toContain("go_north");
    expect(ledgerOnly.ended).toBeFalsy();
  });

  it("after both figures are recorded, the documented ending is truthful and still worth 40/40", () => {
    const complete = play(initStateForParserPack(index, 7), [
      "read_merchant_accounts",
      "take_deputy_receipt",
      "go_east",
      "take_grain_sample",
      "go_east",
      "use_grain_sample_on_false_scales",
      "go_west",
      "go_north",
      "use_grain_sample_on_true_scales",
      "take_hidden_ledger",
      "go_south",
      "go_west",
      "go_north",
    ]);

    const observation = buildParserObservation(index, complete);
    expect(complete.ended).toBe(true);
    expect(complete.endingId).toBe("ending_documented");
    expect(observation.score).toBe(40);
    expect(observation.ending?.text).toMatch(/two figures on the receipt/i);
    expect(complete.flags["weighed_false"]).toBe(true);
    expect(complete.flags["weighed_true"]).toBe(true);
  });

  it("the north exit conditions pin the same requirements as the ending text", () => {
    const countingHouse = pack.rooms.find((room) => room.id === "counting_house")!;
    const north = countingHouse.exits.find((exit) => exit.direction === "north")!;
    const conditions = JSON.stringify(north.conditions);

    expect(conditions).toContain("deputy_receipt");
    expect(conditions).toContain("fraud_proved");
    expect(conditions).toContain("weighed_false");
    expect(conditions).toContain("weighed_true");
  });
});
