import { describe, expect, it } from "vitest";

import { createToolApi } from "../../src/mcp/tools.js";
import {
  INITIAL_JOURNEY_GOAL,
  JOURNEY_CONTRACT_VERSION,
} from "../../src/world/journey_contract.js";
import {
  TANNERS_FEVER_ACCOUNTABILITY_CHOICE_IDS,
  TANNERS_FEVER_ACCOUNTABILITY_ID,
} from "../../src/world/journey_campaign.js";
import { planOverworldRoute } from "../../src/world/overworld.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { OverworldSession } from "../../ui/src/overworld.js";

const api = () => createToolApi({ root: process.cwd() });
const FULL_OVERWORLD = { compact_context: false, compact_result: false } as const;
const WORLD = loadOverworldManifest(process.cwd());
const HAYDEN_ID = "albany_city__transport_hub__contact";
const ALBANY_TO_SARATOGA = "road_albany_city__saratoga_springs_city";
const SARATOGA_TO_QUEENSBURY = "road_saratoga_springs_city__queensbury_town";

function moveUiSessionToArea(session: OverworldSession, destinationAreaId: string): void {
  const route = session
    .view()
    .areaExits.find((candidate) => candidate.destination.id === destinationAreaId);
  if (!route) throw new Error(`expected a route to ${destinationAreaId}`);
  session.moveArea(route.id);
}

function uiSessionAtPostGallowmereHayden(): OverworldSession {
  const session = new OverworldSession(WORLD);
  session.scoutPoi("albany_city__civic_core__poi");
  session.talkToCharacter("albany_city__civic_core__contact");
  session.chooseJourneyStory("albany:ledger_advocate");
  moveUiSessionToArea(session, "albany_city__market");
  session.scoutPoi("albany_city__market__poi");
  moveUiSessionToArea(session, "albany_city__transport_hub");
  session.startQuest("wolf_winter");
  session.completeQuest("wolf_winter", {
    endingId: "ending_held_timber_saved",
    endingTitle: "The Byre Held, Paling Timber Saved",
    death: false,
  });
  session.chooseJourney("continue");
  session.chooseJourneyStory("send_wagon_to_cade");

  session.travel(ALBANY_TO_SARATOGA);
  if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
  session.travel(SARATOGA_TO_QUEENSBURY);
  if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
  session.exploreArea("queensbury_town__civic_core");
  moveUiSessionToArea(session, "queensbury_town__market");
  session.startQuest("gallowmere");
  session.completeQuest("gallowmere", {
    endingId: "ending_victory",
    endingTitle: "The Gallowmere Broken",
    death: false,
  });
  session.chooseJourney("continue");

  session.travel(SARATOGA_TO_QUEENSBURY);
  if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
  session.travel(ALBANY_TO_SARATOGA);
  if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
  expect(session.view()).toMatchObject({
    current: { id: "albany_city" },
    currentArea: { id: "albany_city__transport_hub" },
  });
  return session;
}

function uiSessionAtAlbanyStoryChoice(): OverworldSession {
  const session = new OverworldSession(WORLD);
  const opening = session.view();
  session.scoutPoi(opening.pois[0]!.id);
  const revealed = session.talkToCharacter(opening.characters[0]!.id);
  if (session.journey().storyChoice?.kind === "registration") {
    session.chooseJourneyStory("albany:ledger_advocate");
  }
  const quest = revealed.discoveredQuests?.find((candidate) => candidate.id === "wolf_winter");
  if (!quest) throw new Error("expected the Albany Wolf-Winter lead");
  const route = session
    .view()
    .areaExits.find((candidate) => candidate.destination.id === quest.area);
  if (!route) throw new Error("expected a route to the Albany lead");
  session.moveArea(route.id);
  session.startQuest(quest.id);
  session.completeQuest(quest.id, {
    endingId: "ending_held",
    endingTitle: "The Byre Held",
    death: false,
  });
  session.chooseJourney("continue");
  if (!session.journey().storyChoice) throw new Error("expected Albany's dawn dispatch");
  return session;
}

