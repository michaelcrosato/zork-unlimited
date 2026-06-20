/**
 * Regression for bug_0375 - assayers_mark must not say the court gate is clear
 * while the north exit is still blocked.
 *
 * The blind playtest 20260620T111259Z_assayers_mark_seed7 proved the debased
 * plate with acid, then saw the assay hall claim "the court gate north is now
 * clear" even though the structured observation still blocked north until the
 * commission paper was taken. Prose and legal-action state must agree.
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

const PROVE_ON_TOUCHSTONE = [
  "take_silver_plate",
  "take_aqua_fortis",
  "use_silver_plate_on_touchstone",
  "use_aqua_fortis_on_touchstone",
];

describe("bug_0375 - assayers_mark court-gate prose matches exit state", () => {
  it("after proving debasement but before taking the commission paper, the room does not claim north is clear", () => {
    const s = play(initStateForParserPack(index, 7), PROVE_ON_TOUCHSTONE);
    expect(s.current).toBe("assay_hall");
    expect(s.flags["proved_debased"]).toBe(true);
    expect(s.inventory).not.toContain("commission_paper");

    const obs = buildParserObservation(index, s);
    expect(obs.description).toContain("assay complete");
    expect(obs.description).toMatch(/commission paper in the record room still has to name/i);
    expect(obs.description).not.toMatch(/court gate north is now clear/i);
    expect(obs.exits.map((e) => e.direction)).not.toContain("north");
    expect(obs.blocked_exits.find((e) => e.direction === "north")?.message).toMatch(
      /need both: the touchstone's verdict and the commission paper/i,
    );
  });

  it("once the commission paper is taken too, the room says north is clear and the blocked hint retires", () => {
    const s = play(initStateForParserPack(index, 7), [
      ...PROVE_ON_TOUCHSTONE,
      "go_west",
      "take_commission_paper",
      "go_east",
    ]);
    expect(s.inventory).toContain("commission_paper");

    const obs = buildParserObservation(index, s);
    expect(obs.description).toMatch(/court gate north is now clear/i);
    expect(obs.exits.map((e) => e.direction)).toContain("north");
    expect(obs.blocked_exits.some((e) => e.direction === "north")).toBe(false);
  });

  it("canonical full-score completion is unchanged", () => {
    const won = play(initStateForParserPack(index, 7), [
      ...PROVE_ON_TOUCHSTONE,
      "go_west",
      "read_commission_paper",
      "take_commission_paper",
      "go_east",
      "go_east",
      "read_trial_ledger",
      "go_west",
      "go_north",
    ]);

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
