import { describe, expect, it } from "vitest";

import { createToolApi } from "../../src/mcp/tools.js";
import { compactJourneyStoryChoiceComparison } from "../../src/mcp/journey_projection.js";
import { compactOverworldView, OVERWORLD_COMPACT_LEGEND } from "../../src/world/compact_view.js";
import {
  formatOpeningAllyChoiceTiming,
  formatOpeningAllyCost,
  formatOpeningAllyTimingDisclosure,
} from "../../src/world/opening_ally.js";
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { compactStationDispatchBoardSupport } from "../../src/world/station_dispatch_board.js";
import { revealCurrentJourneyStoryOptions } from "./support/journey_story.js";

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
const JUNE_TIMING =
  "Talking takes 15 minutes. Let June Control Cattle Safety: 15 minutes additional, 30 minutes total; Ask June to Follow Your Orders: 5 minutes additional, 20 minutes total; Travel Alone: no added time, 15 minutes total.";

function moveToStation(session: OverworldSession): void {
  if (session.view().currentArea?.id === PREPARATION.area) return;
  const route = session
    .view()
    .areaExits.find((candidate) => candidate.destination.id === PREPARATION.area);
  if (!route) throw new Error("Expected a visible route to Hayden's Station.");
  session.moveArea(route.id);
}

function sessionAtStation(world = WORLD): OverworldSession {
  const session = new OverworldSession(world);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(REGISTRATION.contact);
  session.chooseJourneyStory(REGISTRATION.profiles[0]!.id);
  revealCurrentJourneyStoryOptions(session, OATH.id);
  session.chooseJourneyStory(OATH.options[0]!.id);
  session.chooseJourneyStory(LEAD.options[0]!.id);
  moveToStation(session);
  return session;
}

type SupportSpoke = "P" | "R" | "J";

