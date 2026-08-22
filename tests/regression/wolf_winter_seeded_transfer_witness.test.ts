import { describe, expect, it } from "vitest";

import { makeStep } from "../../src/core/engine.js";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";
import type { RpgAction } from "../../src/api/types.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { seededOpeningFlagForSeed } from "../../src/rpg/seeded_opening.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { seedForSeededOpeningFlag } from "./support/seeded_opening.js";
import { relabelRpgPack } from "./support/relabel_rpg.js";

const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("Wolf-Winter must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const openingFlags = pack.meta.seeded_opening_flags!;

const FLAGS = {
  hunt: "opening_condition_firm_frozen_rail",
  lure: "opening_condition_steady_scent_channel",
  drive: "opening_condition_open_ash_lane",
  fortify: "opening_condition_sound_lower_frame",
} as const;

function fixed(face: "best" | "worst"): Rng {
  return {
    next: () => (face === "best" ? 0.999999 : 0),
    int: (min, max) => (face === "best" ? max : min),
  };
}

function fresh(flag: string): GameState {
  const seed = seedForSeededOpeningFlag(openingFlags, flag);
  const state = initStateForRpgPack(index, seed);
  expect(seededOpeningFlagForSeed(openingFlags, seed)).toBe(flag);
  expect(openingFlags.filter((candidate) => state.flags[candidate])).toEqual([flag]);
  return state;
}

function actionIds(state: GameState): string[] {
  return enumerateRpgActions(index, state).map((option) => option.id);
}

function act(state: GameState, id: string, face: "best" | "worst" = "best"): GameState {
  const options = enumerateRpgActions(index, state);
  expect(new Set(options.map((option) => option.id)).size, "menu ids must be unique").toBe(
    options.length,
  );
  const option = options.find((candidate) => candidate.id === id);
  expect(
    option,
    `${id} must be legal; got ${options.map((candidate) => candidate.id).join(",")}`,
  ).toBeDefined();
  if (!option) throw new Error(`Missing ${id}`);
  const stepped = makeStep(buildRpgRules(index, () => fixed(face)))(state, option.action);
  expect(stepped.ok, stepped.rejectionReason).toBe(true);
  if (!stepped.ok) throw new Error(`Rejected ${id}`);
  return stepped.state;
}

function reachCade(flag: string): GameState {
  return act(act(fresh(flag), "go_north"), "talk_houndsman");
}

function prepareHunt(flag: string): GameState {
  let state = reachCade(flag);
  state = act(state, "ask_hunt");
  state = act(state, "ask_prepare_hunt");
  return act(state, "go_north");
}

function prepareLure(flag: string): GameState {
  let state = reachCade(flag);
  for (const id of [
    "ask_lure",
    "ask_commit_lure",
    "ask_leave",
    "go_west",
    "take_winter_feed_sack",
    "go_east",
    "go_north",
  ]) {
    state = act(state, id);
  }
  return state;
}

function prepareDrive(flag: string): GameState {
  let state = reachCade(flag);
  for (const id of [
    "ask_drive",
    "ask_commit_drive",
    "ask_leave",
    "take_drive_signal_rope_kit",
    "go_north",
  ]) {
    state = act(state, id);
  }
  return state;
}

function prepareFortify(flag: string, authority = false): GameState {
  let state = reachCade(flag);
  for (const id of [
    "ask_fortify",
    authority ? "ask_commit_albany_authority" : "ask_commit_cade_terms",
    "ask_leave",
    authority ? "take_albany_relief_seals" : "take_cade_household_shutters",
    "go_north",
  ]) {
    state = act(state, id);
  }
  return state;
}

function normalizedDurable(state: GameState): Omit<GameState, "seed" | "step" | "journal"> {
  const { seed: _seed, step: _step, journal: _journal, flags, ...durable } = state;
  return {
    ...durable,
    flags: Object.fromEntries(
      Object.entries(flags).filter(([flag]) => !openingFlags.includes(flag)),
    ),
  };
}

function mapAction(action: RpgAction, mapId: (id: string) => string): RpgAction {
  switch (action.type) {
    case "ATTACK":
      return { type: "ATTACK", enemy: mapId(action.enemy) };
    case "MANEUVER":
      return {
        type: "MANEUVER",
        enemy: mapId(action.enemy),
        maneuver: mapId(action.maneuver),
      };
    case "LOOK":
      return action.npc !== undefined
        ? { type: "LOOK", npc: mapId(action.npc) }
        : action.target !== undefined
          ? { type: "LOOK", target: mapId(action.target) }
          : { type: "LOOK" };
    case "READ":
      return { type: "READ", target: mapId(action.target) };
    case "TAKE":
      return { type: "TAKE", item: mapId(action.item) };
    case "DROP":
      return { type: "DROP", item: mapId(action.item) };
    case "OPEN":
      return { type: "OPEN", target: mapId(action.target) };
    case "CLOSE":
      return { type: "CLOSE", target: mapId(action.target) };
    case "UNLOCK":
      return { type: "UNLOCK", target: mapId(action.target), with: mapId(action.with) };
    case "USE":
      return action.item === undefined
        ? { type: "USE", target: mapId(action.target) }
        : { type: "USE", item: mapId(action.item), target: mapId(action.target) };
    case "MOVE":
      return { type: "MOVE", direction: action.direction };
    case "TALK":
      return { type: "TALK", npc: mapId(action.npc) };
    case "ASK":
      return { type: "ASK", npc: mapId(action.npc), topic: mapId(action.topic) };
    case "GIVE":
      return { type: "GIVE", item: mapId(action.item), npc: mapId(action.npc) };
    case "INSPECT":
      return { type: "INSPECT", target: mapId(action.target) };
    case "INVENTORY":
      return { type: "INVENTORY" };
  }
}

function sorted<T>(values: readonly T[], key: (value: T) => string): T[] {
  return [...values].sort((left, right) => key(left).localeCompare(key(right)));
}

describe("Wolf-Winter seeded-opening transfer witnesses", () => {
  it("pins the fixed proof seed's selected ordinal and fresh-state exact-one invariant", () => {
    expect(seededOpeningFlagForSeed(openingFlags, 7)).toBe(FLAGS.drive);
    expect(openingFlags.map((flag) => fresh(flag).flags[flag])).toEqual([true, true, true, true]);
  });

  it("executes and retires every matching no-roll action without a duplicate menu id", () => {
    const cases: Array<[GameState, string, string]> = [
      [prepareHunt(FLAGS.hunt), "brace_paling_rail", "rail_attempted"],
      [
        prepareLure(FLAGS.lure),
        "use_winter_feed_sack_on_downwind_feed_line",
        "yearling_redirected",
      ],
      [
        prepareDrive(FLAGS.drive),
        "use_drive_signal_rope_kit_on_drive_breach_signal",
        "drive_yearling_turned",
      ],
      [
        prepareFortify(FLAGS.fortify),
        "use_cade_household_shutters_on_fortify_outer_seal",
        "fortify_outer_sealed",
      ],
      [
        prepareFortify(FLAGS.fortify, true),
        "use_albany_relief_seals_on_fortify_outer_seal",
        "fortify_outer_sealed",
      ],
    ];

    for (const [before, actionId, resultFlag] of cases) {
      expect(actionIds(before)).toContain(actionId);
      const after = act(before, actionId, "worst");
      expect(after.flags[resultFlag]).toBe(true);
      expect(actionIds(after)).not.toContain(actionId);
      expect(after.ended).toBe(false);
    }
  });

  it("matches every no-roll successor to the corresponding ordinary successful durable state", () => {
    const pairs: Array<[GameState, string, GameState, string]> = [
      [prepareHunt(FLAGS.hunt), "brace_paling_rail", prepareHunt(FLAGS.lure), "wedge_paling_rail"],
      [
        prepareLure(FLAGS.lure),
        "use_winter_feed_sack_on_downwind_feed_line",
        prepareLure(FLAGS.hunt),
        "use_winter_feed_sack_on_downwind_feed_line",
      ],
      [
        prepareDrive(FLAGS.drive),
        "use_drive_signal_rope_kit_on_drive_breach_signal",
        prepareDrive(FLAGS.lure),
        "use_drive_signal_rope_kit_on_drive_breach_signal",
      ],
      [
        prepareFortify(FLAGS.fortify),
        "use_cade_household_shutters_on_fortify_outer_seal",
        prepareFortify(FLAGS.drive),
        "use_cade_household_shutters_on_fortify_outer_seal",
      ],
    ];

    for (const [matchingBefore, matchingAction, ordinaryBefore, ordinaryAction] of pairs) {
      const matchingAfter = act(matchingBefore, matchingAction, "worst");
      const ordinarySuccess = act(ordinaryBefore, ordinaryAction, "best");
      expect(normalizedDurable(matchingAfter), matchingAction).toEqual(
        normalizedDurable(ordinarySuccess),
      );
    }
  });

  it("retains authentic worst-roll ordinary failure and deterministic recovery witnesses", () => {
    let hunt = prepareHunt(FLAGS.lure);
    hunt = act(hunt, "wedge_paling_rail", "worst");
    expect(hunt.flags.rail_split).toBe(true);
    expect(actionIds(hunt)).toContain("bind_paling_rail");
    hunt = act(hunt, "bind_paling_rail");
    expect(hunt.inventory).toContain("split_rail_guard");

    let lure = prepareLure(FLAGS.hunt);
    lure = act(lure, "use_winter_feed_sack_on_downwind_feed_line", "worst");
    expect(lure.flags.lure_trail_fouled).toBe(true);
    expect(actionIds(lure)).toContain("wedge_paling_rail");

    // Both ordinary DRIVE contexts have the exact same pinned durable failure subgraph.
    // The no-import context is replayed authentically through its complete omitted suffix;
    // the personal-bond import is covered statically rather than manufacturing an import.
    let drive = prepareDrive(FLAGS.lure);
    drive = act(drive, "use_drive_signal_rope_kit_on_drive_breach_signal", "worst");
    expect(drive.flags.drive_opening_fouled).toBe(true);
    expect(actionIds(drive)).toContain("use_drive_hurdle_recovery");
    drive = act(drive, "use_drive_hurdle_recovery");
    expect(drive.flags.drive_yearling_turned).toBe(true);
    drive = act(drive, "go_north");
    drive = act(drive, "use_drive_signal_rope_kit_on_drive_threshold_line");
    expect(drive.vars.pack_drive).toBe(3);
    drive = act(drive, "go_north");
    expect(actionIds(drive)).toContain("use_drive_overrun_recovery");
    const hpBeforeOverrun = drive.vars.hp;
    if (hpBeforeOverrun === undefined) throw new Error("DRIVE witness must retain hp");
    drive = act(drive, "use_drive_overrun_recovery");
    expect(drive.vars).toMatchObject({ hp: hpBeforeOverrun - 2, pack_drive: 2 });
    expect(actionIds(drive)).toEqual(
      expect.arrayContaining([
        "use_cattle_crisis_priority",
        "use_person_crisis_priority",
        "use_reserve_crisis_priority",
      ]),
    );
    drive = act(drive, "use_reserve_crisis_priority");
    drive = act(drive, "use_reserve_spent_evacuation");
    expect(drive.ended).toBe(true);
    expect(drive.endingId).toBe("ending_drive_reserve_spent");
    expect(drive.vars.score).toBe(35);

    for (const authority of [false, true]) {
      let fortify = prepareFortify(FLAGS.drive, authority);
      fortify = act(
        fortify,
        authority
          ? "use_albany_relief_seals_on_fortify_outer_seal"
          : "use_cade_household_shutters_on_fortify_outer_seal",
        "worst",
      );
      expect(fortify.flags.fortify_outer_seal_failed).toBe(true);
      const recovery = authority
        ? "use_albany_relief_seals_on_authority_emergency_bind"
        : "use_cade_failed_seal_help";
      expect(actionIds(fortify)).toContain(recovery);
      fortify = act(fortify, recovery);
      expect(fortify.flags.fortify_outer_sealed).toBe(true);
    }
  });

  it("keeps alternative-seed presentation and action surfaces isomorphic on a relabeled twin", () => {
    const { pack: twinPack, relabeler } = relabelRpgPack(pack);
    const twinIndex = indexRpgPack(twinPack);
    const mapId = (id: string): string => relabeler.map.get(id) ?? id;

    const assertParity = (original: GameState, twin: GameState): void => {
      const originalObservation = buildRpgObservation(index, original);
      const twinObservation = buildRpgObservation(twinIndex, twin);
      expect(twinObservation.room).toBe(mapId(originalObservation.room));
      expect(twinObservation.title).toBe(originalObservation.title);
      expect(twinObservation.description).toBe(originalObservation.description);
      expect(twinObservation.dialogue?.npc_text ?? null).toBe(
        originalObservation.dialogue?.npc_text ?? null,
      );
      expect(twinObservation.stats).toEqual(originalObservation.stats);
      expect(twinObservation.score).toBe(originalObservation.score);
      expect(twinObservation.ended).toBe(originalObservation.ended);
      expect(twinObservation.state.journal).toEqual(originalObservation.state.journal);
      expect(twinObservation.state.flags.slice().sort()).toEqual(
        originalObservation.state.flags.map(mapId).sort(),
      );
      expect(twinObservation.state.vars).toEqual(
        Object.fromEntries(
          Object.entries(originalObservation.state.vars).map(([name, value]) => [
            mapId(name),
            value,
          ]),
        ),
      );
      expect(twinObservation.inventory.slice().sort()).toEqual(
        originalObservation.inventory.map(mapId).sort(),
      );
      expect(sorted(twinObservation.visible_objects, (object) => object.id)).toEqual(
        sorted(
          originalObservation.visible_objects.map((object) => ({
            id: mapId(object.id),
            name: object.name,
          })),
          (object) => object.id,
        ),
      );

      const twinOptions = twinObservation.available_actions;
      expect(twinOptions).toHaveLength(originalObservation.available_actions.length);
      for (const originalOption of originalObservation.available_actions) {
        const expectedAction = mapAction(originalOption.action, mapId);
        const peers = twinOptions.filter(
          (candidate) => JSON.stringify(candidate.action) === JSON.stringify(expectedAction),
        );
        expect(peers, `mapped option for ${originalOption.id}`).toHaveLength(1);
        expect(peers[0]!.command).toBe(originalOption.command);
        expect(peers[0]!.skill_check).toEqual(
          originalOption.skill_check
            ? { ...originalOption.skill_check, skill: mapId(originalOption.skill_check.skill) }
            : undefined,
        );
        expect(peers[0]!.combat).toEqual(originalOption.combat);
      }
    };

    const pairedAct = (
      original: GameState,
      twin: GameState,
      originalActionId: string,
    ): [GameState, GameState] => {
      assertParity(original, twin);
      const originalOption = enumerateRpgActions(index, original).find(
        (candidate) => candidate.id === originalActionId,
      );
      expect(originalOption, originalActionId).toBeDefined();
      if (!originalOption) throw new Error(`Missing ${originalActionId}`);
      const expectedTwinAction = mapAction(originalOption.action, mapId);
      const twinPeers = enumerateRpgActions(twinIndex, twin).filter(
        (candidate) => JSON.stringify(candidate.action) === JSON.stringify(expectedTwinAction),
      );
      expect(twinPeers, `twin ${originalActionId}`).toHaveLength(1);
      const originalResult = makeStep(buildRpgRules(index, () => fixed("best")))(
        original,
        originalOption.action,
      );
      const twinResult = makeStep(buildRpgRules(twinIndex, () => fixed("best")))(
        twin,
        twinPeers[0]!.action,
      );
      expect(originalResult.ok).toBe(true);
      expect(twinResult.ok).toBe(true);
      if (!originalResult.ok || !twinResult.ok) throw new Error("paired action rejected");
      assertParity(originalResult.state, twinResult.state);
      return [originalResult.state, twinResult.state];
    };

    const routes: Array<[string, readonly string[]]> = [
      [
        FLAGS.hunt,
        [
          "go_north",
          "talk_houndsman",
          "ask_hunt",
          "ask_prepare_hunt",
          "go_north",
          "brace_paling_rail",
        ],
      ],
      [
        FLAGS.lure,
        [
          "go_north",
          "talk_houndsman",
          "ask_lure",
          "ask_commit_lure",
          "ask_leave",
          "go_west",
          "take_winter_feed_sack",
          "go_east",
          "go_north",
          "use_winter_feed_sack_on_downwind_feed_line",
        ],
      ],
      [
        FLAGS.fortify,
        [
          "go_north",
          "talk_houndsman",
          "ask_fortify",
          "ask_commit_cade_terms",
          "ask_leave",
          "take_cade_household_shutters",
          "go_north",
          "use_cade_household_shutters_on_fortify_outer_seal",
        ],
      ],
    ];

    for (const [flag, actions] of routes) {
      const seed = seedForSeededOpeningFlag(openingFlags, flag);
      let original = initStateForRpgPack(index, seed);
      let twin = initStateForRpgPack(twinIndex, seed);
      expect(
        twinPack.meta.seeded_opening_flags?.findIndex((candidate) => twin.flags[candidate]),
      ).toBe(openingFlags.indexOf(flag));
      for (const actionId of actions) [original, twin] = pairedAct(original, twin, actionId);
    }
  });
});
