/**
 * SS-F04 authored-content proof. The generic opening contract supplies June as
 * a real campaign companion; this file pins the Wolf consumer, independent
 * cattle-first action, blood departure, direct-start solo default, and existing
 * ending identities without testing the session/save plumbing around them.
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
import { applyOpeningAllyOption } from "../../src/world/opening_ally.js";
import { assertOverworldIntegrity } from "../../src/world/overworld.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const world = loadOverworldManifest(process.cwd());
const ally =
  world.opening_ally ??
  (() => {
    throw new Error("the Albany starting slice requires an opening ally contract");
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

const ACCEPT = "albany:ally_june_cattle_first";
const RELAY = "albany:ally_june_relay_only";
const SOLO = "albany:ally_travel_solo";
const JUNE_PROMISE = "albany:promise_june_cattle_first";
const NORTH_PENDING_GUIDANCE =
  "North waits for the applicable step: acknowledge a hunt-and-hold warning; carry pre-cast feed, drive rig, shutters, or seals; or finish the lure's second cast in the loft.";

function withoutWolfReturnJobOverlays<T extends typeof world>(manifest: T): T {
  for (const job of manifest.local_jobs) {
    const scene = job.authored_scene;
    if (
      scene &&
      [
        ...(scene.requires_all_world_facts ?? []),
        ...(scene.forbids_any_world_facts ?? []),
        ...scene.options.flatMap((option) => [
          ...(option.requires_all_world_facts ?? []),
          ...(option.forbids_any_world_facts ?? []),
        ]),
      ].some((factId) => factId.startsWith("fact:wolf_winter_"))
    ) {
      delete job.authored_scene;
    }
  }
  return manifest;
}

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

function optionState(optionId?: string): GameState {
  const roadWarden = registration.profiles.find((profile) => profile.id === "albany:road_warden");
  if (!roadWarden) throw new Error("Road-Warden registration must exist");
  const character =
    optionId === undefined
      ? roadWarden.character
      : applyOpeningAllyOption({
          scene: ally,
          character: roadWarden.character,
          optionId,
        }).characterAfter;
  return initStateForRpgPack(index, 504, { character, imports });
}

function foulFirstCast(state: GameState): GameState {
  for (const actionId of [
    "go_north",
    "talk_houndsman",
    "ask_lure",
    "ask_commit_lure",
    "ask_leave",
    "go_west",
    "take_winter_feed_sack",
    "go_east",
    "go_north",
  ]) {
    state = act(state, actionId);
  }
  state = act(state, "use_winter_feed_sack_on_downwind_feed_line", 1);
  expect(state.vars.cattle_alarm).toBe(2);
  return state;
}

function foulAndRecoverAlive(state: GameState): GameState {
  state = foulFirstCast(state);
  state = act(state, "wedge_paling_rail", 1);
  state = act(state, "bind_paling_rail");
  state = act(state, "use_split_rail_guard_on_downwind_feed_line");
  expect(state.flags.yearling_redirected).toBe(true);
  return state;
}

function reachLeaderAfterLivingRecovery(state: GameState): GameState {
  for (const actionId of [
    "go_south",
    "go_west",
    "go_up",
    "use_winter_feed_sack_on_loft_hatch",
    "go_east",
    "go_north",
  ]) {
    state = act(state, actionId);
  }
  expect(state.current).toBe("byre_mouth");
  expect(state.vars.cattle_alarm).toBe(3);
  return state;
}

function finishLivingLine(state: GameState): GameState {
  state = act(state, "use_winter_feed_sack_on_outer_scent_gate");
  return act(state, "go_north");
}

describe("SS-F04 — June Pike authored ally gameplay", () => {
  it("rejects target-quest ally predicates that no authored opening state can satisfy", () => {
    const malformed = structuredClone(world);
    const malformedWolf = malformed.quests.find((quest) => quest.id === "wolf_winter");
    const group = malformedWolf?.campaign_exports
      ?.flatMap((campaignExport) => campaignExport.conditional_effects ?? [])
      .find((candidate) =>
        candidate.effects.some(
          (effect) => effect.type === "resolve_promise" && effect.promise_id === JUNE_PROMISE,
        ),
      );
    const promiseCondition = group?.when.requires_all_promises?.[0];
    const promiseEffect = group?.effects.find((effect) => effect.type === "resolve_promise");
    if (!group || !promiseCondition || !promiseEffect) {
      throw new Error("Wolf-Winter requires one conditional June promise export");
    }
    promiseCondition.promise_id = "albany:promise_typo";
    promiseEffect.promise_id = "albany:promise_typo";
    expect(() => assertOverworldIntegrity(malformed)).toThrow(
      /conditional effect group.*unreachable.*opening state/i,
    );

    const omitted = structuredClone(world);
    const omittedWolf = omitted.quests.find((quest) => quest.id === "wolf_winter");
    if (!omittedWolf?.campaign_exports) throw new Error("Wolf-Winter requires campaign exports");
    for (const campaignExport of omittedWolf.campaign_exports) {
      campaignExport.conditional_effects = campaignExport.conditional_effects?.filter(
        (candidate) =>
          !candidate.effects.some(
            (effect) => effect.type === "resolve_promise" && effect.promise_id === JUNE_PROMISE,
          ),
      );
    }
    expect(() => assertOverworldIntegrity(omitted)).toThrow(/leaves field promise.*unresolved/i);

    // This assertion is about the opening contract's target export requirement.
    // Remove optional Albany return jobs which correctly depend on those exports
    // so their downstream reference error cannot mask the target-contract error.
    const exportless = withoutWolfReturnJobOverlays(structuredClone(world));
    const exportlessWolf = exportless.quests.find((quest) => quest.id === "wolf_winter");
    if (!exportlessWolf) throw new Error("Wolf-Winter must exist");
    delete exportlessWolf.campaign_exports;
    expect(() => assertOverworldIntegrity(exportless)).toThrow(
      /requires target-quest campaign exports|relief oath must target .* campaign exports/i,
    );

    const retained = structuredClone(world);
    const retainedWolf = retained.quests.find((quest) => quest.id === "wolf_winter");
    const brokenGroup = retainedWolf?.campaign_exports
      ?.flatMap((campaignExport) => campaignExport.conditional_effects ?? [])
      .find((candidate) =>
        candidate.effects.some(
          (effect) =>
            effect.type === "resolve_promise" &&
            effect.promise_id === JUNE_PROMISE &&
            effect.status === "broken",
        ),
      );
    if (!brokenGroup) throw new Error("Wolf-Winter requires one broken June promise export");
    brokenGroup.effects = brokenGroup.effects.filter(
      (effect) => effect.type !== "remove_companion",
    );
    expect(() => assertOverworldIntegrity(retained)).toThrow(
      /breaks field promise.*without releasing its companion/i,
    );

    const dismissed = structuredClone(world);
    const dismissedWolf = dismissed.quests.find((quest) => quest.id === "wolf_winter");
    const keptGroup = dismissedWolf?.campaign_exports
      ?.flatMap((campaignExport) => campaignExport.conditional_effects ?? [])
      .find((candidate) =>
        candidate.effects.some(
          (effect) =>
            effect.type === "resolve_promise" &&
            effect.promise_id === JUNE_PROMISE &&
            effect.status === "kept",
        ),
      );
    if (!keptGroup) throw new Error("Wolf-Winter requires one kept June promise export");
    keptGroup.effects.push({ type: "remove_companion", npc_id: "albany:june_pike" });
    expect(() => assertOverworldIntegrity(dismissed)).toThrow(
      /keeps field promise.*without retaining its companion/i,
    );
  });

  it("authors one joining bond, one negotiated refusal, and a zero-time solo departure", () => {
    expect(ally).toMatchObject({
      id: "albany:wolf_ally_commitment",
      contact: "albany_city__transport_hub__june_pike",
      ally_npc_id: "albany:june_pike",
      solo_option_id: SOLO,
    });
    expect(ally.options.map((option) => [option.id, option.terms.minutes])).toEqual([
      [ACCEPT, 15],
      [RELAY, 5],
      [SOLO, 0],
    ]);

    const accepted = applyOpeningAllyOption({
      scene: ally,
      character: registration.profiles[0]!.character,
      optionId: ACCEPT,
    }).characterAfter;
    expect(accepted.companions).toContain("albany:june_pike");
    expect(accepted.promises).toContainEqual({
      promiseId: "albany:promise_june_cattle_first",
      recipientId: "albany:june_pike",
      status: "active",
    });

    for (const optionId of [RELAY, SOLO]) {
      const declined = applyOpeningAllyOption({
        scene: ally,
        character: registration.profiles[0]!.character,
        optionId,
      }).characterAfter;
      expect(declined.companions).not.toContain("albany:june_pike");
      expect(declined.promises).not.toContainEqual(
        expect.objectContaining({ promiseId: "albany:promise_june_cattle_first" }),
      );
    }

    expect(wolfQuest.discovery).toMatch(/without .*bond.*alone/i);
    expect(
      imports.rules.some(
        (rule) =>
          rule.type === "companion_to_flag" &&
          rule.companion_id === "albany:june_pike" &&
          rule.target_flag === "june_pike_present",
      ),
    ).toBe(true);
    expect(initStateForRpgPack(index, 504).flags.june_pike_present).not.toBe(true);
  });

  it("makes the hidden paling commitment explicit before June permits an ordinary combat line", () => {
    let withJune = act(optionState(ACCEPT), "go_north");
    const boundary = buildRpgObservation(index, withJune);
    expect(boundary.description).toMatch(
      /June holds the north gate[^]*spear funnel[^]*not a living turn[^]*committed first feed cast fouls[^]*brace[^]*pen the yearling alive[^]*any wolf death ends/i,
    );
    expect(actionIds(withJune)).toContain("talk_june_pike_combat_boundary");
    expect(actionIds(withJune)).not.toContain("go_north");
    expect(boundary.blocked_exits).toContainEqual({
      direction: "north",
      message: NORTH_PENDING_GUIDANCE,
    });
    expect(NORTH_PENDING_GUIDANCE).not.toMatch(/June/i);
    expect(NORTH_PENDING_GUIDANCE).toMatch(/hunt-and-hold warning/i);

    withJune = act(withJune, "talk_june_pike_combat_boundary");
    expect(actionIds(withJune)).toEqual(
      expect.arrayContaining(["ask_acknowledge_combat_line", "ask_keep_cattle_terms"]),
    );

    const keepTermsAction = enumerateRpgActions(index, withJune).find(
      (candidate) => candidate.id === "ask_keep_cattle_terms",
    );
    if (!keepTermsAction) throw new Error("June must offer her cattle-terms clarification");
    const keepTermsResult = makeStep(buildRpgRules(index, () => fixedRolls()))(
      withJune,
      keepTermsAction.action,
    );
    expect(keepTermsResult.ok).toBe(true);
    expect(keepTermsResult.events).toEqual([
      {
        type: "state_change",
        effect: "set_var",
        name: "__dlg_june_pike_combat_boundary",
        value: 3,
      },
      {
        type: "narration",
        text: `Road Warden June Pike: "Your cattle-first terms already stand; nothing here commits a plan. Cade waits beside the day-book: settle the feed lure, pack drive, or joined seals with him. Until one is committed, north remains closed."`,
      },
    ]);
    const keepTerms = keepTermsResult.state;
    expect(keepTerms).toEqual({
      ...withJune,
      step: withJune.step + 1,
      vars: { ...withJune.vars, __dlg_june_pike_combat_boundary: 3 },
    });
    expect(buildRpgObservation(index, keepTerms).dialogue).toEqual({
      npc: "june_pike_combat_boundary",
      npc_text:
        "Your cattle-first terms already stand; nothing here commits a plan. Cade waits beside the day-book: settle the feed lure, pack drive, or joined seals with him. Until one is committed, north remains closed.",
    });
    expect(keepTerms.flags.june_combat_line_acknowledged).not.toBe(true);
    expect(actionIds(keepTerms)).not.toContain("go_north");
    expect(actionIds(keepTerms).filter((id) => id.startsWith("ask_"))).toEqual([
      "ask_return_to_cade",
    ]);

    const backWithCade = act(keepTerms, "ask_return_to_cade");
    expect(backWithCade).toEqual({
      ...withJune,
      step: withJune.step + 2,
      vars: { ...withJune.vars, __dlg_june_pike_combat_boundary: 0 },
    });
    expect(actionIds(backWithCade)).not.toContain("go_north");
    expect(actionIds(backWithCade)).toContain("talk_houndsman");
    const askingCade = act(backWithCade, "talk_houndsman");
    expect(actionIds(askingCade)).toEqual(
      expect.arrayContaining(["ask_lure", "ask_drive", "ask_fortify"]),
    );
    expect(actionIds(askingCade)).not.toContain("go_north");
    expect(askingCade.flags.strategy_lure_committed).not.toBe(true);
    expect(askingCade.flags.strategy_drive_committed).not.toBe(true);
    expect(askingCade.flags.strategy_fortify_committed).not.toBe(true);

    let acknowledged = act(withJune, "ask_acknowledge_combat_line");
    expect(acknowledged.flags.june_combat_line_acknowledged).toBe(true);
    expect(acknowledged.flags.june_blood_condition_broken).not.toBe(true);
    expect(acknowledged.journal.at(-1)).toMatch(
      /ordinary rail means combat[^]*without a living plan[^]*first wolf death ends/i,
    );
    expect(buildRpgObservation(index, acknowledged).dialogue).toBeNull();
    expect(actionIds(acknowledged)).toContain("go_north");
    acknowledged = act(acknowledged, "go_north");
    expect(buildRpgObservation(index, acknowledged).description).toMatch(
      /combat funnel[^]*does not turn the wolf alive/i,
    );
    acknowledged = act(acknowledged, "wedge_paling_rail", 20);
    expect(acknowledged.flags.breach_braced).toBe(true);
    expect(actionIds(acknowledged)).not.toContain("wedge_paling_rail");
    expect(
      actionIds(acknowledged).some(
        (id) => id === "attack_yearling_wolf" || id.startsWith("maneuver_yearling_wolf_"),
      ),
    ).toBe(true);

    for (const [route, start] of [
      ["relay refusal", optionState(RELAY)],
      ["explicit solo", optionState(SOLO)],
      ["ignored ally choice", optionState()],
    ] as const) {
      expect(start.flags.june_pike_present, route).not.toBe(true);
      const solo = act(start, "go_north");
      expect(actionIds(solo), route).toContain("go_north");
      expect(actionIds(solo), route).not.toContain("talk_june_pike_combat_boundary");
      expect(buildRpgObservation(index, solo).description, route).not.toMatch(/June Pike/i);
      expect(
        buildRpgObservation(index, solo).blocked_exits.some((exit) => exit.direction === "north"),
        route,
      ).toBe(false);
    }
  });

  it("lets a successful rail recover a fouled lure alive instead of forcing June-breaking blood", () => {
    let state = foulFirstCast(optionState(ACCEPT));
    const scoreBeforeRail = state.vars.score ?? 0;

    state = act(state, "wedge_paling_rail", 20);
    expect(state.flags).toMatchObject({
      lure_trail_fouled: true,
      breach_braced: true,
    });
    expect(state.flags.yearling_redirected).not.toBe(true);
    expect(state.flags.june_blood_condition_broken).not.toBe(true);
    expect(state.vars.score ?? 0).toBe(scoreBeforeRail);
    expect(
      buildRpgObservation(index, state).available_actions.find(
        (option) => option.id === "turn_paling_rail",
      )?.command,
    ).toMatch(/turn.*braced scent-pen/i);

    expect(actionIds(state)).toContain("maneuver_yearling_wolf_commit_hybrid_strike");
    expect(actionIds(state)).not.toContain("attack_yearling_wolf");
    const hybrid = act(state, "maneuver_yearling_wolf_commit_hybrid_strike", 1, 1);
    expect(hybrid.flags.lure_hybrid_combat_entered).toBe(true);
    expect(hybrid.flags.yearling_down).not.toBe(true);
    expect(hybrid.flags.june_blood_condition_broken).not.toBe(true);
    expect(actionIds(hybrid)).toContain("attack_yearling_wolf");
    expect(actionIds(hybrid)).not.toContain("turn_paling_rail");
    expect(buildRpgObservation(index, hybrid).description).toMatch(
      /first spear stroke committed the hybrid line[^]*recoveries are closed/i,
    );

    state = act(state, "turn_paling_rail");
    expect(state.flags).toMatchObject({
      yearling_redirected: true,
      yearling_redirected_with_braced_rail: true,
    });
    expect(state.flags.yearling_redirected_with_split_guard).not.toBe(true);
    expect(state.flags.june_blood_condition_broken).not.toBe(true);
    expect(state.vars.score).toBe(scoreBeforeRail + 10);
    expect(actionIds(state)).not.toContain("attack_yearling_wolf");
    expect(actionIds(state)).not.toContain("turn_paling_rail");

    state = reachLeaderAfterLivingRecovery(state);
    state = act(state, "talk_june_pike");
    state = act(state, "ask_acknowledge");
    state = finishLivingLine(state);
    expect(buildRpgObservation(index, state)).toMatchObject({
      ending_id: "ending_pack_diverted",
    });
    expect(state.flags.june_blood_condition_broken).not.toBe(true);
  });

  it("lets June independently take the cattle line and reverse the same failed-lure outcome", () => {
    let withJune = reachLeaderAfterLivingRecovery(foulAndRecoverAlive(optionState(ACCEPT)));
    let solo = reachLeaderAfterLivingRecovery(foulAndRecoverAlive(optionState(SOLO)));

    expect(withJune.flags.june_pike_present).toBe(true);
    expect(actionIds(withJune)).toContain("talk_june_pike");
    expect(actionIds(withJune)).not.toContain("use_winter_feed_sack_on_outer_scent_gate");
    expect(buildRpgObservation(index, withJune).blocked_actions).toContainEqual(
      expect.objectContaining({
        id: "use_winter_feed_sack_on_outer_scent_gate",
        reason: expect.stringMatching(/authority.*speak to her/i),
      }),
    );
    expect(actionIds(solo)).not.toContain("talk_june_pike");

    withJune = act(withJune, "talk_june_pike");
    expect(withJune.flags.june_cattle_line_taken).toBe(true);
    expect(withJune.vars.cattle_alarm).toBe(2);
    expect(withJune.journal.at(-1)).toMatch(/refuses the wolf line.*falls by 1/i);
    withJune = act(withJune, "ask_acknowledge");

    withJune = finishLivingLine(withJune);
    solo = finishLivingLine(solo);
    expect(withJune.vars.cattle_alarm).toBe(3);
    expect(solo.vars.cattle_alarm).toBe(4);
    expect(buildRpgObservation(index, withJune)).toMatchObject({
      ending_id: "ending_pack_diverted",
    });
    expect(buildRpgObservation(index, withJune).ending?.text).toMatch(
      /June Pike refused the old-grey line.*Albany receives two matching accounts/is,
    );
    expect(buildRpgObservation(index, solo)).toMatchObject({
      ending_id: "ending_pack_diverted_cattle_scattered",
    });
  });

  it("makes the first lure strike irreversible, then breaks June's condition on wolf death", () => {
    const hybridManeuver = pack.enemies
      .find((enemy) => enemy.id === "yearling_wolf")
      ?.maneuvers?.find((maneuver) => maneuver.id === "commit_hybrid_strike");
    expect(hybridManeuver).toMatchObject({
      result_flag: "lure_hybrid_combat_entered",
      attack_bonus: 0,
      defense_bonus: 1,
    });
    expect(hybridManeuver?.conditions).toContainEqual({
      not_flag: "lure_hybrid_combat_entered",
    });

    const freshFoul = foulFirstCast(optionState(ACCEPT));
    expect(actionIds(freshFoul)).toContain("wedge_paling_rail");
    const freshHybrid = act(freshFoul, "maneuver_yearling_wolf_commit_hybrid_strike", 1, 1);
    expect(freshHybrid.flags.lure_hybrid_combat_entered).toBe(true);
    expect(actionIds(freshHybrid)).not.toContain("wedge_paling_rail");

    let state = foulFirstCast(optionState(ACCEPT));
    state = act(state, "wedge_paling_rail", 1);
    state = act(state, "bind_paling_rail");
    expect(actionIds(state)).toContain("use_split_rail_guard_on_downwind_feed_line");
    expect(actionIds(state)).toContain("maneuver_yearling_wolf_commit_hybrid_strike");
    expect(actionIds(state)).not.toContain("attack_yearling_wolf");
    state = act(state, "maneuver_yearling_wolf_commit_hybrid_strike", 1, 1);
    expect(state.flags.lure_hybrid_combat_entered).toBe(true);
    expect(state.flags.yearling_down).not.toBe(true);
    expect(state.flags.june_blood_condition_broken).not.toBe(true);
    expect(actionIds(state)).toContain("attack_yearling_wolf");
    expect(actionIds(state)).not.toContain("bind_paling_rail");
    expect(actionIds(state)).not.toContain("use_split_rail_guard_on_downwind_feed_line");
    state = act(state, "attack_yearling_wolf", 6);
    expect(state.flags.yearling_down).toBe(true);
    expect(state.flags.june_blood_condition_broken).toBe(true);

    state = reachLeaderAfterLivingRecovery(state);
    expect(actionIds(state)).not.toContain("talk_june_pike");
    state = finishLivingLine(state);
    const ending = buildRpgObservation(index, state);
    expect(ending.ending_id).toBe("ending_pack_diverted_after_blood");
    expect(ending.ending?.text).toMatch(/first wolf death ended June Pike's field agreement/i);

    for (const enemyId of ["yearling_wolf", "flank_wolf", "grey_leader"]) {
      const enemy = pack.enemies.find((candidate) => candidate.id === enemyId);
      expect(enemy?.on_defeat).toContainEqual({ set_flag: "june_blood_condition_broken" });
    }
  });
});
