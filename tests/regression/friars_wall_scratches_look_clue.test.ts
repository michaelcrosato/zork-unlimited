/**
 * Regression for bug_0486 - friars_postern's core wall clue must be visible to
 * LOOK-first parser players, not hidden only behind the scored READ command.
 */
import { describe, expect, it } from "vitest";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import { parseCommand } from "../../src/parser/command_map.js";
import { enumerateActions, resolveParserAction } from "../../src/parser/legal_actions.js";
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

function narrationFor(s: GameState, action: Parameters<typeof resolveParserAction>[2]): string {
  const res = resolveParserAction(index, s, action);
  const effect = res?.effects[0];
  if (!effect || !("narrate" in effect)) throw new Error(`no narration for ${action.type}`);
  return effect.narrate;
}

const HONEST_ESCAPE = [
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
  "use_font",
  "go_north",
];

describe("bug_0486 - friars_postern wall scratches clue is visible on look", () => {
  it("surfaces the full route clue when the player looks at the scratches", () => {
    const s = initStateForParserPack(index, 7);
    const look = narrationFor(s, { type: "LOOK", target: "wall_scratches" });

    expect(look).toMatch(/NO KEY FREES A DEBTOR/i);
    expect(look).toMatch(/OLD WOMAN IN THE COMMONS/i);
    expect(look).toMatch(/PIPE BACK FIRST/i);
    expect(look).toMatch(/TURNKEY'S NOOK/i);
    expect(look).toMatch(/DO NOT TRUST THE GATE/i);
  });

  it("parses look at scratches and leaves READ as the scored formal reading", () => {
    let s = initStateForParserPack(index, 7);
    const parsed = parseCommand(index, s, "look at scratches");
    expect(parsed).toEqual({ ok: true, action: { type: "LOOK", target: "wall_scratches" } });

    const looked = step(s, parsed.ok ? parsed.action : { type: "LOOK" });
    expect(looked.ok).toBe(true);
    s = looked.state;
    expect(s.flags.read_clue ?? false).toBe(false);
    expect(buildParserObservation(index, s).score).toBe(0);

    s = play(s, ["read_wall_scratches"]);
    expect(s.flags.read_clue).toBe(true);
    expect(buildParserObservation(index, s).score).toBe(5);
  });

  it("canonical honest escape remains max score", () => {
    const s = play(initStateForParserPack(index, 7), HONEST_ESCAPE);

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
