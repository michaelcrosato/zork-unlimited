/**
 * Regression for bug_0378 - coroners_errand foregrounds a physician's black bag,
 * so the bag must be a real, examinable object rather than unreachable scenery.
 */
import { describe, expect, it } from "vitest";
import { makeStep } from "../../src/core/engine.js";
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

const loaded = loadParserPackFile("content/parser/pack/coroners_errand.yaml");
if (!loaded.ok) throw new Error("coroners_errand must compile");
const pack = loaded.compiled.pack;
const index = indexParserPack(pack);
const step = makeStep(buildParserRules(index));

describe("bug_0378 - coroners_errand physician's bag is addressable", () => {
  it("exposes the study's physician bag as visible, examinable scenery", () => {
    const start = initStateForParserPack(index, 7);
    const toStudy = step(start, { type: "MOVE", direction: "east" });
    expect(toStudy.ok).toBe(true);
    const study = toStudy.state;

    const obs = buildParserObservation(index, study);
    expect(obs.description).toMatch(/physician's black bag stands by the door/i);
    expect(obs.visible_objects.map((o) => o.id)).toContain("physician_bag");
    expect(enumerateActions(index, study).map((o) => o.id)).toContain("examine_physician_bag");

    const parsed = parseCommand(index, study, "examine bag");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.reason);
    expect(parsed.action).toEqual({ type: "LOOK", target: "physician_bag" });

    const looked = step(study, parsed.action);
    expect(looked.ok).toBe(true);
    expect(looked.events).toContainEqual(
      expect.objectContaining({
        type: "narration",
        text: expect.stringMatching(/Rendell's visiting bag/i),
      }),
    );
    expect(looked.state.vars.score ?? 0).toBe(study.vars.score ?? 0);
  });

  it("the pack validates clean", () => {
    const report = validateParser(pack);
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
  });
});
