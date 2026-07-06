/**
 * Regression for stale room-item prose in advocates_case: Marta's stall and
 * the charter office kept placing taken documents at their starting positions.
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { resolveRpgAction } from "../../src/rpg/legal_actions.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadRpgSourceFile("content/rpg/pack/advocates_case.yaml");
if (!loaded.ok) throw new Error("advocates_case must compile");
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
  const res = resolveRpgAction(index, s, { type: "LOOK" });
  const effect = res?.effects[0];
  if (!effect || !("narrate" in effect)) throw new Error("LOOK produced no narration");
  return effect.narrate;
}

describe("advocates_case rooms react to taken documents", () => {
  it("removes the charter-roll table prose after the charter roll is taken", () => {
    const s = play(initStateForRpgPack(index, 59), ["take_charter_roll"]);

    expect(s.inventory).toContain("charter_roll");
    expect(s.flags["charter_roll_taken"]).toBe(true);
    expect(desc(s)).toContain("near table is bare where Marta's charter roll lay");
    expect(desc(s)).not.toContain("The charter roll lies on the near table");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("keeps Marta's table bare after the charter roll is dropped", () => {
    const s = play(initStateForRpgPack(index, 59), ["take_charter_roll", "drop_charter_roll"]);

    expect(s.inventory).not.toContain("charter_roll");
    expect(s.flags["charter_roll_taken"]).toBe(true);
    expect(desc(s)).toContain("near table is bare where Marta's charter roll lay");
    expect(desc(s)).not.toContain("The charter roll lies on the near table");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("removes the charter-office counter prose after the town register is taken", () => {
    const s = play(initStateForRpgPack(index, 59), ["go_east", "take_town_register"]);

    expect(s.inventory).toContain("town_register");
    expect(s.flags["town_register_taken"]).toBe(true);
    expect(desc(s)).toContain("counter is clear where the town register lay open");
    expect(desc(s)).not.toContain("The town's charter register lies open on the counter");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("keeps the charter-office counter clear after the town register is dropped", () => {
    const s = play(initStateForRpgPack(index, 59), [
      "go_east",
      "take_town_register",
      "drop_town_register",
    ]);

    expect(s.inventory).not.toContain("town_register");
    expect(s.flags["town_register_taken"]).toBe(true);
    expect(desc(s)).toContain("counter is clear where the town register lay open");
    expect(desc(s)).not.toContain("The town's charter register lies open on the counter");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("does not claim the register is still in hand after it is read and dropped", () => {
    const s = play(initStateForRpgPack(index, 59), [
      "go_east",
      "take_town_register",
      "read_town_register",
      "drop_town_register",
    ]);

    expect(s.inventory).not.toContain("town_register");
    expect(s.flags["register_read"]).toBe(true);
    expect(desc(s)).toContain("relevant entry has been read");
    expect(desc(s)).toContain("counter is clear where the town register lay open");
    expect(desc(s)).not.toContain("The register is in your hands");
    expect(lookNarration(s)).toBe(desc(s));
  });
});
