/**
 * Generic contract for one-shot enemy maneuvers. A maneuver is a real seeded
 * combat round with temporary attack/defense arithmetic, not a persistent stat
 * buff or a cosmetic alias for ATTACK. The result flag retires it exactly once
 * and remains valid across pack-aware save integrity checks.
 */
import { describe, expect, it } from "vitest";
import type { RpgAction } from "../../src/api/types.js";
import type { Condition } from "../../src/core/conditions.js";
import { makeStep } from "../../src/core/engine.js";
import { exitFlag, type Effect } from "../../src/core/effects.js";
import type { Rng } from "../../src/core/rng.js";
import { publicActions } from "../../src/mcp/rpg_view_projection.js";
import { load, save } from "../../src/persist/save_load.js";
import { resolveAttack } from "../../src/rpg/combat.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { compileRpgSource } from "../../src/rpg/source.js";
import { assertRpgStateReferences } from "../../src/rpg/state_integrity.js";
import type { RpgPack } from "../../src/rpg/schema.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import { resolve as resolveCli, renderActionOption } from "../../bin/rpg_play.js";
import { GameSession } from "../../ui/src/engine.js";
import { relabelRpgPack } from "./support/relabel_rpg.js";

const SOURCE = `
meta:
  id: maneuver_test
  title: Maneuver Test
  start_room: yard
  vars_init: { hp: 20, attack: 4, defense: 2 }
  flags_init: [opening_known]
rooms:
  - id: yard
    name: Yard
    description: A guard tests your footing.
    variants:
      - when: [{ has_flag: feint_used }]
        text: The guard has already seen your feint.
    exits:
      - direction: north
        to: safety
        conditions: [{ has_flag: guard_down }]
        locked_msg: The guard blocks the way.
  - id: safety
    name: Safety
    description: You are through.
    exits: [{ direction: south, to: yard }]
objects: []
npcs: []
enemies:
  - id: guard
    name: yard guard
    description: A wary guard.
    room: yard
    hp: 20
    attack: 3
    defense: 1
    defeat_flag: guard_down
    death_ending: defeated
    maneuvers:
      - id: low_feint
        command: feint low, then cut high
        conditions: [{ has_flag: opening_known }]
        result_flag: feint_used
        attack_bonus: 2
        defense_bonus: -5
        narration: You sell the low feint and turn the guard's answer aside.
win_conditions:
  - id: escaped
    conditions: [{ visited: safety }]
    ending: victory
endings:
  - { id: victory, title: Through, text: You make it through. }
  - { id: defeated, title: Beaten, text: The guard puts you down., death: true }
`;

function setup() {
  const loaded = compileRpgSource(SOURCE);
  expect(loaded.ok).toBe(true);
  if (!loaded.ok) throw new Error("maneuver fixture must compile");
  const index = indexRpgPack(loaded.compiled.pack);
  return { loaded, index };
}

function fixedRolls(...rolls: number[]): Rng {
  let cursor = 0;
  return {
    next: () => 0,
    int: () => rolls[cursor++] ?? rolls.at(-1) ?? 1,
  };
}

/** Player strike d6=4, enemy reply d6=5. */
function fixedRound(): Rng {
  return fixedRolls(4, 5);
}

function maneuverAction(): RpgAction {
  return { type: "MANEUVER", enemy: "guard", maneuver: "low_feint" };
}

function effectSurfacePack(): RpgPack {
  const { loaded } = setup();
  const pack = structuredClone(loaded.compiled.pack);
  pack.rooms[0]!.objects.push("mechanism");
  pack.objects.push({
    id: "mechanism",
    name: "mechanism",
    aliases: [],
    description: "A test mechanism.",
    takeable: true,
    quest_critical: false,
    container: false,
    openable: true,
    locked: true,
    key_id: "mechanism",
    unlock_effects: [],
    take_effects: [],
    contents: [],
    interactions: [
      {
        verb: "USE",
        target: "mechanism",
        conditions: [],
        effects: [],
        skill_check: {
          skill: "attack",
          difficulty: 1,
          on_success: [],
          on_failure: [],
        },
      },
    ],
  });
  pack.npcs.push({
    id: "observer",
    name: "observer",
    description: "An observer records the test.",
    room: "yard",
    dialogue: {
      root: "root",
      nodes: [
        {
          id: "root",
          npc_text: "Proceed.",
          effects: [],
          topics: [],
        },
      ],
    },
  });
  return pack;
}

function complementaryGuardPack(): RpgPack {
  const { loaded } = setup();
  const pack = structuredClone(loaded.compiled.pack);
  // opening_known begins true but can be cleared, so neither complementary
  // guard is individually guaranteed by the monotonic-fact proof.
  pack.rooms[0]!.on_enter.push({ clear_flag: "opening_known" });
  const first = pack.enemies[0]!.maneuvers![0]!;
  first.conditions = [{ has_flag: "opening_known" }];
  pack.enemies[0]!.maneuvers!.push({
    ...structuredClone(first),
    id: "high_feint",
    command: "feint high, then cut low",
    conditions: [{ not_flag: "opening_known" }],
    result_flag: "high_feint_used",
  });
  return pack;
}

function harmfulForcedOpeningPack(): RpgPack {
  const { loaded } = setup();
  const pack = structuredClone(loaded.compiled.pack);
  pack.meta.vars_init = { hp: 2, attack: 10, defense: 0 };
  const enemy = pack.enemies[0]!;
  enemy.hp = 10;
  enemy.attack = 1;
  enemy.defense = 0;
  enemy.maneuvers![0]!.attack_bonus = -10;
  enemy.maneuvers![0]!.defense_bonus = 0;
  return pack;
}

function beneficialForcedOpeningPack(): RpgPack {
  const { loaded } = setup();
  const pack = structuredClone(loaded.compiled.pack);
  pack.meta.combat_guaranteed = true;
  pack.meta.vars_init = { hp: 12, attack: 0, defense: 0 };
  const enemy = pack.enemies[0]!;
  enemy.hp = 10;
  enemy.attack = 1;
  enemy.defense = 0;
  enemy.maneuvers![0]!.attack_bonus = 10;
  enemy.maneuvers![0]!.defense_bonus = 0;
  return pack;
}

function sequencedPack(): RpgPack {
  const { loaded } = setup();
  const pack = structuredClone(loaded.compiled.pack);
  const enemy = pack.enemies[0]!;
  const low = enemy.maneuvers![0]!;
  const high = structuredClone(low);
  high.id = "high_feint";
  high.command = "feint high, then cut low";
  high.result_flag = "high_feint_used";
  high.attack_bonus = -1;
  high.defense_bonus = 2;

  const lowDrive = structuredClone(low);
  lowDrive.id = "low_drive";
  lowDrive.command = "drive through the low opening";
  lowDrive.after = low.id;
  lowDrive.conditions = [];
  lowDrive.result_flag = "low_drive_used";
  lowDrive.attack_bonus = 1;
  lowDrive.defense_bonus = 0;

  const lowGuard = structuredClone(lowDrive);
  lowGuard.id = "low_guard";
  lowGuard.command = "cover the low opening";
  lowGuard.result_flag = "low_guard_used";
  lowGuard.attack_bonus = -1;
  lowGuard.defense_bonus = 2;

  const highDrive = structuredClone(lowDrive);
  highDrive.id = "high_drive";
  highDrive.command = "drive through the high opening";
  highDrive.after = high.id;
  highDrive.result_flag = "high_drive_used";

  enemy.maneuvers = [low, high, lowDrive, lowGuard, highDrive];
  return pack;
}

