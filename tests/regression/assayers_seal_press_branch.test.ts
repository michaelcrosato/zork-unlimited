/**
 * Regression for bug_0427 - assayers_mark's corruption branch must be an
 * explicit press action, not a surprising TAKE side effect.
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

const PROVE_CASE = [
  "take_silver_plate",
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

describe("bug_0427 - assayers_mark seal corruption branch is explicit", () => {
  it("offers pressing the seal, not taking it, in the record room", () => {
    const s = play(initStateForParserPack(index, 7), ["go_west"]);
    const actions = enumerateActions(index, s);

    expect(actions.some((a) => a.id === "take_master_seal")).toBe(false);
    expect(actions.some((a) => a.command === "take master's seal")).toBe(false);

    const press = actions.find((a) => a.id === "use_master_seal");
    expect(press).toBeDefined();
    expect(press?.command).toBe("press master's seal");
    expect(press?.action).toEqual({ type: "USE", target: "master_seal" });
  });

  it("parses and executes the natural press command as the suppressed ending", () => {
    const s = play(initStateForParserPack(index, 7), ["go_west"]);
    const parsed = parseCommand(index, s, "press seal");
    expect(parsed).toEqual({ ok: true, action: { type: "USE", target: "master_seal" } });

    const result = step(s, parsed.ok ? parsed.action : { type: "LOOK" });
    expect(result.ok).toBe(true);
    expect(result.state.ended).toBe(true);
    expect(result.state.endingId).toBe("ending_suppressed");
    expect(result.state.inventory).not.toContain("master_seal");
    expect(buildParserObservation(index, result.state).ending?.text).toMatch(/approved it/i);
  });

  it("canonical full-score report remains unchanged", () => {
    const s = play(initStateForParserPack(index, 7), PROVE_CASE);

    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_reported");
    expect(buildParserObservation(index, s).score).toBe(pack.meta.max_score);
  });

  it("the pack validates clean", () => {
    const report = validateParser(pack);
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
  });
});
