import { describe, expect, it } from "vitest";

import { createToolApi } from "../../src/mcp/tools.js";
import {
  INITIAL_JOURNEY_GOAL,
  JOURNEY_CONTRACT_VERSION,
} from "../../src/world/journey_contract.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { OverworldSession } from "../../ui/src/overworld.js";

const api = () => createToolApi({ root: process.cwd() });
const FULL_OVERWORLD = { compact_context: false, compact_result: false } as const;
const WORLD = loadOverworldManifest(process.cwd());

function uiSessionAtAlbanyStoryChoice(): OverworldSession {
  const session = new OverworldSession(WORLD);
  const opening = session.view();
  session.scoutPoi(opening.pois[0]!.id);
  const revealed = session.talkToCharacter(opening.characters[0]!.id);
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
    const a = api();
    const started = a.start_overworld({ compact_context: false });
    const sessionId = started.session_id;

    let view = started.observation;
    a.scout_overworld_session_poi({
      ...FULL_OVERWORLD,
      session_id: sessionId,
      poi_id: view.pois[0]!.id,
    });
    view = a.get_overworld_session({
      session_id: sessionId,
      include_observation: true,
    }).observation;

    const marketRoute = view.areaExits.find(
      (route) => route.destination.id === "albany_city__market",
    );
    if (!marketRoute) throw new Error("expected Albany market route");
    a.move_overworld_session_area({
      ...FULL_OVERWORLD,
      session_id: sessionId,
      area_route_id: marketRoute.id,
    });
    view = a.get_overworld_session({
      session_id: sessionId,
      include_observation: true,
    }).observation;

    const revealed = a.scout_overworld_session_poi({
      ...FULL_OVERWORLD,
      session_id: sessionId,
      poi_id: view.pois[0]!.id,
    });
    const quest = revealed.result.discoveredQuests?.[0];
    if (!quest) throw new Error("expected Albany quest lead");
    const questRoute = revealed.observation.areaExits.find(
      (route) => route.destination.id === quest.area,
    );
    if (!questRoute) throw new Error("expected route to quest area");
    a.move_overworld_session_area({
      ...FULL_OVERWORLD,
      session_id: sessionId,
      area_route_id: questRoute.id,
    });
    view = a.get_overworld_session({
      session_id: sessionId,
      include_observation: true,
    }).observation;

    const contact = view.characters[0];
    if (!contact) throw new Error("expected quest-area contact");
    let journey = a.talk_overworld_session_contact({
      ...FULL_OVERWORLD,
      session_id: sessionId,
      character_id: contact.id,
    }).journey;
    expect(journey.acceptedDecisions).toBe(5);

    // Navigation remains a meaningful decision on every traversal. Bounce over
    // one real area edge so the quest start itself lands exactly on checkpoint 40.
    while (journey.acceptedDecisions < 39) {
      const current = a.get_overworld_session({
        session_id: sessionId,
        include_observation: true,
      }).observation;
      const route =
        current.currentArea?.id === quest.area
          ? current.areaExits[0]
          : current.areaExits.find((candidate) => candidate.destination.id === quest.area);
      if (!route) throw new Error("expected a reversible Albany area route");
      journey = a.move_overworld_session_area({
        ...FULL_OVERWORLD,
        session_id: sessionId,
        area_route_id: route.id,
      }).journey;
    }
    expect(
      a.get_overworld_session({ session_id: sessionId, include_observation: true }).observation
        .currentArea?.id,
    ).toBe(quest.area);

    const launched = a.start_overworld_session_quest({
      ...FULL_OVERWORLD,
      compact_observation: false,
      session_id: sessionId,
      quest_id: quest.id,
    });
    expect(launched.journey).toMatchObject({
      status: "awaiting_choice",
      acceptedDecisions: 40,
      nextCheckpoint: 40,
    });
    expect(launched.journey.pendingChoice?.options.map((option) => option.id)).toEqual([
      "continue",
      "end",
    ]);
    expect(launched.rpg_session.observation.available_actions).toEqual([]);
    expect(launched.overworld_snapshot_hash).toBe(launched.snapshot_hash);

    const observed = a.get_observation({
      session_id: launched.rpg_session_id,
      compact_observation: false,
    });
    expect(observed.journey).toEqual(launched.journey);
    expect(observed.overworld_snapshot_hash).toBe(launched.snapshot_hash);
    expect(observed.observation.available_actions).toEqual([]);
    expect(
      a.list_legal_actions({ session_id: launched.rpg_session_id, compact_actions: true }).actions,
    ).toEqual([]);

    const blocked = a.step_action({
      session_id: launched.rpg_session_id,
      action_id: "not_a_legal_action",
      compact_observation: false,
      compact_events: false,
    });
    expect(blocked).toMatchObject({
      ok: false,
      journey: { status: "awaiting_choice", acceptedDecisions: 40 },
      overworld_snapshot_hash: launched.snapshot_hash,
    });
    expect(blocked.observation.available_actions).toEqual([]);

    const continued = a.choose_overworld_session_journey({
      ...FULL_OVERWORLD,
      session_id: sessionId,
      choice: "continue",
    });
    expect(continued.result.exitReceipt).toBeNull();
    expect(continued.journey).toMatchObject({
      status: "active",
      acceptedDecisions: 40,
      nextCheckpoint: 80,
      pendingChoice: null,
    });

    const actions = a.list_legal_actions({
      session_id: launched.rpg_session_id,
      compact_actions: true,
    });
    expect(actions.journey).toEqual(continued.journey);
    expect(actions.actions.length).toBeGreaterThan(0);
    const stepped = a.step_action({
      session_id: launched.rpg_session_id,
      action_id: actions.actions[0]!,
      compact_observation: true,
      compact_events: true,
    });
    expect(stepped.ok).toBe(true);
    expect(stepped.journey).toMatchObject({ status: "active", acceptedDecisions: 41 });
    expect(stepped.overworld_snapshot_hash).not.toBe(launched.snapshot_hash);
  });

  it("shares one story-choice presentation with the UI and blocks every embedded RPG action", () => {
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

    const embedded = a.start_world_quest({
      world_quest_id: "wolf_winter",
      seed: 1,
      overworldSessionId: restored.session_id,
      compact_observation: false,
    });
    const legalAction = embedded.observation.available_actions[0];
    if (!legalAction) throw new Error("expected an opening RPG action before journey projection");
    const rpgHashBefore = a.sessions.get(embedded.session_id).stateHash;

    const observed = a.get_observation({
      session_id: embedded.session_id,
      compact_observation: false,
    });
    expect(observed.journey).toEqual(uiJourney);
    expect(observed.observation.available_actions).toEqual([]);
    const listed = a.list_legal_actions({
      session_id: embedded.session_id,
      compact_actions: false,
    });
    expect(listed.journey).toEqual(uiJourney);
    expect(listed.actions).toEqual([]);
    expect(() => a.rest_overworld_session({ session_id: restored.session_id })).toThrow(
      /dawn dispatch/i,
    );

    const blocked = a.step_action({
      session_id: embedded.session_id,
      action_id: legalAction.id,
      compact_observation: false,
      compact_events: false,
    });
    expect(blocked).toMatchObject({
      ok: false,
      rejection_reason: uiJourney.storyChoice!.message,
      journeyDecision: { countsTowardJourney: false, reason: "rejected" },
      journey: uiJourney,
    });
    expect(blocked.observation.available_actions).toEqual([]);
    expect(a.sessions.get(embedded.session_id).stateHash).toBe(rpgHashBefore);

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
    expect(
      a.list_legal_actions({ session_id: embedded.session_id, compact_actions: true }).actions
        .length,
    ).toBeGreaterThan(0);
  });
});
