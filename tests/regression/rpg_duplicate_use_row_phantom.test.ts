/**
 * Regression (§15) — two authored USE rows on the same (item, target) pair list ONE
 * menu entry: the row that will actually run.
 *
 * A USE action's id is derived from the item/target pair alone, so every row on that
 * pair mints the same `use_<item>_on_<target>`. Only one of them can ever execute:
 * `useInteraction` takes the FIRST condition-satisfying row, and every id-addressed
 * surface resolves the same way. The enumerator, however, pushed an option per row and
 * attached `skill_check` from whichever row it happened to be on — so when two rows
 * were satisfiable at once the menu showed the id twice, the second entry advertising a
 * d20 roll ("nerve(3) vs 12, you might drop it") that the engine would never make. The
 * second entry was unselectable through the MCP first-match lookup, while the CLI's
 * `choose <id>` path failed closed as ambiguous — the two player surfaces disagreed
 * about the same menu.
 *
 * `tests/regression/rpg_action_id_unique.test.ts` proves this never happens for the 12
 * SHIPPED packs by exhaustive BFS. It cannot protect a generated, loaded or patched
 * pack, which is gated by `validateRpg` alone — and `validateRpg` has no action-id
 * uniqueness check. This locks the enumerator itself, which is what such a pack meets.
 *
 * Locked here:
 *   (1) simultaneously-satisfiable duplicate rows collapse to one option;
 *   (2) the surviving option is the one resolution runs, and its skill_check disclosure
 *       (present or absent) is that row's, not a sibling's;
 *   (3) mutually exclusive rows on one pair — the shipped pattern, e.g. tide_mill's
 *       pocket/return/steal coin-bag stages — still each get their turn.
 */
import { describe, it, expect } from "vitest";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { compileRpgSource } from "../../src/rpg/source.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";

// Two USE rows on (lamp, altar) that are satisfiable at the same time. The second
// carries a skill_check; the first does not.
const collidingPack = `
meta:
  id: t
  title: T
  start_room: a
  max_score: 0
  vars_init: { hp: 10, attack: 2, defense: 1, nerve: 3 }
rooms:
  - id: a
    name: A
    description: "A shrine."
    objects: [lamp, altar]
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: "B"
    exits: [{ direction: south, to: a }]
objects:
  - id: lamp
    name: lamp
    description: "A brass lamp."
    takeable: true
  - id: altar
    name: altar
    description: "A cold stone altar."
    interactions:
      - verb: USE
        item: lamp
        target: altar
        effects:
          - set_flag: plain_row_fired
          - narrate: "You set the lamp on the altar."
      - verb: USE
        item: lamp
        target: altar
        skill_check: { skill: nerve, difficulty: 12, stakes: "you might drop it" }
        effects:
          - set_flag: skill_row_fired
          - narrate: "You balance the lamp on the altar's worn lip."
win_conditions: [{ id: w, conditions: [{ visited: b }], ending: e }]
endings: [{ id: e, title: E, text: "done" }]
enemies: []
`;

// The shipped shape: several rows on one pair whose conditions are mutually exclusive,
// so each is the first satisfying row in its own phase.
const stagedPack = `
meta:
  id: t
  title: T
  start_room: a
  max_score: 0
  vars_init: { hp: 10, attack: 2, defense: 1 }
rooms:
  - id: a
    name: A
    description: "A counting nook."
    objects: [seal, ledger]
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: "B"
    exits: [{ direction: south, to: a }]
objects:
  - id: seal
    name: seal
    description: "A wax seal."
    takeable: true
  - id: ledger
    name: ledger
    description: "The factor's ledger."
    interactions:
      - verb: USE
        item: seal
        target: ledger
        conditions: [{ not_flag: sealed }]
        effects:
          - set_flag: sealed
          - narrate: "You press the seal into the ledger."
      - verb: USE
        item: seal
        target: ledger
        conditions: [{ has_flag: sealed }]
        effects:
          - set_flag: countersealed
          - narrate: "You add the counter-seal."
win_conditions: [{ id: w, conditions: [{ visited: b }], ending: e }]
endings: [{ id: e, title: E, text: "done" }]
enemies: []
`;

const compile = (src: string) => {
  const r = compileRpgSource(src);
  if (!r.ok) throw new Error(`fixture must compile: ${r.error.message}`);
  return r.compiled.pack;
};

const withLamp = (index: ReturnType<typeof indexRpgPack>, item: string): GameState => {
  const step = makeStep(buildRpgRules(index));
  const start = initStateForRpgPack(index, 1);
  const take = enumerateRpgActions(index, start).find((o) => o.id === `take_${item}`);
  if (!take) throw new Error(`no take_${item}`);
  const result = step(start, take.action);
  if (!result.ok) throw new Error("take rejected");
  return result.state;
};

describe("USE: colliding rows on one (item, target) pair list only the row that runs", () => {
  it("validateRpg accepts the colliding pack — the enumerator is the only guard here", () => {
    expect(
      validateRpg(compile(collidingPack)).findings.filter((f) => f.severity === "error"),
    ).toEqual([]);
  });

  it("(1)+(2) one option, and its skill_check belongs to the row that fires", () => {
    const index = indexRpgPack(compile(collidingPack));
    const state = withLamp(index, "lamp");

    const colliding = enumerateRpgActions(index, state).filter((o) => o.id === "use_lamp_on_altar");
    expect(colliding).toHaveLength(1);
    // The first row is plain, so the menu must NOT advertise a d20 the engine won't roll.
    expect(colliding[0]!.skill_check).toBeUndefined();

    const result = makeStep(buildRpgRules(index))(state, colliding[0]!.action);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.flags["plain_row_fired"]).toBe(true);
    expect(result.state.flags["skill_row_fired"]).toBeFalsy();
  });

  it("(3) mutually exclusive rows on one pair still each get their turn", () => {
    const index = indexRpgPack(compile(stagedPack));
    const step = makeStep(buildRpgRules(index));
    let state = withLamp(index, "seal");

    const only = (s: GameState) => {
      const rows = enumerateRpgActions(index, s).filter((o) => o.id === "use_seal_on_ledger");
      expect(rows).toHaveLength(1);
      return rows[0]!;
    };

    const first = step(state, only(state).action);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    state = first.state;
    expect(state.flags["sealed"]).toBe(true);

    const second = step(state, only(state).action);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.state.flags["countersealed"]).toBe(true);
  });
});
