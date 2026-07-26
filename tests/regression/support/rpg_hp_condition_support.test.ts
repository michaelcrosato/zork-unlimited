import { describe, expect, it } from "vitest";
import { compileRpgSource } from "../../../src/rpg/source.js";
import type { RpgPack } from "../../../src/rpg/schema.js";
import {
  hpConditionSupportForPack,
  maximumCounterattackDamage,
} from "./rpg_hp_condition_support.js";

function packWithHpCondition(condition: string, combatGuaranteed = true): RpgPack {
  const compiled = compileRpgSource(`
meta:
  id: hp_guard
  title: HP Guard
  start_room: yard
  combat_guaranteed: ${combatGuaranteed}
  vars_init: { hp: 20, attack: 3, defense: 1 }
rooms:
  - id: yard
    name: Yard
    description: "A guard watches a lever."
    objects: [lever]
objects:
  - id: lever
    name: lever
    description: "A plain lever."
    interactions:
      - verb: USE
        target: lever
        conditions:
          - ${condition}
        effects:
          - set_flag: lever_used
enemies:
  - id: guard
    name: guard
    description: "A watchful guard."
    room: yard
    hp: 5
    attack: 6
    defense: 0
    death_ending: dead
win_conditions:
  - id: lever_used
    conditions: [{ has_flag: lever_used }]
    ending: escaped
endings:
  - { id: escaped, title: Escaped, text: "You leave." }
  - { id: dead, title: Dead, text: "The guard wins." }
`);
  expect(compiled.ok).toBe(true);
  if (!compiled.ok) throw new Error("synthetic HP-condition pack must compile");
  return compiled.compiled.pack;
}

describe("RPG exhaustive-proof HP condition support", () => {
  it("accepts only a safely crossed player upper bound and rejects every unsupported shape", () => {
    const safe = packWithHpCondition("{ var_lte: { name: hp, value: 12 } }");
    expect(maximumCounterattackDamage(safe)).toBe(12);
    expect(hpConditionSupportForPack(safe)).toEqual({
      supportedPlayerUpperBound: true,
      unsupported: false,
    });

    const unsupported = [
      packWithHpCondition("{ var_lte: { name: hp, value: 11 } }"),
      packWithHpCondition("{ var_gte: { name: hp, value: 12 } }"),
      packWithHpCondition("{ var_eq: { name: hp, value: 12 } }"),
      packWithHpCondition("{ var_lte: { name: __enemy_hp_guard, value: 12 } }"),
      packWithHpCondition("{ var_lte: { name: hp, value: 12 } }", false),
    ];
    for (const pack of unsupported) {
      expect(hpConditionSupportForPack(pack).unsupported).toBe(true);
    }
  });
});
