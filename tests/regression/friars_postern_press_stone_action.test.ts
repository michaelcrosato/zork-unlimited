/**
 * Regression for bug_0380 — friars_postern promised a tactile "press the third
 * stone" puzzle but let the player simply walk north after learning the trick.
 *
 * The 2026-06-20 blind playtest of friars_postern (seed 7) called this out as the
 * pack's clearest design gap: the old debtor gives specific physical instructions
 * ("third stone up from the floor — press it slow and even"), yet no press action
 * existed. The instruction felt like flavour instead of a real puzzle step.
 *
 * Locked here:
 *   (1) before the telling, neither the press action nor the north exit is legal;
 *   (2) after the telling, `press stone font` is legal and typeable as
 *       `press third stone`, while `go north` is still hidden;
 *   (3) pressing the stone sets `postern_opened`, retires the press action, reveals
 *       the north exit, and the honest route still wins at 35/35.
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  buildParserRules,
  indexParserPack,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";
import { parseCommand } from "../../src/parser/command_map.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadParserPackFile("content/parser/pack/friars_postern.yaml");
if (!loaded.ok) throw new Error("friars_postern must compile");
const index = indexParserPack(loaded.compiled.pack);
const step = makeStep(buildParserRules(index));

function start(): GameState {
  return initStateForParserPack(index, 7);
}

function legalIds(s: GameState): string[] {
  return enumerateActions(index, s).map((o) => o.id);
}

function play(s: GameState, ids: string[]): GameState {
  for (const id of ids) {
    const opt = enumerateActions(index, s).find((o) => o.id === id);
    if (!opt) throw new Error(`"${id}" not legal in ${s.current}: [${legalIds(s).join(", ")}]`);
    const r = step(s, opt.action);
    expect(r.ok, `step ${id} ok`).toBe(true);
    s = r.state;
  }
  return s;
}

const TO_CHAPEL_COLD = ["go_north", "go_up"];

const TO_CHAPEL_KNOWING = [
  "read_wall_scratches",
  "go_north",
  "go_east",
  "take_clay_pipe",
  "go_west",
  "go_west",
  "talk_old_debtor",
  "ask_escape",
  "ask_give_pipe",
  "ask_bye",
  "go_east",
  "go_up",
];

describe("bug_0380 — friars_postern makes the third-stone instruction actionable", () => {
  it("(1) before the telling, the chapel exposes neither the press action nor the north exit", () => {
    const s = play(start(), TO_CHAPEL_COLD);
    expect(s.current).toBe("chapel");
    expect(s.flags.knows_postern ?? false).toBe(false);
    expect(legalIds(s)).not.toContain("use_font");
    expect(legalIds(s)).not.toContain("go_north");
  });

  it("(2) after the telling, `press stone font` is legal and typeable, but north is still hidden", () => {
    const s = play(start(), TO_CHAPEL_KNOWING);
    expect(s.current).toBe("chapel");
    expect(s.flags.knows_postern).toBe(true);
    expect(s.flags.postern_opened ?? false).toBe(false);

    const press = enumerateActions(index, s).find((a) => a.id === "use_font");
    expect(press).toBeDefined();
    expect(press!.command).toBe("press stone font");
    expect(press!.action).toEqual({ type: "USE", target: "font" });
    expect(legalIds(s)).not.toContain("go_north");

    expect(parseCommand(index, s, "press third stone")).toEqual({
      ok: true,
      action: { type: "USE", target: "font" },
    });
  });

  it("(3) pressing the stone opens the postern, retires the press action, and preserves the win", () => {
    const opened = play(start(), [...TO_CHAPEL_KNOWING, "use_font"]);
    expect(opened.flags.postern_opened).toBe(true);
    expect(legalIds(opened)).not.toContain("use_font");
    expect(legalIds(opened)).toContain("go_north");
    expect(buildParserObservation(index, opened).description).toContain("postern ajar");

    const won = play(opened, ["go_north"]);
    expect(won.ended).toBe(true);
    expect(won.endingId).toBe("ending_free");
    expect(won.vars.score).toBe(35);
  });
});
