/**
 * Regression for bug_0440 — Tide Mill's win ending now resolves the stated fraud brief.
 *
 * The seed-7 blind pass won cleanly but called out a narrative orphan: meta.quest says
 * "trace the mill fraud through water and gear", while ending_saved only rescued the boat
 * and never said what the investigation proved. This pins the intended throughline: the
 * honest win still comes from fixing the real mechanical faults, and the final text closes
 * the Charterhaven fraud report instead of dropping that premise.
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  indexParserPack,
  buildParserRules,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadParserPackFile("content/parser/pack/tide_mill.yaml");
if (!loaded.ok) throw new Error("tide_mill must compile");
const pack = loaded.compiled.pack;
const index = indexParserPack(pack);
const step = makeStep(buildParserRules(index));

function play(s: GameState, ids: string[]): GameState {
  for (const id of ids) {
    const opt = enumerateActions(index, s).find((o) => o.id === id);
    if (!opt) throw new Error(`${id} not legal in ${s.current}`);
    const result = step(s, opt.action);
    expect(result.ok).toBe(true);
    s = result.state;
  }
  return s;
}

describe("bug_0440 — Tide Mill's saved ending closes the mill-fraud investigation", () => {
  it("the honest win still reaches ending_saved at full score", () => {
    const won = play(initStateForParserPack(index, 1), [
      "read_millboard",
      "go_north",
      "take_crank_handle",
      "go_east",
      "take_billhook",
      "take_crow_bar",
      "go_west",
      "go_west",
      "use_billhook_on_choked_sluice",
      "go_east",
      "use_crow_bar_on_brake_pawl",
      "use_crank_handle_on_sea_winch",
      "go_down",
    ]);

    expect(won.ended).toBe(true);
    expect(won.endingId).toBe("ending_saved");
    expect(buildParserObservation(index, won).score).toBe(45);
  });

  it("ending_saved explicitly reports the fraud named by the quest premise", () => {
    expect(pack.meta.world).toBeDefined();
    expect(pack.meta.world!.quest).toContain("trace the mill fraud");
    const saved = pack.endings.find((e) => e.id === "ending_saved")!;
    const text = saved.text.toLowerCase();

    expect(text).toContain("report to charterhaven");
    expect(text).toContain("fraud");
    expect(text).toContain("dropped pawl");
    expect(text).toContain("choked race");
  });
});
