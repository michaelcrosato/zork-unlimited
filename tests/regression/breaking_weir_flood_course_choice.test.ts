/**
 * Regression for the Breaking-Weir flood-course fork. Opening the relief-race
 * exposes one mandatory, informed choice between preserving the winter grain
 * and preserving Pell's old flood works. Both choices save every household and
 * share the same score/stat economy, but they must remain mutually exclusive
 * and produce distinct, truthful quest outcomes.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { makeStep } from "../../src/core/engine.js";
import { hashState } from "../../src/core/hash.js";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";
import { overworldQuestCompletionFromRpgSession } from "../../src/mcp/overworld_quest_bridge.js";
import { createToolApi } from "../../src/mcp/tools.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { assertRpgStateReferences } from "../../src/rpg/state_integrity.js";
import { classifyRpgJourneyDecision } from "../../src/world/journey_decision.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { GameSession } from "../../ui/src/engine.js";

const PACK_PATH = "content/rpg/quests/breaking_weir.yaml";
const SOURCE = readFileSync(PACK_PATH, "utf8");
const loaded = loadRpgSourceFile(PACK_PATH);
if (!loaded.ok) throw new Error("breaking_weir must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const world = loadOverworldManifest(process.cwd());

/** Best legal roll: keeps this content regression focused on the authored fork. */
const maxRoll = (): Rng => ({
  next: () => 0.999999,
  int: (_min, max) => max,
});
const rules = buildRpgRules(index, () => maxRoll());
const step = makeStep(rules);

const CHOICE_IDS = ["use_stone_race_pin", "use_field_wash_pin"] as const;

const COURSES = [
  {
    actionId: "use_stone_race_pin",
    flag: "flood_down_stone_race",
    otherFlag: "flood_over_lower_fields",
    endingId: "ending_fields_held_race_spent",
    endingTitle: "The Fields Held, the Old Race Spent",
    consequence: /winter grain above water[^]*cracked the low race-house[^]*rebuilt/i,
  },
  {
    actionId: "use_field_wash_pin",
    flag: "flood_over_lower_fields",
    otherFlag: "flood_down_stone_race",
    endingId: "ending_race_held_fields_given",
    endingTitle: "The Old Race Held, the Lower Fields Given",
    consequence: /relief works fit[^]*winter grain[^]*silt/i,
  },
] as const;

type ToolApi = ReturnType<typeof createToolApi>;

function pathBetween(
  from: string,
  to: string,
  edges: readonly { id: string; from: string; to: string }[],
): string[] {
  const queue: { at: string; path: string[] }[] = [{ at: from, path: [] }];
  const seen = new Set([from]);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    if (current.at === to) return current.path;
    for (const edge of edges) {
      if (edge.from !== current.at && edge.to !== current.at) continue;
      const next = edge.from === current.at ? edge.to : edge.from;
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push({ at: next, path: [...current.path, edge.id] });
    }
  }
  throw new Error(`No path from ${from} to ${to}.`);
}

