/**
 * Regression for seed4177 S2: the compact action id `ask_invoke_authority`
 * looked exploratory even though it immediately committed the fortification
 * strategy. Cade's full-duty line must disclose both stances and the shared
 * commitment boundary without being shortened by the compact projection.
 */
import { describe, expect, it } from "vitest";

import { makeStep } from "../../src/core/engine.js";
import { hashState } from "../../src/core/hash.js";
import type { Rng } from "../../src/core/rng.js";
import { MCP_ACTION_LABEL_CHAR_LIMIT } from "../../src/mcp/action_labels.js";
import {
  COMPACT_BLOCKED_EXIT_CHAR_LIMIT,
  compactRpgObservation,
} from "../../src/mcp/compact_rpg_observation.js";
import { createToolApi } from "../../src/mcp/tools.js";
import { parseCommand } from "../../src/rpg/command_map.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { buildRpgRules, enumerateRpgActions, indexRpgPack } from "../../src/rpg/runner.js";
import type { GameState } from "../../src/core/state.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";

const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("Wolf-Winter must compile");
const index = indexRpgPack(loaded.compiled.pack);
const FULL = { compact_context: false, compact_result: false } as const;
const COMMITMENT_WARNING = /Choosing FORTIFY[^]*closes retreat[^]*HUNT[^]*LURE[^]*DRIVE/i;
const CADE_STANCE =
  /Cade's shutters[^]*expose his property[^]*preserve Albany's relief seals[^]*failed-seal recovery/i;
const ALBANY_STANCE =
  /Albany's relief seals[^]*protect his property[^]*consume the public supply[^]*no Cade help/i;
const FULL_DUTY_TERMS =
  /violate Full Duty[^]*first Repair DC 12 instead of 14[^]*mobile crew stabilizes a recovered failure[^]*dawn/i;
