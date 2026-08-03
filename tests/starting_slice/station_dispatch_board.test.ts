import { describe, expect, it } from "vitest";

import { cloneOverworldCompactView, compactOverworldView } from "../../src/world/compact_view.js";
import {
  compactStationDispatchBoard,
  deriveStationDispatchBoard,
} from "../../src/world/station_dispatch_board.js";
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const WORLD = loadOverworldManifest(process.cwd());
const REGISTRATION = WORLD.opening_registration!;
const RELIEF_OATH = WORLD.opening_relief_oath!;
const LEAD_SOURCE = WORLD.opening_lead_source!;
const PREPARATION = WORLD.opening_preparation!;
const RELIEF_ALLOCATION = WORLD.opening_relief_allocation!;
const ALLY = WORLD.opening_ally!;
const WOLF = WORLD.quests.find((quest) => quest.id === LEAD_SOURCE.target_quest)!;

function stationedSession(): OverworldSession {
  const session = new OverworldSession(WORLD);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(REGISTRATION.contact);
  session.chooseJourneyStory(REGISTRATION.profiles[0]!.id);
  session.chooseJourneyStory(RELIEF_OATH.options[0]!.id);
  session.chooseJourneyStory(LEAD_SOURCE.options[0]!.id);
  const route = session
    .view()
    .areaExits.find((candidate) => candidate.destination.id === PREPARATION.area);
  if (!route) throw new Error("Expected the authored Station route.");
  session.moveArea(route.id);
  return session;
}

describe("Station dispatch board", () => {
  it("is a read-only, authenticated projection of the independent support rows and legal roads", () => {
    const session = stationedSession();
    const before = session.snapshot();
    const beforeHash = session.snapshotHash();
    const beforeDecisions = session.journey().acceptedDecisions;
    const view = session.view();
    const board = view.stationDispatchBoard;
    if (!board || !view.departureRecap) throw new Error("Expected the Station dispatch board.");

    expect(board).toMatchObject({
      version: 1,
      questId: WOLF.id,
      questTitle: WOLF.title,
      guidance:
        "Preparation, relief allocation, and field-team terms are independent and optional. Launch choices remain in the Station launch list; inspect only the support you want before departure.",
    });
    expect(board.support.map((entry) => [entry.slot, entry.status, entry.selectedTitle])).toEqual(
      view.departureRecap.entries
        .filter((entry) => ["preparation", "relief_allocation", "field_team"].includes(entry.slot))
        .map((entry) => [entry.slot, entry.status, entry.title]),
    );
    expect(board.support.map((entry) => entry.label)).toEqual([
      "Preparation",
      "Relief allocation",
      "June Pike field team",
    ]);
    expect(board.support.map((entry) => entry.purpose)).toEqual([
      "Choose one specialist packet; each changes one named Wolf-Winter field line.",
      "Place one relief wagon; each option protects one named crisis line and leaves the others exposed.",
      "Set field-team crisis authority or go solo; this never adds combat power.",
    ]);
    expect(board.support.map((entry) => entry.detailHint)).toEqual([
      "Inspect to compare its exact cost and field trigger.",
      "Inspect to compare exact timing and protected/exposed lines.",
      "Talk with the field lead to review exact time and terms.",
    ]);
    const quest = view.quests.find((candidate) => candidate.id === WOLF.id);
    if (!quest?.launch) throw new Error("Expected the projected Wolf launch card.");
    expect(board.launch.id).toBe(quest.launch.id);
    expect(board.launch.prompt).toBe(quest.launch.prompt);
    expect(board.launch.approaches).toEqual(
      quest.launch.options.map((option) => ({
        id: option.id,
        title: option.title,
        availableNow: view.questStarts.some(
          ([questId, approachId]) => questId === quest.id && approachId === option.id,
        ),
      })),
    );

    const compact = session.compactView();
    expect(compact.station_dispatch_board).toEqual(compactStationDispatchBoard(board));
    expect(compactOverworldView(view).station_dispatch_board).toEqual(
      compact.station_dispatch_board,
    );
    expect(cloneOverworldCompactView(compact).station_dispatch_board).toEqual(
      compact.station_dispatch_board,
    );

    expect(session.snapshot()).toEqual(before);
    expect(session.snapshotHash()).toBe(beforeHash);
    expect(session.journey().acceptedDecisions).toBe(beforeDecisions);
  });

  it("withholds malformed pairings and does not leak unselected support alternatives", () => {
    const session = stationedSession();
    const view = session.view();
    const recap = view.departureRecap;
    if (!recap) throw new Error("Expected Station recap.");
    const fieldLead = view.departureContactLeads[0];
    if (!fieldLead) throw new Error("Expected the Station field-team lead.");
    expect(
      deriveStationDispatchBoard({
        recap,
        quests: [],
        questStarts: view.questStarts,
        departureContactLeads: view.departureContactLeads,
      }),
    ).toBeNull();
    expect(
      deriveStationDispatchBoard({
        recap,
        quests: view.quests,
        questStarts: [[WOLF.id, "forged:road"]],
        departureContactLeads: view.departureContactLeads,
      }),
    ).toBeNull();
    expect(
      deriveStationDispatchBoard({
        recap,
        quests: view.quests.map((quest) =>
          quest.id === WOLF.id ? { ...quest, title: "Forged quest title" } : quest,
        ),
        questStarts: view.questStarts,
        departureContactLeads: view.departureContactLeads,
      }),
    ).toBeNull();
    expect(
      deriveStationDispatchBoard({
        recap,
        quests: view.quests,
        questStarts: view.questStarts,
        departureContactLeads: [
          ...view.departureContactLeads,
          { ...fieldLead, id: `${fieldLead.id}:duplicate` },
        ],
      }),
    ).toBeNull();

    const waiting = deriveStationDispatchBoard({
      recap,
      quests: view.quests,
      questStarts: [],
      departureContactLeads: view.departureContactLeads,
    });
    expect(waiting?.launch.approaches.every((approach) => !approach.availableNow)).toBe(true);

    const visible = JSON.stringify(view.stationDispatchBoard);
    for (const alternative of [
      ...PREPARATION.profiles,
      ...RELIEF_ALLOCATION.options,
      ...ALLY.options,
    ]) {
      expect(visible).not.toContain(alternative.title);
      if ("preview" in alternative) expect(visible).not.toContain(alternative.preview);
      if ("consequence" in alternative) expect(visible).not.toContain(alternative.consequence);
      if ("tradeoff" in alternative) expect(visible).not.toContain(alternative.tradeoff);
    }
  });
});
