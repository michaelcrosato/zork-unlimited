/**
 * Regression for seed4174 S2: an aid-only player without June could hear Cade's
 * lure, decline it, and cross the Broken Paling without seeing that the visit
 * retires every living-plan commitment. The boundary remains irreversible; this
 * pins its warning on both full/UI and compact/MCP projections.
 */
import { describe, expect, it } from "vitest";

import { makeStep } from "../../src/core/engine.js";
import { compactRpgObservation } from "../../src/mcp/compact_rpg_observation.js";
import { createToolApi } from "../../src/mcp/tools.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { buildRpgRules, enumerateRpgActions, indexRpgPack } from "../../src/rpg/runner.js";
import type { GameState } from "../../src/core/state.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";

const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("Wolf-Winter must compile");
const index = indexRpgPack(loaded.compiled.pack);
const FULL = { compact_context: false, compact_result: false } as const;
const LIVING_BOUNDARY =
  /cross (?:north )?uncommitted[^]*hunt[^]*(?:others shut|other plans close|closing lure\/drive\/fortify|retires[^]*feed lure[^]*signal drive[^]*seal-and-outlast)/i;
const TRUNCATION_MARKER = /(?:\.\.\.\(\+\d+ chars\)|#[0-9a-f]{12}\b)/i;

function act(state: GameState, actionId: string): GameState {
  const option = enumerateRpgActions(index, state).find((candidate) => candidate.id === actionId);
  expect(option, `${actionId} must be legal in ${state.current}`).toBeDefined();
  if (!option) throw new Error(`Missing ${actionId}.`);
  const result = makeStep(buildRpgRules(index))(state, option.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  return result.state;
}

function observation(state: GameState) {
  return buildRpgObservation(index, state, {
    availableActions: enumerateRpgActions(index, state),
  });
}

function launchSeed4174Imports(): GameState {
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
  const openingChoices = [
    "albany:ledger_advocate",
    "albany:oath_limited_aid_only",
    "albany:source_jamie_market_testimony",
    "albany:prep_relief_protocol",
  ] as const;
  for (const choice of openingChoices.slice(0, -2)) {
    api.choose_overworld_session_story({ ...FULL, session_id: sessionId, choice });
  }
  const sourced = api.choose_overworld_session_story({
    ...FULL,
    session_id: sessionId,
    choice: "albany:source_jamie_market_testimony",
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
    choice: openingChoices.at(-1)!,
  });
  const wolf = prepared.observation.quests.find((quest) => quest.id === "wolf_winter");
  if (!wolf) throw new Error("Jamie testimony and herd-calming must reveal Wolf-Winter.");
  api.choose_overworld_session_story({
    ...FULL,
    session_id: sessionId,
    story_choice_id: "albany:wolf_relief_allocation",
    choice: "albany:relief_resident_shelter",
  });

  const launched = api.start_overworld_session_quest({
    ...FULL,
    compact_observation: false,
    compact_actions: false,
    include_actions: true,
    session_id: sessionId,
    quest_id: "wolf_winter",
    approach_id: "albany:wolf_approach_sheltered_stockway",
    seed: 4174,
  });
  const state = structuredClone(api.sessions.get(launched.rpg_session_id).state);
  expect(state.flags.june_pike_present).not.toBe(true);
  expect(state.campaignImportReceipt?.applied_rules).toEqual(
    expect.arrayContaining([
      "import:wolf_winter_approach_sheltered_stockway",
      "import:wolf_winter_market_testimony",
      "import:wolf_winter_limited_aid_only",
      "import:wolf_winter_relief_protocol",
      "import:wolf_winter_relief_resident_shelter",
    ]),
  );
  return state;
}

describe("Wolf-Winter uncommitted living-plan boundary", () => {
  it("warns seed4174's no-June aid-only route before crossing, retires living actions after it, and preserves a committed lure", () => {
    let uncommitted = launchSeed4174Imports();
    uncommitted = act(uncommitted, "use_sheltered_stockway_last_mile");
    uncommitted = act(uncommitted, "talk_houndsman");
    const rootDialogue = observation(uncommitted);
    expect(rootDialogue.dialogue?.npc_text).toMatch(LIVING_BOUNDARY);
    expect(rootDialogue.dialogue?.npc_text).toMatch(
      /You came from Albany awake[^]*hunt kills pack[^]*holds herd\/byre[^]*risk death[^]*lure spares all if fed[^]*foul risks herd[^]*drive spares pack\/people[^]*defense lost[^]*crisis cost[^]*fortify spares all[^]*property\/seals[^]*no retreat/i,
    );
    expect(rootDialogue.dialogue?.npc_text).not.toMatch(/foul\s*=\s*(?:2|two) cattle/i);
    expect(rootDialogue.dialogue?.npc_text).toMatch(/lure[^]*drive[^]*fortify/i);
    const compactRootDialogue = compactRpgObservation(rootDialogue, [], {
      includeActions: true,
    }).dialogue?.[1];
    expect(compactRootDialogue).toBe(rootDialogue.dialogue?.npc_text.trimEnd());
    expect(compactRootDialogue).not.toMatch(TRUNCATION_MARKER);
    uncommitted = act(uncommitted, "ask_lure");

    const lureDialogue = observation(uncommitted);
    expect(lureDialogue.dialogue?.npc_text).toMatch(LIVING_BOUNDARY);
    expect(lureDialogue.dialogue?.npc_text).toMatch(
      /first foul risks two cattle[^]*no retry[^]*rail recovery/i,
    );
    expect(compactRpgObservation(lureDialogue, [], { includeActions: true }).dialogue?.[1]).toMatch(
      LIVING_BOUNDARY,
    );
    expect(
      lureDialogue.available_actions.find((action) => action.id === "ask_lure_back")?.command,
    ).toMatch(/crossing uncommitted[^]*hunt-and-hold[^]*permanently retires all living plans/i);

    uncommitted = act(uncommitted, "ask_lure_back");
    const afterLureBack = observation(uncommitted);
    expect(afterLureBack.dialogue?.npc_text).toMatch(LIVING_BOUNDARY);
    expect(afterLureBack.available_actions.map((action) => action.id)).toContain("ask_lure");
    const reopenedLure = act(uncommitted, "ask_lure");
    expect(observation(reopenedLure).available_actions.map((action) => action.id)).toContain(
      "ask_commit_lure",
    );
    expect(reopenedLure.flags.strategy_lure_committed).not.toBe(true);
    uncommitted = act(uncommitted, "ask_leave");

    const beforeCrossing = observation(uncommitted);
    expect(beforeCrossing.description).toMatch(LIVING_BOUNDARY);
    expect(compactRpgObservation(beforeCrossing, [], { includeActions: true }).text).toMatch(
      LIVING_BOUNDARY,
    );
    expect(beforeCrossing.description).toMatch(
      /lantern[^]*day-book[^]*worth reading[^]*before you leave the yard/i,
    );
    expect(beforeCrossing.description).toMatch(/young wolf/i);

    uncommitted = act(uncommitted, "read_day_book");
    const afterReading = observation(uncommitted);
    expect(afterReading.description).toMatch(LIVING_BOUNDARY);
    expect(afterReading.description).toMatch(/you checked its last wolf-count/i);
    expect(afterReading.description).toMatch(/young wolf/i);
    expect(afterReading.description).not.toMatch(/worth reading before you leave the yard/i);

    uncommitted = act(uncommitted, "go_north");
    expect(uncommitted.current).toBe("paling_gap");
    uncommitted = act(uncommitted, "go_south");
    uncommitted = act(uncommitted, "talk_houndsman");
    const afterUncommittedCrossing = observation(uncommitted);
    expect(afterUncommittedCrossing.dialogue?.npc_text).toMatch(
      /broken paling fixed hunt-and-hold[^]*commitments are permanently closed/i,
    );
    expect(afterUncommittedCrossing.dialogue?.npc_text).not.toMatch(
      /before you cross|cross north uncommitted|crossing uncommitted/i,
    );
    expect(
      afterUncommittedCrossing.available_actions.find((action) => action.id === "ask_leave")
        ?.command,
    ).toBe("ask: Leave Cade.");
    expect(enumerateRpgActions(index, uncommitted).map((action) => action.id)).not.toEqual(
      expect.arrayContaining(["ask_lure", "ask_drive", "ask_fortify", "ask_commit_lure"]),
    );

    let committed = launchSeed4174Imports();
    committed = act(committed, "use_sheltered_stockway_last_mile");
    committed = act(committed, "talk_houndsman");
    committed = act(committed, "ask_lure");
    committed = act(committed, "ask_commit_lure");
    expect(committed.flags.strategy_lure_committed).toBe(true);
    const beforeCommittedCrossing = observation(committed);
    expect(beforeCommittedCrossing.dialogue?.npc_text).not.toMatch(
      /cross north uncommitted|crossing uncommitted|hunt-and-hold/i,
    );
    expect(beforeCommittedCrossing.dialogue?.npc_text).toMatch(
      /store-shed west[^]*go west[^]*take the sack[^]*return east[^]*cross north/i,
    );
    expect(
      beforeCommittedCrossing.available_actions.find((action) => action.id === "ask_leave")
        ?.command,
    ).toMatch(/take the committed feed from the store-shed west/i);
    committed = act(committed, "ask_leave");
    const committedPickup = observation(committed);
    expect(committedPickup.description).toMatch(
      /released[^]*feed sack[^]*west[^]*take the winter-feed sack[^]*return east[^]*go north[^]*not available before you committed/i,
    );
    expect(committedPickup.available_actions.map((action) => action.id)).toContain("go_west");
    expect(committedPickup.blocked_exits.find((exit) => exit.direction === "north")?.message).toBe(
      "North waits for its live precondition: June's gate terms resolved; pre-cast feed, drive rig, shutters, or seals carried; or the first-lure west-up loft beat completed.",
    );
    expect(compactRpgObservation(committedPickup, [], { includeActions: true }).text).toMatch(
      /go west[^]*take the winter-feed sack[^]*return east[^]*go north/i,
    );
    committed = act(committed, "go_west");
    const committedStore = observation(committed);
    expect(committedStore.description).toMatch(/take the finite feed before the breach/i);
    expect(committedStore.available_actions.map((action) => action.id)).toContain(
      "take_winter_feed_sack",
    );
    committed = act(committed, "take_winter_feed_sack");
    committed = act(committed, "go_east");
    committed = act(committed, "go_north");
    expect(committed.current).toBe("paling_gap");
    expect(committed.flags.strategy_lure_committed).toBe(true);
    const preFoulPaling = observation(committed);
    expect(preFoulPaling.description).toMatch(
      /cast Cade's feed first[^]*before a foul[^]*rail is only a combat funnel[^]*if the cast fouls[^]*braced or bound rail can pen the yearling alive[^]*spear stroke commits the hybrid fight/i,
    );
    expect(compactRpgObservation(preFoulPaling, [], { includeActions: true }).text).toMatch(
      /cast Cade's feed first[^]*before a foul[^]*rail is only a combat funnel[^]*if the cast fouls[^]*braced or bound rail can pen the yearling alive[^]*spear stroke commits the hybrid fight/i,
    );
    expect(enumerateRpgActions(index, committed).map((action) => action.id)).toContain(
      "use_winter_feed_sack_on_downwind_feed_line",
    );
    committed = act(committed, "go_south");
    committed = act(committed, "talk_houndsman");
    const afterCommittedCrossing = observation(committed);
    expect(afterCommittedCrossing.dialogue?.npc_text).toMatch(/feed-and-hounds line is in motion/i);
    expect(afterCommittedCrossing.dialogue?.npc_text).not.toMatch(
      /before you cross|cross north uncommitted|crossing uncommitted|hunt-and-hold/i,
    );
    expect(
      afterCommittedCrossing.available_actions.find((action) => action.id === "ask_leave")?.command,
    ).toBe("ask: Leave Cade.");
  });
});
