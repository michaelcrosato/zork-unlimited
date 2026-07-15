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

function optionState(optionId: string): GameState {
  const roadWarden = registration.profiles.find((profile) => profile.id === "albany:road_warden");
  if (!roadWarden) throw new Error("Road-Warden registration must exist");
  const character = applyOpeningAllyOption({
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
  state = act(state, "use_paling_rail", 1);
  state = act(state, "use_paling_rail");
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
      .find((candidate) => candidate.effects.some((effect) => effect.type === "resolve_promise"));
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
      delete campaignExport.conditional_effects;
    }
    expect(() => assertOverworldIntegrity(omitted)).toThrow(/leaves field promise.*unresolved/i);

    const exportless = structuredClone(world);
    const exportlessWolf = exportless.quests.find((quest) => quest.id === "wolf_winter");
    if (!exportlessWolf) throw new Error("Wolf-Winter must exist");
    delete exportlessWolf.campaign_exports;
    expect(() => assertOverworldIntegrity(exportless)).toThrow(
      /requires target-quest campaign exports/i,
    );

    const retained = structuredClone(world);
    const retainedWolf = retained.quests.find((quest) => quest.id === "wolf_winter");
    const brokenGroup = retainedWolf?.campaign_exports
      ?.flatMap((campaignExport) => campaignExport.conditional_effects ?? [])
      .find((candidate) =>
        candidate.effects.some(
          (effect) => effect.type === "resolve_promise" && effect.status === "broken",
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
          (effect) => effect.type === "resolve_promise" && effect.status === "kept",
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

  it("breaks June's condition at first blood and removes her action without blocking the hybrid", () => {
    let state = foulFirstCast(optionState(ACCEPT));
    state = act(state, "attack_yearling_wolf", 6, 1);
    state = act(state, "attack_yearling_wolf", 6);
    expect(state.flags.yearling_down).toBe(true);
    expect(state.flags.june_blood_condition_broken).toBe(true);

    state = reachLeaderAfterLivingRecovery(state);
    expect(actionIds(state)).not.toContain("talk_june_pike");
    state = finishLivingLine(state);
    const ending = buildRpgObservation(index, state);
    expect(ending.ending_id).toBe("ending_pack_diverted_after_blood");
    expect(ending.ending?.text).toMatch(/First blood ended June Pike's field agreement/i);

    for (const enemyId of ["yearling_wolf", "flank_wolf", "grey_leader"]) {
      const enemy = pack.enemies.find((candidate) => candidate.id === enemyId);
      expect(enemy?.on_defeat).toContainEqual({ set_flag: "june_blood_condition_broken" });
    }
  });
});
