/**
 * Regression (§15) for bug_0306 — friars_postern chapel and font no longer claim
 * the postern was ALREADY opened before the player acted.
 *
 * A fresh blind playtest (seed 7, ai-runs/2026-06-08T09-33-59-299Z/playtest.md)
 * found that the chapel's `knows_postern` variant read "the third stone above its
 * base, pressed slow as the old woman said, has swung the friars' postern inward"
 * upon entry — past-tense, as if the player had already pressed the stone. No
 * "press stone" action was ever offered; the postern appeared to open itself. Same
 * issue on the font: "Pressed slow, it has worked the friars' postern open." The
 * old woman's precise latch instructions felt like decoration, not a puzzle to
 * execute — the earned "aha" moment was absent.
 *
 * Fix: pure prose. Both `knows_postern` variants changed to present/conditional
 * framing so the stone is described as visible and ready, not already pressed:
 *   chapel → "stands a little proud of its fellows, waiting for a slow hand"
 *   font   → "it will swing the postern open" (replaces "it has worked… open")
 * No flag, condition, exit, score, or ending changed.
 *
 * Locked here:
 *   (1) chapel base text (no knows_postern) contains "close and blind", not "proud";
 *   (2) chapel knows_postern variant shows "waiting for a slow hand", never "has swung";
 *   (3) font knows_postern variant shows "will swing", never "has worked";
 *   (4) win route intact: ending_free at 35/35 after learning, pressing, and leaving
 *       through the postern.
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  indexParserPack,
  buildParserRules,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { enumerateActions, resolveParserAction } from "../../src/parser/legal_actions.js";
import { roomDescription } from "../../src/parser/model.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadParserPackFile("content/parser/pack/friars_postern.yaml");
if (!loaded.ok) throw new Error("friars_postern must compile");
const pack = loaded.compiled.pack;
const index = indexParserPack(pack);
const step = makeStep(buildParserRules(index));

function start(): GameState {
  return initStateForParserPack(index, 7);
}

function play(s: GameState, ids: string[]): GameState {
  for (const id of ids) {
    const opt = enumerateActions(index, s).find((o) => o.id === id);
    if (!opt)
      throw new Error(
        `"${id}" not legal in ${s.current}: [${enumerateActions(index, s)
          .map((o) => o.id)
          .join(", ")}]`,
      );
    const r = step(s, opt.action);
    expect(r.ok, `step ${id} ok`).toBe(true);
    s = r.state;
  }
  return s;
}

function chapelText(s: GameState): string {
  return roomDescription(index.rooms.get("chapel")!, s);
}

function fontExamine(s: GameState): string {
  const res = resolveParserAction(index, s, { type: "LOOK", target: "font" });
  const eff = res?.effects.find((e) => "narrate" in e) as { narrate: string } | undefined;
  if (!eff) throw new Error(`no examine narration for font in ${s.current}`);
  return eff.narrate;
}

// Sequence to learn the postern, then arrive at the chapel.
const TO_CHAPEL_KNOWING = [
  "read_wall_scratches",
  "go_north", // gallery
  "go_east", // lodge
  "take_clay_pipe",
  "go_west", // gallery
  "go_west", // commons
  "talk_old_debtor",
  "ask_escape", // heard_postern +10
  "ask_give_pipe", // knows_postern
  "ask_bye",
  "go_east", // gallery
  "go_up", // chapel
];

describe("bug_0306 — chapel and font describe the stone as ready, not already pressed", () => {
  it("(1) chapel base (no knows_postern) shows close-fit stone, not the proud stone variant", () => {
    // Arrive at the chapel WITHOUT having learned the postern.
    const s = play(start(), ["go_north", "go_up"]);
    expect(s.current).toBe("chapel");
    expect(s.flags.knows_postern ?? false).toBe(false);
    const text = chapelText(s);
    expect(text).toContain("close and blind");
    expect(text).not.toContain("stands a little proud");
    expect(text).not.toContain("has swung");
  });

  it("(2) chapel knows_postern variant shows 'waiting for a slow hand', never 'has swung'", () => {
    const s = play(start(), TO_CHAPEL_KNOWING);
    expect(s.current).toBe("chapel");
    expect(s.flags.knows_postern).toBe(true);
    const text = chapelText(s);
    expect(text).toContain("stands a little proud");
    expect(text).toContain("waiting for a slow hand");
    expect(text).not.toContain("has swung");
    expect(text).not.toContain("swung the friars' postern inward");
  });

  it("(3) font knows_postern variant shows 'will swing', never 'has worked'", () => {
    const s = play(start(), TO_CHAPEL_KNOWING);
    expect(s.current).toBe("chapel");
    const text = fontExamine(s);
    expect(text).toContain("stands a little proud");
    expect(text).toContain("will swing");
    expect(text).not.toContain("has worked");
  });

  it("(4) win route intact: ending_free at 35/35 after the postern is known", () => {
    const s = play(start(), [...TO_CHAPEL_KNOWING, "use_font", "go_north"]);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_free");
    expect(s.vars.score ?? 0).toBe(35);
  });
});
