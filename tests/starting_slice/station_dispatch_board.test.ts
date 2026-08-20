import { describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";

import {
  cloneOverworldCompactView,
  compactOverworldView,
  OVERWORLD_COMPACT_LEGEND,
} from "../../src/world/compact_view.js";
import {
  compactStationDispatchBoard,
  compactStationDispatchBoardSupport,
  deriveStationDispatchBoard,
  STATION_DISPATCH_BOARD_GUIDANCE_CHAR_LIMIT,
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
      version: 4,
      questId: WOLF.id,
      questTitle: WOLF.title,
      guidance:
        "Ready to depart now with background, Wolf-Winter promise, and report set; field kit, one relief wagon, or second rider remain optional and change cost or aftermath, not your Wolf-Winter approach.",
    });
    expect(board.guidance.length).toBeLessThanOrEqual(STATION_DISPATCH_BOARD_GUIDANCE_CHAR_LIMIT);
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
        title: "Field kit",
      },
      {
        kind: "inspect",
        tool: "inspect_overworld_session_story",
        storyChoiceId: RELIEF_ALLOCATION.id,
        title: "Relief wagon",
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
    // V4 keeps the first compact Station view launch-first while putting one
    // bounded purpose and an already-authenticated handle on each live support row.
    expect(JSON.stringify(compact.station_dispatch_board).length).toBe(882);
    expect(JSON.stringify(compact.station_dispatch_board).length).toBeLessThanOrEqual(1_000);
    expect(
      JSON.stringify(compact.station_dispatch_board).length +
        OVERWORLD_COMPACT_LEGEND.station_dispatch_board.length,
    ).toBe(1_443);
    expect(compact.station_dispatch_board?.slice(0, 4)).toEqual([
      4,
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
      [
        "duty",
        "selected",
        RELIEF_OATH.options[0]!.title.replace(/\bDuty\b/gu, "Promise"),
        null,
        null,
      ],
      ["evidence", "selected", LEAD_SOURCE.options[0]!.title, null, null],
      [
        "preparation",
        "open_optional",
        null,
        "Choose one specialist kit for a named danger.",
        ["inspect", PREPARATION.id],
      ],
      [
        "relief_allocation",
        "open_optional",
        null,
        "Send Albany's last relief wagon to one crisis.",
        ["inspect", RELIEF_ALLOCATION.id],
      ],
      [
        "field_team",
        "open_optional",
        null,
        "Ask about cattle-first help for one line, never combat.",
        ["talk", ALLY.contact, "June Pike"],
      ],
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
    const v4StationBlock = JSON.stringify({
      station_dispatch_board: compact.station_dispatch_board,
    });
    expect(v4StationBlock.length).toBeLessThan(legacyStationBlock.length);
    const v3StationBoard = [
      3,
      compact.station_dispatch_board![1],
      "Cade's herd is under pressure. Depart now, or review support: a field kit for a named danger; Albany's last wagon serves one crisis; June can help one cattle line, never combat. Support changes cost/aftermath, not strategy legality.",
      compact.station_dispatch_board![3],
      compact.station_dispatch_board![4].map(
        ([slot, status, selectedTitle]) =>
          [
            slot,
            status,
            slot === "duty" ? RELIEF_OATH.options[0]!.title : selectedTitle,
            null,
            null,
          ] as const,
      ),
    ] as const;
    const v3BoardAndExplicitSupport = JSON.stringify({
      station_dispatch_board: v3StationBoard,
      station_dispatch_support: compactStationDispatchBoardSupport(board),
    });
    expect(JSON.stringify(v3StationBoard).length).toBe(648);
    expect(v3BoardAndExplicitSupport.length).toBe(1_161);
    expect(v4StationBlock.length).toBe(909);
    expect(v4StationBlock.length).toBeLessThan(v3BoardAndExplicitSupport.length);
    const v4LaunchSlice = JSON.stringify({
      quests: compact.quests,
      quest_starts: compact.quest_starts,
      station_dispatch_board: compact.station_dispatch_board,
    });
    const v3LaunchSlice = JSON.stringify({
      quests: compact.quests,
      quest_starts: compact.quest_starts,
      station_dispatch_board: v3StationBoard,
    });
    const fallback = compactOverworldView({ ...view, stationDispatchBoard: null });
    expect(fallback.departure_interactions).toEqual([
      [PREPARATION.id, "preparation", "Field kit"],
      [RELIEF_ALLOCATION.id, "relief_allocation", "Relief wagon"],
    ]);
    expect(fallback.departure_contact_leads?.[0]?.[2]).toBe("Second rider");
    const fallbackLaunchSlice = JSON.stringify({
      quests: fallback.quests,
      quest_starts: fallback.quest_starts,
      departure_recap: fallback.departure_recap,
      departure_interactions: fallback.departure_interactions,
      departure_contact_leads: fallback.departure_contact_leads,
    });
    expect(Buffer.byteLength(v3LaunchSlice, "utf8")).toBe(1_989);
    expect(Buffer.byteLength(v4LaunchSlice, "utf8")).toBe(2_223);
    expect(Buffer.byteLength(fallbackLaunchSlice, "utf8")).toBe(2_247);

    const clonedBoard = cloneOverworldCompactView(compact).station_dispatch_board;
    const clonedAction = clonedBoard?.[4].find(([slot]) => slot === "preparation")?.[4];
    if (!clonedAction) throw new Error("Expected a cloned preparation action.");
    (clonedAction as [string, string])[1] = "forged:story";
    expect(
      compact.station_dispatch_board?.[4].find(([slot]) => slot === "preparation")?.[4],
    ).toEqual(["inspect", PREPARATION.id]);

    expect(session.snapshot()).toEqual(before);
    expect(session.snapshotHash()).toBe(beforeHash);
    expect(session.journey().acceptedDecisions).toBe(beforeDecisions);
  });

  it("removes each inline handle as its independent support row closes and re-derives V4 on restore", () => {
    const session = stationedSession();
    const row = (
      slot: "role" | "duty" | "evidence" | "preparation" | "relief_allocation" | "field_team",
    ) =>
      session.compactView().station_dispatch_board?.[4].find(([candidate]) => candidate === slot);

    for (const slot of ["role", "duty", "evidence"] as const) {
      expect(row(slot)?.slice(3)).toEqual([null, null]);
    }
    expect(row("preparation")?.[4]).toEqual(["inspect", PREPARATION.id]);
    expect(row("relief_allocation")?.[4]).toEqual(["inspect", RELIEF_ALLOCATION.id]);
    expect(row("field_team")?.[4]).toEqual(["talk", ALLY.contact, "June Pike"]);

    session.chooseJourneyStory(PREPARATION.profiles[0]!.id, PREPARATION.id);
    const preparedGuidance =
      "Ready to depart now with background, Wolf-Winter promise, report, and field kit set; one relief wagon or second rider remain optional and change cost or aftermath, not your Wolf-Winter approach.";
    expect(session.view().stationDispatchBoard?.guidance).toBe(preparedGuidance);
    expect(session.compactView().station_dispatch_board?.[2]).toBe(preparedGuidance);
    expect(JSON.stringify(session.compactView().station_dispatch_board).length).toBeLessThanOrEqual(
      1_000,
    );
    expect(row("preparation")).toEqual([
      "preparation",
      "selected",
      PREPARATION.profiles[0]!.title,
      null,
      null,
    ]);
    expect(row("relief_allocation")?.[4]).toEqual(["inspect", RELIEF_ALLOCATION.id]);
    expect(row("field_team")?.[4]).toEqual(["talk", ALLY.contact, "June Pike"]);

    session.chooseJourneyStory(RELIEF_ALLOCATION.options[0]!.id, RELIEF_ALLOCATION.id);
    expect(row("relief_allocation")).toEqual([
      "relief_allocation",
      "selected",
      RELIEF_ALLOCATION.options[0]!.title,
      null,
      null,
    ]);
    expect(row("field_team")?.[4]).toEqual(["talk", ALLY.contact, "June Pike"]);
    const riderOnlyGuidance =
      "Ready to depart now with background, Wolf-Winter promise, report, field kit, and relief wagon set; second rider remains optional and changes cost or aftermath, not your Wolf-Winter approach.";
    expect(session.view().stationDispatchBoard?.guidance).toBe(riderOnlyGuidance);
    expect(session.compactView().station_dispatch_board?.[2]).toBe(riderOnlyGuidance);

    session.talkToCharacter(ALLY.contact);
    session.chooseJourneyStory(ALLY.options[0]!.id);
    expect(row("field_team")).toEqual([
      "field_team",
      "selected",
      ALLY.options[0]!.title,
      null,
      null,
    ]);
    expect(
      session.compactView().station_dispatch_board?.[4].filter((entry) => entry[4] !== null),
    ).toEqual([]);
    const fullySetGuidance =
      "Ready to depart now with background, Wolf-Winter promise, report, field kit, relief wagon, and riding choice set; no optional support remains.";
    expect(session.view().stationDispatchBoard?.guidance).toBe(fullySetGuidance);
    expect(session.compactView().station_dispatch_board?.[2]).toBe(fullySetGuidance);
    expect(JSON.stringify(session.compactView().station_dispatch_board).length).toBeLessThanOrEqual(
      1_000,
    );
    expect(
      session.view().stationDispatchBoard?.plan.filter((entry) => entry.status === "open_optional"),
    ).toEqual([]);

    const snapshot = session.snapshot();
    const restored = OverworldSession.restore(WORLD, snapshot);
    expect(restored.compactView().station_dispatch_board).toEqual(
      session.compactView().station_dispatch_board,
    );
    expect(restored.compactView().station_dispatch_board?.[0]).toBe(4);
    expect(restored.snapshot()).toEqual(snapshot);
  });

  it("keeps solo and refused-relay selections truthful in full and compact guidance", () => {
    for (const optionId of ["albany:ally_june_relay_only", ALLY.solo_option_id]) {
      const session = stationedSession();
      session.talkToCharacter(ALLY.contact);
      session.chooseJourneyStory(optionId);
      const guidance =
        "Ready to depart now with background, Wolf-Winter promise, report, and riding choice set; field kit or one relief wagon remain optional and change cost or aftermath, not your Wolf-Winter approach.";

      expect(session.view().stationDispatchBoard?.guidance).toBe(guidance);
      expect(session.compactView().station_dispatch_board?.[2]).toBe(guidance);
      expect(session.view().stationDispatchBoard?.guidance).not.toContain(
        "background, Wolf-Winter promise, report, and second rider set",
      );
    }
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
    expect(
      deriveStationDispatchBoard({
        recap: {
          ...recap,
          entries: recap.entries.map((entry) =>
            ["role", "duty", "evidence"].includes(entry.slot)
              ? { ...entry, status: "open_optional" as const, title: null }
              : entry,
          ),
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
          entries: recap.entries.map((entry) =>
            entry.slot === "preparation"
              ? { ...entry, status: "open_optional", title: "forged selected kit" }
              : entry,
          ),
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
      "No road is open with background, Wolf-Winter promise, and report set; field kit, one relief wagon, or second rider remain optional and change cost or aftermath, not your approach.",
    );
    expect(waiting?.guidance.length).toBeLessThanOrEqual(
      STATION_DISPATCH_BOARD_GUIDANCE_CHAR_LIMIT,
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
