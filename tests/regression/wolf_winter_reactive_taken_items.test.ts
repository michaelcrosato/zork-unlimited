/**
 * Regression for stale room-item prose in wolf_winter: the store and paling
 * kept placing taken preparation items at their starting positions.
 */
import { describe, it, expect } from "vitest";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { resolveParserAction } from "../../src/parser/legal_actions.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadRpgPackFile("content/rpg/pack/wolf_winter.yaml");
if (!loaded.ok) throw new Error("wolf_winter must compile");
const index = indexRpgPack(loaded.compiled.pack);
const step = makeStep(buildRpgRules(index));

function play(s: GameState, ids: string[]): GameState {
  for (const id of ids) {
    const opt = enumerateRpgActions(index, s).find((o) => o.id === id);
    if (!opt) {
      throw new Error(
        `"${id}" not legal in ${s.current}: [${enumerateRpgActions(index, s)
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

const desc = (s: GameState): string => buildRpgObservation(index, s).description;

function lookNarration(s: GameState): string {
  const res = resolveParserAction(index, s, { type: "LOOK" });
  const effect = res?.effects[0];
  if (!effect || !("narrate" in effect)) throw new Error("LOOK produced no narration");
  return effect.narrate;
}

describe("wolf_winter rooms react to taken preparation items", () => {
  it("removes the peg-hung jerkin prose after the byre-jerkin is taken", () => {
    const s = play(initStateForRpgPack(index, 83), ["go_north", "go_west", "take_byre_jerkin"]);

    expect(s.inventory).toContain("byre_jerkin");
    expect(s.flags["byre_jerkin_taken"]).toBe(true);
    expect(desc(s)).toContain(
      "peg by the door is bare where the steading's padded byre-jerkin hung",
    );
    expect(desc(s)).not.toContain("On a peg by the door hangs");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("keeps the jerkin peg empty after the byre-jerkin is dropped", () => {
    const s = play(initStateForRpgPack(index, 83), [
      "go_north",
      "go_west",
      "take_byre_jerkin",
      "drop_byre_jerkin",
    ]);

    expect(s.inventory).not.toContain("byre_jerkin");
    expect(s.flags["byre_jerkin_taken"]).toBe(true);
    expect(desc(s)).toContain(
      "peg by the door is bare where the steading's padded byre-jerkin hung",
    );
    expect(desc(s)).not.toContain("On a peg by the door hangs");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("removes the fallen-rail-at-feet prose after the paling rail is taken", () => {
    const s = play(initStateForRpgPack(index, 83), ["go_north", "go_north", "take_paling_rail"]);

    expect(s.inventory).toContain("paling_rail");
    expect(s.flags["paling_rail_taken"]).toBe(true);
    expect(desc(s)).toContain("snow at your feet is bare where the fallen rail lay");
    expect(desc(s)).not.toContain("One stout rail of the broken paling has fallen clear");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("keeps the paling snow bare after the rail is dropped", () => {
    const s = play(initStateForRpgPack(index, 83), [
      "go_north",
      "go_north",
      "take_paling_rail",
      "drop_paling_rail",
    ]);

    expect(s.inventory).not.toContain("paling_rail");
    expect(s.flags["paling_rail_taken"]).toBe(true);
    expect(desc(s)).toContain("snow at your feet is bare where the fallen rail lay");
    expect(desc(s)).not.toContain("One stout rail of the broken paling has fallen clear");
    expect(lookNarration(s)).toBe(desc(s));
  });
});
