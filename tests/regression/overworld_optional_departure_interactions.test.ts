import { describe, expect, it } from "vitest";

import { createToolApi } from "../../src/mcp/tools.js";
import { compactOverworldView, OVERWORLD_COMPACT_LEGEND } from "../../src/world/compact_view.js";
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const WORLD = loadOverworldManifest(process.cwd());
const REGISTRATION = WORLD.opening_registration!;
const OATH = WORLD.opening_relief_oath!;
const LEAD = WORLD.opening_lead_source!;
const PREPARATION = WORLD.opening_preparation!;
const ALLOCATION = WORLD.opening_relief_allocation!;
const ALLY = WORLD.opening_ally!;
const WOLF = WORLD.quests.find((quest) => quest.id === LEAD.target_quest)!;
const APPROACH = WOLF.launch!.options[0]!.id;
const FULL = { compact_context: false, compact_result: false } as const;

function moveToStation(session: OverworldSession): void {
  if (session.view().currentArea?.id === PREPARATION.area) return;
  const route = session
    .view()
    .areaExits.find((candidate) => candidate.destination.id === PREPARATION.area);
  if (!route) throw new Error("Expected a visible route to Hayden's Station.");
  session.moveArea(route.id);
}

function sessionAtStation(): OverworldSession {
  const session = new OverworldSession(WORLD);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(REGISTRATION.contact);
  session.chooseJourneyStory(REGISTRATION.profiles[0]!.id);
  session.chooseJourneyStory(OATH.options[0]!.id);
  session.chooseJourneyStory(LEAD.options[0]!.id);
  moveToStation(session);
  return session;
}

function startMcpAtStation() {
  const api = createToolApi({ root: process.cwd() });
  const started = api.start_overworld({ compact_context: false });
  api.scout_overworld_session_poi({
    ...FULL,
    session_id: started.session_id,
    poi_id: started.observation.pois[0]!.id,
  });
  api.talk_overworld_session_contact({
    ...FULL,
    session_id: started.session_id,
    character_id: REGISTRATION.contact,
  });
  for (const choice of [REGISTRATION.profiles[0]!.id, OATH.options[0]!.id, LEAD.options[0]!.id]) {
    api.choose_overworld_session_story({
      ...FULL,
      session_id: started.session_id,
      choice,
    });
  }
  const civic = api.get_overworld_session({
    include_observation: true,
    session_id: started.session_id,
  }).observation;
  const route = civic.areaExits.find((candidate) => candidate.destination.id === PREPARATION.area);
  if (!route) throw new Error("Expected a visible MCP route to Hayden's Station.");
  api.move_overworld_session_area({
    ...FULL,
    session_id: started.session_id,
    area_route_id: route.id,
  });
  return { api, sessionId: started.session_id };
}

