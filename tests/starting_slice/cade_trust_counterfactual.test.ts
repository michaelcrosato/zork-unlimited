/**
 * SS-F08 / fourth-family quest-local proof. Fortify-and-outlast is an explicit
 * noncombat conduct fork: either accept Cade's household terms and retain his
 * failed-seal help, or invoke Albany authority and spend public relief seals
 * without that help. Both stances hard-commit before the first repair, carry
 * distinct finite resources through two spatial sealing beats, fail forward
 * without an identical retry, and preserve their conduct and cost at dawn.
 */
import { describe, expect, it } from "vitest";

import { makeStep } from "../../src/core/engine.js";
import { hashState } from "../../src/core/hash.js";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";
import { compactRpgObservation } from "../../src/mcp/compact_rpg_observation.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { enemyHpVar } from "../../src/rpg/schema.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { applyOpeningAllyOption } from "../../src/world/opening_ally.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("Wolf-Winter must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);

const world = loadOverworldManifest(process.cwd());
const ally =
  world.opening_ally ??
  (() => {
    throw new Error("Albany requires an ally scene");
  })();
const registration =
  world.opening_registration ??
  (() => {
    throw new Error("Albany requires registration");
  })();
const wolfQuest =
  world.quests.find((quest) => quest.id === "wolf_winter") ??
  (() => {
    throw new Error("Albany requires Wolf-Winter");
  })();
const imports =
  wolfQuest.campaign_imports ??
  (() => {
    throw new Error("Wolf-Winter requires imports");
  })();

type Roll = "best" | "worst";
type Stance = "cade" | "authority";

const STANCES = {
  cade: {
    choice: "ask_commit_cade_terms",
    flag: "fortify_cade_terms_accepted",
    otherFlag: "fortify_albany_authority_invoked",
    item: "cade_household_shutters",
    take: "take_cade_household_shutters",
    otherItem: "albany_relief_seals",
    outer: "use_cade_household_shutters_on_fortify_outer_seal",
    recovery: "use_cade_failed_seal_help",
    recoveryFlag: "fortify_cade_recovery_helped",
    otherRecovery: "use_albany_relief_seals_on_authority_emergency_bind",
    threshold: "use_cade_household_shutters_on_fortify_threshold_seal",
    ending: "ending_fortified_cade_terms",
    title: "Dawn Behind Cade's Shutters",
  },
  authority: {
    choice: "ask_commit_albany_authority",
    flag: "fortify_albany_authority_invoked",
    otherFlag: "fortify_cade_terms_accepted",
    item: "albany_relief_seals",
    take: "take_albany_relief_seals",
    otherItem: "cade_household_shutters",
    outer: "use_albany_relief_seals_on_fortify_outer_seal",
    recovery: "use_albany_relief_seals_on_authority_emergency_bind",
    recoveryFlag: "fortify_authority_emergency_seal_spent",
    otherRecovery: "use_cade_failed_seal_help",
    threshold: "use_albany_relief_seals_on_fortify_threshold_seal",
    ending: "ending_fortified_albany_authority",
    title: "Dawn Under Albany Seal",
  },
} as const;

function fixedRng(face: Roll): Rng {
  return {
    next: () => (face === "best" ? 0.999999 : 0),
    int: (min, max) => (face === "best" ? max : min),
  };
}

function actionIds(state: GameState): string[] {
  return enumerateRpgActions(index, state).map((option) => option.id);
}