const TRUNCATION_MARKER = /(?:\.\.\.\(\+\d+ chars\)|#[0-9a-f]{12}\b)/i;
const NORTH_PENDING_GUIDANCE =
  "North is blocked. Before HUNT, TALK TO Road Warden June Pike. During LURE, follow the shown CALL or feed action; feed is west, and the hatch is west then up. During DRIVE or FORTIFY, complete the shown gear action.";
const NORTH_LURE_PENDING_GUIDANCE =
  "North is blocked. Finish the shown LURE action first. Feed is west; the hatch is west then up.";
const NORTH_FORTIFY_PENDING_GUIDANCE =
  "North is blocked. Finish the shown FORTIFY gear action first.";
const NORTH_DRIVE_PENDING_GUIDANCE = "North is blocked. Finish the shown DRIVE gear action first.";
const PALING_NORTH_GUIDANCE =
  "North is blocked. Complete the currently listed yearling or outer-seal action. During LURE, go south, west, and up, then CAST Cade's winter-feed sack THROUGH low wolf-hatch.";
const MOUTH_NORTH_GUIDANCE =
  "North is blocked. Complete the exact action shown here. That action either ends the quest or opens north.";
const YARD_BLOCKED_SOUTH =
  "South is closed. After LURE, go north for the cattle count. During DRIVE or FORTIFY, complete the currently displayed gear action, then go north.";
const YARD_BLOCKED_WEST =
  "West is closed. After LURE, go north for the cattle count. During DRIVE or FORTIFY, complete the currently displayed gear action, then go north.";
const PALING_BLOCKED_SOUTH =
  "South is closed. After LURE, go north for the cattle count. During DRIVE or FORTIFY, complete the shown Broken Paling action to open north.";
const THRESHOLD_BLOCKED_SOUTH =
  "South is closed. After LURE, go north for the cattle count. During DRIVE or FORTIFY, complete the shown Byre Door action, then go north.";
const MOUTH_BLOCKED_SOUTH =
  "South is closed. After LURE, go north for the cattle count. During DRIVE, choose and finish a crisis evacuation. During FORTIFY, HOLD sealed-byre dawn watch.";
const YARD_SECONDARY_BLOCKS = [
  ["south", YARD_BLOCKED_SOUTH],
  ["west", YARD_BLOCKED_WEST],
] as const;
const PALING_SECONDARY_BLOCKS = [["south", PALING_BLOCKED_SOUTH]] as const;
const THRESHOLD_SECONDARY_BLOCKS = [["south", THRESHOLD_BLOCKED_SOUTH]] as const;
const MOUTH_SECONDARY_BLOCKS = [["south", MOUTH_BLOCKED_SOUTH]] as const;
const ALL_SECONDARY_BLOCKED_COPY = [
  YARD_BLOCKED_SOUTH,
  YARD_BLOCKED_WEST,
  PALING_BLOCKED_SOUTH,
  THRESHOLD_BLOCKED_SOUTH,
  MOUTH_BLOCKED_SOUTH,
] as const;

type DirectionProjection = readonly [direction: string, destination: string];
type BlockProjection = readonly [direction: string, message: string];

type Roll = "best" | "worst";

function fixedRng(face: Roll): Rng {
  return {
    next: () => (face === "best" ? 0.999999 : 0),
    int: (min, max) => (face === "best" ? max : min),
  };
}

function act(state: GameState, actionId: string, face?: Roll): GameState {
  const option = enumerateRpgActions(index, state).find((candidate) => candidate.id === actionId);
  expect(option, `${actionId} must be legal in ${state.current}`).toBeDefined();
  if (!option) throw new Error(`Missing ${actionId}.`);
  const result = makeStep(buildRpgRules(index, face ? () => fixedRng(face) : undefined))(
    state,
    option.action,
  );
  expect(result.ok, result.rejectionReason).toBe(true);
  return result.state;
}

function observation(state: GameState) {
  return buildRpgObservation(index, state, {
    availableActions: enumerateRpgActions(index, state),
  });
}

function assertNorthBlockedOnce(
  state: GameState,
  preparationActionId: string,
  message = NORTH_PENDING_GUIDANCE,
): void {
  const full = observation(state);
  const compact = compactRpgObservation(
    full,
    full.available_actions.map((action) => action.id),
    { includeActions: true },
  );
  const compactNorthExits = (compact.exits ?? []).filter(
    (exit) => (typeof exit === "string" ? exit : exit[0]) === "north",
  );
  const compactNorthBlocks = (compact.blocked ?? []).filter(([direction]) => direction === "north");

  expect(full.available_actions.filter((action) => action.id === "go_north")).toEqual([]);
  expect(full.exits.filter((exit) => exit.direction === "north")).toEqual([]);
  expect(full.blocked_exits.filter((exit) => exit.direction === "north")).toEqual([
    { direction: "north", message },
  ]);
  expect(full.available_actions.map((action) => action.id)).toContain(preparationActionId);
  expect(compactNorthExits).toEqual([]);
  expect(compactNorthBlocks).toEqual([["north", message]]);
  expect(compact.actions).toContain(preparationActionId);
  expect(compactNorthBlocks[0]?.[1]).not.toMatch(TRUNCATION_MARKER);
}

function assertNorthOpenOnce(state: GameState, destination = "paling_gap"): void {
  const full = observation(state);
  const compact = compactRpgObservation(
    full,
    full.available_actions.map((action) => action.id),
    { includeActions: true },
  );
  const compactNorthExits = (compact.exits ?? []).filter(
    (exit) => (typeof exit === "string" ? exit : exit[0]) === "north",
  );
  const compactNorthBlocks = (compact.blocked ?? []).filter(([direction]) => direction === "north");

  expect(full.available_actions.filter((action) => action.id === "go_north")).toHaveLength(1);
  expect(full.exits.filter((exit) => exit.direction === "north")).toHaveLength(1);
  expect(full.blocked_exits.filter((exit) => exit.direction === "north")).toEqual([]);
  expect(compactNorthExits).toEqual([["north", destination]]);
  expect(compactNorthBlocks).toEqual([]);
}

function assertSecondaryBlockedSurface(
  state: GameState,
  expected: readonly BlockProjection[],
  requiredActionIds: readonly string[] = [],
): void {
  const beforeHash = hashState(state);
  const full = observation(state);
  const actionIds = full.available_actions.map((action) => action.id);
  const compact = compactRpgObservation(full, actionIds, { includeActions: true });
  const secondaryDirections = new Set(["south", "west"]);

  expect(full.blocked_exits.filter((exit) => secondaryDirections.has(exit.direction))).toEqual(
    expected.map(([direction, message]) => ({ direction, message })),
  );
  expect(
    (compact.blocked ?? []).filter(([direction]) => secondaryDirections.has(direction)),
  ).toEqual(expected);
  expect(compact.actions).toEqual(actionIds);
  for (const [direction, message] of expected) {
    expect(actionIds).not.toContain(`go_${direction}`);
    expect(message).not.toMatch(TRUNCATION_MARKER);
  }
  for (const actionId of requiredActionIds) {
    expect(actionIds).toContain(actionId);
    expect(compact.actions).toContain(actionId);
  }
  expect(hashState(state)).toBe(beforeHash);
}

function assertSecondaryRoutesOpen(
  state: GameState,
  expected: readonly DirectionProjection[],
): void {
  const beforeHash = hashState(state);
  const full = observation(state);
  const actionIds = full.available_actions.map((action) => action.id);
  const compact = compactRpgObservation(full, actionIds, { includeActions: true });
  const expectedDirections = new Set(expected.map(([direction]) => direction));

  expect(full.exits.filter((exit) => expectedDirections.has(exit.direction))).toEqual(
    expected.map(([direction, destination]) => ({ direction, to: destination })),
  );
  expect(
    (compact.exits ?? []).filter(
      (exit) => typeof exit !== "string" && expectedDirections.has(exit[0]),
    ),
  ).toEqual(expected);
  expect(full.blocked_exits.filter((exit) => expectedDirections.has(exit.direction))).toEqual([]);
  expect(
    (compact.blocked ?? []).filter(([direction]) => expectedDirections.has(direction)),
  ).toEqual([]);
  for (const [direction] of expected) expect(actionIds).toContain(`go_${direction}`);
  expect(compact.actions).toEqual(actionIds);
  expect(hashState(state)).toBe(beforeHash);
}

function launchSeed4177Imports(
  preparationChoice:
    | "albany:prep_works_fortification"
    | "albany:prep_drover_route" = "albany:prep_works_fortification",
): GameState {
  const api = createToolApi({ root: process.cwd() });
  const started = api.start_overworld({ compact_context: false });
  const sessionId = started.session_id;

  api.scout_overworld_session_poi({
    ...FULL,
    session_id: sessionId,
    poi_id: started.observation.pois[0]!.id,
  });
  api.talk_overworld_session_contact({
    ...FULL,
    session_id: sessionId,
    character_id: "albany_city__civic_core__contact",
  });
  api.choose_overworld_session_story({
    ...FULL,
    session_id: sessionId,
    choice: "albany:road_warden",
  });
  api.inspect_overworld_session_story({
    ...FULL,
    session_id: sessionId,
    story_choice_id: "albany:wolf_relief_oath",
    reveal_id: "customize_duty_and_evidence",
  });
  api.choose_overworld_session_story({
    ...FULL,
    session_id: sessionId,
    choice: "albany:oath_full_compact_duty",
  });
  const sourced = api.choose_overworld_session_story({
    ...FULL,
    session_id: sessionId,
    choice: "albany:source_hayden_frost_report",
  });
  const preparationRoute = sourced.observation.areaExits.find(
    (candidate) => candidate.destination.id === "albany_city__transport_hub",
  );
  if (!preparationRoute) throw new Error("Wolf-Winter's preparation area must be reachable.");
  api.move_overworld_session_area({
    ...FULL,
    session_id: sessionId,
    area_route_id: preparationRoute.id,
  });
  const prepared = api.choose_overworld_session_story({
    ...FULL,
    session_id: sessionId,
    story_choice_id: "albany:wolf_preparation",
    choice: preparationChoice,
  });
  const wolf = prepared.observation.quests.find((quest) => quest.id === "wolf_winter");
  if (!wolf) throw new Error("Hayden's report and Reese's plan must reveal Wolf-Winter.");
  api.choose_overworld_session_story({
    ...FULL,
    session_id: sessionId,
    story_choice_id: "albany:wolf_relief_allocation",
    choice: "albany:relief_mobile_reserve",
  });

  const launched = api.start_overworld_session_quest({
    ...FULL,
    compact_observation: false,
    compact_actions: false,
    include_actions: true,
    session_id: sessionId,
    quest_id: "wolf_winter",
    approach_id: "albany:wolf_approach_sheltered_stockway",
    seed: 4177,
  });
  const state = structuredClone(api.sessions.get(launched.rpg_session_id).state);
  expect(state.flags.june_pike_present).not.toBe(true);
  const preparationRules =
    preparationChoice === "albany:prep_drover_route"
      ? ["import:wolf_winter_drover_route"]
      : ["import:wolf_winter_works_fortification"];
  expect(state.campaignImportReceipt?.applied_rules).toEqual(
    expect.arrayContaining([
      "import:wolf_winter_approach_sheltered_stockway",
      "import:wolf_winter_fieldcraft",
      "import:wolf_winter_frost_report",
      "import:wolf_winter_full_compact_duty",
      "import:wolf_winter_lure_fieldcraft",
      "import:wolf_winter_relief_mobile_reserve",
      ...preparationRules,
    ]),
  );
  return state;
}

describe("Wolf-Winter authority commitment boundary", () => {
  it("discloses seed4177's authority commitment in full and compact before the step, then closes the other lines", () => {
    let state = launchSeed4177Imports();
    state = act(state, "use_sheltered_stockway_last_mile");
    state = act(state, "talk_houndsman");
    state = act(state, "ask_fortify");

    const before = observation(state);
    const fullDialogue = before.dialogue?.npc_text;
    const compact = compactRpgObservation(
      before,
      before.available_actions.map((action) => action.id),
      {
        includeActions: true,
      },
    );
    const compactDialogue = compact.dialogue?.[1];
    expect(fullDialogue).toMatch(COMMITMENT_WARNING);
    expect(fullDialogue).toMatch(CADE_STANCE);
    expect(fullDialogue).toMatch(ALBANY_STANCE);
    expect(fullDialogue).toMatch(FULL_DUTY_TERMS);
    expect(compactDialogue).toBe(fullDialogue?.trimEnd());
    expect(compactDialogue).not.toMatch(TRUNCATION_MARKER);
    expect(compactDialogue).toMatch(COMMITMENT_WARNING);
    expect(compactDialogue).toMatch(CADE_STANCE);
    expect(compactDialogue).toMatch(ALBANY_STANCE);
    expect(compactDialogue).toMatch(FULL_DUTY_TERMS);
    expect(compact.actions).toEqual(
      expect.arrayContaining(["ask_commit_cade_terms", "ask_commit_albany_authority"]),
    );
    expect(compact.actions).not.toEqual(
      expect.arrayContaining(["ask_accept_terms", "ask_invoke_authority"]),
    );
    expect(state.flags.strategy_fortify_committed).not.toBe(true);
    expect(state.flags.fortify_cade_terms_accepted).not.toBe(true);
    expect(state.flags.fortify_albany_authority_invoked).not.toBe(true);
    expect(before.available_actions.map((action) => action.id)).toEqual(
      expect.arrayContaining([
        "ask_commit_cade_terms",
        "ask_commit_albany_authority",
        "ask_fortify_back",
      ]),
    );
    expect(before.available_actions.map((action) => action.id)).not.toEqual(
      expect.arrayContaining(["ask_accept_terms", "ask_invoke_authority"]),
    );
    expect(parseCommand(index, state, "ask invoke_authority")).toEqual({
      ok: true,
      action: { type: "ASK", npc: "houndsman", topic: "commit_albany_authority" },
    });
    expect(parseCommand(index, state, "ask accept_terms")).toEqual({
      ok: true,
      action: { type: "ASK", npc: "houndsman", topic: "commit_cade_terms" },
    });
    const reconsidered = act(structuredClone(state), "ask_fortify_back");
    expect(reconsidered.flags.strategy_fortify_committed).not.toBe(true);
    expect(enumerateRpgActions(index, reconsidered).map((action) => action.id)).toEqual(
      expect.arrayContaining(["ask_lure", "ask_drive", "ask_fortify"]),
    );
    const authority = before.available_actions.find(
      (action) => action.id === "ask_commit_albany_authority",
    );
    expect(authority?.command).toMatch(
      /^ask: CHOOSE FORTIFY \/ ALBANY[^]*Lose retreat[^]*protect Cade's property[^]*spend Albany's seals[^]*no help after a failed outer seal[^]*close other plans/i,
    );
    expect(authority?.command.length).toBeLessThanOrEqual(MCP_ACTION_LABEL_CHAR_LIMIT);

    state = act(state, "ask_commit_albany_authority");
    expect(state.flags).toMatchObject({
      strategy_fortify_committed: true,
      fortify_albany_authority_invoked: true,
      fortify_combat_withheld: true,
      strategy_combat_withheld: true,
    });
    expect(state.flags.fortify_cade_terms_accepted).not.toBe(true);
    expect(enumerateRpgActions(index, state).map((action) => action.id)).not.toEqual(
      expect.arrayContaining(["ask_lure", "ask_drive", "ask_fortify", "ask_commit_cade_terms"]),
    );

    state = act(state, "ask_leave");
    expect(enumerateRpgActions(index, state).map((action) => action.id)).not.toEqual(
      expect.arrayContaining(["go_south", "go_west", "ask_lure", "ask_drive", "ask_fortify"]),
    );

    assertSecondaryBlockedSurface(state, YARD_SECONDARY_BLOCKS, ["take_albany_relief_seals"]);
    assertNorthBlockedOnce(state, "take_albany_relief_seals", NORTH_FORTIFY_PENDING_GUIDANCE);
    expect(NORTH_PENDING_GUIDANCE.length).toBe(214);
    expect(NORTH_PENDING_GUIDANCE.length).toBeLessThanOrEqual(220);

    state = act(state, "take_albany_relief_seals");
    assertSecondaryBlockedSurface(state, YARD_SECONDARY_BLOCKS);
    assertNorthOpenOnce(state);
  });

  it("keeps all five secondary route messages within their shared projection budget", () => {
    const metrics = ALL_SECONDARY_BLOCKED_COPY.map((message) => ({
      chars: message.length,
      words: message.trim().split(/\s+/u).length,
    }));

    expect(metrics).toEqual([
      { chars: 145, words: 24 },
      { chars: 144, words: 24 },
      { chars: 139, words: 24 },
      { chars: 136, words: 24 },
      { chars: 157, words: 25 },
    ]);
    expect(Math.max(...metrics.map(({ chars }) => chars))).toBeLessThanOrEqual(165);
    expect(metrics.reduce((total, { chars }) => total + chars, 0)).toBe(721);
    expect(ALL_SECONDARY_BLOCKED_COPY.every((message) => !TRUNCATION_MARKER.test(message))).toBe(
      true,
    );
    expect(PALING_NORTH_GUIDANCE.length).toBe(173);
    expect(PALING_NORTH_GUIDANCE.length).toBeLessThanOrEqual(180);
    expect(PALING_NORTH_GUIDANCE.length).toBeLessThanOrEqual(COMPACT_BLOCKED_EXIT_CHAR_LIMIT);
  });

  it.each([
    {
      strategy: "DRIVE",
      discuss: "ask_drive",
      commit: "ask_commit_drive",
      committedFlag: "strategy_drive_committed",
      pickup: "take_drive_signal_rope_kit",
      outer: "use_drive_signal_rope_kit_on_drive_breach_signal",
      recovery: null,
      threshold: "use_drive_signal_rope_kit_on_drive_threshold_line",
      finalActions: [
        "use_cattle_crisis_priority",
        "use_person_crisis_priority",
        "use_reserve_crisis_priority",
      ],
    },
    {
      strategy: "Cade FORTIFY",
      discuss: "ask_fortify",
      commit: "ask_commit_cade_terms",
      committedFlag: "fortify_cade_terms_accepted",
      pickup: "take_cade_household_shutters",
      outer: "use_cade_household_shutters_on_fortify_outer_seal",
      recovery: "use_cade_failed_seal_help",
      threshold: "use_cade_household_shutters_on_fortify_threshold_seal",
      finalActions: ["use_fortify_dawn_watch"],
    },
    {
      strategy: "Albany FORTIFY",
      discuss: "ask_fortify",
      commit: "ask_commit_albany_authority",
      committedFlag: "fortify_albany_authority_invoked",
      pickup: "take_albany_relief_seals",
      outer: "use_albany_relief_seals_on_fortify_outer_seal",
      recovery: "use_albany_relief_seals_on_authority_emergency_bind",
      threshold: "use_albany_relief_seals_on_fortify_threshold_seal",
      finalActions: ["use_fortify_dawn_watch"],
    },
  ])(
    "keeps all five secondary blocks exact in full and compact throughout $strategy",
    ({ discuss, commit, committedFlag, pickup, outer, recovery, threshold, finalActions }) => {
      let state = launchSeed4177Imports();
      state = act(state, "use_sheltered_stockway_last_mile");
      state = act(state, "talk_houndsman");
      state = act(state, discuss);
      state = act(state, commit);
      state = act(state, "ask_leave");

      expect(state.flags[committedFlag]).toBe(true);
      expect(enumerateRpgActions(index, state).map((action) => action.id)).toContain(pickup);
      assertSecondaryBlockedSurface(state, YARD_SECONDARY_BLOCKS, [pickup]);
      const yardNorth =
        committedFlag === "strategy_drive_committed"
          ? NORTH_DRIVE_PENDING_GUIDANCE
          : NORTH_FORTIFY_PENDING_GUIDANCE;
      assertNorthBlockedOnce(state, pickup, yardNorth);

      state = act(state, pickup);
      assertSecondaryBlockedSurface(state, YARD_SECONDARY_BLOCKS);
      assertNorthOpenOnce(state);

      state = act(state, "go_north");
      assertSecondaryBlockedSurface(state, PALING_SECONDARY_BLOCKS, [outer]);
      assertNorthBlockedOnce(state, outer, PALING_NORTH_GUIDANCE);

      if (recovery !== null) {
        let failed = act(structuredClone(state), outer, "worst");
        assertNorthBlockedOnce(failed, recovery, PALING_NORTH_GUIDANCE);
        failed = act(failed, recovery);
        assertNorthOpenOnce(failed, "byre_door");
      }

      state = act(state, outer, "best");
      assertSecondaryBlockedSurface(state, PALING_SECONDARY_BLOCKS, ["go_north"]);
      assertNorthOpenOnce(state, "byre_door");
      state = act(state, "go_north");
      assertSecondaryBlockedSurface(state, THRESHOLD_SECONDARY_BLOCKS, [threshold]);
      expect(enumerateRpgActions(index, state).map((action) => action.id)).not.toContain(
        "go_north",
      );

      state = act(state, threshold);
      assertSecondaryBlockedSurface(state, THRESHOLD_SECONDARY_BLOCKS, ["go_north"]);
      state = act(state, "go_north");
      assertSecondaryBlockedSurface(state, MOUTH_SECONDARY_BLOCKS, finalActions);
      assertNorthBlockedOnce(state, finalActions[0]!, MOUTH_NORTH_GUIDANCE);

      if (finalActions.includes("use_fortify_dawn_watch")) {
        state = act(state, "use_fortify_dawn_watch");
      } else {
        state = act(state, "use_cattle_crisis_priority");
        assertNorthBlockedOnce(state, "use_cattle_first_evacuation", MOUTH_NORTH_GUIDANCE);
        state = act(state, "use_cattle_first_evacuation");
      }
      expect(state).toMatchObject({ current: "cattle_stand", ended: true });
    },
  );

  it("keeps prepared DRIVE on the shown paling sequence until hurdle recovery opens north", () => {
    let state = launchSeed4177Imports("albany:prep_drover_route");
    expect(state.flags.drover_route_prepared).toBe(true);
    expect(state.campaignImportReceipt?.applied_rules).toEqual(
      expect.arrayContaining(["import:wolf_winter_drover_route"]),
    );

    for (const actionId of [
      "use_sheltered_stockway_last_mile",
      "talk_houndsman",
      "ask_drive",
      "ask_commit_drive",
      "ask_leave",
      "take_drive_signal_rope_kit",
      "go_north",
    ]) {
      state = act(state, actionId);
    }

    state = act(state, "use_drive_signal_rope_kit_on_drive_breach_signal", "worst");
    expect(state.flags).toMatchObject({
      drive_opening_fouled: true,
      drover_route_prepared: true,
    });
    expect(state.flags.drive_yearling_turned).not.toBe(true);
    expect(state.vars.pack_drive).toBe(2);
    assertSecondaryBlockedSurface(state, PALING_SECONDARY_BLOCKS, [
      "use_drive_drover_route_marks",
      "use_drive_hurdle_recovery",
    ]);
    expect(enumerateRpgActions(index, state).map((action) => action.id)).not.toContain("go_north");

    state = act(state, "use_drive_drover_route_marks", "best");
    expect(state.flags.drover_route_attempted).toBe(true);
    expect(state.flags.drive_yearling_turned).not.toBe(true);
    expect(state.vars.pack_drive).toBe(1);
    assertSecondaryBlockedSurface(state, PALING_SECONDARY_BLOCKS, ["use_drive_hurdle_recovery"]);
    expect(enumerateRpgActions(index, state).map((action) => action.id)).not.toContain("go_north");

    state = act(state, "use_drive_hurdle_recovery");
    expect(state.flags.drive_yearling_turned).toBe(true);
    assertSecondaryBlockedSurface(state, PALING_SECONDARY_BLOCKS, ["go_north"]);
  });

  it("leaves open, HUNT, and in-progress LURE return routes open while retaining bug_0558 north", () => {
    let opening = launchSeed4177Imports();
    opening = act(opening, "use_sheltered_stockway_last_mile");
    assertSecondaryRoutesOpen(opening, [
      ["south", "steading_yard"],
      ["west", "store"],
    ]);

    let hunt = act(structuredClone(opening), "talk_houndsman");
    hunt = act(hunt, "ask_hunt");
    expect(hunt.flags.strategy_lure_committed).not.toBe(true);
    expect(hunt.flags.strategy_drive_committed).not.toBe(true);
    expect(hunt.flags.strategy_fortify_committed).not.toBe(true);
    hunt = act(hunt, "ask_prepare_hunt");
    assertSecondaryRoutesOpen(hunt, [
      ["south", "steading_yard"],
      ["west", "store"],
    ]);
    hunt = act(hunt, "go_north");
    assertSecondaryRoutesOpen(hunt, [["south", "byre_yard"]]);

    let lure = act(structuredClone(opening), "talk_houndsman");
    lure = act(lure, "ask_lure");
    lure = act(lure, "ask_commit_lure");
    lure = act(lure, "ask_leave");
    assertSecondaryRoutesOpen(lure, [
      ["south", "steading_yard"],
      ["west", "store"],
    ]);
    assertNorthBlockedOnce(lure, "go_west", NORTH_LURE_PENDING_GUIDANCE);

    lure = act(lure, "go_west");
    lure = act(lure, "take_winter_feed_sack");
    lure = act(lure, "go_east");
    assertSecondaryRoutesOpen(lure, [
      ["south", "steading_yard"],
      ["west", "store"],
    ]);
    assertNorthOpenOnce(lure);
    lure = act(lure, "go_north");
    assertSecondaryRoutesOpen(lure, [["south", "byre_yard"]]);
    expect(enumerateRpgActions(index, lure).map((action) => action.id)).toContain(
      "use_winter_feed_sack_on_downwind_feed_line",
    );

    lure = act(lure, "use_winter_feed_sack_on_downwind_feed_line", "best");
    assertSecondaryRoutesOpen(lure, [["south", "byre_yard"]]);
    expect(lure.flags.pack_diverted).not.toBe(true);
  });
});
