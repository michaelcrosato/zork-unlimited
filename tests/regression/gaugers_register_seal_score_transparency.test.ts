/**
 * Regression for bug_0487 - Gauger's Register should not hide the last five
 * score points behind READ wax seal-stamp when LOOK already exposes the clue.
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

const loaded = loadParserPackFile("content/parser/pack/gaugers_register.yaml");
if (!loaded.ok) throw new Error("gaugers_register must compile");
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

function lookNarration(s: GameState, target: string): string {
  const res = resolveParserAction(index, s, { type: "LOOK", target });
  const effect = res?.effects[0];
  if (!effect || !("narrate" in effect)) throw new Error(`no look narration for ${target}`);
  return effect.narrate;
}

const BLIND_NATURAL_ROUTE = [
  "go_north",
  "read_duty_ledger",
  "read_loose_leaf",
  "take_loose_leaf",
  "take_marked_stave",
  "use_marked_stave_on_watchman",
  "take_crowbar",
  "go_north",
  "take_gauge_register",
  "go_west",
];

const FORCEFUL_ROUTE = [
  "go_north",
  "read_duty_ledger",
  "take_marked_stave",
  "take_crowbar",
  "use_crowbar_on_inner_door",
  "go_north",
  "take_gauge_register",
  "go_west",
];

describe("bug_0487 - gaugers_register score is transparent after looking at the seal", () => {
  it("the blind natural route can finish at max score without reading the seal", () => {
    const s = play(initStateForParserPack(index, 7), BLIND_NATURAL_ROUTE);

    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_exposed");
    expect(s.flags.read_seal ?? false).toBe(false);
    expect(buildParserObservation(index, s).score).toBe(pack.meta.max_score);
  });

  it("looking at the seal shows the batch-mark proof but does not hide score", () => {
    let s = play(initStateForParserPack(index, 7), [
      "go_north",
      "read_duty_ledger",
      "take_marked_stave",
      "use_marked_stave_on_watchman",
      "go_north",
    ]);
    const seal = lookNarration(s, "hayman_seal");
    expect(seal).toMatch(/same batch-mark/i);
    expect(seal).toMatch(/certify a result you did not measure/i);
    expect(buildParserObservation(index, s).score).toBe(20);

    s = play(s, ["take_gauge_register", "go_west"]);
    expect(s.endingId).toBe("ending_exposed");
    expect(buildParserObservation(index, s).score).toBe(pack.meta.max_score);
  });

  it("reading the seal remains harmless corroboration, not a hidden score gate", () => {
    let s = play(initStateForParserPack(index, 7), [
      "go_north",
      "read_duty_ledger",
      "take_marked_stave",
      "use_marked_stave_on_watchman",
      "go_north",
      "read_hayman_seal",
    ]);

    expect(s.flags.read_seal).toBe(true);
    expect(buildParserObservation(index, s).score).toBe(20);
    s = play(s, ["take_gauge_register", "go_west"]);
    expect(buildParserObservation(index, s).score).toBe(pack.meta.max_score);
  });

  it("the forceful route still caps below max score", () => {
    const s = play(initStateForParserPack(index, 7), FORCEFUL_ROUTE);

    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_exposed");
    expect(s.flags.door_forced).toBe(true);
    expect(s.flags.watchman_convinced ?? false).toBe(false);
    expect(buildParserObservation(index, s).score).toBe(40);
  });

  it("the pack validates clean", () => {
    const report = validateParser(pack);
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
  });
});
