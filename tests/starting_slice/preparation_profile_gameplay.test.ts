/**
 * SS-F05 pack-level counterfactual proof. Albany allocates exactly one persistent
 * preparation knowledge, Wolf-Winter imports the matching background skill, and
 * each profile changes one bounded pressure decision without adding an ending.
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
import { applyOpeningPreparationProfile } from "../../src/world/opening_preparation.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const world = loadOverworldManifest(process.cwd());
const preparation =
  world.opening_preparation ??
  (() => {
    throw new Error("the Albany starting slice requires opening preparation");
  })();
const registration =
  world.opening_registration ??
  (() => {
    throw new Error("the Albany starting slice requires opening registration");
  })();
const wolfQuest =
  world.quests.find((quest) => quest.id === "wolf_winter") ??
  (() => {
    throw new Error("the Albany starting slice requires Wolf-Winter");
  })();
const imports =
  wolfQuest.campaign_imports ??
  (() => {
    throw new Error("Wolf-Winter requires campaign imports");
  })();
const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("Wolf-Winter must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);

const WORKS = "albany:prep_works_fortification";
const DROVER = "albany:prep_drover_route";
const RELIEF = "albany:prep_relief_protocol";
const IRONHANDS = "albany:ironhands_repairer";
const COURIER = "albany:unaffiliated_courier";
const LEDGER = "albany:ledger_advocate";
const WARDEN = "albany:road_warden";

function fixedRolls(...values: number[]): Rng {
  let cursor = 0;
  return {
    next: () => 0.5,
    int: (min, max) => {
      const value = values[cursor++] ?? max;
      expect(value).toBeGreaterThanOrEqual(min);
      expect(value).toBeLessThanOrEqual(max);
      return value;
    },
  };
}

function actionIds(state: GameState): string[] {
  return enumerateRpgActions(index, state).map((option) => option.id);
}

function act(state: GameState, actionId: string, ...rolls: number[]): GameState {
  const options = enumerateRpgActions(index, state);
  const option = options.find((candidate) => candidate.id === actionId);
  expect(
    option,
    `${actionId} must be legal in ${state.current}; legal: ${options
      .map((candidate) => candidate.id)
      .join(", ")}`,
  ).toBeDefined();
  if (!option) throw new Error(`Missing action ${actionId}.`);
  const result = makeStep(buildRpgRules(index, () => fixedRolls(...rolls)))(state, option.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  return result.state;
}

function profileState(profileId: string, registrationId: string): GameState {
  const profile = registration.profiles.find((candidate) => candidate.id === registrationId);
  if (!profile) throw new Error(`Missing registration profile ${registrationId}.`);
  const prepared = applyOpeningPreparationProfile({
    scene: preparation,
    character: profile.character,
    profileId,
  }).characterAfter;
  return initStateForRpgPack(index, 505, { character: prepared, imports });
}

function reachPaling(state: GameState): GameState {
  state = act(state, "go_north");
  return act(state, "go_north");
}

function foulFirstCast(state: GameState): GameState {
  state = act(state, "go_north");
  state = act(state, "talk_houndsman");
  state = act(state, "ask_lure");
  state = act(state, "ask_commit_lure");
  state = act(state, "ask_leave");
  state = act(state, "go_west");
  state = act(state, "take_winter_feed_sack");
  state = act(state, "go_east");
  state = act(state, "go_north");
  state = act(state, "use_winter_feed_sack_on_downwind_feed_line", 1);
  expect(state.flags.lure_trail_fouled).toBe(true);
  expect(state.vars.cattle_alarm).toBe(2);
  return state;
}

function recoverWithSplitRail(state: GameState): GameState {
  state = act(state, "use_paling_rail", 1);
  expect(state.flags.rail_split).toBe(true);
  state = act(state, "use_paling_rail");
  state = act(state, "use_split_rail_guard_on_downwind_feed_line");
  expect(state.flags.yearling_redirected_with_split_guard).toBe(true);
  return state;
}

function finishLure(state: GameState): GameState {
  if (state.current === "paling_gap") state = act(state, "go_south");
  state = act(state, "go_west");
  state = act(state, "go_up");
  state = act(state, "use_winter_feed_sack_on_loft_hatch");
  state = act(state, "go_east");
  state = act(state, "go_north");
  state = act(state, "use_winter_feed_sack_on_outer_scent_gate");
  return act(state, "go_north");
}

describe("SS-F05 — Albany preparation profile gameplay", () => {
  it("authors three affordable exclusive plans with distinct imports, providers, and return services", () => {
    expect(preparation).toMatchObject({
      id: "albany:wolf_preparation",
      after_lead_source: "albany:wolf_source_priority",
      target_quest: "wolf_winter",
      profiles: [
        { id: WORKS, provider_npc_id: "albany:reese_pryce" },
        { id: DROVER, provider_npc_id: "albany:emery_sloane" },
        { id: RELIEF, provider_npc_id: "albany:jamie_tanner" },
      ],
    });
    expect(preparation.profiles.every((profile) => profile.terms.money <= 4)).toBe(true);
    expect(
      preparation.profiles.map((profile) =>
        profile.effects.find((effect) => effect.type === "learn_knowledge"),
      ),
    ).toEqual([
      {
        type: "learn_knowledge",
        knowledge_id: "albany:knowledge_wolf_works_fortification",
      },
      { type: "learn_knowledge", knowledge_id: "albany:knowledge_wolf_drover_route" },
      { type: "learn_knowledge", knowledge_id: "albany:knowledge_wolf_relief_protocol" },
    ]);

    const serviceRules = (world.campaign_service_rules ?? []).filter((rule) =>
      rule.requires_all_story_choices?.some((choice) => choice.story_choice_id === preparation.id),
    );
    expect(
      serviceRules.map((rule) => [
        rule.id,
        rule.requires_all_story_choices?.[0]?.choice_id,
        rule.area,
        rule.action,
      ]),
    ).toEqual([
      ["albany:campus_calibrated_warning_drover_rest", DROVER, "albany_city__campus", "rest"],
      [
        "albany:wolf_works_fortification_return_resupply",
        WORKS,
        "albany_city__industrial",
        "resupply",
      ],
      ["albany:wolf_drover_route_return_rest", DROVER, "albany_city__campus", "rest"],
      [
        "albany:wolf_relief_protocol_return_resupply",
        RELIEF,
        "albany_city__civic_core",
        "resupply",
      ],
    ]);
    expect(
      serviceRules
        .filter((rule) => rule.id !== "albany:campus_calibrated_warning_drover_rest")
        .every((rule) => rule.requires_all_world_facts?.includes("fact:wolf_winter_byre_held")),
    ).toBe(true);

    for (const memoryId of [
      "albany:memory_reese_wolf_works_fortification_allocated",
      "albany:memory_emery_wolf_drover_route_allocated",
      "albany:memory_jamie_wolf_relief_protocol_allocated",
    ]) {
      expect(
        world.characters.some((character) =>
          character.variants?.some((variant) =>
            variant.after_relationship_memories?.includes(memoryId),
          ),
        ),
      ).toBe(true);
    }
  });

  it("makes Works Repair expertise matter while preserving its deterministic noisy recovery", () => {
    let specialist = profileState(WORKS, IRONHANDS);
    let generalist = profileState(WORKS, WARDEN);
    expect(specialist.vars).toMatchObject({ repair: 4, streetwise: 0, mediation: 0 });
    expect(specialist.flags.works_fortification_prepared).toBe(true);
    expect(specialist.campaignImportReceipt?.applied_rules).toEqual([
      "import:wolf_winter_works_fortification",
      "import:wolf_winter_works_repair",
    ]);

    specialist = reachPaling(specialist);
    generalist = reachPaling(generalist);
    expect(
      buildRpgObservation(index, specialist).available_actions.find(
        (option) => option.id === "use_paling_rail",
      )?.command,
    ).toMatch(/set.*rail/i);
    specialist = act(specialist, "use_paling_rail", 8);
    generalist = act(generalist, "use_paling_rail", 8);

    expect(specialist.flags.breach_braced).toBe(true);
    expect(specialist.vars.cattle_alarm).toBe(0);
    expect(generalist.flags.rail_split).toBe(true);
    expect(generalist.flags.works_fortification_splice_needed).toBe(true);
    expect(actionIds(generalist)).toContain("use_paling_rail");
    generalist = act(generalist, "use_paling_rail");
    expect(generalist.flags.rail_split).not.toBe(true);
    expect(generalist.flags.works_fortification_splice_needed).not.toBe(true);
    expect(generalist.flags.breach_braced).toBe(true);
    expect(generalist.inventory).not.toContain("split_rail_guard");
    expect(generalist.vars.cattle_alarm).toBe(1);
    expect(actionIds(generalist)).not.toContain("use_paling_rail");

    let publicState = initStateForRpgPack(index, 505);
    publicState = reachPaling(publicState);
    const publicRail = buildRpgObservation(index, publicState).available_actions.find(
      (option) => option.id === "use_paling_rail",
    );
    expect(publicState.vars).toMatchObject({ repair: 0, streetwise: 0, mediation: 0 });
    expect(publicRail?.command).toMatch(/wedge.*rail/i);
  });

  it("lets both Works brace outcomes recover a committed fouled lure without blood", () => {
    let hybrid = foulFirstCast(profileState(WORKS, IRONHANDS));
    expect(actionIds(hybrid)).toContain("use_paling_rail");
    hybrid = act(hybrid, "maneuver_yearling_wolf_commit_hybrid_strike", 1, 1);
    expect(hybrid.flags.lure_hybrid_combat_entered).toBe(true);
    expect(actionIds(hybrid)).not.toContain("use_paling_rail");

    for (const firstRoll of [20, 1]) {
      let state = foulFirstCast(profileState(WORKS, IRONHANDS));
      const alarmAfterFoul = state.vars.cattle_alarm ?? 0;
      state = act(state, "use_paling_rail", firstRoll);

      if (firstRoll === 1) {
        expect(state.flags).toMatchObject({
          rail_split: true,
          works_fortification_splice_needed: true,
        });
        state = act(state, "use_paling_rail");
        expect(state.vars.cattle_alarm).toBe(alarmAfterFoul + 1);
      } else {
        expect(state.vars.cattle_alarm).toBe(alarmAfterFoul);
      }

      expect(state.flags.breach_braced).toBe(true);
      expect(
        buildRpgObservation(index, state).available_actions.find(
          (option) => option.id === "use_paling_rail",
        )?.command,
      ).toMatch(/turn.*braced scent-pen/i);
      state = act(state, "use_paling_rail");
      expect(state.flags).toMatchObject({
        yearling_redirected: true,
        yearling_redirected_with_braced_rail: true,
      });
      expect(state.flags.yearling_down).not.toBe(true);
      expect(state.flags.june_blood_condition_broken).not.toBe(true);
      expect(actionIds(state)).not.toContain("attack_yearling_wolf");
    }
  });

  it("makes the one-shot Drover route cleanly recover or worsen the same failed cast", () => {
    let specialist = foulFirstCast(profileState(DROVER, COURIER));
    let generalist = foulFirstCast(profileState(DROVER, WARDEN));
    expect(specialist.vars.streetwise).toBe(4);
    expect(specialist.campaignImportReceipt?.applied_rules).toEqual([
      "import:wolf_winter_drover_route",
      "import:wolf_winter_drover_streetwise",
    ]);
    expect(actionIds(specialist)).toContain("use_drover_route_marks");

    const hybrid = act(specialist, "maneuver_yearling_wolf_commit_hybrid_strike", 1, 1);
    expect(hybrid.flags.lure_hybrid_combat_entered).toBe(true);
    expect(hybrid.flags.yearling_down).not.toBe(true);
    expect(actionIds(hybrid)).not.toContain("use_drover_route_marks");
    expect(buildRpgObservation(index, hybrid).description).not.toMatch(/run that one-use route/i);

    specialist = act(specialist, "use_drover_route_marks", 8);
    generalist = act(generalist, "use_drover_route_marks", 8);
    expect(specialist.flags.yearling_redirected).toBe(true);
    expect(specialist.vars.cattle_alarm).toBe(1);
    expect(actionIds(specialist)).not.toContain("use_drover_route_marks");
    expect(generalist.flags.yearling_redirected).not.toBe(true);
    expect(generalist.vars.cattle_alarm).toBe(3);
    expect(actionIds(generalist)).not.toContain("use_drover_route_marks");
    expect(actionIds(generalist)).toContain("use_paling_rail");

    const clean = finishLure(specialist);
    const recovered = finishLure(recoverWithSplitRail(generalist));
    expect(clean).toMatchObject({
      ended: true,
      endingId: "ending_pack_diverted",
      vars: { cattle_alarm: 3 },
    });
    expect(recovered).toMatchObject({
      ended: true,
      endingId: "ending_pack_diverted_cattle_scattered",
      vars: { cattle_alarm: 5 },
    });
  });

  it("makes Relief Mediation change pressure once after the exact public rail recovery", () => {
    let specialist = recoverWithSplitRail(foulFirstCast(profileState(RELIEF, LEDGER)));
    let generalist = recoverWithSplitRail(foulFirstCast(profileState(RELIEF, COURIER)));
    specialist = act(specialist, "go_south");
    generalist = act(generalist, "go_south");
    expect(specialist.vars.mediation).toBe(4);
    expect(specialist.campaignImportReceipt?.applied_rules).toEqual([
      "import:wolf_winter_relief_mediation",
      "import:wolf_winter_relief_protocol",
    ]);
    expect(actionIds(specialist)).toContain("use_relief_protocol_docket");

    specialist = act(specialist, "use_relief_protocol_docket", 8);
    generalist = act(generalist, "use_relief_protocol_docket", 8);
    expect(specialist.vars.cattle_alarm).toBe(1);
    expect(generalist.vars.cattle_alarm).toBe(3);
    expect(actionIds(specialist)).not.toContain("use_relief_protocol_docket");
    expect(actionIds(generalist)).not.toContain("use_relief_protocol_docket");

    expect(finishLure(specialist)).toMatchObject({
      ended: true,
      endingId: "ending_pack_diverted",
      vars: { cattle_alarm: 3 },
    });
    expect(finishLure(generalist)).toMatchObject({
      ended: true,
      endingId: "ending_pack_diverted_cattle_scattered",
      vars: { cattle_alarm: 5 },
    });
  });

  it("adds two fortify outcomes while preserving every prior nondeath and death identity", () => {
    expect(pack.endings.map((ending) => ending.id)).toEqual([
      "ending_fortified_cade_terms",
      "ending_fortified_albany_authority",
      "ending_drive_cattle_wounded",
      "ending_drive_person_cattle_lost",
      "ending_drive_reserve_spent",
      "ending_pack_diverted_after_blood",
      "ending_pack_diverted_cattle_scattered",
      "ending_pack_diverted",
      "ending_held_gate_barred",
      "ending_held_timber_saved",
      "ending_held",
      "ending_pulled_down",
    ]);
  });
});
