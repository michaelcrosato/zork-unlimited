import { describe, expect, it } from "vitest";

import { cloneOverworldCompactView, compactOverworldView } from "../../src/world/compact_view.js";
import {
  compactStationDispatchBoard,
  compactStationDispatchBoardSupport,
  deriveStationDispatchBoard,
} from "../../src/world/station_dispatch_board.js";
import {
  compactOverworldDepartureContactLeads,
  compactOverworldDepartureInteractions,
} from "../../src/world/session_departure_interactions.js";
import { compactOpeningDepartureRecap } from "../../src/world/opening_departure_recap.js";
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { revealCurrentJourneyStoryOptions } from "../regression/support/journey_story.js";

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
  revealCurrentJourneyStoryOptions(session, RELIEF_OATH.id);
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
      version: 3,
      questId: WOLF.id,
      questTitle: WOLF.title,
      guidance:
        "Cade's herd is under pressure. Depart now, or review independent optional support below. Support changes dispatch cost and aftermath, not which Wolf-Winter strategy Cade will offer.",
    });
    expect(board.support.map((entry) => [entry.slot, entry.status, entry.selectedTitle])).toEqual(
      view.departureRecap.entries
        .filter((entry) => ["preparation", "relief_allocation", "field_team"].includes(entry.slot))
        .map((entry) => [entry.slot, entry.status, entry.title]),
    );
    expect(board.dispatch).toEqual(view.departureRecap.dispatch);
    expect(board.plan).toEqual(
      view.departureRecap.entries.map((entry) => ({
        slot: entry.slot,
        label: entry.label,
        status: entry.status,
        selectedTitle: entry.title,
      })),
    );
    expect(board.plan).not.toHaveProperty("activeFieldTerm");
    expect(board.support.map((entry) => entry.label)).toEqual([
      "One field kit",
      "Albany's last relief wagon",
      "June Pike, second rider",
    ]);
    expect(board.support.map((entry) => entry.purpose)).toEqual([
      "Field kit: optionally choose one specialist kit for a named danger at Cade's steading.",
      "Relief wagon: optionally send Albany's last wagon to one crisis; the other two go without it.",
      "Second rider: optionally ask about cattle-first authority, or ride alone.",
    ]);
    expect(board.support.map((entry) => entry.detailHint)).toEqual([
      "Compare kits only if you want their exact cost and field use.",
      "Compare destinations only if you want to decide who is protected.",
      "Talk only to compare exact terms; this adds no combat power.",
    ]);
    expect(board.support.map((entry) => entry.action)).toEqual([
      {
        kind: "inspect",
        tool: "inspect_overworld_session_story",
        storyChoiceId: PREPARATION.id,
        title: PREPARATION.title,
      },
      {
        kind: "inspect",
        tool: "inspect_overworld_session_story",
        storyChoiceId: RELIEF_ALLOCATION.id,
        title: RELIEF_ALLOCATION.title,
      },
      {
        kind: "talk",
        tool: "talk_overworld_session_contact",
        characterId: ALLY.contact,
        contactName: "June Pike",
      },
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
    // V3 keeps the first compact Station view launch-first and defers optional
    // support purposes and action handles to an explicit read-only context.
    expect(JSON.stringify(compact.station_dispatch_board).length).toBeLessThanOrEqual(1_000);
    expect(compact.station_dispatch_board?.slice(0, 4)).toEqual([
      3,
      WOLF.id,
      board.guidance,
      [
        "committed",
        board.dispatch?.minutes,
        null,
        ["preparation", "relief_allocation", "field_team"],
      ],
    ]);
    expect(compact.station_dispatch_board?.[4]).toEqual([
      ["role", "selected", REGISTRATION.profiles[0]!.title, null, null],
      ["duty", "selected", RELIEF_OATH.options[0]!.title, null, null],
      ["evidence", "selected", LEAD_SOURCE.options[0]!.title, null, null],
      ["preparation", "open_optional", null, null, null],
      ["relief_allocation", "open_optional", null, null, null],
      ["field_team", "open_optional", null, null, null],
    ]);
    expect(compact.station_dispatch_support).toBeUndefined();
    expect(compactStationDispatchBoardSupport(board)).toEqual([
      [
        "preparation",
        "Field kit: optionally choose one specialist kit for a named danger at Cade's steading.",
        ["inspect", PREPARATION.id],
      ],
      [
        "relief_allocation",
        "Relief wagon: optionally send Albany's last wagon to one crisis; the other two go without it.",
        ["inspect", RELIEF_ALLOCATION.id],
      ],
      [
        "field_team",
        "Second rider: optionally ask about cattle-first authority, or ride alone.",
        ["talk", ALLY.contact, "June Pike"],
      ],
    ]);
    expect(compact).not.toHaveProperty("departure_recap");
    expect(compact).not.toHaveProperty("departure_interactions");
    expect(compact).not.toHaveProperty("departure_contact_leads");
    const legacyStationBlock = JSON.stringify({
      station_dispatch_board: [
        1,
        board.guidance,
        board.support.map((entry) => [entry.slot, entry.purpose]),
      ],
      departure_recap: compactOpeningDepartureRecap(view.departureRecap),
      departure_interactions: compactOverworldDepartureInteractions(view.departureInteractions),
      departure_contact_leads: compactOverworldDepartureContactLeads(view.departureContactLeads),
    });
    const v3StationBlock = JSON.stringify({
      station_dispatch_board: compact.station_dispatch_board,
    });
    expect(v3StationBlock.length).toBeLessThan(legacyStationBlock.length);

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
        departureInteractions: view.departureInteractions,
        departureContactLeads: view.departureContactLeads,
      }),
    ).toBeNull();
    expect(
      deriveStationDispatchBoard({
        recap,
        quests: view.quests,
        questStarts: [[WOLF.id, "forged:road"]],
        departureInteractions: view.departureInteractions,
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
        departureInteractions: view.departureInteractions,
        departureContactLeads: view.departureContactLeads,
      }),
    ).toBeNull();
    expect(
      deriveStationDispatchBoard({
        recap,
        quests: view.quests,
        questStarts: view.questStarts,
        departureInteractions: view.departureInteractions,
        departureContactLeads: [
          ...view.departureContactLeads,
          { ...fieldLead, id: `${fieldLead.id}:duplicate` },
        ],
      }),
    ).toBeNull();
    expect(
      deriveStationDispatchBoard({
        recap: {
          ...recap,
          entries: recap.entries.filter((entry) => entry.slot !== "duty"),
        },
        quests: view.quests,
        questStarts: view.questStarts,
        departureInteractions: view.departureInteractions,
        departureContactLeads: view.departureContactLeads,
      }),
    ).toBeNull();
    expect(
      deriveStationDispatchBoard({
        recap: {
          ...recap,
          entries: [...recap.entries, recap.entries[0]!],
        },
        quests: view.quests,
        questStarts: view.questStarts,
        departureInteractions: view.departureInteractions,
        departureContactLeads: view.departureContactLeads,
      }),
    ).toBeNull();

    const waiting = deriveStationDispatchBoard({
      recap,
      quests: view.quests,
      questStarts: [],
      departureInteractions: view.departureInteractions,
      departureContactLeads: view.departureContactLeads,
    });
    expect(waiting?.launch.approaches.every((approach) => !approach.availableNow)).toBe(true);
    expect(waiting?.guidance).toBe(
      "Cade's herd is under pressure. No departure road is open yet. Review independent optional support below; it changes dispatch cost and aftermath, not which Wolf-Winter strategy Cade will offer.",
    );
    expect(waiting?.guidance).not.toContain("You can leave now");
    expect(fieldLead).toMatchObject({ status: "ready" });
    expect(fieldLead.guidance).not.toContain("choose a field kit first");

    expect(
      deriveStationDispatchBoard({
        recap,
        quests: view.quests,
        questStarts: view.questStarts,
        departureInteractions: view.departureInteractions.slice(1),
        departureContactLeads: view.departureContactLeads,
      }),
    ).toBeNull();
    expect(
      deriveStationDispatchBoard({
        recap,
        quests: view.quests,
        questStarts: view.questStarts,
        departureInteractions: [
          ...view.departureInteractions,
          { ...view.departureInteractions[0]!, id: "forged:duplicate" },
        ],
        departureContactLeads: view.departureContactLeads,
      }),
    ).toBeNull();

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