function chooseSupportSpoke(session: OverworldSession, spoke: SupportSpoke): void {
  if (spoke === "P") {
    session.chooseJourneyStory(PREPARATION.profiles[0]!.id);
    return;
  }
  if (spoke === "R") {
    session.chooseJourneyStory(ALLOCATION.options[0]!.id);
    return;
  }
  session.talkToCharacter(ALLY.contact);
  expect(session.journey().storyChoice).toMatchObject({ id: ALLY.id, kind: "ally" });
  expect(() => session.startQuest(WOLF.id, APPROACH)).toThrow(/open story option/i);
  session.chooseJourneyStory(ALLY.options[0]!.id);
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
  api.choose_overworld_session_story({
    ...FULL,
    session_id: started.session_id,
    choice: REGISTRATION.profiles[0]!.id,
  });
  api.inspect_overworld_session_story({
    ...FULL,
    session_id: started.session_id,
    story_choice_id: OATH.id,
    reveal_id: "customize_duty_and_evidence",
  });
  for (const choice of [OATH.options[0]!.id, LEAD.options[0]!.id]) {
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
  it("rejects an ambiguous option-only departure choice without changing session state", () => {
    const world = structuredClone(WORLD);
    const sharedOptionId = PREPARATION.profiles[0]!.id;
    world.opening_relief_allocation!.options[0]!.id = sharedOptionId;
    const session = sessionAtStation(world);
    const before = session.snapshot();

    expect(() => session.chooseJourneyStory(sharedOptionId)).toThrow(
      /departure story option .* is ambiguous; provide story_choice_id/i,
    );
    expect(session.snapshot()).toEqual(before);
    expect(session.chooseJourneyStory(sharedOptionId, PREPARATION.id).choiceId).toBe(
      sharedOptionId,
    );
  });

  it("exposes preparation and allocation together as derived full and compact tool contracts", () => {
    const session = sessionAtStation();

    expect(session.journey().storyChoice).toBeNull();
    expect(session.view().departureInteractions).toEqual([
      {
        id: PREPARATION.id,
        kind: "preparation",
        title: "Field kit",
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
      {
        id: ALLOCATION.id,
        kind: "relief_allocation",
        title: "Relief wagon",
        inspect: {
          tool: "inspect_overworld_session_story",
          storyChoiceId: ALLOCATION.id,
          arguments: { story_choice_id: ALLOCATION.id },
        },
        choose: {
          tool: "choose_overworld_session_story",
          storyChoiceId: ALLOCATION.id,
          arguments: { story_choice_id: ALLOCATION.id },
          argument: "choice",
          valuesFrom: "story.options[*].id",
        },
      },
    ]);
    const compact = session.compactView();
    expect(compact.departure_interactions).toBeUndefined();
    expect(compact.station_dispatch_board?.[0]).toBe(6);
    expect(compact.station_dispatch_board?.[3]?.[3]).toBe(3);
    expect(compact.station_dispatch_board?.[4].map(([slot]) => slot)).not.toEqual(
      expect.arrayContaining(["preparation", "relief_allocation", "field_team"]),
    );
    expect(compact.station_dispatch_board?.[5]).toEqual([
      "station_dispatch:review_optional_support",
      "Optional: a field kit using Repair, Streetwise, or Mediation; plus Albany's last relief wagon or June as a cattle-safety rider. Review only what interests you.",
    ]);
    expect(compactStationDispatchBoardSupport(session.view().stationDispatchBoard!)).toEqual(
      expect.arrayContaining([
        ["preparation", expect.any(String), ["inspect", PREPARATION.id]],
        ["relief_allocation", expect.any(String), ["inspect", ALLOCATION.id]],
      ]),
    );
    expect(
      session
        .view()
        .stationDispatchBoard?.support.flatMap((row) =>
          row.action?.kind === "inspect" ? [row.action.title] : [],
        ),
    ).toEqual(["Field kit", "Relief wagon"]);
    expect(OVERWORLD_COMPACT_LEGEND.departure_interactions).toContain(
      "Inspect one story_choice_id",
    );
    expect(OVERWORLD_COMPACT_LEGEND.departure_interactions).toContain(
      "optionally inspect one visible option_id",
    );
    expect(OVERWORLD_COMPACT_LEGEND.departure_interactions).toContain(
      "Field-kit (preparation), relief-wagon (relief_allocation), and second-rider (ally/field_team)",
    );
    expect(OVERWORLD_COMPACT_LEGEND.departure_interactions).toContain(
      "details include exact selected terms",
    );
    expect(OVERWORLD_COMPACT_LEGEND.departure_interactions).toContain(
      "Choose with choose_overworld_session_story",
    );
    expect(OVERWORLD_COMPACT_LEGEND.departure_interactions).toContain(
      "include story_choice_id only when option ids overlap",
    );
    expect(OVERWORLD_COMPACT_LEGEND.departure_interactions).toContain(
      "You may depart without support",
    );

    const detached = session.view().departureInteractions[0]!;
    (detached.inspect.arguments as { story_choice_id: string }).story_choice_id = "forged";
    (detached.choose.arguments as { story_choice_id: string }).story_choice_id = "forged";
    expect(session.view().departureInteractions[0]?.inspect.arguments).toEqual({
      story_choice_id: PREPARATION.id,
    });
    expect(session.view().departureInteractions[0]?.choose.arguments).toEqual({
      story_choice_id: PREPARATION.id,
    });

    expect(session.inspectJourneyStory(ALLOCATION.id)).toMatchObject({
      id: ALLOCATION.id,
      kind: "relief_allocation",
    });
    expect(session.view().departureContactLeads[0]).toMatchObject({
      id: ALLY.id,
      status: "ready",
    });

    session.chooseJourneyStory(PREPARATION.profiles[0]!.id, PREPARATION.id);
    expect(session.journey().storyChoice).toBeNull();
    expect(session.view().departureInteractions.map((interaction) => interaction.id)).toEqual([
      ALLOCATION.id,
    ]);
    expect(session.compactView().departure_interactions).toBeUndefined();
    const afterPreparationBoard = session.compactView().station_dispatch_board;
    expect(afterPreparationBoard?.[3]?.[3]).toBe(2);
    expect(afterPreparationBoard?.[4].find(([slot]) => slot === "relief_allocation")).toBe(
      undefined,
    );
    expect(afterPreparationBoard?.[5]).toEqual([
      "station_dispatch:review_optional_support",
      "Optional: Albany's last relief wagon or June as a cattle-safety rider. Review only what interests you.",
    ]);

    session.chooseJourneyStory(ALLOCATION.options[0]!.id, ALLOCATION.id);
    expect(session.view().departureInteractions).toEqual([]);
    expect(session.compactView().departure_interactions).toBeUndefined();
  });

  it("surfaces June as an actionable read-only contact lead before and after preparation", () => {
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
        title: "Second rider",
        contactId: june.id,
        contactName: june.name,
        questId: WOLF.id,
        questTitle: WOLF.title,
        status: "ready",
        guidance: `Optional second rider: ${JUNE_TIMING} Talk to ${june.name} to choose their role, or leave alone for ${WOLF.title}.`,
        action: {
          tool: "talk_overworld_session_contact",
          characterId: june.id,
          arguments: { character_id: june.id },
        },
      },
    ]);
    expect(session.compactView().departure_contact_leads).toBeUndefined();
    expect(
      session.compactView().station_dispatch_board?.[4].find(([slot]) => slot === "field_team"),
    ).toBeUndefined();
    expect(compactStationDispatchBoardSupport(session.view().stationDispatchBoard!)).toContainEqual(
      ["field_team", expect.any(String), ["talk", june.id, june.name]],
    );
    expect(compactOverworldView(session.view()).station_dispatch_board).toEqual(
      session.compactView().station_dispatch_board,
    );
    expect(OVERWORLD_COMPACT_LEGEND.departure_contact_leads).toContain(
      "When status=ready, talk to contact_id",
    );
    expect(OVERWORLD_COMPACT_LEGEND.departure_contact_leads).toContain(
      "The quest can always start solo",
    );
    expect(session.snapshot()).toEqual(beforePresentation);
    expect(session.journey().acceptedDecisions).toBe(decisionsBeforePresentation);
    expect(() => session.prepareQuestStart(WOLF.id, APPROACH)).not.toThrow();

    session.chooseJourneyStory(PREPARATION.profiles[0]!.id, PREPARATION.id);
    const afterPreparationSnapshot = session.snapshot();
    const ready = session.view().departureContactLeads[0];
    expect(ready).toEqual(beforePreparation[0]);
    expect(
      session.compactView().station_dispatch_board?.[4].find(([slot]) => slot === "field_team"),
    ).toBeUndefined();
    expect(compactStationDispatchBoardSupport(session.view().stationDispatchBoard!)).toContainEqual(
      ["field_team", expect.any(String), ["talk", june.id, june.name]],
    );
    expect(compactOverworldView(session.view()).station_dispatch_board).toEqual(
      session.compactView().station_dispatch_board,
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
    expect(() => session.startQuest(WOLF.id, APPROACH)).toThrow(/open story option/i);
  });

  it.each(ALLY.options.map((option) => [option.id, option.terms.minutes] as const))(
    "discloses, pays, journals, and restores June's complete timing for %s",
    (optionId, additionalMinutes) => {
      const session = sessionAtStation();
      session.chooseJourneyStory(PREPARATION.profiles[0]!.id, PREPARATION.id);
      session.chooseJourneyStory(ALLOCATION.options[0]!.id, ALLOCATION.id);
      const beforeTalk = session.snapshot().minutes;
      const talked = session.talkToCharacter(ALLY.contact);
      expect(talked.minutes).toBe(15);

      const story = session.journey().storyChoice;
      if (!story) throw new Error("Expected June's field-team choice.");
      const option = ALLY.options.find((candidate) => candidate.id === optionId)!;
      const presented = story.options.find((candidate) => candidate.id === optionId);
      expect(presented?.summary?.immediateCost).toBe(formatOpeningAllyChoiceTiming(option.terms));
      expect(presented?.consequence).toContain(`${String(15 + additionalMinutes)} minutes total`);
      expect(
        compactJourneyStoryChoiceComparison(story, optionId).inspectedOption?.consequence,
      ).toBe(presented?.consequence);

      const selected = session.chooseJourneyStory(optionId);
      expect(session.snapshot().minutes - beforeTalk).toBe(15 + additionalMinutes);
      const selectedJournal = session
        .snapshot()
        .journalEntries.find((entry) => entry.id === selected.entry.id);
      expect(selectedJournal?.text).toContain(formatOpeningAllyTimingDisclosure(option.terms));
      const current = session.snapshot();
      expect(OverworldSession.restore(WORLD, current).snapshot()).toEqual(current);

      const predecessor = structuredClone(current);
      const predecessorEntry = predecessor.journalEntries.find(
        (entry) => entry.id === selected.entry.id,
      );
      if (!predecessorEntry) throw new Error("Expected June's selected ally journal entry.");
      predecessorEntry.text = `${option.summary} ${option.preview} Actual cost: ${formatOpeningAllyCost(option.terms)}. ${option.consequence}`;
      expect(predecessorEntry.text).not.toBe(selectedJournal?.text);
      expect(OverworldSession.restore(WORLD, predecessor).snapshot()).toEqual(current);
    },
  );

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
    expect(inspected.story.message).toBe(
      "You can leave Albany Station now or choose one field kit. " +
        "The relief wagon and June are separate choices.",
    );
    expect(inspected.story.message).not.toMatch(
      /field packet|inspect a card|exact check|recovery/i,
    );
    expect(inspected.story.message).not.toMatch(/Departure plan|1\/2|Still ahead/i);
    expect(inspected.snapshot_hash).toBe(before.snapshot_hash);
    const afterInspection = api.export_overworld_session({ session_id: sessionId });
    if (!afterInspection.ok) throw new Error("Expected an export after inspection.");
    expect(afterInspection.snapshot).toEqual(before.snapshot);
    expect(() =>
      api.choose_overworld_session_story({
        ...FULL,
        session_id: sessionId,
        choice: "unknown:departure_option",
      }),
    ).toThrow(/no (?:presented )?story consequence/i);
    expect(() =>
      api.choose_overworld_session_story({
        ...FULL,
        session_id: sessionId,
        story_choice_id: "unknown:departure_story",
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
    expect(allocationStory.story.message).toBe(
      "You can leave Albany Station now or assign the relief wagon. " +
        "The field kit and June are separate choices.",
    );
    expect(allocationStory.story.message).not.toMatch(/relief-capacity choice|inspect a card/i);
    expect(allocationStory.story.message).not.toMatch(
      /Departure plan|2\/2|Still ahead|Chosen for departure/i,
    );
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

    expect(session.view().departureContactLeads).toMatchObject([{ id: ALLY.id, status: "ready" }]);
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

  it("keeps all sixteen ordered support subsets legal, replayable, and materially compositional", () => {
    const orders: readonly (readonly SupportSpoke[])[] = [
      [],
      ["P"],
      ["R"],
      ["J"],
      ["P", "R"],
      ["R", "P"],
      ["P", "J"],
      ["J", "P"],
      ["R", "J"],
      ["J", "R"],
      ["P", "R", "J"],
      ["P", "J", "R"],
      ["R", "P", "J"],
      ["R", "J", "P"],
      ["J", "P", "R"],
      ["J", "R", "P"],
    ];
    const signatureBySubset = new Map<string, unknown>();

    for (const order of orders) {
      let session = sessionAtStation();
      const selected = new Set<SupportSpoke>();
      for (const spoke of order) {
        chooseSupportSpoke(session, spoke);
        selected.add(spoke);

        const interactionKinds = session
          .view()
          .departureInteractions.map((interaction) => interaction.kind);
        expect(interactionKinds, order.join("")).toEqual([
          ...(!selected.has("P") ? (["preparation"] as const) : []),
          ...(!selected.has("R") ? (["relief_allocation"] as const) : []),
        ]);
        expect(
          session.view().departureContactLeads.map((lead) => [lead.id, lead.status]),
          order.join(""),
        ).toEqual(selected.has("J") ? [] : [[ALLY.id, "ready"]]);
        expect(session.view().questStarts).toContainEqual([WOLF.id, APPROACH]);

        const snapshot = session.snapshot();
        session = OverworldSession.restore(WORLD, structuredClone(snapshot));
        expect(session.snapshot()).toEqual(snapshot);
      }

      const plan = session.prepareQuestStart(WOLF.id, APPROACH);
      expect(plan.dispatchWindow).toMatchObject({ schemaVersion: 2, questId: WOLF.id });
      if (!plan.dispatchWindow.receipt) throw new Error("Expected a v2 dispatch receipt.");
      expect(plan.dispatchWindow.receipt.preparation.kind).toBe(
        selected.has("P") ? "selected" : "declined_at_launch",
      );
      expect(plan.dispatchWindow.receipt.reliefAllocation.kind).toBe(
        selected.has("R") ? "selected" : "declined_at_launch",
      );
      expect(plan.dispatchWindow.receipt.juneCommitment.kind).toBe(
        selected.has("J") ? "selected" : "declined_at_launch",
      );

      session.startQuest(WOLF.id, APPROACH);
      const started = session.snapshot();
      const questEntry = started.journalEntries.find((entry) => entry.id === `quest:${WOLF.id}`);
      if (questEntry?.questStartProof?.kind !== "approach") {
        throw new Error("Expected the authenticated Wolf-Winter approach proof.");
      }
      expect(questEntry.questStartProof.dispatchSeal).toMatchObject({
        schemaVersion: 1,
        questId: WOLF.id,
        approachId: APPROACH,
        windowProofHash: plan.dispatchWindow.proofHash,
        slots: {
          preparation: { kind: selected.has("P") ? "selected" : "declined_at_launch" },
          reliefAllocation: { kind: selected.has("R") ? "selected" : "declined_at_launch" },
          fieldTeam: { kind: selected.has("J") ? "selected" : "declined_at_launch" },
        },
      });
      expect(OverworldSession.restore(WORLD, structuredClone(started)).snapshot()).toEqual(started);

      const subset = [...selected].sort().join("");
      const materialSignature = {
        character: started.character,
        minutes: plan.dispatchWindow.ledgerMinutes,
        timing: plan.dispatchWindow.status,
        slots: questEntry.questStartProof.dispatchSeal?.slots,
      };
      const prior = signatureBySubset.get(subset);
      if (prior === undefined) signatureBySubset.set(subset, materialSignature);
      else expect(materialSignature, order.join("")).toEqual(prior);
    }
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
