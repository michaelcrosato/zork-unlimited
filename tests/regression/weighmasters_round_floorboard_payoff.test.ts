/**
 * Regression for bug_0387: The Weighmaster's Round over-signalled the loose
 * floorboard with a crowbar and d20 check, but success produced only atmosphere.
 * The board now reveals optional supporting evidence instead of being a dead end.
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
const index = indexParserPack(loaded.compiled.pack);
const step = makeStep(buildParserRules(index));

function play(s: GameState, ids: string[]): { state: GameState; narration: string } {
  let narration = "";
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
    narration = result.events
      .filter((e): e is { type: "narration"; text: string } => e.type === "narration")
      .map((e) => e.text)
      .join(" ");
  }
  return { state: s, narration };
}

const actionIds = (s: GameState): string[] => enumerateActions(index, s).map((o) => o.id);
const desc = (s: GameState): string => buildParserObservation(index, s).description;

describe("bug_0387 — weighmasters_round loose floorboard has a real payoff", () => {
  it("checking the floorboard reveals supporting evidence and retires the check", () => {
    const beforeCheck = play(initStateForParserPack(index, 7), [
      "read_merchant_accounts",
      "take_deputy_receipt",
      "go_east",
      "take_grain_sample",
      "take_warehouse_crowbar",
      "go_north",
      "read_hidden_ledger",
      "take_hidden_ledger",
    ]);
    const scoreBefore = beforeCheck.state.vars.score ?? 0;
    const checked = play(beforeCheck.state, ["use_warehouse_crowbar_on_loose_board"]);

    expect(checked.state.flags["board_checked"]).toBe(true);
    expect(checked.state.vars.score ?? 0).toBe(scoreBefore);
    expect(checked.narration).toMatch(/spare off-centre fulcrum casting/i);
    expect(checked.state.journal.join("\n")).toMatch(/calibration cache/i);
    expect(actionIds(checked.state)).not.toContain("use_warehouse_crowbar_on_loose_board");

    const observation = buildParserObservation(index, checked.state);
    expect(observation.visible_objects.find((o) => o.id === "loose_board")?.name).toBe(
      "opened floorboard",
    );
    expect(desc(checked.state)).toMatch(/shallow hiding place/i);
    expect(desc(checked.state)).toMatch(/lead shavings/i);
  });

  it("the optional floorboard evidence carries through to the full 40-point win", () => {
    const done = play(initStateForParserPack(index, 7), [
      "read_merchant_accounts",
      "take_deputy_receipt",
      "go_east",
      "take_grain_sample",
      "take_warehouse_crowbar",
      "go_north",
      "read_hidden_ledger",
      "take_hidden_ledger",
      "use_warehouse_crowbar_on_loose_board",
      "go_south",
      "go_east",
      "use_grain_sample_on_false_scales",
      "go_west",
      "go_north",
      "use_grain_sample_on_true_scales",
      "go_south",
      "go_west",
      "go_north",
    ]);

    const observation = buildParserObservation(index, done.state);
    expect(done.state.ended).toBe(true);
    expect(done.state.endingId).toBe("ending_documented");
    expect(observation.score).toBe(40);
    expect(observation.ending?.text).toMatch(/cache under the board/i);
    expect(observation.ending?.text).toMatch(/no accident of casting/i);
  });
});