function launchBreakingWeir(api: ToolApi): { overworldSessionId: string; rpgSessionId: string } {
  const quest = world.quests.find((candidate) => candidate.id === "breaking_weir");
  if (!quest) throw new Error("Expected the Breaking Weir overworld quest.");
  const full = { compact_context: false, compact_result: false } as const;
  const started = api.start_overworld({ compact_context: false });
  const overworldSessionId = started.session_id;
  const registrationContact = started.observation.characters.find(
    (character) => character.id === world.opening_registration?.contact,
  );
  if (!registrationContact) throw new Error("Expected Albany's registration contact.");
  api.talk_overworld_session_contact({
    ...full,
    session_id: overworldSessionId,
    character_id: registrationContact.id,
  });
  api.choose_overworld_session_story({
    ...full,
    session_id: overworldSessionId,
    choice: "albany:ledger_advocate",
  });
  const sourced = api.choose_overworld_session_story({
    ...full,
    session_id: overworldSessionId,
    choice: "albany:source_rowan_civic_docket",
  });
  expect(sourced.journey.storyChoice?.kind).toBe("preparation");
  api.choose_overworld_session_story({
    ...full,
    session_id: overworldSessionId,
    choice: "albany:prep_works_fortification",
  });

  for (const roadId of pathBetween(started.observation.current.id, quest.home, world.edges)) {
    api.travel_overworld_session({ session_id: overworldSessionId, road_id: roadId });
    let observation = api.get_overworld_session({
      session_id: overworldSessionId,
      include_observation: true,
    }).observation;
    if (observation.pendingRoadEncounter) {
      api.resolve_overworld_session_road_encounter({
        ...full,
        session_id: overworldSessionId,
        strategy: "press_on",
      });
      observation = api.get_overworld_session({
        session_id: overworldSessionId,
        include_observation: true,
      }).observation;
    }
    if (observation.supplies <= 2)
      api.resupply_overworld_session({ session_id: overworldSessionId });
    if (observation.fatigue >= 70) api.rest_overworld_session({ session_id: overworldSessionId });
  }

  let observation = api.get_overworld_session({
    session_id: overworldSessionId,
    include_observation: true,
  }).observation;
  for (
    let attempt = 0;
    attempt < 8 && !observation.discoveredAreaIds.includes(quest.area);
    attempt += 1
  ) {
    if (!observation.currentArea) throw new Error("Expected a current Rome area.");
    api.explore_overworld_session_area({
      session_id: overworldSessionId,
      area_id: observation.currentArea.id,
    });
    observation = api.get_overworld_session({
      session_id: overworldSessionId,
      include_observation: true,
    }).observation;
  }
  const areaEdges = world.area_edges.map((edge) => ({
    id: edge.id,
    from: edge.from_area,
    to: edge.to_area,
  }));
  for (const areaRouteId of pathBetween(observation.currentArea!.id, quest.area, areaEdges)) {
    api.move_overworld_session_area({
      session_id: overworldSessionId,
      area_route_id: areaRouteId,
    });
  }
  observation = api.get_overworld_session({
    session_id: overworldSessionId,
    include_observation: true,
  }).observation;
  if (!observation.discoveredQuestIds.includes(quest.id)) {
    const poi = observation.pois[0];
    if (!poi) throw new Error("Expected a Rome market point of interest.");
    api.scout_overworld_session_poi({ session_id: overworldSessionId, poi_id: poi.id });
  }
  const launched = api.start_overworld_session_quest({
    ...full,
    compact_observation: false,
    session_id: overworldSessionId,
    quest_id: quest.id,
    seed: 517,
  });
  return { overworldSessionId, rpgSessionId: launched.rpg_session_id };
}

function options(state: GameState) {
  return enumerateRpgActions(index, state);
}

