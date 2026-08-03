/**
 * Depth Contract #3 — concept × route balance proof.
 *
 * Every witness begins with Albany's public fresh-overworld flow, reaches the
 * real embedded Wolf-Winter launch, and then applies only legal quest actions.
 * The fixed rolls are deliberately identical across concepts: an advantage
 * below is a native imported skill, not a seed, shortcut, or injected state.
 */
import { describe, expect, it } from "vitest";

import { makeStep } from "../../src/core/engine.js";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";
import { createToolApi } from "../../src/mcp/tools.js";
import { buildRpgRules, enumerateRpgActions, indexRpgPack } from "../../src/rpg/runner.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const ROOT = process.cwd();
const WORLD = loadOverworldManifest(ROOT);
function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

const WOLF = required(
  WORLD.quests.find((quest) => quest.id === "wolf_winter"),
  "The starting slice requires Wolf-Winter.",
);
const REGISTRATION = required(
  WORLD.opening_registration,
  "The starting slice requires Albany registration.",
);
const PREPARATION = required(
  WORLD.opening_preparation,
  "The starting slice requires Albany preparation.",
);
const RELIEF_ALLOCATION = required(
  WORLD.opening_relief_allocation,
  "The starting slice requires Albany relief allocation.",
);
const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("Wolf-Winter must compile.");
const INDEX = indexRpgPack(loaded.compiled.pack);

const FULL = { compact_context: false, compact_result: false } as const;
const ROAD_WARDEN = "albany:road_warden";
const IRONHANDS = "albany:ironhands_repairer";
const COURIER = "albany:unaffiliated_courier";
const LEDGER = "albany:ledger_advocate";
const WORKS = "albany:prep_works_fortification";
const DROVER = "albany:prep_drover_route";
const RELIEF = "albany:prep_relief_protocol";

type Concept = typeof ROAD_WARDEN | typeof IRONHANDS | typeof COURIER | typeof LEDGER;
type Witness = "lure" | "fortify" | "drive" | "relief";

/** The test's sole RNG control: every compared action gets this exact die result. */
function fixedRoll(value: number): Rng {
  return {
    next: () => (value - 1) / 20,
    int: (min, max) => Math.max(min, Math.min(max, value)),
  };
}

