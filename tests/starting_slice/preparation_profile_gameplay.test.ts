/**
 * SS-F05 pack-level counterfactual proof. Albany allocates exactly one persistent
 * preparation knowledge, Wolf-Winter imports the matching background skill, and
 * each profile changes one bounded pressure decision without adding an ending.
 */
import { describe, expect, it } from "vitest";

import { renderActionOption } from "../../bin/rpg_play.js";
import { makeStep } from "../../src/core/engine.js";
import type { Rng } from "../../src/core/rng.js";
import { cloneGameState, type GameState } from "../../src/core/state.js";
import {
  COMPACT_ACTION_LIMIT,
  compactRpgObservation,
} from "../../src/mcp/compact_rpg_observation.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { applyOpeningAllyOption } from "../../src/world/opening_ally.js";
import {
  applyOpeningPreparationProfile,
  parseOpeningPreparation,
} from "../../src/world/opening_preparation.js";
import { presentOpeningPreparation } from "../../src/world/opening_preparation_presentation.js";
import { applyOpeningReliefAllocationOption } from "../../src/world/opening_relief_allocation.js";
import { applyOpeningReliefOathOption } from "../../src/world/opening_relief_oath.js";
import { applyOverworldQuestLaunchOption } from "../../src/world/quest_launch.js";
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
const reliefOath =
  world.opening_relief_oath ??
  (() => {
    throw new Error("the Albany starting slice requires a relief oath");
  })();
const reliefAllocation =
  world.opening_relief_allocation ??
  (() => {
    throw new Error("the Albany starting slice requires a relief allocation");
  })();
const ally =
  world.opening_ally ??
  (() => {
    throw new Error("the Albany starting slice requires an ally choice");
  })();
const wolfQuest =
  world.quests.find((quest) => quest.id === "wolf_winter") ??
  (() => {
    throw new Error("the Albany starting slice requires Wolf-Winter");
  })();
