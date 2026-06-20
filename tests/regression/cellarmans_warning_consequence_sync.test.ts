/**
 * Regression for bug_0376 - cellarmans_dark warning text must describe the
 * consequence the pack actually enforces.
 *
 * The blind playtest 20260620T113147Z_cellarmans_dark_seed7 read "NO NAKED
 * FLAME" as a promise that lighting the lamp inside the oil-store was dangerous.
 * The real lethal act is opening the cracked spirit-cask while the lamp burns.
 * The warning surfaces should say that directly.
 */
import { describe, expect, it } from "vitest";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import { enumerateActions, resolveParserAction } from "../../src/parser/legal_actions.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  buildParserRules,
  indexParserPack,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { validateParser } from "../../src/validate/parser_validator.js";

const loaded = loadParserPackFile("content/parser/pack/cellarmans_dark.yaml");
if (!loaded.ok) throw new Error("cellarmans_dark must compile");
const pack = loaded.compiled.pack;
const index = indexParserPack(pack);
const step = makeStep(buildParserRules(index));

function playCapture(s: GameState, ids: string[]): { state: GameState; narration: string } {
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

function examineNarration(s: GameState, target: string): string {
  const res = resolveParserAction(index, s, { type: "LOOK", target });
  const effect = res?.effects[0];
  if (!effect || !("narrate" in effect)) throw new Error(`no examine narration for ${target}`);
  return effect.narrate;
}

const READY_TO_LIGHT_IN_STORE = [
  "go_down",
  "take_lamp",
  "take_tinderbox",
  "go_east",
  "take_oil_jar",
  "use_oil_jar_on_lamp",
];

describe("bug_0376 - cellarmans_dark warnings match the enforced flame consequence", () => {
  it("the cellarman's note warns against opening the cracked cask under flame, not against merely lighting the lamp", () => {
    const { narration } = playCapture(initStateForParserPack(index, 7), [
      "go_down",
      "read_cellarman_note",
    ]);

    expect(narration).toMatch(/do not draw the bung under flame/i);
    expect(narration).toMatch(/do not open under any circumstances/i);
    expect(narration).not.toMatch(/no naked flame/i);
  });

  it("lighting the lamp inside the oil-store remains safe and no longer contradicts the warning text", () => {
    const { state, narration } = playCapture(initStateForParserPack(index, 7), [
      ...READY_TO_LIGHT_IN_STORE,
      "use_tinderbox_on_lamp",
    ]);

    expect(state.current).toBe("oil_store");
    expect(state.flags["lamp_lit"]).toBe(true);
    expect(state.ended).toBe(false);
    expect(narration).toMatch(/The lamp is lit/i);
  });

  it("the lit oil-store and cask examine text name opening the bung as the danger", () => {
    const { state } = playCapture(initStateForParserPack(index, 7), [
      ...READY_TO_LIGHT_IN_STORE,
      "use_tinderbox_on_lamp",
    ]);

    const room = buildParserObservation(index, state).description;
    const cask = examineNarration(state, "spirit_cask");
    expect(room).toMatch(/do not draw the bung under flame/i);
    expect(cask).toMatch(/do not draw the bung under flame/i);
    expect(room).not.toMatch(/no naked flame while cask stands/i);
    expect(cask).not.toMatch(/no naked flame while cask stands/i);
  });

  it("opening the cask under flame still reaches the ignition death", () => {
    const { state } = playCapture(initStateForParserPack(index, 7), [
      ...READY_TO_LIGHT_IN_STORE,
      "use_tinderbox_on_lamp",
      "use_tinderbox_on_spirit_cask",
    ]);

    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_ignited");
  });

  it("the pack validates clean", () => {
    const report = validateParser(pack);
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
  });
});