function act(state: GameState, actionId: string, roll = 8): GameState {
  const option = enumerateRpgActions(INDEX, state).find((candidate) => candidate.id === actionId);
  expect(
    option,
    `${actionId} must be legal in ${state.current}; legal: ${enumerateRpgActions(INDEX, state)
      .map((candidate) => candidate.id)
      .join(", ")}`,
  ).toBeDefined();
  if (!option) throw new Error(`Missing legal Wolf-Winter action ${actionId}.`);
  const result = makeStep(buildRpgRules(INDEX, () => fixedRoll(roll)))(state, option.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  return result.state;
}

/**
 * This is deliberately the human-visible route: fresh world → Rowan → oath →
 * lead → preparation → relief allocation → embedded quest.  No direct quest
 * start, profile constructor, or state mutation is used to make a witness.
 */
function launchFreshWolf(concept: Concept, preparation: string): GameState {
  const api = createToolApi({ root: ROOT });
  const started = api.start_overworld({ compact_context: false });
  const sessionId = started.session_id;
  const civicPoi = started.observation.pois[0];
  if (!civicPoi) throw new Error("Albany's fresh opening must expose its civic POI.");

  api.scout_overworld_session_poi({ ...FULL, session_id: sessionId, poi_id: civicPoi.id });
  api.talk_overworld_session_contact({
    ...FULL,
    session_id: sessionId,
    character_id: REGISTRATION.contact,
  });
  api.choose_overworld_session_story({ ...FULL, session_id: sessionId, choice: concept });
  if (concept !== LEDGER) {
    api.inspect_overworld_session_story({
      ...FULL,
      session_id: sessionId,
      story_choice_id: "albany:wolf_relief_oath",
      reveal_id: "customize_duty_and_evidence",
    });
  }
  api.choose_overworld_session_story({
    ...FULL,
    session_id: sessionId,
    choice: "albany:oath_full_compact_duty",
  });
  const sourced = api.choose_overworld_session_story({
    ...FULL,
    session_id: sessionId,
    choice: "albany:source_rowan_civic_docket",
  });
  const preparationRoute = sourced.observation.areaExits.find(
    (candidate) => candidate.destination.id === PREPARATION.area,
  );
  if (!preparationRoute) throw new Error("Albany must expose the preparation-board route.");
  api.move_overworld_session_area({
    ...FULL,
    session_id: sessionId,
    area_route_id: preparationRoute.id,
  });
  api.choose_overworld_session_story({
    ...FULL,
    session_id: sessionId,
    story_choice_id: PREPARATION.id,
    choice: preparation,
  });
  api.choose_overworld_session_story({
    ...FULL,
    session_id: sessionId,
    story_choice_id: RELIEF_ALLOCATION.id,
    choice: "albany:relief_resident_shelter",
  });
  const preparedView = api.get_overworld_session({
    session_id: sessionId,
    include_observation: true,
  }).observation;
  if (preparedView.currentArea?.id !== WOLF.area) {
    const wolfRoute = preparedView.areaExits.find(
      (candidate) => candidate.destination.id === WOLF.area,
    );
    if (!wolfRoute) {
      throw new Error(
        `Albany must expose the Wolf-Winter launch area from ${preparedView.currentArea?.id ?? "none"}; visible: ${preparedView.areaExits.map((candidate) => candidate.destination.id).join(", ")}`,
      );
    }
    api.move_overworld_session_area({
      ...FULL,
      session_id: sessionId,
      area_route_id: wolfRoute.id,
    });
  }
  const launched = api.start_overworld_session_quest({
    ...FULL,
    compact_actions: false,
    compact_observation: false,
    include_actions: true,
    session_id: sessionId,
    quest_id: WOLF.id,
    approach_id: "albany:wolf_approach_sheltered_stockway",
    seed: 505,
  });
  return structuredClone(api.sessions.get(launched.rpg_session_id).state);
}

function startLure(state: GameState): GameState {
  for (const actionId of [
    "use_sheltered_stockway_last_mile",
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
  return state;
}

function lureWitness(concept: Concept): boolean {
  const result = act(
    startLure(launchFreshWolf(concept, WORKS)),
    "use_winter_feed_sack_on_downwind_feed_line",
  );
  return result.flags.yearling_redirected === true && result.flags.lure_trail_fouled !== true;
}

function fortifyWitness(concept: Concept): boolean {
  let state = launchFreshWolf(concept, WORKS);
  for (const actionId of [
    "use_sheltered_stockway_last_mile",
    "talk_houndsman",
    "ask_fortify",
    "ask_commit_cade_terms",
    "ask_leave",
    "take_cade_household_shutters",
    "go_north",
  ]) {
    state = act(state, actionId);
  }
  const sealed = act(state, "use_cade_household_shutters_on_fortify_outer_seal");
  expect(sealed.vars.fortification_pressure).toBe(sealed.flags.fortify_outer_sealed ? 1 : 2);
  return sealed.flags.fortify_outer_sealed === true;
}

function driveWitness(concept: Concept): boolean {
  let state = launchFreshWolf(concept, DROVER);
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
  state = act(state, "use_drive_signal_rope_kit_on_drive_breach_signal", 1);
  expect(state.flags.drive_opening_fouled).toBe(true);
  const recovered = act(state, "use_drive_drover_route_marks");
  return recovered.vars.pack_drive === 1 && recovered.flags.drover_route_attempted === true;
}

function reliefWitness(concept: Concept): boolean {
  let state = startLure(launchFreshWolf(concept, RELIEF));
  state = act(state, "use_winter_feed_sack_on_downwind_feed_line", 1);
  expect(state.flags.lure_trail_fouled).toBe(true);
  state = act(state, "wedge_paling_rail", 1);
  expect(state.flags.rail_split).toBe(true);
  state = act(state, "bind_paling_rail");
  state = act(state, "use_split_rail_guard_on_downwind_feed_line");
  state = act(state, "go_south");
  const recovered = act(state, "use_relief_protocol_docket");
  return recovered.vars.cattle_alarm === 1 && recovered.flags.relief_protocol_attempted === true;
}

function outcomeVector(concept: Concept): Readonly<Record<Witness, boolean>> {
  return {
    lure: lureWitness(concept),
    fortify: fortifyWitness(concept),
    drive: driveWitness(concept),
    relief: reliefWitness(concept),
  };
}

describe("Depth Contract #3 — fresh-overworld concept × Wolf-Winter route balance", () => {
  it("gives every concept a native, immediate field advantage under identical rolls", () => {
    const vectors: Record<Concept, Readonly<Record<Witness, boolean>>> = {
      [ROAD_WARDEN]: outcomeVector(ROAD_WARDEN),
      [IRONHANDS]: outcomeVector(IRONHANDS),
      [COURIER]: outcomeVector(COURIER),
      [LEDGER]: outcomeVector(LEDGER),
    };

    // A roll of 8 clears the relevant DC 12 only for the matching imported +4 skill.
    expect(vectors).toEqual({
      [ROAD_WARDEN]: { lure: true, fortify: false, drive: false, relief: false },
      [IRONHANDS]: { lure: false, fortify: true, drive: false, relief: false },
      [COURIER]: { lure: false, fortify: false, drive: true, relief: false },
      [LEDGER]: { lure: false, fortify: false, drive: false, relief: true },
    });

    // Explicit anti-dominance proof: every concept has a witness it wins and a
    // different reachable witness where another concept wins. These are state
    // changes (living redirect/seal, pressure beat, cattle alarm), not prose.
    for (const [concept, vector] of Object.entries(vectors) as [
      Concept,
      Record<Witness, boolean>,
    ][]) {
      expect(Object.values(vector).filter(Boolean), concept).toHaveLength(1);
      expect(
        Object.values(vector).filter((value) => !value),
        concept,
      ).toHaveLength(3);
    }
  });
});