function act(state: GameState, actionId: string, roll: Roll = "best"): GameState {
  const options = enumerateRpgActions(index, state);
  const option = options.find((candidate) => candidate.id === actionId);
  expect(
    option,
    `${actionId} must be legal in ${state.current}; legal: ${options
      .map((candidate) => candidate.id)
      .join(", ")}`,
  ).toBeDefined();
  if (!option) throw new Error(`Missing action ${actionId}.`);
  const result = makeStep(buildRpgRules(index, () => fixedRng(roll)))(state, option.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  return result.state;
}

function optionState(optionId: string, seed = 1108): GameState {
  const roadWarden = registration.profiles.find((profile) => profile.id === "albany:road_warden");
  if (!roadWarden) throw new Error("Road-Warden registration must exist");
  const character = applyOpeningAllyOption({
    scene: ally,
    character: roadWarden.character,
    optionId,
  }).characterAfter;
  return initStateForRpgPack(index, seed, { character, imports });
}

function fresh(withJune = false): GameState {
  return withJune
    ? optionState("albany:ally_june_cattle_first")
    : optionState("albany:ally_travel_solo", 1109);
}

function expectFortifyWithholdsCombat(state: GameState): void {
  const observation = buildRpgObservation(index, state);
  const ids = observation.available_actions.map((option) => option.id);
  expect(state.flags).toMatchObject({
    strategy_fortify_committed: true,
    fortify_combat_withheld: true,
  });
  expect(observation.enemies_present).toEqual([]);
  expect(ids.filter((id) => id.startsWith("attack_") || id.startsWith("maneuver_"))).toEqual([]);
  expect(ids).not.toContain("ask_lure");
  expect(ids).not.toContain("ask_drive");
  expect(ids.some((id) => /abandon_fortify|commit_(?:lure|drive)/.test(id))).toBe(false);
  expect(ids).not.toContain("go_south");
  expect(ids).not.toContain("go_west");
  expect(ids).not.toContain("read_day_book");
  expect(ids).not.toContain("take_byre_jerkin");
  expect(ids).not.toContain("use_byre_jerkin");
  expect(ids.some((id) => id.includes("winter_feed_sack") || id.includes("drive_"))).toBe(false);
  const opposingActions = state.flags.fortify_cade_terms_accepted
    ? [
        "take_albany_relief_seals",
        "use_albany_relief_seals_on_fortify_outer_seal",
        "use_albany_relief_seals_on_authority_emergency_bind",
        "use_albany_relief_seals_on_fortify_threshold_seal",
      ]
    : [
        "take_cade_household_shutters",
        "use_cade_household_shutters_on_fortify_outer_seal",
        "use_cade_failed_seal_help",
        "use_cade_household_shutters_on_fortify_threshold_seal",
      ];
  for (const opposingAction of opposingActions) expect(ids).not.toContain(opposingAction);
  for (const enemy of pack.enemies) expect(state.vars[enemyHpVar(enemy.id)]).toBeUndefined();
}

function commitFortify(stance: Stance, withJune = false): GameState {
  const contract = STANCES[stance];
  let state = fresh(withJune);
  state = act(state, "go_north");
  state = act(state, "talk_houndsman");
  state = act(state, "ask_fortify");

  expect(state.flags.strategy_fortify_committed).not.toBe(true);
  expect(actionIds(state)).toEqual(
    expect.arrayContaining(["ask_commit_cade_terms", "ask_commit_albany_authority", "ask_leave"]),
  );
  expect(buildRpgObservation(index, state).dialogue?.npc_text).toMatch(
    /household terms[^]*(?:Albany|authority)[^]*(?:dawn|outlast)/i,
  );

  state = act(state, contract.choice);
  expect(state.flags[contract.flag]).toBe(true);
  expect(state.flags[contract.otherFlag]).not.toBe(true);
  expect(state.inventory).not.toContain(contract.item);
  expect(state.inventory).not.toContain(contract.otherItem);
  expectFortifyWithholdsCombat(state);

  state = act(state, "ask_leave");
  expect(actionIds(state)).toContain(contract.take);
  state = act(state, contract.take);
  expect(state.inventory).toContain(contract.item);
  expect(actionIds(state)).not.toContain("go_south");
  expect(actionIds(state)).not.toContain("go_west");
  expect(actionIds(state)).not.toContain("read_day_book");
  expect(actionIds(state)).not.toContain("use_byre_jerkin");
  expectFortifyWithholdsCombat(state);
  return state;
}

function finishFortify(args: { stance: Stance; roll: Roll; withJune?: boolean }): GameState {
  const contract = STANCES[args.stance];
  let state = commitFortify(args.stance, args.withJune ?? false);
  state = act(state, "go_north");
  expectFortifyWithholdsCombat(state);

  state = act(state, contract.outer, args.roll);
  expect(state.flags.fortify_outer_seal_attempted).toBe(true);
  expect(actionIds(state)).not.toContain(contract.outer);
  expectFortifyWithholdsCombat(state);

  if (args.roll === "worst") {
    expect(state.flags.fortify_outer_seal_failed).toBe(true);
    expect(state.flags.fortify_outer_sealed).not.toBe(true);
    expect(state.vars.fortification_pressure).toBe(2);
    expect(actionIds(state)).toContain(contract.recovery);
    expect(actionIds(state)).not.toContain(contract.otherRecovery);
    state = act(state, contract.recovery);
    expect(state.flags[contract.recoveryFlag]).toBe(true);
  } else {
    expect(state.flags.fortify_outer_seal_failed).not.toBe(true);
    expect(state.vars.fortification_pressure).toBe(1);
    expect(actionIds(state)).not.toContain(contract.recovery);
  }

  expect(state.flags.fortify_outer_sealed).toBe(true);
  state = act(state, "go_north");
  expectFortifyWithholdsCombat(state);
  state = act(state, contract.threshold);
  expect(state.flags.fortify_threshold_sealed).toBe(true);
  expect(state.inventory).not.toContain(contract.item);
  expect(state.vars.fortification_pressure).toBe(args.roll === "best" ? 2 : 3);
  state = act(state, "go_north");
  expectFortifyWithholdsCombat(state);

  if (args.withJune) {
    expect(actionIds(state)).toContain("talk_june_pike_fortify");
    expect(actionIds(state)).not.toContain("use_fortify_dawn_watch");
    const before = state.vars.fortification_pressure;
    state = act(state, "talk_june_pike_fortify");
    expect(state.flags.june_fortify_cattle_line_taken).toBe(true);
    expect(state.flags.june_blood_condition_broken).not.toBe(true);
    expect(state.vars.fortification_pressure).toBe(before);
    state = act(state, "ask_acknowledge");
  } else {
    expect(actionIds(state)).not.toContain("talk_june_pike_fortify");
  }

  state = act(state, "use_fortify_dawn_watch");
  expect(state).toMatchObject({
    ended: true,
    endingId: contract.ending,
    flags: {
      fortify_dawn_held: true,
      fortify_pack_outlasted: true,
    },
    vars: { fortification_pressure: 6, score: 35 },
  });
  expect(state.flags.yearling_down).not.toBe(true);
  expect(state.flags.flank_wolf_down).not.toBe(true);
  expect(state.flags.leader_down).not.toBe(true);
  expect(buildRpgObservation(index, state).ending).toMatchObject({ title: contract.title });
  return state;
}

describe("SS-F08 — Cade terms versus Albany authority under fortification", () => {
  it("forks one identical pre-choice state into different resources, recoveries, and endings", () => {
    let boundary = fresh();
    boundary = act(boundary, "go_north");
    boundary = act(boundary, "talk_houndsman");
    boundary = act(boundary, "ask_fortify");
    const boundaryHash = hashState(boundary);

    let cade = act(structuredClone(boundary), "ask_commit_cade_terms");
    let authority = act(structuredClone(boundary), "ask_commit_albany_authority");
    expect(hashState(boundary)).toBe(boundaryHash);
    cade = act(cade, "ask_leave");
    authority = act(authority, "ask_leave");
    cade = act(cade, "take_cade_household_shutters");
    authority = act(authority, "take_albany_relief_seals");
    expect(cade.inventory).toContain("cade_household_shutters");
    expect(cade.inventory).not.toContain("albany_relief_seals");
    expect(authority.inventory).toContain("albany_relief_seals");
    expect(authority.inventory).not.toContain("cade_household_shutters");

    const cadeWorst = finishFortify({ stance: "cade", roll: "worst" });
    const authorityWorst = finishFortify({ stance: "authority", roll: "worst" });
    expect(cadeWorst.flags).toMatchObject({ fortify_cade_recovery_helped: true });
    expect(cadeWorst.flags.fortify_authority_emergency_seal_spent).not.toBe(true);
    expect(authorityWorst.flags).toMatchObject({
      fortify_authority_emergency_seal_spent: true,
    });
    expect(authorityWorst.flags.fortify_cade_recovery_helped).not.toBe(true);
    expect(cadeWorst.endingId).toBe("ending_fortified_cade_terms");
    expect(authorityWorst.endingId).toBe("ending_fortified_albany_authority");
  });

  it("requires a fresh explanation and makes the two disclosed stances mutually exclusive", () => {
    let stale = fresh();
    stale = act(stale, "go_north");
    stale = act(stale, "talk_houndsman");
    stale = act(stale, "ask_fortify");
    expect(actionIds(stale)).toContain("ask_commit_cade_terms");
    stale = act(stale, "go_north");
    stale = act(stale, "go_south");
    expect(actionIds(stale)).not.toContain("ask_commit_cade_terms");
    expect(actionIds(stale)).not.toContain("ask_commit_albany_authority");

    for (const stance of ["cade", "authority"] as const) {
      const state = commitFortify(stance);
      const contract = STANCES[stance];
      expect(state.flags[contract.flag]).toBe(true);
      expect(state.flags[contract.otherFlag]).not.toBe(true);
      expect(state.inventory).toContain(contract.item);
      expect(state.inventory).not.toContain(contract.otherItem);
      expect(actionIds(state)).not.toContain("ask_fortify");
    }
  });

  it.each([
    ["cade", "best"],
    ["cade", "worst"],
    ["authority", "best"],
    ["authority", "worst"],
  ] as const)(
    "finishes the %s stance under %s rolls without enemies or a retry",
    (stance, roll) => {
      const state = finishFortify({ stance, roll });
      const contract = STANCES[stance];
      expect(state.endingId).toBe(contract.ending);
      expect(state.flags[contract.flag]).toBe(true);
      expect(state.flags[contract.otherFlag]).not.toBe(true);
      if (roll === "worst") {
        expect(state.flags.fortify_outer_seal_failed).toBe(true);
        expect(state.flags[contract.recoveryFlag]).toBe(true);
      } else {
        expect(state.flags.fortify_outer_seal_failed).not.toBe(true);
        expect(state.flags[contract.recoveryFlag]).not.toBe(true);
      }
      expect(state.journal.join("\n")).toMatch(
        roll === "worst" ? /fail|split|miss|give|emergency/i : /seal|hold/i,
      );
    },
  );

  it("preserves failure-forward history without multiplying the two stance endings", () => {
    for (const stance of ["cade", "authority"] as const) {
      const clean = finishFortify({ stance, roll: "best" });
      const recovered = finishFortify({ stance, roll: "worst" });
      expect(clean.endingId).toBe(recovered.endingId);
      expect(clean.vars.score).toBe(recovered.vars.score);
      expect(clean.flags.fortify_outer_seal_failed).not.toBe(true);
      expect(recovered.flags.fortify_outer_seal_failed).toBe(true);
      expect(recovered.flags[STANCES[stance].recoveryFlag]).toBe(true);
      expect(buildRpgObservation(index, clean).ending?.text).toBe(
        buildRpgObservation(index, recovered).ending?.text,
      );
      expect(clean.journal).not.toEqual(recovered.journal);
    }
    expect(
      pack.endings.map((ending) => ending.id).filter((id) => id.startsWith("ending_fortified")),
    ).toEqual(["ending_fortified_cade_terms", "ending_fortified_albany_authority"]);
  });

  it("lets June take the cattle line independently while the solo route remains viable", () => {
    const withJune = finishFortify({ stance: "authority", roll: "worst", withJune: true });
    const solo = finishFortify({ stance: "authority", roll: "worst" });
    expect(withJune.flags.june_fortify_cattle_line_taken).toBe(true);
    expect(solo.flags.june_fortify_cattle_line_taken).not.toBe(true);
    expect(withJune.endingId).toBe(solo.endingId);
    expect(withJune.vars.fortification_pressure).toBe(6);
    expect(solo.vars.fortification_pressure).toBe(6);
  });

  it("projects the siege consistently and preserves ordinary combat only before commitment", () => {
    let state = commitFortify("cade");
    state = act(state, "go_north");
    state = act(state, STANCES.cade.outer, "best");
    state = act(state, "go_north");
    state = act(state, STANCES.cade.threshold);
    const full = buildRpgObservation(index, state);
    const siege = full.pressure_tracks?.find((track) => track.id === "winter_siege");
    expect(siege).toMatchObject({
      value: 2,
      band: {
        min: 2,
        label: "Hammering",
        description:
          "The pack is hammering at two fixed pressure steps. The current seal state makes the disclosed first-seat recovery, threshold seal, or dawn watch the next legal beat.",
      },
      next: { min: 3, label: "Strained" },
    });
    expect(compactRpgObservation(full, []).pressure).toContainEqual([
      "winter_siege",
      "Winter siege",
      2,
      2,
      "Hammering",
      3,
      "Strained",
    ]);

    let declined = fresh();
    declined = act(declined, "go_north");
    declined = act(declined, "talk_houndsman");
    declined = act(declined, "ask_fortify");
    declined = act(declined, "ask_leave");
    declined = act(declined, "go_north");
    expect(buildRpgObservation(index, declined).enemies_present.map((enemy) => enemy.id)).toEqual([
      "yearling_wolf",
    ]);
    expect(actionIds(declined)).toContain("maneuver_yearling_wolf_set_spear");
  });
});