function apply(state: GameState, actionId: string) {
  const option = options(state).find((candidate) => candidate.id === actionId);
  expect(
    option,
    `expected ${actionId} in ${state.current}; legal=[${options(state)
      .map((candidate) => candidate.id)
      .join(", ")}]`,
  ).toBeDefined();
  if (!option) throw new Error(`missing action ${actionId}`);
  const result = step(state, option.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  return { before: state, option, result, state: result.state };
}

function act(state: GameState, actionId: string): GameState {
  return apply(state, actionId).state;
}

/** Reach the race-house with the winch still shut. All three checks use real rules. */
function reachClosedRace({ readBook = true }: { readBook?: boolean } = {}): GameState {
  let state = initStateForRpgPack(index, 517);
  for (const actionId of ["talk_pell", "ask_ask_walk", "ask_leave_pell"]) {
    state = act(state, actionId);
  }
  if (readBook) state = act(state, "read_flood_book");
  for (const actionId of [
    "take_weir_iron",
    "take_life_line",
    "go_north",
    "use_weir_iron_on_head_rack",
    "go_north",
    "use_life_line_on_walk_span",
    "go_north",
  ]) {
    state = act(state, actionId);
  }
  expect(state).toMatchObject({ current: "race_house", ended: false });
  expect(state.flags.race_open).not.toBe(true);
  return state;
}

function reachCourseFork(opts: { readBook?: boolean } = {}): GameState {
  const state = act(reachClosedRace(opts), "use_weir_iron_on_race_winch");
  expect(state).toMatchObject({ current: "race_house", ended: false });
  expect(state.flags.race_open).toBe(true);
  return state;
}

function completeCourse(fork: GameState, actionId: (typeof CHOICE_IDS)[number]) {
  const selected = apply(structuredClone(fork), actionId);
  const ended = apply(selected.state, "go_north");
  return { selected, ended, observation: buildRpgObservation(index, ended.state) };
}

function choiceIds(state: GameState): string[] {
  return options(state)
    .map((option) => option.id)
    .filter((id) => (CHOICE_IDS as readonly string[]).includes(id));
}

function uiCourseFork(): GameSession {
  const session = GameSession.start(SOURCE, 517);
  const choose = (id: string): void => {
    const result = session.choose(id);
    expect(result.ok, result.rejection ?? undefined).toBe(true);
  };
  for (const id of [
    "talk_pell",
    "ask_ask_walk",
    "ask_leave_pell",
    "read_flood_book",
    "take_weir_iron",
    "take_life_line",
    "go_north",
  ]) {
    choose(id);
  }
  for (let tries = 0; !session.view().choices.some((choice) => choice.id === "go_north"); tries++) {
    if (tries > 40) throw new Error("head-rack never opened in UI session");
    choose("use_weir_iron_on_head_rack");
  }
  choose("go_north");
  choose("use_life_line_on_walk_span");
  choose("go_north");
  for (
    let tries = 0;
    !session.view().choices.some((choice) => (CHOICE_IDS as readonly string[]).includes(choice.id));
    tries++
  ) {
    if (tries > 40) throw new Error("relief-race never opened in UI session");
    choose("use_weir_iron_on_race_winch");
  }
  return session;
}

describe("Breaking Weir mandatory flood-course choice", () => {
  it("reveals both informed choices only after the race opens and blocks north until one is set", () => {
    const closed = reachClosedRace();
    const closedObservation = buildRpgObservation(index, closed);
    expect(choiceIds(closed)).toEqual([]);
    expect(closedObservation.visible_objects.map((object) => object.id)).not.toEqual(
      expect.arrayContaining(["stone_race_pin", "field_wash_pin"]),
    );
    expect(closedObservation.description).toMatch(/winter grain[^]*old works/i);
    expect(closedObservation.blocked_exits).toContainEqual(
      expect.objectContaining({
        direction: "north",
        message: expect.stringMatching(/course-frame/i),
      }),
    );

    const fork = act(closed, "use_weir_iron_on_race_winch");
    const observation = buildRpgObservation(index, fork);
    expect(fork.vars.score).toBe(35);
    expect(fork.ended).toBe(false);
    expect(choiceIds(fork)).toEqual(CHOICE_IDS);
    expect(options(fork).map((option) => option.id)).not.toContain("go_north");
    expect(observation.visible_objects.map((object) => object.id)).toEqual(
      expect.arrayContaining(["stone_race_pin", "field_wash_pin"]),
    );
    expect(observation.description).toMatch(/grain[^]*old works|old works[^]*grain/i);
    expect(observation.description).toMatch(/every house lives/i);
    expect(observation.blocked_exits).toContainEqual(
      expect.objectContaining({
        direction: "north",
        message: expect.stringMatching(/course-frame/i),
      }),
    );
  });

  it("makes the fork mutually exclusive, replay-safe, equal-cost, and one meaningful decision", () => {
    const fork = reachCourseFork();
    const forkHash = hashState(fork);
    const selectedBranches: GameState[] = [];
    const endedBranches: GameState[] = [];

    for (const course of COURSES) {
      const originalOptions = options(fork);
      const selected = apply(structuredClone(fork), course.actionId);
      expect(hashState(fork)).toBe(forkHash); // pure reducer: the common fork was not mutated
      expect(selected.state.step).toBe(fork.step + 1);
      expect(selected.state.flags[course.flag]).toBe(true);
      expect(selected.state.flags[course.otherFlag]).not.toBe(true);
      expect(selected.state.vars).toEqual(fork.vars);
      expect(selected.state.inventory).toEqual(fork.inventory);
      expect(choiceIds(selected.state)).toEqual([]);
      expect(options(selected.state).map((option) => option.id)).toContain("go_north");
      expect(
        classifyRpgJourneyDecision({
          action: selected.option.action,
          before: selected.before,
          after: selected.state,
          events: selected.result.events,
          accepted: true,
        }),
      ).toEqual({ countsTowardJourney: true, reason: "situation_changed" });

      // Neither the chosen pin nor its mutually-exclusive twin can be forced/replayed.
      const selectedHash = hashState(selected.state);
      for (const choiceId of CHOICE_IDS) {
        const staleAction = originalOptions.find((option) => option.id === choiceId)?.action;
        if (!staleAction) throw new Error(`missing fork action ${choiceId}`);
        const rejected = step(selected.state, staleAction);
        expect(rejected.ok).toBe(false);
        expect(hashState(rejected.state)).toBe(selectedHash);
      }

      const ended = act(selected.state, "go_north");
      expect(ended).toMatchObject({ ended: true, endingId: course.endingId });
      expect(ended.vars.score).toBe(50);
      expect(() => assertRpgStateReferences(index, ended)).not.toThrow();
      selectedBranches.push(selected.state);
      endedBranches.push(ended);
    }

    expect(selectedBranches[0]!.vars).toEqual(selectedBranches[1]!.vars);
    expect(selectedBranches[0]!.step).toBe(selectedBranches[1]!.step);
    expect(endedBranches[0]!.vars).toEqual(endedBranches[1]!.vars);
    expect(endedBranches[0]!.step).toBe(endedBranches[1]!.step);
  });

  it("renders both distinct endings truthfully with and without the optional flood-book", () => {
    expect(pack.win_conditions).toEqual([
      {
        id: "hold_the_fields",
        conditions: [{ visited: "valley_held" }, { has_flag: "flood_down_stone_race" }],
        ending: "ending_fields_held_race_spent",
      },
      {
        id: "hold_the_race",
        conditions: [{ visited: "valley_held" }, { has_flag: "flood_over_lower_fields" }],
        ending: "ending_race_held_fields_given",
      },
    ]);
    expect(pack.endings.map((ending) => ending.id)).toEqual([
      "ending_fields_held_race_spent",
      "ending_race_held_fields_given",
      "ending_swept",
    ]);

    for (const readBook of [true, false]) {
      const fork = reachCourseFork({ readBook });
      for (const course of COURSES) {
        const completed = completeCourse(fork, course.actionId);
        expect(completed.ended.state.flags[course.flag]).toBe(true);
        expect(completed.ended.state.flags[course.otherFlag]).not.toBe(true);
        expect(completed.observation).toMatchObject({
          ended: true,
          ending_id: course.endingId,
          score: readBook ? 50 : 45,
          ending: { id: course.endingId, title: course.endingTitle, death: false },
        });
        expect(completed.observation.ending?.text).toMatch(/every house dry/i);
        expect(completed.observation.ending?.text).toMatch(course.consequence);
        if (readBook) {
          expect(completed.observation.ending?.text).not.toMatch(/last marks unread/i);
        } else {
          expect(completed.observation.ending?.text).toMatch(/flood-book[^]*last marks unread/i);
        }
        expect(completed.observation.description).toContain(
          `Final score: ${readBook ? 50 : 45} of 50.`,
        );
      }
    }
  });

  it("projects the same two choices through the human, full MCP, and compact MCP surfaces", () => {
    const fork = reachCourseFork();
    const api = createToolApi({ root: process.cwd() });
    const started = api.start_world_quest({
      world_quest_id: "breaking_weir",
      seed: 517,
      compact_observation: false,
    });
    api.sessions.update(started.session_id, fork);

    const full = api.get_observation({
      session_id: started.session_id,
      compact_observation: false,
    }).observation;
    const compact = api.get_observation({
      session_id: started.session_id,
      compact_observation: true,
      include_actions: true,
    }).context;
    const fullMenu = api.list_legal_actions({
      session_id: started.session_id,
      compact_actions: false,
    });
    const compactMenu = api.list_legal_actions({
      session_id: started.session_id,
      compact_actions: true,
    });
    const ui = uiCourseFork().view();

    const fullChoices = full.available_actions.filter((action) =>
      (CHOICE_IDS as readonly string[]).includes(action.id),
    );
    const fullMenuChoices = fullMenu.actions.filter((action) =>
      (CHOICE_IDS as readonly string[]).includes(action.id),
    );
    expect(fullChoices.map((action) => action.id)).toEqual(CHOICE_IDS);
    expect(fullMenuChoices).toEqual(fullChoices);
    expect(compact.actions?.filter((id) => (CHOICE_IDS as readonly string[]).includes(id))).toEqual(
      CHOICE_IDS,
    );
    expect(
      compactMenu.actions.filter((id) => (CHOICE_IDS as readonly string[]).includes(id)),
    ).toEqual(CHOICE_IDS);
    expect(compact.objects).toEqual(expect.arrayContaining(["stone_race_pin", "field_wash_pin"]));
    expect(compact.blocked).toContainEqual(["north", expect.stringMatching(/course-frame/i)]);

    const uiChoices = ui.choices.filter((choice) =>
      (CHOICE_IDS as readonly string[]).includes(choice.id),
    );
    expect(uiChoices.map((choice) => choice.id)).toEqual(CHOICE_IDS);
    expect(uiChoices.map((choice) => choice.label)).toEqual(
      fullChoices.map((choice) => choice.command),
    );
    expect(ui.text).toBe(full.description);

    // Public menus contain only player-facing ids/commands, never hidden outcome routing.
    expect(JSON.stringify({ fullChoices, compactChoices: compact.actions, uiChoices })).not.toMatch(
      /flood_down_stone_race|flood_over_lower_fields|ending_fields|ending_race|win_conditions|set_flag/i,
    );
  });

  it("exports both authored ending identities through the RPG-to-overworld bridge", () => {
    const fork = reachCourseFork();
    for (const course of COURSES) {
      const finalState = completeCourse(fork, course.actionId).ended.state;
      const api = createToolApi({ root: process.cwd() });
      const started = launchBreakingWeir(api);
      api.sessions.update(started.rpgSessionId, finalState);
      expect(
        overworldQuestCompletionFromRpgSession(
          api.sessions.get(started.rpgSessionId),
          started.overworldSessionId,
        ),
      ).toEqual({
        questId: "breaking_weir",
        outcome: {
          endingId: course.endingId,
          endingTitle: course.endingTitle,
          death: false,
        },
      });
    }
  });
});