function maneuverResourceObject(
  id: string,
  options: { held?: true } = {},
): RpgPack["objects"][number] {
  return {
    id,
    name: id.replaceAll("_", " "),
    aliases: [],
    description: `A ${id.replaceAll("_", " ")} used by the maneuver fixture.`,
    takeable: false,
    ...(options.held ? { held: true } : {}),
    quest_critical: false,
    container: false,
    openable: false,
    locked: false,
    unlock_effects: [],
    take_effects: [],
    contents: [],
    interactions: [],
  };
}

function resourceSequencePack(): RpgPack {
  const pack = sequencedPack();
  pack.objects.push(
    maneuverResourceObject("field_ration", { held: true }),
    maneuverResourceObject("saved_token"),
  );
  const maneuver = pack.enemies[0]!.maneuvers!.find((candidate) => candidate.id === "low_drive")!;
  maneuver.conditions = [{ has_item: "field_ration" }, { not_item: "saved_token" }];
  maneuver.resource_effects = [{ remove_item: "field_ration" }, { add_item: "saved_token" }];
  return pack;
}

function sequencedSource(): string {
  return SOURCE.replace(
    "\nwin_conditions:",
    `
      - id: low_drive
        command: drive through the low opening
        after: low_feint
        conditions: []
        result_flag: low_drive_used
        attack_bonus: 1
        defense_bonus: 0
        narration: You keep the initiative and drive through the opening.
win_conditions:`,
  );
}

