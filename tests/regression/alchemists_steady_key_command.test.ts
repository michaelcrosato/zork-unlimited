/**
 * Regression for bug_0425 -- the optional Alchemist's Tower iron-key skill beat
 * still surfaced as "grip iron key", which fresh blind playtest feedback read as
 * an unexplained, possibly vestigial action. The action now presents as steadying
 * your hand while keeping the same stable id and convergent mechanics.
 */
import { describe, expect, it } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  indexParserPack,
  buildParserRules,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";
import { parseCommand } from "../../src/parser/command_map.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const alch = loadParserPackFile("content/parser/pack/alchemists_tower.yaml");
if (!alch.ok) throw new Error("alchemists_tower must compile");
const index = indexParserPack(alch.compiled.pack);
const step = makeStep(buildParserRules(index));

function play(state: GameState, ids: string[]): GameState {
  for (const id of ids) {
    const option = enumerateActions(index, state).find((candidate) => candidate.id === id);
    if (!option) {
      throw new Error(
        `"${id}" not legal in ${state.current}: [${enumerateActions(index, state)
          .map((candidate) => candidate.id)
          .join(", ")}]`,
      );
    }
    const result = step(state, option.action);
    expect(result.ok).toBe(true);
    state = result.state;
  }
  return state;
}

const TO_GREAT_HALL_WITH_IRON_KEY = [
  "go_west",
  "read_spellbook",
  "go_east",
  "go_east",
  "take_herb",
  "take_brass_key",
  "go_west",
  "go_north",
  "go_up",
  "unlock_strongbox",
  "open_strongbox",
  "take_iron_key",
  "go_down",
];

describe("bug_0425 -- Alchemist's Tower iron-key skill beat is visibly a steadying action", () => {
  it("lists the stable use_iron_key action as 'steady iron key', not 'grip iron key'", () => {
    const state = play(initStateForParserPack(index, 7), TO_GREAT_HALL_WITH_IRON_KEY);
    const action = enumerateActions(index, state).find(
      (candidate) => candidate.id === "use_iron_key",
    );

    expect(action?.command).toBe("steady iron key");
    expect(action?.command).not.toBe("grip iron key");
    expect(action?.skill_check).toEqual({ skill: "steadiness", difficulty: 12, die: "d20" });
  });

  it("parses the clearer command and keeps the beat convergent", () => {
    const state = play(initStateForParserPack(index, 7), TO_GREAT_HALL_WITH_IRON_KEY);
    const parsed = parseCommand(index, state, "steady iron key");

    expect(parsed).toEqual({
      ok: true,
      action: { type: "USE", item: "iron_key", target: "iron_key" },
    });

    const result = step(state, parsed.ok ? parsed.action : { type: "LOOK" });
    expect(result.ok).toBe(true);
    expect(result.state.current).toBe("great_hall");
    expect(result.state.inventory).toContain("iron_key");
    expect(result.state.ended).toBe(false);
  });
});
