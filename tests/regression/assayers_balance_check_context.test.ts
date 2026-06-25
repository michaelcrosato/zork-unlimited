/**
 * Regression for bug_0481 -- assayers_mark's optional coin-balance check should
 * read as corroboration, not a mysterious side mechanic.
 *
 * A fresh blind pass (blind-tester/reports/20260623T001332Z_assayers_mark_seed7.md)
 * found the pack mechanically clean, but flagged the `use silver plate on coin balance`
 * skill check as prominent yet opaque: it carried a d20 precision roll, awarded no
 * score, and did not explain whether success or failure mattered. The check is meant
 * to be a convergent corroborating note, while the touchstone remains the proof.
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

const loaded = loadParserPackFile("content/parser/pack/assayers_mark.yaml");
if (!loaded.ok) throw new Error("assayers_mark must compile");
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

const TO_WEIGHING_ROOM_WITH_PLATE = ["take_silver_plate", "go_east"];

const FULL_SCORE_REPORT = [
  "go_west",
  "take_aqua_fortis",
  "use_silver_plate_on_touchstone",
  "use_aqua_fortis_on_touchstone",
  "go_west",
  "read_commission_paper",
  "take_commission_paper",
  "go_east",
  "go_east",
  "read_trial_ledger",
  "go_west",
  "go_north",
];

const actionIds = (s: GameState): string[] =>
  buildParserObservation(index, s)
    .available_actions.map((a) => a.id)
    .sort();

describe("bug_0481 -- assayers_mark contextualizes the optional coin-balance check", () => {
  it("the weighing room frames the check as corroboration, not proof", () => {
    const s = play(initStateForParserPack(index, 7), TO_WEIGHING_ROOM_WITH_PLATE);
    const text = buildParserObservation(index, s).description.toLowerCase();

    expect(s.current).toBe("weighing_room");
    expect(s.inventory).toContain("silver_plate");
    expect(text).toContain("weigh fitch's porringer");
    expect(text).toContain("corroboration");
    expect(text).toContain("only the touchstone can settle the assay");
  });

  it("the visible command uses the natural weighing phrasing and surfaces the d20 precision check", () => {
    const s = play(initStateForParserPack(index, 7), TO_WEIGHING_ROOM_WITH_PLATE);
    const weigh = buildParserObservation(index, s).available_actions.find(
      (a) => a.id === "use_silver_plate_on_coin_balance",
    );

    expect(weigh).toBeDefined();
    expect(weigh!.command).toBe("weigh silver plate on coin balance");
    expect(weigh!.skill_check).toEqual({
      skill: "precision",
      difficulty: 11,
      die: "d20",
    });
  });

  it("after weighing, the check retires and the room records the corroborating note", () => {
    const s = play(initStateForParserPack(index, 7), [
      ...TO_WEIGHING_ROOM_WITH_PLATE,
      "use_silver_plate_on_coin_balance",
    ]);
    const text = buildParserObservation(index, s).description.toLowerCase();

    expect(s.flags["weighed_plate"]).toBe(true);
    expect(actionIds(s)).not.toContain("use_silver_plate_on_coin_balance");
    expect(text).toContain("weight note is made");
    expect(text).toContain("useful corroboration");
    expect(text).toContain("touchstone and commission paper still carry the case");
  });

  it("the check remains optional: after using it, the full-score report route still wins", () => {
    const afterWeigh = play(initStateForParserPack(index, 7), [
      ...TO_WEIGHING_ROOM_WITH_PLATE,
      "use_silver_plate_on_coin_balance",
    ]);

    const won = play(afterWeigh, FULL_SCORE_REPORT);
    expect(won.ended).toBe(true);
    expect(won.endingId).toBe("ending_reported");
    expect(buildParserObservation(index, won).score).toBe(pack.meta.max_score);
  });

  it("the pack validates clean", () => {
    const report = validateParser(pack);
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
  });
});
