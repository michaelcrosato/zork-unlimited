/**
 * Regression for bug_0385: The Sealed Crypt promised "recover the sealed crypt
 * relic", but the victory fired on bare catacombs entry. The final beat now exposes
 * a takeable relic and wins only when the player deliberately recovers it.
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  indexParserPack,
  buildParserRules,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { validateParser } from "../../src/validate/parser_validator.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadParserPackFile("content/parser/pack/sealed_crypt.yaml");
if (!loaded.ok) throw new Error("sealed_crypt must compile");
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

const score = (s: GameState): number => buildParserObservation(index, s).score;
const actionIds = (s: GameState): string[] => enumerateActions(index, s).map((o) => o.id);
const visibleIds = (s: GameState): string[] =>
  buildParserObservation(index, s).visible_objects.map((o) => o.id);

const ROUTE_TO_OPEN_GATE = [
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
  "unlock_crypt_gate",
];

describe("bug_0385 — sealed crypt victory requires recovering the relic", () => {
  it("opening the gate does not max the score or end the game", () => {
    const s = play(initStateForParserPack(index, 7), ROUTE_TO_OPEN_GATE);

    expect(s.current).toBe("crypt");
    expect(s.ended).toBe(false);
    expect(s.flags["catacombs_open"]).toBe(true);
    expect(score(s)).toBe(15);
    expect(actionIds(s)).toContain("go_north");
  });

  it("entering the catacombs reveals the relic but does not auto-win", () => {
    const s = play(initStateForParserPack(index, 7), [...ROUTE_TO_OPEN_GATE, "go_north"]);

    expect(s.current).toBe("catacombs");
    expect(s.ended).toBe(false);
    expect(score(s)).toBe(15);
    expect(visibleIds(s)).toContain("sealed_relic");
    expect(actionIds(s)).toContain("take_sealed_relic");
  });

  it("taking the sealed relic awards the capstone and wins 35/35", () => {
    const s = play(initStateForParserPack(index, 7), [
      ...ROUTE_TO_OPEN_GATE,
      "go_north",
      "take_sealed_relic",
    ]);

    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_victory");
    expect(s.inventory).toContain("sealed_relic");
    expect(score(s)).toBe(35);
    expect(score(s)).toBe(pack.meta.max_score);
  });

  it("the pack validates cleanly with the relic as the win condition", () => {
    expect(pack.win_conditions).toEqual([
      { id: "recover_relic", conditions: [{ has_item: "sealed_relic" }], ending: "ending_victory" },
    ]);
    const report = validateParser(pack);
    expect(report.ok).toBe(true);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
  });
});
