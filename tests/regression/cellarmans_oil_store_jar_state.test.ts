/**
 * Regression for bug_0428 - cellarmans_dark must not keep placing the oil jar
 * on the oil-store shelf after the player has taken or emptied it.
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

function examineNarration(s: GameState, target: string): string {
  const res = resolveParserAction(index, s, { type: "LOOK", target });
  const effect = res?.effects[0];
  if (!effect || !("narrate" in effect)) throw new Error(`no examine narration for ${target}`);
  return effect.narrate;
}

const READY_TO_FILL = ["go_down", "take_lamp", "take_tinderbox", "go_east", "take_oil_jar"];
const FULL_WIN = [
  "go_down",
  "read_cellarman_note",
  "take_lamp",
  "take_tinderbox",
  "go_east",
  "take_oil_jar",
  "go_west",
  "use_oil_jar_on_lamp",
  "use_tinderbox_on_lamp",
  "go_west",
  "take_deed_box",
  "go_east",
  "go_up",
  "go_north",
];

describe("bug_0428 - cellarmans_dark oil-store jar state stays truthful", () => {
  it("after taking the jar in the dark, the oil-store shelf is described as bare", () => {
    const s = play(initStateForParserPack(index, 7), READY_TO_FILL);
    const obs = buildParserObservation(index, s);

    expect(s.current).toBe("oil_store");
    expect(s.inventory).toContain("oil_jar");
    expect(obs.description).toMatch(/low shelf just inside the door is bare/i);
    expect(obs.description).toMatch(/oil-jar is with you/i);
    expect(obs.description).not.toMatch(/right to hand/i);
    expect(obs.visible_objects.map((o) => o.id)).not.toContain("oil_jar");
  });

  it("after filling and lighting the lamp, the empty jar remains carried and does not reappear on the shelf", () => {
    const s = play(initStateForParserPack(index, 7), [
      ...READY_TO_FILL,
      "use_oil_jar_on_lamp",
      "use_tinderbox_on_lamp",
    ]);
    const obs = buildParserObservation(index, s);

    expect(s.flags["lamp_oiled"]).toBe(true);
    expect(s.flags["lamp_lit"]).toBe(true);
    expect(s.inventory).toContain("oil_jar");
    expect(obs.description).toMatch(/low shelf just inside the door is bare/i);
    expect(obs.description).toMatch(/oil from its jar is in the lamp/i);
    expect(obs.description).not.toMatch(/An oil-jar sits on the low shelf/i);
    expect(obs.visible_objects.map((o) => o.id)).not.toContain("oil_jar");
    expect(enumerateActions(index, s).some((a) => a.id === "take_oil_jar")).toBe(false);
    expect(examineNarration(s, "oil_jar")).toMatch(/empty now/i);
  });

  it("canonical full-score recovery remains unchanged", () => {
    const s = play(initStateForParserPack(index, 7), FULL_WIN);

    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_recovered");
    expect(buildParserObservation(index, s).score).toBe(pack.meta.max_score);
  });

  it("the pack validates clean", () => {
    const report = validateParser(pack);
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
  });
});
