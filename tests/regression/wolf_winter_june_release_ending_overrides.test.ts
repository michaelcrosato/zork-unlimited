import { describe, expect, it } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { indexRpgPack, initStateForRpgPack, winningRpgEnding } from "../../src/rpg/runner.js";

const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("wolf_winter must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const initial = initStateForRpgPack(index, 1);

describe("Wolf Winter June-release ending overrides", () => {
  it("keeps the original 14 globally scanned wins and declares the four release endings", () => {
    expect(pack.win_conditions).toHaveLength(14);
    expect(
      pack.win_conditions.flatMap((win) =>
        (win.ending_overrides ?? []).map((override) => override.ending),
      ),
    ).toEqual([
      "ending_bloodied_byre_evacuated_june_released",
      "ending_held_gate_barred_june_released",
      "ending_held_gate_barred_june_released",
      "ending_held_timber_saved_june_released",
      "ending_held_timber_saved_june_released",
      "ending_held_june_released",
    ]);
  });

  it.each([
    {
      label: "bloodied evacuation",
      flags: {
        bloodied_byre_evacuated: true,
        yearling_down: true,
        flank_wolf_down: true,
      },
      inventory: [],
      released: "ending_bloodied_byre_evacuated_june_released",
      retained: "ending_bloodied_byre_evacuated",
    },
    {
      label: "barred gate",
      flags: { cattle_gate_barred_with_split_guard: true },
      inventory: [],
      released: "ending_held_gate_barred_june_released",
      retained: "ending_held_gate_barred",
    },
    {
      label: "saved timber",
      flags: {},
      inventory: ["split_rail_guard"],
      released: "ending_held_timber_saved_june_released",
      retained: "ending_held_timber_saved",
    },
    {
      label: "generic hold",
      flags: {},
      inventory: [],
      released: "ending_held_june_released",
      retained: "ending_held",
    },
  ])("selects the release ending only for $label", ({ flags, inventory, released, retained }) => {
    const state = {
      ...initial,
      current: "cattle_stand",
      visited: { ...initial.visited, cattle_stand: true },
      flags,
      inventory,
    };

    expect(
      winningRpgEnding(index, {
        ...state,
        flags: { ...state.flags, june_hunt_released: true },
      }),
    ).toBe(released);
    expect(winningRpgEnding(index, state)).toBe(retained);
  });
});
