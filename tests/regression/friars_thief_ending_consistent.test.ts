/**
 * Regression (§15) for bug_0186 — content_fix on friars_postern (the 11th pack, bug_0185).
 *
 * The mandated blind pass this cycle (friars_postern, parser, seed 11) reached all three endings,
 * rated the pack clarity 5/5 / enjoyment 4/5 with ZERO mechanical bugs, and flagged ONE concrete
 * stale-text flaw: the ending_thief ("The Poor-Fund") epilogue unconditionally asserted "The old
 * woman never told you the postern's trick, and now she never will." But the alms-box that fires
 * ending_thief is reachable from BOTH states — robbed WITHOUT ever learning the postern, OR robbed
 * AFTER the old woman has already told you (knows_postern set, postern open). On the rob-after-
 * learning route the tester took, that line is false. The fix rewrote the epilogue to be true in
 * both states (it now names the honest way out only as the thing the thief turned FROM).
 *
 * Locked here:
 *   (1) ending_thief is genuinely reachable from BOTH the no-telling and the post-telling states;
 *   (2) the epilogue no longer claims the old woman never told the postern's trick;
 *   (3) it still reads as the greed/poor-fund ending (names the poor-fund and the turning-away).
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  indexParserPack,
  buildParserRules,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadParserPackFile("content/parser/pack/friars_postern.yaml");
if (!loaded.ok) throw new Error("friars_postern must compile");
const pack = loaded.compiled.pack;
const index = indexParserPack(pack);
const step = makeStep(buildParserRules(index));

const start = (): GameState => initStateForParserPack(index, 1);

function play(s: GameState, ids: string[]): GameState {
  for (const id of ids) {
    const opt = enumerateActions(index, s).find((o) => o.id === id);
    if (!opt) {
      const legal = enumerateActions(index, s).map((o) => o.id);
      throw new Error(`"${id}" not legal in ${s.current}: [${legal.join(", ")}]`);
    }
    const r = step(s, opt.action);
    expect(r.ok, `step ${id} ok`).toBe(true);
    s = r.state;
  }
  return s;
}

const TO_KEY = ["go_north", "go_east", "take_gate_key", "go_west"]; // gallery -> lodge(key) -> gallery
const LEARN = [
  "read_wall_scratches",
  "go_north", // gallery
  "go_east", // lodge
  "take_clay_pipe",
  "take_gate_key",
  "go_west", // gallery
  "go_west", // commons
  "talk_old_debtor",
  "ask_escape", // heard_postern
  "ask_give_pipe", // knows_postern (removes pipe)
  "ask_bye",
  "go_east", // back to gallery
];

const thiefEnding = pack.endings.find((e) => e.id === "ending_thief")!;

describe("bug_0186 — friars_postern ending_thief epilogue is true in both reachable states", () => {
  it("(1a) ending_thief is reachable WITHOUT learning the postern", () => {
    const robbed = play(start(), [...TO_KEY, "go_up", "unlock_alms_box"]);
    expect(robbed.ended).toBe(true);
    expect(robbed.endingId).toBe("ending_thief");
    expect(robbed.flags.knows_postern ?? false).toBe(false);
  });

  it("(1b) ending_thief is also reachable AFTER learning the postern (the contradicting route)", () => {
    const robbed = play(start(), [...LEARN, "go_up", "unlock_alms_box"]);
    expect(robbed.ended).toBe(true);
    expect(robbed.endingId).toBe("ending_thief");
    // the state the old epilogue contradicted: she HAD told you, the postern was open.
    expect(robbed.flags.knows_postern).toBe(true);
  });

  it("(2) the epilogue no longer asserts the old woman never told the postern's trick", () => {
    expect(thiefEnding.text.toLowerCase()).not.toContain("never told you the postern");
    // belt-and-braces: no surviving phrasing that claims the telling did not happen.
    expect(thiefEnding.text.toLowerCase()).not.toMatch(/never (told|tell) you/);
  });

  it("(3) it still reads as the greed / poor-fund ending", () => {
    const t = thiefEnding.text.toLowerCase();
    expect(t).toContain("poor-fund");
    expect(t).toContain("turned your back");
  });
});