function continueFixedCheckpoint(session: OverworldSession): void {
  const pending = session.journey().pendingChoice;
  if (!pending) return;
  expect(pending.reasons).toContain("checkpoint");
  expect(pending.reasons).not.toContain("goal_completed");
  session.chooseJourney("continue");
}

function travelUiSessionToTown(session: OverworldSession, destinationTownId: string): void {
  const route = planOverworldRoute(WORLD, session.view().current.id, destinationTownId);
  if (!route) throw new Error(`expected a route to ${destinationTownId}`);
  for (const step of route.steps) {
    session.travel(step.edge.id);
    continueFixedCheckpoint(session);
    if (session.view().pendingRoadEncounter) {
      session.resolveRoadEncounter("press_on");
      continueFixedCheckpoint(session);
    }
  }
}

function uiSessionAtTannersAccountabilityChoice(): OverworldSession {
  const session = uiSessionAtPostGallowmereHayden();
  travelUiSessionToTown(session, "oneonta_city");
  session.exploreArea("oneonta_city__civic_core");
  continueFixedCheckpoint(session);
  moveUiSessionToArea(session, "oneonta_city__market");
  continueFixedCheckpoint(session);
  session.startQuest("tanners_fever");
  continueFixedCheckpoint(session);
  session.completeQuest("tanners_fever", {
    endingId: "ending_recovered",
    endingTitle: "The Meadowsweet",
    death: false,
  });
  expect(session.journey().pendingChoice?.reasons).toContain("goal_completed");
  session.chooseJourney("continue");
  expect(session.journey().storyChoice?.id).toBe(TANNERS_FEVER_ACCOUNTABILITY_ID);
  return session;
}