const hillApproach =
  wolfQuest.launch ??
  (() => {
    throw new Error("Wolf-Winter requires hill-approach launch options");
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
const RELIEF_TRIGGER_CATEGORY = "Herd calming after the public-rail lure recovery.";
const RELIEF_PREVIEW =
  "Commit to the lure, foul its first feed cast, fail the public wedge, then bind and spend the split-rail guard to redirect the yearling alive. Return to Cade before the loft cast to open one Mediation check (DC 12). A clean cast, braced rail, or any other recovery does not qualify. Success lowers cattle alarm by 1; failure raises it by 1. The protocol retires either way without blocking the lure, and Mediation training improves the check.";
const IRONHANDS = "albany:ironhands_repairer";
const COURIER = "albany:unaffiliated_courier";
const LEDGER = "albany:ledger_advocate";
const WARDEN = "albany:road_warden";
const WORKS_STAKES =
  "Success braces the breach immediately; failure splits the rail but leaves a guaranteed cold-set recovery that raises cattle alarm by 1, plus 1 if dispatch began late.";
const DROVER_STAKES =
  "Success redirects the yearling alive and lowers cattle alarm by 1; failure spends the route without added pressure, while rail or spear recovery remains.";
const DROVER_DRIVE_STAKES =
  "Success removes the folded shutter's extra pack-pressure beat and prevents the later -2 HP overrun brace; failure leaves that cost. The route retires either way, and the loose hurdle remains mandatory.";
const RELIEF_STAKES =
  "Success lowers cattle alarm by 1; failure raises it by 1. The protocol is spent either way, and the committed lure route remains open.";

const DROVER_ROUTE_CASES = [
  {
    label: "exposed ridge",
    approachId: "albany:wolf_approach_exposed_ridge",
    arrivalAction: "use_exposed_ridge_last_mile",
    allocationId: "albany:relief_resident_shelter",
    alarmAfterFoul: 3,
  },
  {
    label: "exposed ridge with Cade fodder",
    approachId: "albany:wolf_approach_exposed_ridge",
    arrivalAction: "use_exposed_ridge_last_mile",
    allocationId: "albany:relief_cade_fodder",
    alarmAfterFoul: 3,
  },
  {
    label: "sheltered stockway",
    approachId: "albany:wolf_approach_sheltered_stockway",
    arrivalAction: "use_sheltered_stockway_last_mile",
    allocationId: "albany:relief_resident_shelter",
    alarmAfterFoul: 2,
  },
  {
    label: "sheltered stockway with Cade fodder",
    approachId: "albany:wolf_approach_sheltered_stockway",
    arrivalAction: "use_sheltered_stockway_last_mile",
    allocationId: "albany:relief_cade_fodder",
    alarmAfterFoul: 2,
  },
] as const;

const DROVER_OATH_CASES = [
  {
    label: "full Compact duty",
    optionId: "albany:oath_full_compact_duty",
    flag: "relief_oath_full_duty",
    finalAlarmStep: 1,
  },
  {
    label: "aid-only duty",
    optionId: "albany:oath_limited_aid_only",
    flag: "relief_oath_limited_duty",
    // This matrix always fouls the opening; Aid-Only suppresses only a clean line.
    finalAlarmStep: 1,
  },
  {
    label: "unaffiliated personal bond",
    optionId: "albany:oath_unaffiliated_personal_bond",
    flag: "relief_oath_unaffiliated_bond",
    finalAlarmStep: 1,
  },
] as const;

const PREPARATION_CHECK_CASES = [
  {
    profileId: WORKS,
    skillId: "skill:repair",
    skillLabel: "Repair",
    specialistId: IRONHANDS,
    consumerObjectId: "paling_rail",
    consumerCommandVerb: "set",
  },
  {
    profileId: DROVER,
    skillId: "skill:streetwise",
    skillLabel: "Streetwise",
    specialistId: COURIER,
    consumerObjectId: "drover_route_marks",
    consumerCommandVerb: "run",
  },
  {
    profileId: RELIEF,
    skillId: "skill:mediation",
    skillLabel: "Mediation",
    specialistId: LEDGER,
    consumerObjectId: "relief_protocol_docket",
    consumerCommandVerb: "call",
  },
] as const;

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

function narrationForAction(state: GameState, actionId: string): string {
  const options = enumerateRpgActions(index, state);
  const option = options.find((candidate) => candidate.id === actionId);
  expect(
    option,
    `${actionId} must be legal in ${state.current}; legal: ${options
      .map((candidate) => candidate.id)
      .join(", ")}`,
  ).toBeDefined();
  if (!option) throw new Error(`Missing action ${actionId}.`);
  const result = makeStep(buildRpgRules(index, () => fixedRolls()))(state, option.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  return result.events
    .flatMap((event) => (event.type === "narration" ? [event.text] : []))
    .join(" ");
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

function droverScenarioState(args: {
  route: (typeof DROVER_ROUTE_CASES)[number];
  oath: (typeof DROVER_OATH_CASES)[number];
  withJune: boolean;
}): GameState {
  const roadWarden = registration.profiles.find((profile) => profile.id === WARDEN);
  if (!roadWarden) throw new Error("Missing Road-Warden registration profile.");
  let character = applyOpeningReliefOathOption({
    scene: reliefOath,
    character: roadWarden.character,
    optionId: args.oath.optionId,
  }).characterAfter;
  character = applyOpeningPreparationProfile({
    scene: preparation,
    character,
    profileId: DROVER,
  }).characterAfter;
  character = applyOpeningReliefAllocationOption({
    scene: reliefAllocation,
    character,
    optionId: args.route.allocationId,
  }).characterAfter;
  character = applyOpeningAllyOption({
    scene: ally,
    character,
    optionId: args.withJune ? "albany:ally_june_cattle_first" : "albany:ally_travel_solo",
  }).characterAfter;
  character = applyOverworldQuestLaunchOption({
    launch: hillApproach,
    approachId: args.route.approachId,
    character,
    resources: { minutes: 0, supplies: 10, fatigue: 0 },
  }).characterAfter;
  return initStateForRpgPack(index, 505, { character, imports });
}

function droverRecoveryMechanics(state: GameState): GameState {
  const mechanics = cloneGameState(state);
  // A taken action advances the audit counter and appends its journal entry. Normalize
  // those records so this comparison covers every decision-relevant state field.
  mechanics.step = 0;
  mechanics.journal = [];
  Reflect.deleteProperty(mechanics.flags, "drover_route_attempted");
  return mechanics;
}

function reachPaling(state: GameState): GameState {
  state = act(state, "go_north");
  return act(state, "go_north");
}

function reachFirstLureCast(state: GameState): GameState {
  if (state.current === "steading_yard") return act(state, "go_north");
  expect(state.current).toBe("byre_yard");
  return state;
}

function foulFirstCast(state: GameState, expectedAlarm = 2): GameState {
  state = reachFirstLureCast(state);
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
  expect(state.vars.cattle_alarm).toBe(expectedAlarm);
  return state;
}

function foulDriveShutter(state: GameState): GameState {
  state = act(state, "go_north");
  state = act(state, "talk_houndsman");
  state = act(state, "ask_drive");
  state = act(state, "ask_commit_drive");
  state = act(state, "ask_leave");
  state = act(state, "take_drive_signal_rope_kit");
  state = act(state, "go_north");
  state = act(state, "use_drive_signal_rope_kit_on_drive_breach_signal", 1);
  expect(state).toMatchObject({
    flags: { drive_opening_fouled: true, drover_route_prepared: true },
    vars: { pack_drive: 2, drive_kit_charges: 1 },
  });
  return state;
}

function recoverWithSplitRail(state: GameState): GameState {
  state = act(state, "wedge_paling_rail", 1);
  expect(state.flags.rail_split).toBe(true);
  state = act(state, "bind_paling_rail");
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
  if (state.flags.june_pike_present) {
    expect(actionIds(state)).toContain("talk_june_pike");
    state = act(state, "talk_june_pike");
    state = act(state, "ask_acknowledge");
  } else {
    expect(actionIds(state)).not.toContain("talk_june_pike");
  }
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
    const partiallyCategorized = structuredClone(preparation);
    Reflect.deleteProperty(partiallyCategorized.profiles[0]!, "trigger_category");
    expect(() => parseOpeningPreparation(partiallyCategorized)).toThrow(
      /trigger categories must cover every profile/i,
    );
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
      ["albany:campus_clinic_threshold_card_drover_rest", DROVER, "albany_city__campus", "rest"],
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
        .filter(
          (rule) =>
            rule.id !== "albany:campus_calibrated_warning_drover_rest" &&
            rule.id !== "albany:campus_clinic_threshold_card_drover_rest",
        )
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

  it("keeps every authored check contract while deferring its odds to the field consumer", () => {
    for (const checkCase of PREPARATION_CHECK_CASES) {
      const authored = preparation.profiles.find(
        (candidate) => candidate.id === checkCase.profileId,
      );
      if (!authored) throw new Error(`Missing preparation profile ${checkCase.profileId}.`);
      expect(authored.check_disclosure).toEqual({
        skill_id: checkCase.skillId,
        skill_label: checkCase.skillLabel,
        difficulty: 12,
        consumer: {
          object_id: checkCase.consumerObjectId,
          verb: "USE",
          command_verb: checkCase.consumerCommandVerb,
        },
      });

      for (const background of registration.profiles) {
        const presented = presentOpeningPreparation(preparation, background.character).options.find(
          (option) => option.id === checkCase.profileId,
        );
        const modifier =
          background.character.skills.find((skill) => skill.skillId === checkCase.skillId)?.rank ??
          0;
        const signedModifier = modifier >= 0 ? `+${String(modifier)}` : String(modifier);
        expect(Object.keys(presented?.summary ?? {}).sort(), background.id).toEqual(
          ["checkFit", "commitment", "immediateCost", "tradeoff"].sort(),
        );
        expect(presented?.summary?.checkFit, background.id).toBe(
          `${checkCase.skillLabel} ${signedModifier} vs DC 12`,
        );
        expect(presented?.consequence, background.id).toMatch(
          /^Benefit: .+ Cost: .+\. Boundary: .+$/,
        );
        expect(presented?.consequence.match(/\S+/g)?.length, background.id).toBeLessThanOrEqual(32);
        expect(presented?.consequence, background.id).not.toContain(checkCase.skillLabel);
        expect(presented?.consequence, background.id).not.toContain("DC 12");
      }
    }

    const drover = preparation.profiles.find((candidate) => candidate.id === DROVER);
    if (!drover) throw new Error("Missing Emery's Drover Route.");
    expect(drover.preview).toBe(
      "After the first lure cast or DRIVE shutter fails, the route opens one Streetwise check (DC 12). On LURE, success redirects the yearling alive and lowers cattle alarm by 1; failure spends the route while rail or fight remains at the same pressure. On DRIVE, success removes the failed shutter's extra pack-pressure beat; failure leaves it. Either DRIVE outcome still requires the loose hurdle, but success prevents the later overrun brace and its persistent -2 HP strain before the same three crisis priorities. Streetwise training improves either attempt without class-locking it.",
    );
    const droverDetail = presentOpeningPreparation(
      preparation,
      registration.profiles[0]!.character,
    ).options.find((option) => option.id === DROVER)?.consequence;
    expect(droverDetail).toBe(
      `Benefit: ${drover.trigger_category} Cost: 20 minutes and $4. Boundary: ${drover.tradeoff}`,
    );
    expect(droverDetail).not.toContain(drover.preview);
  });

  it("repeats every preparation check and both outcomes at its field object before resolution", () => {
    const works = reachPaling(profileState(WORKS, IRONHANDS));
    const worksBefore = structuredClone(works);
    expect(
      enumerateRpgActions(index, works).find((action) => action.id === "set_paling_rail")
        ?.skill_check,
    ).toEqual({
      skill: "repair",
      modifier: 4,
      difficulty: 12,
      die: "d20",
      stakes: WORKS_STAKES,
    });
    expect(narrationForAction(works, "examine_paling_rail")).toMatch(
      /Repair check at DC 12[^]*closing Hayden's frost-brace line[^]*Success braces[^]*Failure opens the marked cold-set splice[^]*no second roll[^]*raises cattle alarm by 1[^]*ordinary hunt[^]*combat funnel[^]*committed fouled lure[^]*living scent-pen/i,
    );
    expect(works).toEqual(worksBefore);
    expect(works.flags.rail_attempted).not.toBe(true);

    const drover = foulFirstCast(profileState(DROVER, COURIER));
    const droverBefore = structuredClone(drover);
    expect(
      enumerateRpgActions(index, drover).find((action) => action.id === "use_drover_route_marks")
        ?.skill_check,
    ).toEqual({
      skill: "streetwise",
      modifier: 4,
      difficulty: 12,
      die: "d20",
      stakes: DROVER_STAKES,
    });
    expect(narrationForAction(drover, "examine_drover_route_marks")).toMatch(
      /Streetwise[^]*DC 12[^]*Success[^]*yearling alive[^]*lowers cattle alarm by 1[^]*Failure spends the route without adding pressure[^]*rail or spear recovery remains/i,
    );
    expect(drover).toEqual(droverBefore);
    expect(drover.flags.drover_route_attempted).not.toBe(true);

    const driveDrover = foulDriveShutter(profileState(DROVER, COURIER));
    const driveDroverBefore = structuredClone(driveDrover);
    expect(
      enumerateRpgActions(index, driveDrover).find(
        (action) => action.id === "use_drive_drover_route_marks",
      )?.skill_check,
    ).toEqual({
      skill: "streetwise",
      modifier: 4,
      difficulty: 12,
      die: "d20",
      stakes: DROVER_DRIVE_STAKES,
    });
    expect(narrationForAction(driveDrover, "examine_drive_drover_route_marks")).toMatch(
      /first DRIVE shutter[^]*Streetwise[^]*DC 12[^]*extra pack-pressure[^]*-2 HP[^]*Failure leaves[^]*loose hurdle remains/i,
    );
    expect(driveDrover).toEqual(driveDroverBefore);
    expect(driveDrover.flags.drover_route_attempted).not.toBe(true);

    let relief = recoverWithSplitRail(foulFirstCast(profileState(RELIEF, LEDGER)));
    relief = act(relief, "go_south");
    const reliefBefore = structuredClone(relief);
    expect(
      enumerateRpgActions(index, relief).find(
        (action) => action.id === "use_relief_protocol_docket",
      )?.skill_check,
    ).toEqual({
      skill: "mediation",
      modifier: 4,
      difficulty: 12,
      die: "d20",
      stakes: RELIEF_STAKES,
    });
    expect(narrationForAction(relief, "examine_relief_protocol_docket")).toMatch(
      /fouled lure[^]*failed public wedge[^]*bound split-rail guard[^]*Mediation[^]*DC 12[^]*Success lowers cattle alarm by 1[^]*failure raises it by 1[^]*retires either way[^]*lure continues/i,
    );
    expect(relief).toEqual(reliefBefore);
    expect(relief.flags.relief_protocol_attempted).not.toBe(true);
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
        (option) => option.id === "set_paling_rail",
      )?.command,
    ).toMatch(/set.*rail/i);
    specialist = act(specialist, "set_paling_rail", 8);
    generalist = act(generalist, "set_paling_rail", 8);

    expect(specialist.flags.breach_braced).toBe(true);
    expect(specialist.vars.cattle_alarm).toBe(0);
    expect(generalist.flags.rail_split).not.toBe(true);
    expect(generalist.flags.works_fortification_splice_needed).toBe(true);
    expect(actionIds(generalist)).toContain("splice_paling_rail");
    generalist = act(generalist, "splice_paling_rail");
    expect(generalist.flags.rail_split).not.toBe(true);
    expect(generalist.flags.works_fortification_splice_needed).not.toBe(true);
    expect(generalist.flags.breach_braced).toBe(true);
    expect(generalist.inventory).not.toContain("split_rail_guard");
    expect(generalist.vars.cattle_alarm).toBe(1);
    expect(actionIds(generalist)).not.toContain("splice_paling_rail");

    let publicState = initStateForRpgPack(index, 505);
    publicState = reachPaling(publicState);
    const publicRail = buildRpgObservation(index, publicState).available_actions.find(
      (option) => option.id === "wedge_paling_rail",
    );
    expect(publicState.vars).toMatchObject({ repair: 0, streetwise: 0, mediation: 0 });
    expect(publicRail?.command).toMatch(/wedge.*rail/i);
  });

  it("lets both Works brace outcomes recover a committed fouled lure without blood", () => {
    let hybrid = foulFirstCast(profileState(WORKS, IRONHANDS));
    expect(actionIds(hybrid)).toContain("set_paling_rail");
    hybrid = act(hybrid, "maneuver_yearling_wolf_commit_hybrid_strike", 1, 1);
    expect(hybrid.flags.lure_hybrid_combat_entered).toBe(true);
    expect(actionIds(hybrid)).not.toContain("set_paling_rail");

    for (const firstRoll of [20, 1]) {
      let state = foulFirstCast(profileState(WORKS, IRONHANDS));
      const alarmAfterFoul = state.vars.cattle_alarm ?? 0;
      state = act(state, "set_paling_rail", firstRoll);

      if (firstRoll === 1) {
        expect(state.flags.rail_split).not.toBe(true);
        expect(state.flags.works_fortification_splice_needed).toBe(true);
        state = act(state, "splice_paling_rail");
        expect(state.vars.cattle_alarm).toBe(alarmAfterFoul + 1);
      } else {
        expect(state.vars.cattle_alarm).toBe(alarmAfterFoul);
      }

      expect(state.flags.breach_braced).toBe(true);
      expect(
        buildRpgObservation(index, state).available_actions.find(
          (option) => option.id === "turn_paling_rail",
        )?.command,
      ).toMatch(/turn.*braced scent-pen/i);
      state = act(state, "turn_paling_rail");
      expect(state.flags).toMatchObject({
        yearling_redirected: true,
        yearling_redirected_with_braced_rail: true,
      });
      expect(state.flags.yearling_down).not.toBe(true);
      expect(state.flags.june_blood_condition_broken).not.toBe(true);
      expect(actionIds(state)).not.toContain("attack_yearling_wolf");
    }
  });

  it("keeps a failed Works set traversable after a fouled lure commits to hybrid combat", () => {
    let state = foulFirstCast(profileState(WORKS, IRONHANDS));
    state.flags.hayden_frost_report_certified = true;
    state = act(state, "set_paling_rail", 1);
    expect(state.flags.works_fortification_splice_needed).toBe(true);
    expect(state.flags.rail_split).not.toBe(true);
    expect(actionIds(state)).toContain("splice_paling_rail");

    state = act(state, "maneuver_yearling_wolf_commit_hybrid_strike", 1, 1);
    expect(state.flags.lure_hybrid_combat_entered).toBe(true);
    expect(actionIds(state)).not.toContain("splice_paling_rail");
    for (let guard = 0; guard < 5 && !state.flags.yearling_down; guard += 1) {
      state = act(state, "attack_yearling_wolf", 6, 1);
    }
    expect(state.flags.yearling_down).toBe(true);

    for (const actionId of [
      "go_south",
      "go_west",
      "go_up",
      "use_winter_feed_sack_on_loft_hatch",
      "go_east",
    ]) {
      state = act(state, actionId);
    }
    expect(state.flags.flank_redirected).toBe(true);
    expect(actionIds(state)).not.toContain("maneuver_flank_wolf_frost_brace_trip");

    state = act(state, "go_south");
    expect(state.current).toBe("paling_gap");
    expect(state.flags.works_fortification_splice_needed).toBe(true);
    expect(actionIds(state)).toContain("go_north");
    state = act(state, "go_north");
    expect(state.current).toBe("byre_door");
    expect(actionIds(state)).not.toContain("maneuver_flank_wolf_frost_brace_trip");
  });

  it("lets Courier Drover success improve pressure while Road-Warden failure matches declining it", () => {
    let specialist = foulFirstCast(profileState(DROVER, COURIER));
    let generalist = foulFirstCast(profileState(DROVER, WARDEN));
    const declined = cloneGameState(generalist);
    expect(specialist.vars.streetwise).toBe(4);
    expect(generalist.vars.streetwise).toBe(0);
    expect(specialist.campaignImportReceipt?.applied_rules).toEqual([
      "import:wolf_winter_drover_route",
      "import:wolf_winter_drover_streetwise",
    ]);
    expect(actionIds(specialist)).toContain("use_drover_route_marks");
    expect(generalist.campaignImportReceipt?.applied_rules).toContain(
      "import:wolf_winter_drover_route",
    );
    expect(declined.flags.drover_route_prepared).toBe(true);
    expect(declined.campaignImportReceipt).toEqual(generalist.campaignImportReceipt);

    const specialistActions = enumerateRpgActions(index, specialist);
    const specialistRoute = specialistActions.find(
      (action) => action.id === "use_drover_route_marks",
    );
    const generalistRoute = enumerateRpgActions(index, generalist).find(
      (action) => action.id === "use_drover_route_marks",
    );
    expect(specialistRoute?.skill_check).toEqual({
      skill: "streetwise",
      modifier: 4,
      difficulty: 12,
      die: "d20",
      stakes: DROVER_STAKES,
    });
    expect(generalistRoute?.skill_check).toEqual({
      skill: "streetwise",
      modifier: 0,
      difficulty: 12,
      die: "d20",
      stakes: DROVER_STAKES,
    });

    const specialistObservation = buildRpgObservation(index, specialist);
    const compactWithActions = compactRpgObservation(
      specialistObservation,
      specialistObservation.available_actions,
      { includeActions: true },
    );
    const expectedCompactActions = specialistObservation.available_actions
      .map((action) => action.id)
      .slice(0, COMPACT_ACTION_LIMIT);
    expect(JSON.stringify(compactWithActions.actions)).toBe(JSON.stringify(expectedCompactActions));
    expect(compactWithActions.checks).toContainEqual([
      "use_drover_route_marks",
      "streetwise",
      4,
      "d20",
      12,
      DROVER_STAKES,
    ]);
    const publicDisclosureJson = JSON.stringify(
      specialistObservation.available_actions.find(
        (action) => action.id === "use_drover_route_marks",
      )?.skill_check,
    );
    const compactDisclosureJson = JSON.stringify(
      compactWithActions.checks?.find(([actionId]) => actionId === "use_drover_route_marks"),
    );
    for (const disclosureJson of [publicDisclosureJson, compactDisclosureJson]) {
      expect(disclosureJson).toContain(DROVER_STAKES);
      expect(disclosureJson).not.toMatch(
        /on_success|on_failure|on_failure_when|yearling_redirected|end_game/i,
      );
    }
    expect(
      compactRpgObservation(specialistObservation, specialistObservation.available_actions).checks,
    ).toBeUndefined();

    const terminalLabel = renderActionOption(specialistRoute!);
    expect(terminalLabel).toContain(specialistRoute!.command);
    expect(terminalLabel).toMatch(/streetwise/i);
    expect(terminalLabel).toContain("+4");
    expect(terminalLabel).toContain("d20");
    expect(terminalLabel).toMatch(/DC 12/i);
    expect(terminalLabel).toContain(DROVER_STAKES);

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
    const retiredObservation = buildRpgObservation(index, specialist);
    const retiredCompact = compactRpgObservation(
      retiredObservation,
      retiredObservation.available_actions,
      { includeActions: true },
    );
    expect(
      retiredCompact.checks?.some(([actionId]) => actionId === "use_drover_route_marks") ?? false,
    ).toBe(false);
    expect(generalist.flags.yearling_redirected).not.toBe(true);
    expect(generalist.vars.cattle_alarm).toBe(2);
    expect(actionIds(generalist)).not.toContain("use_drover_route_marks");
    expect(actionIds(generalist)).toContain("wedge_paling_rail");
    expect(actionIds(declined)).toContain("use_drover_route_marks");
    expect(actionIds(declined)).toContain("wedge_paling_rail");
    expect(droverRecoveryMechanics(generalist)).toEqual(droverRecoveryMechanics(declined));

    const clean = finishLure(specialist);
    const recovered = finishLure(recoverWithSplitRail(generalist));
    const declinedResult = finishLure(recoverWithSplitRail(declined));
    expect(clean).toMatchObject({
      ended: true,
      endingId: "ending_pack_diverted",
      vars: { cattle_alarm: 3 },
    });
    expect(recovered).toMatchObject({
      ended: true,
      endingId: "ending_pack_diverted_cattle_scattered",
      vars: { cattle_alarm: 4 },
    });
    expect(declinedResult).toMatchObject({
      ended: true,
      endingId: "ending_pack_diverted_cattle_scattered",
      vars: { cattle_alarm: 4 },
    });
  });

  it("keeps failed Drover pressure equal to declining it across the reachable lure matrix", () => {
    for (const route of DROVER_ROUTE_CASES) {
      for (const oath of DROVER_OATH_CASES) {
        for (const withJune of [false, true]) {
          const label = `${route.label}, ${oath.label}, ${withJune ? "June" : "solo"}`;
          let prepared = droverScenarioState({
            route,
            oath,
            withJune,
          });

          expect(prepared.flags[oath.flag], label).toBe(true);
          if (withJune) {
            expect(prepared.flags.june_pike_present, label).toBe(true);
          } else {
            expect(prepared.flags.june_pike_present, label).not.toBe(true);
          }
          expect(prepared.flags.drover_route_prepared, label).toBe(true);
          expect(prepared.campaignImportReceipt?.applied_rules, label).toContain(
            "import:wolf_winter_drover_route",
          );
          expect(actionIds(prepared), label).toContain(route.arrivalAction);

          prepared = act(prepared, route.arrivalAction);
          prepared = foulFirstCast(prepared, route.alarmAfterFoul);
          let declined = cloneGameState(prepared);
          expect(prepared.vars.cattle_alarm, label).toBe(route.alarmAfterFoul);
          expect(declined.vars.cattle_alarm, label).toBe(route.alarmAfterFoul);
          expect(declined.flags.drover_route_prepared, label).toBe(true);
          expect(declined.campaignImportReceipt, label).toEqual(prepared.campaignImportReceipt);
          expect(actionIds(prepared), label).toContain("use_drover_route_marks");
          expect(actionIds(declined), label).toContain("use_drover_route_marks");

          prepared = act(prepared, "use_drover_route_marks", 8);
          expect(prepared.vars.streetwise, label).toBe(0);
          expect(prepared.flags.drover_route_attempted, label).toBe(true);
          expect(declined.flags.drover_route_attempted, label).not.toBe(true);
          expect(prepared.flags.yearling_redirected, label).not.toBe(true);
          expect(droverRecoveryMechanics(prepared), label).toEqual(
            droverRecoveryMechanics(declined),
          );
          expect(actionIds(prepared), label).not.toContain("use_drover_route_marks");
          expect(actionIds(declined), label).toContain("use_drover_route_marks");
          expect(actionIds(prepared), label).toContain("wedge_paling_rail");
          expect(actionIds(declined), label).toContain("wedge_paling_rail");
          expect(actionIds(prepared), label).toContain(
            "maneuver_yearling_wolf_commit_hybrid_strike",
          );
          expect(actionIds(declined), label).toContain(
            "maneuver_yearling_wolf_commit_hybrid_strike",
          );

          prepared = recoverWithSplitRail(prepared);
          declined = recoverWithSplitRail(declined);
          expect(prepared.vars.cattle_alarm, label).toBe(declined.vars.cattle_alarm);
          expect(prepared.vars.score, label).toBe(10);
          expect(declined.vars.score, label).toBe(10);
          expect(declined.flags.drover_route_attempted, label).not.toBe(true);
          expect(actionIds(prepared), label).not.toContain("use_drover_route_marks");
          expect(actionIds(declined), label).not.toContain("use_drover_route_marks");

          prepared = finishLure(prepared);
          declined = finishLure(declined);
          const expectedAlarm = route.alarmAfterFoul + 1 - (withJune ? 1 : 0) + oath.finalAlarmStep;
          const expectedEnding =
            expectedAlarm >= 4 ? "ending_pack_diverted_cattle_scattered" : "ending_pack_diverted";
          expect(prepared, label).toMatchObject({
            ended: true,
            endingId: expectedEnding,
            vars: { cattle_alarm: expectedAlarm, score: 45 },
          });
          expect(declined, label).toMatchObject({
            ended: true,
            endingId: expectedEnding,
            vars: { cattle_alarm: expectedAlarm, score: 45 },
          });
          expect(prepared.vars.cattle_alarm, label).toBe(declined.vars.cattle_alarm);
          expect(prepared.vars.score, label).toBe(declined.vars.score);
          expect(prepared.endingId, label).toBe(declined.endingId);
          expect(actionIds(prepared), label).not.toContain("use_drover_route_marks");
        }
      }
    }
  });

  it("makes Relief Mediation change pressure once after the exact public rail recovery", () => {
    const reliefProfile = preparation.profiles.find((profile) => profile.id === RELIEF);
    expect(reliefProfile).toMatchObject({
      trigger_category: RELIEF_TRIGGER_CATEGORY,
      preview: RELIEF_PREVIEW,
    });
    const presented = presentOpeningPreparation(
      preparation,
      registration.profiles[0]!.character,
    ).options.find((option) => option.id === RELIEF);
    expect(presented?.summary).toEqual({
      commitment: reliefProfile?.summary,
      checkFit: "Mediation +0 vs DC 12",
      immediateCost: "30 minutes and $4",
      tradeoff: reliefProfile?.tradeoff,
    });
    expect(presented?.consequence).toBe(
      `Benefit: ${RELIEF_TRIGGER_CATEGORY} Cost: 30 minutes and $4. Boundary: ${reliefProfile?.tradeoff}`,
    );
    expect(presented?.consequence).not.toContain(RELIEF_PREVIEW);
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

  it("opens Relief only at Cade after the spent split guard, never after a braced rail", () => {
    const beforeFirstCast = reachFirstLureCast(profileState(RELIEF, LEDGER));
    expect(actionIds(beforeFirstCast)).not.toContain("wedge_paling_rail");
    expect(actionIds(beforeFirstCast)).not.toContain("use_relief_protocol_docket");

    let splitGuard = foulFirstCast(profileState(RELIEF, LEDGER));
    expect(actionIds(splitGuard)).toContain("wedge_paling_rail");
    expect(actionIds(splitGuard)).not.toContain("use_relief_protocol_docket");
    splitGuard = recoverWithSplitRail(splitGuard);
    expect(splitGuard.current).toBe("paling_gap");
    expect(actionIds(splitGuard)).not.toContain("use_relief_protocol_docket");
    expect(buildRpgObservation(index, splitGuard).description).not.toMatch(
      /braced recovery leaves its docket sealed/i,
    );
    splitGuard = act(splitGuard, "go_south");
    expect(splitGuard.current).toBe("byre_yard");
    expect(actionIds(splitGuard)).toContain("use_relief_protocol_docket");
    const splitGuardObservation = buildRpgObservation(index, splitGuard);
    expect(splitGuardObservation.description).toMatch(
      /Cade holds Jamie's sealed docket[^]*call its named sequence here/i,
    );
    expect(compactRpgObservation(splitGuardObservation, []).text).toMatch(
      /Cade holds Jamie's sealed docket[^]*call its named sequence here/i,
    );

    let braced = foulFirstCast(profileState(RELIEF, LEDGER));
    braced = act(braced, "wedge_paling_rail", 20);
    expect(braced.flags.breach_braced).toBe(true);
    expect(braced.flags.rail_split).not.toBe(true);
    braced = act(braced, "turn_paling_rail");
    expect(braced.flags).toMatchObject({
      yearling_redirected: true,
      yearling_redirected_with_braced_rail: true,
    });
    const bracedObservation = buildRpgObservation(index, braced);
    expect(bracedObservation.description).toMatch(
      /Jamie's protocol required the failed wedge and spent split-rail guard[^]*braced recovery leaves its docket sealed/i,
    );
    expect(compactRpgObservation(bracedObservation, []).text).toBe(
      bracedObservation.description.trimEnd(),
    );
    braced = act(braced, "go_south");
    expect(braced.current).toBe("byre_yard");
    expect(actionIds(braced)).not.toContain("use_relief_protocol_docket");
    expect(buildRpgObservation(index, braced).description).not.toMatch(
      /braced recovery leaves its docket sealed/i,
    );

    let unrelated = foulFirstCast(profileState(DROVER, LEDGER));
    unrelated = act(unrelated, "wedge_paling_rail", 20);
    unrelated = act(unrelated, "turn_paling_rail");
    expect(buildRpgObservation(index, unrelated).description).not.toMatch(
      /Jamie's protocol|required the failed wedge/i,
    );
  });

  it("includes the evacuation and fortify outcomes while preserving every ending identity", () => {
    expect(pack.endings.map((ending) => ending.id)).toEqual([
      "ending_bloodied_byre_evacuated_june_released",
      "ending_bloodied_byre_evacuated",
      "ending_fortified_cade_terms",
      "ending_fortified_albany_authority",
      "ending_drive_cattle_wounded",
      "ending_drive_person_cattle_lost",
      "ending_drive_reserve_spent",
      "ending_pack_diverted_after_blood",
      "ending_pack_diverted_cattle_scattered",
      "ending_pack_diverted",
      "ending_held_gate_barred_june_released",
      "ending_held_gate_barred",
      "ending_held_timber_saved_june_released",
      "ending_held_timber_saved",
      "ending_held_june_released",
      "ending_held",
      "ending_pulled_down",
    ]);
  });
});
