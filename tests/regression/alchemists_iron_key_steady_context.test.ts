/**
 * Regression for bug_0479 -- The Alchemist's Tower's optional `steady iron key`
 * check must be explained in the room where it appears.
 *
 * A fresh blind pass (blind-tester/reports/20260622T234526Z_alchemists_tower_seed7.md)
 * found the pack mechanically clean, but flagged the Great Hall's self-USE action as
 * opaque: `steady iron key` appeared next to the real cellar unlock with no immediate
 * explanation of its purpose or stakes. Earlier fixes had gated and renamed the beat,
 * but its context still lived mostly in examine/take prose rather than the live room.
 *
 * The fix is content-only signposting: when the player stands in the Great Hall with
 * the iron key and the cellar hatch still locked, the room text now frames the roll as
 * an optional steadying moment before turning the key. The check remains convergent and
 * does not replace or gate the real unlock.
 */
import { describe, expect, it } from "vitest";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  buildParserRules,
  indexParserPack,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { validateParser } from "../../src/validate/parser_validator.js";

const loaded = loadParserPackFile("content/parser/pack/alchemists_tower.yaml");
if (!loaded.ok) throw new Error("alchemists_tower must compile");
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
    const r = step(s, opt.action);
    expect(r.ok).toBe(true);
    s = r.state;
  }
  return s;
}

const TO_GREAT_HALL_WITH_IRON_KEY = [
  "go_east",
  "take_brass_key",
  "go_west",
  "go_north",
  "go_up",
  "unlock_strongbox",
  "open_strongbox",
  "take_iron_key",
  "go_down",
];

const actionIds = (s: GameState): string[] =>
  buildParserObservation(index, s)
    .available_actions.map((a) => a.id)
    .sort();

describe("bug_0479 -- alchemists_tower explains the optional steady-iron-key beat", () => {
  it("the Great Hall text explains the steady check before the hatch is unlocked", () => {
    const s = play(initStateForParserPack(index, 7), TO_GREAT_HALL_WITH_IRON_KEY);
    const obs = buildParserObservation(index, s);
    const text = obs.description.toLowerCase();

    expect(s.current).toBe("great_hall");
    expect(s.inventory).toContain("iron_key");
    expect(text).toContain("cold key in your hand");
    expect(text).toContain("steady yourself");
    expect(text).toContain("before turning it");
    expect(actionIds(s)).toContain("use_iron_key");
    expect(actionIds(s)).toContain("unlock_cellar_door");
  });

  it("the action surfaces as an optional d20 check, not a hidden gate", () => {
    const s = play(initStateForParserPack(index, 7), TO_GREAT_HALL_WITH_IRON_KEY);
    const steady = buildParserObservation(index, s).available_actions.find(
      (a) => a.id === "use_iron_key",
    );

    expect(steady).toBeDefined();
    expect(steady!.command).toBe("steady iron key");
    expect(steady!.skill_check).toEqual({
      skill: "steadiness",
      difficulty: 12,
      die: "d20",
    });

    const afterSteady = play(s, ["use_iron_key"]);
    expect(afterSteady.current).toBe("great_hall");
    expect(actionIds(afterSteady)).toContain("unlock_cellar_door");
  });

  it("the context retires with the check once the hatch is unlocked", () => {
    const opened = play(initStateForParserPack(index, 7), [
      ...TO_GREAT_HALL_WITH_IRON_KEY,
      "unlock_cellar_door",
    ]);
    const obs = buildParserObservation(index, opened);

    expect(opened.objectState["cellar_door"]?.locked).toBe(false);
    expect(obs.description.toLowerCase()).toContain("hatch stands thrown open");
    expect(obs.description.toLowerCase()).not.toContain("steady yourself");
    expect(actionIds(opened)).not.toContain("use_iron_key");
    expect(actionIds(opened)).toContain("go_down");
  });

  it("the pack still validates clean", () => {
    const report = validateParser(pack);
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
  });
});