function mcpWolfWinterCheckpointInsideQuest() {
  const a = api();
  const started = a.start_overworld({ compact_context: false });
  const overworldSessionId = started.session_id;

  let view = started.observation;
  a.scout_overworld_session_poi({
    ...FULL_OVERWORLD,
    session_id: overworldSessionId,
    poi_id: view.pois[0]!.id,
  });
  view = a.get_overworld_session({
    session_id: overworldSessionId,
    include_observation: true,
  }).observation;
  const rowan = view.characters[0];
  if (!rowan) throw new Error("expected Albany registration contact");
  const registrationTalk = a.talk_overworld_session_contact({
    ...FULL_OVERWORLD,
    session_id: overworldSessionId,
    character_id: rowan.id,
  });
  a.choose_overworld_session_story({
    ...FULL_OVERWORLD,
    session_id: overworldSessionId,
    choice: "albany:ledger_advocate",
  });
  view = a.get_overworld_session({
    session_id: overworldSessionId,
    include_observation: true,
  }).observation;

  const marketRoute = view.areaExits.find(
    (route) => route.destination.id === "albany_city__market",
  );
  if (!marketRoute) throw new Error("expected Albany market route");
  a.move_overworld_session_area({
    ...FULL_OVERWORLD,
    session_id: overworldSessionId,
    area_route_id: marketRoute.id,
  });
  view = a.get_overworld_session({
    session_id: overworldSessionId,
    include_observation: true,
  }).observation;

  const revealed = a.scout_overworld_session_poi({
    ...FULL_OVERWORLD,
    session_id: overworldSessionId,
    poi_id: view.pois[0]!.id,
  });
  const quest = registrationTalk.result.discoveredQuests?.find(
    (candidate) => candidate.id === "wolf_winter",
  );
  if (!quest) throw new Error("expected Albany quest lead");
  const questRoute = revealed.observation.areaExits.find(
    (route) => route.destination.id === quest.area,
  );
  if (!questRoute) throw new Error("expected route to quest area");
  a.move_overworld_session_area({
    ...FULL_OVERWORLD,
    session_id: overworldSessionId,
    area_route_id: questRoute.id,
  });
  view = a.get_overworld_session({
    session_id: overworldSessionId,
    include_observation: true,
  }).observation;

  const contact = view.characters[0];
  if (!contact) throw new Error("expected quest-area contact");
  let journey = a.talk_overworld_session_contact({
    ...FULL_OVERWORLD,
    session_id: overworldSessionId,
    character_id: contact.id,
  }).journey;
  expect(journey.acceptedDecisions).toBe(7);

  // Reach decision 37 through real reversible local movement, so quest start and
  // two accepted quest moves put the checkpoint inside the RPG at decision 40.
  while (journey.acceptedDecisions < 37) {
    const current = a.get_overworld_session({
      session_id: overworldSessionId,
      include_observation: true,
    }).observation;
    const route =
      current.currentArea?.id === quest.area
        ? current.areaExits[0]
        : current.areaExits.find((candidate) => candidate.destination.id === quest.area);
    if (!route) throw new Error("expected a reversible Albany area route");
    journey = a.move_overworld_session_area({
      ...FULL_OVERWORLD,
      session_id: overworldSessionId,
      area_route_id: route.id,
    }).journey;
  }
  expect(
    a.get_overworld_session({ session_id: overworldSessionId, include_observation: true })
      .observation.currentArea?.id,
  ).toBe(quest.area);

  const launched = a.start_overworld_session_quest({
    ...FULL_OVERWORLD,
    compact_observation: false,
    session_id: overworldSessionId,
    quest_id: quest.id,
  });
  expect(launched.journey).toMatchObject({
    status: "active",
    acceptedDecisions: 38,
    nextCheckpoint: 40,
    pendingChoice: null,
  });

  const enteredYard = a.step_action({
    session_id: launched.rpg_session_id,
    action_id: "go_north",
    expected_state_hash: launched.rpg_session.state_hash,
    compact_observation: false,
    compact_events: false,
  });
  if (enteredYard.ok !== true) throw new Error("expected the first quest move to succeed");
  expect(enteredYard).toMatchObject({
    ok: true,
    journey: { status: "active", acceptedDecisions: 39 },
    observation: { room: "byre_yard" },
  });
  const staleActionIds = enteredYard.observation.available_actions.map((action) => action.id);
  expect(staleActionIds).toEqual(
    expect.arrayContaining(["go_north", "go_west", "read_day_book", "talk_houndsman"]),
  );

  const checkpoint = a.step_action({
    session_id: launched.rpg_session_id,
    action_id: "go_north",
    expected_state_hash: enteredYard.state_hash,
    compact_observation: false,
    compact_events: false,
  });
  if (checkpoint.ok !== true) throw new Error("expected the checkpoint quest move to succeed");
  const checkpointJourney = checkpoint.journey;
  if (!checkpointJourney) throw new Error("expected the embedded parent journey");
  expect(checkpoint).toMatchObject({
    ok: true,
    journey: {
      status: "awaiting_choice",
      acceptedDecisions: 40,
      nextCheckpoint: 40,
      decisionProof: {
        last: { number: 40, surface: "quest", actionId: "go_north", reason: "movement" },
      },
    },
    observation: { room: "paling_gap", available_actions: [] },
  });
  expect(checkpointJourney.pendingChoice?.options.map((option) => option.id)).toEqual([
    "continue",
    "end",
  ]);
  expect(checkpoint.overworld_snapshot_hash).not.toBe(launched.snapshot_hash);
  expect(a.sessions.get(launched.rpg_session_id).state.current).toBe("paling_gap");
  const fullRpgStateHash = a.sessions.get(launched.rpg_session_id).stateHash;

  return {
    a,
    overworldSessionId,
    rpgSessionId: launched.rpg_session_id,
    checkpoint,
    checkpointJourney,
    fullRpgStateHash,
    staleActionIds,
  };
}

