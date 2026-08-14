import { describe, expect, it } from "vitest";

import { DIALOGUE_VAR_PREFIX } from "../../src/core/dialogue_state.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameEvent } from "../../src/core/events.js";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";
import { compactRpgObservation } from "../../src/mcp/compact_rpg_observation.js";
import { load, save } from "../../src/persist/save_load.js";
import { objectDescription } from "../../src/rpg/model.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { seededOpeningFlagForSeed } from "../../src/rpg/seeded_opening.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("Wolf-Winter must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);

const OPENING_FLAGS = [
  "opening_condition_firm_frozen_rail",
  "opening_condition_steady_scent_channel",
  "opening_condition_open_ash_lane",
  "opening_condition_sound_lower_frame",
] as const;
type OpeningFlag = (typeof OPENING_FLAGS)[number];

const CONDITIONS: Record<
  OpeningFlag,
  { objectName: string; ground: string; plan: "HUNT" | "LURE" | "DRIVE" | "FORTIFY" }
> = {
  opening_condition_firm_frozen_rail: {
    plan: "HUNT",
    objectName: "firm frozen rail — HUNT braces its first rail without a roll",
    ground:
      "TONIGHT'S GROUND — firm frozen rail. HUNT braces its first rail without a roll; wolves and later combat remain.",
  },
  opening_condition_steady_scent_channel: {
    plan: "LURE",
    objectName: "steady scent channel — LURE's first cast runs clean without a roll",
    ground:
      "TONIGHT'S GROUND — steady scent channel. LURE's first cast runs clean without a roll; feed and alarm remain.",
  },
  opening_condition_open_ash_lane: {
    plan: "DRIVE",
    objectName: "open ash lane — DRIVE's first signal runs clean without a roll",
    ground:
      "TONIGHT'S GROUND — open ash lane. DRIVE's first signal runs clean without a roll; charge two and Crisis remain.",
  },
  opening_condition_sound_lower_frame: {
    plan: "FORTIFY",
    objectName: "sound lower frame — FORTIFY's first seal seats without a roll",
    ground:
      "TONIGHT'S GROUND — sound lower frame. FORTIFY's first seal seats without a roll; stance and dawn remain.",
  },
};

const PLAN_IDS = ["ask_hunt", "ask_lure", "ask_drive", "ask_fortify"] as const;

function fixedRng(face: "best" | "worst"): Rng {
  return {
    next: () => (face === "best" ? 0.999999 : 0),
    int: (min, max) => (face === "best" ? max : min),
  };
}

function seedFor(flag: OpeningFlag): number {
  const flags = pack.meta.seeded_opening_flags;
  if (!flags) throw new Error("Wolf-Winter must author seeded opening flags");
  for (let seed = 0; seed < 10_000; seed += 1) {
    if (seededOpeningFlagForSeed(flags, seed) === flag) return seed;
  }
  throw new Error(`No small generic seed selected ${flag}`);
}

function fresh(flag: OpeningFlag): GameState {
  const state = initStateForRpgPack(index, seedFor(flag));
  expect(OPENING_FLAGS.filter((candidate) => state.flags[candidate])).toEqual([flag]);
  return state;
}

function actionIds(state: GameState): string[] {
  return enumerateRpgActions(index, state).map((option) => option.id);
}

function action(state: GameState, id: string) {
  const options = enumerateRpgActions(index, state);
  const option = options.find((candidate) => candidate.id === id);
  expect(
    option,
    `${id} must be legal in ${state.current}; legal=${options
      .map((candidate) => candidate.id)
      .join(",")}`,
  ).toBeDefined();
  if (!option) throw new Error(`Missing action ${id}`);
  return option;
}

function act(state: GameState, id: string, face: "best" | "worst" = "best"): GameState {
  const option = action(state, id);
  const result = makeStep(buildRpgRules(index, () => fixedRng(face)))(state, option.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  if (!result.ok) throw new Error(`Rejected action ${id}`);
  return result.state;
}

function perform(
  state: GameState,
  id: string,
  face: "best" | "worst" = "best",
): { state: GameState; events: GameEvent[] } {
  const option = action(state, id);
  const result = makeStep(buildRpgRules(index, () => fixedRng(face)))(state, option.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  if (!result.ok) throw new Error(`Rejected action ${id}`);
  return { state: result.state, events: result.events };
}

function narration(events: readonly GameEvent[]): string {
  return events.flatMap((event) => (event.type === "narration" ? [event.text] : [])).join("\n");
}

function actCounting(state: GameState, id: string): { state: GameState; rngCalls: number } {
  const option = action(state, id);
  let rngCalls = 0;
  const rng: Rng = {
    next: () => {
      rngCalls += 1;
      return 0;
    },
    int: (min) => {
      rngCalls += 1;
      return min;
    },
  };
  const result = makeStep(buildRpgRules(index, () => rng))(state, option.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  if (!result.ok) throw new Error(`Rejected action ${id}`);
  return { state: result.state, rngCalls };
}

function durableState(state: GameState): Omit<GameState, "step"> {
  const { step: _step, vars, ...rest } = state;
  return {
    ...rest,
    vars: Object.fromEntries(
      Object.entries(vars).filter(([name]) => !name.startsWith(DIALOGUE_VAR_PREFIX)),
    ),
  };
}

function reachCade(flag: OpeningFlag): GameState {
  let state = fresh(flag);
  state = act(state, "go_north");
  return act(state, "talk_houndsman");
}

function prepareHunt(flag: OpeningFlag): GameState {
  let state = reachCade(flag);
  state = act(state, "ask_hunt");
  state = act(state, "ask_prepare_hunt");
  return act(state, "go_north");
}

function prepareLure(flag: OpeningFlag): GameState {
  let state = reachCade(flag);
  state = act(state, "ask_lure");
  state = act(state, "ask_commit_lure");
  state = act(state, "ask_leave");
  state = act(state, "go_west");
  state = act(state, "take_winter_feed_sack");
  state = act(state, "go_east");
  return act(state, "go_north");
}

function prepareDrive(flag: OpeningFlag): GameState {
  let state = reachCade(flag);
  state = act(state, "ask_drive");
  state = act(state, "ask_commit_drive");
  state = act(state, "ask_leave");
  state = act(state, "take_drive_signal_rope_kit");
  return act(state, "go_north");
}

function prepareFortify(flag: OpeningFlag): GameState {
  let state = reachCade(flag);
  state = act(state, "ask_fortify");
  state = act(state, "ask_commit_cade_terms");
  state = act(state, "ask_leave");
  state = act(state, "take_cade_household_shutters");
  return act(state, "go_north");
}

function prepareFortifyAuthority(flag: OpeningFlag): GameState {
  let state = reachCade(flag);
  state = act(state, "ask_fortify");
  state = act(state, "ask_commit_albany_authority");
  state = act(state, "ask_leave");
  state = act(state, "take_albany_relief_seals");
  return act(state, "go_north");
}

function hasFlagCondition(
  conditions: unknown,
  kind: "has_flag" | "not_flag",
  flag: string,
): boolean {
  if (Array.isArray(conditions)) {
    return conditions.some((condition) => hasFlagCondition(condition, kind, flag));
  }
  if (conditions === null || typeof conditions !== "object") return false;
  const condition = conditions as Record<string, unknown>;
  if (condition[kind] === flag) return true;
  return Object.values(condition).some((value) => hasFlagCondition(value, kind, flag));
}

function changedTrueFlags(before: GameState, after: GameState): string[] {
  return Object.keys(after.flags)
    .filter((flag) => after.flags[flag] && !before.flags[flag])
    .sort();
}

function changedVars(before: GameState, after: GameState): Record<string, number> {
  return Object.fromEntries(
    Object.entries(after.vars).filter(([name, value]) => before.vars[name] !== value),
  );
}

function comparableBaseline(state: GameState): Omit<GameState, "seed" | "flags"> & {
  flags: Record<string, boolean>;
} {
  const { seed: _seed, flags, ...rest } = state;
  return {
    ...rest,
    flags: Object.fromEntries(
      Object.entries(flags).filter(
        ([flag]) => !(OPENING_FLAGS as readonly string[]).includes(flag),
      ),
    ),
  };
}

function dialogueSurface(state: GameState): {
  full: ReturnType<typeof buildRpgObservation>;
  compact: ReturnType<typeof compactRpgObservation>;
  text: string;
} {
  const full = buildRpgObservation(index, state);
  const compact = compactRpgObservation(full, full.available_actions, { includeActions: true });
  const text = full.dialogue?.npc_text ?? "";
  expect(compact.dialogue?.[1]).toBe(text.trimEnd());
  return { full, compact, text };
}

describe("Wolf-Winter seeded field conditions", () => {
  it("authors the four conditions in stable order and discloses each before a peer plan choice", () => {
    expect(pack.meta.seeded_opening_flags).toEqual(OPENING_FLAGS);

    for (const flag of OPENING_FLAGS) {
      const expected = CONDITIONS[flag];
      let state = fresh(flag);
      const start = buildRpgObservation(index, state);
      expect(start.visible_objects).toContainEqual({
        id: "steading_field_condition",
        name: expected.objectName,
      });
      expect(
        compactRpgObservation(start, start.available_actions, { includeActions: true }).objects,
      ).toContain("steading_field_condition");

      state = act(state, "go_north");
      const yard = buildRpgObservation(index, state);
      expect(yard.visible_objects).toContainEqual({
        id: "byre_field_condition",
        name: expected.objectName,
      });
      state = act(state, "talk_houndsman");
      const full = buildRpgObservation(index, state);
      const compact = compactRpgObservation(full, full.available_actions, {
        includeActions: true,
      });
      expect(full.dialogue?.npc_text).toContain(expected.ground);
      expect(full.dialogue?.npc_text.length).toBeLessThanOrEqual(360);
      expect(compact.dialogue).toEqual(["houndsman", full.dialogue?.npc_text]);
      expect(compact.dialogue?.[1]).toContain("TONIGHT'S GROUND —");
      expect(full.available_actions.map((candidate) => candidate.id).slice(0, 4)).toEqual(PLAN_IDS);

      const bytes = save(state, loaded.compiled.contentHash, "rpg", {
        worldQuestId: "wolf_winter",
      });
      const restored = load(bytes, loaded.compiled.contentHash, "rpg").state;
      expect(OPENING_FLAGS.filter((candidate) => restored.flags[candidate])).toEqual([flag]);
      expect(buildRpgObservation(index, restored).dialogue?.npc_text).toBe(full.dialogue?.npc_text);
      expect(
        compactRpgObservation(
          buildRpgObservation(index, restored),
          enumerateRpgActions(index, restored),
          { includeActions: true },
        ).dialogue,
      ).toEqual(compact.dialogue);
    }
  });

  it("keeps all four root cards as non-mutating inspections with honest return and pivot grammar", () => {
    const root = reachCade("opening_condition_firm_frozen_rail");
    const cases = [
      ["ask_hunt", "ask_hunt_back"],
      ["ask_lure", "ask_lure_back"],
      ["ask_drive", "ask_drive_back"],
      ["ask_fortify", "ask_fortify_back"],
    ] as const;

    for (const [inspectId, returnId] of cases) {
      const before = durableState(root);
      let inspected = act(structuredClone(root), inspectId);
      expect(durableState(inspected), inspectId).toEqual(before);
      expect(inspected.flags.strategy_lure_committed, inspectId).not.toBe(true);
      expect(inspected.flags.strategy_drive_committed, inspectId).not.toBe(true);
      expect(inspected.flags.strategy_fortify_committed, inspectId).not.toBe(true);
      expect(actionIds(inspected), inspectId).toContain(returnId);
      inspected = act(inspected, returnId);
      expect(actionIds(inspected).slice(0, 4), inspectId).toEqual(PLAN_IDS);
    }

    let hunt = act(structuredClone(root), "ask_hunt");
    expect(action(hunt, "ask_prepare_hunt").command).toMatch(
      /^ask: LEAVE REVIEW — HUNT:[^]*no state change[^]*FINAL COMMITMENT[^]*cross north[^]*RELEASE JUNE if offered/i,
    );
    hunt = act(hunt, "ask_prepare_hunt");
    expect(actionIds(hunt)).toContain("go_north");
    expect(hunt.visited.paling_gap).not.toBe(true);
    hunt = act(hunt, "go_north");
    expect(hunt.current).toBe("paling_gap");
    hunt = act(hunt, "go_south");
    hunt = act(hunt, "talk_houndsman");
    expect(buildRpgObservation(index, hunt).dialogue?.npc_text).not.toContain("TONIGHT'S GROUND —");
    for (const closed of ["ask_lure", "ask_drive", "ask_fortify"]) {
      expect(actionIds(hunt)).not.toContain(closed);
    }
  });

  it("retires the ground append from every committed plan status", () => {
    let lure = reachCade("opening_condition_steady_scent_channel");
    lure = act(lure, "ask_lure");
    lure = act(lure, "ask_commit_lure");
    lure = act(lure, "ask_lure_back");

    let drive = reachCade("opening_condition_open_ash_lane");
    drive = act(drive, "ask_drive");
    drive = act(drive, "ask_commit_drive");

    let fortify = reachCade("opening_condition_sound_lower_frame");
    fortify = act(fortify, "ask_fortify");
    fortify = act(fortify, "ask_commit_cade_terms");

    for (const state of [lure, drive, fortify]) {
      expect(buildRpgObservation(index, state).dialogue?.npc_text).not.toContain(
        "TONIGHT'S GROUND —",
      );
    }
  });

  it("gives only the matching strategy a no-roll first beat", () => {
    let hunt = prepareHunt("opening_condition_firm_frozen_rail");
    const huntBefore = structuredClone(hunt);
    expect(action(hunt, "brace_paling_rail").skill_check).toBeUndefined();
    const huntBeat = actCounting(hunt, "brace_paling_rail");
    hunt = huntBeat.state;
    expect(huntBeat.rngCalls).toBe(0);
    expect(changedTrueFlags(huntBefore, hunt)).toEqual(["breach_braced", "rail_attempted"]);
    expect(changedVars(huntBefore, hunt)).toEqual({});
    expect(hunt.flags).toMatchObject({ rail_attempted: true, breach_braced: true });
    expect(hunt.flags.rail_split).not.toBe(true);
    const resolvedRail = index.objects.get("paling_rail");
    if (!resolvedRail) throw new Error("Missing paling rail");
    expect(objectDescription(resolvedRail, hunt)).toMatch(/set hard across the breach/i);
    expect(objectDescription(resolvedRail, hunt)).not.toMatch(/wedg/i);
    const postBrace = buildRpgObservation(index, hunt);
    expect(postBrace.description).toMatch(/set hard across it/i);
    expect(postBrace.description).not.toMatch(/wedg/i);
    expect(postBrace.enemies_present.map((enemy) => enemy.id)).toEqual(["yearling_wolf"]);

    let lure = prepareLure("opening_condition_steady_scent_channel");
    const lureBefore = structuredClone(lure);
    expect(action(lure, "use_winter_feed_sack_on_downwind_feed_line").skill_check).toBeUndefined();
    const lureBeat = actCounting(lure, "use_winter_feed_sack_on_downwind_feed_line");
    lure = lureBeat.state;
    expect(lureBeat.rngCalls).toBe(0);
    expect(changedTrueFlags(lureBefore, lure)).toEqual(["yearling_redirected"]);
    expect(changedVars(lureBefore, lure)).toEqual({ cattle_alarm: 1, score: 10 });
    expect(lure.questStage).toEqual({ ...lureBefore.questStage, the_watch: "breach_redirected" });
    expect(lure.flags.yearling_redirected).toBe(true);
    expect(lure.flags.lure_trail_fouled).not.toBe(true);
    expect(lure.vars.cattle_alarm).toBe(1);
    expect(lure.inventory).toContain("winter_feed_sack");

    let ridgeLure = fresh("opening_condition_steady_scent_channel");
    ridgeLure = {
      ...ridgeLure,
      flags: { ...ridgeLure.flags, approach_exposed_ridge: true },
    };
    ridgeLure = act(ridgeLure, "use_exposed_ridge_last_mile");
    ridgeLure = act(ridgeLure, "talk_houndsman");
    ridgeLure = act(ridgeLure, "ask_lure");
    ridgeLure = act(ridgeLure, "ask_commit_lure");
    ridgeLure = act(ridgeLure, "ask_leave");
    ridgeLure = act(ridgeLure, "go_west");
    ridgeLure = act(ridgeLure, "take_winter_feed_sack");
    ridgeLure = act(ridgeLure, "go_east");
    ridgeLure = act(ridgeLure, "go_north");
    expect(ridgeLure.vars.cattle_alarm).toBe(1);
    const ridgeBeat = perform(ridgeLure, "use_winter_feed_sack_on_downwind_feed_line", "worst");
    expect(ridgeBeat.state.vars.cattle_alarm).toBe(2);
    expect(ridgeBeat.state.journal.at(-1)).toMatch(/cast adds 1[^]*arrival's prior 1[^]*alarm 2/i);
    expect(narration(ridgeBeat.events)).toMatch(
      /arrival already stirred the herd once[^]*cast adds its ordinary second alarm beat[^]*alarm is now 2/i,
    );

    let drive = prepareDrive("opening_condition_open_ash_lane");
    const driveBefore = structuredClone(drive);
    expect(
      action(drive, "use_drive_signal_rope_kit_on_drive_breach_signal").skill_check,
    ).toBeUndefined();
    const driveBeat = actCounting(drive, "use_drive_signal_rope_kit_on_drive_breach_signal");
    drive = driveBeat.state;
    expect(driveBeat.rngCalls).toBe(0);
    expect(changedTrueFlags(driveBefore, drive)).toEqual(["drive_yearling_turned"]);
    expect(changedVars(driveBefore, drive)).toEqual({ drive_kit_charges: 1, pack_drive: 1 });
    expect(drive.questStage).toEqual({ ...driveBefore.questStage, the_watch: "breach_redirected" });
    expect(drive.flags.drive_yearling_turned).toBe(true);
    expect(drive.flags.drive_opening_fouled).not.toBe(true);
    expect(drive.vars).toMatchObject({ drive_kit_charges: 1, pack_drive: 1 });

    let fortify = prepareFortify("opening_condition_sound_lower_frame");
    const fortifyBefore = structuredClone(fortify);
    expect(
      action(fortify, "use_cade_household_shutters_on_fortify_outer_seal").skill_check,
    ).toBeUndefined();
    const fortifyBeat = actCounting(fortify, "use_cade_household_shutters_on_fortify_outer_seal");
    fortify = fortifyBeat.state;
    expect(fortifyBeat.rngCalls).toBe(0);
    expect(changedTrueFlags(fortifyBefore, fortify)).toEqual([
      "fortify_outer_seal_attempted",
      "fortify_outer_sealed",
    ]);
    expect(changedVars(fortifyBefore, fortify)).toEqual({ fortification_pressure: 1 });
    expect(fortify.questStage).toEqual({ ...fortifyBefore.questStage, the_watch: "outer_sealed" });
    expect(fortify.flags).toMatchObject({
      fortify_outer_seal_attempted: true,
      fortify_outer_sealed: true,
      fortify_outer_property_exposed: true,
      fortify_public_seals_preserved: true,
    });
    expect(fortify.flags.fortify_outer_seal_failed).not.toBe(true);
    expect(fortify.vars.fortification_pressure).toBe(1);
  });

  it("keeps nonmatching first beats rolled and preserves their failure branches", () => {
    let hunt = prepareHunt("opening_condition_sound_lower_frame");
    expect(action(hunt, "wedge_paling_rail").skill_check).toBeDefined();
    expect(actionIds(hunt)).not.toContain("brace_paling_rail");
    hunt = act(hunt, "wedge_paling_rail", "worst");
    expect(hunt.flags.rail_split).toBe(true);

    let lure = prepareLure("opening_condition_firm_frozen_rail");
    expect(action(lure, "use_winter_feed_sack_on_downwind_feed_line").skill_check).toBeDefined();
    lure = act(lure, "use_winter_feed_sack_on_downwind_feed_line", "worst");
    expect(lure.flags.lure_trail_fouled).toBe(true);
    expect(lure.vars.cattle_alarm).toBe(2);

    let drive = prepareDrive("opening_condition_steady_scent_channel");
    expect(
      action(drive, "use_drive_signal_rope_kit_on_drive_breach_signal").skill_check,
    ).toBeDefined();
    drive = act(drive, "use_drive_signal_rope_kit_on_drive_breach_signal", "worst");
    expect(drive.flags.drive_opening_fouled).toBe(true);
    expect(drive.vars).toMatchObject({ drive_kit_charges: 1, pack_drive: 2 });

    let fortify = prepareFortify("opening_condition_open_ash_lane");
    expect(
      action(fortify, "use_cade_household_shutters_on_fortify_outer_seal").skill_check,
    ).toBeDefined();
    fortify = act(fortify, "use_cade_household_shutters_on_fortify_outer_seal", "worst");
    expect(fortify.flags.fortify_outer_seal_failed).toBe(true);
    expect(fortify.vars.fortification_pressure).toBe(2);
  });

  it("keeps the matching branch conditions exact and rolled branches explicitly excluded", () => {
    const cases = [
      ["paling_rail", "opening_condition_firm_frozen_rail", 1, 2],
      ["downwind_feed_line", "opening_condition_steady_scent_channel", 4, 4],
      ["drive_breach_signal", "opening_condition_open_ash_lane", 1, 2],
      ["fortify_outer_seal", "opening_condition_sound_lower_frame", 2, 6],
    ] as const;

    for (const [objectId, flag, noRollCount, rolledCount] of cases) {
      const object = index.objects.get(objectId);
      if (!object) throw new Error(`Missing object ${objectId}`);
      const noRoll = object.interactions.filter(
        (interaction) =>
          interaction.skill_check === undefined &&
          hasFlagCondition(interaction.conditions, "has_flag", flag),
      );
      const rolled = object.interactions.filter(
        (interaction) =>
          interaction.skill_check !== undefined &&
          hasFlagCondition(interaction.conditions, "not_flag", flag),
      );
      expect(noRoll, objectId).toHaveLength(noRollCount);
      expect(rolled, objectId).toHaveLength(rolledCount);
    }
  });

  it("preserves downstream route costs and existing ending identities", () => {
    let lure = prepareLure("opening_condition_steady_scent_channel");
    lure = act(lure, "use_winter_feed_sack_on_downwind_feed_line", "worst");
    for (const id of [
      "go_south",
      "go_west",
      "go_up",
      "use_winter_feed_sack_on_loft_hatch",
      "go_east",
      "go_north",
      "use_winter_feed_sack_on_outer_scent_gate",
      "go_north",
    ]) {
      lure = act(lure, id);
    }
    expect(lure.endingId).toBe("ending_pack_diverted");
    expect(lure.inventory).not.toContain("winter_feed_sack");
    expect(lure.vars.cattle_alarm).toBe(3);
    expect(buildRpgObservation(index, lure).ending?.text).toMatch(/finite winter feed is gone/i);
    expect(lure.flags.breach_braced).not.toBe(true);

    let drive = prepareDrive("opening_condition_open_ash_lane");
    drive = act(drive, "use_drive_signal_rope_kit_on_drive_breach_signal", "worst");
    drive = act(drive, "go_north");
    drive = act(drive, "use_drive_signal_rope_kit_on_drive_threshold_line");
    drive = act(drive, "go_north");
    expect(actionIds(drive)).toEqual(
      expect.arrayContaining([
        "use_cattle_crisis_priority",
        "use_person_crisis_priority",
        "use_reserve_crisis_priority",
      ]),
    );
    drive = act(drive, "use_reserve_crisis_priority");
    expect(drive.inventory).not.toContain("drive_signal_rope_kit");
    drive = act(drive, "use_reserve_spent_evacuation");
    expect(drive.endingId).toBe("ending_drive_reserve_spent");
    expect(buildRpgObservation(index, drive).ending?.text).toMatch(/outer steading[^]*abandoned/i);

    let fortify = prepareFortify("opening_condition_sound_lower_frame");
    fortify = act(fortify, "use_cade_household_shutters_on_fortify_outer_seal", "worst");
    fortify = act(fortify, "go_north");
    fortify = act(fortify, "use_cade_household_shutters_on_fortify_threshold_seal");
    fortify = act(fortify, "go_north");
    fortify = act(fortify, "use_fortify_dawn_watch");
    expect(fortify.endingId).toBe("ending_fortified_cade_terms");
    expect(fortify.inventory).not.toContain("cade_household_shutters");
    expect(fortify.flags).toMatchObject({
      fortify_outer_property_exposed: true,
      fortify_public_seals_preserved: true,
      fortify_dawn_held: true,
    });
    expect(fortify.vars.fortification_pressure).toBe(6);

    let hunt = prepareHunt("opening_condition_firm_frozen_rail");
    hunt = act(hunt, "brace_paling_rail");
    for (const [enemy, defeatFlag] of [
      ["yearling_wolf", "yearling_down"],
      ["flank_wolf", "flank_wolf_down"],
      ["grey_leader", "leader_down"],
    ] as const) {
      for (let guard = 0; guard < 12 && !hunt.flags[defeatFlag]; guard += 1) {
        const ids = actionIds(hunt);
        const opening = ids.find((id) => id.startsWith(`maneuver_${enemy}_`));
        const strike = ids.includes(`attack_${enemy}`) ? `attack_${enemy}` : opening;
        if (!strike) throw new Error(`No legal ${enemy} combat action`);
        if (strike === "maneuver_flank_wolf_funnel_thrust") {
          const funnel = perform(hunt, strike, "best");
          expect(narration(funnel.events)).toMatch(/braced rail narrows/i);
          expect(narration(funnel.events)).not.toMatch(/wedg/i);
          hunt = funnel.state;
        } else {
          hunt = act(hunt, strike, "best");
        }
      }
      expect(hunt.flags[defeatFlag]).toBe(true);
      hunt = act(hunt, "go_north");
    }
    expect(hunt.endingId).toBe("ending_held");
    expect(hunt.flags).toMatchObject({
      yearling_down: true,
      flank_wolf_down: true,
      leader_down: true,
    });
  });

  it("keeps every nonmatching strategy byte-equivalent apart from the selected opening identity", () => {
    const compare = (left: GameState, right: GameState): void => {
      expect(comparableBaseline(left)).toEqual(comparableBaseline(right));
    };

    const cases: Array<{
      matching: OpeningFlag;
      run: (flag: OpeningFlag) => GameState;
    }> = [
      {
        matching: "opening_condition_firm_frozen_rail",
        run: (flag) => act(prepareHunt(flag), "wedge_paling_rail", "worst"),
      },
      {
        matching: "opening_condition_steady_scent_channel",
        run: (flag) =>
          act(prepareLure(flag), "use_winter_feed_sack_on_downwind_feed_line", "worst"),
      },
      {
        matching: "opening_condition_open_ash_lane",
        run: (flag) =>
          act(prepareDrive(flag), "use_drive_signal_rope_kit_on_drive_breach_signal", "worst"),
      },
      {
        matching: "opening_condition_sound_lower_frame",
        run: (flag) =>
          act(prepareFortify(flag), "use_cade_household_shutters_on_fortify_outer_seal", "worst"),
      },
    ];

    for (const { matching, run } of cases) {
      const nonmatching = OPENING_FLAGS.filter((flag) => flag !== matching);
      const reference = run(nonmatching[0]!);
      for (const flag of nonmatching.slice(1)) compare(run(flag), reference);
    }
  });

  it("preserves firm-rail LURE's ordinary and Works failed-cast recoveries", () => {
    let ordinary = prepareLure("opening_condition_firm_frozen_rail");
    ordinary = act(ordinary, "use_winter_feed_sack_on_downwind_feed_line", "worst");
    const wedge = action(ordinary, "wedge_paling_rail");
    expect(wedge.skill_check).toMatchObject({ skill: "defense", difficulty: 11 });
    expect(actionIds(ordinary)).not.toContain("brace_paling_rail");
    ordinary = act(ordinary, "wedge_paling_rail", "worst");
    expect(ordinary.flags).toMatchObject({ rail_attempted: true, rail_split: true });
    expect(actionIds(ordinary)).toContain("bind_paling_rail");

    let works = prepareLure("opening_condition_firm_frozen_rail");
    works = { ...works, flags: { ...works.flags, works_fortification_prepared: true } };
    works = act(works, "use_winter_feed_sack_on_downwind_feed_line", "worst");
    const set = action(works, "set_paling_rail");
    expect(set.skill_check).toMatchObject({ skill: "repair", difficulty: 12 });
    expect(actionIds(works)).not.toContain("brace_paling_rail");
    works = act(works, "set_paling_rail", "worst");
    expect(works.flags).toMatchObject({
      rail_attempted: true,
      works_fortification_splice_needed: true,
    });
    expect(actionIds(works)).toContain("splice_paling_rail");
  });

  it("keeps sound-frame FORTIFY prose truthful across both stances and imported support", () => {
    for (const stance of ["cade", "albany"] as const) {
      for (const withSupport of [false, true]) {
        let state =
          stance === "cade"
            ? prepareFortify("opening_condition_sound_lower_frame")
            : prepareFortifyAuthority("opening_condition_sound_lower_frame");
        if (withSupport) {
          state = {
            ...state,
            flags: {
              ...state.flags,
              relief_oath_full_duty: true,
              works_fortification_prepared: true,
            },
          };
        }
        const full = buildRpgObservation(index, state);
        const compact = compactRpgObservation(full, full.available_actions, {
          includeActions: true,
        });
        const seal = index.objects.get("fortify_outer_seal");
        if (!seal) throw new Error("Missing fortify outer seal");
        expect(full.description).toMatch(/sound lower frame[^]*without a Repair roll/i);
        expect(full.description).not.toMatch(
          /lower the shown Repair difficulty|a miss cannot retry/i,
        );
        expect(compact.text).toBe(full.description.trimEnd());
        expect(objectDescription(seal, state)).toMatch(/sound lower frame[^]*without a roll/i);
        expect(objectDescription(seal, state)).not.toMatch(/DC 10|DC 12|DC 14|miss/i);
      }
    }

    let support = fresh("opening_condition_sound_lower_frame");
    support = {
      ...support,
      vars: { ...support.vars, fieldcraft: 4 },
      flags: {
        ...support.flags,
        relief_oath_full_duty: true,
        works_fortification_prepared: true,
      },
    };
    support = act(support, "go_north");
    support = act(support, "talk_houndsman");
    const supportResult = perform(support, "ask_current_support");
    const text = narration(supportResult.events);
    expect(text).toMatch(/sound lower frame[^]*without a roll/i);
    expect(text).not.toContain("FORTIFY still rolls Repair");
    expect(text).not.toContain("Full Compact lowers the first Albany-authority FORTIFY seat by 2");
    expect(text).not.toContain("Works makes Cade's first FORTIFY seat DC 12");

    let nonFirm = fresh("opening_condition_open_ash_lane");
    nonFirm = {
      ...nonFirm,
      flags: { ...nonFirm.flags, works_fortification_prepared: true },
    };
    nonFirm = act(nonFirm, "go_north");
    nonFirm = act(nonFirm, "talk_houndsman");
    const nonFirmResult = perform(nonFirm, "ask_current_support");
    const nonFirmText = narration(nonFirmResult.events);
    expect(nonFirmText).toContain("If tonight's ground is the firm frozen rail");
    expect(nonFirmText).not.toContain("Tonight's firm frozen rail");
  });

  it("keeps matching plan decisions truthful with mixed support in full and compact views", () => {
    let scent = fresh("opening_condition_steady_scent_channel");
    scent = {
      ...scent,
      vars: { ...scent.vars, fieldcraft: 4 },
      flags: { ...scent.flags, approach_exposed_ridge: true },
    };
    const scentStart = buildRpgObservation(index, scent);
    expect(scentStart.description).toMatch(
      /ordinarily easing LURE's first feed cast[^]*tonight-ground fact can supersede/i,
    );
    scent = act(scent, "use_exposed_ridge_last_mile");
    scent = act(scent, "talk_houndsman");
    expect(action(scent, "ask_lure").command).toMatch(/ordinary first-cast foul/i);
    scent = act(scent, "ask_lure");
    const scentPlan = dialogueSurface(scent);
    expect(scentPlan.text).toMatch(/Tonight's steady scent channel[^]*cannot foul[^]*no roll/i);
    expect(scentPlan.text).toMatch(/finite feed[^]*alarm[^]*later casts/i);
    scent = act(scent, "ask_lure_back");
    const scentSupport = perform(scent, "ask_current_support");
    expect(narration(scentSupport.events)).toMatch(
      /Fieldcraft 4[^]*supplies DRIVE checks[^]*steady scent channel removes LURE's first check/i,
    );
    expect(narration(scentSupport.events)).not.toMatch(/supplies (?:the )?DRIVE\/LURE checks/i);

    let ash = fresh("opening_condition_open_ash_lane");
    ash = {
      ...ash,
      vars: { ...ash.vars, fieldcraft: 4 },
      flags: {
        ...ash.flags,
        relief_oath_unaffiliated_bond: true,
        june_pike_present: true,
      },
    };
    ash = act(ash, "go_north");
    ash = act(ash, "talk_houndsman");
    ash = act(ash, "ask_drive");
    const ashPlan = dialogueSurface(ash);
    expect(ashPlan.text).toMatch(/open ash lane[^]*clean no-roll signal/i);
    expect(ashPlan.text).toMatch(/ordinary first miss[^]*hurdle recovery/i);
    expect(ashPlan.text).toMatch(/Crisis: wound\/two cattle\/rig/i);
    ash = act(ash, "ask_commit_drive");
    const ashCommitted = dialogueSurface(ash);
    expect(ashCommitted.text).toMatch(
      /first call clean without a roll[^]*hurdle recovery is not needed/i,
    );
    expect(ashCommitted.text).toMatch(/rope-bell[^]*unchanged Crisis/i);

    let ashSupport = fresh("opening_condition_open_ash_lane");
    ashSupport = { ...ashSupport, vars: { ...ashSupport.vars, fieldcraft: 4 } };
    ashSupport = act(ashSupport, "go_north");
    ashSupport = act(ashSupport, "talk_houndsman");
    const ashSupportResult = perform(ashSupport, "ask_current_support");
    expect(narration(ashSupportResult.events)).toMatch(
      /Fieldcraft 4[^]*supplies LURE checks[^]*open ash lane removes DRIVE's first check/i,
    );
    expect(narration(ashSupportResult.events)).not.toMatch(/supplies (?:the )?DRIVE\/LURE checks/i);
  });

  it("keeps sound-frame inspect, both commitments, root status, and Albany execution aligned", () => {
    const supportedRoot = (): GameState => {
      let state = fresh("opening_condition_sound_lower_frame");
      state = {
        ...state,
        flags: {
          ...state.flags,
          relief_oath_full_duty: true,
          works_fortification_prepared: true,
        },
      };
      state = act(state, "go_north");
      return act(state, "talk_houndsman");
    };

    let cade = act(supportedRoot(), "ask_fortify");
    const cadeInspect = dialogueSurface(cade);
    expect(cadeInspect.text).toMatch(/SOUND-FRAME FORTIFY[^]*without a roll/i);
    expect(cadeInspect.text).not.toMatch(/first DC|failed seal|recovered miss/i);
    expect(action(cade, "ask_commit_cade_terms").command).toMatch(/roll-required failed seat/i);
    cade = act(cade, "ask_commit_cade_terms");
    const cadeCommit = dialogueSurface(cade);
    expect(cadeCommit.text).toMatch(/sound lower frame[^]*cleanly/i);
    expect(cadeCommit.text).not.toMatch(/failed first seat|first-seat|Repair opening|DC \d/i);
    cade = act(cade, "ask_leave");
    cade = act(cade, "talk_houndsman");
    const cadeStatus = dialogueSurface(cade);
    expect(cadeStatus.text).toMatch(/sound lower frame[^]*seats the first cleanly/i);
    expect(cadeStatus.text).not.toMatch(/failed first seat|first seat slips|emergency strip/i);

    let albany = act(supportedRoot(), "ask_fortify");
    expect(action(albany, "ask_commit_albany_authority").command).toMatch(
      /roll-required failed seat/i,
    );
    albany = act(albany, "ask_commit_albany_authority");
    const albanyCommit = dialogueSurface(albany);
    expect(albanyCommit.text).toMatch(/sound lower frame[^]*cleanly/i);
    expect(albanyCommit.text).toMatch(/ordinary lower-peg DC benefit/i);
    expect(albanyCommit.text).not.toMatch(/failed first seat|first-seat slip|Repair opening by 2/i);
    albany = act(albany, "ask_leave");
    albany = act(albany, "talk_houndsman");
    const albanyStatus = dialogueSurface(albany);
    expect(albanyStatus.text).toMatch(/sound lower frame[^]*seats the first band cleanly/i);
    expect(albanyStatus.text).not.toMatch(/failed first seat|first seat slips/i);

    let execution = supportedRoot();
    execution = act(execution, "ask_fortify");
    execution = act(execution, "ask_commit_albany_authority");
    execution = act(execution, "ask_leave");
    execution = act(execution, "take_albany_relief_seals");
    execution = act(execution, "go_north");
    const before = structuredClone(execution);
    const beat = actCounting(execution, "use_albany_relief_seals_on_fortify_outer_seal");
    expect(beat.rngCalls).toBe(0);
    expect(changedTrueFlags(before, beat.state)).toEqual([
      "fortify_outer_seal_attempted",
      "fortify_outer_sealed",
    ]);
    expect(changedVars(before, beat.state)).toEqual({ fortification_pressure: 1 });
    expect(beat.state.flags).toMatchObject({
      fortify_albany_authority_invoked: true,
      fortify_outer_property_preserved: true,
      fortify_cade_help_refused: true,
      fortify_outer_seal_attempted: true,
      fortify_outer_sealed: true,
    });
    expect(beat.state.flags.fortify_authority_emergency_seal_spent).not.toBe(true);
  });

  it("keeps firm-field Hayden and Works guidance aligned with the only legal first rail action", () => {
    for (const withWorks of [false, true]) {
      let state = fresh("opening_condition_firm_frozen_rail");
      state = {
        ...state,
        flags: {
          ...state.flags,
          hayden_frost_report_certified: true,
          ...(withWorks ? { works_fortification_prepared: true } : {}),
        },
      };
      state = act(state, "go_north");
      const yard = buildRpgObservation(index, state);
      const yardCompact = compactRpgObservation(yard, yard.available_actions, {
        includeActions: true,
      });
      expect(yard.description).toMatch(/firm frozen rail[^]*one clean first brace/i);
      expect(yard.description).toMatch(/Works does not replace or remove it/i);
      expect(yard.description).toMatch(/Hayden's separate later byre-jamb route/i);
      expect(yard.description).not.toMatch(/\bJune\b/i);
      expect(yard.available_actions.map((candidate) => candidate.id)).not.toContain(
        "talk_june_pike",
      );
      expect(yard.description).not.toMatch(
        /attempt the public wedge|leave (?:its )?lengths unbound/i,
      );
      expect(yardCompact.text).toBe(yard.description.trimEnd());

      state = act(state, "talk_houndsman");
      state = act(state, "ask_hunt");
      state = act(state, "ask_prepare_hunt");
      state = act(state, "go_north");
      expect(actionIds(state)).toContain("brace_paling_rail");
      expect(actionIds(state)).not.toEqual(
        expect.arrayContaining(["set_paling_rail", "wedge_paling_rail"]),
      );
      const full = buildRpgObservation(index, state);
      const compact = compactRpgObservation(full, full.available_actions, {
        includeActions: true,
      });
      expect(full.description).toMatch(/firm frozen rail[^]*brace it once/i);
      expect(compact.actions).toContain("brace_paling_rail");
    }
  });

  it("keeps canonical rail action ids stable across seeded, ordinary, Works, and recovery states", () => {
    const assertNoFallback = (state: GameState): void => {
      expect(actionIds(state)).not.toContain("use_paling_rail");
    };

    const firm = prepareHunt("opening_condition_firm_frozen_rail");
    expect(actionIds(firm)).toContain("brace_paling_rail");
    const firmObservation = buildRpgObservation(index, firm);
    const firmCompact = compactRpgObservation(firmObservation, firmObservation.available_actions, {
      includeActions: true,
    });
    expect(firmObservation.description).toMatch(/firm frozen rail[^]*brace it once/i);
    expect(firmObservation.description).not.toMatch(/Wedge it/i);
    expect(firmCompact.text).toBe(firmObservation.description.trimEnd());
    expect(firmCompact.actions).toContain("brace_paling_rail");
    expect(firmCompact.actions).not.toContain("wedge_paling_rail");
    const rail = index.objects.get("paling_rail");
    if (!rail) throw new Error("Missing paling rail");
    expect(objectDescription(rail, firm)).toMatch(/brace it once/i);
    expect(objectDescription(rail, firm)).not.toMatch(/wedge it/i);
    assertNoFallback(firm);

    let firmWorks = prepareHunt("opening_condition_firm_frozen_rail");
    firmWorks = {
      ...firmWorks,
      flags: { ...firmWorks.flags, works_fortification_prepared: true },
    };
    expect(actionIds(firmWorks)).toContain("brace_paling_rail");
    expect(actionIds(firmWorks)).not.toEqual(
      expect.arrayContaining(["set_paling_rail", "wedge_paling_rail"]),
    );
    const firmWorksBeat = actCounting(firmWorks, "brace_paling_rail");
    expect(firmWorksBeat.rngCalls).toBe(0);
    expect(firmWorksBeat.state.flags).toMatchObject({
      rail_attempted: true,
      breach_braced: true,
    });

    let ordinary = prepareHunt("opening_condition_sound_lower_frame");
    expect(actionIds(ordinary)).toContain("wedge_paling_rail");
    assertNoFallback(ordinary);
    ordinary = act(ordinary, "wedge_paling_rail", "worst");
    expect(actionIds(ordinary)).toContain("bind_paling_rail");
    assertNoFallback(ordinary);

    let works = prepareHunt("opening_condition_steady_scent_channel");
    works = { ...works, flags: { ...works.flags, works_fortification_prepared: true } };
    expect(actionIds(works)).toContain("set_paling_rail");
    assertNoFallback(works);
    works = act(works, "set_paling_rail", "worst");
    expect(actionIds(works)).toContain("splice_paling_rail");
    assertNoFallback(works);

    let turn = prepareLure("opening_condition_sound_lower_frame");
    turn = act(turn, "use_winter_feed_sack_on_downwind_feed_line", "worst");
    turn = act(turn, "wedge_paling_rail", "best");
    expect(actionIds(turn)).toContain("turn_paling_rail");
    assertNoFallback(turn);
  });

  it("keeps Cade and June's firm-rail HUNT guidance aligned with the brace action", () => {
    let cade = reachCade("opening_condition_firm_frozen_rail");
    const cadeResult = perform(cade, "ask_byre");
    cade = cadeResult.state;
    expect(narration(cadeResult.events)).toMatch(
      /firm frozen rail braces directly[^]*Neither turns a wolf alive/i,
    );
    expect(cade.journal.at(-1)).toMatch(/set the rail as tonight's ground allows/i);

    let june = fresh("opening_condition_firm_frozen_rail");
    june = { ...june, flags: { ...june.flags, june_pike_present: true } };
    june = act(june, "go_north");
    const juneYard = buildRpgObservation(index, june);
    expect(juneYard.description).toMatch(/June holds the north gate/i);
    expect(juneYard.available_actions.map((candidate) => candidate.id)).toContain("talk_june_pike");
    june = act(june, "talk_houndsman");
    june = act(june, "ask_leave");
    june = act(june, "talk_june_pike");
    const juneResult = perform(june, "ask_commit_hunt_and_hold");
    expect(narration(juneResult.events)).toMatch(
      /brace a firm rail[^]*wedge and bind an ordinary split[^]*HUNT still means a wolf can die/i,
    );
    expect(juneResult.state.journal.at(-1)).toMatch(/firm-braced[^]*ordinarily wedged and bound/i);
  });

  it("keeps both overworld route previews strategy-neutral while stating their real tradeoffs", () => {
    const world = loadOverworldManifest(process.cwd());
    const launch = world.quests.find((quest) => quest.id === "wolf_winter")?.launch;
    if (!launch) throw new Error("Wolf-Winter must expose its route launch");
    const ridge = launch.options.find(
      (option) => option.id === "albany:wolf_approach_exposed_ridge",
    );
    const stockway = launch.options.find(
      (option) => option.id === "albany:wolf_approach_sheltered_stockway",
    );
    expect(ridge?.preview).toMatch(
      /chooses no strategy[^]*inspect all four[^]*alarm 1[^]*independent ground fact before commitment[^]*supersede one matching first beat[^]*Other route mechanics are unchanged/i,
    );
    expect(stockway?.preview).toMatch(
      /chooses no strategy[^]*inspect all four[^]*alarm 0[^]*independent ground fact before commitment[^]*supersede one matching first beat[^]*Other route mechanics are unchanged/i,
    );
    expect(ridge?.summary).toMatch(/quickly[^]*more tiring[^]*clear sight/i);
    expect(stockway?.summary).toMatch(/longer[^]*less tired[^]*herd calm/i);
  });
});