describe("optional Station departure interactions", () => {
  it("exposes preparation then allocation as derived full and compact tool contracts", () => {
    const session = sessionAtStation();

    expect(session.journey().storyChoice).toBeNull();
    expect(session.view().departureInteractions).toEqual([
      {
        id: PREPARATION.id,
        kind: "preparation",
        title: PREPARATION.title,
        inspect: {
          tool: "inspect_overworld_session_story",
          storyChoiceId: PREPARATION.id,
          arguments: { story_choice_id: PREPARATION.id },
        },
        choose: {
          tool: "choose_overworld_session_story",
          storyChoiceId: PREPARATION.id,
          arguments: { story_choice_id: PREPARATION.id },
          argument: "choice",
          valuesFrom: "story.options[*].id",
        },
      },
    ]);
    expect(session.compactView().departure_interactions).toEqual([
      [PREPARATION.id, "preparation", PREPARATION.title],
    ]);
    expect(OVERWORLD_COMPACT_LEGEND.departure_interactions).toContain(
      "inspect_overworld_session_story(story_choice_id)",
    );
    expect(OVERWORLD_COMPACT_LEGEND.departure_interactions).toContain("versioned short comparison");
    expect(OVERWORLD_COMPACT_LEGEND.departure_interactions).toContain("option_id");
    expect(OVERWORLD_COMPACT_LEGEND.departure_interactions).toContain("only its complete terms");
    expect(OVERWORLD_COMPACT_LEGEND.departure_interactions).toContain(
      "choose_overworld_session_story(story_choice_id, choice)",
    );
    expect(OVERWORLD_COMPACT_LEGEND.departure_interactions).toContain("story.options[*].id");

    const detached = session.view().departureInteractions[0]!;
    (detached.inspect.arguments as { story_choice_id: string }).story_choice_id = "forged";
    (detached.choose.arguments as { story_choice_id: string }).story_choice_id = "forged";
    expect(session.view().departureInteractions[0]?.inspect.arguments).toEqual({
      story_choice_id: PREPARATION.id,
    });
    expect(session.view().departureInteractions[0]?.choose.arguments).toEqual({
      story_choice_id: PREPARATION.id,
    });

    expect(() => session.inspectJourneyStory(ALLOCATION.id)).toThrow(/not available/i);
    session.talkToCharacter(ALLY.contact);
    expect(session.journey().storyChoice).toBeNull();
    expect(session.view().departureInteractions[0]?.id).toBe(PREPARATION.id);

    session.chooseJourneyStory(PREPARATION.profiles[0]!.id, PREPARATION.id);
    expect(session.journey().storyChoice).toBeNull();
    expect(session.view().departureInteractions.map((interaction) => interaction.id)).toEqual([
      ALLOCATION.id,
    ]);
    expect(session.compactView().departure_interactions).toEqual([
      [ALLOCATION.id, "relief_allocation", ALLOCATION.title],
    ]);

    session.chooseJourneyStory(ALLOCATION.options[0]!.id, ALLOCATION.id);
    expect(session.view().departureInteractions).toEqual([]);
    expect(session.compactView().departure_interactions).toBeUndefined();
  });

  it("surfaces June as a read-only contact lead before and after preparation", () => {
    const session = sessionAtStation();
    const june = WORLD.characters.find((character) => character.id === ALLY.contact);
    if (!june) throw new Error("Expected June at the Station.");
    const beforePresentation = session.snapshot();
    const decisionsBeforePresentation = session.journey().acceptedDecisions;

    const beforePreparation = session.view().departureContactLeads;
    expect(beforePreparation).toEqual([
      {
        id: ALLY.id,
        kind: "ally",
        title: ALLY.title,
        contactId: june.id,
        contactName: june.name,
        questId: WOLF.id,
        questTitle: WOLF.title,
        status: "requires_preparation",
        guidance: `Optional field team: choose a Station preparation first, then talk to ${june.name} to review the terms. You may start ${WOLF.title} now as a solo rider without this choice.`,
        action: null,
      },
    ]);
    expect(session.compactView().departure_contact_leads).toEqual([
      [
        ALLY.id,
        "ally",
        ALLY.title,
        "requires_preparation",
        june.id,
        june.name,
        WOLF.id,
        WOLF.title,
        beforePreparation[0]!.guidance,
      ],
    ]);
    expect(compactOverworldView(session.view()).departure_contact_leads).toEqual(
      session.compactView().departure_contact_leads,
    );
    expect(OVERWORLD_COMPACT_LEGEND.departure_contact_leads).toContain(
      "talk_overworld_session_contact(character_id: contact_id)",
    );
    expect(OVERWORLD_COMPACT_LEGEND.departure_contact_leads).toContain(
      "leaves quest_id launch legal",
    );
    expect(session.snapshot()).toEqual(beforePresentation);
    expect(session.journey().acceptedDecisions).toBe(decisionsBeforePresentation);
    expect(() => session.prepareQuestStart(WOLF.id, APPROACH)).not.toThrow();

    session.chooseJourneyStory(PREPARATION.profiles[0]!.id, PREPARATION.id);
    const afterPreparationSnapshot = session.snapshot();
    const ready = session.view().departureContactLeads[0];
    expect(ready).toEqual({
      ...beforePreparation[0],
      status: "ready",
      guidance: `Optional field team: talk to ${june.name} to review the terms. You may start ${WOLF.title} now as a solo rider without this choice.`,
      action: {
        tool: "talk_overworld_session_contact",
        characterId: june.id,
        arguments: { character_id: june.id },
      },
    });
    expect(session.compactView().departure_contact_leads?.[0]?.[3]).toBe("ready");
    expect(compactOverworldView(session.view()).departure_contact_leads).toEqual(
      session.compactView().departure_contact_leads,
    );
    expect(session.snapshot()).toEqual(afterPreparationSnapshot);

    if (!ready?.action) throw new Error("Expected June's ready talk action.");
    (ready.action.arguments as { character_id: string }).character_id = "forged";
    const canonicalReady = session.view().departureContactLeads[0];
    expect(canonicalReady?.action?.arguments).toEqual({ character_id: june.id });
    if (!canonicalReady?.action) throw new Error("Expected detached canonical June action.");
    session.talkToCharacter(canonicalReady.action.arguments.character_id);
    expect(session.view().departureContactLeads).toEqual([]);
    expect(session.compactView().departure_contact_leads).toBeUndefined();
    expect(session.journey().storyChoice).toMatchObject({ id: ALLY.id, kind: "ally" });
    expect(() => session.startQuest(WOLF.id, APPROACH)).toThrow(/field-team commitment/i);
  });

  it("inspects without mutation and atomically records a replayable offer plus selection", () => {
    const { api, sessionId } = startMcpAtStation();
    const station = api.get_overworld_session({
      include_observation: true,
      session_id: sessionId,
    });
    const preparationInteraction = station.observation.departureInteractions[0]!;
    expect(preparationInteraction.inspect.storyChoiceId).toBe(PREPARATION.id);
    expect(preparationInteraction.inspect.arguments).toEqual({
      story_choice_id: PREPARATION.id,
    });
    const before = api.export_overworld_session({ session_id: sessionId });
    if (!before.ok) throw new Error("Expected an exportable Station session.");

    const inspected = api.inspect_overworld_session_story({
      ...FULL,
      session_id: sessionId,
      ...preparationInteraction.inspect.arguments,
    });
    expect(inspected.story).toMatchObject({ id: PREPARATION.id, kind: "preparation" });
    expect(inspected.snapshot_hash).toBe(before.snapshot_hash);
    const afterInspection = api.export_overworld_session({ session_id: sessionId });
    if (!afterInspection.ok) throw new Error("Expected an export after inspection.");
    expect(afterInspection.snapshot).toEqual(before.snapshot);
    expect(() =>
      api.choose_overworld_session_story({
        ...FULL,
        session_id: sessionId,
        choice: PREPARATION.profiles[0]!.id,
      }),
    ).toThrow(/no (?:presented )?story consequence/i);
    expect(() =>
      api.choose_overworld_session_story({
        ...FULL,
        session_id: sessionId,
        story_choice_id: ALLOCATION.id,
        choice: ALLOCATION.options[0]!.id,
      }),
    ).toThrow(/not available/i);

    expect(preparationInteraction.choose.argument).toBe("choice");
    expect(preparationInteraction.choose.valuesFrom).toBe("story.options[*].id");
    expect(preparationInteraction.choose.arguments).toEqual({
      story_choice_id: PREPARATION.id,
    });
    const preparationChoice = inspected.story.options[0]!.id;
    const prepared = api.choose_overworld_session_story({
      ...FULL,
      session_id: sessionId,
      ...preparationInteraction.choose.arguments,
      [preparationInteraction.choose.argument]: preparationChoice,
    });
    expect(prepared.result.choiceId).toBe(preparationChoice);
    expect(prepared.journey.storyChoice).toBeNull();
    expect(prepared.observation.journal.slice(0, 2).map((entry) => entry.kind)).toEqual([
      "preparation",
      "preparation_offer",
    ]);
    const preparedSave = api.export_overworld_session({ session_id: sessionId });
    if (!preparedSave.ok) throw new Error("Expected a prepared export.");
    expect(OverworldSession.restore(WORLD, preparedSave.snapshot).snapshot()).toEqual(
      preparedSave.snapshot,
    );

    const allocationInteraction = prepared.observation.departureInteractions[0]!;
    expect(allocationInteraction.inspect.arguments).toEqual({
      story_choice_id: ALLOCATION.id,
    });
    const beforeAllocationInspection = api.export_overworld_session({
      session_id: sessionId,
    });
    if (!beforeAllocationInspection.ok) throw new Error("Expected a prepared export.");
    const allocationStory = api.inspect_overworld_session_story({
      ...FULL,
      session_id: sessionId,
      ...allocationInteraction.inspect.arguments,
    });
    expect(allocationInteraction.choose.valuesFrom).toBe("story.options[*].id");
    const afterAllocationInspection = api.export_overworld_session({
      session_id: sessionId,
    });
    if (!afterAllocationInspection.ok) throw new Error("Expected an inspected export.");
    expect(afterAllocationInspection.snapshot).toEqual(beforeAllocationInspection.snapshot);
    api.choose_overworld_session_story({
      ...FULL,
      session_id: sessionId,
      ...allocationInteraction.choose.arguments,
      [allocationInteraction.choose.argument]: allocationStory.story.options[0]!.id,
    });
    const allocatedSave = api.export_overworld_session({ session_id: sessionId });
    if (!allocatedSave.ok) throw new Error("Expected an allocated export.");
    expect(allocatedSave.snapshot.journalEntries.slice(0, 2).map((entry) => entry.kind)).toEqual([
      "relief_allocation",
      "relief_allocation_offer",
    ]);
    expect(OverworldSession.restore(WORLD, allocatedSave.snapshot).snapshot()).toEqual(
      allocatedSave.snapshot,
    );
  });

  it.each([
    ["neither", false, false],
    ["preparation only", true, false],
    ["preparation and allocation", true, true],
  ] as const)("allows Wolf-Winter launch with %s", (_label, prepare, allocate) => {
    const session = sessionAtStation();
    if (prepare) {
      session.chooseJourneyStory(PREPARATION.profiles[0]!.id, PREPARATION.id);
    }
    if (allocate) {
      session.chooseJourneyStory(ALLOCATION.options[0]!.id, ALLOCATION.id);
    }

    expect(session.view().departureContactLeads).toMatchObject([
      { id: ALLY.id, status: prepare ? "ready" : "requires_preparation" },
    ]);
    expect(session.view().questStarts).toContainEqual([WOLF.id, APPROACH]);
    expect(() => session.prepareQuestStart(WOLF.id, APPROACH)).not.toThrow();
    session.startQuest(WOLF.id, APPROACH);
    expect(session.snapshot().startedQuestIds).toContain(WOLF.id);
    expect(session.snapshot().character.companions).not.toContain(ALLY.ally_npc_id);
    expect(
      session
        .snapshot()
        .character.relationships.some((relationship) => relationship.npcId === ALLY.ally_npc_id),
    ).toBe(false);
    expect(
      session
        .snapshot()
        .character.promises.some((promise) => promise.recipientId === ALLY.ally_npc_id),
    ).toBe(false);
    expect(session.view().departureInteractions).toEqual([]);
    expect(session.view().departureContactLeads).toEqual([]);
    const snapshot = session.snapshot();
    expect(OverworldSession.restore(WORLD, snapshot).snapshot()).toEqual(snapshot);
  });

  it("keeps preparation Station-only and unavailable after Wolf-Winter begins", () => {
    const session = sessionAtStation();
    const routeAway = session.view().areaExits[0];
    if (!routeAway) throw new Error("Expected a route away from the Station.");
    session.moveArea(routeAway.id);
    expect(session.view().departureInteractions).toEqual([]);
    expect(session.view().departureContactLeads).toEqual([]);
    expect(() => session.inspectJourneyStory(PREPARATION.id)).toThrow(/not available/i);

    moveToStation(session);
    session.startQuest(WOLF.id, APPROACH);
    expect(session.view().departureInteractions).toEqual([]);
    expect(session.view().departureContactLeads).toEqual([]);
  });
});