describe("MCP journey surface", () => {
  it("keeps the human contact line in the default compact action result", () => {
    const a = api();
    const compactStart = a.start_overworld();
    const fullStart = a.start_overworld({ compact_context: false });
    const compactContact = compactStart.context.contacts[0];
    const fullContact = fullStart.observation.characters.find(
      (candidate) => candidate.id === compactContact?.[0],
    );
    if (!compactContact || !fullContact) throw new Error("expected the Albany contact");

    const compact = a.talk_overworld_session_contact({
      session_id: compactStart.session_id,
      character_id: compactContact[0],
    });
    const full = a.talk_overworld_session_contact({
      ...FULL_OVERWORLD,
      session_id: fullStart.session_id,
      character_id: fullContact.id,
    });

    expect(compact.result.text).toBe(full.result.entry.text);
    expect(compact.result.text).toContain("Rowan Quill");
    expect(compact.result.text).toContain("what matters before the office closes");
    expect("observation" in compact).toBe(false);
    expect(JSON.stringify(compact.result)).not.toContain(full.result.entry.id);
  });

  it("shares only Hayden's active post-Gallowmere copy across UI, full MCP, and compact MCP", () => {
    const source = uiSessionAtPostGallowmereHayden();
    const snapshot = source.snapshot();
    const sourceHash = source.snapshotHash();
    const ui = OverworldSession.restore(WORLD, snapshot);
    const uiCard = ui.view().characters.find((character) => character.id === HAYDEN_ID);
    if (!uiCard) throw new Error("expected Hayden's UI contact card");

    const a = api();
    const full = a.restore_overworld_session({
      ...FULL_OVERWORLD,
      snapshot,
    });
    const compact = a.restore_overworld_session({
      snapshot,
      compact_context: true,
      compact_result: true,
    });
    expect(compact.snapshot_hash).toBe(full.snapshot_hash);
    expect(sourceHash.startsWith(full.snapshot_hash)).toBe(true);

    const fullCard = full.observation.characters.find((character) => character.id === HAYDEN_ID);
    const compactCard = compact.context.contacts.find(([characterId]) => characterId === HAYDEN_ID);
    expect(fullCard).toEqual(uiCard);
    expect(compactCard).toEqual([HAYDEN_ID, "Hayden Hale"]);
    expect(uiCard).not.toHaveProperty("variants");

    const observationPayload = JSON.stringify({
      ui: ui.view(),
      full: full.observation,
      compact: compact.context,
    });
    expect(observationPayload).not.toMatch(
      /"variants"|"after_quests"|wolf_winter_closed|wolf_winter_and_gallowmere_closed/i,
    );
    expect(observationPayload).not.toMatch(
      /packet Rowan flagged|before the cattle are lost|return board|other live report in that chain/i,
    );

    const uiTalk = ui.talkToCharacter(HAYDEN_ID);
    const fullTalk = a.talk_overworld_session_contact({
      ...FULL_OVERWORLD,
      session_id: full.session_id,
      character_id: HAYDEN_ID,
    });
    const compactTalk = a.talk_overworld_session_contact({
      session_id: compact.session_id,
      character_id: HAYDEN_ID,
      compact_context: true,
      compact_result: true,
    });
    expect(fullTalk.result.entry.text).toBe(uiTalk.entry.text);
    expect(compactTalk.result.text).toBe(uiTalk.entry.text);
    expect(uiTalk.entry.text).toBe(`${uiCard.summary} ${uiCard.agenda}`);
    expect(uiTalk.entry.text).toMatch(/Cade/i);
    expect(uiTalk.entry.text).toMatch(/Hedrick|Gallowmere/i);
    expect(uiTalk.entry.text).toMatch(/current journey goal|journey ledger/i);
    expect(uiTalk.entry.text).not.toMatch(/packet Rowan flagged|before the cattle are lost/i);
    expect(fullTalk.journey).toEqual(ui.journey());
    expect(compactTalk.journey).toEqual(ui.journey());
    expect(compactTalk.snapshot_hash).toBe(fullTalk.snapshot_hash);
    expect(ui.snapshotHash().startsWith(fullTalk.snapshot_hash)).toBe(true);
  });

  it("keeps the canonical journey at the response root across compact and full play", () => {
    const a = api();
    const compact = a.start_overworld();
    const full = a.start_overworld({ compact_context: false });

    expect(compact.journey).toMatchObject({
      contractVersion: JOURNEY_CONTRACT_VERSION,
      status: "active",
      goal: { ...INITIAL_JOURNEY_GOAL, status: "active", completedAtDecision: null },
      acceptedDecisions: 0,
      baselineDecisions: 40,
      nextCheckpoint: 40,
      goalGuidance: null,
      pendingChoice: null,
    });
    expect(full.journey).toEqual(compact.journey);

    const reread = a.get_overworld_session_context({ session_id: compact.session_id });
    expect(reread.journey).toEqual(compact.journey);
    const unchanged = a.get_overworld_session_context({
      session_id: compact.session_id,
      if_snapshot_hash: compact.snapshot_hash,
    });
    expect(unchanged).toMatchObject({ unchanged: true, journey: compact.journey });

    const poi = full.observation.pois[0]!;
    const acted = a.scout_overworld_session_poi({
      ...FULL_OVERWORLD,
      session_id: full.session_id,
      poi_id: poi.id,
    });
    expect(acted.journeyDecision).toEqual({
      countsTowardJourney: true,
      reason: "stateful_clue",
    });
    const compactObservation = a.get_overworld_session({
      session_id: compact.session_id,
      include_observation: true,
    }).observation;
    const compactActed = a.scout_overworld_session_poi({
      session_id: compact.session_id,
      poi_id: compactObservation.pois[0]!.id,
      compact_context: true,
      compact_result: true,
    });
    expect(compactActed.journeyDecision).toEqual(acted.journeyDecision);
    expect(compactActed.journey.acceptedDecisions).toBe(1);
    expect(compactActed.journey.decisionProof).toEqual(acted.journey.decisionProof);
    expect(acted.journey.acceptedDecisions).toBe(1);
    expect(acted.snapshot_hash).not.toBe(full.snapshot_hash);
    expect(acted.journey).toEqual(
      a.get_overworld_session({
        session_id: full.session_id,
        include_observation: true,
      }).journey,
    );
  });

  it("makes a pending parent choice the only legal move inside an embedded quest", () => {
    const { a, overworldSessionId, rpgSessionId, checkpoint, checkpointJourney, fullRpgStateHash } =
      mcpWolfWinterCheckpointInsideQuest();
    const checkpointProof = checkpointJourney.decisionProof;
    const checkpointRpgHash = checkpoint.state_hash;

    const observed = a.get_observation({
      session_id: rpgSessionId,
      compact_observation: false,
    });
    expect(observed.journey).toEqual(checkpointJourney);
    expect(observed.overworld_snapshot_hash).toBe(checkpoint.overworld_snapshot_hash);
    expect(observed.observation.available_actions).toEqual([]);
    expect(
      a.list_legal_actions({ session_id: rpgSessionId, compact_actions: true }).actions,
    ).toEqual([]);

    const blocked = a.step_action({
      session_id: rpgSessionId,
      action_id: "not_a_legal_action",
      compact_observation: false,
      compact_events: false,
    });
    expect(blocked).toMatchObject({
      ok: false,
      journey: { status: "awaiting_choice", acceptedDecisions: 40 },
      overworld_snapshot_hash: checkpoint.overworld_snapshot_hash,
    });
    expect(blocked.observation.available_actions).toEqual([]);

    const continued = a.choose_overworld_session_journey({
      ...FULL_OVERWORLD,
      compact_observation: false,
      session_id: overworldSessionId,
      choice: "continue",
    });
    expect(continued.result.exitReceipt).toBeNull();
    expect(continued.journey).toMatchObject({
      status: "active",
      acceptedDecisions: 40,
      nextCheckpoint: 80,
      pendingChoice: null,
    });
    expect(continued.journey.decisionProof).toEqual(checkpointProof);
    expect(continued.result.retentionEvent).toMatchObject({
      atDecision: 40,
      checkpoint: 40,
      choice: "continue",
      decisionProofHash: checkpointProof.hash,
    });
    expect(continued.snapshot_hash).not.toBe(checkpoint.overworld_snapshot_hash);
    expect(continued.rpg_session_id).toBe(rpgSessionId);
    const resumed = continued.rpg_session;
    if (!resumed) throw new Error("expected Continue to resume the embedded quest");
    expect(resumed).toMatchObject({
      session_id: rpgSessionId,
      state_hash: checkpointRpgHash,
      world_quest_id: "wolf_winter",
      journey: continued.journey,
      overworld_snapshot_hash: continued.snapshot_hash,
    });

    const resumedIds = resumed.observation.available_actions.map((action) => action.id);
    const listed = a.list_legal_actions({ session_id: rpgSessionId, compact_actions: true });
    expect(resumedIds).toEqual(listed.actions);
    expect(resumedIds).toEqual([
      "go_south",
      "examine_paling_rail",
      "examine_relief_spear",
      "use_paling_rail",
      "look_around",
      "inventory",
      "maneuver_yearling_wolf_set_spear",
    ]);
    for (const staleId of [
      "go_north",
      "go_west",
      "examine_day_book",
      "read_day_book",
      "talk_houndsman",
    ]) {
      expect(resumedIds).not.toContain(staleId);
    }

    const reread = a.get_observation({
      session_id: rpgSessionId,
      compact_observation: false,
    });
    expect(resumed.observation).toEqual(reread.observation);
    expect(resumed.state_hash).toBe(reread.state_hash);
    expect(a.sessions.get(rpgSessionId).stateHash).toBe(fullRpgStateHash);

    // The action returned directly by Continue is executable without guessing or
    // fetching a replacement menu.
    const stepped = a.step_action({
      session_id: rpgSessionId,
      action_id: resumedIds[0]!,
      expected_state_hash: resumed.state_hash,
      compact_observation: true,
      compact_events: true,
    });
    expect(stepped.ok).toBe(true);
    expect(stepped.journey).toMatchObject({ status: "active", acceptedDecisions: 41 });
    expect(stepped.overworld_snapshot_hash).not.toBe(continued.snapshot_hash);
  });

  it("resumes compact quest context after Continue and never exposes it after End", () => {
    const continuedRun = mcpWolfWinterCheckpointInsideQuest();
    const continued = continuedRun.a.choose_overworld_session_journey({
      session_id: continuedRun.overworldSessionId,
      choice: "continue",
    });
    expect(continued.rpg_session_id).toBe(continuedRun.rpgSessionId);
    const resumed = continued.rpg_session;
    if (!resumed) throw new Error("expected compact Continue to resume the embedded quest");
    expect(resumed.state_hash).toBe(continuedRun.checkpoint.state_hash);
    expect(resumed.context.actions).toEqual([
      "go_south",
      "examine_paling_rail",
      "examine_relief_spear",
      "use_paling_rail",
      "look_around",
      "inventory",
      "maneuver_yearling_wolf_set_spear",
    ]);
    const compactReread = continuedRun.a.get_observation({
      session_id: continuedRun.rpgSessionId,
      compact_observation: true,
      include_actions: true,
    });
    expect(resumed.context).toEqual(compactReread.context);
    expect(resumed.journey).toEqual(continued.journey);
    expect(resumed.overworld_snapshot_hash).toBe(continued.snapshot_hash);

    const endedRun = mcpWolfWinterCheckpointInsideQuest();
    const ended = endedRun.a.choose_overworld_session_journey({
      session_id: endedRun.overworldSessionId,
      choice: "end",
    });
    expect(ended.journey.status).toBe("ended");
    expect(ended.result.exitReceipt).not.toBeNull();
    expect(ended).not.toHaveProperty("rpg_session_id");
    expect(ended).not.toHaveProperty("rpg_session");
    expect(endedRun.a.sessions.embeddedJourneyPause(endedRun.overworldSessionId)).toBeNull();
  });

  it("shares one story-choice presentation with the UI and rejects forged embedded authority", () => {
    const uiSession = uiSessionAtAlbanyStoryChoice();
    const uiJourney = uiSession.journey();
    const snapshot = uiSession.snapshot();
    const a = api();
    const restored = a.restore_overworld_session({
      snapshot,
      compact_context: false,
      compact_result: false,
    });

    expect(restored.journey).toEqual(uiJourney);
    expect(
      a.get_overworld_session_context({
        session_id: restored.session_id,
        compact_context: true,
      }).journey,
    ).toEqual(uiJourney);
    expect(Object.keys(restored.journey.storyChoice!).sort()).toEqual(["id", "message", "options"]);
    for (const option of restored.journey.storyChoice!.options) {
      expect(Object.keys(option).sort()).toEqual(["consequence", "id", "label"]);
    }
    const playerChoicePayload = JSON.stringify({
      goal: restored.journey.goal,
      storyChoice: restored.journey.storyChoice,
    });
    expect(playerChoicePayload).not.toMatch(
      /targetQuestId|endingId|ending_held|wolf_winter|content\/rpg|win_conditions|maneuver_/i,
    );

    expect(() =>
      (a.start_world_quest as (args: Record<string, unknown>) => unknown)({
        world_quest_id: "wolf_winter",
        seed: 1,
        overworldSessionId: restored.session_id,
      }),
    ).toThrow(/does not accept embedded field "overworldSessionId"/);
    expect(() => a.rest_overworld_session({ session_id: restored.session_id })).toThrow(
      /presented story consequence/i,
    );

    const uiBranch = OverworldSession.restore(WORLD, snapshot);
    const uiResult = uiBranch.chooseJourneyStory("send_wagon_to_cade");
    const mcpBranch = a.choose_overworld_session_story({
      session_id: restored.session_id,
      choice: "send_wagon_to_cade",
      compact_context: false,
      compact_result: false,
    });
    expect(mcpBranch.result).toEqual(uiResult);
    expect(mcpBranch.journey).toEqual(uiBranch.journey());
    expect(mcpBranch.journey.storyChoice).toBeNull();
    expect(mcpBranch.journey.goalGuidance).toBe(
      "Objective route: take the road toward Saratoga Springs city. Queensbury town is 2 roads and about 60 road minutes away.",
    );
    expect(JSON.stringify(mcpBranch.journey.goalGuidance)).not.toMatch(
      /targetQuestId|endingId|wolf_winter|content\/rpg|win_conditions|maneuver_/i,
    );
  });

  it.each(TANNERS_FEVER_ACCOUNTABILITY_CHOICE_IDS)(
    "routes the visible Tanner accountability option %s through the generic handler",
    (choiceId) => {
      const uiSession = uiSessionAtTannersAccountabilityChoice();
      const uiJourney = uiSession.journey();
      const snapshot = uiSession.snapshot();
      expect(uiJourney.storyChoice?.options.map((option) => option.id)).toEqual(
        TANNERS_FEVER_ACCOUNTABILITY_CHOICE_IDS,
      );

      const a = api();
      const restored = a.restore_overworld_session({
        snapshot,
        compact_context: false,
        compact_result: false,
      });
      expect(restored.journey).toEqual(uiJourney);

      const uiBranch = OverworldSession.restore(WORLD, snapshot);
      const uiResult = uiBranch.chooseJourneyStory(choiceId);
      const mcpBranch = a.choose_overworld_session_story({
        session_id: restored.session_id,
        choice: choiceId,
        compact_context: false,
        compact_result: false,
      });

      expect(mcpBranch.result).toEqual(uiResult);
      expect(mcpBranch.result).toMatchObject({
        storyChoiceId: TANNERS_FEVER_ACCOUNTABILITY_ID,
        choiceId,
        journeyDecision: { countsTowardJourney: true, reason: "situation_changed" },
      });
      expect(mcpBranch.journey).toEqual(uiBranch.journey());
      expect(mcpBranch.journey.storyChoice).toBeNull();
      expect(JSON.stringify({ result: mcpBranch.result, journey: mcpBranch.journey })).not.toMatch(
        /targetQuestId|targetTownId|targetAreaId|questOutcomeIds|endingId|content\/rpg/i,
      );
    },
  );
});
