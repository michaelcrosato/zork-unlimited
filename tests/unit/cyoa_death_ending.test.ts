/**
 * CYOA death/failure-ending flag (mechanic-palette standardization, RPG-STANDARDIZATION-PLAN §4.2).
 *
 * Marks a CYOA terminal as a non-winning failure (`death: true`), the analogue of the
 * parser/RPG `ParserEndingSchema.death`, so a client can tell a "you lost" terminal from
 * a win/neutral one uniformly across modes. Proven here: the observation surfaces
 * `ending_death` once the game ends, and an absent `death` field stays absent in the
 * compiled pack (byte-identical hash for every existing CYOA pack).
 */
import { describe, it, expect } from "vitest";
import { makeStep } from "../../src/core/engine.js";
import { CyoaPackSchema } from "../../src/cyoa/schema.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";

const choose = (id: string) => ({ type: "CHOOSE", choiceId: id }) as const;

const pack = CyoaPackSchema.parse({
  meta: { id: "death_cap_v1", title: "Death Capability", start: "fork" },
  scenes: [
    {
      id: "fork",
      title: "The Fork",
      text: "A rotten ladder, or the open door.",
      choices: [
        { id: "climb", text: "Climb the rotten ladder.", next: "ending_fall" },
        { id: "walk", text: "Walk out the door.", next: "ending_free" },
      ],
    },
  ],
  endings: [
    { id: "ending_fall", title: "The Fall", text: "The wood gives. You drop.", death: true },
    { id: "ending_free", title: "Free", text: "You step into the morning." },
  ],
});

describe("CYOA death-ending flag", () => {
  const index = indexPack(pack);
  const step = makeStep(buildRules(index));

  it("surfaces ending_death = true at a declared death ending", () => {
    const r = step(initStateForPack(index, 1), choose("climb"));
    expect(r.state.ended).toBe(true);
    expect(buildObservation(index, r.state).ending_death).toBe(true);
  });

  it("surfaces ending_death = false at a non-death ending", () => {
    const r = step(initStateForPack(index, 1), choose("walk"));
    expect(r.state.ended).toBe(true);
    expect(buildObservation(index, r.state).ending_death).toBe(false);
  });

  it("ending_death is null while the game is still in play", () => {
    expect(buildObservation(index, initStateForPack(index, 1)).ending_death).toBeNull();
  });

  it("an absent death flag stays absent in the compiled pack (hash-safety)", () => {
    expect("death" in pack.endings.find((e) => e.id === "ending_free")!).toBe(false);
    expect(pack.endings.find((e) => e.id === "ending_fall")!.death).toBe(true);
  });
});
