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

const NORTH_PENDING_GUIDANCE =
  "North is blocked. Before HUNT, TALK TO Road Warden June Pike. During LURE, follow the shown CALL or feed action; feed is west, and the hatch is west then up. During DRIVE or FORTIFY, complete the shown gear action.";

const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("Wolf-Winter must compile");
const index = indexRpgPack(loaded.compiled.pack);
const FULL = { compact_context: false, compact_result: false } as const;
const LIVING_BOUNDARY =
  /(?:going north(?: now| without choosing LURE)? chooses HUNT|go north to choose HUNT)[^]*(?:permanently close(?:s)? (?:LURE, DRIVE, and FORTIFY|the other three plans)|closes (?:the )?other plans)/i;
const ROOT_COMMITMENT_MODEL =
  /Reviews choose nothing[^]*Choose LURE, DRIVE, or FORTIFY in review[^]*Choose HUNT with GO north or RELEASE JUNE[^]*One choice permanently closes the rest[^]*PREPARE SUPPORT chooses nothing/i;
const HUNT_BOUNDARY =
  /HUNT — Protect home and herd[^]*Wolves may die[^]*failure risks cattle[^]*Cade's tactics and padded byre-jerkin help[^]*Go north or RELEASE JUNE to choose/i;
const TRUNCATION_MARKER = /(?:\.\.\.\(\+\d+ chars\)|#[0-9a-f]{12}\b)/i;

function act(state: GameState, actionId: string, forcedRoll?: number): GameState {
  const option = enumerateRpgActions(index, state).find((candidate) => candidate.id === actionId);
  expect(option, `${actionId} must be legal in ${state.current}`).toBeDefined();
  if (!option) throw new Error(`Missing ${actionId}.`);
  let rules = buildRpgRules(index);
  if (forcedRoll !== undefined) {
    const roll = forcedRoll;
    rules = buildRpgRules(index, () => ({
      next: () => 0.5,
      int: (min, max) => {
        expect(roll).toBeGreaterThanOrEqual(min);
        expect(roll).toBeLessThanOrEqual(max);
        return roll;
      },
    }));
  }
  const result = makeStep(rules)(state, option.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  return result.state;
}

function observation(state: GameState) {
  return buildRpgObservation(index, state, {
    availableActions: enumerateRpgActions(index, state),
  });
}

function gameplayVars(state: GameState): Record<string, number> {
  return Object.fromEntries(
    Object.entries(state.vars).filter(([name]) => !name.startsWith("__dlg_")),
  );
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
    expect(rootDialogue.dialogue?.npc_text).toMatch(ROOT_COMMITMENT_MODEL);
    expect(rootDialogue.dialogue?.npc_text.trimEnd().length).toBeLessThanOrEqual(380);
    const rootPlanActions = rootDialogue.available_actions.filter((action) =>
      ["ask_hunt", "ask_lure", "ask_drive", "ask_fortify"].includes(action.id),
    );
    expect(rootPlanActions.map((action) => action.id)).toEqual([
      "ask_hunt",
      "ask_lure",
      "ask_drive",
      "ask_fortify",
    ]);
    const rootCommands = rootPlanActions.map((action) => action.command).join("\n");
    expect(rootCommands).toMatch(HUNT_BOUNDARY);
    expect(rootCommands).toMatch(
      /LURE — Move the wolves alive and protect the herd[^]*Costs Cade's last feed[^]*fence stays broken[^]*First-action failure adds 2 cattle alarm[^]*Review only/i,
    );
    expect(rootCommands).toMatch(
      /DRIVE — Evacuate people and cattle; wolves live[^]*Lose retreat and outer defense[^]*Crisis costs 6 HP, two cattle, or the rig[^]*Review only/i,
    );
    expect(rootCommands).toMatch(
      /FORTIFY — Protect home and herd until dawn; wolves live[^]*Lose retreat[^]*Cade's shutters and expose his property[^]*spend Albany's seals[^]*Review only/i,
    );
    expect(`${rootDialogue.dialogue?.npc_text}\n${rootCommands}`).not.toMatch(
      /\bset\b[^]*\bdrive\b[^]*\bwheel\b[^]*\bturn\b|\b(?:close|wait)\b[^]*\b(?:feint|rush)\b|\bDC\s*\d/i,
    );
    const compactRoot = compactRpgObservation(rootDialogue, rootDialogue.available_actions, {
      includeActions: true,
    });
    const compactRootDialogue = compactRoot.dialogue?.[1];
    expect(compactRootDialogue).toBe(rootDialogue.dialogue?.npc_text.trimEnd());
    expect(compactRootDialogue).toMatch(ROOT_COMMITMENT_MODEL);
    expect(compactRoot.choices?.slice(0, 4).map(([id]) => id)).toEqual([
      "ask_hunt",
      "ask_lure",
      "ask_drive",
      "ask_fortify",
    ]);
    expect(compactRoot.choices?.find(([id]) => id === "ask_hunt")?.[1]).toMatch(HUNT_BOUNDARY);
    expect(compactRootDialogue).not.toMatch(TRUNCATION_MARKER);

    const beforeHuntInspection = structuredClone(uncommitted);
    let huntInspection = act(structuredClone(uncommitted), "ask_hunt");
    expect(huntInspection).toMatchObject({
      current: beforeHuntInspection.current,
      flags: beforeHuntInspection.flags,
      inventory: beforeHuntInspection.inventory,
      journal: beforeHuntInspection.journal,
    });
    expect(gameplayVars(huntInspection)).toEqual(gameplayVars(beforeHuntInspection));
    expect(observation(huntInspection).available_actions.map((action) => action.id)).toEqual(
      expect.arrayContaining(["ask_prepare_hunt", "ask_hunt_back", "ask_leave"]),
    );
    huntInspection = act(huntInspection, "ask_prepare_hunt");
    expect(huntInspection).toMatchObject({
      current: beforeHuntInspection.current,
      flags: beforeHuntInspection.flags,
      inventory: beforeHuntInspection.inventory,
      journal: beforeHuntInspection.journal,
    });
    expect(gameplayVars(huntInspection)).toEqual(gameplayVars(beforeHuntInspection));
    uncommitted = act(uncommitted, "ask_lure");

    const lureDialogue = observation(uncommitted);
    expect(lureDialogue.dialogue?.npc_text).toMatch(LIVING_BOUNDARY);
    expect(lureDialogue.dialogue?.npc_text).toMatch(
      /failed first LAY action[^]*raises cattle alarm by 2[^]*cannot be retried[^]*fallen paling-rail recovery/i,
    );
    expect(compactRpgObservation(lureDialogue, [], { includeActions: true }).dialogue?.[1]).toMatch(
      LIVING_BOUNDARY,
    );
    expect(
      lureDialogue.available_actions.find((action) => action.id === "ask_lure_back")?.command,
    ).toMatch(
      /BACK[^]*Compare all four plans without choosing LURE[^]*Going north chooses HUNT[^]*closes LURE, DRIVE, and FORTIFY/i,
    );

    uncommitted = act(uncommitted, "ask_lure_back");
    const afterLureBack = observation(uncommitted);
    expect(afterLureBack.dialogue?.npc_text).toMatch(ROOT_COMMITMENT_MODEL);
    expect(
      afterLureBack.available_actions.find((action) => action.id === "ask_hunt")?.command,
    ).toMatch(HUNT_BOUNDARY);
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
      /READ day-book[^]*TALK TO old Cade the houndsman before going north[^]*Going north now chooses HUNT/i,
    );
    expect(beforeCrossing.description).toMatch(/yearling wolf/i);

    uncommitted = act(uncommitted, "read_day_book");
    const afterReading = observation(uncommitted);
    expect(afterReading.description).toMatch(LIVING_BOUNDARY);
    expect(afterReading.description).toMatch(/You read the wolf count/i);
    expect(afterReading.description).toMatch(/yearling wolf/i);
    expect(afterReading.description).not.toMatch(/worth reading before you leave the yard/i);

    uncommitted = act(uncommitted, "go_north");
    expect(uncommitted.current).toBe("paling_gap");
    uncommitted = act(uncommitted, "go_south");
    uncommitted = act(uncommitted, "talk_houndsman");
    const afterUncommittedCrossing = observation(uncommitted);
    expect(afterUncommittedCrossing.dialogue?.npc_text).toMatch(
      /Going north chose HUNT[^]*LURE, DRIVE, and FORTIFY are permanently closed/i,
    );
    expect(afterUncommittedCrossing.dialogue?.npc_text).not.toMatch(
      /before you cross|cross north uncommitted|crossing uncommitted/i,
    );
    expect(
      afterUncommittedCrossing.available_actions.find((action) => action.id === "ask_leave")
        ?.command,
    ).toBe("ask: LEAVE — Exit without choosing a plan.");
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
      /LURE is chosen[^]*Go west and TAKE Cade's winter-feed sack[^]*go east[^]*go north[^]*LAY[^]*CAST[^]*CAST/i,
    );
    expect(
      beforeCommittedCrossing.available_actions.find((action) => action.id === "ask_leave")
        ?.command,
    ).toMatch(/LEAVE[^]*Begin LURE[^]*Go west and TAKE Cade's winter-feed sack/i);
    committed = act(committed, "ask_leave");
    const committedPickup = observation(committed);
    expect(committedPickup.description).toMatch(
      /Go west and TAKE Cade's winter-feed sack[^]*Go east[^]*go north and LAY downwind feed line WITH Cade's winter-feed sack[^]*available only after you chose LURE/i,
    );
    expect(committedPickup.available_actions.map((action) => action.id)).toContain("go_west");
    const pendingNorth = committedPickup.blocked_exits.find(
      (exit) => exit.direction === "north",
    )?.message;
    expect(pendingNorth).toBe(NORTH_PENDING_GUIDANCE);
    expect(pendingNorth).toMatch(
      /During LURE[^]*shown CALL or feed action[^]*feed is west[^]*hatch is west then up/i,
    );
    const compactPickup = compactRpgObservation(
      committedPickup,
      committedPickup.available_actions.map((action) => action.id),
      { includeActions: true },
    );
    expect(compactPickup.text).toMatch(
      /go west[^]*TAKE Cade's winter-feed sack[^]*go east[^]*go north/i,
    );
    expect(compactPickup.actions).toContain("go_west");
    expect(compactPickup.blocked).toContainEqual(["north", NORTH_PENDING_GUIDANCE]);
    expect(compactPickup.blocked?.find(([direction]) => direction === "north")?.[1]).not.toMatch(
      TRUNCATION_MARKER,
    );
    committed = act(committed, "go_west");
    const committedStore = observation(committed);
    expect(committedStore.description).toMatch(
      /TAKE Cade's winter-feed sack before going to the Broken Paling[^]*only feed sack for LURE/i,
    );
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
      /LAY downwind feed line WITH Cade's winter-feed sack[^]*Before a failed LAY action[^]*paling-rail only supports combat[^]*After failure[^]*braced or bound rail can redirect the yearling alive[^]*MAKE a guarded strike and abandon the living recovery/i,
    );
    expect(compactRpgObservation(preFoulPaling, [], { includeActions: true }).text).toMatch(
      /LAY downwind feed line WITH Cade's winter-feed sack[^]*Before a failed LAY action[^]*paling-rail only supports combat[^]*After failure[^]*braced or bound rail can redirect the yearling alive[^]*MAKE a guarded strike and abandon the living recovery/i,
    );
    expect(enumerateRpgActions(index, committed).map((action) => action.id)).toContain(
      "use_winter_feed_sack_on_downwind_feed_line",
    );

    let docket = act(structuredClone(committed), "use_winter_feed_sack_on_downwind_feed_line", 1);
    docket = act(docket, "wedge_paling_rail", 1);
    docket = act(docket, "bind_paling_rail");
    docket = act(docket, "use_split_rail_guard_on_downwind_feed_line");
    docket = act(docket, "go_south");
    const docketYard = observation(docket);
    expect(docketYard.description).toMatch(
      /CALL Jamie's sealed relief protocol[^]*used once here[^]*carry the feed west/i,
    );
    expect(docketYard.available_actions.map((action) => action.id)).toContain(
      "use_relief_protocol_docket",
    );
    expect(docketYard.blocked_exits).toContainEqual({
      direction: "north",
      message: NORTH_PENDING_GUIDANCE,
    });
    const compactDocketYard = compactRpgObservation(
      docketYard,
      docketYard.available_actions.map((action) => action.id),
      { includeActions: true },
    );
    expect(compactDocketYard.text).toMatch(
      /CALL Jamie's sealed relief protocol[^]*used once here[^]*carry the feed west/i,
    );
    expect(compactDocketYard.actions).toContain("use_relief_protocol_docket");
    expect(compactDocketYard.blocked).toContainEqual(["north", NORTH_PENDING_GUIDANCE]);
    expect(NORTH_PENDING_GUIDANCE).toMatch(/During LURE[^]*shown CALL or feed action/i);

    committed = act(committed, "go_south");
    committed = act(committed, "talk_houndsman");
    const afterCommittedCrossing = observation(committed);
    expect(afterCommittedCrossing.dialogue?.npc_text).toMatch(
      /Continue LURE with the next action shown[^]*no replacement winter-feed sack[^]*no restart[^]*no plan change/i,
    );
    expect(afterCommittedCrossing.dialogue?.npc_text).not.toMatch(
      /before you cross|cross north uncommitted|crossing uncommitted|hunt-and-hold/i,
    );
    expect(
      afterCommittedCrossing.available_actions.find((action) => action.id === "ask_leave")?.command,
    ).toBe("ask: LEAVE — Exit without choosing a plan.");
  });
});
