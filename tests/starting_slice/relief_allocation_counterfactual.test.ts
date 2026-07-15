/**
 * SS-F06 counterfactual proof. Albany's single relief allocation has three
 * mutually exclusive consumers: Cade's pre-feed changes one clean ridge lure,
 * the mobile crew can stabilize only an already recovered fortification seam,
 * and the resident/mobile return services win in different resource states.
 */
import { describe, expect, it } from "vitest";

import { makeStep } from "../../src/core/engine.js";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { buildCampaignCharacterState } from "../../src/world/campaign_character_state.js";
import {
  planOverworldSessionTownRest,
  planOverworldSessionTownResupply,
} from "../../src/world/session_service_lifecycle.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const WORLD = loadOverworldManifest(process.cwd());
const WOLF =
  WORLD.quests.find((quest) => quest.id === "wolf_winter") ??
  (() => {
    throw new Error("The Albany starting slice requires Wolf-Winter");
  })();
const IMPORTS =
  WOLF.campaign_imports ??
  (() => {
    throw new Error("Wolf-Winter requires campaign imports");
  })();
const ALBANY =
  WORLD.nodes.find((node) => node.id === "albany_city") ??
  (() => {
    throw new Error("The starting slice requires Albany");
  })();

const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("Wolf-Winter must compile");
const index = indexRpgPack(loaded.compiled.pack);

type Roll = "best" | "worst";
type Stance = "cade" | "authority";
type Allocation = "cade" | "resident" | "mobile";

const ALLOCATION_KNOWLEDGE = {
  cade: "albany:knowledge_relief_cade_fodder",
  resident: "albany:knowledge_relief_resident_shelter",
  mobile: "albany:knowledge_relief_mobile_reserve",
} as const;

