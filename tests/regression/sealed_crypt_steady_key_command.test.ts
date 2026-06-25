/**
 * Regression for bug_0439 -- Sealed Crypt's optional iron-key nerve beat still
 * surfaced as "grip iron key", which fresh blind feedback read as an unexplained
 * or vestigial action. It now presents as steadying your hand while keeping the
 * stable action id and convergent mechanics.
 */
import { describe, expect, it } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  buildParserRules,
  indexParserPack,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";
import { parseCommand } from "../../src/parser/command_map.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadParserPackFile("content/parser/pack/sealed_crypt.yaml");
if (!loaded.ok) throw new Error("sealed_crypt must compile");
const index = indexParserPack(loaded.compiled.pack);
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

const TO_CRYPT_WITH_IRON_KEY = [
  "go_north",
  "go_up",
  "take_rope",
  "go_down",
  "go_west",
  "read_headstone",
  "go_north",
  "open_stone_coffer",
  "take_brass_key",
  "go_south",
  "go_east",
  "go_east",
  "use_rope_on_old_well",
  "go_down",
  "unlock_oak_chest",
  "open_oak_chest",
  "take_iron_key",
  "go_up",
  "go_west",
  "go_north",
  "go_down",
];

describe("bug_0439 -- Sealed Crypt iron-key skill beat is visibly a steadying action", () => {
  it("lists the stable use_iron_key action as 'steady iron key', not 'grip iron key'", () => {
    const state = play(initStateForParserPack(index, 7), TO_CRYPT_WITH_IRON_KEY);
    const action = enumerateActions(index, state).find(
      (candidate) => candidate.id === "use_iron_key",
    );

    expect(action?.command).toBe("steady iron key");
    expect(action?.command).not.toBe("grip iron key");
    expect(action?.skill_check).toEqual({ skill: "nerve", difficulty: 12, die: "d20" });
  });

  it("parses the clearer command and keeps the beat convergent", () => {
    const state = play(initStateForParserPack(index, 7), TO_CRYPT_WITH_IRON_KEY);
    const parsed = parseCommand(index, state, "steady iron key");

    expect(parsed).toEqual({
      ok: true,
      action: { type: "USE", item: "iron_key", target: "iron_key" },
    });

    const result = step(state, parsed.ok ? parsed.action : { type: "LOOK" });
    expect(result.ok).toBe(true);
    expect(result.state.current).toBe("crypt");
    expect(result.state.inventory).toContain("iron_key");
    expect(result.state.ended).toBe(false);
  });
});
