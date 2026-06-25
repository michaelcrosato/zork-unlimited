/**
 * Regression for bug_0480 -- apothecaries_standard's optional drain-cock skill check
 * should read like a concrete, low-risk examiner action.
 *
 * A fresh blind pass (blind-tester/reports/20260622T235932Z_apothecaries_standard_seed7.md)
 * found the pack mechanically clean, but called out the drain-cock skill check as
 * opaque: the action displayed as "check glass drawstick on drain cock", and the
 * room did not explain why a player would roll steadiness or what failure meant.
 *
 * The fix keeps the check optional and convergent, but the room now frames it as a
 * recency check on the batch and names the harmless spill risk. The command displays
 * as "check drain cock with glass drawstick", matching the fiction.
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

const TO_DISPENSARY_WITH_DRAWSTICK = ["take_glass_drawstick", "go_east"];

const FULL_CASE_AFTER_DRAWSTICK = [
  "read_dispensatory",
  "use_glass_drawstick_on_suspect_vial",
  "use_glass_drawstick_on_dispensatory",
  "go_east",
  "read_dispensing_ledger",
  "take_sample_vials",
  "go_west",
  "go_north",
];

describe("bug_0480 -- apothecaries_standard drain-cock check is contextualized", () => {
  it("the dispensary text explains the optional recency check and harmless spill risk", () => {
    const s = play(initStateForParserPack(index, 7), TO_DISPENSARY_WITH_DRAWSTICK);
    const obs = buildParserObservation(index, s);
    const text = obs.description.toLowerCase();

    expect(s.current).toBe("dispensary");
    expect(s.inventory).toContain("glass_drawstick");
    expect(text).toContain("drain-cock");
    expect(text).toContain("checked with the glass drawstick");
    expect(text).toContain("date the batch's last decanting");
    expect(text).toContain("spill only a few sweet drops");
  });

  it("the visible command names the target first and surfaces the d20 check", () => {
    const s = play(initStateForParserPack(index, 7), TO_DISPENSARY_WITH_DRAWSTICK);
    const check = buildParserObservation(index, s).available_actions.find(
      (a) => a.id === "use_glass_drawstick_on_drain_cock",
    );

    expect(check).toBeDefined();
    expect(check!.command).toBe("check drain cock with glass drawstick");
    expect(check!.skill_check).toEqual({
      skill: "steadiness",
      difficulty: 11,
      die: "d20",
    });
  });

  it("checking the drain cock remains optional: the case can still be won afterward", () => {
    const afterCheck = play(initStateForParserPack(index, 7), [
      ...TO_DISPENSARY_WITH_DRAWSTICK,
      "use_glass_drawstick_on_drain_cock",
      "go_west",
    ]);

    const won = play(afterCheck, FULL_CASE_AFTER_DRAWSTICK);
    expect(won.ended).toBe(true);
    expect(won.endingId).toBe("ending_presented");
    expect(buildParserObservation(index, won).score).toBe(pack.meta.max_score);
  });

  it("the sample-secured dispensary variant keeps the optional check context if it is still unused", () => {
    const s = play(initStateForParserPack(index, 7), [
      ...TO_DISPENSARY_WITH_DRAWSTICK,
      "take_sample_vials",
    ]);
    const text = buildParserObservation(index, s).description.toLowerCase();

    expect(s.inventory).toContain("sample_vials");
    expect(s.flags["drain_checked"]).toBeUndefined();
    expect(text).toContain("sample vials secured");
    expect(text).toContain("could still be checked with the glass drawstick");
  });

  it("the pack validates clean", () => {
    const report = validateParser(pack);
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
  });
});
