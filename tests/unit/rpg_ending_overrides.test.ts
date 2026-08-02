import { describe, expect, it } from "vitest";
import { hashState } from "../../src/core/hash.js";
import { RpgPackSchema, type RpgPack } from "../../src/rpg/schema.js";
import { indexRpgPack, initStateForRpgPack, winningRpgEnding } from "../../src/rpg/runner.js";
import { validateRpgFoundation } from "../../src/validate/rpg_foundation_validator.js";

function packWithWins(winConditions: RpgPack["win_conditions"]): RpgPack {
  return RpgPackSchema.parse({
    meta: { id: "ending_override_fixture", title: "Ending Override Fixture", start_room: "room" },
    rooms: [{ id: "room", name: "Room", description: "A room." }],
    win_conditions: winConditions,
    endings: [
      { id: "base", title: "Base", text: "Base ending." },
      { id: "first", title: "First", text: "First override." },
      { id: "second", title: "Second", text: "Second override." },
      { id: "death", title: "Death", text: "Failure.", death: true },
    ],
  });
}

describe("RPG win-condition ending overrides", () => {
  it("selects the first matching override after the first normal win matches", () => {
    const pack = packWithWins([
      {
        id: "win",
        conditions: [{ has_flag: "won" }],
        ending: "base",
        ending_overrides: [
          { conditions: [{ has_flag: "first_route" }], ending: "first" },
          { conditions: [{ has_flag: "second_route" }], ending: "second" },
        ],
      },
    ]);
    const index = indexRpgPack(pack);
    const initial = initStateForRpgPack(index, 1);

    expect(winningRpgEnding(index, { ...initial, flags: { won: true } })).toBe("base");
    expect(
      winningRpgEnding(index, {
        ...initial,
        flags: { won: true, first_route: true, second_route: true },
      }),
    ).toBe("first");
    expect(winningRpgEnding(index, { ...initial, flags: { won: true, second_route: true } })).toBe(
      "second",
    );
  });

  it("keeps legacy parsed shapes stable and hashes authored overrides", () => {
    const legacy = packWithWins([{ id: "win", conditions: [{ has_flag: "won" }], ending: "base" }]);
    const authored = packWithWins([
      {
        id: "win",
        conditions: [{ has_flag: "won" }],
        ending: "base",
        ending_overrides: [{ conditions: [{ has_flag: "first_route" }], ending: "first" }],
      },
    ]);

    expect(legacy.win_conditions[0]).not.toHaveProperty("ending_overrides");
    expect(authored.win_conditions[0]?.ending_overrides).toHaveLength(1);
    expect(hashState(authored)).not.toBe(hashState(legacy));
  });

  it("validates override ending targets, death status, guards, and ordered shadowing", () => {
    const pack = packWithWins([
      {
        id: "win",
        conditions: [{ has_flag: "won" }],
        ending: "base",
        ending_overrides: [
          { conditions: [{ has_flag: "route" }], ending: "death" },
          {
            conditions: [{ has_flag: "route" }, { has_flag: "more_specific" }],
            ending: "missing",
          },
          {
            conditions: [{ not_flag: "won" }],
            ending: "second",
          },
        ],
      },
    ]);
    const findings = validateRpgFoundation(pack, {
      extraSettableFlags: ["won", "route", "more_specific"],
    }).findings;

    expect(findings).toContainEqual(
      expect.objectContaining({
        code: "WIN_IS_DEATH",
        where: ["win:win", "ending_override:0"],
      }),
    );
    expect(findings).toContainEqual(
      expect.objectContaining({
        code: "ENDING_UNDECLARED",
        where: ["win:win", "ending_override:1"],
      }),
    );
    expect(findings).toContainEqual(
      expect.objectContaining({
        code: "UNREACHABLE_VARIANT",
        where: ["win:win:ending_overrides", "variant:1"],
      }),
    );
    expect(findings).toContainEqual(
      expect.objectContaining({
        code: "UNSATISFIABLE_CONDITION",
        where: ["win:win", "ending_override:2"],
      }),
    );
  });
});
