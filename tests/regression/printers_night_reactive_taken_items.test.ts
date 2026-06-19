/**
 * Regression for stale room-item prose in printers_night: the shop floor and
 * composing room kept placing taken items at their starting positions.
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

const loaded = loadRpgPackFile("content/rpg/pack/printers_night.yaml");
if (!loaded.ok) throw new Error("printers_night must compile");
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

describe("printers_night rooms react to taken tools and papers", () => {
  it("removes the counter-lantern prose after the dark lantern is taken", () => {
    const s = play(initStateForRpgPack(index, 71), ["take_dark_lantern"]);

    expect(s.inventory).toContain("dark_lantern");
    expect(s.flags["dark_lantern_taken"]).toBe(true);
    expect(desc(s)).toContain("counter near the door is bare where the dark lantern sat");
    expect(desc(s)).not.toContain("A dark lantern sits on the counter");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("keeps the counter bare after the dark lantern is dropped", () => {
    const s = play(initStateForRpgPack(index, 71), ["take_dark_lantern", "drop_dark_lantern"]);

    expect(s.inventory).not.toContain("dark_lantern");
    expect(s.flags["dark_lantern_taken"]).toBe(true);
    expect(desc(s)).toContain("counter near the door is bare where the dark lantern sat");
    expect(desc(s)).not.toContain("A dark lantern sits on the counter");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("removes the pinned-schedule prose after Fen's schedule is taken", () => {
    const s = play(initStateForRpgPack(index, 71), [
      "take_dark_lantern",
      "go_east",
      "take_proof_schedule",
    ]);

    expect(s.inventory).toContain("proof_schedule");
    expect(s.flags["proof_schedule_taken"]).toBe(true);
    expect(desc(s)).toContain("board above it is bare where Fen's schedule was pinned");
    expect(desc(s)).not.toContain("Pinned to the board above the bench");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("keeps the board bare after Fen's schedule is dropped", () => {
    const s = play(initStateForRpgPack(index, 71), [
      "take_dark_lantern",
      "go_east",
      "take_proof_schedule",
      "drop_proof_schedule",
    ]);

    expect(s.inventory).not.toContain("proof_schedule");
    expect(s.flags["proof_schedule_taken"]).toBe(true);
    expect(desc(s)).toContain("board above it is bare where Fen's schedule was pinned");
    expect(desc(s)).not.toContain("Pinned to the board above the bench");
    expect(lookNarration(s)).toBe(desc(s));
  });
});