const STANCES = {
  cade: {
    choice: "ask_accept_terms",
    stanceFlag: "fortify_cade_terms_accepted",
    oppositeStanceFlag: "fortify_albany_authority_invoked",
    take: "take_cade_household_shutters",
    outer: "use_cade_household_shutters_on_fortify_outer_seal",
    recovery: "use_cade_failed_seal_help",
    recoveryFlag: "fortify_cade_recovery_helped",
    oppositeRecoveryFlag: "fortify_authority_emergency_seal_spent",
    threshold: "use_cade_household_shutters_on_fortify_threshold_seal",
    ending: "ending_fortified_cade_terms",
  },
  authority: {
    choice: "ask_invoke_authority",
    stanceFlag: "fortify_albany_authority_invoked",
    oppositeStanceFlag: "fortify_cade_terms_accepted",
    take: "take_albany_relief_seals",
    outer: "use_albany_relief_seals_on_fortify_outer_seal",
    recovery: "use_albany_relief_seals_on_authority_emergency_bind",
    recoveryFlag: "fortify_authority_emergency_seal_spent",
    oppositeRecoveryFlag: "fortify_cade_recovery_helped",
    threshold: "use_albany_relief_seals_on_fortify_threshold_seal",
    ending: "ending_fortified_albany_authority",
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

function act(state: GameState, actionId: string, roll?: Roll): GameState {
  const options = enumerateRpgActions(index, state);
  const option = options.find((candidate) => candidate.id === actionId);
  expect(
    option,
    `${actionId} must be legal in ${state.current}; legal: ${options
      .map((candidate) => candidate.id)
      .join(", ")}`,
  ).toBeDefined();
  if (!option) throw new Error(`Missing action ${actionId}`);
  const rules = buildRpgRules(index, roll ? () => fixedRng(roll) : undefined);
  const result = makeStep(rules)(state, option.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  return result.state;
}

function allocatedState(allocation: Allocation, seed: number, ridge = false): GameState {
  const character = buildCampaignCharacterState({
    background: "albany:ledger_advocate",
    knowledge: [
      ALLOCATION_KNOWLEDGE[allocation],
      ...(ridge ? ["albany:knowledge_wolf_exposed_ridge"] : []),
    ],
  });
  return initStateForRpgPack(index, seed, { character, imports: IMPORTS });
}

function commitRidgeLure(allocation: Allocation, seed: number): GameState {
  let state = allocatedState(allocation, seed, true);
  state = act(state, "use_exposed_ridge_last_mile");
  state = act(state, "talk_houndsman");
  state = act(state, "ask_lure");
  state = act(state, "ask_commit_lure");
  state = act(state, "ask_leave");
  state = act(state, "go_west");
  state = act(state, "take_winter_feed_sack");
  state = act(state, "go_east");
  return act(state, "go_north");
}

function firstRidgeCast(allocation: Allocation, seed: number): GameState {
  return act(commitRidgeLure(allocation, seed), "use_winter_feed_sack_on_downwind_feed_line");
}

function finishCleanLure(state: GameState): GameState {
  state = act(state, "go_south");
  state = act(state, "go_west");
  state = act(state, "go_up");
  state = act(state, "use_winter_feed_sack_on_loft_hatch");
  state = act(state, "go_east");
  state = act(state, "go_north");
  state = act(state, "use_winter_feed_sack_on_outer_scent_gate");
  return act(state, "go_north");
}

function recoveredFortify(stance: Stance): GameState {
  const contract = STANCES[stance];
  let state = allocatedState("mobile", 1606);
  state = act(state, "go_north");
  state = act(state, "talk_houndsman");
  state = act(state, "ask_fortify");
  state = act(state, contract.choice);
  state = act(state, "ask_leave");
  state = act(state, contract.take);
  state = act(state, "go_north");
  state = act(state, contract.outer, "worst");

  expect(state.vars.fortification_pressure).toBe(2);
  expect(state.flags).toMatchObject({
    fortify_outer_seal_failed: true,
    [contract.stanceFlag]: true,
  });
  expect(state.flags[contract.oppositeStanceFlag]).not.toBe(true);
  expect(actionIds(state)).toContain(contract.recovery);
  expect(actionIds(state)).not.toContain("use_mobile_relief_failure_crew");

  state = act(state, contract.recovery);
  expect(state.flags).toMatchObject({
    fortify_outer_seal_failed: true,
    fortify_outer_sealed: true,
    [contract.stanceFlag]: true,
    [contract.recoveryFlag]: true,
  });
  expect(state.flags[contract.oppositeStanceFlag]).not.toBe(true);
  expect(state.flags[contract.oppositeRecoveryFlag]).not.toBe(true);
  expect(state.vars.fortification_pressure).toBe(2);
  expect(actionIds(state)).toContain("use_mobile_relief_failure_crew");
  return state;
}

function finishStabilizedFortify(stance: Stance): GameState {
  const contract = STANCES[stance];
  let state = recoveredFortify(stance);
  state = act(state, "use_mobile_relief_failure_crew");

  expect(state.vars.fortification_pressure).toBe(1);
  expect(state.flags).toMatchObject({
    fortify_outer_seal_failed: true,
    fortify_outer_sealed: true,
    fortify_mobile_crew_stabilized: true,
    [contract.stanceFlag]: true,
    [contract.recoveryFlag]: true,
  });
  expect(state.flags[contract.oppositeStanceFlag]).not.toBe(true);
  expect(state.flags[contract.oppositeRecoveryFlag]).not.toBe(true);
  expect(actionIds(state)).not.toContain("use_mobile_relief_failure_crew");

  state = act(state, "go_north");
  state = act(state, contract.threshold);
  expect(state.vars.fortification_pressure).toBe(2);
  state = act(state, "go_north");
  state = act(state, "use_fortify_dawn_watch");

  expect(state).toMatchObject({
    ended: true,
    endingId: contract.ending,
    flags: {
      fortify_outer_seal_failed: true,
      fortify_mobile_crew_stabilized: true,
      [contract.stanceFlag]: true,
      [contract.recoveryFlag]: true,
    },
    vars: { fortification_pressure: 6, score: 35 },
  });
  expect(state.flags[contract.oppositeStanceFlag]).not.toBe(true);
  expect(state.flags[contract.oppositeRecoveryFlag]).not.toBe(true);
  expect(state.journal.join("\n")).toMatch(/mobile-stabilized seals hold through dawn/i);
  return state;
}

function serviceState(choiceId: string, areaId: string, supplies: number, fatigue: number) {
  return {
    currentTown: ALBANY,
    currentAreaId: areaId,
    campaignServiceRules: WORLD.campaign_service_rules ?? [],
    campaignWorldFactIds: ["fact:wolf_winter_byre_held"],
    campaignStoryChoiceRefs: [
      {
        story_choice_id: "albany:wolf_relief_allocation",
        choice_id: choiceId,
      },
    ],
    consumedCampaignServiceRuleIds: [] as string[],
    supplies,
    fatigue,
  };
}

describe("SS-F06 — finite Albany relief allocation counterfactual", () => {
  it("lets Cade's pre-feed flip the seed-26 clean ridge ending while preserving full failure pressure", () => {
    const cade = finishCleanLure(firstRidgeCast("cade", 26));
    const resident = finishCleanLure(firstRidgeCast("resident", 26));

    expect(cade).toMatchObject({
      ended: true,
      endingId: "ending_pack_diverted",
      vars: { cattle_alarm: 3 },
    });
    expect(resident).toMatchObject({
      ended: true,
      endingId: "ending_pack_diverted_cattle_scattered",
      vars: { cattle_alarm: 4 },
    });
    expect(buildRpgObservation(index, cade).ending?.text).toMatch(/cattle whole/i);
    expect(buildRpgObservation(index, resident).ending?.text).toMatch(/two animals are missing/i);

    const failed = act(
      commitRidgeLure("cade", 26),
      "use_winter_feed_sack_on_downwind_feed_line",
      "worst",
    );
    expect(failed.flags).toMatchObject({ lure_trail_fouled: true });
    expect(failed.flags.yearling_redirected).not.toBe(true);
    expect(failed.vars.cattle_alarm).toBe(3); // ridge arrival 1 + full failed-cast 2
    expect(failed.journal.join("\n")).toMatch(/no retry; alarm \+2/i);
  });

  it.each(["cade", "authority"] as const)(
    "stabilizes only the recovered %s fortification without rewriting its stance",
    (stance) => {
      const state = finishStabilizedFortify(stance);
      expect(buildRpgObservation(index, state).ending?.title).toBe(
        stance === "cade" ? "Dawn Behind Cade's Shutters" : "Dawn Under Albany Seal",
      );
    },
  );

  it("makes resident rest and mobile resupply win in different truthful return states", () => {
    const residentChoice = "albany:relief_resident_shelter";
    const mobileChoice = "albany:relief_mobile_reserve";

    const residentRest = planOverworldSessionTownRest(
      serviceState(residentChoice, "albany_city__market", 6, 75),
    );
    const mobileRest = planOverworldSessionTownRest(
      serviceState(mobileChoice, "albany_city__market", 6, 75),
    );
    expect(residentRest).toMatchObject({
      changed: true,
      minutes: 15,
      fatigueBefore: 75,
      fatigueAfter: 0,
      entryDraft: { serviceRuleId: "albany:resident_shelter_return_rest" },
    });
    expect(mobileRest).toMatchObject({
      changed: true,
      minutes: 240,
      fatigueBefore: 75,
      fatigueAfter: 0,
    });
    expect(residentRest.minutes).toBeLessThan(mobileRest.minutes);

    const residentResupply = planOverworldSessionTownResupply(
      serviceState(residentChoice, "albany_city__campus", 1, 0),
    );
    const mobileResupply = planOverworldSessionTownResupply(
      serviceState(mobileChoice, "albany_city__campus", 1, 0),
    );
    expect(residentResupply).toMatchObject({
      changed: true,
      minutes: 45,
      suppliesBefore: 1,
      suppliesAfter: 8,
    });
    expect(mobileResupply).toMatchObject({
      changed: true,
      minutes: 15,
      suppliesBefore: 1,
      suppliesAfter: 8,
      entryDraft: { serviceRuleId: "albany:mobile_reserve_return_resupply" },
    });
    expect(mobileResupply.minutes).toBeLessThan(residentResupply.minutes);
  });
});
