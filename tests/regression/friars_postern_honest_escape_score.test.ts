/**
 * Regression for bug_0434 - friars_postern awarded max score before the moral branch.
 *
 * A blind playtest reached the old woman's full telling, then unlocked the poor-fund
 * and ended at ending_thief with 35/35. The final score award now belongs to the
 * honest escape through the postern, so learning the route is not enough to make a
 * greed ending look perfect.
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

const loaded = loadParserPackFile("content/parser/pack/friars_postern.yaml");
if (!loaded.ok) throw new Error("friars_postern must compile");
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

const LEARN_WITH_KEY = [
  "read_wall_scratches", // +5
  "go_north",
  "go_east",
  "take_clay_pipe",
  "take_gate_key",
  "go_west",
  "go_west",
  "talk_old_debtor",
  "ask_escape", // +10
  "ask_give_pipe", // knows_postern, no score
  "ask_bye",
  "go_east",
  "go_up",
];

describe("bug_0434 - friars_postern max score requires the honest escape", () => {
  it("learning the latch leaves the player below max score", () => {
    const s = play(initStateForParserPack(index, 7), LEARN_WITH_KEY);

    expect(s.flags.knows_postern).toBe(true);
    expect(buildParserObservation(index, s).score).toBe(15);
    expect(pack.meta.max_score).toBe(35);
  });

  it("robbing the poor-fund after learning the postern is not a max-score result", () => {
    const s = play(initStateForParserPack(index, 7), [...LEARN_WITH_KEY, "unlock_alms_box"]);

    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_thief");
    expect(s.flags.knows_postern).toBe(true);
    expect(buildParserObservation(index, s).score).toBeLessThan(pack.meta.max_score);
  });

  it("robbing the poor-fund after opening the postern is still below max score", () => {
    const s = play(initStateForParserPack(index, 7), [
      ...LEARN_WITH_KEY,
      "use_font",
      "unlock_alms_box",
    ]);

    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_thief");
    expect(s.flags.postern_opened).toBe(true);
    expect(buildParserObservation(index, s).score).toBe(15);
  });

  it("the honest postern escape earns the final award and reaches max score", () => {
    const s = play(initStateForParserPack(index, 7), [...LEARN_WITH_KEY, "use_font", "go_north"]);

    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_free");
    expect(buildParserObservation(index, s).score).toBe(pack.meta.max_score);
  });

  it("the pack validates clean", () => {
    const report = validateParser(pack);
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
  });
});