describe("one-shot enemy maneuvers", () => {
  it("does not materialize a maneuvers property on legacy enemy shapes", () => {
    const legacy = compileRpgSource(
      SOURCE.replace(/\n {4}maneuvers:[\s\S]*?(?=\nwin_conditions:)/, ""),
    );
    expect(legacy.ok).toBe(true);
    if (!legacy.ok) return;
    expect(legacy.compiled.pack.enemies[0]).not.toHaveProperty("maneuvers");
  });

  it("does not materialize resource effects on legacy maneuver shapes", () => {
    const { loaded } = setup();
    expect(loaded.compiled.pack.enemies[0]!.maneuvers![0]).not.toHaveProperty("resource_effects");
  });

  it("rejects a zero/zero maneuver that would be only a cosmetic ATTACK alias", () => {
    const zero = compileRpgSource(
      SOURCE.replace("attack_bonus: 2", "attack_bonus: 0").replace(
        "defense_bonus: -5",
        "defense_bonus: 0",
      ),
    );
    expect(zero.ok).toBe(false);
    if (zero.ok) return;
    expect(zero.error.issues.map((issue) => issue.message)).toContain(
      "a maneuver must change attack_bonus or defense_bonus (both cannot be zero)",
    );

    const { loaded } = setup();
    const bypassedSchema = structuredClone(loaded.compiled.pack);
    bypassedSchema.enemies[0]!.maneuvers![0]!.attack_bonus = 0;
    bypassedSchema.enemies[0]!.maneuvers![0]!.defense_bonus = 0;
    expect(validateRpg(bypassedSchema).findings.map((finding) => finding.code)).toContain(
      "MANEUVER_NO_MODIFIER",
    );
  });

  it("enumerates a distinct MANEUVER with explicit one-shot combat metadata", () => {
    const { index } = setup();
    const state = initStateForRpgPack(index, 17);
    const option = enumerateRpgActions(index, state).find(
      (candidate) => candidate.id === "maneuver_guard_low_feint",
    );

    expect(option).toMatchObject({
      command: "feint low, then cut high",
      action: maneuverAction(),
      combat: { attack_bonus: 2, defense_bonus: -5, one_shot: true },
    });
    expect(enumerateRpgActions(index, state).map((candidate) => candidate.id)).not.toContain(
      "attack_guard",
    );

    const withoutOpening = {
      ...state,
      flags: { ...state.flags, opening_known: false },
    };
    expect(enumerateRpgActions(index, withoutOpening).map((candidate) => candidate.id)).toContain(
      "attack_guard",
    );
    expect(
      enumerateRpgActions(index, withoutOpening).map((candidate) => candidate.id),
    ).not.toContain("maneuver_guard_low_feint");
  });

  it("runs one standard seeded round with temporary modifiers, then retires", () => {
    const { loaded, index } = setup();
    const rules = buildRpgRules(index, () => fixedRound());
    const step = makeStep(rules);
    const before = initStateForRpgPack(index, 17);
    const result = step(before, maneuverAction());

    expect(result.ok).toBe(true);
    // Strike: d6 4 + (4 base + 2 maneuver) - 1 = 9. Reply: d6 5 + 3 -
    // (2 base - 5 maneuver, clamped to 0) = 8. Persistent stats never move.
    expect(result.state.vars.__enemy_hp_guard).toBe(11);
    expect(result.state.vars.hp).toBe(12);
    expect(result.state.vars.attack).toBe(4);
    expect(result.state.vars.defense).toBe(2);
    expect(result.state.flags.feint_used).toBe(true);
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "state_change", effect: "set_flag", flag: "feint_used" }),
        expect.objectContaining({
          type: "narration",
          text: "You sell the low feint and turn the guard's answer aside.",
        }),
        expect.objectContaining({ type: "narration", text: expect.stringContaining("+ 6 atk") }),
        expect.objectContaining({ type: "narration", text: expect.stringContaining("- 0 def") }),
      ]),
    );

    expect(enumerateRpgActions(index, result.state).map((option) => option.id)).not.toContain(
      "maneuver_guard_low_feint",
    );
    expect(enumerateRpgActions(index, result.state).map((option) => option.id)).toContain(
      "attack_guard",
    );
    const repeated = step(result.state, maneuverAction());
    expect(repeated.ok).toBe(false);
    expect(repeated.state).toBe(result.state);
    expect(() => assertRpgStateReferences(index, result.state)).not.toThrow();

    const bytes = save(result.state, loaded.compiled.contentHash, "rpg", {
      worldQuestId: "maneuver_test",
    });
    const restored = load(bytes, loaded.compiled.contentHash, "rpg").state;
    expect(restored).toEqual(result.state);
    expect(() => assertRpgStateReferences(index, restored)).not.toThrow();
    expect(enumerateRpgActions(index, restored).map((option) => option.id)).not.toContain(
      "maneuver_guard_low_feint",
    );
    expect(enumerateRpgActions(index, restored).map((option) => option.id)).toContain(
      "attack_guard",
    );
  });

  it("commits guarded resource deltas once, before combat, and exposes them in full menus", () => {
    const pack = resourceSequencePack();
    expect(validateRpg(pack).findings).toEqual([]);
    const index = indexRpgPack(pack);
    const step = makeStep(buildRpgRules(index, () => fixedRound()));
    const opened = step(initStateForRpgPack(index, 17), maneuverAction());
    expect(opened.ok).toBe(true);

    const followThroughs = enumerateRpgActions(index, opened.state);
    const option = followThroughs.find((candidate) => candidate.id === "maneuver_guard_low_drive");
    expect(option?.resources).toEqual({ gains: ["saved_token"], costs: ["field_ration"] });
    expect(
      buildRpgObservation(index, opened.state).available_actions.find(
        (candidate) => candidate.id === "maneuver_guard_low_drive",
      )?.resources,
    ).toEqual({ gains: ["saved_token"], costs: ["field_ration"] });
    expect(
      publicActions(followThroughs).find((candidate) => candidate.id === "maneuver_guard_low_drive")
        ?.resources,
    ).toEqual({ gains: ["saved_token"], costs: ["field_ration"] });

    const result = step(opened.state, {
      type: "MANEUVER",
      enemy: "guard",
      maneuver: "low_drive",
    });
    expect(result.ok).toBe(true);
    expect(result.state.inventory).toContain("saved_token");
    expect(result.state.inventory).not.toContain("field_ration");
    expect(result.state.flags.low_drive_used).toBe(true);

    const resourceEventIndexes = result.events.flatMap((event, index) =>
      (event.type === "take" && event.item === "saved_token") ||
      (event.type === "drop" && event.item === "field_ration")
        ? [index]
        : [],
    );
    const combatNarrationIndex = result.events.findIndex(
      (event) => event.type === "narration" && event.text.includes("atk"),
    );
    expect(resourceEventIndexes).toHaveLength(2);
    expect(resourceEventIndexes.every((index) => index < combatNarrationIndex)).toBe(true);

    expect(step(result.state, { type: "MANEUVER", enemy: "guard", maneuver: "low_drive" }).ok).toBe(
      false,
    );
    expect(step(result.state, { type: "MANEUVER", enemy: "guard", maneuver: "low_guard" }).ok).toBe(
      false,
    );
    expect(result.state.inventory.filter((item) => item === "saved_token")).toHaveLength(1);
  });

  it("admits only non-empty, item-only maneuver resource effect lists", () => {
    const inject = (resourceEffects: string): string =>
      SOURCE.replace(
        "        narration: You sell the low feint and turn the guard's answer aside.",
        `        resource_effects: ${resourceEffects}\n        narration: You sell the low feint and turn the guard's answer aside.`,
      );

    expect(compileRpgSource(inject("[]")).ok).toBe(false);
    expect(compileRpgSource(inject("[{ set_flag: resource_farmed }]")).ok).toBe(false);
    expect(compileRpgSource(inject("[{ add_item: token, remove_item: ration }]")).ok).toBe(false);
  });

  it("validates maneuver resource ownership, uniqueness, references, and acquisition", () => {
    const healthy = resourceSequencePack();
    expect(validateRpg(healthy).findings.map((finding) => finding.code)).not.toContain(
      "ITEM_UNPLACED",
    );

    const unguardedAdd = resourceSequencePack();
    unguardedAdd.enemies[0]!.maneuvers!.find(
      (maneuver) => maneuver.id === "low_drive",
    )!.conditions = [{ has_item: "field_ration" }];
    expect(validateRpg(unguardedAdd).findings.map((finding) => finding.code)).toContain(
      "MANEUVER_RESOURCE_EFFECT_UNGUARDED",
    );

    const disjunctiveAdd = resourceSequencePack();
    disjunctiveAdd.enemies[0]!.maneuvers!.find(
      (maneuver) => maneuver.id === "low_drive",
    )!.conditions = [
      { has_item: "field_ration" },
      { any_of: [{ not_item: "saved_token" }, { has_flag: "opening_known" }] },
    ];
    expect(validateRpg(disjunctiveAdd).findings.map((finding) => finding.code)).toContain(
      "MANEUVER_RESOURCE_EFFECT_UNGUARDED",
    );

    const unguardedRemoval = resourceSequencePack();
    unguardedRemoval.enemies[0]!.maneuvers!.find(
      (maneuver) => maneuver.id === "low_drive",
    )!.conditions = [{ not_item: "saved_token" }];
    expect(validateRpg(unguardedRemoval).findings.map((finding) => finding.code)).toContain(
      "MANEUVER_RESOURCE_EFFECT_UNGUARDED",
    );

    const duplicate = resourceSequencePack();
    duplicate.enemies[0]!.maneuvers!.find(
      (maneuver) => maneuver.id === "low_drive",
    )!.resource_effects!.push({ add_item: "saved_token" });
    expect(validateRpg(duplicate).findings.map((finding) => finding.code)).toContain(
      "MANEUVER_RESOURCE_EFFECT_DUPLICATE",
    );

    const conflict = resourceSequencePack();
    conflict.enemies[0]!.maneuvers!.find(
      (maneuver) => maneuver.id === "low_drive",
    )!.resource_effects!.push({ remove_item: "saved_token" });
    expect(validateRpg(conflict).findings.map((finding) => finding.code)).toContain(
      "MANEUVER_RESOURCE_EFFECT_CONFLICT",
    );

    const missing = resourceSequencePack();
    const missingManeuver = missing.enemies[0]!.maneuvers!.find(
      (maneuver) => maneuver.id === "low_drive",
    )!;
    missingManeuver.conditions.push({ not_item: "phantom_token" });
    missingManeuver.resource_effects!.push({ add_item: "phantom_token" });
    expect(validateRpg(missing).findings.map((finding) => finding.code)).toContain(
      "ITEM_REF_MISSING",
    );
  });

  it("preserves legacy standard ATTACK arithmetic and clamps only modifier-bearing rounds", () => {
    const { loaded, index } = setup();
    const enemy = index.enemies.get("guard")!;
    const before = initStateForRpgPack(index, 17);
    const legacyNegativeDefense = {
      ...before,
      vars: { ...before.vars, defense: -5 },
    };

    // Legacy ordinary ATTACK uses the stored -5 defense exactly: reply damage
    // is d6 5 + 3 atk - (-5 def) = 13, leaving 7 HP.
    expect(resolveAttack(legacyNegativeDefense, enemy, fixedRound()).effects).toContainEqual({
      set_var: { name: "hp", value: 7 },
    });
    // Supplying temporary modifiers opts into effective-stat clamping. A zero
    // temporary defense bonus therefore clamps -5 to 0 for this round only:
    // reply damage is 5 + 3 - 0 = 8, leaving 12 HP.
    expect(
      resolveAttack(legacyNegativeDefense, enemy, fixedRound(), {
        attackBonus: 0,
        defenseBonus: 0,
      }).effects,
    ).toContainEqual({ set_var: { name: "hp", value: 12 } });

    const legacyPack = structuredClone(loaded.compiled.pack);
    legacyPack.enemies[0]!.maneuvers = undefined;
    legacyPack.meta.vars_init.defense = -5;
    expect(validateRpg(legacyPack).findings.map((finding) => finding.code)).not.toContain(
      "COMBAT_UNWINNABLE",
    );
  });

  it("projects the tactical math through full observation, MCP, UI, and CLI", () => {
    const { index } = setup();
    const state = initStateForRpgPack(index, 17);
    const option = enumerateRpgActions(index, state).find(
      (candidate) => candidate.id === "maneuver_guard_low_feint",
    );
    expect(option).toBeDefined();
    const observed = buildRpgObservation(index, state).available_actions.find(
      (candidate) => candidate.id === "maneuver_guard_low_feint",
    );
    expect(observed?.combat).toEqual({
      attack_bonus: 2,
      defense_bonus: -5,
      one_shot: true,
    });
    expect(publicActions([option!])[0]).toMatchObject({
      id: "maneuver_guard_low_feint",
      combat: { attack_bonus: 2, defense_bonus: -5, one_shot: true },
    });

    expect(resolveCli(index, state, "FEINT LOW, THEN CUT HIGH")).toEqual({
      ok: true,
      action: maneuverAction(),
    });
    expect(renderActionOption(option!)).toContain("ATK +2, DEF -5 this round");
    const ui = GameSession.start(SOURCE, 17).view();
    expect(ui.choices.find((choice) => choice.id === "maneuver_guard_low_feint")?.label).toContain(
      "one-shot, ATK +2, DEF -5 this round",
    );
  });

  it("runs one shallow opening/follow-through sequence with exclusive cohorts", () => {
    const pack = sequencedPack();
    expect(validateRpg(pack).findings).toEqual([]);
    const index = indexRpgPack(pack);
    const step = makeStep(buildRpgRules(index, () => fixedRound()));
    let state = initStateForRpgPack(index, 17);

    const openings = enumerateRpgActions(index, state);
    expect(openings.map((option) => option.id)).toEqual(
      expect.arrayContaining(["maneuver_guard_low_feint", "maneuver_guard_high_feint"]),
    );
    expect(openings.map((option) => option.id)).not.toContain("attack_guard");
    expect(
      openings.find((option) => option.id === "maneuver_guard_low_feint")?.combat,
    ).toMatchObject({ phase: "opening" });
    expect(openings.some((option) => option.id === "maneuver_guard_low_drive")).toBe(false);

    const opened = step(state, maneuverAction());
    expect(opened.ok).toBe(true);
    state = opened.state;
    expect(state.flags.feint_used).toBe(true);
    expect(state.vars.__enemy_hp_guard).toBe(11);

    const followThroughs = enumerateRpgActions(index, state);
    expect(followThroughs.map((option) => option.id)).toEqual(
      expect.arrayContaining(["maneuver_guard_low_drive", "maneuver_guard_low_guard"]),
    );
    for (const unavailable of [
      "maneuver_guard_low_feint",
      "maneuver_guard_high_feint",
      "maneuver_guard_high_drive",
      "attack_guard",
    ]) {
      expect(followThroughs.map((option) => option.id)).not.toContain(unavailable);
    }
    expect(
      followThroughs.find((option) => option.id === "maneuver_guard_low_drive")?.combat,
    ).toMatchObject({ phase: "follow_through" });
    expect(resolveCli(index, state, "DRIVE THROUGH THE LOW OPENING")).toEqual({
      ok: true,
      action: { type: "MANEUVER", enemy: "guard", maneuver: "low_drive" },
    });
    expect(
      renderActionOption(
        followThroughs.find((option) => option.id === "maneuver_guard_low_drive")!,
      ),
    ).toContain("[follow-through;");
    expect(
      publicActions(followThroughs).find((option) => option.id === "maneuver_guard_low_drive")
        ?.combat,
    ).toMatchObject({ phase: "follow_through" });
    expect(
      buildRpgObservation(index, state).available_actions.find(
        (option) => option.id === "maneuver_guard_low_drive",
      )?.combat,
    ).toMatchObject({ phase: "follow_through" });

    const bytes = save(state, "sequence_hash", "rpg", { worldQuestId: "maneuver_test" });
    const restored = load(bytes, "sequence_hash", "rpg").state;
    expect(() => assertRpgStateReferences(index, restored)).not.toThrow();
    expect(enumerateRpgActions(index, restored).map((option) => option.id)).toContain(
      "maneuver_guard_low_drive",
    );

    expect(step(state, { type: "MANEUVER", enemy: "guard", maneuver: "high_feint" }).ok).toBe(
      false,
    );
    const followed = step(state, { type: "MANEUVER", enemy: "guard", maneuver: "low_drive" });
    expect(followed.ok).toBe(true);
    state = followed.state;
    expect(state.flags.low_drive_used).toBe(true);
    expect(state.vars.__enemy_hp_guard).toBe(3);
    expect(enumerateRpgActions(index, state).map((option) => option.id)).toContain("attack_guard");
    expect(step(state, { type: "MANEUVER", enemy: "guard", maneuver: "low_guard" }).ok).toBe(false);

    const ui = GameSession.start(sequencedSource(), 17);
    expect(
      ui.view().choices.find((choice) => choice.id === "maneuver_guard_low_feint")?.label,
    ).toContain("opening, ATK +2, DEF -5 this round");
    expect(ui.choose("maneuver_guard_low_feint").ok).toBe(true);
    expect(
      ui.view().choices.find((choice) => choice.id === "maneuver_guard_low_drive")?.label,
    ).toContain("follow-through, ATK +1, DEF +0 this round");
  });

  it("falls back to ATTACK on a child guard gap and never offers a child after a root kill", () => {
    const gap = sequencedPack();
    for (const maneuver of gap.enemies[0]!.maneuvers!) {
      if (maneuver.after === "low_feint") maneuver.conditions = [{ has_flag: "child_gate" }];
    }
    const gapIndex = indexRpgPack(gap);
    const gapStep = makeStep(buildRpgRules(gapIndex, () => fixedRound()));
    const gapOpened = gapStep(initStateForRpgPack(gapIndex, 17), maneuverAction());
    expect(gapOpened.ok).toBe(true);
    const gapIds = enumerateRpgActions(gapIndex, gapOpened.state).map((option) => option.id);
    expect(gapIds).toContain("attack_guard");
    expect(gapIds.some((id) => id.includes("low_drive") || id.includes("low_guard"))).toBe(false);

    const killed = sequencedPack();
    killed.enemies[0]!.hp = 1;
    const killedIndex = indexRpgPack(killed);
    const killedStep = makeStep(buildRpgRules(killedIndex, () => fixedRound()));
    const result = killedStep(initStateForRpgPack(killedIndex, 17), maneuverAction());
    expect(result.ok).toBe(true);
    expect(result.state.flags.guard_down).toBe(true);
    expect(
      enumerateRpgActions(killedIndex, result.state).some(
        (option) => option.action.type === "MANEUVER" || option.id === "attack_guard",
      ),
    ).toBe(false);
  });

  it("rejects malformed shallow sequence topology and relabels parent ids", () => {
    const valid = sequencedPack();
    const { pack: relabeled, relabeler } = relabelRpgPack(valid);
    const relabeledChild = relabeled.enemies[0]!.maneuvers!.find(
      (maneuver) => maneuver.id === relabeler.map.get("low_drive"),
    );
    expect(relabeledChild?.after).toBe(relabeler.map.get("low_feint"));
    expect(validateRpg(relabeled).findings).toEqual([]);

    const missing = sequencedPack();
    missing.enemies[0]!.maneuvers!.find((maneuver) => maneuver.id === "low_drive")!.after =
      "missing_opening";
    expect(validateRpg(missing).findings.map((finding) => finding.code)).toContain(
      "MANEUVER_AFTER_MISSING",
    );

    const self = sequencedPack();
    self.enemies[0]!.maneuvers!.find((maneuver) => maneuver.id === "low_drive")!.after =
      "low_drive";
    expect(validateRpg(self).findings.map((finding) => finding.code)).toContain(
      "MANEUVER_AFTER_SELF",
    );

    const deep = sequencedPack();
    deep.enemies[0]!.maneuvers!.find((maneuver) => maneuver.id === "high_drive")!.after =
      "low_drive";
    expect(validateRpg(deep).findings.map((finding) => finding.code)).toContain(
      "MANEUVER_AFTER_NOT_ROOT",
    );

    const cycle = sequencedPack();
    const low = cycle.enemies[0]!.maneuvers!.find((maneuver) => maneuver.id === "low_feint")!;
    const high = cycle.enemies[0]!.maneuvers!.find((maneuver) => maneuver.id === "high_feint")!;
    low.after = high.id;
    high.after = low.id;
    const cycleCodes = validateRpg(cycle).findings.map((finding) => finding.code);
    expect(cycleCodes).toContain("MANEUVER_AFTER_CYCLE");
    expect(cycleCodes).toContain("MANEUVER_SEQUENCE_NO_ROOT");
  });

  it("rejects forged orphan and multiply committed sequence save states", () => {
    const pack = sequencedPack();
    const index = indexRpgPack(pack);
    const state = initStateForRpgPack(index, 17);
    expect(() =>
      assertRpgStateReferences(index, {
        ...state,
        flags: { ...state.flags, low_drive_used: true },
      }),
    ).toThrow(/without its opening/);
    expect(() =>
      assertRpgStateReferences(index, {
        ...state,
        flags: { ...state.flags, feint_used: true, high_feint_used: true },
      }),
    ).toThrow(/multiple opening maneuvers/);
    expect(() =>
      assertRpgStateReferences(index, {
        ...state,
        flags: {
          ...state.flags,
          feint_used: true,
          low_drive_used: true,
          low_guard_used: true,
        },
      }),
    ).toThrow(/multiple follow-through maneuvers/);
  });

  it("validates result-flag lifecycle and rejects ambiguous or pre-retired declarations", () => {
    const { loaded } = setup();
    expect(validateRpg(loaded.compiled.pack).findings).toEqual([]);

    const duplicate = structuredClone(loaded.compiled.pack);
    duplicate.enemies[0]!.maneuvers!.push({
      ...duplicate.enemies[0]!.maneuvers![0]!,
      result_flag: "other_result",
    });
    const duplicateCodes = validateRpg(duplicate).findings.map((finding) => finding.code);
    expect(duplicateCodes).toContain("DUPLICATE_MANEUVER_ID");
    expect(duplicateCodes).toContain("DUPLICATE_MANEUVER_COMMAND");

    const initialized = structuredClone(loaded.compiled.pack);
    initialized.meta.flags_init.push("feint_used");
    expect(validateRpg(initialized).findings.map((finding) => finding.code)).toContain(
      "MANEUVER_RESULT_FLAG_INITIALIZED",
    );

    const collision = structuredClone(loaded.compiled.pack);
    collision.enemies.push({
      ...structuredClone(collision.enemies[0]!),
      id: "second_guard",
      defeat_flag: "second_guard_down",
      maneuvers: undefined,
    });
    collision.enemies[0]!.maneuvers![0]!.result_flag = "second_guard_down";
    expect(validateRpg(collision).findings.map((finding) => finding.code)).toContain(
      "MANEUVER_DEFEAT_FLAG_COLLISION",
    );

    const actionIdCollision = structuredClone(loaded.compiled.pack);
    const firstEnemy = actionIdCollision.enemies[0]!;
    firstEnemy.id = "guard_left";
    firstEnemy.maneuvers![0]!.id = "hook";
    const secondEnemy = structuredClone(firstEnemy);
    secondEnemy.id = "guard";
    secondEnemy.defeat_flag = "second_guard_down";
    secondEnemy.maneuvers![0]!.id = "left_hook";
    secondEnemy.maneuvers![0]!.command = "take the other opening";
    secondEnemy.maneuvers![0]!.result_flag = "second_feint_used";
    actionIdCollision.enemies.push(secondEnemy);
    expect(validateRpg(actionIdCollision).findings.map((finding) => finding.code)).toContain(
      "MANEUVER_ACTION_ID_COLLISION",
    );

    // The collision is visible on both full-observation and MCP projections,
    // whose consumers select by id; semantic validation must reject it before
    // either ambiguous menu can ship.
    const collisionIndex = indexRpgPack(actionIdCollision);
    const collisionState = initStateForRpgPack(collisionIndex, 17);
    const fullIds = buildRpgObservation(collisionIndex, collisionState)
      .available_actions.filter((option) => option.action.type === "MANEUVER")
      .map((option) => option.id);
    expect(fullIds).toEqual(["maneuver_guard_left_hook", "maneuver_guard_left_hook"]);
    const mcpIds = publicActions(enumerateRpgActions(collisionIndex, collisionState))
      .filter((option) => option.id.startsWith("maneuver_"))
      .map((option) => option.id);
    expect(mcpIds).toEqual(fullIds);
  });

  it("checks authored maneuver guards together with implicit self/sibling retirement", () => {
    const { loaded } = setup();
    const selfRetired = structuredClone(loaded.compiled.pack);
    selfRetired.enemies[0]!.maneuvers![0]!.conditions = [{ has_flag: "feint_used" }];
    expect(
      validateRpg(selfRetired).findings.some(
        (finding) =>
          finding.code === "UNSATISFIABLE_CONDITION" &&
          finding.where.includes("maneuver:low_feint"),
      ),
    ).toBe(true);

    const siblingRetired = structuredClone(loaded.compiled.pack);
    siblingRetired.enemies[0]!.maneuvers!.push({
      ...structuredClone(siblingRetired.enemies[0]!.maneuvers![0]!),
      id: "high_feint",
      command: "feint high, then cut low",
      result_flag: "high_feint_used",
    });
    siblingRetired.enemies[0]!.maneuvers![0]!.conditions = [{ has_flag: "high_feint_used" }];
    expect(
      validateRpg(siblingRetired).findings.some(
        (finding) =>
          finding.code === "UNSATISFIABLE_CONDITION" &&
          finding.where.includes("maneuver:low_feint"),
      ),
    ).toBe(true);

    const parentContradiction = sequencedPack();
    parentContradiction.enemies[0]!.maneuvers!.find(
      (maneuver) => maneuver.id === "low_drive",
    )!.conditions = [{ not_flag: "feint_used" }];
    expect(
      validateRpg(parentContradiction).findings.some(
        (finding) =>
          finding.code === "UNSATISFIABLE_CONDITION" &&
          finding.where.includes("maneuver:low_drive"),
      ),
    ).toBe(true);

    const childSiblingContradiction = sequencedPack();
    childSiblingContradiction.enemies[0]!.maneuvers!.find(
      (maneuver) => maneuver.id === "low_drive",
    )!.conditions = [{ has_flag: "low_guard_used" }];
    expect(
      validateRpg(childSiblingContradiction).findings.some(
        (finding) =>
          finding.code === "UNSATISFIABLE_CONDITION" &&
          finding.where.includes("maneuver:low_drive"),
      ),
    ).toBe(true);
  });

  it("rejects a result-flag reset from every authored effect surface", () => {
    const clear = (): Effect => ({ clear_flag: "feint_used" });
    const sites: [string, (pack: RpgPack) => void][] = [
      ["room on_enter", (pack) => pack.rooms[0]!.on_enter.push(clear())],
      ["enemy on_defeat", (pack) => pack.enemies[0]!.on_defeat.push(clear())],
      ["object take_effects", (pack) => pack.objects[0]!.take_effects!.push(clear())],
      ["object unlock_effects", (pack) => pack.objects[0]!.unlock_effects!.push(clear())],
      ["interaction effects", (pack) => pack.objects[0]!.interactions[0]!.effects.push(clear())],
      [
        "skill success",
        (pack) => pack.objects[0]!.interactions[0]!.skill_check!.on_success.push(clear()),
      ],
      [
        "skill failure",
        (pack) => pack.objects[0]!.interactions[0]!.skill_check!.on_failure.push(clear()),
      ],
      ["dialogue node", (pack) => pack.npcs[0]!.dialogue.nodes[0]!.effects.push(clear())],
    ];

    for (const [label, inject] of sites) {
      const pack = effectSurfacePack();
      inject(pack);
      expect(
        validateRpg(pack).findings.map((finding) => finding.code),
        label,
      ).toContain("MANEUVER_RESULT_FLAG_CLEARED");
    }
  });

  it("rejects foreign and duplicate result-flag owners", () => {
    const set = (): Effect => ({ set_flag: "feint_used" });
    const sites: [string, (pack: RpgPack) => void][] = [
      ["room on_enter", (pack) => pack.rooms[0]!.on_enter.push(set())],
      ["enemy on_defeat", (pack) => pack.enemies[0]!.on_defeat.push(set())],
      ["object take_effects", (pack) => pack.objects[0]!.take_effects!.push(set())],
      ["object unlock_effects", (pack) => pack.objects[0]!.unlock_effects!.push(set())],
      ["interaction effects", (pack) => pack.objects[0]!.interactions[0]!.effects.push(set())],
      [
        "skill success",
        (pack) => pack.objects[0]!.interactions[0]!.skill_check!.on_success.push(set()),
      ],
      [
        "skill failure",
        (pack) => pack.objects[0]!.interactions[0]!.skill_check!.on_failure.push(set()),
      ],
      ["dialogue node", (pack) => pack.npcs[0]!.dialogue.nodes[0]!.effects.push(set())],
    ];

    for (const [label, inject] of sites) {
      const pack = effectSurfacePack();
      inject(pack);
      expect(
        validateRpg(pack).findings.map((finding) => finding.code),
        label,
      ).toContain("MANEUVER_RESULT_FLAG_FOREIGN_WRITER");
    }

    const derivedWriter = effectSurfacePack();
    derivedWriter.enemies[0]!.maneuvers![0]!.result_flag = exitFlag("yard", "safety");
    derivedWriter.rooms[0]!.on_enter.push({ unlock_exit: { from: "yard", to: "safety" } });
    expect(validateRpg(derivedWriter).findings.map((finding) => finding.code)).toContain(
      "MANEUVER_RESULT_FLAG_FOREIGN_WRITER",
    );

    const siblingOwner = effectSurfacePack();
    const sibling = structuredClone(siblingOwner.enemies[0]!.maneuvers![0]!);
    sibling.id = "high_feint";
    sibling.command = "feint high, then cut low";
    siblingOwner.enemies[0]!.maneuvers!.push(sibling);
    expect(
      validateRpg(siblingOwner).findings.filter(
        (finding) => finding.code === "DUPLICATE_MANEUVER_RESULT_FLAG",
      ),
    ).toHaveLength(1);

    const crossEnemyOwner = effectSurfacePack();
    const secondEnemy = structuredClone(crossEnemyOwner.enemies[0]!);
    secondEnemy.id = "second_guard";
    secondEnemy.name = "second yard guard";
    secondEnemy.defeat_flag = "second_guard_down";
    crossEnemyOwner.enemies.push(secondEnemy);
    expect(
      validateRpg(crossEnemyOwner).findings.filter(
        (finding) => finding.code === "DUPLICATE_MANEUVER_RESULT_FLAG",
      ),
    ).toHaveLength(1);
  });

  it("retains standard ATTACK in combat bounds when result ownership is ambiguous", () => {
    const lower = harmfulForcedOpeningPack();
    lower.rooms[0]!.on_enter.push({ set_flag: "feint_used" });
    const lowerCodes = validateRpg(lower).findings.map((finding) => finding.code);
    expect(lowerCodes).toContain("MANEUVER_RESULT_FLAG_FOREIGN_WRITER");
    expect(lowerCodes).not.toContain("COMBAT_UNWINNABLE");

    const upper = beneficialForcedOpeningPack();
    upper.rooms[0]!.on_enter.push({ set_flag: "feint_used" });
    const upperCodes = validateRpg(upper).findings.map((finding) => finding.code);
    expect(upperCodes).toContain("MANEUVER_RESULT_FLAG_FOREIGN_WRITER");
    expect(upperCodes).toContain("COMBAT_NOT_GUARANTEED");

    const duplicate = harmfulForcedOpeningPack();
    const duplicateManeuver = structuredClone(duplicate.enemies[0]!.maneuvers![0]!);
    duplicateManeuver.id = "high_feint";
    duplicateManeuver.command = "feint high, then cut low";
    duplicate.enemies[0]!.maneuvers!.push(duplicateManeuver);
    const duplicateCodes = validateRpg(duplicate).findings.map((finding) => finding.code);
    expect(duplicateCodes).toContain("DUPLICATE_MANEUVER_RESULT_FLAG");
    expect(duplicateCodes).not.toContain("COMBAT_UNWINNABLE");

    const initialized = harmfulForcedOpeningPack();
    initialized.meta.flags_init.push("feint_used");
    const initializedCodes = validateRpg(initialized).findings.map((finding) => finding.code);
    expect(initializedCodes).toContain("MANEUVER_RESULT_FLAG_INITIALIZED");
    expect(initializedCodes).not.toContain("COMBAT_UNWINNABLE");
  });

  it("excludes encounter-impossible maneuver routes from lower and upper bounds", () => {
    const impossibleGuards: [string, Condition][] = [
      ["complement of immutable flag", { not_flag: "opening_known" }],
      ["nested complement", { none_of: [{ has_flag: "opening_known" }] }],
      ["wrong current room", { none_of: [{ in_room: "yard" }] }],
      ["necessarily visited room", { not_visited: "yard" }],
    ];

    for (const [label, conditions] of impossibleGuards) {
      const lower = harmfulForcedOpeningPack();
      const impossibleSafe = structuredClone(lower.enemies[0]!.maneuvers![0]!);
      impossibleSafe.id = "high_feint";
      impossibleSafe.command = "feint high, then cut low";
      impossibleSafe.conditions = [conditions];
      impossibleSafe.result_flag = "high_feint_used";
      impossibleSafe.attack_bonus = 10;
      lower.enemies[0]!.maneuvers!.push(impossibleSafe);
      const finding = validateRpg(lower).findings.find(
        (candidate) => candidate.code === "COMBAT_UNWINNABLE",
      );
      expect(finding?.message, label).toContain('maneuver "low_feint"');
    }

    const upper = beneficialForcedOpeningPack();
    const impossibleHarmful = structuredClone(upper.enemies[0]!.maneuvers![0]!);
    impossibleHarmful.id = "high_feint";
    impossibleHarmful.command = "feint high, then cut low";
    impossibleHarmful.conditions = [{ not_flag: "opening_known" }];
    impossibleHarmful.result_flag = "high_feint_used";
    impossibleHarmful.attack_bonus = -10;
    upper.enemies[0]!.maneuvers!.push(impossibleHarmful);
    const upperCodes = validateRpg(upper).findings.map((finding) => finding.code);
    expect(upperCodes).not.toContain("COMBAT_NOT_GUARANTEED");
    expect(upperCodes).not.toContain("COMBAT_GAUNTLET_NOT_GUARANTEED");
  });

  it("uses sound encounter facts for collective guard coverage", () => {
    const lower = harmfulForcedOpeningPack();
    lower.enemies[0]!.maneuvers![0]!.conditions = [{ not_flag: "guard_down" }];
    expect(validateRpg(lower).findings.map((finding) => finding.code)).toContain(
      "COMBAT_UNWINNABLE",
    );

    const nested = harmfulForcedOpeningPack();
    nested.enemies[0]!.maneuvers![0]!.conditions = [{ none_of: [{ has_flag: "guard_down" }] }];
    expect(validateRpg(nested).findings.map((finding) => finding.code)).toContain(
      "COMBAT_UNWINNABLE",
    );

    const upper = beneficialForcedOpeningPack();
    upper.enemies[0]!.maneuvers![0]!.conditions = [{ not_flag: "guard_down" }];
    const upperCodes = validateRpg(upper).findings.map((finding) => finding.code);
    expect(upperCodes).not.toContain("COMBAT_NOT_GUARANTEED");
    expect(upperCodes).not.toContain("COMBAT_GAUNTLET_NOT_GUARANTEED");

    const enemyCondition = harmfulForcedOpeningPack();
    // Keep the initialized flag mutable so only the enemy's own active-state
    // condition, rather than the older monotonic proof, can force the opening.
    enemyCondition.rooms[1]!.on_enter.push({ clear_flag: "opening_known" });
    enemyCondition.enemies[0]!.conditions = [{ has_flag: "opening_known" }];
    expect(validateRpg(enemyCondition).findings.map((finding) => finding.code)).toContain(
      "COMBAT_UNWINNABLE",
    );

    // A foreign writer means the defeat flag is not a dedicated false-while-
    // alive fact. Keep standard ATTACK conservatively possible in both bounds.
    const foreignDefeatLower = harmfulForcedOpeningPack();
    foreignDefeatLower.enemies[0]!.maneuvers![0]!.conditions = [{ not_flag: "guard_down" }];
    foreignDefeatLower.rooms[1]!.on_enter.push({ set_flag: "guard_down" });
    expect(validateRpg(foreignDefeatLower).findings.map((finding) => finding.code)).not.toContain(
      "COMBAT_UNWINNABLE",
    );

    const foreignDefeatUpper = beneficialForcedOpeningPack();
    foreignDefeatUpper.enemies[0]!.maneuvers![0]!.conditions = [{ not_flag: "guard_down" }];
    foreignDefeatUpper.rooms[1]!.on_enter.push({ set_flag: "guard_down" });
    expect(validateRpg(foreignDefeatUpper).findings.map((finding) => finding.code)).toContain(
      "COMBAT_NOT_GUARANTEED",
    );

    const duplicateDefeat = harmfulForcedOpeningPack();
    duplicateDefeat.enemies[0]!.maneuvers![0]!.conditions = [{ not_flag: "guard_down" }];
    const secondEnemy = structuredClone(duplicateDefeat.enemies[0]!);
    secondEnemy.id = "second_guard";
    secondEnemy.name = "second yard guard";
    secondEnemy.hp = 1;
    secondEnemy.attack = 0;
    secondEnemy.defense = 0;
    secondEnemy.maneuvers = undefined;
    duplicateDefeat.enemies.push(secondEnemy);
    expect(validateRpg(duplicateDefeat).findings.map((finding) => finding.code)).not.toContain(
      "COMBAT_UNWINNABLE",
    );
  });

  it("audits forced maneuver openings in the COMBAT_UNWINNABLE lower bound", () => {
    const { loaded } = setup();
    const harmful = structuredClone(loaded.compiled.pack);
    harmful.meta.vars_init = { hp: 2, attack: 10, defense: 0 };
    const harmfulEnemy = harmful.enemies[0]!;
    harmfulEnemy.hp = 10;
    harmfulEnemy.attack = 1;
    harmfulEnemy.defense = 0;
    harmfulEnemy.maneuvers![0]!.attack_bonus = -10;
    harmfulEnemy.maneuvers![0]!.defense_bonus = 0;

    // Ordinary ATTACK would one-shot safely, but opening_known is an immutable
    // initialized flag, so the maneuver is guaranteed to suppress it. Even
    // d6=6/1 leaves the enemy standing after a 6-damage opening and its
    // 2-damage reply kills the 2-HP player.
    const standardOnly = structuredClone(harmful);
    standardOnly.enemies[0]!.maneuvers = undefined;
    expect(validateRpg(standardOnly).findings.map((finding) => finding.code)).not.toContain(
      "COMBAT_UNWINNABLE",
    );
    const harmfulFinding = validateRpg(harmful).findings.find(
      (finding) => finding.code === "COMBAT_UNWINNABLE",
    );
    expect(harmfulFinding?.message).toContain('maneuver "low_feint"');

    const harmfulIndex = indexRpgPack(harmful);
    const harmfulStep = makeStep(buildRpgRules(harmfulIndex, () => fixedRolls(6, 1)));
    const harmfulResult = harmfulStep(initStateForRpgPack(harmfulIndex, 1), maneuverAction());
    expect(harmfulResult.state.endingId).toBe("defeated");
    expect(harmfulResult.state.vars.hp).toBe(0);

    // The inverse must not false-positive: ordinary ATTACK is lethal, but the
    // forced +10 opening one-shots before any reply.
    const beneficial = structuredClone(harmful);
    beneficial.meta.vars_init.attack = 0;
    beneficial.enemies[0]!.maneuvers![0]!.attack_bonus = 10;
    expect(validateRpg(beneficial).findings.map((finding) => finding.code)).not.toContain(
      "COMBAT_UNWINNABLE",
    );
    const beneficialIndex = indexRpgPack(beneficial);
    const beneficialStep = makeStep(buildRpgRules(beneficialIndex, () => fixedRolls(6, 1)));
    const beneficialResult = beneficialStep(
      initStateForRpgPack(beneficialIndex, 1),
      maneuverAction(),
    );
    expect(beneficialResult.state.endingId).toBeNull();
    expect(beneficialResult.state.flags.guard_down).toBe(true);
    expect(beneficialResult.state.vars.__enemy_hp_guard).toBe(0);
    expect(beneficialResult.state.vars.hp).toBe(2);
  });

  it("proves bounded collective guard coverage for lower and upper combat bounds", () => {
    const harmful = complementaryGuardPack();
    harmful.meta.vars_init = { hp: 2, attack: 10, defense: 0 };
    const harmfulEnemy = harmful.enemies[0]!;
    harmfulEnemy.hp = 10;
    harmfulEnemy.attack = 1;
    harmfulEnemy.defense = 0;
    for (const maneuver of harmfulEnemy.maneuvers!) {
      maneuver.attack_bonus = -10;
      maneuver.defense_bonus = 0;
    }

    // has_flag X / not_flag X covers every state. Both forced openings are
    // fatal even on lucky rolls, while otherwise-safe standard ATTACK is never
    // legal on round one and must not mask COMBAT_UNWINNABLE.
    const harmfulCodes = validateRpg(harmful).findings.map((finding) => finding.code);
    expect(harmfulCodes).toContain("COMBAT_UNWINNABLE");

    // Nested connective normalization proves the same complement through
    // all_of(any_of(X)) versus none_of(X).
    const nested = structuredClone(harmful);
    nested.enemies[0]!.maneuvers![0]!.conditions = [
      { all_of: [{ any_of: [{ has_flag: "opening_known" }] }] },
    ];
    nested.enemies[0]!.maneuvers![1]!.conditions = [{ none_of: [{ has_flag: "opening_known" }] }];
    expect(validateRpg(nested).findings.map((finding) => finding.code)).toContain(
      "COMBAT_UNWINNABLE",
    );

    // If the disjunction has a real gap, fallback ATTACK remains a candidate.
    const gapped = structuredClone(harmful);
    gapped.meta.flags_init.push("other_stance");
    gapped.enemies[0]!.maneuvers![1]!.conditions = [{ not_flag: "other_stance" }];
    expect(validateRpg(gapped).findings.map((finding) => finding.code)).not.toContain(
      "COMBAT_UNWINNABLE",
    );

    // Above the atom cap the proof deliberately gives up and retains standard
    // ATTACK, even when a larger formula happens to be exhaustive.
    const capped = structuredClone(harmful);
    const tautologies: Condition[] = Array.from({ length: 12 }, (_, index) => ({
      any_of: [{ has_flag: `coverage_noise_${index}` }, { not_flag: `coverage_noise_${index}` }],
    }));
    capped.enemies[0]!.maneuvers![0]!.conditions = [{ has_flag: "opening_known" }, ...tautologies];
    capped.enemies[0]!.maneuvers![1]!.conditions = [{ not_flag: "opening_known" }, ...tautologies];
    expect(validateRpg(capped).findings.map((finding) => finding.code)).not.toContain(
      "COMBAT_UNWINNABLE",
    );

    // Upper bound twin: standard worst-roll combat is deadly, but each forced
    // complementary opening one-shots safely. The guarantee must ignore the
    // impossible standard opening and remain green.
    const beneficial = complementaryGuardPack();
    beneficial.meta.combat_guaranteed = true;
    beneficial.meta.vars_init = { hp: 12, attack: 0, defense: 0 };
    const beneficialEnemy = beneficial.enemies[0]!;
    beneficialEnemy.hp = 10;
    beneficialEnemy.attack = 1;
    beneficialEnemy.defense = 0;
    for (const maneuver of beneficialEnemy.maneuvers!) {
      maneuver.attack_bonus = 10;
      maneuver.defense_bonus = 0;
    }
    const beneficialCodes = validateRpg(beneficial).findings.map((finding) => finding.code);
    expect(beneficialCodes).not.toContain("COMBAT_NOT_GUARANTEED");
    expect(beneficialCodes).not.toContain("COMBAT_GAUNTLET_NOT_GUARANTEED");

    const beneficialGap = structuredClone(beneficial);
    beneficialGap.meta.flags_init.push("other_stance");
    beneficialGap.enemies[0]!.maneuvers![1]!.conditions = [{ not_flag: "other_stance" }];
    expect(validateRpg(beneficialGap).findings.map((finding) => finding.code)).toContain(
      "COMBAT_NOT_GUARANTEED",
    );
  });

  it("audits the forced maneuver opening in combat_guaranteed upper bounds", () => {
    const { loaded } = setup();
    const harmful = structuredClone(loaded.compiled.pack);
    harmful.meta.combat_guaranteed = true;
    harmful.meta.vars_init = { hp: 12, attack: 7, defense: 5 };
    const enemy = harmful.enemies[0]!;
    enemy.hp = 8;
    enemy.attack = 4;
    enemy.defense = 2;
    enemy.maneuvers![0]!.attack_bonus = -6;
    enemy.maneuvers![0]!.defense_bonus = -5;

    // Plain worst-roll ATTACK is safe: 6 damage per strike means two rounds,
    // with one 5-damage reply against 12 HP. The maneuver is not: its opening
    // deals 1, takes 10, then the ordinary cleanup takes another 5 (15 total).
    const standardOnly = structuredClone(harmful);
    standardOnly.enemies[0]!.maneuvers = undefined;
    expect(validateRpg(standardOnly).findings.map((finding) => finding.code)).not.toContain(
      "COMBAT_NOT_GUARANTEED",
    );

    const harmfulFinding = validateRpg(harmful).findings.find(
      (finding) => finding.code === "COMBAT_NOT_GUARANTEED",
    );
    expect(harmfulFinding?.message).toContain('maneuver "low_feint"');
    expect(harmfulFinding?.message).toContain("up to 15 damage vs 12 reachable HP");

    const safe = structuredClone(harmful);
    safe.enemies[0]!.maneuvers![0]!.attack_bonus = 2;
    safe.enemies[0]!.maneuvers![0]!.defense_bonus = 1;
    const safeCodes = validateRpg(safe).findings.map((finding) => finding.code);
    expect(safeCodes).not.toContain("COMBAT_NOT_GUARANTEED");
    expect(safeCodes).not.toContain("COMBAT_GAUNTLET_NOT_GUARANTEED");
  });

  it("includes forced follow-through arithmetic in lower and upper combat bounds", () => {
    const { loaded } = setup();
    const lower = structuredClone(loaded.compiled.pack);
    lower.meta.vars_init = { hp: 5, attack: 10, defense: 10 };
    const lowerEnemy = lower.enemies[0]!;
    lowerEnemy.hp = 30;
    lowerEnemy.attack = 10;
    lowerEnemy.defense = 0;
    const lowerRoot = lowerEnemy.maneuvers![0]!;
    lowerRoot.attack_bonus = 0;
    lowerRoot.defense_bonus = 10;
    lowerEnemy.maneuvers!.push({
      ...structuredClone(lowerRoot),
      id: "finish_low",
      command: "finish through the low line",
      after: lowerRoot.id,
      conditions: [],
      result_flag: "finish_low_used",
      attack_bonus: -10,
      defense_bonus: -10,
    });
    const lowerFinding = validateRpg(lower).findings.find(
      (finding) => finding.code === "COMBAT_UNWINNABLE",
    );
    expect(lowerFinding?.message).toContain('"low_feint" -> "finish_low"');

    const upper = structuredClone(lower);
    upper.meta.combat_guaranteed = true;
    upper.meta.vars_init.hp = 12;
    upper.enemies[0]!.hp = 20;
    const upperFinding = validateRpg(upper).findings.find(
      (finding) => finding.code === "COMBAT_NOT_GUARANTEED",
    );
    expect(upperFinding?.message).toContain('"low_feint" -> "finish_low"');

    const impossibleChild = structuredClone(upper);
    impossibleChild.enemies[0]!.maneuvers![1]!.conditions = [{ not_flag: "opening_known" }];
    const impossibleCodes = validateRpg(impossibleChild).findings.map((finding) => finding.code);
    expect(impossibleCodes).not.toContain("COMBAT_NOT_GUARANTEED");
    expect(impossibleCodes).not.toContain("COMBAT_GAUNTLET_NOT_GUARANTEED");
  });

  it("fails closed when a shallow sequence exceeds its route-analysis cap", () => {
    const { loaded } = setup();
    const capped = structuredClone(loaded.compiled.pack);
    const root = capped.enemies[0]!.maneuvers![0]!;
    for (let index = 0; index < 65; index++) {
      capped.enemies[0]!.maneuvers!.push({
        ...structuredClone(root),
        id: `finish_${index}`,
        command: `finish through line ${index}`,
        after: root.id,
        conditions: [],
        result_flag: `finish_${index}_used`,
        attack_bonus: 1,
        defense_bonus: 0,
      });
    }
    expect(validateRpg(capped).findings.map((finding) => finding.code)).toContain(
      "MANEUVER_SEQUENCE_ANALYSIS_LIMIT",
    );

    const atomCapped = sequencedPack();
    atomCapped.enemies[0]!.maneuvers![0]!.conditions = Array.from(
      { length: 13 },
      (_, index): Condition => ({
        any_of: [{ has_flag: `sequence_noise_${index}` }, { not_flag: `sequence_noise_${index}` }],
      }),
    );
    expect(validateRpg(atomCapped).findings.map((finding) => finding.code)).toContain(
      "MANEUVER_SEQUENCE_ANALYSIS_LIMIT",
    );

    const noEncounter = sequencedPack();
    noEncounter.enemies[0]!.conditions = [{ not_visited: "yard" }];
    expect(validateRpg(noEncounter).findings.map((finding) => finding.code)).toContain(
      "MANEUVER_SEQUENCE_ENCOUNTER_UNPROVEN",
    );
  });
});
